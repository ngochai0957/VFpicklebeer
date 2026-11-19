import { APP_CONFIG } from './config.js';
import {
    escapeHtml,
    evaluateSubMatch,
    evaluateTeamMatch,
    formatScheduleRaw,
    getSubMatchDisplayOrder,
    getTeamMatchCourts,
    normalizeConfig,
    normalizeRallyState,
    normalizeSetPlayerStats,
    parseScheduleValue
} from './tournament-engine.js';

export function renderAdminLoginModal(storeMode, errorMessage = '') {
    const isSupabase = storeMode === 'supabase';
    const hasConfiguredEmail = Boolean((APP_CONFIG.ADMIN_EMAIL || '').trim());

    const hintHtml = isSupabase
        ? `
            <div class="alert alert-info">
                <strong>Bảo mật Supabase Auth + RLS:</strong> Chỉ duy nhất tài khoản Admin được đăng ký trong
                <code>admin_users</code> mới có quyền ghi dữ liệu lên máy chủ.
            </div>
        `
        : `
            <div class="alert alert-warn">
                <strong>Chế độ Demo Local:</strong> Bạn chưa kết nối Supabase nên dữ liệu đang lưu tạm trên trình duyệt này.
                Mã PIN mặc định để thử nghiệm: <code>${escapeHtml(APP_CONFIG.LOCAL_DEMO_PIN)}</code> (cấu hình trong <code>js/config.js</code>).
            </div>
        `;

    const emailFieldHtml = isSupabase && !hasConfiguredEmail
        ? `
            <div class="form-group">
                <label class="form-label" for="admin-login-email">Email Quản trị viên</label>
                <input id="admin-login-email" name="email" type="email" class="form-input" required placeholder="admin@yourdomain.com" autocomplete="username">
            </div>
        `
        : (isSupabase && hasConfiguredEmail
            ? `<div class="section-sub" style="margin-bottom:12px;">Tài khoản: <strong>${escapeHtml(APP_CONFIG.ADMIN_EMAIL)}</strong></div>`
            : '');

    return `
        <div class="modal-backdrop" data-action="close-modal">
            <div class="modal-card" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3 class="modal-title">Đăng nhập Quản trị (Admin)</h3>
                    <button type="button" class="modal-close" data-action="close-modal" aria-label="Đóng">✕</button>
                </div>
                <form class="modal-body" id="admin-login-form">
                    ${hintHtml}
                    ${errorMessage ? `<div class="alert alert-error">${escapeHtml(errorMessage)}</div>` : ''}
                    ${emailFieldHtml}
                    <div class="form-group">
                        <label class="form-label" for="admin-login-password">Mật khẩu / PIN Quản trị</label>
                        <input id="admin-login-password" name="password" type="password" class="form-input" required placeholder="Nhập mật khẩu quản trị..." autocomplete="current-password" autofocus>
                    </div>
                    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;">
                        <button type="button" class="btn btn-secondary" data-action="close-modal">Hủy</button>
                        <button type="submit" class="btn btn-primary">Mở quyền Quản trị</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

function buildPlayerStatSideHtml(subId, setIdx, playersMeta, statsRow, teamColor, sideTitle, rallyState = {}, sideKey = 'a') {
    const metaBySlot = new Map(playersMeta.map(([name, slot]) => [slot, name]));
    const rawOrder = sideKey === 'a' ? rallyState.orderA : rallyState.orderB;
    const defaultSlots = playersMeta.map(([, slot]) => slot);
    const orderedSlots = Array.isArray(rawOrder) && rawOrder.length === defaultSlots.length
        ? rawOrder
        : defaultSlots;

    const rows = orderedSlots.map((slotKey, posIdx) => {
        const playerName = metaBySlot.get(slotKey) || slotKey;
        const entry = statsRow[slotKey] || { points: 0, errors: 0 };
        const isServer = rallyState.serverSlot === slotKey;
        const isReceiver = rallyState.receiverSlot === slotKey;
        const rowClass = isServer ? 'is-server' : (isReceiver ? 'is-receiver' : '');
        const posLabel = posIdx === 0 ? '1 · Phải' : '2 · Trái';
        return `
            <div class="player-stat-row ${rowClass}">
                <div class="player-stat-identity">
                    <span class="court-pos-badge ${posIdx === 0 ? 'right-court' : 'left-court'}" title="${posIdx === 0 ? 'Vị trí 1 (Phải / Ô chẵn)' : 'Vị trí 2 (Trái / Ô lẻ)'}">${posLabel}</span>
                    <span class="player-stat-name" style="border-left:3px solid ${escapeHtml(teamColor)};">${escapeHtml(playerName)}</span>
                    <div class="player-role-chips">
                        <button type="button" class="rally-role-btn ${isServer ? 'is-server' : ''}" data-action="select-rally-role" data-sub-id="${escapeHtml(subId)}" data-set-idx="${setIdx}" data-role="server" data-slot="${slotKey}" aria-pressed="${isServer ? 'true' : 'false'}" title="Chọn làm người phát bóng">🎾 Phát</button>
                        <button type="button" class="rally-role-btn ${isReceiver ? 'is-receiver' : ''}" data-action="select-rally-role" data-sub-id="${escapeHtml(subId)}" data-set-idx="${setIdx}" data-role="receiver" data-slot="${slotKey}" aria-pressed="${isReceiver ? 'true' : 'false'}" title="Chọn làm người đỡ bóng">🛡 Đỡ</button>
                    </div>
                </div>
                <div class="player-stat-readouts">
                    <span class="stat-pill pts tabular" title="Điểm cá nhân VĐV (tự động tăng qua nút pha bóng)">
                        <span class="stat-lbl">Điểm</span>
                        <strong>${entry.points}</strong>
                    </span>
                    <span class="stat-pill errs tabular" title="Out / Không qua lưới (tự động tăng qua nút pha bóng)">
                        <span class="stat-lbl">Out/Lưới</span>
                        <strong>${entry.errors}</strong>
                    </span>
                </div>
            </div>
        `;
    }).join('');
    return `
        <div class="set-player-side">
            <div class="set-player-side-head">
                <span class="set-player-side-title">${escapeHtml(sideTitle)}</span>
                ${orderedSlots.length > 1
            ? `<button type="button" class="btn-swap-court" data-action="swap-court-order" data-sub-id="${escapeHtml(subId)}" data-set-idx="${setIdx}" data-side="${escapeHtml(sideKey)}" title="Đổi vị trí 1 (Phải) ↔ 2 (Trái) cho cặp này">⇄ Đổi vị trí 1↔2</button>`
            : ''
        }
            </div>
            ${rows}
        </div>
    `;
}

function renderScoreOperatorSubtab(state, adminState) {
    const config = normalizeConfig(state.tournament?.config);
    const teamsMap = new Map((state.teams || []).map((t) => [t.id, t]));
    const pairsMap = new Map((state.teamPairs || []).map((p) => [p.id, p]));

    const sortedMatches = [...(state.teamMatches || [])].sort((a, b) => {
        const rankStatus = (s) => (s === 'live' ? 0 : (s === 'upcoming' ? 1 : 2));
        const evA = evaluateTeamMatch(a, state.subMatches, config);
        const evB = evaluateTeamMatch(b, state.subMatches, config);
        const rDiff = rankStatus(evA.effectiveStatus) - rankStatus(evB.effectiveStatus);
        if (rDiff !== 0) return rDiff;
        return (a.round_number ?? 1) - (b.round_number ?? 1) || (a.sort_order ?? 1) - (b.sort_order ?? 1);
    });

    if (sortedMatches.length === 0) {
        return `
            <div class="alert alert-warn">
                Chưa có trận đấu nào. Hãy sang tab <strong>Lịch Thi Đấu</strong> để tự động sinh lịch vòng tròn hoặc thêm trận mới.
            </div>
        `;
    }

    const selectedId = sortedMatches.some((m) => m.id === adminState.selectedMatchId)
        ? adminState.selectedMatchId
        : sortedMatches[0].id;
    const match = sortedMatches.find((m) => m.id === selectedId);
    const teamA = teamsMap.get(match.team_a_id);
    const teamB = teamsMap.get(match.team_b_id);
    const evalTm = evaluateTeamMatch(match, state.subMatches, config);

    const matchOptions = sortedMatches.map((m) => {
        const tA = teamsMap.get(m.team_a_id);
        const tB = teamsMap.get(m.team_b_id);
        const ev = evaluateTeamMatch(m, state.subMatches, config);
        const prefix = ev.effectiveStatus === 'live' ? '[LIVE] ' : (ev.effectiveStatus === 'completed' ? '[XONG] ' : '');
        return `<option value="${escapeHtml(m.id)}" ${m.id === selectedId ? 'selected' : ''}>${prefix}${escapeHtml(m.round_name)}: ${escapeHtml(tA?.name || '?')} vs ${escapeHtml(tB?.name || '?')} (${ev.subWinsA}-${ev.subWinsB})</option>`;
    }).join('');

    const totalSubs = evalTm.subMatches.length;
    const subCardsHtml = evalTm.subMatches.map((sm, idx) => {
        const pairA = sm.pair_a_id ? pairsMap.get(sm.pair_a_id) : null;
        const pairB = sm.pair_b_id ? pairsMap.get(sm.pair_b_id) : null;
        const levelName = config.levelNames[sm.level_index - 1] || `Level ${sm.level_index}`;
        const ev = sm.eval;
        const sets = Array.isArray(sm.sets) && sm.sets.length > 0 ? sm.sets : [{ a: 0, b: 0 }];
        const setStats = normalizeSetPlayerStats(sm.format_override?.setPlayerStats, sets.length);
        const currentBestOf = sm.format_override?.bestOf ? String(sm.format_override.bestOf) : 'default';
        const currentPts = sm.format_override?.pointsPerSet ? String(sm.format_override.pointsPerSet) : 'default';
        const hasCustomOrder = getSubMatchDisplayOrder(sm) !== null;

        const pairAText = pairA
            ? `${pairA.pair_label} (${pairA.player_1}${pairA.player_2 ? ` / ${pairA.player_2}` : ''})`
            : `${teamA?.code || 'A'}${sm.level_index}`;
        const pairBText = pairB
            ? `${pairB.pair_label} (${pairB.player_1}${pairB.player_2 ? ` / ${pairB.player_2}` : ''})`
            : `${teamB?.code || 'B'}${sm.level_index}`;

        const sideAMeta = [
            [pairA?.player_1 || `${pairA?.pair_label || 'A'} · VĐV 1`, 'a1'],
            ...(pairA?.player_2 ? [[pairA.player_2, 'a2']] : [])
        ];
        const sideBMeta = [
            [pairB?.player_1 || `${pairB?.pair_label || 'B'} · VĐV 1`, 'b1'],
            ...(pairB?.player_2 ? [[pairB.player_2, 'b2']] : [])
        ];

        const setsRowsHtml = sets.map((s, setIdx) => {
            const setWinner = ev.sets[setIdx]?.winner;
            const winBadge = setWinner === 'A'
                ? `<span class="tag tag-status-completed">${escapeHtml(pairA?.pair_label || 'A')} thắng Set ${setIdx + 1}</span>`
                : (setWinner === 'B'
                    ? `<span class="tag tag-status-completed">${escapeHtml(pairB?.pair_label || 'B')} thắng Set ${setIdx + 1}</span>`
                    : `<span class="tag tag-round">Set ${setIdx + 1}</span>`);

            const rowStats = setStats[setIdx];
            const sumPtsA = rowStats.a1.points + rowStats.a2.points;
            const sumPtsB = rowStats.b1.points + rowStats.b2.points;
            const sumErrA = rowStats.a1.errors + rowStats.a2.errors;
            const sumErrB = rowStats.b1.errors + rowStats.b2.errors;
            const rallyKey = `${sm.id}:${setIdx}`;
            const rallyState = normalizeRallyState(adminState.rallyBySet?.[rallyKey], pairA, pairB);
            const undoCount = Array.isArray(adminState.rallyUndoBySet?.[rallyKey])
                ? adminState.rallyUndoBySet[rallyKey].length
                : 0;
            const playerLabelBySlot = new Map([...sideAMeta, ...sideBMeta].map(([lbl, slot]) => [slot, lbl]));
            const serverName = playerLabelBySlot.get(rallyState.serverSlot) || 'Người phát';
            const receiverName = playerLabelBySlot.get(rallyState.receiverSlot) || 'Người đỡ';
            const serverHasPartner = rallyState.serverSlot.startsWith('a') ? sideAMeta.length > 1 : sideBMeta.length > 1;
            const nextFaultLabel = rallyState.serveTurn === 1 && serverHasPartner ? '→ Phát 2' : '→ Đổi giao';
            const serverOrderArr = rallyState.serverSlot.startsWith('a') ? rallyState.orderA : rallyState.orderB;
            const oppOrderArr = rallyState.serverSlot.startsWith('a') ? rallyState.orderB : rallyState.orderA;
            const serverPosNum = Math.max(1, serverOrderArr.indexOf(rallyState.serverSlot) + 1);
            const recvPosNum = Math.max(1, oppOrderArr.indexOf(rallyState.receiverSlot) + 1);
            const serverCourtSide = serverPosNum === 1 ? 'Phải' : 'Trái';
            const recvCourtSide = recvPosNum === 1 ? 'Phải' : 'Trái';

            const rightBoardBadge = setWinner === 'B'
                ? '<span class="set-auto-badge win">🏆 WIN</span>'
                : (!setWinner
                    ? ((Number(s.a) > 0 || Number(s.b) > 0)
                        ? '<span class="set-auto-badge live">ĐANG ĐẤU</span>'
                        : '<span class="set-auto-badge">CHỜ ĐẤU</span>')
                    : '');

            const sideAHtml = buildPlayerStatSideHtml(sm.id, setIdx, sideAMeta, rowStats, teamA?.color || '#2563EB', `Cặp ${pairA?.pair_label || 'A'}`, rallyState, 'a');
            const sideBHtml = buildPlayerStatSideHtml(sm.id, setIdx, sideBMeta, rowStats, teamB?.color || '#E05328', `Cặp ${pairB?.pair_label || 'B'}`, rallyState, 'b');

            return `
                <div class="set-editor-block" data-sub-id="${escapeHtml(sm.id)}" data-set-idx="${setIdx}">
                    <div class="set-editor-row" style="margin-top:0;border:none;padding:0;background:transparent;">
                        <div style="display:flex;align-items:center;gap:8px;min-width:130px;">
                            ${winBadge}
                        </div>

                        <div class="set-readonly-board" title="Tỉ số Set tự cập nhật khi bên Phát ghi điểm (hiển thị WIN ngay bên đội thắng Set)">
                            ${setWinner === 'A' ? '<span class="set-auto-badge win">🏆 WIN</span>' : ''}
                            <span class="set-team-tag" style="color:${escapeHtml(teamA?.color || '#2563EB')};">${escapeHtml(pairA?.pair_label || 'A')}</span>
                            <span class="set-score-pill tabular">${Number(s.a) || 0}</span>
                            <span class="set-score-sep">:</span>
                            <span class="set-score-pill tabular">${Number(s.b) || 0}</span>
                            <span class="set-team-tag" style="color:${escapeHtml(teamB?.color || '#7C3AED')};">${escapeHtml(pairB?.pair_label || 'B')}</span>
                            ${rightBoardBadge}
                        </div>

                        <div style="display:flex;align-items:center;gap:6px;">
                            <button type="button" class="btn btn-secondary btn-sm" data-action="reset-set-stats" data-sub-id="${escapeHtml(sm.id)}" data-set-idx="${setIdx}" title="Đặt lại điểm Set và thống kê cá nhân Set này về 0">⟲ Đặt lại Set</button>
                            ${sets.length > 1
                    ? `<button type="button" class="btn btn-danger btn-sm" data-action="remove-set" data-sub-id="${escapeHtml(sm.id)}" data-set-idx="${setIdx}">Xóa Set</button>`
                    : ''
                }
                        </div>
                    </div>

                    <div class="set-player-box">
                        <div class="set-player-head">
                            <span>Thống kê cá nhân Set ${setIdx + 1}</span>
                            <span class="section-sub">
                                Điểm Set chỉ + khi bên Phát ghi điểm · Cá nhân: <strong>${escapeHtml(pairA?.pair_label || 'A')} ${sumPtsA}đ</strong> (Out ${sumErrA}) · <strong>${escapeHtml(pairB?.pair_label || 'B')} ${sumPtsB}đ</strong> (Out ${sumErrB})
                            </span>
                        </div>
                        <div class="rally-control-bar">
                            <div class="rally-status-wrap">
                                <div class="serve-turn-pills" role="group" aria-label="Lượt phát bóng">
                                    <span class="serve-turn-lbl">Lượt phát:</span>
                                    <button type="button" class="serve-turn-btn ${rallyState.serveTurn === 1 ? 'active' : ''}" data-action="set-serve-turn" data-sub-id="${escapeHtml(sm.id)}" data-set-idx="${setIdx}" data-turn="1">Phát 1</button>
                                    <button type="button" class="serve-turn-btn ${rallyState.serveTurn === 2 ? 'active' : ''}" data-action="set-serve-turn" data-sub-id="${escapeHtml(sm.id)}" data-set-idx="${setIdx}" data-turn="2" ${!serverHasPartner ? 'disabled' : ''}>Phát 2</button>
                                </div>
                                <span class="rally-matchup-pill">
                                    🎾 <strong>${escapeHtml(serverName)}</strong> <span class="rally-turn-chip">#${serverPosNum} · ${serverCourtSide} · Phát ${rallyState.serveTurn}</span>
                                    <span class="rally-arrow">➔</span>
                                    🛡 <strong>${escapeHtml(receiverName)}</strong> <span class="rally-recv-chip">#${recvPosNum} · ${recvCourtSide} Đỡ</span>
                                </span>
                            </div>
                            <div class="rally-actions-wrap">
                                <button type="button" class="btn-rally btn-rally-point" data-action="rally-outcome" data-sub-id="${escapeHtml(sm.id)}" data-set-idx="${setIdx}" data-outcome="server-ace" title="${escapeHtml(serverName)} tấn công chính xác: +1đ, +1 Điểm Set, giữ Phát ${rallyState.serveTurn}, đổi sân Phải↔Trái &amp; đổi người đỡ chéo sân">${escapeHtml(serverName)} tấn công chính xác</button>
                                <button type="button" class="btn-rally btn-rally-recv-err" data-action="rally-outcome" data-sub-id="${escapeHtml(sm.id)}" data-set-idx="${setIdx}" data-outcome="receiver-error" title="${escapeHtml(receiverName)} đỡ hỏng: +1đ ${escapeHtml(serverName)}, +1 Out ${escapeHtml(receiverName)}, +1 Điểm Set, đổi sân Phải↔Trái &amp; đổi người đỡ chéo sân">${escapeHtml(receiverName)} đỡ hỏng</button>
                                <button type="button" class="btn-rally btn-rally-serve-err" data-action="rally-outcome" data-sub-id="${escapeHtml(sm.id)}" data-set-idx="${setIdx}" data-outcome="server-out" title="${escapeHtml(serverName)} phát hỏng/Out: +1 Out/Lưới &amp; chuyển lượt (${nextFaultLabel}), không cộng điểm Set cho 2 bên">${escapeHtml(serverName)} phát hỏng</button>
                                <button type="button" class="btn-rally btn-rally-recv-win" data-action="rally-outcome" data-sub-id="${escapeHtml(sm.id)}" data-set-idx="${setIdx}" data-outcome="receiver-win" title="${escapeHtml(receiverName)} phòng thủ thành công: +1đ cá nhân cho ${escapeHtml(receiverName)}, không cộng điểm Set &amp; chuyển lượt (${nextFaultLabel})">${escapeHtml(receiverName)} phòng thủ thành công</button>
                                <button type="button" class="btn-rally btn-rally-undo" data-action="undo-rally-outcome" data-sub-id="${escapeHtml(sm.id)}" data-set-idx="${setIdx}" ${undoCount === 0 ? 'disabled' : ''} title="Hoàn tác pha bóng vừa bấm gần nhất trong Set này">↩ Hoàn tác${undoCount > 0 ? ` (${undoCount})` : ''}</button>
                            </div>
                        </div>
                        <div class="set-player-cols">
                            ${sideAHtml}
                            ${sideBHtml}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        const ovCourt = String(sm.format_override?.court || '').trim();
        const ovTime = String(sm.format_override?.scheduledTime || '').trim();
        const tmSchedForPlaceholder = parseScheduleValue(match.scheduled_time);

        return `
            <div class="scorer-sub-card">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:10px;">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                        <span class="tag ${hasCustomOrder ? 'tag-round' : ''}" style="background:var(--paper);border:1px solid var(--line);color:var(--ink);font-weight:800;">#${idx + 1}</span>
                        <div class="stepper-group" style="padding:2px 4px;gap:2px;">
                            <button type="button" class="btn-step" data-action="move-sub-order" data-sub-id="${escapeHtml(sm.id)}" data-dir="up" ${idx === 0 ? 'disabled style="opacity:0.35;cursor:not-allowed;"' : ''} title="Đưa cặp này lên trước" aria-label="Đưa lên">&#8593;</button>
                            <button type="button" class="btn-step" data-action="move-sub-order" data-sub-id="${escapeHtml(sm.id)}" data-dir="down" ${idx === totalSubs - 1 ? 'disabled style="opacity:0.35;cursor:not-allowed;"' : ''} title="Đưa cặp này xuống sau" aria-label="Đưa xuống">&#8595;</button>
                        </div>
                        <span class="level-pill">${escapeHtml(levelName)}</span>
                        <strong>${escapeHtml(pairAText)}</strong>
                        <span style="color:var(--muted);">vs</span>
                        <strong>${escapeHtml(pairBText)}</strong>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                        <span class="tag ${ev.winner ? 'tag-status-completed' : 'tag-round'}">
                            Final: ${ev.setsWonA} - ${ev.setsWonB}
                            ${ev.winner ? ` (${ev.winner === 'A' ? escapeHtml(pairA?.pair_label || 'A') : escapeHtml(pairB?.pair_label || 'B')} thắng)` : ''}
                        </span>
                        <div class="quick-chip-row">
                            <button type="button" class="quick-chip ${ev.effectiveStatus === 'upcoming' ? 'active' : ''}" data-action="quick-sub-status" data-sub-id="${escapeHtml(sm.id)}" data-status="upcoming" title="Ẩn trên màn hình Live">Chưa đấu</button>
                            <button type="button" class="quick-chip ${ev.effectiveStatus === 'ready' ? 'active' : ''}" data-action="quick-sub-status" data-sub-id="${escapeHtml(sm.id)}" data-status="ready" title="Hiện nhẹ trên màn hình Live để chuẩn bị">Sắp đấu</button>
                            <button type="button" class="quick-chip live ${ev.effectiveStatus === 'live' ? 'active' : ''}" data-action="quick-sub-status" data-sub-id="${escapeHtml(sm.id)}" data-status="live">● Đang đấu</button>
                            <button type="button" class="quick-chip ${ev.effectiveStatus === 'completed' ? 'active' : ''}" data-action="quick-sub-status" data-sub-id="${escapeHtml(sm.id)}" data-status="completed">✓ Xong</button>
                        </div>
                        <select class="select-clean" data-action="sub-bestof" data-sub-id="${escapeHtml(sm.id)}" style="padding:4px 8px;font-size:12px;" title="Thể thức set riêng cho trận này">
                            <option value="default" ${currentBestOf === 'default' ? 'selected' : ''}>Mặc định (Bo${config.bestOf})</option>
                            <option value="1" ${currentBestOf === '1' ? 'selected' : ''}>Bo1 (1 Set)</option>
                            <option value="3" ${currentBestOf === '3' ? 'selected' : ''}>Bo3 (Thắng 2)</option>
                            <option value="5" ${currentBestOf === '5' ? 'selected' : ''}>Bo5 (Thắng 3)</option>
                        </select>
                        <select class="select-clean" data-action="sub-points" data-sub-id="${escapeHtml(sm.id)}" style="padding:4px 8px;font-size:12px;" title="Số điểm mỗi set">
                            <option value="default" ${currentPts === 'default' ? 'selected' : ''}>Mặc định (${config.pointsPerSet}đ)</option>
                            <option value="11" ${currentPts === '11' ? 'selected' : ''}>11 điểm</option>
                            <option value="15" ${currentPts === '15' ? 'selected' : ''}>15 điểm</option>
                            <option value="21" ${currentPts === '21' ? 'selected' : ''}>21 điểm</option>
                        </select>
                    </div>
                </div>

                <div class="sub-schedule-strip">
                    
                    <div class="sub-sched-grid">
                        <div>
                            <label class="form-label" style="font-size:11px;margin-bottom:4px;">Sân riêng</label>
                            <input type="text" class="form-input" style="padding:6px 10px;font-size:12.5px;" data-action="sub-override-field" data-sub-id="${escapeHtml(sm.id)}" data-field="court" value="${escapeHtml(ovCourt)}" placeholder="Theo trận (${escapeHtml(match.court || 'Sân 1')})">
                        </div>
                        <div>
                            <label class="form-label" style="font-size:11px;margin-bottom:4px;">Giờ riêng</label>
                            <input type="text" class="form-input" style="padding:6px 10px;font-size:12.5px;" data-action="sub-override-field" data-sub-id="${escapeHtml(sm.id)}" data-field="scheduledTime" value="${escapeHtml(ovTime)}" placeholder="${escapeHtml(tmSchedForPlaceholder.time || '08:30')}">
                        </div>
                    </div>
                </div>

                ${setsRowsHtml}

                <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px;flex-wrap:wrap;">
                    <button type="button" class="btn btn-secondary btn-sm" data-action="add-set" data-sub-id="${escapeHtml(sm.id)}">+ Thêm Set</button>
                </div>
            </div>
        `;
    }).join('');

    return `
        <div>
            <div class="form-group">
                <label class="form-label" for="admin-select-match">Chọn Cuộc Đối Đầu (Team Match) để nhập tỉ số</label>
                <select id="admin-select-match" class="form-select" data-action="admin-select-match">
                    ${matchOptions}
                </select>
            </div>

            <form id="admin-match-meta-form" data-match-id="${escapeHtml(match.id)}" style="background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:16px;margin-bottom:16px;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px;">
                    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                        <span class="team-code-dot" style="background:${escapeHtml(teamA?.color || '#0E7C5B')}">${escapeHtml(teamA?.code || 'A')}</span>
                        <strong>${escapeHtml(teamA?.name || 'Đội A')}</strong>
                        <span style="font-size:22px;font-weight:900;padding:3px 14px;background:var(--ink);color:#fff;border-radius:99px;">
                            ${evalTm.subWinsA} : ${evalTm.subWinsB}
                        </span>
                        <strong>${escapeHtml(teamB?.name || 'Đội B')}</strong>
                        <span class="team-code-dot" style="background:${escapeHtml(teamB?.color || '#E05328')}">${escapeHtml(teamB?.code || 'B')}</span>
                    </div>
                    <div class="quick-chip-row">
                        <button type="button" class="quick-chip ${match.status === 'upcoming' ? 'active' : ''}" data-action="quick-match-status" data-match-id="${escapeHtml(match.id)}" data-status="upcoming">Sắp đấu</button>
                        <button type="button" class="quick-chip live ${match.status === 'live' ? 'active' : ''}" data-action="quick-match-status" data-match-id="${escapeHtml(match.id)}" data-status="live">● Đang LIVE</button>
                        <button type="button" class="quick-chip ${match.status === 'completed' ? 'active' : ''}" data-action="quick-match-status" data-match-id="${escapeHtml(match.id)}" data-status="completed">✓ Hoàn thành</button>
                        <button type="submit" class="btn btn-primary btn-sm">Lưu sân / giờ</button>
                    </div>
                </div>

                <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(150px, 1fr));gap:10px;">
                    <div>
                        <label class="form-label">Trạng thái Team Match</label>
                        <select name="status" class="form-select">
                            <option value="upcoming" ${match.status === 'upcoming' ? 'selected' : ''}>Sắp diễn ra</option>
                            <option value="live" ${match.status === 'live' ? 'selected' : ''}>Đang đấu (LIVE)</option>
                            <option value="completed" ${match.status === 'completed' ? 'selected' : ''}>Hoàn thành</option>
                        </select>
                    </div>
                    <div>
                        <label class="form-label">Sân mặc định (cả trận)</label>
                        <input name="court" class="form-input" value="${escapeHtml(match.court)}" placeholder="Sân 1">
                        <div class="quick-chip-row" style="margin-top:6px;">
                            ${['Sân 1', 'Sân 2', 'Sân 3', 'Sân 4'].map((c) => `<button type="button" class="quick-chip ${match.court === c ? 'active' : ''}" data-action="quick-match-court" data-match-id="${escapeHtml(match.id)}" data-court="${c}">${c}</button>`).join('')}
                        </div>
                    </div>
                    <div>
                        <label class="form-label">Ngày thi đấu</label>
                        <input type="date" name="scheduled_date" class="form-input" value="${escapeHtml(parseScheduleValue(match.scheduled_time).date)}">
                    </div>
                    <div>
                        <label class="form-label">Giờ thi đấu</label>
                        <input name="scheduled_time" class="form-input" value="${escapeHtml(parseScheduleValue(match.scheduled_time).time)}" placeholder="09:30">
                    </div>
                    <div>
                        <label class="form-label">Ghi chú</label>
                        <input name="note" class="form-input" value="${escapeHtml(match.note)}" placeholder="VD: Trận tâm điểm">
                    </div>
                </div>
            </form>

            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px;padding:10px 14px;background:var(--paper);border:1px solid var(--line);border-radius:14px;">
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                    <span class="section-sub"><strong>Luật Side-Out &amp; Cá nhân:</strong> chọn <strong>🎾 Phát</strong> / <strong>🛡 Đỡ</strong> — chỉ <strong>bên Phát ghi điểm</strong> mới +1 Điểm Set; <strong>phát hỏng</strong> hoặc <strong>đỡ được</strong> không cộng điểm Set và tự chuyển lượt (1→2→Đổi giao).</span>
                </div>
                <div class="quick-chip-row">
                    <button type="button" class="quick-chip" data-action="assign-multi-courts" data-match-id="${escapeHtml(match.id)}" title="Gán Level 1 -> Sân 1, Level 2 -> Sân 2, Level 3 -> Sân 3">&#9889; Chia ${totalSubs} sân (Sân 1&rarr;${totalSubs})</button>
                    <button type="button" class="quick-chip" data-action="clear-sub-courts" data-match-id="${escapeHtml(match.id)}" title="Đưa tất cả cặp về cùng sân mặc định của trận">&#8634; Gom 1 sân chung</button>
                    <button type="button" class="quick-chip" data-action="sort-subs-by-status" data-match-id="${escapeHtml(match.id)}">&#8597; Ưu tiên Đang đấu &rarr; Sắp đấu</button>
                    <button type="button" class="quick-chip" data-action="reset-sub-order" data-match-id="${escapeHtml(match.id)}">&#8634; Theo Level 1&rarr;${totalSubs}</button>
                </div>
            </div>

            ${subCardsHtml}
        </div>
    `;
}

