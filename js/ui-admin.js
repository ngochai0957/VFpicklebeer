import { APP_CONFIG } from './config.js';
import {
    SKILL_LEVEL_OPTIONS,
    buildPlayerSelectOptionsHtml,
    buildRegisteredPlayerCatalog,
    escapeHtml,
    evaluateSubMatch,
    evaluateTeamMatch,
    formatScheduleRaw,
    getSkillLevelRank,
    getSubMatchDisplayOrder,
    getTeamMatchCourts,
    normalizeConfig,
    normalizeRallyState,
    normalizeSetPlayerStats,
    normalizeSkillLevel,
    parseScheduleValue,
    summarizeRegistrations
} from './tournament-engine.js';

export const REGISTRATION_TABLE_SQL = `-- Chạy 1 lần trong Supabase SQL Editor để bật bảng Đăng ký VĐV (?register=1):
CREATE TABLE IF NOT EXISTS public.player_registrations (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    skill_level TEXT NOT NULL DEFAULT '',
    preferred_partner TEXT NOT NULL DEFAULT '',
    avoid_partner TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_player_reg_tournament ON public.player_registrations(tournament_id, created_at DESC);

ALTER TABLE public.player_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public submit registration" ON public.player_registrations;
CREATE POLICY "Public submit registration"
    ON public.player_registrations
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS "Admin read registrations" ON public.player_registrations;
CREATE POLICY "Admin read registrations"
    ON public.player_registrations
    FOR SELECT
    TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS "Admin update registrations" ON public.player_registrations;
CREATE POLICY "Admin update registrations"
    ON public.player_registrations
    FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin delete registrations" ON public.player_registrations;
CREATE POLICY "Admin delete registrations"
    ON public.player_registrations
    FOR DELETE
    TO authenticated
    USING (public.is_admin());`;

