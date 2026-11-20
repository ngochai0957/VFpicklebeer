import {
    SKILL_LEVEL_OPTIONS,
    anonymizeAwardsLeaderboards,
    calculatePairLeaderboard,
    calculatePairStats,
    calculatePlayerLeaderboard,
    calculateStandings,
    escapeHtml,
    evaluateSubMatch,
    evaluateTeamMatch,
    formatScheduleRaw,
    getSubMatchDisplayOrder,
    getSubMatchStatusRank,
    getTeamMatchCourts,
    normalizeConfig,
    normalizeSetPlayerStats,
    normalizeSetRallyLogs,
    resolveSubMatchSchedule,
    summarizeSetRallyLog
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

    const matchCourts = getTeamMatchCourts(visibleSubs.length > 0 ? visibleSubs : evalTm.subMatches, tm);
    const isMultiCourt = matchCourts.length > 1;
    const headerCourtText = matchCourts.join(' · ');
    const headerSchedText = formatScheduleRaw(tm.scheduled_time);

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

        const sched = resolveSubMatchSchedule(sm, tm);
        const subMetaParts = [];
        if (isMultiCourt || sched.hasCustomCourt) {
            if (sched.court) subMetaParts.push(sched.court);
        }
        if (sched.hasCustomTime && sched.time) {
            subMetaParts.push(sched.time);
        }
        const subSchedulePillHtml = subMetaParts.length > 0
            ? `<span class="ppa-court-pill">${escapeHtml(subMetaParts.join(' · '))}</span>`
            : '';

        const pairALabel = pairA?.pair_label || `${teamA.code}${sm.level_index}`;
        const pairBLabel = pairB?.pair_label || `${teamB.code}${sm.level_index}`;
        const pairAText = pairA
            ? `${pairA.player_1 || ''}${pairA.player_2 ? ` / ${pairA.player_2}` : ''}`.trim()
            : pairALabel;
        const pairBText = pairB
            ? `${pairB.player_1 || ''}${pairB.player_2 ? ` / ${pairB.player_2}` : ''}`.trim()
            : pairBLabel;
        const lvlTier = Math.max(1, Math.min(4, Number(sm.level_index) || 1));

        if (isSubReady || isSubUpcoming) {
            const stateBadge = isSubReady
                ? '<span class="ppa-status-pill ready">⏳ Sắp đấu</span>'
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
                <div class="ppa-sub-card ${isSubReady ? 'is-ready' : 'is-upcoming'} lv-${lvlTier}">
                    <div class="ppa-sub-head">
                        <span class="ppa-sub-division"><span class="ppa-level-chip lv-${lvlTier}">${escapeHtml(levelLabel)}</span> · Mixed Doubles</span>
                        <div class="ppa-sub-meta">
                            ${subSchedulePillHtml}
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
        const firstLiveSetIdx = isSubLive ? sets.findIndex((s) => !s?.winner) : -1;
        const setHeadersHtml = Array.from({ length: setCount }, (_, i) => {
            const setObj = sets[i];
            const cls = setObj?.winner
                ? 'is-done'
                : (isSubLive && i === firstLiveSetIdx ? 'is-live' : 'is-wait');
            return `<div class="ppa-col-th ${cls}">Set ${i + 1}</div>`;
        }).join('');
        const statusBadge = isSubLive
            ? '<span class="ppa-status-pill live"><span class="pulse-dot"></span>LIVE</span>'
            : '<span class="ppa-status-pill final">FINAL</span>';

        const rallyLogs = normalizeSetRallyLogs(sm.format_override?.setRallyLogs, Math.max(1, sets.length));
        const totalLogs = rallyLogs.reduce((sum, arr) => sum + arr.length, 0);
        const setStats = normalizeSetPlayerStats(sm.format_override?.setPlayerStats, Math.max(1, sets.length));
        const hasRecordedStats = setStats.some((row) => ['a1', 'a2', 'b1', 'b2'].some((k) => row[k].points > 0 || row[k].errors > 0));
        const detailBtnHtml = (totalLogs > 0 || hasRecordedStats)
            ? `<button type="button" class="ppa-detail-btn" data-action="view-set-history" data-sub-id="${escapeHtml(sm.id)}" data-set-idx="0" title="Xem chi tiết diễn biến từng lượt thi đấu">Chi tiết${totalLogs > 0 ? ` (${totalLogs})` : ''}</button>`
            : '';

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
            <div class="ppa-sub-card ${isSubLive ? 'is-live' : ''} ${isSubCompleted ? 'is-completed' : ''} lv-${lvlTier}">
                <div class="ppa-sub-head">
                    <span class="ppa-sub-division"><span class="ppa-level-chip lv-${lvlTier}">${escapeHtml(levelLabel)}</span> · Mixed Doubles</span>
                    <div class="ppa-sub-meta">
                        ${subSchedulePillHtml}
                        <span class="ppa-bo-tag">${boLabel}</span>
                        ${statusBadge}
                        ${detailBtnHtml}
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
                    ${headerCourtText ? `<span>${escapeHtml(headerCourtText)}</span>` : ''}
                    ${headerSchedText ? `<span>· ${escapeHtml(headerSchedText)}</span>` : ''}
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

        const courtText = getTeamMatchCourts(evalTm.subMatches, tm).join(' · ');
        const schedText = formatScheduleRaw(tm.scheduled_time);

        return `
            <article class="live-mini-card">
                <div class="live-mini-top">
                    <span>${escapeHtml(tm.round_name)}${courtText ? ` · ${escapeHtml(courtText)}` : ''}${schedText ? ` · ${escapeHtml(schedText)}` : ''}</span>
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

export function renderStandingsTab(state, isAdmin, maskSeed = null) {
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

    const showAwardsPreview = isAdmin || config.awardsVisibility !== 'hidden';
    let awardsPreview = '';
    if (showAwardsPreview) {
        let previewPairs = calculatePairLeaderboard(state.teams, state.teamPairs, state.teamMatches, state.subMatches, config);
        let previewPlayerStats = calculatePlayerLeaderboard(state.teams, state.teamPairs, state.teamMatches, state.subMatches, config);
        if (!isAdmin && config.awardsVisibility === 'anonymous') {
            const resolvedSeed = Number.isFinite(Number(maskSeed)) && Number(maskSeed) >= 1
                ? Math.floor(Number(maskSeed))
                : config.awardsMaskSeed;
            const masked = anonymizeAwardsLeaderboards(previewPairs, previewPlayerStats, resolvedSeed);
            previewPairs = masked.pairRows;
            previewPlayerStats = masked.playerBoard;
        }
        const pairTop = previewPairs[0];
        const scorerTop = previewPlayerStats.byPoints[0];
        const errorTop = previewPlayerStats.byErrors[0];
        awardsPreview = renderAwardsCardsHtml(pairTop, scorerTop, errorTop, true);
    }

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
            ${awardsPreview}
        </section>
    `;
}

function renderTeamMetaHtml(team, labelText, isTable = false) {
    if (team?.id === 'anon') {
        return '<span class="team-code-dot sm" style="background:#64748b">?</span>';
    }
    if (isTable) {
        return `
            <div class="table-team-cell">
                <span class="team-code-dot sm" style="background:${escapeHtml(team.color)}">${escapeHtml(team.code)}</span>
                <span>${escapeHtml(labelText)}</span>
            </div>
        `;
    }
    return `
        <span class="team-code-dot sm" style="background:${escapeHtml(team.color)}">${escapeHtml(team.code)}</span>
        <span>${escapeHtml(labelText)}</span>
    `;
}

function renderAwardsCardsHtml(pairTop, scorerTop, errorTop, includeHeader = false) {
    const pairContent = pairTop && pairTop.played > 0
        ? `
            <div class="award-winner-name">${escapeHtml(pairTop.playersText)}</div>
            <div class="award-meta">
                ${renderTeamMetaHtml(pairTop.team, `${pairTop.team.name} · ${pairTop.levelName}`)}
            </div>
            <div class="award-stat-row tabular">
                <strong>${pairTop.wins} thắng - ${pairTop.losses} thua</strong>
                <span>HS ${formatSigned(pairTop.pointDiff)} (${pairTop.pointsFor}:${pairTop.pointsAgainst})</span>
            </div>
        `
        : '<div class="section-sub">Chưa có cặp đấu nào hoàn thành.</div>';

    const scorerContent = scorerTop && scorerTop.totalPoints > 0
        ? `
            <div class="award-winner-name">${escapeHtml(scorerTop.name)}</div>
            <div class="award-meta">
                ${renderTeamMetaHtml(scorerTop.team, `${scorerTop.team.name} (${scorerTop.pairLabel || '-'})`)}
            </div>
            <div class="award-stat-row tabular">
                <strong>${scorerTop.totalPoints} điểm</strong>
                <span>${scorerTop.matchesPlayed} trận · TB ${scorerTop.avgPoints}đ/trận</span>
            </div>
        `
        : '<div class="section-sub">Chưa có điểm cá nhân nào được ghi nhận.</div>';

    const errorContent = errorTop && errorTop.totalErrors > 0
        ? `
            <div class="award-winner-name">${escapeHtml(errorTop.name)}</div>
            <div class="award-meta">
                ${renderTeamMetaHtml(errorTop.team, `${errorTop.team.name} (${errorTop.pairLabel || '-'})`)}
            </div>
            <div class="award-stat-row tabular">
                <strong>${errorTop.totalErrors} lần Out/Lưới</strong>
                <span>${errorTop.matchesPlayed} trận · TB ${errorTop.avgErrors}/trận</span>
            </div>
        `
        : '<div class="section-sub">Chưa có thống kê đánh Out / rúc lưới.</div>';

    const headHtml = includeHeader
        ? `
            <div class="section-header" style="margin-top:34px;">
                <div>
                    <h2 class="section-title">Bảng Vinh Danh &amp; Thống Kê Cá Nhân</h2>
                    <span class="section-sub">Tổng hợp tất cả các trận · Vinh danh thành tích cuối giải</span>
                </div>
                <button type="button" class="link-btn" data-action="switch-tab" data-tab="awards">Xem Bảng Point &amp; Chi tiết &rarr;</button>
            </div>
        `
        : '';

    return `
        ${headHtml}
        <div class="awards-cards-grid">
            <article class="award-card award-pair">
                <div class="award-kicker">Cặp Đôi Ăn Ý</div>
                <div class="award-criteria">Thắng nhiều nhất &rarr; Hiệu số điểm</div>
                ${pairContent}
            </article>
            <article class="award-card award-scorer">
                <div class="award-kicker">Cá Nhân Ghi Nhiều Điểm Nhất</div>
                <div class="award-criteria">Tính tất cả điểm VĐV ghi (bất kể Team thắng/thua)</div>
                ${scorerContent}
            </article>
            <article class="award-card award-error">
                <div class="award-kicker">Thống Kê Đánh Out / Lưới</div>
                <div class="award-criteria">Tổng bóng đánh Out &amp; không qua lưới</div>
                ${errorContent}
            </article>
        </div>
    `;
}

export function renderAwardsTab(state, filters = {}, isAdmin = false, maskSeed = null) {
    const config = normalizeConfig(state.tournament?.config);
    const awardsMode = config.awardsVisibility || 'public';

    if (!isAdmin && awardsMode === 'hidden') {
        return `
            <section class="section-block">
                <div class="card anon-locked-card">
                    <div class="anon-locked-icon">🔒</div>
                    <h2 class="section-title" style="margin:0 0 8px;">Bảng Vinh Danh &amp; Point Cá Nhân đang tạm ẩn</h2>
                    <p class="section-sub" style="margin:0;">Ban tổ chức đang tạm thời ẩn danh sách cặp đôi và điểm cá nhân. Bạn vẫn có thể theo dõi Bảng Xếp Hạng Đội, Lịch &amp; Kết Quả và Đội Hình bình thường.</p>
                </div>
            </section>
        `;
    }

    const teams = [...(state.teams || [])].sort((a, b) => (a.seed_order ?? 0) - (b.seed_order ?? 0));
    const rawPairRows = calculatePairLeaderboard(state.teams, state.teamPairs, state.teamMatches, state.subMatches, config);
    const rawPlayerBoard = calculatePlayerLeaderboard(state.teams, state.teamPairs, state.teamMatches, state.subMatches, config);

    const isAnonView = !isAdmin && awardsMode === 'anonymous';
    const resolvedSeed = Number.isFinite(Number(maskSeed)) && Number(maskSeed) >= 1
        ? Math.floor(Number(maskSeed))
        : config.awardsMaskSeed;
    const maskedData = isAnonView
        ? anonymizeAwardsLeaderboards(rawPairRows, rawPlayerBoard, resolvedSeed)
        : null;
    const pairRowsAll = maskedData ? maskedData.pairRows : rawPairRows;
    const playerBoard = maskedData ? maskedData.playerBoard : rawPlayerBoard;

    const teamFilter = isAnonView ? 'all' : (filters.teamId || 'all');
    const queryNorm = normalizeQuery(filters.query || '');

    const filterPair = (r) => {
        if (teamFilter !== 'all' && r.team.id !== teamFilter) return false;
        if (queryNorm) {
            const hay = normalizeQuery(`${r.playersText} ${r.pair.pair_label} ${r.team.name} ${r.levelName}`);
            if (!hay.includes(queryNorm)) return false;
        }
        return true;
    };
    const filterPlayer = (p) => {
        if (teamFilter !== 'all' && p.team.id !== teamFilter) return false;
        if (queryNorm) {
            const hay = normalizeQuery(`${p.name} ${p.pairLabel} ${p.team.name}`);
            if (!hay.includes(queryNorm)) return false;
        }
        return true;
    };

    const filteredPairs = isAnonView ? pairRowsAll : pairRowsAll.filter(filterPair);
    const filteredPoints = isAnonView ? playerBoard.byPoints : playerBoard.byPoints.filter(filterPlayer);
    const filteredErrors = isAnonView ? playerBoard.byErrors : playerBoard.byErrors.filter(filterPlayer);
    const teamColClassAttr = isAnonView ? '' : ' class="col-left"';

    const pairTableRows = filteredPairs.map((r) => {
        const diffCls = r.pointDiff > 0 ? 'diff-pos' : (r.pointDiff < 0 ? 'diff-neg' : 'diff-zero');
        const winnerBadge = r.rank === 1 && r.played > 0 ? '<span class="award-inline-badge">Cặp đôi ăn ý #1</span>' : '';
        return `
            <tr>
                <td><span class="rank-pill ${r.rank <= 3 ? `rank-${r.rank}` : ''}">${r.rank}</span></td>
                <td class="col-left">
                    <div class="table-pair-cell"><strong>${escapeHtml(r.playersText)}</strong>${winnerBadge}</div>
                </td>
                <td${teamColClassAttr}>
                    ${renderTeamMetaHtml(r.team, `${r.team.name} · ${r.levelName}`, true)}
                </td>
                <td class="tabular">${r.played}</td>
                <td class="tabular"><strong>${r.wins}W</strong> - ${r.losses}L</td>
                <td class="tabular">${r.setsWon} - ${r.setsLost}</td>
                <td class="tabular">${r.pointsFor} : ${r.pointsAgainst}</td>
                <td class="tabular"><span class="${diffCls}">${formatSigned(r.pointDiff)}</span></td>
            </tr>
        `;
    }).join('');

    const buildMatchChipsHtml = (logs, metricKey) => {
        if (!logs || logs.length === 0) return '<span class="section-sub">Chưa thi đấu</span>';
        return logs.map((log) => {
            const val = log[metricKey];
            const cls = metricKey === 'points' ? 'pts' : 'errs';
            const prefix = metricKey === 'points' ? `+${val}đ` : `${val} lỗi`;
            const titleText = log.scoreSummary ? `${log.roundName} (${log.scoreSummary})` : log.roundName;
            const labelText = log.opponentLabel ? `${log.roundName} vs ${log.opponentLabel}:` : `${log.roundName}:`;
            return `
                <span class="match-log-pill ${cls}" title="${escapeHtml(titleText)}">
                    <span>${escapeHtml(labelText)}</span>
                    <strong>${prefix}</strong>
                </span>
            `;
        }).join('');
    };

    const pointsRows = filteredPoints.map((p) => {
        const badge = p.rank === 1 && p.totalPoints > 0 ? '<span class="award-inline-badge pts">Top Scorer</span>' : '';
        const detailCol = isAnonView
            ? ''
            : `<td class="col-left match-log-cell"><div class="match-log-list">${buildMatchChipsHtml(p.matchLogs, 'points')}</div></td>`;
        return `
            <tr>
                <td><span class="rank-pill ${p.rank <= 3 ? `rank-${p.rank}` : ''}">${p.rank}</span></td>
                <td class="col-left"><div class="table-pair-cell"><strong>${escapeHtml(p.name)}</strong>${badge}</div></td>
                <td${teamColClassAttr}>
                    ${renderTeamMetaHtml(p.team, `${p.team.code} · ${p.pairLabel || '-'}`, true)}
                </td>
                <td class="tabular">${p.matchesPlayed}</td>
                <td class="tabular"><span class="stat-highlight">${p.totalPoints}</span></td>
                <td class="tabular">${p.avgPoints}</td>
                ${detailCol}
            </tr>
        `;
    }).join('');

    const errorsRows = filteredErrors.map((p) => {
        const badge = p.rank === 1 && p.totalErrors > 0 ? '<span class="award-inline-badge errs">Nhiều Out nhất</span>' : '';
        const detailCol = isAnonView
            ? ''
            : `<td class="col-left match-log-cell"><div class="match-log-list">${buildMatchChipsHtml(p.matchLogs, 'errors')}</div></td>`;
        return `
            <tr>
                <td><span class="rank-pill ${p.rank === 1 ? 'rank-err' : ''}">${p.rank}</span></td>
                <td class="col-left"><div class="table-pair-cell"><strong>${escapeHtml(p.name)}</strong>${badge}</div></td>
                <td${teamColClassAttr}>
                    ${renderTeamMetaHtml(p.team, `${p.team.code} · ${p.pairLabel || '-'}`, true)}
                </td>
                <td class="tabular">${p.matchesPlayed}</td>
                <td class="tabular"><strong style="color:var(--crimson);font-size:16px;">${p.totalErrors}</strong></td>
                <td class="tabular">${p.avgErrors}</td>
                ${detailCol}
            </tr>
        `;
    }).join('');

    const teamSelectOptions = teams
        .map((t) => `<option value="${escapeHtml(t.id)}" ${teamFilter === t.id ? 'selected' : ''}>${escapeHtml(t.name)}</option>`)
        .join('');
    const searchIcon = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';

    const adminControlsBar = isAdmin
        ? `
            <div class="admin-awards-bar">
                <div class="admin-awards-status">
                    <strong>Chế độ hiển thị công khai (Người xem):</strong>
                    <span>${awardsMode === 'public'
            ? '👁 Đang công khai tên thật.'
            : (awardsMode === 'anonymous'
                ? '🕶 Đang ẩn danh bằng mã 3 số (tự random mới mỗi lần người xem mở trang; Admin vẫn thấy tên thật).'
                : '🔒 Đang ẩn hoàn toàn khỏi người xem (chỉ Admin xem được trang này).')}</span>
                </div>
                <div class="admin-awards-actions">
                    <button type="button" class="mode-pill-btn ${awardsMode === 'public' ? 'active' : ''}" data-action="set-awards-visibility" data-visibility="public">👁 Công khai</button>
                    <button type="button" class="mode-pill-btn ${awardsMode === 'anonymous' ? 'active' : ''}" data-action="set-awards-visibility" data-visibility="anonymous">🕶 Ẩn danh tên</button>
                    <button type="button" class="mode-pill-btn ${awardsMode === 'hidden' ? 'active' : ''}" data-action="set-awards-visibility" data-visibility="hidden">🔒 Ẩn hoàn toàn</button>
                </div>
            </div>
        `
        : '';

    const filterOrNoticeBar = isAnonView
        ? ''
        : `
            <div class="filter-bar" style="margin-top:22px;">
                <div class="search-input-wrap">
                    ${searchIcon}
                    <input id="awards-search-input" type="search" class="search-input" data-action="awards-filter-query" value="${escapeHtml(filters.query || '')}" placeholder="Tìm tên VĐV, cặp đấu, đội...">
                </div>
                <select class="select-clean" data-action="awards-filter-team" aria-label="Lọc theo đội">
                    <option value="all">Mọi đội</option>
                    ${teamSelectOptions}
                </select>
            </div>
        `;

    const detailHeadPoints = isAnonView ? '' : '<th class="col-left">Chi Tiết Điểm Sau Mỗi Trận</th>';
    const detailHeadErrors = isAnonView ? '' : '<th class="col-left">Chi Tiết Từng Trận</th>';
    const playerTableColspan = isAnonView ? '6' : '7';

    return `
        <section class="section-block">
            <div class="section-header">
                <div>
                    <h2 class="section-title">Bảng Vinh Danh &amp; Point Cá Nhân</h2>
                    <span class="section-sub">Tổng hợp tất cả các trận trong giải (vòng tròn + playoff) · Vinh danh thành tích cuối giải</span>
                </div>
            </div>

            ${adminControlsBar}

            ${renderAwardsCardsHtml(pairRowsAll[0], playerBoard.byPoints[0], playerBoard.byErrors[0], false)}

            ${filterOrNoticeBar}

            <div class="section-header" style="margin-top:18px;">
                <h3 class="section-title" style="font-size:19px;">1. BXH Cặp Đôi Ăn Ý</h3>
                <span class="section-sub">Xếp hạng: Trận cặp thắng &rarr; Hiệu số điểm &rarr; Hiệu số Set</span>
            </div>
            <div class="card">
                <div class="table-wrap">
                    <table class="standings-table">
                        <thead>
                            <tr>
                                <th style="width:54px;">#</th>
                                <th class="col-left">Cặp Đôi</th>
                                <th${teamColClassAttr}>Đội &amp; Level</th>
                                <th>Đã đấu</th>
                                <th>Thắng - Thua</th>
                                <th>Set</th>
                                <th>Điểm (Ghi:Thua)</th>
                                <th>HS Điểm</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${pairTableRows || '<tr><td colspan="8" style="padding:24px;color:var(--muted);">Chưa có dữ liệu cặp đấu.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="section-header" style="margin-top:28px;">
                <h3 class="section-title" style="font-size:19px;">2. Bảng Point Cá Nhân</h3>
                <span class="section-sub">Tính mọi điểm VĐV ghi trực tiếp, bất kể đội thắng hay thua</span>
            </div>
            <div class="card">
                <div class="table-wrap">
                    <table class="standings-table">
                        <thead>
                            <tr>
                                <th style="width:54px;">#</th>
                                <th class="col-left">VĐV</th>
                                <th${teamColClassAttr}>Đội · Cặp</th>
                                <th>Trận</th>
                                <th>Tổng Điểm</th>
                                <th>TB/Trận</th>
                                ${detailHeadPoints}
                            </tr>
                        </thead>
                        <tbody>
                            ${pointsRows || `<tr><td colspan="${playerTableColspan}" style="padding:24px;color:var(--muted);">Chưa có điểm cá nhân nào được ghi nhận.</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="section-header" style="margin-top:28px;">
                <h3 class="section-title" style="font-size:19px;">3. Thống Kê Đánh Out &amp; Không Qua Lưới</h3>
                <span class="section-sub">Tổng hợp số lỗi tự đánh hỏng (Out + Lưới) qua từng trận</span>
            </div>
            <div class="card">
                <div class="table-wrap">
                    <table class="standings-table">
                        <thead>
                            <tr>
                                <th style="width:54px;">#</th>
                                <th class="col-left">VĐV</th>
                                <th${teamColClassAttr}>Đội · Cặp</th>
                                <th>Trận</th>
                                <th>Tổng Out/Lưới</th>
                                <th>TB/Trận</th>
                                ${detailHeadErrors}
                            </tr>
                        </thead>
                        <tbody>
                            ${errorsRows || `<tr><td colspan="${playerTableColspan}" style="padding:24px;color:var(--muted);">Chưa có thống kê đánh Out / Lưới.</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>
    `;
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
                tA?.name, tA?.code, tB?.name, tB?.code, tm.court, formatScheduleRaw(tm.scheduled_time), tm.round_name
            ];
            for (const sm of ev.subMatches) {
                const pA = sm.pair_a_id ? pairsMap.get(sm.pair_a_id) : null;
                const pB = sm.pair_b_id ? pairsMap.get(sm.pair_b_id) : null;
                const smSched = resolveSubMatchSchedule(sm, tm);
                if (smSched.court) haystackParts.push(smSched.court);
                if (smSched.scheduleLabel) haystackParts.push(smSched.scheduleLabel);
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
            </div>

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
            <div class="modal-card wide">
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

function formatRallyClock(isoStr) {
    if (!isoStr) return '';
    try {
        return new Date(isoStr).toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    } catch {
        return '';
    }
}

function buildSetScoreTimelineSvg(timeline, { colorA, colorB, labelA, labelB, targetPts }) {
    if (!Array.isArray(timeline) || timeline.length <= 1) return '';
    const w = 360;
    const h = 114;
    const padL = 26;
    const padR = 10;
    const padT = 12;
    const padB = 18;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const maxScoreInLog = timeline.reduce((mx, pt) => Math.max(mx, pt.a, pt.b), 0);
    const maxY = Math.max(Number(targetPts) || 11, maxScoreInLog + 1, 5);
    const maxN = Math.max(1, timeline.length - 1);

    const toX = (idx) => (padL + (idx / maxN) * plotW).toFixed(1);
    const toY = (val) => (padT + plotH - (Math.min(maxY, Math.max(0, val)) / maxY) * plotH).toFixed(1);

    const ptsA = timeline.map((pt, i) => `${toX(i)},${toY(pt.a)}`).join(' ');
    const ptsB = timeline.map((pt, i) => `${toX(i)},${toY(pt.b)}`).join(' ');
    const last = timeline[timeline.length - 1];
    const targetY = targetPts > 0 && targetPts <= maxY ? toY(targetPts) : null;

    return `
        <div class="history-chart-card">
            <div class="history-chart-head">
                <span>Tiến trình điểm số</span>
                <div class="history-chart-legend">
                    <span><i style="background:${escapeHtml(colorA)}"></i>${escapeHtml(labelA)} (${last.a})</span>
                    <span><i style="background:${escapeHtml(colorB)}"></i>${escapeHtml(labelB)} (${last.b})</span>
                </div>
            </div>
            <svg viewBox="0 0 ${w} ${h}" class="history-svg" role="img" aria-label="Biểu đồ tiến trình điểm">
                <line x1="${padL}" y1="${padT + plotH}" x2="${w - padR}" y2="${padT + plotH}" stroke="#d5e2dc" stroke-width="1" />
                <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="#d5e2dc" stroke-width="1" />
                ${targetY ? `<line x1="${padL}" y1="${targetY}" x2="${w - padR}" y2="${targetY}" stroke="#cbd5e1" stroke-dasharray="3 3" stroke-width="1" />` : ''}
                ${targetY ? `<text x="4" y="${Number(targetY) + 3}" font-size="9" fill="#64748b" font-weight="700">${targetPts}</text>` : ''}
                <text x="8" y="${padT + plotH}" font-size="9" fill="#94a3b8" font-weight="700">0</text>
                <text x="${w - padR}" y="${h - 4}" text-anchor="end" font-size="9" fill="#94a3b8" font-weight="600">${maxN} lượt</text>
                <polyline fill="none" stroke="${escapeHtml(colorA)}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" points="${ptsA}" />
                <polyline fill="none" stroke="${escapeHtml(colorB)}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" points="${ptsB}" />
                <circle cx="${toX(timeline.length - 1)}" cy="${toY(last.a)}" r="3.4" fill="${escapeHtml(colorA)}" />
                <circle cx="${toX(timeline.length - 1)}" cy="${toY(last.b)}" r="3.4" fill="${escapeHtml(colorB)}" />
            </svg>
        </div>
    `;
}

export function renderSubMatchHistoryModal(subId, state, options = {}) {
    const config = normalizeConfig(state?.tournament?.config);
    const sm = (state?.subMatches || []).find((x) => x.id === subId);
    if (!sm) return '';

    const tm = (state?.teamMatches || []).find((x) => x.id === sm.team_match_id);
    const teamsMap = new Map((state?.teams || []).map((t) => [t.id, t]));
    const pairsMap = new Map((state?.teamPairs || []).map((p) => [p.id, p]));
    const teamA = tm ? teamsMap.get(tm.team_a_id) : null;
    const teamB = tm ? teamsMap.get(tm.team_b_id) : null;
    const pairA = sm.pair_a_id ? pairsMap.get(sm.pair_a_id) : null;
    const pairB = sm.pair_b_id ? pairsMap.get(sm.pair_b_id) : null;

    const ev = evaluateSubMatch(sm, config);
    const sets = Array.isArray(sm.sets) && sm.sets.length > 0 ? sm.sets : [{ a: 0, b: 0 }];
    const curSetIdx = Math.max(0, Math.min(sets.length - 1, Number(options.setIdx) || 0));
    const filterMode = options.filter === 'scored' ? 'scored' : 'all';
    const sortDesc = Boolean(options.sortDesc);

    const setStats = normalizeSetPlayerStats(sm.format_override?.setPlayerStats, sets.length);
    const setLogsAll = normalizeSetRallyLogs(sm.format_override?.setRallyLogs, sets.length);
    const activeSetScore = sets[curSetIdx] || { a: 0, b: 0 };
    const activeSetEval = ev.sets[curSetIdx] || {};
    const activeStats = setStats[curSetIdx] || {};
    const activeLogs = setLogsAll[curSetIdx] || [];
    const summary = summarizeSetRallyLog(activeLogs);

    const levelName = config.levelNames[sm.level_index - 1] || `Level ${sm.level_index}`;
    const pairACode = pairA?.pair_label || `${teamA?.code || 'A'}${sm.level_index}`;
    const pairBCode = pairB?.pair_label || `${teamB?.code || 'B'}${sm.level_index}`;
    const pairANames = pairA ? `${pairA.player_1 || ''}${pairA.player_2 ? ` / ${pairA.player_2}` : ''}`.trim() : pairACode;
    const pairBNames = pairB ? `${pairB.player_1 || ''}${pairB.player_2 ? ` / ${pairB.player_2}` : ''}`.trim() : pairBCode;
    const colorA = teamA?.color || '#2563EB';
    const colorB = teamB?.color || '#E05328';

    const playerNameBySlot = new Map([
        ['a1', pairA?.player_1 || `${pairACode} · VĐV 1`],
        ['a2', pairA?.player_2 || `${pairACode} · VĐV 2`],
        ['b1', pairB?.player_1 || `${pairBCode} · VĐV 1`],
        ['b2', pairB?.player_2 || `${pairBCode} · VĐV 2`]
    ]);

    const setTabsHtml = sets.map((s, idx) => {
        const count = (setLogsAll[idx] || []).length;
        const winCls = ev.sets[idx]?.winner ? 'has-winner' : '';
        return `
            <button type="button" class="history-set-tab ${idx === curSetIdx ? 'active' : ''} ${winCls}" data-action="switch-history-set" data-set-idx="${idx}">
                Set ${idx + 1} <span class="tabular">(${Number(s.a) || 0}–${Number(s.b) || 0})</span>${count > 0 ? `<small>${count}</small>` : ''}
            </button>
        `;
    }).join('');

    const playerRowsMeta = [
        ...(pairA?.player_1 || activeStats.a1?.points || activeStats.a1?.errors ? [{ slot: 'a1', side: 'A', pair: pairACode, color: colorA }] : []),
        ...(pairA?.player_2 || activeStats.a2?.points || activeStats.a2?.errors ? [{ slot: 'a2', side: 'A', pair: pairACode, color: colorA }] : []),
        ...(pairB?.player_1 || activeStats.b1?.points || activeStats.b1?.errors ? [{ slot: 'b1', side: 'B', pair: pairBCode, color: colorB }] : []),
        ...(pairB?.player_2 || activeStats.b2?.points || activeStats.b2?.errors ? [{ slot: 'b2', side: 'B', pair: pairBCode, color: colorB }] : [])
    ];

    const boxScoreHtml = playerRowsMeta.map((m) => {
        const st = activeStats[m.slot] || { points: 0, errors: 0 };
        const name = playerNameBySlot.get(m.slot) || m.slot;
        return `
            <div class="history-box-player">
                <div class="history-box-name">
                    <span class="history-dot" style="background:${escapeHtml(m.color)}"></span>
                    <strong>${escapeHtml(name)}</strong>
                    <span class="history-pair-tag">${escapeHtml(m.pair)}</span>
                </div>
                <div class="history-box-metrics tabular">
                    <span class="history-metric pts">+${st.points} điểm</span>
                    <span class="history-metric err">${st.errors} lỗi</span>
                </div>
            </div>
        `;
    }).join('');

    const chartHtml = buildSetScoreTimelineSvg(summary.timeline, {
        colorA,
        colorB,
        labelA: pairACode,
        labelB: pairBCode,
        targetPts: ev.effectiveConfig.pointsPerSet || 11
    });

    const filteredLogs = filterMode === 'scored' ? activeLogs.filter((e) => e.scored) : activeLogs;
    const orderedLogs = sortDesc ? [...filteredLogs].reverse() : filteredLogs;

    const rallyRowsHtml = orderedLogs.map((e) => {
        const sName = playerNameBySlot.get(e.sSlot) || e.sSlot;
        const rName = playerNameBySlot.get(e.rSlot) || e.rSlot;
        const sPair = e.sSide === 'a' ? pairACode : pairBCode;
        const sColor = e.sSide === 'a' ? colorA : colorB;
        const sCourt = e.sPos === 1 ? 'Phải' : 'Trái';
        const rCourt = e.rPos === 1 ? 'Phải' : 'Trái';
        const clock = formatRallyClock(e.ts);

        let badgeCls = 'is-point';
        let badgeTxt = '+1 Điểm';
        let actionDesc = `${sName} tấn công chính xác`;
        let shiftHtml = '';

        if (e.outcome === 'receiver-error') {
            actionDesc = `${rName} đỡ hỏng`;
        } else if (e.outcome === 'server-out') {
            badgeCls = 'is-fault';
            badgeTxt = 'Mất lượt';
            actionDesc = `${sName} phát hỏng / Out`;
            shiftHtml = e.sideOut
                ? '<span class="history-shift-pill is-sideout">⇄ Đổi giao</span>'
                : `<span class="history-shift-pill">→ Phát ${e.nextTurn}</span>`;
        } else if (e.outcome === 'receiver-win') {
            badgeCls = 'is-recv';
            badgeTxt = 'Đoạt giao';
            actionDesc = `${rName} phòng thủ (+1đ CN)`;
            shiftHtml = e.sideOut
                ? '<span class="history-shift-pill is-sideout">⇄ Đổi giao</span>'
                : `<span class="history-shift-pill">→ Phát ${e.nextTurn}</span>`;
        }

        const scoreACls = e.scored && e.sSide === 'a' ? 'is-scored' : '';
        const scoreBCls = e.scored && e.sSide === 'b' ? 'is-scored' : '';

        return `
            <div class="history-rally-item ${e.sideOut ? 'has-sideout' : ''}">
                <div class="history-rally-left">
                    <span class="history-turn-num tabular">#${e.n}</span>
                    ${e.call ? `<span class="history-call-pill tabular">${escapeHtml(e.call)}</span>` : ''}
                    ${clock ? `<span class="history-clock tabular">${escapeHtml(clock)}</span>` : ''}
                </div>
                <div class="history-rally-body">
                    <div class="history-rally-matchup">
                        <span class="history-pair-dot" style="background:${escapeHtml(sColor)}"></span>
                        <strong>${escapeHtml(sPair)} · ${escapeHtml(sName)}</strong>
                        <span class="history-pos-chip">#${e.sPos} ${sCourt} · Phát ${e.turn}</span>
                        <span class="history-arrow">→</span>
                        <span>${escapeHtml(rName)}</span>
                        <span class="history-pos-chip">#${e.rPos} ${rCourt}</span>
                    </div>
                    <div class="history-rally-outcome">
                        <span class="history-out-badge ${badgeCls}">${badgeTxt}</span>
                        <span class="history-out-desc">${escapeHtml(actionDesc)}</span>
                        ${shiftHtml}
                    </div>
                </div>
                <div class="history-rally-score tabular">
                    <span class="${scoreACls}">${e.a}</span>
                    <span>:</span>
                    <span class="${scoreBCls}">${e.b}</span>
                </div>
            </div>
        `;
    }).join('');

    const winLabel = activeSetEval.winner === 'A'
        ? `<span class="tag tag-status-completed">🏆 ${escapeHtml(pairACode)} thắng Set ${curSetIdx + 1}</span>`
        : (activeSetEval.winner === 'B'
            ? `<span class="tag tag-status-completed">🏆 ${escapeHtml(pairBCode)} thắng Set ${curSetIdx + 1}</span>`
            : `<span class="tag tag-round">Set ${curSetIdx + 1}</span>`);

    const subHeaderMeta = [tm?.round_name, levelName, tm?.court].filter(Boolean).join(' · ');

    return `
        <div class="modal-backdrop" data-action="close-modal">
            <div class="modal-card wide history-modal-card">
                <div class="modal-header history-modal-header">
                    <div style="min-width:0;">
                        <h3 class="modal-title">Chi Tiết Diễn Biến Từng Lượt</h3>
                        <div class="section-sub">${escapeHtml(subHeaderMeta)}</div>
                    </div>
                    <button type="button" class="modal-close" data-action="close-modal" aria-label="Đóng">✕</button>
                </div>
                <div class="modal-body history-modal-body">
                    <div class="history-set-tabs" role="tablist">
                        ${setTabsHtml}
                    </div>

                    <div class="history-hero-card">
                        <div class="history-hero-side">
                            <span class="history-hero-code" style="color:${escapeHtml(colorA)}">${escapeHtml(pairACode)}</span>
                            <strong class="history-hero-names">${escapeHtml(pairANames)}</strong>
                        </div>
                        <div class="history-hero-center">
                            <div class="history-hero-score tabular">${Number(activeSetScore.a) || 0} : ${Number(activeSetScore.b) || 0}</div>
                            ${winLabel}
                        </div>
                        <div class="history-hero-side right">
                            <span class="history-hero-code" style="color:${escapeHtml(colorB)}">${escapeHtml(pairBCode)}</span>
                            <strong class="history-hero-names">${escapeHtml(pairBNames)}</strong>
                        </div>
                    </div>

                    ${activeLogs.length > 0 ? `
                        <div class="history-kpi-grid">
                            <div class="history-kpi-cell"><span>Lượt bóng</span><strong class="tabular">${summary.totalRallies}</strong></div>
                            <div class="history-kpi-cell"><span>Đổi giao</span><strong class="tabular">${summary.sideOuts}</strong></div>
                            <div class="history-kpi-cell"><span>Chuỗi ${escapeHtml(pairACode)}</span><strong class="tabular" style="color:${escapeHtml(colorA)};">+${summary.maxRunA}</strong></div>
                            <div class="history-kpi-cell"><span>Chuỗi ${escapeHtml(pairBCode)}</span><strong class="tabular" style="color:${escapeHtml(colorB)};">+${summary.maxRunB}</strong></div>
                        </div>
                        ${chartHtml}
                    ` : ''}

                    ${boxScoreHtml ? `
                        <div class="history-box-section">
                            <div class="history-section-label">Thống kê cá nhân Set ${curSetIdx + 1}</div>
                            <div class="history-box-grid">${boxScoreHtml}</div>
                        </div>
                    ` : ''}

                    <div class="history-feed-section">
                        <div class="history-feed-head">
                            <span class="history-section-label">Nhật ký từng pha bóng</span>
                            ${activeLogs.length > 0 ? `
                                <div class="history-feed-controls">
                                    <button type="button" class="history-ctrl-btn ${filterMode === 'all' ? 'active' : ''}" data-action="history-filter" data-filter="all">Tất cả (${activeLogs.length})</button>
                                    <button type="button" class="history-ctrl-btn ${filterMode === 'scored' ? 'active' : ''}" data-action="history-filter" data-filter="scored">Ghi điểm (${summary.scoringRallies})</button>
                                    <button type="button" class="history-ctrl-btn" data-action="history-sort">${sortDesc ? 'Mới nhất ↑' : 'Từ đầu ↓'}</button>
                                </div>
                            ` : ''}
                        </div>
                        <div class="history-rally-list">
                            ${rallyRowsHtml || '<div class="history-empty">Chưa có nhật ký từng pha bóng cho Set này. Khi Admin bấm các nút kết quả pha bóng (Tấn công chính xác / Đỡ hỏng / Phát hỏng / Phòng thủ thành công), hệ thống sẽ tự động lưu chi tiết từng lượt tại đây.</div>'}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Google-Form-style standalone pre-registration page rendered only via ?register=1.
 * Keeps submitted lists strictly hidden from public/anonymous visitors.
 */
export function renderRegisterPage(tournament, options = {}) {
    const config = normalizeConfig(tournament?.config);
    const title = tournament?.name || 'VaciF PickleBeer 2026 Team League';
    const {
        submittedReceipt = null,
        errorMessage = '',
        submitting = false
    } = options;

    const headerCardHtml = `
        <div class="reg-card reg-header-card">
            <div class="reg-banner-strip"></div>
            <div class="reg-header-body">
                <div class="eyebrow" style="margin-bottom:8px;">
                    <span>VACIF · PICKLEBEER 2026</span>
                    <span class="reg-status-pill ${config.registrationOpen ? 'is-open' : 'is-closed'}"><span class="reg-status-dot"></span>${config.registrationOpen ? 'Đang mở đăng ký' : 'Đã đóng đăng ký'}</span>
                </div>
                <h1 class="reg-title">Đăng Ký Tham Gia Giải</h1>
                <p class="reg-desc">
                    <strong>${escapeHtml(title)}</strong> — Thông tin đăng ký để BTC ghi nhận số lượng tham gia và tiến hành quay cặp đấu, phân đội theo từng phân hạng (Level 1 - 2 - 3).
                </p>
                <div class="reg-required-note"><span class="reg-req">*</span> Biểu thị câu hỏi bắt buộc</div>
            </div>
        </div>
    `;

    if (!config.registrationOpen) {
        return `
            <section class="reg-shell">
                ${headerCardHtml}
                <div class="reg-card reg-q-card">
                    <h2 style="margin:0 0 8px;font-size:18px;">Biểu mẫu đăng ký đã tạm đóng</h2>
                    <p class="section-sub" style="margin:0;">
                        BTC đã ngừng nhận đơn đăng ký cho giải đấu này. Vui lòng liên hệ trực tiếp BTC nếu cần bổ sung danh sách.
                    </p>
                </div>
            </section>
        `;
    }

    if (submittedReceipt) {
        return `
            <section class="reg-shell">
                ${headerCardHtml}
                <div class="reg-card reg-q-card reg-success-card">
                    <div class="reg-success-badge">✓ Đã ghi nhận đăng ký</div>
                    <h2 style="margin:8px 0 6px;font-size:20px;">Cảm ơn bạn đã đăng ký!</h2>
                    <p class="section-sub" style="margin:0 0 16px;">
                        Thông tin của bạn đã được ghi nhận để BTC thống kê số lượng, quay cặp đấu và phân đội theo Level.
                    </p>
                    <div class="reg-receipt-box">
                        <div class="reg-receipt-row"><span>Họ và tên</span><strong>${escapeHtml(submittedReceipt.full_name)}</strong></div>
                        <div class="reg-receipt-row"><span>Tên thi đấu</span><strong>${escapeHtml(submittedReceipt.display_name || submittedReceipt.full_name)}</strong></div>
                        <div class="reg-receipt-row"><span>Trình độ (Tự đánh giá)</span><strong>${escapeHtml(submittedReceipt.skill_level)}</strong></div>
                    </div>
                </div>
            </section>
        `;
    }

    const skillRadiosHtml = SKILL_LEVEL_OPTIONS.map((opt, idx) => `
        <label class="reg-radio-item">
            <input type="radio" name="skill_level" value="${escapeHtml(opt)}" ${idx === 0 ? 'required' : ''}>
            <span>${escapeHtml(opt)}</span>
        </label>
    `).join('');

    return `
        <section class="reg-shell">
            ${headerCardHtml}
            <form id="player-registration-form" class="reg-form-stack">
                ${errorMessage ? `<div class="alert alert-error">${escapeHtml(errorMessage)}</div>` : ''}

                <div class="reg-card reg-q-card">
                    <label class="reg-q-label" for="reg-full-name">Họ và tên <span class="reg-req">*</span></label>
                    <input id="reg-full-name" name="full_name" type="text" class="form-input" required maxlength="80" placeholder="" autocomplete="name">
                </div>

                <div class="reg-card reg-q-card">
                    <label class="reg-q-label" for="reg-display-name">Tên thi đấu</label>
                    <input id="reg-display-name" name="display_name" type="text" class="form-input" maxlength="40" placeholder="">
                </div>

                <div class="reg-card reg-q-card">
                    <div class="reg-q-label">Trình độ (Tự đánh giá) <span class="reg-req">*</span></div>
                    <div class="reg-radio-list">
                        ${skillRadiosHtml}
                    </div>
                </div>

                <div class="reg-submit-bar">
                    <button type="submit" class="btn btn-primary reg-submit-btn" ${submitting ? 'disabled' : ''}>${submitting ? 'Đang gửi...' : 'Đăng Ký'}</button>
                    <button type="reset" class="link-btn" data-action="reset-register-form">Xóa hết câu trả lời</button>
                </div>
            </form>
        </section>
    `;
}
