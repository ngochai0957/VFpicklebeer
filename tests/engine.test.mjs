import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    advanceRallyServeTurn,
    applyRallyOutcomeToSet,
    buildCourtBoard,
    buildResizedRoster,
    calculatePairLeaderboard,
    calculatePlayerLeaderboard,
    calculateStandings,
    combineScheduleValue,
    escapeHtml,
    evaluateSetWinner,
    evaluateSubMatch,
    evaluateTeamMatch,
    formatScheduleDisplay,
    generateRoundRobinSchedule,
    normalizeConfig,
    normalizeRallyState,
    normalizeSetPlayerStats,
    parseScheduleValue,
    resolveSubMatchSchedule,
    selectRallyRole,
    swapRallyCourtOrder
} from '../js/tournament-engine.js';
import { createInitialDemoState } from '../js/demo-data.js';
import {
    renderAwardsTab,
    renderLiveSpotlight,
    renderMatchesTab,
    renderRulesTab,
    renderStandingsTab,
    renderTeamDetailModal,
    renderTeamMatchCard,
    renderTeamsTab,
    renderTvModeView
} from '../js/ui-public.js';
import {
    renderAdminLoginModal,
    renderAdminTab
} from '../js/ui-admin.js';

test('evaluateSetWinner respects win-by-2 and cap rules', () => {
    const cfg = { pointsPerSet: 11, winByTwo: true, pointCap: 0 };
    assert.equal(evaluateSetWinner({ a: 11, b: 7 }, cfg), 'A');
    assert.equal(evaluateSetWinner({ a: 11, b: 10 }, cfg), null);
    assert.equal(evaluateSetWinner({ a: 12, b: 10 }, cfg), 'A');
    assert.equal(evaluateSetWinner({ a: 10, b: 12 }, cfg), 'B');

    const cappedCfg = { pointsPerSet: 11, winByTwo: true, pointCap: 15 };
    assert.equal(evaluateSetWinner({ a: 15, b: 14 }, cappedCfg), 'A');

    const noWinByTwo = { pointsPerSet: 11, winByTwo: false, pointCap: 0 };
    assert.equal(evaluateSetWinner({ a: 11, b: 10 }, noWinByTwo), 'A');
});

test('evaluateSubMatch handles Bo1, Bo3, and Bo5 Ben Johns set scoring', () => {
    const bo3Cfg = { bestOf: 3, pointsPerSet: 11, winByTwo: true, pointCap: 0, levelsCount: 3 };

    // 2-1 win
    const resBo3 = evaluateSubMatch({
        status: 'live',
        sets: [{ a: 11, b: 7 }, { a: 8, b: 11 }, { a: 11, b: 9 }]
    }, bo3Cfg);
    assert.equal(resBo3.setsWonA, 2);
    assert.equal(resBo3.setsWonB, 1);
    assert.equal(resBo3.pointsA, 30);
    assert.equal(resBo3.pointsB, 27);
    assert.equal(resBo3.winner, 'A');
    assert.equal(resBo3.effectiveStatus, 'completed');

    // Bo5 override (Finals) with 2-1 not decided yet
    const resBo5 = evaluateSubMatch({
        status: 'live',
        format_override: { bestOf: 5 },
        sets: [{ a: 11, b: 8 }, { a: 9, b: 11 }, { a: 11, b: 6 }]
    }, bo3Cfg);
    assert.equal(resBo5.setsNeeded, 3);
    assert.equal(resBo5.winner, null);
    assert.equal(resBo5.effectiveStatus, 'live');
});

test('generateRoundRobinSchedule creates exact 4-team infographic order and unique pairs for odd/even counts', () => {
    const { teams, teamPairs } = buildResizedRoster([], [], 4, 3, 'main');
    const sched4 = generateRoundRobinSchedule(teams, teamPairs, { levelsCount: 3, doubleRoundRobin: false });

    assert.equal(sched4.teamMatches.length, 6);
    assert.equal(sched4.subMatches.length, 18);

    const codeById = new Map(teams.map((t) => [t.id, t.code]));
    const r1 = sched4.teamMatches.filter((m) => m.round_number === 1).map((m) => `${codeById.get(m.team_a_id)}v${codeById.get(m.team_b_id)}`);
    const r2 = sched4.teamMatches.filter((m) => m.round_number === 2).map((m) => `${codeById.get(m.team_a_id)}v${codeById.get(m.team_b_id)}`);
    const r3 = sched4.teamMatches.filter((m) => m.round_number === 3).map((m) => `${codeById.get(m.team_a_id)}v${codeById.get(m.team_b_id)}`);

    assert.deepEqual(r1, ['AvB', 'CvD']);
    assert.deepEqual(r2, ['AvC', 'BvD']);
    assert.deepEqual(r3, ['AvD', 'BvC']);

    // Odd count (5 teams -> 5 rounds * 2 matches = 10 unique pairings)
    const roster5 = buildResizedRoster([], [], 5, 3, 'main');
    const sched5 = generateRoundRobinSchedule(roster5.teams, roster5.teamPairs, { levelsCount: 3 });
    assert.equal(sched5.teamMatches.length, 10);
    const pairKeys5 = new Set(sched5.teamMatches.map((m) => [m.team_a_id, m.team_b_id].sort().join(':')));
    assert.equal(pairKeys5.size, 10);

    // Double round robin for 6 teams -> 15 * 2 = 30 matches
    const roster6 = buildResizedRoster([], [], 6, 3, 'main');
    const sched6Double = generateRoundRobinSchedule(roster6.teams, roster6.teamPairs, { levelsCount: 3, doubleRoundRobin: true });
    assert.equal(sched6Double.teamMatches.length, 30);
});