function renderTeamsEditorSubtab(state) {
    const config = normalizeConfig(state.tournament?.config);
    const teams = [...(state.teams || [])].sort((a, b) => (a.seed_order ?? 0) - (b.seed_order ?? 0));

    const teamEditorsHtml = teams.map((team) => {
        const pairs = (state.teamPairs || [])
            .filter((p) => p.team_id === team.id)
            .sort((a, b) => a.level_index - b.level_index);

        const pairRowsHtml = Array.from({ length: config.levelsCount }, (_, i) => {
            const lvl = i + 1;
            const pair = pairs.find((p) => p.level_index === lvl) || {
                id: `pair_${team.id}_l${lvl}`,
                pair_label: `${team.code}${lvl}`,
                player_1: '',
                player_2: ''
            };
            const levelLabel = config.levelNames[i] || `Level ${lvl}`;

            return `
                <div style="display:grid;grid-template-columns:110px 76px 1fr 1fr;gap:8px;align-items:center;margin-bottom:8px;">
                    <span class="level-pill" style="text-align:center;">${escapeHtml(levelLabel)}</span>
                    <input class="form-input" data-team-id="${escapeHtml(team.id)}" data-level="${lvl}" data-field="pair_label" value="${escapeHtml(pair.pair_label)}" placeholder="${escapeHtml(team.code)}${lvl}">
                    <input class="form-input" data-team-id="${escapeHtml(team.id)}" data-level="${lvl}" data-field="player_1" value="${escapeHtml(pair.player_1)}" placeholder="VĐV 1">
                    <input class="form-input" data-team-id="${escapeHtml(team.id)}" data-level="${lvl}" data-field="player_2" value="${escapeHtml(pair.player_2)}" placeholder="VĐV 2">
                </div>
            `;
        }).join('');

        return `
            <div class="card card-pad" style="border-left:5px solid ${escapeHtml(team.color)};">
                <div style="display:grid;grid-template-columns:80px 1fr 70px;gap:10px;align-items:end;margin-bottom:14px;">
                    <div>
                        <label class="form-label">Mã đội</label>
                        <input class="form-input" data-team-meta="${escapeHtml(team.id)}" data-field="code" value="${escapeHtml(team.code)}" maxlength="6">
                    </div>
                    <div>
                        <label class="form-label">Tên đội</label>
                        <input class="form-input" data-team-meta="${escapeHtml(team.id)}" data-field="name" value="${escapeHtml(team.name)}" placeholder="Team A">
                    </div>
                    <div>
                        <label class="form-label">Màu</label>
                        <input type="color" class="form-input" style="height:40px;padding:3px;" data-team-meta="${escapeHtml(team.id)}" data-field="color" value="${escapeHtml(team.color)}">
                    </div>
                </div>
                <div style="font-size:12px;font-weight:800;color:var(--crimson);margin-bottom:8px;">ĐỘI HÌNH CỐ ĐỊNH (FIXED LINEUP)</div>
                ${pairRowsHtml}
            </div>
        `;
    }).join('');

    return `
        <div>
            <form id="admin-resize-roster-form" style="background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:18px;margin-bottom:18px;">
                <div style="display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap;">
                    <div style="min-width:150px;">
                        <label class="form-label" for="resize-team-count">Số lượng đội (2–16)</label>
                        <input id="resize-team-count" name="teamCount" type="number" min="2" max="16" class="form-input" value="${teams.length || 4}">
                    </div>
                    <div style="min-width:170px;">
                        <label class="form-label" for="resize-levels-count">Số cặp cố định / đội (1–8)</label>
                        <input id="resize-levels-count" name="levelsCount" type="number" min="1" max="8" class="form-input" value="${config.levelsCount}">
                    </div>
                    <button type="submit" class="btn btn-amber">Áp dụng số đội & số cặp</button>
                </div>
                <div class="section-sub" style="margin-top:8px;">
                    Tăng số đội sẽ giữ nguyên các đội đang có và thêm đội mới. Nếu giảm số đội, các trận liên quan tới đội bị cắt sẽ được xóa theo.
                </div>
            </form>

            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;flex-wrap:wrap;">
                <h3 style="margin:0;">Chỉnh sửa Tên Đội & Đội Hình Cố Định</h3>
                <button type="button" class="btn btn-primary" data-action="save-all-roster">Lưu toàn bộ Tên đội & VĐV</button>
            </div>

            <div style="display:flex;flex-direction:column;gap:14px;">
                ${teamEditorsHtml}
            </div>

            <div style="margin-top:16px;display:flex;justify-content:flex-end;">
                <button type="button" class="btn btn-primary" data-action="save-all-roster">Lưu toàn bộ Tên đội & VĐV</button>
            </div>
        </div>
    `;
}

