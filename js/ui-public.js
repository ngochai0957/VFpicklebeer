import {
    buildCourtBoard,
    calculatePairStats,
    calculateStandings,
    escapeHtml,
    evaluateTeamMatch,
    getSubMatchDisplayOrder,
    getSubMatchStatusRank,
    normalizeConfig
} from './tournament-engine.js';

function formatSigned(num) {
    if (num > 0) return `+${num}`;
    return String(num);
}

function getStatusBadgeHtml(status) {
    if (status === 'live') {
        return `<span class="tag tag-status-live"><span class="pulse-dot"></span>LIVE</span>`;
    }
    if (status === 'completed') {
        return `<span class="tag tag-status-completed">Hoàn thành</span>`;
    }
    return `<span class="tag tag-status-upcoming">Sắp đấu</span>`;
}

function normalizeQuery(str) {
    return String(str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

function buildPpaPairRowHtml({
    sideKey,
    pairLabel,
    playersText,
    team,
    ev,
    setCount,
    isSubLive,
    isSubCompleted,
    hasScoreGrid
}) {
    const pointKey = sideKey === 'A' ? 'a' : 'b';
    const isRowWinner = ev.winner === sideKey;
    const isRowLoser = Boolean(ev.winner && ev.winner !== sideKey);
    const sets = ev.sets || [];

    const winnerBadgeHtml = isRowWinner
        ? '<span class="ppa-winner-badge">&#10003; WINNER</span>'
        : '';

    const identityHtml = `
        <div class="ppa-pair-info">
            <span class="ppa-pair-seed" style="color:${escapeHtml(team.color)}">${escapeHtml(pairLabel)}</span>
            <span class="ppa-pair-names">${escapeHtml(playersText)}</span>
            ${winnerBadgeHtml}
        </div>
    `;

    if (!hasScoreGrid) {
        return `
            <div class="ppa-pair-row compact">
                ${identityHtml}
            </div>
        `;
    }

    const setCellsHtml = Array.from({ length: setCount }, (_, idx) => {
        const s = sets[idx];
        const isSetActive = Boolean(
            s && (s.a > 0 || s.b > 0 || idx === 0 || (isSubLive && idx === sets.length - 1))
        );
        if (!isSetActive) {
            return '<div class="ppa-set-cell empty tabular">&mdash;</div>';
        }
        const isCurrentLiveSet = isSubLive && idx === sets.length - 1 && !s.winner;
        const isSetWin = s.winner === sideKey;
        const cellCls = isCurrentLiveSet
            ? 'live'
            : (isSetWin && !isSubCompleted ? 'set-win' : (isSetWin ? 'won' : ''));
        return `<div class="ppa-set-cell ${cellCls} tabular">${s[pointKey]}</div>`;
    }).join('');

    return `
        <div class="ppa-pair-row ${isRowWinner ? 'is-winner' : ''} ${isRowLoser ? 'is-loser' : ''}" style="--sets:${setCount};">
            ${identityHtml}
            ${setCellsHtml}
        </div>
    `;
}

export function renderTeamMatchCard(tm, context, isAdmin = false, options = {}) {
    const { teamsMap, pairsMap, subMatches, config } = context;
    const teamA = teamsMap.get(tm.team_a_id);
    const teamB = teamsMap.get(tm.team_b_id);
    if (!teamA || !teamB) return '';

    const evalTm = evaluateTeamMatch(tm, subMatches, config);
    const isLive = evalTm.effectiveStatus === 'live';
    const liveOnly = Boolean(options.liveOnly);

    const hasManualOrder = evalTm.subMatches.some((sm) => getSubMatchDisplayOrder(sm) !== null);
    const orderedSubs = hasManualOrder
        ? evalTm.subMatches
        : [...evalTm.subMatches].sort(
            (a, b) => getSubMatchStatusRank(a.eval.effectiveStatus) - getSubMatchStatusRank(b.eval.effectiveStatus)
                || (a.level_index ?? 0) - (b.level_index ?? 0)
        );

    const visibleSubs = orderedSubs.filter((sm) => {
        const st = sm.eval.effectiveStatus;
        if (liveOnly) {
            return st === 'live' || st === 'ready';
        }
        // In an active LIVE Team Match card, hide unstarted ('upcoming' / Chưa đấu) pairs
        if (isLive) {
            return st !== 'upcoming';
        }
        return true;
    });

    const rowsHtml = visibleSubs.map((sm) => {
        const pairA = sm.pair_a_id ? pairsMap.get(sm.pair_a_id) : null;
        const pairB = sm.pair_b_id ? pairsMap.get(sm.pair_b_id) : null;
        const levelLabel = config.levelNames[sm.level_index - 1] || `Level ${sm.level_index}`;
        const ev = sm.eval;
        const st = ev.effectiveStatus;
        const isSubLive = st === 'live';
        const isSubReady = st === 'ready';
        const isSubUpcoming = st === 'upcoming';
        const isSubCompleted = Boolean(ev.winner || st === 'completed');
        const boLabel = `Bo${ev.effectiveConfig.bestOf || 3}`;

        const pairALabel = pairA?.pair_label || `${teamA.code}${sm.level_index}`;
        const pairBLabel = pairB?.pair_label || `${teamB.code}${sm.level_index}`;
        const pairAText = pairA
            ? `${pairA.player_1 || ''}${pairA.player_2 ? ` / ${pairA.player_2}` : ''}`.trim()
            : pairALabel;
        const pairBText = pairB
            ? `${pairB.player_1 || ''}${pairB.player_2 ? ` / ${pairB.player_2}` : ''}`.trim()
            : pairBLabel;

        if (isSubReady || isSubUpcoming) {
            const stateBadge = isSubReady
                ? '<span class="ppa-status-pill ready">Sắp đấu</span>'
                : '<span class="ppa-status-pill upcoming">Chưa đấu</span>';
            const rowA = buildPpaPairRowHtml({
                sideKey: 'A',
                pairLabel: pairALabel,
                playersText: pairAText,
                team: teamA,
                ev,
                setCount: 0,
                isSubLive: false,
                isSubCompleted: false,
                hasScoreGrid: false
            });
            const rowB = buildPpaPairRowHtml({
                sideKey: 'B',
                pairLabel: pairBLabel,
                playersText: pairBText,
                team: teamB,
                ev,
                setCount: 0,
                isSubLive: false,
                isSubCompleted: false,
                hasScoreGrid: false
            });
            return `
                <div class="ppa-sub-card ${isSubReady ? 'is-ready' : 'is-upcoming'}">
                    <div class="ppa-sub-head">
                        <span class="ppa-sub-division">${escapeHtml(levelLabel)} · Mixed Doubles</span>
                        <div class="ppa-sub-meta">
                            <span class="ppa-bo-tag">${boLabel}</span>
                            ${stateBadge}
                        </div>
                    </div>
                    <div class="ppa-sub-body">
                        ${rowA}
                        ${rowB}
                    </div>
                </div>
            `;
        }

        const sets = ev.sets || [];
        const setCount = Math.max(ev.effectiveConfig.bestOf || 1, sets.length);
        const setHeadersHtml = Array.from({ length: setCount }, (_, i) => `<div class="ppa-col-th">Set ${i + 1}</div>`).join('');
        const statusBadge = isSubLive
            ? '<span class="ppa-status-pill live"><span class="pulse-dot"></span>LIVE</span>'
            : '<span class="ppa-status-pill final">FINAL</span>';

        const rowA = buildPpaPairRowHtml({
            sideKey: 'A',
            pairLabel: pairALabel,
            playersText: pairAText,
            team: teamA,
            ev,
            setCount,
            isSubLive,
            isSubCompleted,
            hasScoreGrid: true
        });
        const rowB = buildPpaPairRowHtml({
            sideKey: 'B',
            pairLabel: pairBLabel,
            playersText: pairBText,
            team: teamB,
            ev,
            setCount,
            isSubLive,
            isSubCompleted,
            hasScoreGrid: true
        });

        return `
            <div class="ppa-sub-card ${isSubLive ? 'is-live' : ''} ${isSubCompleted ? 'is-completed' : ''}">
                <div class="ppa-sub-head">
                    <span class="ppa-sub-division">${escapeHtml(levelLabel)} · Mixed Doubles</span>
                    <div class="ppa-sub-meta">
                        <span class="ppa-bo-tag">${boLabel}</span>
                        ${statusBadge}
                    </div>
                </div>
                <div class="ppa-grid-head" style="--sets:${setCount};">
                    <div class="ppa-col-th left">Cặp đấu</div>
                    ${setHeadersHtml}
                </div>
                <div class="ppa-sub-body">
                    ${rowA}
                    ${rowB}
                </div>
            </div>
        `;
    }).join('');

    const adminShortcut = isAdmin
        ? `<button type="button" class="btn btn-amber btn-sm" data-action="admin-edit-match" data-match-id="${escapeHtml(tm.id)}">Sửa tỉ số</button>`
        : '';

    const emptyRowsNotice = liveOnly
        ? '<div class="section-sub" style="padding:18px;text-align:center;">Chưa có cặp nào đang đấu (hãy bật <strong>Đang đấu LIVE</strong> hoặc <strong>Sắp đấu</strong> cho cặp trong Quản trị).</div>'
        : '<div class="section-sub" style="padding:16px;text-align:center;">Chưa có cặp đấu nào bắt đầu.</div>';

    return `
        <article class="tm-card ${isLive ? 'is-live' : ''}">
            <div class="tm-card-top">
                <div class="tm-meta">
                    <span class="tag ${tm.stage === 'playoff' ? 'tag-playoff' : 'tag-round'}">${escapeHtml(tm.round_name)}</span>
                    ${tm.court ? `<span>${escapeHtml(tm.court)}</span>` : ''}
                    ${tm.scheduled_time ? `<span>· ${escapeHtml(tm.scheduled_time)}</span>` : ''}
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                    ${getStatusBadgeHtml(evalTm.effectiveStatus)}
                    ${adminShortcut}
                </div>
            </div>

            <div class="tm-scoreboard-head">
                <div class="tm-side ${evalTm.winner === 'A' ? 'winner' : ''}">
                    <span class="team-code-dot" style="background:${escapeHtml(teamA.color)}">${escapeHtml(teamA.code)}</span>
                    <div class="tm-side-info">
                        <div class="tm-side-name">${escapeHtml(teamA.name)}</div>
                        ${evalTm.winner === 'A' ? '<span class="tm-winner-tag">Thắng đối đầu</span>' : ''}
                    </div>
                </div>

                <div class="tm-center-wrap">
                    <span class="tm-center-label">Tỉ số đội</span>
                    <div class="tm-center-score tabular">
                        <span>${evalTm.subWinsA}</span>
                        <span class="sep">:</span>
                        <span>${evalTm.subWinsB}</span>
                    </div>
                </div>

                <div class="tm-side right ${evalTm.winner === 'B' ? 'winner' : ''}">
                    <span class="team-code-dot" style="background:${escapeHtml(teamB.color)}">${escapeHtml(teamB.code)}</span>
                    <div class="tm-side-info">
                        <div class="tm-side-name">${escapeHtml(teamB.name)}</div>
                        ${evalTm.winner === 'B' ? '<span class="tm-winner-tag">Thắng đối đầu</span>' : ''}
                    </div>
                </div>
            </div>

            <div class="ppa-sub-list">
                ${rowsHtml || emptyRowsNotice}
            </div>
            ${tm.note ? `<div class="section-sub" style="padding:10px 20px 12px;border-top:1px solid var(--line);">Ghi chú: ${escapeHtml(tm.note)}</div>` : ''}
        </article>
    `;
}

export function renderLiveSpotlight(state, isAdmin, compact = true) {
    const config = normalizeConfig(state.tournament?.config);
    const teamsMap = new Map((state.teams || []).map((t) => [t.id, t]));
    const pairsMap = new Map((state.teamPairs || []).map((p) => [p.id, p]));
    const context = { teamsMap, pairsMap, subMatches: state.subMatches || [], config };

    const liveMatches = (state.teamMatches || []).filter((tm) => {
        const ev = evaluateTeamMatch(tm, state.subMatches, config);
        return ev.effectiveStatus === 'live';
    });

    if (liveMatches.length === 0) return '';

    if (!compact) {
        return `
            <section class="format-box">
                <div class="section-header">
                    <h2 class="section-title"><span class="pulse-dot"></span>Đang Thi Đấu Trực Tiếp (${liveMatches.length})</h2>
                    <span class="section-sub">Tỉ số từng set cập nhật trực tiếp</span>
                </div>
                <div class="matches-stack">
                    ${liveMatches.map((tm) => renderTeamMatchCard(tm, context, isAdmin, { liveOnly: true })).join('')}
                </div>
            </section>
        `;
    }

    const miniCardsHtml = liveMatches.map((tm) => {
        const teamA = teamsMap.get(tm.team_a_id);
        const teamB = teamsMap.get(tm.team_b_id);
        if (!teamA || !teamB) return '';
        const evalTm = evaluateTeamMatch(tm, state.subMatches, config);
        const activeSub = evalTm.subMatches.find((s) => s.eval.effectiveStatus === 'live');
        const readySub = evalTm.subMatches.find((s) => s.eval.effectiveStatus === 'ready');

        let activeLine = 'Đang chuẩn bị lên sân';
        if (activeSub) {
            const lvl = config.levelNames[activeSub.level_index - 1] || `Level ${activeSub.level_index}`;
            const sets = activeSub.eval.sets || [];
            const setsText = sets.map((s, idx) => `S${idx + 1}: ${s.a}-${s.b}`).join(' · ');
            activeLine = `${lvl} (${activeSub.eval.setsWonA}-${activeSub.eval.setsWonB}) · ${setsText}`;
        } else if (readySub) {
            const lvl = config.levelNames[readySub.level_index - 1] || `Level ${readySub.level_index}`;
            activeLine = `Sắp đấu: ${lvl}`;
        }

        const actionBtn = isAdmin
            ? `<button type="button" class="link-btn" data-action="admin-edit-match" data-match-id="${escapeHtml(tm.id)}">Sửa tỉ số &rarr;</button>`
            : `<button type="button" class="link-btn" data-action="filter-round-btn" data-round="${escapeHtml(tm.round_name)}">Xem chi tiết &rarr;</button>`;

        return `
            <article class="live-mini-card">
                <div class="live-mini-top">
                    <span>${escapeHtml(tm.round_name)}${tm.court ? ` · ${escapeHtml(tm.court)}` : ''}</span>
                    <span class="tag tag-status-live"><span class="pulse-dot"></span>LIVE</span>
                </div>
                <div class="live-mini-teams">
                    <div class="live-mini-team">
                        <span class="team-code-dot sm" style="background:${escapeHtml(teamA.color)}">${escapeHtml(teamA.code)}</span>
                        <span class="live-mini-team-name">${escapeHtml(teamA.name)}</span>
                    </div>
                    <div class="live-mini-score tabular">${evalTm.subWinsA} : ${evalTm.subWinsB}</div>
                    <div class="live-mini-team right">
                        <span class="team-code-dot sm" style="background:${escapeHtml(teamB.color)}">${escapeHtml(teamB.code)}</span>
                        <span class="live-mini-team-name">${escapeHtml(teamB.name)}</span>
                    </div>
                </div>
                <div class="live-mini-subrow">
                    <span>${escapeHtml(activeLine)}</span>
                    ${actionBtn}
                </div>
            </article>
        `;
    }).join('');

    return `
        <section class="format-box">
            <div class="section-header">
                <h2 class="section-title"><span class="pulse-dot"></span>Đang Thi Đấu Trực Tiếp</h2>
                <span class="section-sub">${liveMatches.length} sân đang diễn ra</span>
            </div>
            <div class="live-strip-grid">
                ${miniCardsHtml}
            </div>
        </section>
    `;
}

export function renderStandingsTab(state, isAdmin) {
    const config = normalizeConfig(state.tournament?.config);
    const standings = calculateStandings(state.teams, state.teamMatches, state.subMatches, config);
    const teamsMap = new Map((state.teams || []).map((t) => [t.id, t]));
    const pairsMap = new Map((state.teamPairs || []).map((p) => [p.id, p]));
    const playoffMatches = (state.teamMatches || []).filter((tm) => tm.stage === 'playoff');
    const showCutline = standings.length >= 4;

    const rowsHtml = standings.map((row) => {
        const rankClass = row.rank <= 3 ? `rank-${row.rank}` : '';
        const diffCls = row.pointDiff > 0 ? 'diff-pos' : (row.pointDiff < 0 ? 'diff-neg' : 'diff-zero');
        const setDiffCls = row.setDiff > 0 ? 'diff-pos' : (row.setDiff < 0 ? 'diff-neg' : 'diff-zero');
        const cutlineCls = showCutline && row.rank === 2 ? 'cutline-row' : '';

        const formHtml = (row.form || []).length > 0
            ? `<div class="form-strip">${row.form.slice(-5).map((f) => `<span class="form-badge ${f.toLowerCase()}">${f}</span>`).join('')}</div>`
            : `<span class="section-sub">—</span>`;

        const tieNoteHtml = row.tieNote
            ? `<span class="tie-reason-badge">${escapeHtml(row.tieNote)}</span>`
            : '';

        return `
            <tr class="${cutlineCls}">
                <td><span class="rank-pill ${rankClass}">${row.rank}</span></td>
                <td class="col-left">
                    <button type="button" class="team-btn" data-action="view-team" data-team-id="${escapeHtml(row.team.id)}">
                        <span class="team-code-dot" style="background:${escapeHtml(row.team.color)}">${escapeHtml(row.team.code)}</span>
                        <span>
                            <span>${escapeHtml(row.team.name)}</span>
                            ${tieNoteHtml ? `<div>${tieNoteHtml}</div>` : ''}
                        </span>
                    </button>
                </td>
                <td class="tabular">${row.teamMatchesPlayed}</td>
                <td class="tabular">
                    <span class="stat-highlight">${row.teamMatchWins}</span>
                    <span class="sub-caption">${row.teamMatchWins}W-${row.teamMatchLosses}L</span>
                </td>
                <td class="tabular"><strong>${row.subMatchWins}</strong> - ${row.subMatchLosses}</td>
                <td class="tabular">
                    <span>${row.setsWon} - ${row.setsLost}</span>
                    <span class="sub-caption ${setDiffCls}">${formatSigned(row.setDiff)}</span>
                </td>
                <td class="tabular">
                    <span class="${diffCls}">${formatSigned(row.pointDiff)}</span>
                    <span class="sub-caption">${row.pointsFor}:${row.pointsAgainst}</span>
                </td>
                <td>${formHtml}</td>
            </tr>
        `;
    }).join('');

    const playoffSection = playoffMatches.length > 0
        ? `
            <div class="section-block" style="margin-top:34px;">
                <div class="section-header">
                    <h2 class="section-title">Vòng Chung Kết &amp; Playoff</h2>
                    <span class="section-sub">Các trận phân hạng trực tiếp</span>
                </div>
                <div class="matches-stack">
                    ${playoffMatches.map((tm) => renderTeamMatchCard(tm, {
                        teamsMap,
                        pairsMap,
                        subMatches: state.subMatches || [],
                        config
                    }, isAdmin)).join('')}
                </div>
            </div>
        `
        : '';

    return `
        <section class="section-block">
            <div class="section-header">
                <h2 class="section-title">Bảng Xếp Hạng</h2>
                <span class="section-sub">Nhấn tên đội để xem đội hình cố định${showCutline ? ' · Nét đứt đánh dấu Top 2' : ''}</span>
            </div>

            <div class="card">
                <div class="table-wrap">
                    <table class="standings-table">
                        <thead>
                            <tr>
                                <th style="width:58px;">#</th>
                                <th class="col-left">Đội</th>
                                <th>Đã đấu</th>
                                <th>TM Thắng</th>
                                <th>Trận cặp</th>
                                <th>Set</th>
                                <th>HS Điểm</th>
                                <th>Phong độ</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml || '<tr><td colspan="8" style="padding:28px;color:var(--muted);">Chưa có đội tham gia.</td></tr>'}
                        </tbody>
                    </table>
                </div>
                <div class="tiebreaker-bar">
                    <strong>Thứ tự phân hạng:</strong>
                    <span class="tie-step"><span>01</span>Team Match thắng</span>
                    <span class="tie-step"><span>02</span>Tổng số trận cặp thắng</span>
                    <span class="tie-step"><span>03</span>Hiệu số điểm (Ghi &minus; Thua)</span>
                </div>
            </div>

            ${playoffSection}
        </section>
    `;
}

function renderCourtBoardView(state, context, isAdmin) {
    const config = context.config;
    const teamsMap = context.teamsMap;
    const courts = buildCourtBoard(state.teamMatches, state.subMatches, config);

    if (courts.length === 0) {
        return `<div class="card card-pad" style="text-align:center;color:var(--muted);">Chưa có trận đấu nào được phân sân.</div>`;
    }

    const cardsHtml = courts.map((c) => {
        const renderSlot = (item, label, badgeHtml) => {
            const tA = teamsMap.get(item.tm.team_a_id);
            const tB = teamsMap.get(item.tm.team_b_id);
            const ev = item.eval;
            const editBtn = isAdmin
                ? `<button type="button" class="link-btn" data-action="admin-edit-match" data-match-id="${escapeHtml(item.tm.id)}">Sửa tỉ số</button>`
                : '';

            return `
                <div class="court-slot">
                    <div class="court-slot-label">
                        ${badgeHtml}
                        <span>${escapeHtml(label)} · ${escapeHtml(item.tm.round_name)}${item.tm.scheduled_time ? ` (${escapeHtml(item.tm.scheduled_time)})` : ''}</span>
                    </div>
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
                        <div style="font-weight:750;font-size:14px;color:var(--ink);">
                            ${escapeHtml(tA?.name || '?')} <span style="color:var(--muted);font-weight:500;">vs</span> ${escapeHtml(tB?.name || '?')}
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <strong class="tabular" style="font-size:16px;color:var(--primary);">${ev.subWinsA} : ${ev.subWinsB}</strong>
                            ${editBtn}
                        </div>
                    </div>
                </div>
            `;
        };

        const liveHtml = c.live.map((item) => renderSlot(item, 'Đang thi đấu', '<span class="pulse-dot"></span>')).join('');
        const nextUp = c.upcoming[0] ? renderSlot(c.upcoming[0], 'Sắp lên sân (Next Up)', '<span class="tag tag-round" style="padding:1px 7px;font-size:10px;">NEXT</span>') : '';
        const queued = c.upcoming.slice(1).map((item) => renderSlot(item, 'Chờ sau đó', '')).join('');
        const emptyNotice = (!liveHtml && !nextUp && !queued)
            ? `<div class="court-slot"><span class="section-sub">Đã hoàn thành toàn bộ ${c.completed.length} trận trên sân này.</span></div>`
            : '';

        return `
            <article class="court-card">
                <div class="court-card-head">
                    <span>${escapeHtml(c.court)}</span>
                    <span class="tag tag-round">${c.live.length} Live · ${c.upcoming.length} Chờ · ${c.completed.length} Xong</span>
                </div>
                ${liveHtml}
                ${nextUp}
                ${queued}
                ${emptyNotice}
            </article>
        `;
    }).join('');

    return `<div class="court-board-grid">${cardsHtml}</div>`;
}

function renderRoundSummaryTable(allMatches, context, activeRound = 'all') {
    if (!allMatches || allMatches.length === 0) return '';
    const { teamsMap, subMatches, config } = context;

    const roundsMap = new Map();
    for (const tm of allMatches) {
        const key = tm.round_name || `Vòng ${tm.round_number || 1}`;
        if (!roundsMap.has(key)) roundsMap.set(key, []);
        roundsMap.get(key).push(tm);
    }

    const rowsHtml = Array.from(roundsMap.entries()).map(([roundName, list]) => {
        const matchupsHtml = list.map((tm) => {
            const tA = teamsMap.get(tm.team_a_id);
            const tB = teamsMap.get(tm.team_b_id);
            const ev = evaluateTeamMatch(tm, subMatches, config);
            const scoreStr = (ev.effectiveStatus === 'completed' || ev.effectiveStatus === 'live')
                ? ` <strong class="tabular">(${ev.subWinsA}-${ev.subWinsB})</strong>`
                : '';
            const liveMark = ev.effectiveStatus === 'live' ? ' <span class="pulse-dot" style="display:inline-block;width:6px;height:6px;vertical-align:middle;"></span>' : '';
            return `<span class="round-pair-chip">${escapeHtml(tA?.code || '?')} vs ${escapeHtml(tB?.code || '?')}${scoreStr}${liveMark}</span>`;
        }).join('');

        const isSelected = activeRound === roundName;
        return `
            <tr class="${isSelected ? 'round-row-active' : ''}">
                <td style="width:128px;">
                    <button type="button" class="round-link-btn" data-action="filter-round-btn" data-round="${escapeHtml(isSelected ? 'all' : roundName)}">
                        ${escapeHtml(roundName)}
                    </button>
                </td>
                <td class="col-left">
                    <div class="round-chip-wrap">${matchupsHtml}</div>
                </td>
            </tr>
        `;
    }).join('');

    return `
        <div class="card">
            <div class="table-wrap">
                <table class="standings-table round-summary-table">
                    <thead>
                        <tr>
                            <th>Vòng</th>
                            <th class="col-left">Các Cuộc Đối Đầu (Team Match)</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
        </div>
    `;
}

export function renderMatchesTab(state, filters, isAdmin) {
    const config = normalizeConfig(state.tournament?.config);
    const teamsMap = new Map((state.teams || []).map((t) => [t.id, t]));
    const pairsMap = new Map((state.teamPairs || []).map((p) => [p.id, p]));
    const context = { teamsMap, pairsMap, subMatches: state.subMatches || [], config };
    const viewMode = filters.view || 'list';
    const queryNorm = normalizeQuery(filters.query || '');

    const allMatches = [...(state.teamMatches || [])].sort((a, b) => {
        if ((a.stage || 'round_robin') !== (b.stage || 'round_robin')) {
            return a.stage === 'playoff' ? 1 : -1;
        }
        if ((a.round_number ?? 1) !== (b.round_number ?? 1)) {
            return (a.round_number ?? 1) - (b.round_number ?? 1);
        }
        return (a.sort_order ?? 1) - (b.sort_order ?? 1);
    });

    const roundOptions = Array.from(new Set(allMatches.map((m) => m.round_name))).filter(Boolean);

    const filtered = allMatches.filter((tm) => {
        const ev = evaluateTeamMatch(tm, state.subMatches, config);
        if (filters.status !== 'all' && ev.effectiveStatus !== filters.status) return false;
        if (filters.round !== 'all' && tm.round_name !== filters.round) return false;
        if (filters.teamId !== 'all' && tm.team_a_id !== filters.teamId && tm.team_b_id !== filters.teamId) return false;

        if (queryNorm) {
            const tA = teamsMap.get(tm.team_a_id);
            const tB = teamsMap.get(tm.team_b_id);
            const haystackParts = [
                tA?.name, tA?.code, tB?.name, tB?.code, tm.court, tm.round_name
            ];
            for (const sm of ev.subMatches) {
                const pA = sm.pair_a_id ? pairsMap.get(sm.pair_a_id) : null;
                const pB = sm.pair_b_id ? pairsMap.get(sm.pair_b_id) : null;
                if (pA) haystackParts.push(pA.pair_label, pA.player_1, pA.player_2);
                if (pB) haystackParts.push(pB.pair_label, pB.player_1, pB.player_2);
            }
            const haystack = normalizeQuery(haystackParts.filter(Boolean).join(' '));
            if (!haystack.includes(queryNorm)) return false;
        }

        return true;
    });

    const teamSelectOptions = (state.teams || [])
        .map((t) => `<option value="${escapeHtml(t.id)}" ${filters.teamId === t.id ? 'selected' : ''}>${escapeHtml(t.name)}</option>`)
        .join('');

    const roundPills = [
        `<button type="button" class="filter-pill ${filters.round === 'all' ? 'active' : ''}" data-action="filter-round-btn" data-round="all">Tất cả vòng</button>`,
        ...roundOptions.map((r) => `<button type="button" class="filter-pill ${filters.round === r ? 'active' : ''}" data-action="filter-round-btn" data-round="${escapeHtml(r)}">${escapeHtml(r)}</button>`)
    ].join('');

    const searchIcon = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';

    return `
        <section class="section-block">
            <div class="section-header">
                <h2 class="section-title">Lịch &amp; Kết Quả</h2>
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                    <div class="pill-group" role="group" aria-label="Chế độ xem">
                        <button type="button" class="filter-pill ${viewMode === 'list' ? 'active' : ''}" data-action="matches-view" data-view="list">Danh sách trận</button>
                        <button type="button" class="filter-pill ${viewMode === 'courts' ? 'active' : ''}" data-action="matches-view" data-view="courts">Điều phối Sân (Next Up)</button>
                    </div>
                </div>
            </div>

            ${viewMode === 'courts'
                ? renderCourtBoardView(state, context, isAdmin)
                : `
                    <div class="filter-bar">
                        <div class="pill-group" role="group" aria-label="Lọc theo vòng">
                            ${roundPills}
                        </div>

                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                            <div class="search-input-wrap">
                                ${searchIcon}
                                <input id="matches-search-input" type="search" class="search-input" data-action="filter-query" value="${escapeHtml(filters.query || '')}" placeholder="Tìm tên VĐV, cặp, đội...">
                            </div>

                            <div class="pill-group" role="group" aria-label="Lọc theo trạng thái">
                                <button type="button" class="filter-pill ${filters.status === 'all' ? 'active' : ''}" data-action="filter-status" data-value="all">Tất cả</button>
                                <button type="button" class="filter-pill ${filters.status === 'live' ? 'active' : ''}" data-action="filter-status" data-value="live">Live</button>
                                <button type="button" class="filter-pill ${filters.status === 'completed' ? 'active' : ''}" data-action="filter-status" data-value="completed">Đã xong</button>
                                <button type="button" class="filter-pill ${filters.status === 'upcoming' ? 'active' : ''}" data-action="filter-status" data-value="upcoming">Sắp đấu</button>
                            </div>

                            <select class="select-clean" data-action="filter-team" aria-label="Lọc theo đội">
                                <option value="all">Mọi đội</option>
                                ${teamSelectOptions}
                            </select>
                        </div>
                    </div>

                    ${filtered.length > 0
                        ? `<div class="matches-stack">${filtered.map((tm) => renderTeamMatchCard(tm, context, isAdmin, { liveOnly: filters.status === 'live' })).join('')}</div>`
                        : `<div class="card card-pad" style="text-align:center;color:var(--muted);">Không có trận đấu nào khớp tìm kiếm hoặc bộ lọc hiện tại.</div>`
                    }
                `
            }
        </section>
    `;
}

export function renderTeamsTab(state, query = '') {
    const config = normalizeConfig(state.tournament?.config);
    const standings = calculateStandings(state.teams, state.teamMatches, state.subMatches, config);
    const rankMap = new Map(standings.map((r) => [r.team.id, r]));
    const pairStats = calculatePairStats(state.teamPairs, state.teamMatches, state.subMatches, config);
    const queryNorm = normalizeQuery(query);

    const sortedTeams = [...(state.teams || [])]
        .sort((a, b) => (a.seed_order ?? 0) - (b.seed_order ?? 0))
        .filter((team) => {
            if (!queryNorm) return true;
            const teamPairs = (state.teamPairs || []).filter((p) => p.team_id === team.id);
            const hay = normalizeQuery([
                team.name, team.code,
                ...teamPairs.flatMap((p) => [p.pair_label, p.player_1, p.player_2])
            ].join(' '));
            return hay.includes(queryNorm);
        });

    const cardsHtml = sortedTeams.map((team) => {
        const standing = rankMap.get(team.id);
        const teamPairs = (state.teamPairs || [])
            .filter((p) => p.team_id === team.id)
            .sort((a, b) => a.level_index - b.level_index);

        const pairsHtml = teamPairs.map((pair) => {
            const pStat = pairStats.get(pair.id) || { wins: 0, losses: 0, pointDiff: 0 };
            const levelLabel = config.levelNames[pair.level_index - 1] || `Level ${pair.level_index}`;
            const players = `${pair.player_1 || ''}${pair.player_2 ? ` & ${pair.player_2}` : ''}`.trim() || 'Chưa cập nhật VĐV';

            return `
                <div class="lineup-item">
                    <div>
                        <div class="lineup-level">${escapeHtml(levelLabel)} · ${escapeHtml(pair.pair_label)}</div>
                        <div class="lineup-names">${escapeHtml(players)}</div>
                    </div>
                    <div class="lineup-stat tabular">
                        <span>${pStat.wins}W-${pStat.losses}L</span>
                        <span class="sub-caption">HS ${formatSigned(pStat.pointDiff)}</span>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <article class="team-card">
                <div class="team-card-head">
                    <div style="display:flex;align-items:center;gap:10px;min-width:0;">
                        <span class="team-code-dot" style="background:${escapeHtml(team.color)}">${escapeHtml(team.code)}</span>
                        <h3 class="team-card-title">${escapeHtml(team.name)}</h3>
                    </div>
                    <span class="team-card-rank">#${standing?.rank ?? '-'} · ${standing?.teamMatchWins ?? 0}W-${standing?.teamMatchLosses ?? 0}L</span>
                </div>
                <div class="lineup-list">
                    ${pairsHtml}
                </div>
            </article>
        `;
    }).join('');

    const searchIcon = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';

    return `
        <section class="section-block">
            <div class="section-header">
                <div>
                    <h2 class="section-title">Đội Hình Cố Định (Fixed Lineup)</h2>
                    <div class="section-sub">${(state.teams || []).length} đội · ${config.levelsCount} cặp cố định/đội</div>
                </div>
                <div class="search-input-wrap">
                    ${searchIcon}
                    <input id="teams-search-input" type="search" class="search-input" data-action="filter-query" value="${escapeHtml(query)}" placeholder="Tìm VĐV hoặc tên đội...">
                </div>
            </div>
            <div class="teams-grid">
                ${cardsHtml || '<div class="card card-pad">Không tìm thấy đội hoặc VĐV phù hợp.</div>'}
            </div>
        </section>
    `;
}

export function renderRulesTab(state) {
    const config = normalizeConfig(state.tournament?.config);
    const teams = [...(state.teams || [])].sort((a, b) => (a.seed_order ?? 0) - (b.seed_order ?? 0));
    const teamsMap = new Map(teams.map((t) => [t.id, t]));
    const teamCount = teams.length;
    const totalPairs = (state.teamPairs || []).length;
    const rrRounds = teamCount >= 2 ? (teamCount % 2 === 0 ? teamCount - 1 : teamCount) * (config.doubleRoundRobin ? 2 : 1) : 0;
    const majorityNeed = Math.floor(config.levelsCount / 2) + 1;

    const rrMatches = (state.teamMatches || [])
        .filter((m) => (m.stage || 'round_robin') === 'round_robin')
        .sort((a, b) => (a.round_number ?? 1) - (b.round_number ?? 1) || (a.sort_order ?? 1) - (b.sort_order ?? 1));

    const rrRoundsHtml = renderRoundSummaryTable(rrMatches, {
        teamsMap,
        subMatches: state.subMatches || [],
        config
    });

    return `
        <section class="section-block">
            <div class="section-header">
                <h2 class="section-title">Thể Thức Team League — Fixed Lineup</h2>
                <span class="section-sub">Rõ ràng, công bằng và đề cao tinh thần đồng đội</span>
            </div>

            <div class="rules-summary-banner">
                <div>
                    <div class="section-sub" style="text-transform:uppercase;letter-spacing:0.8px;font-weight:700;color:var(--primary);">Quy mô giải đấu</div>
                    <strong>${totalPairs} cặp &rarr; ${teamCount} đội &rarr; ${config.levelsCount} cặp/đội</strong>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <span class="tag tag-round">Vòng tròn ${config.doubleRoundRobin ? '2 lượt' : '1 lượt'} (${rrRounds} vòng)</span>
                    <span class="tag tag-playoff">Best of ${config.bestOf} · ${config.pointsPerSet} điểm</span>
                </div>
            </div>

            <div class="rules-cards-grid">
                <article class="rule-step-card">
                    <div class="rule-step-head">
                        <span class="rule-step-badge">01</span>
                        <h3>Chia đội &amp; Đội hình cố định</h3>
                    </div>
                    <ul>
                        <li>Toàn giải có <strong>${teamCount} đội</strong> (${escapeHtml(teams.map((t) => t.code).join(', '))}).</li>
                        <li>Mỗi đội gồm <strong>${config.levelsCount} cặp cố định</strong>: ${escapeHtml(config.levelNames.join(', '))}.</li>
                        <li><strong>Fixed Lineup:</strong> cặp VĐV giữ nguyên từ đầu đến cuối giải, không đổi người giữa các vòng.</li>
                    </ul>
                </article>

                <article class="rule-step-card">
                    <div class="rule-step-head">
                        <span class="rule-step-badge">02</span>
                        <h3>Thi đấu Team Match &amp; Tính Set</h3>
                    </div>
                    <ul>
                        <li>Mỗi cuộc đối đầu gồm <strong>${config.levelsCount} trận cặp</strong> ngang trình độ (Level 1 vs 1, Level 2 vs 2...).</li>
                        <li>Mỗi trận đánh <strong>Best of ${config.bestOf}</strong>, mỗi Set chạm <strong>${config.pointsPerSet} điểm</strong>${config.winByTwo ? ', cách biệt 2 điểm' : ''}${config.pointCap > 0 ? ` (trần ${config.pointCap})` : ''}.</li>
                        <li>Thắng tối thiểu <strong>${majorityNeed}/${config.levelsCount}</strong> trận cặp sẽ thắng Team Match (VD: 2&ndash;1).</li>
                    </ul>
                </article>

                <article class="rule-step-card">
                    <div class="rule-step-head">
                        <span class="rule-step-badge">03</span>
                        <h3>Thứ tự xếp hạng đội</h3>
                    </div>
                    <ol>
                        <li><strong>Số Team Match thắng</strong> (số lần thắng đối đầu)</li>
                        <li><strong>Tổng số trận cặp thắng</strong> (cả ${config.levelsCount} cặp đều quan trọng)</li>
                        <li><strong>Hiệu số điểm</strong> (Điểm ghi &minus; Điểm thua qua các Set)</li>
                    </ol>
                </article>
            </div>

            ${rrMatches.length > 0 ? `<div style="margin-top:28px;"><div class="section-header"><h3 class="section-title">Lịch Thi Đấu Vòng Tròn (${rrRounds} vòng)</h3><span class="section-sub">Nhấn tên vòng để xem chi tiết từng Set</span></div>${rrRoundsHtml}</div>` : ''}
        </section>
    `;
}

export function renderTvModeView(state) {
    const config = normalizeConfig(state.tournament?.config);
    const teamsMap = new Map((state.teams || []).map((t) => [t.id, t]));
    const pairsMap = new Map((state.teamPairs || []).map((p) => [p.id, p]));
    const context = { teamsMap, pairsMap, subMatches: state.subMatches || [], config };

    const liveMatches = (state.teamMatches || []).filter((tm) => {
        const ev = evaluateTeamMatch(tm, state.subMatches, config);
        return ev.effectiveStatus === 'live';
    });

    const standingsHtml = renderStandingsTab(state, false);
    const liveCardsHtml = liveMatches.length > 0
        ? liveMatches.map((tm) => renderTeamMatchCard(tm, context, false, { liveOnly: true })).join('')
        : '<div class="card card-pad" style="text-align:center;color:var(--muted);">Hiện chưa có sân nào đang thi đấu LIVE.</div>';

    return `
        <section>
            <div class="tv-topbar">
                <div>
                    <div style="font-size:12px;opacity:0.75;text-transform:uppercase;letter-spacing:1.2px;font-weight:700;">Bảng Điểm Sân Đấu (TV Mode)</div>
                    <div style="font-size:22px;font-weight:900;">${escapeHtml(state.tournament.name)}</div>
                </div>
                <button type="button" class="smallbtn" style="background:#ffffff;color:var(--ink);border-color:#ffffff;" data-action="toggle-tv-mode">Thoát TV Mode</button>
            </div>

            <div class="tv-grid">
                <div>
                    <div class="section-header">
                        <h2 class="section-title"><span class="pulse-dot"></span>Đang Thi Đấu (${liveMatches.length} Sân)</h2>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:14px;">
                        ${liveCardsHtml}
                    </div>
                </div>
                <div>
                    ${standingsHtml}
                </div>
            </div>
        </section>
    `;
}

export function renderTeamDetailModal(teamId, state) {
    const config = normalizeConfig(state.tournament?.config);
    const team = (state.teams || []).find((t) => t.id === teamId);
    if (!team) return '';

    const standings = calculateStandings(state.teams, state.teamMatches, state.subMatches, config);
    const standing = standings.find((r) => r.team.id === teamId);
    const pairStats = calculatePairStats(state.teamPairs, state.teamMatches, state.subMatches, config);
    const teamsMap = new Map((state.teams || []).map((t) => [t.id, t]));

    const pairs = (state.teamPairs || [])
        .filter((p) => p.team_id === teamId)
        .sort((a, b) => a.level_index - b.level_index);

    const matches = (state.teamMatches || [])
        .filter((tm) => tm.team_a_id === teamId || tm.team_b_id === teamId)
        .sort((a, b) => (a.round_number ?? 1) - (b.round_number ?? 1));

    const pairsHtml = pairs.map((p) => {
        const st = pairStats.get(p.id) || { wins: 0, losses: 0, pointDiff: 0 };
        const lvl = config.levelNames[p.level_index - 1] || `Level ${p.level_index}`;
        const players = `${p.player_1 || ''}${p.player_2 ? ` & ${p.player_2}` : ''}`.trim();
        return `
            <div class="lineup-item">
                <div>
                    <div class="lineup-level">${escapeHtml(lvl)} · ${escapeHtml(p.pair_label)}</div>
                    <div class="lineup-names">${escapeHtml(players || 'Chưa nhập tên')}</div>
                </div>
                <div class="lineup-stat tabular">${st.wins}W-${st.losses}L · HS ${formatSigned(st.pointDiff)}</div>
            </div>
        `;
    }).join('');

    const matchesHtml = matches.map((tm) => {
        const ev = evaluateTeamMatch(tm, state.subMatches, config);
        const isA = tm.team_a_id === teamId;
        const opp = teamsMap.get(isA ? tm.team_b_id : tm.team_a_id);
        const myWins = isA ? ev.subWinsA : ev.subWinsB;
        const oppWins = isA ? ev.subWinsB : ev.subWinsA;
        const won = (isA && ev.winner === 'A') || (!isA && ev.winner === 'B');
        const lost = (isA && ev.winner === 'B') || (!isA && ev.winner === 'A');
        const badge = ev.effectiveStatus === 'completed'
            ? (won ? '<span class="tag tag-status-completed">Thắng</span>' : (lost ? '<span class="tag tag-status-live">Thua</span>' : '<span class="tag tag-round">Hòa</span>'))
            : getStatusBadgeHtml(ev.effectiveStatus);

        return `
            <div class="lineup-item">
                <div>
                    <div class="lineup-level">${escapeHtml(tm.round_name)} ${tm.court ? `· ${escapeHtml(tm.court)}` : ''}</div>
                    <div class="lineup-names">vs ${escapeHtml(opp?.name || 'TBD')}</div>
                </div>
                <div style="display:flex;align-items:center;gap:10px;">
                    <strong class="tabular" style="font-size:18px;">${myWins} : ${oppWins}</strong>
                    ${badge}
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="modal-backdrop" data-action="close-modal">
            <div class="modal-card wide" onclick="event.stopPropagation()">
                <div class="modal-header" style="background:var(--tint);">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span class="team-code-dot" style="background:${escapeHtml(team.color)}">${escapeHtml(team.code)}</span>
                        <div>
                            <h3 class="modal-title">${escapeHtml(team.name)}</h3>
                            <div class="section-sub">Hạng #${standing?.rank ?? '-'} · ${standing?.teamMatchWins ?? 0} Team Match thắng</div>
                        </div>
                    </div>
                    <button type="button" class="modal-close" data-action="close-modal" aria-label="Đóng">✕</button>
                </div>
                <div class="modal-body">
                    <h4 style="margin:0 0 6px;font-size:12.5px;text-transform:uppercase;letter-spacing:0.8px;color:var(--accent);">Đội hình cố định</h4>
                    <div style="margin-bottom:20px;">
                        ${pairsHtml}
                    </div>

                    <h4 style="margin:0 0 6px;font-size:12.5px;text-transform:uppercase;letter-spacing:0.8px;color:var(--accent);">Lịch sử &amp; Lịch đối đầu</h4>
                    <div>
                        ${matchesHtml || '<div class="section-sub">Chưa có trận đấu.</div>'}
                    </div>
                </div>
            </div>
        </div>
    `;
}