export function renderAdminLoginModal(storeMode, errorMessage = '') {
    const isSupabase = storeMode === 'supabase';
    const hasConfiguredEmail = Boolean((APP_CONFIG.ADMIN_EMAIL || '').trim());

    const emailFieldHtml = isSupabase && !hasConfiguredEmail
        ? `
            <div class="form-group">
                <label class="form-label" for="admin-login-email">Email Quản trị viên</label>
                <input id="admin-login-email" name="email" type="email" class="form-input" required placeholder="admin@yourdomain.com" autocomplete="username">
            </div>
        `
        : '';

    return `
        <div class="modal-backdrop" data-action="close-modal">
            <div class="modal-card">
                <div class="modal-header">
                    <h3 class="modal-title">Đăng nhập Quản trị (Admin)</h3>
                    <button type="button" class="modal-close" data-action="close-modal" aria-label="Đóng">✕</button>
                </div>
                <form class="modal-body" id="admin-login-form">
                    ${errorMessage ? `<div class="alert alert-error">${escapeHtml(errorMessage)}</div>` : ''}
                    ${emailFieldHtml}
                    <div class="form-group">
                        <label class="form-label" for="admin-login-password">Mật khẩu Quản trị</label>
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
                    <div class="set-editor-row set-sticky-scorebar">
                        <div class="set-sticky-meta">
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

                        <div class="set-sticky-actions">
                            <button type="button" class="btn btn-secondary btn-sm" data-action="reset-set-stats" data-sub-id="${escapeHtml(sm.id)}" data-set-idx="${setIdx}" title="Đặt lại điểm Set và thống kê cá nhân Set này về 0">⟲ Đặt lại Set</button>
                            ${sets.length > 1
                    ? `<button type="button" class="btn btn-danger btn-sm" data-action="remove-set" data-sub-id="${escapeHtml(sm.id)}" data-set-idx="${setIdx}">Xóa Set</button>`
                    : ''
                }
                        </div>
                    </div>

                    <div class="set-player-box">
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

        const pairACode = pairA?.pair_label || `${teamA?.code || 'A'}${sm.level_index}`;
        const pairBCode = pairB?.pair_label || `${teamB?.code || 'B'}${sm.level_index}`;
        const pairANames = pairA ? `${pairA.player_1}${pairA.player_2 ? ` / ${pairA.player_2}` : ''}` : pairACode;
        const pairBNames = pairB ? `${pairB.player_1}${pairB.player_2 ? ` / ${pairB.player_2}` : ''}` : pairBCode;

        return `
            <div class="scorer-sub-card">
                <div class="scorer-sub-toprow">
                    <div class="scorer-sub-idgroup">
                        <span class="scorer-num-badge ${hasCustomOrder ? 'is-custom' : ''}">#${idx + 1}</span>
                        <div class="scorer-order-btns">
                            <button type="button" class="btn-step sm" data-action="move-sub-order" data-sub-id="${escapeHtml(sm.id)}" data-dir="up" ${idx === 0 ? 'disabled' : ''} title="Đưa cặp này lên trước" aria-label="Đưa lên">&#8593;</button>
                            <button type="button" class="btn-step sm" data-action="move-sub-order" data-sub-id="${escapeHtml(sm.id)}" data-dir="down" ${idx === totalSubs - 1 ? 'disabled' : ''} title="Đưa cặp này xuống sau" aria-label="Đưa xuống">&#8595;</button>
                        </div>
                        <span class="level-pill">${escapeHtml(levelName)}</span>
                    </div>
                    <span class="tag ${ev.winner ? 'tag-status-completed' : 'tag-round'}">
                        Final: ${ev.setsWonA} - ${ev.setsWonB}${ev.winner ? ` (${ev.winner === 'A' ? escapeHtml(pairA?.pair_label || 'A') : escapeHtml(pairB?.pair_label || 'B')} thắng)` : ''}
                    </span>
                </div>

                <div class="scorer-sub-matchup">
                    <div class="scorer-pair-chip side-a">
                        <span class="scorer-pair-code" style="background:${escapeHtml(teamA?.color || '#2563EB')}">${escapeHtml(pairACode)}</span>
                        <span class="scorer-pair-names">${escapeHtml(pairANames)}</span>
                    </div>
                    <span class="scorer-vs-badge">VS</span>
                    <div class="scorer-pair-chip side-b">
                        <span class="scorer-pair-code" style="background:${escapeHtml(teamB?.color || '#E05328')}">${escapeHtml(pairBCode)}</span>
                        <span class="scorer-pair-names">${escapeHtml(pairBNames)}</span>
                    </div>
                </div>

                <div class="scorer-sub-toolbar">
                    <div class="scorer-sub-status-row">
                        <button type="button" class="quick-chip ${ev.effectiveStatus === 'upcoming' ? 'active' : ''}" data-action="quick-sub-status" data-sub-id="${escapeHtml(sm.id)}" data-status="upcoming" title="Ẩn trên màn hình Live">Chưa đấu</button>
                        <button type="button" class="quick-chip ${ev.effectiveStatus === 'ready' ? 'active' : ''}" data-action="quick-sub-status" data-sub-id="${escapeHtml(sm.id)}" data-status="ready" title="Hiện nhẹ trên màn hình Live để chuẩn bị">Sắp đấu</button>
                        <button type="button" class="quick-chip live ${ev.effectiveStatus === 'live' ? 'active' : ''}" data-action="quick-sub-status" data-sub-id="${escapeHtml(sm.id)}" data-status="live">● Đang đấu</button>
                        <button type="button" class="quick-chip ${ev.effectiveStatus === 'completed' ? 'active' : ''}" data-action="quick-sub-status" data-sub-id="${escapeHtml(sm.id)}" data-status="completed">✓ Xong</button>
                    </div>
                    <div class="scorer-sub-settings-grid">
                        <div>
                            <label class="form-label" style="font-size:11px;margin-bottom:3px;">Thể thức</label>
                            <select class="select-clean" data-action="sub-bestof" data-sub-id="${escapeHtml(sm.id)}" title="Thể thức set riêng cho trận này">
                                <option value="default" ${currentBestOf === 'default' ? 'selected' : ''}>Mặc định (Bo${config.bestOf})</option>
                                <option value="1" ${currentBestOf === '1' ? 'selected' : ''}>Bo1 (1 Set)</option>
                                <option value="3" ${currentBestOf === '3' ? 'selected' : ''}>Bo3 (Thắng 2)</option>
                                <option value="5" ${currentBestOf === '5' ? 'selected' : ''}>Bo5 (Thắng 3)</option>
                            </select>
                        </div>
                        <div>
                            <label class="form-label" style="font-size:11px;margin-bottom:3px;">Điểm/Set</label>
                            <select class="select-clean" data-action="sub-points" data-sub-id="${escapeHtml(sm.id)}" title="Số điểm mỗi set">
                                <option value="default" ${currentPts === 'default' ? 'selected' : ''}>Mặc định (${config.pointsPerSet}đ)</option>
                                <option value="11" ${currentPts === '11' ? 'selected' : ''}>11 điểm</option>
                                <option value="15" ${currentPts === '15' ? 'selected' : ''}>15 điểm</option>
                                <option value="21" ${currentPts === '21' ? 'selected' : ''}>21 điểm</option>
                            </select>
                        </div>
                        <div>
                            <label class="form-label" style="font-size:11px;margin-bottom:3px;">Sân riêng</label>
                            <input type="text" class="form-input" style="padding:6px 10px;font-size:12.5px;" data-action="sub-override-field" data-sub-id="${escapeHtml(sm.id)}" data-field="court" value="${escapeHtml(ovCourt)}" placeholder="Theo trận (${escapeHtml(match.court || 'Sân 1')})">
                        </div>
                        <div>
                            <label class="form-label" style="font-size:11px;margin-bottom:3px;">Giờ riêng</label>
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

            <form id="admin-match-meta-form" data-match-id="${escapeHtml(match.id)}" class="admin-match-meta-form">
                <div class="admin-tm-head-bar">
                    <div class="admin-tm-matchup-row">
                        <div class="admin-tm-side left">
                            <span class="team-code-dot sm" style="background:${escapeHtml(teamA?.color || '#0E7C5B')}">${escapeHtml(teamA?.code || 'A')}</span>
                            <strong>${escapeHtml(teamA?.name || 'Đội A')}</strong>
                        </div>
                        <span class="admin-tm-score tabular">
                            ${evalTm.subWinsA} : ${evalTm.subWinsB}
                        </span>
                        <div class="admin-tm-side right">
                            <strong>${escapeHtml(teamB?.name || 'Đội B')}</strong>
                            <span class="team-code-dot sm" style="background:${escapeHtml(teamB?.color || '#E05328')}">${escapeHtml(teamB?.code || 'B')}</span>
                        </div>
                    </div>
                    <div class="admin-tm-quick-bar">
                        <button type="button" class="quick-chip ${match.status === 'upcoming' ? 'active' : ''}" data-action="quick-match-status" data-match-id="${escapeHtml(match.id)}" data-status="upcoming">Sắp đấu</button>
                        <button type="button" class="quick-chip live ${match.status === 'live' ? 'active' : ''}" data-action="quick-match-status" data-match-id="${escapeHtml(match.id)}" data-status="live">● LIVE</button>
                        <button type="button" class="quick-chip ${match.status === 'completed' ? 'active' : ''}" data-action="quick-match-status" data-match-id="${escapeHtml(match.id)}" data-status="completed">✓ Xong</button>
                        <button type="submit" class="btn btn-primary btn-sm">Lưu</button>
                    </div>
                </div>

                <div class="admin-tm-meta-grid">
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
                        <input name="court" class="form-input" value="${escapeHtml(match.court)}" placeholder="VD: Sân 1">
                    </div>
                    <div>
                        <label class="form-label">Ngày thi đấu</label>
                        <input type="date" name="scheduled_date" class="form-input" value="${escapeHtml(parseScheduleValue(match.scheduled_time).date)}">
                    </div>
                    <div>
                        <label class="form-label">Giờ thi đấu</label>
                        <input name="scheduled_time" class="form-input" value="${escapeHtml(parseScheduleValue(match.scheduled_time).time)}" placeholder="09:30">
                    </div>
                    <div class="admin-meta-note-field">
                        <label class="form-label">Ghi chú</label>
                        <input name="note" class="form-input" value="${escapeHtml(match.note)}" placeholder="VD: Trận tâm điểm">
                    </div>
                </div>
            </form>

            ${subCardsHtml}
        </div>
    `;
}

function renderTeamsEditorSubtab(state, adminState) {
    const config = normalizeConfig(state.tournament?.config);
    const teams = [...(state.teams || [])].sort((a, b) => (a.seed_order ?? 0) - (b.seed_order ?? 0));
    const catalog = buildRegisteredPlayerCatalog(adminState?.registrations || []);

    const slotAssignments = [];
    const assignedCounts = new Map();
    for (const team of teams) {
        const pairs = (state.teamPairs || []).filter((p) => p.team_id === team.id);
        for (let lvl = 1; lvl <= config.levelsCount; lvl++) {
            const pair = pairs.find((p) => p.level_index === lvl);
            for (const field of ['player_1', 'player_2']) {
                const val = String(pair?.[field] || '').trim();
                const key = val.toLowerCase();
                slotAssignments.push({ teamId: team.id, lvl, field, val, key });
                if (key) assignedCounts.set(key, (assignedCounts.get(key) || 0) + 1);
            }
        }
    }

    const getOtherAssignedKeys = (selfKey) => {
        const set = new Set();
        for (const [k, cnt] of assignedCounts.entries()) {
            if (k !== selfKey || cnt > 1) set.add(k);
        }
        return set;
    };

    const assignedRegisteredCount = catalog.filter((p) => (assignedCounts.get(p.key) || 0) > 0).length;
    const remainingPoolCount = Math.max(0, catalog.length - assignedRegisteredCount);
    const poolBadgeText = catalog.length > 0
        ? `Chờ xếp: ${remainingPoolCount}/${catalog.length} VĐV`
        : 'Chưa có VĐV ĐK';

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
            const p1Val = String(pair.player_1 || '').trim();
            const p2Val = String(pair.player_2 || '').trim();
            const p1Opts = buildPlayerSelectOptionsHtml(catalog, getOtherAssignedKeys(p1Val.toLowerCase()), p1Val, lvl);
            const p2Opts = buildPlayerSelectOptionsHtml(catalog, getOtherAssignedKeys(p2Val.toLowerCase()), p2Val, lvl);

            return `
                <div class="roster-pair-row">
                    <div class="roster-pair-head">
                        <span class="level-pill">${escapeHtml(levelLabel)}</span>
                        <input class="form-input roster-pair-label-input" data-team-id="${escapeHtml(team.id)}" data-level="${lvl}" data-field="pair_label" value="${escapeHtml(pair.pair_label)}" placeholder="${escapeHtml(team.code)}${lvl}" aria-label="Mã cặp">
                    </div>
                    <div class="roster-pair-players">
                        <select class="form-select roster-player-select" data-action="roster-player-select" data-team-id="${escapeHtml(team.id)}" data-level="${lvl}" data-field="player_1" aria-label="VĐV 1 ${escapeHtml(pair.pair_label)}">
                            ${p1Opts}
                        </select>
                        <select class="form-select roster-player-select" data-action="roster-player-select" data-team-id="${escapeHtml(team.id)}" data-level="${lvl}" data-field="player_2" aria-label="VĐV 2 ${escapeHtml(pair.pair_label)}">
                            ${p2Opts}
                        </select>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="card card-pad roster-team-card" style="border-left:5px solid ${escapeHtml(team.color)};">
                <div class="roster-team-meta">
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
                        <input type="color" class="form-input roster-color-input" data-team-meta="${escapeHtml(team.id)}" data-field="color" value="${escapeHtml(team.color)}">
                    </div>
                </div>
                <div class="roster-lineup-kicker">ĐỘI HÌNH CỐ ĐỊNH (FIXED LINEUP)</div>
                <div class="roster-pairs-list">
                    ${pairRowsHtml}
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="roster-admin-wrap">
            <form id="admin-resize-roster-form" class="roster-resize-bar">
                <div class="roster-resize-field">
                    <label class="form-label" for="resize-team-count">Số đội (2–16)</label>
                    <input id="resize-team-count" name="teamCount" type="number" min="2" max="16" class="form-input" value="${teams.length || 4}">
                </div>
                <div class="roster-resize-field">
                    <label class="form-label" for="resize-levels-count">Số cặp / đội (1–8)</label>
                    <input id="resize-levels-count" name="levelsCount" type="number" min="1" max="8" class="form-input" value="${config.levelsCount}">
                </div>
                <div class="roster-resize-action">
                    <button type="submit" class="btn btn-amber roster-resize-btn">Áp dụng</button>
                </div>
            </form>

            <div class="roster-section-head">
                <div class="roster-section-title-wrap">
                    <h3 class="roster-section-title">Tên Đội &amp; Đội Hình</h3>
                    <span id="roster-pool-badge" class="roster-pool-badge ${remainingPoolCount === 0 && catalog.length > 0 ? 'is-done' : ''}">${escapeHtml(poolBadgeText)}</span>
                </div>
                <button type="button" class="btn btn-primary btn-sm roster-save-btn" data-action="save-all-roster">Lưu đội hình</button>
            </div>

            <div id="admin-roster-editor" class="roster-teams-list">
                ${teamEditorsHtml}
            </div>
        </div>
    `;
}

function renderScheduleEditorSubtab(state) {
    const config = normalizeConfig(state.tournament?.config);
    const teams = [...(state.teams || [])].sort((a, b) => (a.seed_order ?? 0) - (b.seed_order ?? 0));
    const teamsMap = new Map(teams.map((t) => [t.id, t]));

    const teamAOptions = teams
        .map((t, idx) => `<option value="${escapeHtml(t.id)}" ${idx === 0 ? 'selected' : ''}>${escapeHtml(t.name)}</option>`)
        .join('');
    const teamBOptions = teams
        .map((t, idx) => `<option value="${escapeHtml(t.id)}" ${(teams.length > 1 ? idx === 1 : idx === 0) ? 'selected' : ''}>${escapeHtml(t.name)}</option>`)
        .join('');

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
        const metaText = [courtSummary, schedSummary].filter(Boolean).join(' · ');

        return `
            <div class="sched-match-row">
                <div class="sched-match-info">
                    <div class="sched-match-top">
                        <span class="tag ${tm.stage === 'playoff' ? 'tag-playoff' : 'tag-round'}">${escapeHtml(tm.round_name)}</span>
                        ${metaText ? `<span class="sched-match-meta">${escapeHtml(metaText)}</span>` : ''}
                    </div>
                    <div class="sched-match-teams">
                        <strong class="sched-team-name">${escapeHtml(tA?.name || '?')}</strong>
                        <span class="sched-score-pill tabular">${ev.subWinsA} – ${ev.subWinsB}</span>
                        <strong class="sched-team-name">${escapeHtml(tB?.name || '?')}</strong>
                    </div>
                </div>
                <div class="sched-match-actions">
                    <button type="button" class="btn btn-secondary btn-sm sched-row-btn" data-action="admin-edit-match" data-match-id="${escapeHtml(tm.id)}">Nhập điểm</button>
                    <button type="button" class="btn btn-danger btn-sm sched-row-btn" data-action="delete-match" data-match-id="${escapeHtml(tm.id)}">Xóa</button>
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="sched-admin-wrap">
            <form id="admin-generate-rr-form" class="sched-rr-bar">
                <div class="sched-rr-head">
                    <span class="sched-rr-title">Sinh Lịch Vòng Tròn</span>
                    <span class="sched-count-pill">${teams.length} đội</span>
                </div>
                <div class="sched-rr-controls">
                    <label class="sched-rr-check">
                        <input type="checkbox" name="doubleRoundRobin" ${config.doubleRoundRobin ? 'checked' : ''}>
                        <span>2 lượt (Đi &amp; Về)</span>
                    </label>
                    <button type="submit" class="btn btn-amber sched-rr-btn">Sinh lịch vòng tròn</button>
                </div>
            </form>

            <div class="card card-pad sched-add-card">
                <div class="sched-card-head">
                    <h3 class="sched-card-title">Thêm Trận Playoff / Tùy Chỉnh</h3>
                </div>
                <form id="admin-add-match-form" class="sched-add-form">
                    <div class="sched-add-row-1">
                        <div class="sched-field">
                            <label class="form-label" for="sched-round-name">Tên vòng / Trận</label>
                            <input id="sched-round-name" name="round_name" class="form-input" required value="Chung kết" placeholder="VD: Bán kết 1, Chung kết">
                        </div>
                        <div class="sched-field">
                            <label class="form-label" for="sched-stage">Giai đoạn</label>
                            <select id="sched-stage" name="stage" class="form-select">
                                <option value="playoff">Playoff / CK</option>
                                <option value="round_robin">Vòng tròn</option>
                            </select>
                        </div>
                        <div class="sched-field">
                            <label class="form-label" for="sched-team-a">Đội A</label>
                            <select id="sched-team-a" name="team_a_id" class="form-select" required>${teamAOptions}</select>
                        </div>
                        <div class="sched-field">
                            <label class="form-label" for="sched-team-b">Đội B</label>
                            <select id="sched-team-b" name="team_b_id" class="form-select" required>${teamBOptions}</select>
                        </div>
                    </div>
                    <div class="sched-add-row-2">
                        <div class="sched-field">
                            <label class="form-label" for="sched-date">Ngày thi đấu</label>
                            <input id="sched-date" type="date" name="scheduled_date" class="form-input">
                        </div>
                        <div class="sched-field">
                            <label class="form-label" for="sched-time">Giờ</label>
                            <input id="sched-time" name="scheduled_time" class="form-input" value="16:00">
                        </div>
                        <div class="sched-field">
                            <label class="form-label" for="sched-court">Sân</label>
                            <input id="sched-court" name="court" class="form-input" value="Sân Trung Tâm">
                        </div>
                        <div class="sched-add-action">
                            <button type="submit" class="btn btn-primary sched-add-btn">+ Thêm trận</button>
                        </div>
                    </div>
                </form>
            </div>

            <div class="sched-list-section">
                <div class="sched-list-head">
                    <h3 class="sched-card-title">Danh Sách Trận</h3>
                    <span class="sched-count-pill">${matches.length} trận</span>
                </div>
                <div id="admin-schedule-list" class="sched-match-list">
                    ${listHtml || '<div class="section-sub">Chưa có trận đấu nào.</div>'}
                </div>
            </div>
        </div>
    `;
}

function renderSettingsSubtab(state, storeMode) {
    const t = state.tournament;
    const config = normalizeConfig(t?.config);

    const levelInputs = config.levelNames.map((lvlName, idx) => `
        <div class="settings-level-item">
            <span class="settings-level-idx">Level ${idx + 1}</span>
            <input class="form-input" name="levelName_${idx}" value="${escapeHtml(lvlName)}" placeholder="Level ${idx + 1}" aria-label="Tên Level ${idx + 1}">
        </div>
    `).join('');

    return `
        <div class="settings-grid">
            <form id="admin-settings-form" class="card card-pad settings-card">
                <div class="settings-card-head">
                    <h3 class="settings-card-title">Thông Tin &amp; Luật Điểm</h3>
                    <span class="settings-pill">PPA Style</span>
                </div>

                <div class="settings-form-body">
                    <div class="settings-field">
                        <label class="form-label" for="set-t-name">Tên giải đấu</label>
                        <input id="set-t-name" name="name" class="form-input" required value="${escapeHtml(t.name)}">
                    </div>

                    <div class="settings-field">
                        <label class="form-label" for="set-t-subtitle">Mô tả / Địa điểm / Ngày</label>
                        <input id="set-t-subtitle" name="subtitle" class="form-input" value="${escapeHtml(t.subtitle)}">
                    </div>

                    <div class="settings-row-2">
                        <div class="settings-field">
                            <label class="form-label" for="set-t-status">Trạng thái giải</label>
                            <select id="set-t-status" name="status" class="form-select">
                                <option value="upcoming" ${t.status === 'upcoming' ? 'selected' : ''}>Sắp diễn ra</option>
                                <option value="live" ${t.status === 'live' ? 'selected' : ''}>Đang diễn ra</option>
                                <option value="completed" ${t.status === 'completed' ? 'selected' : ''}>Đã kết thúc</option>
                            </select>
                        </div>
                        <div class="settings-field">
                            <label class="form-label" for="set-t-bestof">Thể thức Set</label>
                            <select id="set-t-bestof" name="bestOf" class="form-select">
                                <option value="1" ${config.bestOf === 1 ? 'selected' : ''}>Bo1 (1 Set)</option>
                                <option value="3" ${config.bestOf === 3 ? 'selected' : ''}>Bo3 (2/3 Set)</option>
                                <option value="5" ${config.bestOf === 5 ? 'selected' : ''}>Bo5 (3/5 Set)</option>
                            </select>
                        </div>
                    </div>

                    <div class="settings-row-2">
                        <div class="settings-field">
                            <label class="form-label" for="set-t-pts">Điểm kết thúc Set</label>
                            <input id="set-t-pts" name="pointsPerSet" type="number" min="1" max="50" class="form-input" value="${config.pointsPerSet}">
                        </div>
                        <div class="settings-field">
                            <label class="form-label" for="set-t-cap">Điểm trần (0 = mở)</label>
                            <input id="set-t-cap" name="pointCap" type="number" min="0" max="60" class="form-input" value="${config.pointCap}">
                        </div>
                    </div>

                    <label class="settings-check-row">
                        <input type="checkbox" name="winByTwo" ${config.winByTwo ? 'checked' : ''}>
                        <span>Thắng cách biệt 2 điểm (Win by 2)</span>
                    </label>

                    <div class="settings-field">
                        <label class="form-label" for="set-t-awards-vis">Hiển thị Vinh Danh &amp; Point</label>
                        <select id="set-t-awards-vis" class="form-select" name="awardsVisibility">
                            <option value="public" ${config.awardsVisibility === 'public' ? 'selected' : ''}>👁 Công khai (hiện tên thật VĐV)</option>
                            <option value="anonymous" ${config.awardsVisibility === 'anonymous' ? 'selected' : ''}>🕶 Ẩn danh (mã ngẫu nhiên mỗi lượt xem)</option>
                            <option value="hidden" ${config.awardsVisibility === 'hidden' ? 'selected' : ''}>🔒 Chỉ Admin xem tab Vinh Danh</option>
                        </select>
                    </div>

                    <div class="settings-field">
                        <span class="form-label">Tên gọi các Level</span>
                        <div class="settings-levels-grid">
                            ${levelInputs}
                        </div>
                    </div>
                </div>

                <div class="settings-card-foot">
                    <button type="submit" class="btn btn-primary settings-save-btn">Lưu cài đặt</button>
                </div>
            </form>

            <div class="card card-pad settings-card">
                <div class="settings-card-head">
                    <h3 class="settings-card-title">Sao Lưu &amp; Dữ Liệu</h3>
                    <span class="settings-mode-pill ${storeMode === 'supabase' ? 'is-cloud' : ''}">
                        ${storeMode === 'supabase' ? 'Supabase Cloud' : 'Local Demo'}
                    </span>
                </div>

                <div class="settings-backup-actions">
                    <button type="button" class="btn btn-secondary settings-action-btn" data-action="export-json">⬇ Tải sao lưu JSON</button>

                    <label class="btn btn-secondary settings-action-btn">
                        ⬆ Nhập từ file JSON
                        <input type="file" accept=".json,application/json" id="admin-import-json-input" class="hidden">
                    </label>

                    <hr class="settings-divider">

                    <button type="button" class="btn btn-danger settings-action-btn" data-action="reset-demo">↺ Khôi phục dữ liệu mẫu (6×3)</button>
                </div>

                <details class="settings-help-details">
                    <summary>Hướng dẫn kết nối Supabase Cloud</summary>
                    <div class="settings-help-body">
                        Chạy <code>supabase/schema.sql</code> trên Supabase, tạo 1 tài khoản Admin, điền <code>SUPABASE_URL</code> và <code>SUPABASE_ANON_KEY</code> vào <code>js/config.js</code> rồi deploy.
                    </div>
                </details>
            </div>
        </div>
    `;
}

function buildRegisterLink() {
    if (typeof window === 'undefined') return 'https://vfpicklebeer.pages.dev/?register=1';
    const url = new URL(window.location.href);
    url.hash = '';
    const keepDemo = url.searchParams.get('demo');
    url.search = '';
    if (keepDemo) url.searchParams.set('demo', keepDemo);
    url.searchParams.set('register', '1');
    return url.toString();
}

function formatRegDate(isoStr) {
    if (!isoStr) return '';
    try {
        return new Date(isoStr).toLocaleString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return '';
    }
}

function getSkillTierClass(skillLabel) {
    const rank = getSkillLevelRank(skillLabel);
    if (rank === 0) return 'lv-1';
    if (rank === 1) return 'lv-2';
    if (rank === 2) return 'lv-3';
    return '';
}

function renderRegistrationsSubtab(state, adminState, storeMode) {
    const config = normalizeConfig(state.tournament?.config);
    const regs = Array.isArray(adminState.registrations) ? adminState.registrations : [];
    const tableMissing = Boolean(adminState.registrationsTableMissing);
    const regQuery = String(adminState.regQuery || '').trim().toLowerCase();
    const regStatusFilter = adminState.regStatusFilter || 'all';
    const summary = summarizeRegistrations(regs);
    const registerUrl = buildRegisterLink();

    const filteredRegs = regs
        .filter((r) => {
            if (regStatusFilter !== 'all' && (r.status || 'pending') !== regStatusFilter) return false;
            if (regQuery) {
                const displaySkill = normalizeSkillLevel(r.skill_level || '');
                const hay = `${r.full_name || ''} ${r.display_name || ''} ${r.skill_level || ''} ${displaySkill}`.toLowerCase();
                if (!hay.includes(regQuery)) return false;
            }
            return true;
        })
        .sort((a, b) => {
            const rankDiff = getSkillLevelRank(a.skill_level) - getSkillLevelRank(b.skill_level);
            if (rankDiff !== 0) return rankDiff;
            return String(a.full_name || '').localeCompare(String(b.full_name || ''), 'vi');
        });

    const missingTableBanner = (storeMode === 'supabase' && tableMissing)
        ? `
            <div class="alert alert-warn" style="margin-bottom:14px;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
                    <strong>Chưa tạo bảng <code>player_registrations</code> trên Supabase</strong>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <button type="button" class="btn btn-secondary btn-sm" data-action="copy-reg-sql">📋 Copy SQL</button>
                        <button type="button" class="btn btn-primary btn-sm" data-action="refresh-registrations">↻ Kiểm tra lại</button>
                    </div>
                </div>
                <p style="margin:0 0 8px;">Chạy đoạn SQL sau 1 lần trong <strong>Supabase Dashboard → SQL Editor</strong> để VĐV gửi form được và chỉ Admin mới xem được danh sách:</p>
                <pre class="sql-snippet">${escapeHtml(REGISTRATION_TABLE_SQL)}</pre>
            </div>
        `
        : '';

    const skillBreakdownHtml = summary.bySkill.length > 0
        ? summary.bySkill.map((s) => `
            <div class="reg-skill-chip ${getSkillTierClass(s.label)}">
                <span class="reg-skill-name">${escapeHtml(s.label)}</span>
                <strong class="reg-skill-count tabular">${s.count}</strong>
            </div>
        `).join('')
        : '<span class="section-sub">Chưa có VĐV đăng ký nào.</span>';

    const skillOptionsHtml = SKILL_LEVEL_OPTIONS.map((opt) => `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`).join('');

    const rowsHtml = filteredRegs.map((r, idx) => {
        const st = r.status || 'pending';
        const fullName = String(r.full_name || '');
        const nickName = String(r.display_name || fullName);
        const showMobileNick = Boolean(nickName && nickName !== fullName);
        const displaySkill = normalizeSkillLevel(r.skill_level || '');
        const tierCls = getSkillTierClass(displaySkill);

        const statusBtn = st === 'approved'
            ? `<button type="button" class="tag reg-status-btn is-approved" data-action="toggle-reg-status" data-reg-id="${escapeHtml(r.id)}" data-next-status="pending" title="Bấm để chuyển lại Chờ duyệt">✓ Đã duyệt</button>`
            : `<button type="button" class="tag reg-status-btn is-pending" data-action="toggle-reg-status" data-reg-id="${escapeHtml(r.id)}" data-next-status="approved" title="Bấm để duyệt VĐV này vào danh sách chính">Chờ duyệt</button>`;

        return `
            <tr class="reg-row">
                <td class="tabular reg-col-idx">${idx + 1}</td>
                <td class="col-left reg-col-name">
                    <div class="reg-name-stack">
                        <strong>${escapeHtml(fullName)}</strong>
                        ${showMobileNick ? `<span class="reg-mobile-nick">${escapeHtml(nickName)}</span>` : ''}
                    </div>
                </td>
                <td class="col-left reg-col-nick"><span class="reg-nick-text">${escapeHtml(nickName)}</span></td>
                <td class="col-left reg-col-skill"><span class="tag reg-skill-tag ${tierCls}">${escapeHtml(displaySkill)}</span></td>
                <td class="tabular reg-col-date">${escapeHtml(formatRegDate(r.created_at))}</td>
                <td class="reg-col-status">${statusBtn}</td>
                <td class="reg-col-del">
                    <button type="button" class="btn btn-danger btn-sm reg-del-btn" data-action="delete-registration" data-reg-id="${escapeHtml(r.id)}" title="Xóa phiếu này" aria-label="Xóa phiếu này">Xóa</button>
                </td>
            </tr>
        `;
    }).join('');

    return `
        <div class="reg-admin-panel">
            <div class="reg-share-card">
                <div class="reg-share-head">
                    <div class="reg-share-title-wrap">
                        <span class="reg-share-title">Form Đăng Ký</span>
                        <span class="reg-status-pill ${config.registrationOpen ? 'is-open' : 'is-closed'}">
                            <span class="reg-status-dot"></span>${config.registrationOpen ? 'Đang mở' : 'Đang đóng'}
                        </span>
                    </div>
                    <button type="button" class="btn btn-sm reg-toggle-btn ${config.registrationOpen ? 'btn-secondary' : 'btn-primary'}" data-action="toggle-registration-open">
                        ${config.registrationOpen ? '🔒 Đóng Form' : '🔓 Mở Form'}
                    </button>
                </div>
                <div class="reg-share-link-row">
                    <input id="admin-register-link-input" type="text" readonly class="form-input reg-link-input" value="${escapeHtml(registerUrl)}" aria-label="Link Form Đăng Ký">
                    <button type="button" class="btn btn-primary btn-sm reg-share-btn" data-action="copy-register-link">📋 Copy</button>
                    <a href="${escapeHtml(registerUrl)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm reg-share-btn" style="text-decoration:none;">↗ Mở</a>
                </div>
            </div>

            ${missingTableBanner}

            <div class="reg-kpi-row">
                <div class="reg-kpi-cell">
                    <span class="reg-sum-lbl">Tổng đăng ký</span>
                    <strong class="reg-sum-val tabular">${summary.total}</strong>
                </div>
                <div class="reg-kpi-cell">
                    <span class="reg-sum-lbl">Đã duyệt</span>
                    <strong class="reg-sum-val tabular" style="color:var(--primary);">${summary.approved}</strong>
                </div>
                <div class="reg-kpi-cell">
                    <span class="reg-sum-lbl">Chờ duyệt</span>
                    <strong class="reg-sum-val tabular" style="color:var(--gold);">${summary.pending}</strong>
                </div>
            </div>

            <div class="reg-skill-card">
                <div class="reg-skill-head">
                    <span class="reg-sum-lbl">Phân bổ trình độ</span>
                    <span class="reg-skill-hint">Lv1 → Lv3</span>
                </div>
                <div class="reg-skill-grid">${skillBreakdownHtml}</div>
            </div>

            <div class="reg-toolbar">
                <div class="reg-toolbar-filters">
                    <div class="search-input-wrap reg-search-wrap">
                        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        <input id="admin-reg-search" type="search" class="search-input" data-action="reg-filter-query" value="${escapeHtml(adminState.regQuery || '')}" placeholder="Tìm VĐV, level...">
                    </div>
                    <select class="select-clean reg-status-select" data-action="reg-filter-status" aria-label="Lọc trạng thái đơn">
                        <option value="all" ${regStatusFilter === 'all' ? 'selected' : ''}>Tất cả (${summary.total})</option>
                        <option value="pending" ${regStatusFilter === 'pending' ? 'selected' : ''}>Chờ duyệt (${summary.pending})</option>
                        <option value="approved" ${regStatusFilter === 'approved' ? 'selected' : ''}>Đã duyệt (${summary.approved})</option>
                    </select>
                </div>

                <div class="reg-toolbar-actions">
                    <button type="button" class="btn btn-secondary btn-sm" data-action="refresh-registrations">↻ Tải lại</button>
                    <button type="button" class="btn btn-secondary btn-sm" data-action="export-registrations-csv" ${regs.length === 0 ? 'disabled' : ''}>⬇ Xuất CSV</button>
                </div>
            </div>

            <details class="reg-manual-details">
                <summary>+ Thêm VĐV thủ công</summary>
                <form id="admin-add-registration-form" class="reg-manual-form">
                    <div>
                        <label class="form-label">Họ và tên *</label>
                        <input name="full_name" class="form-input" required maxlength="80" placeholder="Nguyễn Văn A">
                    </div>
                    <div>
                        <label class="form-label">Tên thi đấu</label>
                        <input name="display_name" class="form-input" maxlength="40" placeholder="Để trống nếu trùng">
                    </div>
                    <div>
                        <label class="form-label">Trình độ *</label>
                        <select name="skill_level" class="form-select" required>
                            ${skillOptionsHtml}
                        </select>
                    </div>
                    <div class="reg-manual-submit">
                        <button type="submit" class="btn btn-primary btn-sm" style="width:100%;height:39px;">Thêm vào danh sách</button>
                    </div>
                </form>
            </details>

            <div class="card">
                <div class="table-wrap">
                    <table class="standings-table reg-table">
                        <thead>
                            <tr>
                                <th style="width:44px;">#</th>
                                <th class="col-left">Họ và tên</th>
                                <th class="col-left">Tên thi đấu</th>
                                <th class="col-left">Trình độ (Lv1 → Lv3)</th>
                                <th style="width:108px;">Thời gian</th>
                                <th style="width:106px;">Trạng thái</th>
                                <th style="width:66px;"></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml || '<tr><td colspan="7" style="padding:26px;color:var(--muted);">Chưa có VĐV nào đăng ký hoặc không khớp bộ lọc.</td></tr>'}
                        </tbody>
                    </table>
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
                <p class="section-sub">Bấm nút bên dưới để tạo cấu trúc giải mẫu 6 đội × 3 cặp theo thể thức Team League (Fixed Lineup) lên Supabase.</p>
                <button type="button" class="btn btn-primary" data-action="reset-demo">Khởi tạo Giải mẫu trên Supabase</button>
            </div>
        `;
    }

    const subtab = adminState.subtab || 'scores';
    const regCount = Array.isArray(adminState.registrations) ? adminState.registrations.length : 0;

    let bodyHtml = '';
    if (subtab === 'scores') bodyHtml = renderScoreOperatorSubtab(state, adminState);
    else if (subtab === 'registrations') bodyHtml = renderRegistrationsSubtab(state, adminState, storeMode);
    else if (subtab === 'teams') bodyHtml = renderTeamsEditorSubtab(state, adminState);
    else if (subtab === 'schedule') bodyHtml = renderScheduleEditorSubtab(state);
    else if (subtab === 'settings') bodyHtml = renderSettingsSubtab(state, storeMode);

    return `
        <section class="admin-shell">
            <div class="admin-subnav">
                <div class="admin-subtabs" role="tablist">
                    <button type="button" class="admin-subtab ${subtab === 'scores' ? 'active' : ''}" data-action="admin-subtab" data-subtab="scores">Cập Nhật Tỉ Số</button>
                    <button type="button" class="admin-subtab ${subtab === 'registrations' ? 'active' : ''}" data-action="admin-subtab" data-subtab="registrations">Đăng Ký VĐV${regCount > 0 ? ` (${regCount})` : ''}</button>
                    <button type="button" class="admin-subtab ${subtab === 'teams' ? 'active' : ''}" data-action="admin-subtab" data-subtab="teams">Đội & Số Đội</button>
                    <button type="button" class="admin-subtab ${subtab === 'schedule' ? 'active' : ''}" data-action="admin-subtab" data-subtab="schedule">Lịch Thi Đấu</button>
                    <button type="button" class="admin-subtab ${subtab === 'settings' ? 'active' : ''}" data-action="admin-subtab" data-subtab="settings">Cài Đặt & Backup</button>
                </div>
                <div class="admin-subnav-actions">
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