test('calculateStandings applies exact tiebreaker order (TM Wins -> SubMatch Wins -> Point Diff) and excludes playoffs', () => {
    const cfg = { bestOf: 1, pointsPerSet: 11, winByTwo: true, pointCap: 0, levelsCount: 3 };
    const teams = [
        { id: 'tA', code: 'A', name: 'Team A', color: '#111', seed_order: 1 },
        { id: 'tB', code: 'B', name: 'Team B', color: '#222', seed_order: 2 },
        { id: 'tC', code: 'C', name: 'Team C', color: '#333', seed_order: 3 }
    ];

    // All 3 teams finish 1W-1L in Team Matches:
    // A beats B (3-0), B beats C (2-1), C beats A (2-1)
    // SubMatch Wins: A = 4 (3+1), B = 2 (0+2), C = 3 (1+2) -> Order should be A (4), C (3), B (2)
    const teamMatches = [
        { id: 'm1', stage: 'round_robin', team_a_id: 'tA', team_b_id: 'tB', status: 'completed' },
        { id: 'm2', stage: 'round_robin', team_a_id: 'tB', team_b_id: 'tC', status: 'completed' },
        { id: 'm3', stage: 'round_robin', team_a_id: 'tC', team_b_id: 'tA', status: 'completed' },
        // Playoff match where B crushes A must NOT change Round Robin standings!
        { id: 'm_final', stage: 'playoff', team_a_id: 'tB', team_b_id: 'tA', status: 'completed' }
    ];

    const subMatches = [
        // m1: A 3-0 B
        { id: 's11', team_match_id: 'm1', level_index: 1, sets: [{ a: 11, b: 5 }], status: 'completed' },
        { id: 's12', team_match_id: 'm1', level_index: 2, sets: [{ a: 11, b: 5 }], status: 'completed' },
        { id: 's13', team_match_id: 'm1', level_index: 3, sets: [{ a: 11, b: 5 }], status: 'completed' },
        // m2: B 2-1 C
        { id: 's21', team_match_id: 'm2', level_index: 1, sets: [{ a: 11, b: 9 }], status: 'completed' },
        { id: 's22', team_match_id: 'm2', level_index: 2, sets: [{ a: 11, b: 9 }], status: 'completed' },
        { id: 's23', team_match_id: 'm2', level_index: 3, sets: [{ a: 5, b: 11 }], status: 'completed' },
        // m3: C 2-1 A
        { id: 's31', team_match_id: 'm3', level_index: 1, sets: [{ a: 11, b: 9 }], status: 'completed' },
        { id: 's32', team_match_id: 'm3', level_index: 2, sets: [{ a: 11, b: 9 }], status: 'completed' },
        { id: 's33', team_match_id: 'm3', level_index: 3, sets: [{ a: 8, b: 11 }], status: 'completed' },
        // Playoff B 3-0 A
        { id: 'sf1', team_match_id: 'm_final', level_index: 1, sets: [{ a: 11, b: 0 }], status: 'completed' },
        { id: 'sf2', team_match_id: 'm_final', level_index: 2, sets: [{ a: 11, b: 0 }], status: 'completed' },
        { id: 'sf3', team_match_id: 'm_final', level_index: 3, sets: [{ a: 11, b: 0 }], status: 'completed' }
    ];

    const standings = calculateStandings(teams, teamMatches, subMatches, cfg);
    assert.deepEqual(standings.map((r) => r.team.id), ['tA', 'tC', 'tB']);
    assert.equal(standings[0].teamMatchWins, 1);
    assert.equal(standings[0].subMatchWins, 4);
    assert.equal(standings[1].subMatchWins, 3);
    assert.equal(standings[2].subMatchWins, 2);

    const evalTm1 = evaluateTeamMatch(teamMatches[0], subMatches, cfg);
    assert.equal(evalTm1.winner, 'A');
    assert.equal(evalTm1.subWinsA, 3);
    assert.equal(evalTm1.subWinsB, 0);
});