function renderScheduleEditorSubtab(state) {
    const config = normalizeConfig(state.tournament?.config);
    const teams = [...(state.teams || [])].sort((a, b) => (a.seed_order ?? 0) - (b.seed_order ?? 0));
    const teamsMap = new Map(teams.map((t) => [t.id, t]));

    const teamOptions = teams.map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`).join('');

    const matches = [...(state.teamMatches || [])].sort((a, b) => {
        if ((a.stage || 'round_robin') !== (b.stage || 'round_robin')) {
            return a.stage === 'playoff' ? 1 : -1;
        }
        return (a.round_number ?? 1) - (b.round_number ?? 1) || (a.sort_order ?? 1) - (b.sort_order ?? 1);
    });

    const listHtml = matches.map((tm) => {
        const tA = teamsMap.get(tm.team_a_id);
        const tB = teamsMap.get(tm.team_b_id);
        const ev = evaluateTeamMatch(tm, state.subMatches, config);
        const courtsList = getTeamMatchCourts(ev.subMatches, tm);
        const courtSummary = courtsList.join(' · ');
        const schedSummary = formatScheduleRaw(tm.scheduled_time);
        return `
            <div class="set-editor-row" style="margin-top:0;margin-bottom:8px;">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    <span class="tag ${tm.stage === 'playoff' ? 'tag-playoff' : 'tag-round'}">${escapeHtml(tm.round_name)}</span>
                    <strong>${escapeHtml(tA?.name || '?')}</strong>
                    <span style="color:var(--muted);">(${ev.subWinsA} - ${ev.subWinsB})</span>
                    <strong>${escapeHtml(tB?.name || '?')}</strong>
                    <span class="section-sub">${escapeHtml(courtSummary)} ${schedSummary ? `• ${escapeHtml(schedSummary)}` : ''}</span>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <button type="button" class="btn btn-secondary btn-sm" data-action="admin-edit-match" data-match-id="${escapeHtml(tm.id)}">Nhập điểm</button>
                    <button type="button" class="btn btn-danger btn-sm" data-action="delete-match" data-match-id="${escapeHtml(tm.id)}">Xóa</button>
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="admin-grid-2">
            <div class="card card-pad">
                <h3 style="margin:0 0 8px;">Sinh Lịch Vòng Tròn Tự Động</h3>
                <p class="section-sub" style="margin-top:0;">
                    Tự động ghép cặp vòng tròn chuẩn (Circle Method) cho tất cả <strong>${teams.length} đội</strong> hiện tại.
                    Các trận Playoff/Chung kết thêm tay sẽ được giữ nguyên.
                </p>
                <form id="admin-generate-rr-form">
                    <label style="display:flex;align-items:center;gap:8px;margin-bottom:14px;font-weight:600;">
                        <input type="checkbox" name="doubleRoundRobin" ${config.doubleRoundRobin ? 'checked' : ''}>
                        Đấu vòng tròn 2 lượt (Lượt đi & Lượt về)
                    </label>
                    <button type="submit" class="btn btn-amber">Sinh lại Lịch Vòng Tròn</button>
                </form>
            </div>

            <div class="card card-pad">
                <h3 style="margin:0 0 10px;">Thêm Trận Playoff / Tùy Chỉnh</h3>
                <form id="admin-add-match-form">
                    <div style="display:grid;grid-template-columns:1fr 140px;gap:10px;">
                        <div class="form-group">
                            <label class="form-label">Tên vòng / Trận</label>
                            <input name="round_name" class="form-input" required value="Chung kết" placeholder="VD: Bán kết 1, Chung kết">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Giai đoạn</label>
                            <select name="stage" class="form-select">
                                <option value="playoff">Playoff / CK</option>
                                <option value="round_robin">Vòng tròn</option>
                            </select>
                        </div>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                        <div class="form-group">
                            <label class="form-label">Đội A</label>
                            <select name="team_a_id" class="form-select" required>${teamOptions}</select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Đội B</label>
                            <select name="team_b_id" class="form-select" required>${teamOptions}</select>
                        </div>
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(120px, 1fr));gap:10px;">
                        <div class="form-group">
                            <label class="form-label">Sân</label>
                            <input name="court" class="form-input" value="Sân Trung Tâm">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Ngày thi đấu</label>
                            <input type="date" name="scheduled_date" class="form-input">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Giờ</label>
                            <input name="scheduled_time" class="form-input" value="16:00">
                        </div>
                    </div>
                    <button type="submit" class="btn btn-primary">+ Thêm Trận Đấu</button>
                </form>
            </div>
        </div>

        <div style="margin-top:20px;">
            <h3 style="margin:0 0 10px;">Danh Sách Tất Cả Các Trận (${matches.length})</h3>
            ${listHtml || '<div class="section-sub">Chưa có trận đấu nào.</div>'}
        </div>
    `;
}

function renderSettingsSubtab(state, storeMode) {
    const t = state.tournament;
    const config = normalizeConfig(t?.config);

    const levelInputs = config.levelNames.map((lvlName, idx) => `
        <div>
            <label class="form-label">Tên Level ${idx + 1}</label>
            <input class="form-input" name="levelName_${idx}" value="${escapeHtml(lvlName)}" placeholder="Level ${idx + 1}">
        </div>
    `).join('');

    return `
        <div class="admin-grid-2">
            <form id="admin-settings-form" class="card card-pad">
                <h3 style="margin:0 0 14px;">Thông Tin Giải Đấu & Luật Điểm (PPA Style)</h3>

                <div class="form-group">
                    <label class="form-label">Tên giải đấu</label>
                    <input name="name" class="form-input" required value="${escapeHtml(t.name)}">
                </div>

                <div class="form-group">
                    <label class="form-label">Mô tả / Địa điểm / Ngày thi đấu</label>
                    <input name="subtitle" class="form-input" value="${escapeHtml(t.subtitle)}">
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                    <div class="form-group">
                        <label class="form-label">Trạng thái giải</label>
                        <select name="status" class="form-select">
                            <option value="upcoming" ${t.status === 'upcoming' ? 'selected' : ''}>Sắp diễn ra</option>
                            <option value="live" ${t.status === 'live' ? 'selected' : ''}>Đang diễn ra (LIVE)</option>
                            <option value="completed" ${t.status === 'completed' ? 'selected' : ''}>Đã kết thúc</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Thể thức Set mặc định</label>
                        <select name="bestOf" class="form-select">
                            <option value="1" ${config.bestOf === 1 ? 'selected' : ''}>Best of 1 (1 Set)</option>
                            <option value="3" ${config.bestOf === 3 ? 'selected' : ''}>Best of 3 (Thắng 2/3 Set)</option>
                            <option value="5" ${config.bestOf === 5 ? 'selected' : ''}>Best of 5 (Thắng 3/5 Set)</option>
                        </select>
                    </div>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                    <div class="form-group">
                        <label class="form-label">Điểm kết thúc Set</label>
                        <input name="pointsPerSet" type="number" min="1" max="50" class="form-input" value="${config.pointsPerSet}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Điểm trần (Cap, 0 = không trần)</label>
                        <input name="pointCap" type="number" min="0" max="60" class="form-input" value="${config.pointCap}">
                    </div>
                </div>

                <label style="display:flex;align-items:center;gap:8px;margin-bottom:14px;font-weight:600;">
                    <input type="checkbox" name="winByTwo" ${config.winByTwo ? 'checked' : ''}>
                    Bắt buộc thắng cách biệt 2 điểm (Win by 2)
                </label>

                <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));gap:10px;margin-bottom:16px;">
                    ${levelInputs}
                </div>

                <button type="submit" class="btn btn-primary">Lưu Cài Đặt Giải Đấu</button>
            </form>

            <div class="card card-pad">
                <h3 style="margin:0 0 10px;">Sao Lưu, Khôi Phục & Cloud DB</h3>
                <p class="section-sub" style="margin-top:0;">
                    Chế độ hiện tại: <strong>${storeMode === 'supabase' ? 'Supabase Cloud Realtime' : 'Local Demo (localStorage)'}</strong>
                </p>

                <div style="display:flex;flex-direction:column;gap:10px;margin-top:14px;">
                    <button type="button" class="btn btn-secondary" data-action="export-json">Tải xuống bản sao lưu JSON</button>

                    <label class="btn btn-secondary" style="cursor:pointer;">
                        Nhập dữ liệu từ file JSON
                        <input type="file" accept=".json,application/json" id="admin-import-json-input" class="hidden">
                    </label>

                    <button type="button" class="btn btn-danger" data-action="reset-demo">Khôi phục dữ liệu mẫu (4 Đội × 3 Cặp)</button>
                </div>

                <div class="alert alert-info" style="margin-top:18px;margin-bottom:0;">
                    <strong>Muốn phát trực tiếp cho mọi người từ xa?</strong><br>
                    Chạy script <code>supabase/schema.sql</code> trên Supabase, tạo 1 tài khoản Admin duy nhất, rồi điền
                    <code>SUPABASE_URL</code> & <code>SUPABASE_ANON_KEY</code> vào <code>js/config.js</code> và đẩy thư mục này lên Vercel/Netlify/GitHub Pages.
                </div>
            </div>
        </div>
    `;
}

export function renderAdminTab(state, adminState, storeMode) {
    if (state.isUninitialized) {
        return `
            <div class="admin-shell card-pad">
                <h2 style="margin-top:0;">Supabase đã kết nối — Chưa có dữ liệu giải đấu</h2>
                <p class="section-sub">Bấm nút bên dưới để tạo cấu trúc giải mẫu 4 đội × 3 cặp theo thể thức Team League (Fixed Lineup) lên Supabase.</p>
                <button type="button" class="btn btn-primary" data-action="reset-demo">Khởi tạo Giải mẫu trên Supabase</button>
            </div>
        `;
    }

    const subtab = adminState.subtab || 'scores';

    let bodyHtml = '';
    if (subtab === 'scores') bodyHtml = renderScoreOperatorSubtab(state, adminState);
    else if (subtab === 'teams') bodyHtml = renderTeamsEditorSubtab(state);
    else if (subtab === 'schedule') bodyHtml = renderScheduleEditorSubtab(state);
    else if (subtab === 'settings') bodyHtml = renderSettingsSubtab(state, storeMode);

    return `
        <section class="admin-shell">
            <div class="admin-subnav">
                <div class="admin-subtabs" role="tablist">
                    <button type="button" class="admin-subtab ${subtab === 'scores' ? 'active' : ''}" data-action="admin-subtab" data-subtab="scores">Cập Nhật Tỉ Số</button>
                    <button type="button" class="admin-subtab ${subtab === 'teams' ? 'active' : ''}" data-action="admin-subtab" data-subtab="teams">Đội & Số Đội</button>
                    <button type="button" class="admin-subtab ${subtab === 'schedule' ? 'active' : ''}" data-action="admin-subtab" data-subtab="schedule">Lịch Thi Đấu</button>
                    <button type="button" class="admin-subtab ${subtab === 'settings' ? 'active' : ''}" data-action="admin-subtab" data-subtab="settings">Cài Đặt & Backup</button>
                </div>
                <div style="display:flex;align-items:center;gap:10px;">
                    <span id="admin-save-status" style="font-size:12.5px;color:var(--emerald);font-weight:750;">Sẵn sàng</span>
                    <button type="button" class="btn btn-danger btn-sm" data-action="admin-logout">Đăng xuất Admin</button>
                </div>
            </div>
            <div class="admin-body">
                ${bodyHtml}
            </div>
        </section>
    `;
}