test('calculateStandings uses pointDiff as tiebreaker #3 when TM Wins and SubMatch Wins are tied', () => {
    const cfg = { bestOf: 1, pointsPerSet: 11, winByTwo: true, pointCap: 0, levelsCount: 1 };
    const teams = [
        { id: 'tA', code: 'A', name: 'Team A', color: '#111', seed_order: 1 },
        { id: 'tB', code: 'B', name: 'Team B', color: '#222', seed_order: 2 },
        { id: 'tC', code: 'C', name: 'Team C', color: '#333', seed_order: 3 }
    ];
    const teamMatches = [
        { id: 'm1', stage: 'round_robin', team_a_id: 'tA', team_b_id: 'tB', status: 'completed' },
        { id: 'm2', stage: 'round_robin', team_a_id: 'tB', team_b_id: 'tC', status: 'completed' },
        { id: 'm3', stage: 'round_robin', team_a_id: 'tC', team_b_id: 'tA', status: 'completed' }
    ];
    // All 3 teams 1W-1L, SubMatch Wins 1 each:
    // A beats B 11-2 (+9), B beats C 11-8 (+3), C beats A 11-9 (+2)
    // Point diffs: A = +9 - 2 = +7, B = -9 + 3 = -6, C = -3 + 2 = -1 -> Order: A (+7), C (-1), B (-6)
    const subMatches = [
        { id: 's1', team_match_id: 'm1', level_index: 1, sets: [{ a: 11, b: 2 }], status: 'completed' },
        { id: 's2', team_match_id: 'm2', level_index: 1, sets: [{ a: 11, b: 8 }], status: 'completed' },
        { id: 's3', team_match_id: 'm3', level_index: 1, sets: [{ a: 11, b: 9 }], status: 'completed' }
    ];

    const standings = calculateStandings(teams, teamMatches, subMatches, cfg);
    assert.deepEqual(standings.map((r) => r.team.id), ['tA', 'tC', 'tB']);
    assert.equal(standings[0].pointDiff, 7);
    assert.equal(standings[1].pointDiff, -1);
    assert.equal(standings[2].pointDiff, -6);
});

test('escapeHtml neutralizes HTML injection vectors', () => {
    assert.equal(
        escapeHtml('<script>alert("xss")</script>'),
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
});

test('Public UI renders cleanly with zero admin edit controls and escapes unsafe team names', () => {
    const state = createInitialDemoState('main');
    state.teams[0].name = 'Team A <script>xss</script>';

    const liveHtml = renderLiveSpotlight(state, false);
    const standingsHtml = renderStandingsTab(state, false);
    const matchesHtml = renderMatchesTab(state, { status: 'all', round: 'all', teamId: 'all' }, false);
    const teamsHtml = renderTeamsTab(state);
    const rulesHtml = renderRulesTab(state);
    const modalHtml = renderTeamDetailModal(state.teams[0].id, state);

    for (const html of [liveHtml, standingsHtml, matchesHtml, teamsHtml, rulesHtml, modalHtml]) {
        assert.ok(html.length > 100);
        assert.equal(html.includes('<script>xss</script>'), false);
        assert.equal(html.includes('admin-edit-match'), false);
    }

    assert.ok(standingsHtml.includes('&lt;script&gt;xss&lt;/script&gt;'));
    assert.ok(liveHtml.includes('Đang Thi Đấu Trực Tiếp'));
    assert.ok(matchesHtml.includes('Vòng 1'));
});

test('Admin UI renders all 4 subtabs and clean password-only login modal', () => {
    const state = createInitialDemoState('main');
    const supabaseModal = renderAdminLoginModal('supabase', '');
    assert.equal(supabaseModal.includes('admin123'), false);
    assert.equal(supabaseModal.includes('Supabase Auth + RLS'), false);
    assert.equal(supabaseModal.includes('Tài khoản:'), false);
    assert.equal(supabaseModal.includes('@gmail.com'), false);
    assert.ok(supabaseModal.includes('id="admin-login-password"'));

    const localModal = renderAdminLoginModal('local', '');
    assert.equal(localModal.includes('admin123'), false);
    assert.equal(localModal.includes('Chế độ Demo Local'), false);
    assert.equal(localModal.includes('stopPropagation'), false);
    assert.ok(localModal.includes('id="admin-login-password"'));

    const stylesCss = readFileSync(new URL('../css/styles.css', import.meta.url), 'utf8');
    assert.equal(stylesCss.includes('outline: 3px solid var(--accent)'), false);
    assert.ok(stylesCss.includes('box-shadow: 0 0 0 3px rgba(14, 124, 91, 0.14)'));

    const appJs = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
    const publicJs = readFileSync(new URL('../js/ui-public.js', import.meta.url), 'utf8');
    assert.equal(appJs.includes('stopPropagation'), false);
    assert.equal(publicJs.includes('stopPropagation'), false);
    assert.ok(appJs.includes("el.classList.contains('modal-backdrop') && event?.target !== el"));

    for (const subtab of ['scores', 'teams', 'schedule', 'settings']) {
        const html = renderAdminTab(state, { subtab, selectedMatchId: state.teamMatches[0].id }, 'supabase');
        assert.ok(html.includes('Bảng Điều Khiển Admin') || html.includes('Đăng xuất Admin'));
        assert.ok(html.length > 200);
    }
});

test('Court Board, Form guide, Tiebreaker annotation, Player Search, and TV Mode work cleanly', () => {
    const state = createInitialDemoState('main');
    const standings = calculateStandings(state.teams, state.teamMatches, state.subMatches, state.tournament.config);

    // Team A & Team C both have 1 Team Match Win -> tieNote must explain tiebreaker
    const teamA = standings.find((r) => r.team.id === 'team_a');
    const teamC = standings.find((r) => r.team.id === 'team_c');
    assert.deepEqual(teamA.form, ['W']);
    assert.ok(teamA.tieNote.length > 0 || teamC.tieNote.length > 0);

    // Court Board groups Sân 1 and Sân 2 cleanly
    const courts = buildCourtBoard(state.teamMatches, state.subMatches, state.tournament.config);
    assert.equal(courts.length, 2);
    assert.equal(courts[0].court, 'Sân 1');
    assert.equal(courts[0].live.length, 1);
    assert.equal(courts[0].upcoming.length, 1);

    // Player search filters to matches involving Minh Khôi and omits removed Court Board toggle
    const searchMatchesHtml = renderMatchesTab(state, { status: 'all', round: 'all', teamId: 'all', query: 'minh khoi' }, false);
    assert.ok(searchMatchesHtml.includes('Minh Khôi'));
    assert.equal(searchMatchesHtml.includes('Vòng 1: Team C'), false);
    assert.equal(searchMatchesHtml.includes('data-action="matches-view"'), false);
    assert.equal(searchMatchesHtml.includes('Điều phối Sân'), false);

    const tvHtml = renderTvModeView(state);
    assert.ok(tvHtml.includes('TV Mode'));
    assert.ok(tvHtml.includes('VaciF PickleBeer 2026 Team League'));
});

test('Live view hides upcoming pairs, shows ready pairs subdued, and distinguishes Set 1-3 vs Chung cuoc', () => {
    const state = createInitialDemoState('main');
    const liveMatch = state.teamMatches.find((m) => m.status === 'live');
    assert.ok(liveMatch);

    const subs = state.subMatches.filter((s) => s.team_match_id === liveMatch.id).sort((a, b) => a.level_index - b.level_index);
    // Level 1: live, Level 2: ready (format_override.queueState = 'ready'), Level 3: upcoming
    subs[0].status = 'live';
    subs[0].sets = [{ a: 11, b: 2 }, { a: 2, b: 11 }, { a: 0, b: 0 }];
    subs[1].status = 'upcoming';
    subs[1].sets = [{ a: 0, b: 0 }];
    subs[1].format_override = { queueState: 'ready' };
    subs[2].status = 'upcoming';
    subs[2].sets = [{ a: 0, b: 0 }];
    subs[2].format_override = null;

    // 1. evaluateSubMatch recognizes effectiveStatus === 'ready'
    const evReady = evaluateSubMatch(subs[1], state.tournament.config);
    assert.equal(evReady.effectiveStatus, 'ready');
    const evUpcoming = evaluateSubMatch(subs[2], state.tournament.config);
    assert.equal(evUpcoming.effectiveStatus, 'upcoming');

    // 2. Live filter & TV Mode show live + ready, hide upcoming, and display clear headers
    const liveTabHtml = renderMatchesTab(state, { status: 'live', round: 'all', teamId: 'all', view: 'list', query: '' }, false);
    const tvHtml = renderTvModeView(state);

    for (const html of [liveTabHtml, tvHtml]) {
        assert.ok(html.includes('Tỉ số đội'));
        assert.ok(html.includes('ppa-sub-card is-live'));
        assert.ok(html.includes('Mixed Doubles'));
        assert.ok(html.includes('Bo3'));
        assert.ok(html.includes('Set 1'));
        assert.ok(html.includes('Set 2'));
        assert.ok(html.includes('Set 3'));
        assert.equal(html.includes('ppa-avatars'), false);
        assert.equal(html.includes('ppa-cc-cell'), false);
        assert.ok(html.includes('Level 1'));
        assert.ok(html.includes('Level 2'));
        assert.ok(html.includes('ppa-sub-card is-ready'));
        assert.ok(html.includes('Sắp đấu'));
        assert.equal(html.includes('Level 3'), false);
    }

    // 2b. Completed pair renders PPA Tour mixed doubles card with full-row win state & WINNER pill
    const completedHtml = renderMatchesTab(state, { status: 'completed', round: 'all', teamId: 'all', view: 'list', query: '' }, false);
    assert.ok(completedHtml.includes('ppa-pair-row is-winner'));
    assert.ok(completedHtml.includes('ppa-winner-badge'));
    assert.ok(completedHtml.includes('WINNER'));
    assert.equal(completedHtml.includes('ppa-cc-cell'), false);

    // 3. Admin scores tab exposes all 4 pair queue states & reorder controls
    const adminHtml = renderAdminTab(state, { subtab: 'scores', selectedMatchId: liveMatch.id }, 'supabase');
    for (const st of ['upcoming', 'ready', 'live', 'completed']) {
        assert.ok(adminHtml.includes(`data-action="quick-sub-status" data-sub-id="${subs[1].id}" data-status="${st}"`));
    }
    assert.ok(adminHtml.includes('Chưa đấu'));
    assert.ok(adminHtml.includes('Sắp đấu'));
    assert.ok(adminHtml.includes('● Đang đấu'));
    assert.ok(adminHtml.includes('✓ Xong'));
    assert.ok(adminHtml.includes('data-action="move-sub-order"'));
    assert.ok(adminHtml.includes('data-action="sort-subs-by-status"'));
    assert.ok(adminHtml.includes('data-action="reset-sub-order"'));

    // 4. Smart status sorting surfaces live pairs first, and explicit displayOrder overrides order cleanly
    subs[0].status = 'completed';
    subs[0].sets = [{ a: 11, b: 2 }, { a: 11, b: 3 }];
    subs[0].format_override = null;
    subs[1].status = 'upcoming';
    subs[1].sets = [{ a: 0, b: 0 }];
    subs[1].format_override = { queueState: 'ready' };
    subs[2].status = 'live';
    subs[2].sets = [{ a: 5, b: 4 }];
    subs[2].format_override = null;

    const cardContext = {
        teamsMap: new Map(state.teams.map((t) => [t.id, t])),
        pairsMap: new Map(state.teamPairs.map((p) => [p.id, p])),
        subMatches: state.subMatches,
        config: normalizeConfig(state.tournament.config)
    };
    const autoSortedHtml = renderTeamMatchCard(liveMatch, cardContext, false);
    assert.ok(autoSortedHtml.indexOf('Level 3') < autoSortedHtml.indexOf('Level 2'));
    assert.ok(autoSortedHtml.indexOf('Level 2') < autoSortedHtml.indexOf('Level 1'));

    subs[1].format_override = { queueState: 'ready', displayOrder: 1 };
    subs[0].format_override = { displayOrder: 2 };
    subs[2].format_override = { displayOrder: 3 };
    const customOrderHtml = renderTeamMatchCard(liveMatch, cardContext, false);
    assert.ok(customOrderHtml.indexOf('Level 2') < customOrderHtml.indexOf('Level 1'));
    assert.ok(customOrderHtml.indexOf('Level 1') < customOrderHtml.indexOf('Level 3'));
});

test('Supports match date + time scheduling and simultaneous multi-court pair assignment', () => {
    const combined = combineScheduleValue('2026-11-22', '08:30');
    assert.equal(combined, '2026-11-22 · 08:30');
    assert.deepEqual(parseScheduleValue(combined), { date: '2026-11-22', time: '08:30' });
    assert.equal(formatScheduleDisplay('2026-11-22', '08:30'), '22/11/2026 · 08:30');

    const state = createInitialDemoState('main');
    const liveMatch = state.teamMatches.find((m) => m.status === 'live');
    liveMatch.court = 'Sân 1';
    liveMatch.scheduled_time = combined;

    const subs = state.subMatches.filter((s) => s.team_match_id === liveMatch.id).sort((a, b) => a.level_index - b.level_index);
    subs[0].status = 'live';
    subs[0].format_override = { court: 'Sân 1' };
    subs[1].status = 'live';
    subs[1].format_override = { court: 'Sân 2', scheduledTime: '09:00' };
    subs[2].status = 'live';
    subs[2].format_override = { court: 'Sân 3' };

    const s2Resolved = resolveSubMatchSchedule(subs[1], liveMatch);
    assert.equal(s2Resolved.court, 'Sân 2');
    assert.equal(s2Resolved.time, '09:00');
    assert.equal(s2Resolved.hasCustomCourt, true);
    assert.equal(s2Resolved.hasCustomTime, true);

    const cardContext = {
        teamsMap: new Map(state.teams.map((t) => [t.id, t])),
        pairsMap: new Map(state.teamPairs.map((p) => [p.id, p])),
        subMatches: state.subMatches,
        config: normalizeConfig(state.tournament.config)
    };
    const cardHtml = renderTeamMatchCard(liveMatch, cardContext, false);
    assert.ok(cardHtml.includes('22/11/2026 · 08:30'));
    assert.ok(cardHtml.includes('Sân 1 · Sân 2 · Sân 3'));
    assert.ok(cardHtml.includes('Sân 2 · 09:00'));
    assert.equal(cardHtml.includes('Sân 2 · 22/11/2026'), false);

    // Court board splits the Team Match across Sân 1, Sân 2, and Sân 3 when pairs run on different courts
    const courts = buildCourtBoard(state.teamMatches, state.subMatches, state.tournament.config);
    const san3 = courts.find((c) => c.court === 'Sân 3');
    assert.ok(san3);
    assert.equal(san3.live.length, 1);
    assert.equal(san3.live[0].subLabel, 'Level 3');

    // Admin forms include date pickers + per-pair court/schedule inputs
    const adminScoresHtml = renderAdminTab(state, { subtab: 'scores', selectedMatchId: liveMatch.id }, 'supabase');
    assert.ok(adminScoresHtml.includes('name="scheduled_date"'));
    assert.ok(adminScoresHtml.includes('data-action="assign-multi-courts"'));
    assert.ok(adminScoresHtml.includes('data-action="sub-override-field"'));
    const adminSchedHtml = renderAdminTab(state, { subtab: 'schedule', selectedMatchId: liveMatch.id }, 'supabase');
    assert.ok(adminSchedHtml.includes('name="scheduled_date"'));
});

test('Awards leaderboards rank Best Pair, Top Scorer (regardless of win/loss), and Out/Net Errors', () => {
    const state = createInitialDemoState('main');
    const pairBoard = calculatePairLeaderboard(state.teams, state.teamPairs, state.teamMatches, state.subMatches, state.tournament.config);
    assert.ok(pairBoard.length >= 12);
    // A1 won both matches (2-0) -> ranked #1
    assert.equal(pairBoard[0].pair.id, 'pair_a_1');
    assert.equal(pairBoard[0].wins, 2);

    const playerBoard = calculatePlayerLeaderboard(state.teams, state.teamPairs, state.teamMatches, state.subMatches, state.tournament.config);
    assert.equal(playerBoard.hasAnyStats, true);
    // Top scorer has matchLogs recording points after every played match
    const topScorer = playerBoard.byPoints[0];
    assert.ok(topScorer.totalPoints > 0);
    assert.ok(topScorer.matchLogs.length >= 1);

    // Explicitly verify a losing player scoring massive individual points still tops the scorer board
    const losingSub = state.subMatches.find((s) => s.id === 'sm_r1_ab_2');
    losingSub.format_override = {
        setPlayerStats: [
            { a1: { points: 10, errors: 1 }, a2: { points: 0, errors: 0 }, b1: { points: 1, errors: 10 }, b2: { points: 0, errors: 0 } },
            { a1: { points: 10, errors: 0 }, a2: { points: 0, errors: 0 }, b1: { points: 1, errors: 10 }, b2: { points: 0, errors: 0 } },
            { a1: { points: 15, errors: 0 }, a2: { points: 0, errors: 0 }, b1: { points: 1, errors: 15 }, b2: { points: 0, errors: 0 } }
        ]
    };
    const updatedBoard = calculatePlayerLeaderboard(state.teams, state.teamPairs, state.teamMatches, state.subMatches, state.tournament.config);
    // Tuấn Anh (pair_a_2) lost sm_r1_ab_2 (1-2) but gets full 35 pts from that match + 14 pts in r2 = 49 pts
    assert.equal(updatedBoard.byPoints[0].name, 'Tuấn Anh');
    assert.equal(updatedBoard.byPoints[0].totalPoints, 49);
    // Trung Kiên (pair_b_2) won but hit 35 Out/Net errors in sm_r1_ab_2 + errors in r2
    assert.equal(updatedBoard.byErrors[0].name, 'Trung Kiên');
    assert.ok(updatedBoard.byErrors[0].totalErrors >= 35);

    // Public Awards tab & Admin player stat controls render safely
    state.teams[0].name = 'Team A <script>xss</script>';
    const awardsHtml = renderAwardsTab(state, { teamId: 'all', query: '' });
    assert.equal(awardsHtml.includes('<script>xss</script>'), false);
    assert.equal(awardsHtml.includes('admin-edit-match'), false);
    assert.ok(awardsHtml.includes('Cặp Đôi Ăn Ý'));
    assert.ok(awardsHtml.includes('Bảng Point Cá Nhân'));
    assert.ok(awardsHtml.includes('Thống Kê Đánh Out'));
    assert.ok(awardsHtml.includes('Tuấn Anh'));

    const standingsHtml = renderStandingsTab(state, false);
    assert.ok(standingsHtml.includes('Giải Phụ &amp; Thống Kê Cá Nhân'));

    const adminScoresHtml = renderAdminTab(state, { subtab: 'scores', selectedMatchId: 'tm_r1_ab' }, 'local');
    assert.equal(adminScoresHtml.includes('data-action="step-player-stat"'), false);
    assert.equal(adminScoresHtml.includes('data-action="input-player-stat"'), false);
    assert.equal(adminScoresHtml.includes('data-action="input-score"'), false);
    assert.equal(adminScoresHtml.includes('data-action="step-score"'), false);
    assert.equal(adminScoresHtml.includes('data-action="toggle-sync-set-score"'), false);
    assert.ok(adminScoresHtml.includes('set-readonly-board'));
    assert.ok(adminScoresHtml.includes('Out/Lưới'));
});

test('Doubles serve turn 1/2, court order 1/2 swap, alternating receiver on score, and Side-Out controls', () => {
    const pairA = { id: 'pA', player_1: 'Hải Đăng', player_2: 'Gia Huy' };
    const pairB = { id: 'pB', player_1: 'Phúc Lâm', player_2: 'Khánh Duy' };

    // Default Start: Position 1 (Right) a1 serves at Turn 1 to Position 1 (Right) b1
    let rally = normalizeRallyState(null, pairA, pairB);
    assert.deepEqual(rally, {
        serverSlot: 'a1',
        receiverSlot: 'b1',
        serveTurn: 1,
        orderA: ['a1', 'a2'],
        orderB: ['b1', 'b2']
    });

    // Swapping pair B Start positions (1 <-> 2) puts b2 at Pos 1 (Right) and b1 at Pos 2 (Left)
    rally = swapRallyCourtOrder(rally, 'b', pairA, pairB);
    assert.deepEqual(rally.orderB, ['b2', 'b1']);

    // Selecting receiver on same team as current server automatically switches server to opposite diagonal pos (#2 -> b1)
    rally = selectRallyRole(rally, 'receiver', 'a2', pairA, pairB);
    assert.equal(rally.serverSlot, 'b1');
    assert.equal(rally.receiverSlot, 'a2');
    assert.equal(rally.serveTurn, 1);

    // Fault at Serve 1 -> Partner b2 Serve 2 diagonally to opposite receiver a1 (#1 Phải)
    rally = advanceRallyServeTurn(rally, pairA, pairB);
    assert.equal(rally.serverSlot, 'b2');
    assert.equal(rally.receiverSlot, 'a1');
    assert.equal(rally.serveTurn, 2);

    // Fault at Serve 2 -> Side-out back to pair A Pos 1 (a1) at Serve 1 -> pair B Pos 1 (b2)
    rally = advanceRallyServeTurn(rally, pairA, pairB);
    assert.equal(rally.serverSlot, 'a1');
    assert.equal(rally.receiverSlot, 'b2');
    assert.equal(rally.serveTurn, 1);

    // Reset to clean orderA=['a1','a2'], orderB=['b1','b2'], a1 -> b1, Serve 1, Set 0:0
    rally = normalizeRallyState(null, pairA, pairB);
    let stats = normalizeSetPlayerStats(null, 1)[0];
    let score = { a: 0, b: 0 };

    // 1. Server ace -> a1 +1 pt, Set A +1, server side SWAPS court order ([a2, a1] -> a1 now #2 Left) AND receiver switches b1 -> b2 (#2 Left)!
    let res = applyRallyOutcomeToSet(stats, score, rally, 'server-ace', pairA, pairB);
    stats = res.statRow;
    score = res.setScore;
    rally = res.rally;
    assert.equal(stats.a1.points, 1);
    assert.equal(stats.b1.errors, 0);
    assert.deepEqual(score, { a: 1, b: 0 });
    assert.deepEqual(rally.orderA, ['a2', 'a1']);
    assert.equal(rally.serverSlot, 'a1');
    assert.equal(rally.serveTurn, 1);
    assert.equal(rally.receiverSlot, 'b2');

    // 2. Receiver error on b2 -> a1 +1 pt, b2 +1 error, Set A +1, server side SWAPS back ([a1, a2] -> a1 #1 Right) AND receiver switches b2 -> b1 (#1 Right)!
    res = applyRallyOutcomeToSet(stats, score, rally, 'receiver-error', pairA, pairB);
    stats = res.statRow;
    score = res.setScore;
    rally = res.rally;
    assert.equal(stats.a1.points, 2);
    assert.equal(stats.b2.errors, 1);
    assert.deepEqual(score, { a: 2, b: 0 });
    assert.deepEqual(rally.orderA, ['a1', 'a2']);
    assert.equal(rally.serverSlot, 'a1');
    assert.equal(rally.serveTurn, 1);
    assert.equal(rally.receiverSlot, 'b1');

    // 3. Server fault -> +1 server error, 0 Set points, Serve 1 -> partner a2 Serve 2 facing b2
    res = applyRallyOutcomeToSet(stats, score, rally, 'server-out', pairA, pairB);
    stats = res.statRow;
    score = res.setScore;
    rally = res.rally;
    assert.equal(stats.a1.errors, 1);
    assert.deepEqual(score, { a: 2, b: 0 });
    assert.equal(rally.serverSlot, 'a2');
    assert.equal(rally.serveTurn, 2);
    assert.equal(rally.receiverSlot, 'b2');

    // 4. Receiver wins rally on b2 -> +1 pt b2, 0 Set points, Serve 2 -> Side-out to b1 Serve 1 facing a1
    res = applyRallyOutcomeToSet(stats, score, rally, 'receiver-win', pairA, pairB);
    stats = res.statRow;
    score = res.setScore;
    rally = res.rally;
    assert.equal(stats.b2.points, 1);
    assert.deepEqual(score, { a: 2, b: 0 });
    assert.equal(rally.serverSlot, 'b1');
    assert.equal(rally.serveTurn, 1);
    assert.equal(rally.receiverSlot, 'a1');

    // Admin UI places WIN badge beside winning team (A1 WIN on A side, B2 WIN on B side), with exact 4 action labels
    const state = createInitialDemoState();
    const adminHtml = renderAdminTab(state, {
        subtab: 'scores',
        selectedMatchId: 'tm_r1_ab',
        rallyBySet: {
            'sm_r1_ab_1:0': { serverSlot: 'a2', receiverSlot: 'b1', serveTurn: 2 }
        },
        rallyUndoBySet: {
            'sm_r1_ab_1:0': [{ setScore: { a: 10, b: 7 } }]
        }
    }, 'local');
    assert.match(adminHtml, /WIN<\/span>\s*<span class="set-team-tag"[^>]*>A1<\/span>/);
    assert.match(adminHtml, /<span class="set-team-tag"[^>]*>B2<\/span>\s*<span class="set-auto-badge win">[^<]*WIN<\/span>/);
    assert.equal(adminHtml.includes('SIDE-OUT'), false);
    assert.ok(adminHtml.includes('tấn công chính xác'));
    assert.ok(adminHtml.includes('đỡ hỏng'));
    assert.ok(adminHtml.includes('phát hỏng'));
    assert.ok(adminHtml.includes('phòng thủ thành công'));
    assert.ok(adminHtml.includes('data-action="swap-court-order"'));
    assert.ok(adminHtml.includes('1 · Phải'));
    assert.ok(adminHtml.includes('2 · Trái'));
    assert.ok(adminHtml.includes('data-action="select-rally-role"'));
    assert.ok(adminHtml.includes('data-action="set-serve-turn"'));
    assert.ok(adminHtml.includes('data-outcome="server-ace"'));
    assert.ok(adminHtml.includes('data-outcome="receiver-error"'));
    assert.ok(adminHtml.includes('data-outcome="server-out"'));
    assert.ok(adminHtml.includes('data-outcome="receiver-win"'));
    assert.ok(adminHtml.includes('data-action="undo-rally-outcome"'));
    assert.ok(adminHtml.includes('data-action="reset-set-stats"'));
    assert.ok(adminHtml.includes('Hoàn tác (1)'));
    assert.ok(adminHtml.includes('Phát 2'));
});
