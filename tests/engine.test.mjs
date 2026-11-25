import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    AWARDS_VISIBILITY_MODES,
    advanceRallyServeTurn,
    anonymizeAwardsLeaderboards,
    applyCourtDragDrop,
    applyRallyOutcomeToSet,
    buildCourtBoard,
    buildPlayerSelectOptionsHtml,
    buildRegisteredPlayerCatalog,
    buildResizedRoster,
    buildTeamMatchSubMatches,
    calculatePairLeaderboard,
    calculatePlayerLeaderboard,
    calculateStandings,
    combineScheduleValue,
    createRallyLogEntry,
    escapeHtml,
    evaluateSetWinner,
    evaluateSubMatch,
    evaluateTeamMatch,
    findDuplicateRosterPlayers,
    formatScheduleDisplay,
    generateRoundRobinSchedule,
    getLevelOrderPresets,
    isDefaultLevelOrder,
    normalizeConfig,
    normalizeLevelOrder,
    normalizeRallyState,
    normalizeSetPlayerStats,
    normalizeSetRallyLogs,
    parseScheduleValue,
    reconcileTeamPairsDisplayNames,
    resolveRegisteredDisplayName,
    resolveSubMatchDivisionLabel,
    resolveSubMatchSchedule,
    sanitizeRegistrationPayload,
    selectRallyRole,
    summarizeRegistrations,
    summarizeSetRallyLog,
    syncTeamPairsWithRegistrationChange,
    swapRallyCourtOrder
} from '../js/tournament-engine.js';
import { createInitialDemoState } from '../js/demo-data.js';
import {
    renderAwardsTab,
    renderLiveSpotlight,
    renderMatchesTab,
    renderRegisterPage,
    renderRulesTab,
    renderStandingsTab,
    renderSubMatchHistoryModal,
    renderTeamDetailModal,
    renderTeamMatchCard,
    renderTeamMatchDetailModal,
    renderTeamsTab,
    renderTvModeView
} from '../js/ui-public.js';
import {
    renderAdminLoginModal,
    renderAdminTab,
    renderEditRegistrationModal
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

    // Playoff matches show inside Lịch Thi Đấu without duplicating on Tổng Quan (standings)
    const appJsSrc = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
    assert.equal(appJsSrc.includes("appState.activeTab === 'standings') tabHtml = renderPlayoffSection"), false);
    state.teamMatches.push({
        id: 'tm_final',
        tournament_id: 'main',
        round_number: 99,
        round_name: 'Chung kết',
        stage: 'playoff',
        team_a_id: state.teams[0].id,
        team_b_id: state.teams[1].id,
        court: 'Sân Trung Tâm',
        scheduled_time: '2026-11-04 16:00',
        status: 'upcoming',
        sort_order: 99,
        note: ''
    });
    const matchesWithPlayoff = renderMatchesTab(state, { status: 'all', round: 'all', teamId: 'all' }, false);
    assert.ok(matchesWithPlayoff.includes('Chung kết'));
    assert.ok(matchesWithPlayoff.includes('Sân Trung Tâm'));
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

    // Scores subtab distinguishes level tiers (lv-1/lv-2/lv-3) and match states (live / ready / upcoming / completed) and per-set states
    const scoresMatch = state.teamMatches[1] || state.teamMatches[0];
    const scoreSubs = state.subMatches.filter((s) => s.team_match_id === scoresMatch.id).sort((a, b) => a.level_index - b.level_index);
    if (scoreSubs.length >= 3) {
        scoreSubs[0].status = 'live';
        scoreSubs[0].sets = [{ a: 11, b: 6 }, { a: 5, b: 4 }, { a: 0, b: 0 }];
        scoreSubs[1].status = 'upcoming';
        scoreSubs[1].sets = [{ a: 0, b: 0 }];
        scoreSubs[1].format_override = { ...(scoreSubs[1].format_override || {}), queueState: 'ready' };
        scoreSubs[2].status = 'upcoming';
        scoreSubs[2].sets = [{ a: 0, b: 0 }];
        scoreSubs[2].format_override = null;
    }
    const scoresHtml = renderAdminTab(state, { subtab: 'scores', selectedMatchId: scoresMatch.id }, 'supabase');
    assert.ok(scoresHtml.includes('scorer-sub-card status-live lv-1 is-collapsed'));
    assert.ok(scoresHtml.includes('scorer-sub-card status-ready lv-2 is-collapsed'));
    assert.ok(scoresHtml.includes('scorer-sub-card status-upcoming lv-3 is-collapsed'));
    assert.ok(scoresHtml.includes('class="scorer-sub-details hidden"'));
    assert.ok(scoresHtml.includes('class="scorer-sub-toggle-space"'));
    assert.ok(scoresHtml.includes('aria-expanded="false"'));
    assert.equal(scoresHtml.includes('is-expanded'), false);
    if (scoreSubs.length >= 1) {
        const expandedHtml = renderAdminTab(state, {
            subtab: 'scores',
            selectedMatchId: scoresMatch.id,
            expandedSubs: { [scoreSubs[0].id]: true }
        }, 'supabase');
        assert.ok(expandedHtml.includes('scorer-sub-card status-live lv-1 is-expanded'));
        assert.ok(expandedHtml.includes(`data-sub-details="${scoreSubs[0].id}"`));
        assert.ok(expandedHtml.includes(`<div class="scorer-sub-details" data-sub-details="${scoreSubs[0].id}">`));
        assert.ok(expandedHtml.includes('aria-expanded="true"'));
    }
    assert.ok(scoresHtml.includes('set-editor-block set-state-completed'));
    assert.ok(scoresHtml.includes('set-editor-block set-state-live'));
    assert.ok(scoresHtml.includes('set-editor-block set-state-waiting'));
    assert.ok(scoresHtml.includes('Trận 1'));
    assert.ok(scoresHtml.includes('Trận 2'));
    assert.ok(scoresHtml.includes('Trận 3'));
    assert.equal(scoresHtml.includes('class="level-pill lv-1"'), false);
    assert.ok(scoresHtml.includes('ĐANG ĐẤU'));
    assert.ok(scoresHtml.includes('Sắp đấu'));
    assert.ok(scoresHtml.includes('scorer-vs-badge has-score'));
    assert.ok(stylesCss.includes('body.mobile-header-hidden') === false);
    assert.ok(stylesCss.includes('.site-header {\n        position: relative;') || stylesCss.includes('.site-header {\r\n        position: relative;'));

    const scheduleHtml = renderAdminTab(state, { subtab: 'schedule' }, 'supabase');
    assert.ok(scheduleHtml.includes('id="admin-generate-rr-form"'));
    assert.equal(scheduleHtml.includes('Circle Method'), false);
    assert.ok(scheduleHtml.includes(`id="sched-team-b"`));
    assert.ok(scheduleHtml.includes(`<option value="${state.teams[1].id}" selected>`));
    assert.ok(scheduleHtml.includes('data-action="admin-edit-match"'));
    assert.ok(scheduleHtml.includes('data-action="delete-match"'));

    const settingsHtml = renderAdminTab(state, { subtab: 'settings' }, 'supabase');
    assert.ok(settingsHtml.includes('id="admin-settings-form"'));
    assert.ok(settingsHtml.includes('class="form-select" name="awardsVisibility"'));
    assert.ok(settingsHtml.includes('data-action="export-json"'));
    assert.ok(settingsHtml.includes('id="admin-import-json-input"'));
    assert.ok(settingsHtml.includes('data-action="reset-demo"'));
    assert.ok(settingsHtml.includes('class="settings-help-details"'));
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
    assert.ok(tvHtml.includes('tv-live-grid'));
    assert.ok(tvHtml.includes('Thoát TV Mode'));
    assert.ok(tvHtml.includes('Set 1'));

    const tvStylesCss = readFileSync(new URL('../css/styles.css', import.meta.url), 'utf8');
    assert.equal(tvStylesCss.includes('.header-actions [data-action="toggle-tv-mode"] {\n        display: none;') || tvStylesCss.includes('.header-actions [data-action="toggle-tv-mode"] {\r\n        display: none;'), false);

    const noLiveState = createInitialDemoState('main');
    noLiveState.teamMatches.forEach((tm) => { tm.status = 'upcoming'; });
    noLiveState.subMatches.forEach((sm) => {
        sm.status = 'upcoming';
        sm.sets = [{ a: 0, b: 0 }];
        sm.winner_override = null;
        sm.format_override = null;
    });
    const emptyTvHtml = renderTvModeView(noLiveState);
    assert.ok(emptyTvHtml.includes('tv-empty-card'));
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

    // 2b. Completed matches list shows compact Final Result card with detail popup trigger; popup renders full PPA Tour sub-match cards
    const completedHtml = renderMatchesTab(state, { status: 'completed', round: 'all', teamId: 'all', view: 'list', query: '' }, false);
    assert.ok(completedHtml.includes('tm-card-compact'));
    assert.ok(completedHtml.includes('data-action="view-match-detail"'));
    assert.equal(completedHtml.includes('ppa-sub-list'), false);

    const completedMatch = state.teamMatches.find((m) => m.status === 'completed');
    assert.ok(completedMatch);
    const detailModalHtml = renderTeamMatchDetailModal(completedMatch.id, state, false);
    assert.ok(detailModalHtml.includes('match-detail-modal-card'));
    assert.ok(detailModalHtml.includes('ppa-pair-row is-winner'));
    assert.ok(detailModalHtml.includes('ppa-winner-badge'));
    assert.ok(detailModalHtml.includes('WINNER'));
    assert.equal(detailModalHtml.includes('ppa-cc-cell'), false);

    // 3. Admin scores tab exposes all 4 pair queue states & reorder controls
    const adminHtml = renderAdminTab(state, { subtab: 'scores', selectedMatchId: liveMatch.id }, 'supabase');
    for (const st of ['upcoming', 'ready', 'live', 'completed']) {
        assert.ok(adminHtml.includes(`data-action="quick-sub-status" data-sub-id="${subs[1].id}" data-status="${st}"`));
    }
    assert.ok(adminHtml.includes('Chưa đấu'));
    assert.ok(adminHtml.includes('Sắp đấu'));
    assert.ok(adminHtml.includes('Đang đấu'));
    assert.ok(adminHtml.includes('Hoàn thành') || adminHtml.includes('✓ Xong'));
    assert.ok(adminHtml.includes('data-action="move-sub-order"'));

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

    // Admin scores tab stays focused on per-pair scoring/overrides; Team Match metadata lives in schedule tab
    const adminScoresHtml = renderAdminTab(state, { subtab: 'scores', selectedMatchId: liveMatch.id }, 'supabase');
    assert.equal(adminScoresHtml.includes('data-action="quick-match-court"'), false);
    assert.equal(adminScoresHtml.includes('data-action="assign-multi-courts"'), false);
    assert.ok(adminScoresHtml.includes('data-action="sub-override-field"'));
    const adminSchedHtml = renderAdminTab(state, { subtab: 'schedule', selectedMatchId: liveMatch.id }, 'supabase');
    assert.ok(adminSchedHtml.includes('name="scheduled_date"'));
    assert.ok(adminSchedHtml.includes('name="note"'));
    assert.ok(adminSchedHtml.includes('admin-meta-note-field'));
    assert.ok(adminSchedHtml.includes('data-action="quick-match-status"'));
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
    assert.ok(awardsHtml.includes('Chiến Thần Tấn Công'));
    assert.ok(awardsHtml.includes('Bậc Thầy Phòng Thủ'));
    assert.ok(awardsHtml.includes('Tuấn Anh'));
    assert.equal(awardsHtml.includes('Giải Phụ'), false);

    const standingsHtml = renderStandingsTab(state, false);
    assert.equal(standingsHtml.includes('Bảng Vinh Danh &amp; Thống Kê Cá Nhân'), false);
    assert.equal(standingsHtml.includes('Giải Phụ'), false);

    const adminScoresHtml = renderAdminTab(state, { subtab: 'scores', selectedMatchId: 'tm_r2_ac' }, 'local');
    assert.equal(adminScoresHtml.includes('data-action="step-player-stat"'), false);
    assert.equal(adminScoresHtml.includes('data-action="input-player-stat"'), false);
    assert.equal(adminScoresHtml.includes('data-action="input-score"'), false);
    assert.equal(adminScoresHtml.includes('data-action="step-score"'), false);
    assert.equal(adminScoresHtml.includes('data-action="toggle-sync-set-score"'), false);
    assert.ok(adminScoresHtml.includes('set-readonly-board'));
    assert.ok(adminScoresHtml.includes('Tấn công'));
    assert.ok(adminScoresHtml.includes('Phòng thủ'));
});

test('Doubles serve turn 1/2, court order 1/2 swap, alternating receiver on score, and Side-Out controls', () => {
    const pairA = { id: 'pA', player_1: 'Hải Đăng', player_2: 'Gia Huy' };
    const pairB = { id: 'pB', player_1: 'Phúc Lâm', player_2: 'Khánh Duy' };

    // Default Start (PPA Tour 0-0-2): Position 1 (Right) a1 serves at Turn 2 to Position 1 (Right) b1
    let rally = normalizeRallyState(null, pairA, pairB);
    assert.deepEqual(rally, {
        serverSlot: 'a1',
        receiverSlot: 'b1',
        serveTurn: 2,
        orderA: ['a1', 'a2'],
        orderB: ['b1', 'b2']
    });

    // Swapping pair B Start positions (1 <-> 2) puts b2 at Pos 1 (Right) and b1 at Pos 2 (Left)
    rally = swapRallyCourtOrder(rally, 'b', pairA, pairB);
    assert.deepEqual(rally.orderB, ['b2', 'b1']);

    // Selecting receiver on same team as current server automatically switches server to opposite diagonal pos (#2 -> b1) at Serve 1
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

    // Reset to clean PPA Tour 0-0-2: orderA=['a1','a2'], orderB=['b1','b2'], a1 -> b1, Serve 2, Set 0:0
    rally = normalizeRallyState(null, pairA, pairB);
    let stats = normalizeSetPlayerStats(null, 1)[0];
    let score = { a: 0, b: 0 };

    // 1. Server ace -> a1 +1 Attack, Set A +1, server side SWAPS court order ([a2, a1] -> a1 now #2 Left) AND receiver switches b1 -> b2 (#2 Left)!
    let res = applyRallyOutcomeToSet(stats, score, rally, 'server-ace', pairA, pairB);
    stats = res.statRow;
    score = res.setScore;
    rally = res.rally;
    assert.equal(stats.a1.points, 1);
    assert.equal(stats.b1.errors, 0);
    assert.deepEqual(score, { a: 1, b: 0 });
    assert.deepEqual(rally.orderA, ['a2', 'a1']);
    assert.equal(rally.serverSlot, 'a1');
    assert.equal(rally.serveTurn, 2);
    assert.equal(rally.receiverSlot, 'b2');

    // 2. Partner attack -> a2 +1 Attack, Set A +1, server side SWAPS back ([a1, a2] -> a1 #1 Right) AND receiver switches b2 -> b1 (#1 Right)!
    res = applyRallyOutcomeToSet(stats, score, rally, 'partner-attack', pairA, pairB);
    stats = res.statRow;
    score = res.setScore;
    rally = res.rally;
    assert.equal(stats.a2.points, 1);
    assert.equal(stats.a1.points, 1);
    assert.deepEqual(score, { a: 2, b: 0 });
    assert.deepEqual(rally.orderA, ['a1', 'a2']);
    assert.equal(rally.serverSlot, 'a1');
    assert.equal(rally.serveTurn, 2);
    assert.equal(rally.receiverSlot, 'b1');

    // 3. Server attack -> a1 +1 Attack (now 2), Set A +1, swaps back to [a2, a1], receiver b2
    res = applyRallyOutcomeToSet(stats, score, rally, 'server-attack', pairA, pairB);
    stats = res.statRow;
    score = res.setScore;
    rally = res.rally;
    assert.equal(stats.a1.points, 2);
    assert.deepEqual(score, { a: 3, b: 0 });
    assert.equal(rally.receiverSlot, 'b2');

    // 4. Recv1 (b1, Pos 1 Right) defense at Serve 2 -> +1 Defense to b1, 0 Set points, immediate Side-Out to b1 Serve 1 facing a2 (#1 Right)
    res = applyRallyOutcomeToSet(stats, score, rally, 'recv1-defense', pairA, pairB);
    stats = res.statRow;
    score = res.setScore;
    rally = res.rally;
    assert.equal(stats.b1.errors, 1);
    assert.deepEqual(score, { a: 3, b: 0 });
    assert.equal(rally.serverSlot, 'b1');
    assert.equal(rally.serveTurn, 1);
    assert.equal(rally.receiverSlot, 'a2');

    // 5. Serve fault on b1 (Serve 1) -> 0 stats change (add-only, never subtract), 0 Set points, Serve 1 -> partner b2 Serve 2 facing a1
    res = applyRallyOutcomeToSet(stats, score, rally, 'serve-fault', pairA, pairB);
    stats = res.statRow;
    score = res.setScore;
    rally = res.rally;
    assert.equal(stats.b1.errors, 1);
    assert.equal(stats.b1.points, 0);
    assert.deepEqual(score, { a: 3, b: 0 });
    assert.equal(rally.serverSlot, 'b2');
    assert.equal(rally.serveTurn, 2);
    assert.equal(rally.receiverSlot, 'a1');

    // 6. Recv2 (a1, Pos 2 Left of orderA=[a2,a1]) defense at Serve 2 -> +1 Defense to a1, 0 Set points, Side-Out to a2 (#1 Right) Serve 1 facing b1
    res = applyRallyOutcomeToSet(stats, score, rally, 'recv2-defense', pairA, pairB);
    stats = res.statRow;
    score = res.setScore;
    rally = res.rally;
    assert.equal(stats.a1.errors, 1);
    assert.deepEqual(score, { a: 3, b: 0 });
    assert.equal(rally.serverSlot, 'a2');
    assert.equal(rally.serveTurn, 1);
    assert.equal(rally.receiverSlot, 'b1');

    // Admin UI places WIN badge beside winning team (A1 WIN on A side, B2 WIN on B side), with exact 6 PPA action buttons on live sets
    const state = createInitialDemoState();
    const adminCompletedHtml = renderAdminTab(state, {
        subtab: 'scores',
        selectedMatchId: 'tm_r1_ab'
    }, 'local');
    assert.match(adminCompletedHtml, /WIN<\/span>\s*<span class="set-team-tag[^"]*"[^>]*>A1<\/span>/);
    assert.match(adminCompletedHtml, /<span class="set-team-tag[^"]*"[^>]*>B2<\/span>\s*<span class="set-auto-badge win">[^<]*WIN<\/span>/);

    const adminHtml = renderAdminTab(state, {
        subtab: 'scores',
        selectedMatchId: 'tm_r2_ac',
        rallyBySet: {
            'sm_r2_ac_2:2': { serverSlot: 'a2', receiverSlot: 'b1', serveTurn: 2 }
        },
        rallyUndoBySet: {
            'sm_r2_ac_2:2': [{ setScore: { a: 7, b: 6 } }]
        }
    }, 'local');
    assert.equal(adminHtml.includes('SIDE-OUT'), false);
    assert.equal(adminHtml.includes('data-outcome="server-ace"'), false);
    assert.ok(adminHtml.includes('tấn công'));
    assert.ok(adminHtml.includes('phòng thủ'));
    assert.ok(adminHtml.includes('Phát hỏng'));
    assert.ok(adminHtml.includes('data-action="swap-court-order"'));
    assert.ok(adminHtml.includes('1 · Phải'));
    assert.ok(adminHtml.includes('2 · Trái'));
    assert.ok(adminHtml.includes('data-action="select-rally-role"'));
    assert.ok(adminHtml.includes('data-action="set-serve-turn"'));
    assert.ok(adminHtml.includes('data-outcome="server-attack"'));
    assert.ok(adminHtml.includes('data-outcome="partner-attack"'));
    assert.ok(adminHtml.includes('data-outcome="recv1-defense"'));
    assert.ok(adminHtml.includes('data-outcome="recv2-defense"'));
    assert.ok(adminHtml.includes('data-outcome="serve-fault"'));
    assert.ok(adminHtml.includes('data-action="undo-rally-outcome"'));
    assert.ok(adminHtml.includes('data-action="reset-set-stats"'));
    assert.ok(adminHtml.includes('Hoàn tác (1)'));
    assert.ok(adminHtml.includes('Phát 2'));
    assert.ok(adminHtml.includes('set-sticky-scorebar'));
    assert.equal(adminHtml.includes('set-player-head'), false);
    // Court simulator order inside set: sticky Set+Score bar -> PPA 3-number call bar -> 2-half court arena -> bottom fault/undo
    assert.ok(adminHtml.includes('ppa-call-numbers'));
    assert.ok(adminHtml.includes('8 - 6 - 2'));
    assert.ok(adminHtml.includes('is-attack-half'));
    assert.ok(adminHtml.includes('is-defense-half'));
    assert.ok(adminHtml.includes('data-court-zone="true"'));
    assert.ok(adminHtml.includes('data-action="swap-court-sides"'));
    assert.ok(adminHtml.includes('<span class="serving-side-tag is-attack">Tấn công</span>'));
    assert.ok(adminHtml.includes('<span class="serving-side-tag is-defense">Phòng thủ</span>'));
    assert.equal(adminHtml.includes('court-role-live-tag'), false);
    assert.ok(adminHtml.indexOf('set-sticky-scorebar') < adminHtml.indexOf('ppa-call-bar'));
    assert.ok(adminHtml.indexOf('ppa-call-bar') < adminHtml.indexOf('court-arena'));
    assert.ok(adminHtml.indexOf('court-arena') < adminHtml.indexOf('court-bottom-actions'));

    const flippedAdminHtml = renderAdminTab(state, {
        subtab: 'scores',
        selectedMatchId: 'tm_r2_ac',
        courtFlippedBySet: { 'sm_r2_ac_2:2': true }
    }, 'local');
    assert.ok(flippedAdminHtml.indexOf('data-court-half="b"') < flippedAdminHtml.indexOf('data-court-half="a"'));

    // Top half places 1·Phải on Left col and 2·Trái on Right col; Bottom half places 2·Trái on Left col and 1·Phải on Right col (Phải chéo Phải, Trái chéo Trái)
    const topHalfMatch = adminHtml.match(/data-court-pos="top"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
    const bottomHalfMatch = adminHtml.match(/data-court-pos="bottom"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
    assert.ok(topHalfMatch && bottomHalfMatch);
    assert.ok(topHalfMatch[0].indexOf('1 · Phải') < topHalfMatch[0].indexOf('2 · Trái'));
    assert.ok(bottomHalfMatch[0].indexOf('2 · Trái') < bottomHalfMatch[0].indexOf('1 · Phải'));

    // Drag-and-drop position swap (same team) & cross-net Server -> Receiver assignment
    let dragRally = normalizeRallyState(null, pairA, pairB);
    dragRally = applyCourtDragDrop(dragRally, 'a1', 'a2', pairA, pairB);
    assert.deepEqual(dragRally.orderA, ['a2', 'a1']);
    dragRally = applyCourtDragDrop(dragRally, 'b2', 'a1', pairA, pairB);
    assert.equal(dragRally.serverSlot, 'b2');
    assert.equal(dragRally.receiverSlot, 'a1');
    assert.equal(dragRally.serveTurn, 1);
    // Changing server within already-serving team B preserves receiver a1
    dragRally = selectRallyRole(dragRally, 'server', 'b1', pairA, pairB);
    assert.equal(dragRally.serverSlot, 'b1');
    assert.equal(dragRally.receiverSlot, 'a1');
});

test('Google-Form-style player registration page and Admin registrations dashboard', () => {
    const clean = sanitizeRegistrationPayload({
        full_name: '  Nguyễn Văn Hải  ',
        display_name: '',
        skill_level: 'Dui dẻ sương sương'
    });
    assert.deepEqual(clean, {
        full_name: 'Nguyễn Văn Hải',
        display_name: 'Nguyễn Văn Hải',
        skill_level: 'Dui dẻ sương sương',
        preferred_partner: '',
        avoid_partner: ''
    });

    assert.throws(() => sanitizeRegistrationPayload({ full_name: ' ', skill_level: 'Dui dẻ sương sương' }));
    assert.throws(() => sanitizeRegistrationPayload({ full_name: 'Bình', skill_level: '' }));

    const state = createInitialDemoState('main');
    // Public scoreboard pages never expose registration tabs or private submitted lists
    const publicMatches = renderMatchesTab(state, { status: 'all', round: 'all', teamId: 'all', query: '' }, false);
    assert.equal(publicMatches.includes('player-registration-form'), false);

    // Registration page displays 2026 branding, the 3 SKILL_LEVEL_OPTIONS tiers, and omits partner questions
    const formHtml = renderRegisterPage(state.tournament, {});
    assert.ok(formHtml.includes('id="player-registration-form"'));
    assert.ok(formHtml.includes('VACIF · PICKLEBEER 2026'));
    assert.ok(formHtml.includes('quay cặp đấu, phân đội'));
    assert.ok(formHtml.includes('Họ và tên'));
    assert.ok(formHtml.includes('Tên thi đấu'));
    assert.ok(formHtml.includes('Trình độ (Tự đánh giá)'));
    assert.ok(formHtml.includes('value="Lv1 - Bậc thầy lão luyện"'));
    assert.ok(formHtml.includes('value="Lv2 - Dui dẻ sương sương"'));
    assert.ok(formHtml.includes('value="Lv3 - Mầm non tập sự"'));
    assert.equal(formHtml.includes('Bạn muốn đánh cặp với ai?'), false);
    assert.equal(formHtml.includes('Bạn không muốn đánh cặp với ai?'), false);

    const receiptHtml = renderRegisterPage(state.tournament, { submittedReceipt: clean });
    assert.ok(receiptHtml.includes('✓ Đã ghi nhận đăng ký'));
    assert.ok(receiptHtml.includes('Nguyễn Văn Hải'));

    const closedHtml = renderRegisterPage({
        ...state.tournament,
        config: { ...state.tournament.config, registrationOpen: false }
    }, {});
    assert.ok(closedHtml.includes('tạm đóng'));
    assert.equal(closedHtml.includes('id="player-registration-form"'), false);

    // Admin Registrations stats and table normalize legacy labels and sort descending from Lv1 -> Lv3
    const sampleRegs = [
        { full_name: 'Lê Minh', display_name: 'Minh', skill_level: 'Mầm non tập sự', id: 'reg_low', status: 'pending', created_at: '2026-11-19T08:00:00Z' },
        { ...clean, id: 'reg_1', status: 'pending', created_at: '2026-11-19T08:02:00Z' },
        { full_name: 'Trần Quốc Bảo', display_name: 'Quốc Bảo', skill_level: 'Lv1 - Bậc thầy lão luyện', id: 'reg_top', status: 'approved', created_at: '2026-11-19T08:05:00Z' }
    ];
    const summary = summarizeRegistrations(sampleRegs);
    assert.equal(summary.total, 3);
    assert.equal(summary.approved, 1);
    assert.equal(summary.pending, 2);
    assert.deepEqual(
        summary.bySkill.map((s) => s.label),
        ['Lv1 - Bậc thầy lão luyện', 'Lv2 - Dui dẻ sương sương', 'Lv3 - Mầm non tập sự']
    );
    assert.equal(summary.bySkill[0].count, 1);
    assert.equal(summary.bySkill[1].count, 1);
    assert.equal(summary.bySkill[2].count, 1);

    const adminRegHtml = renderAdminTab(state, {
        subtab: 'registrations',
        registrations: sampleRegs,
        registrationsTableMissing: true
    }, 'supabase');
    assert.ok(adminRegHtml.includes('Đăng Ký (3)'));
    assert.ok(adminRegHtml.includes('CREATE TABLE IF NOT EXISTS public.player_registrations'));
    assert.ok(adminRegHtml.includes('data-action="copy-register-link"'));
    assert.ok(adminRegHtml.includes('data-action="export-registrations-csv"'));
    // Row ordering puts Quốc Bảo (Lv1) above Nguyễn Văn Hải (Lv2) above Lê Minh (Lv3)
    assert.ok(adminRegHtml.indexOf('Quốc Bảo') < adminRegHtml.indexOf('Nguyễn Văn Hải'));
    assert.ok(adminRegHtml.indexOf('Nguyễn Văn Hải') < adminRegHtml.indexOf('Minh'));
    // Approved row renders static approved badge + Edit & Delete buttons (no downgrade toggle back to pending)
    assert.ok(adminRegHtml.includes('class="tag reg-status-pill-row is-approved">✓ Đã duyệt</span>'));
    assert.equal(adminRegHtml.includes('data-next-status="pending"'), false);
    assert.ok(adminRegHtml.includes('data-action="toggle-reg-status"'));
    assert.ok(adminRegHtml.includes('data-action="edit-registration"'));
    assert.ok(adminRegHtml.includes('data-action="delete-registration"'));

    // Edit registration modal allows BTC to fix overstated/wrong player level & name
    const editModalHtml = renderEditRegistrationModal(sampleRegs[2]);
    assert.ok(editModalHtml.includes('id="admin-edit-registration-form"'));
    assert.ok(editModalHtml.includes('data-reg-id="reg_top"'));
    assert.ok(editModalHtml.includes('value="Trần Quốc Bảo"'));
    assert.ok(editModalHtml.includes('name="skill_level"'));
    assert.ok(editModalHtml.includes('value="Lv1 - Bậc thầy lão luyện" selected'));
});

test('Awards visibility supports public, anonymous codenames (no leaks), and hidden modes', () => {
    const state = createInitialDemoState('main');
    const sm1 = state.subMatches[0];
    sm1.status = 'completed';
    sm1.sets = [{ a: 11, b: 6 }, { a: 11, b: 8 }];
    sm1.winner = 'A';
    sm1.format_override = {
        setPlayerStats: [
            { a1: { points: 7, errors: 1 }, a2: { points: 4, errors: 2 }, b1: { points: 3, errors: 3 }, b2: { points: 3, errors: 2 } },
            { a1: { points: 8, errors: 0 }, a2: { points: 3, errors: 1 }, b1: { points: 5, errors: 2 }, b2: { points: 3, errors: 1 } }
        ]
    };

    const configPublic = normalizeConfig(state.tournament.config);
    assert.equal(configPublic.awardsVisibility, 'public');
    assert.deepEqual(AWARDS_VISIBILITY_MODES, ['public', 'anonymous', 'hidden']);

    // Collect every real player name and team name/code to verify zero leakage in masked modes
    const rawPairs = calculatePairLeaderboard(state.teams, state.teamPairs, state.teamMatches, state.subMatches, configPublic);
    const rawPlayers = calculatePlayerLeaderboard(state.teams, state.teamPairs, state.teamMatches, state.subMatches, configPublic);
    const realTeamNames = state.teams.map((t) => t.name);
    const realPlayerNames = rawPlayers.byPoints.map((p) => p.name);
    const topPlayer = rawPlayers.byPoints[0];
    const topPlayerName = topPlayer.name;
    const topPointsLabel = `${topPlayer.totalPoints} điểm`;
    const topFirstRoundPts = `+${topPlayer.matchLogs[0].points}đ`;

    // 1. Hidden mode: public viewer cannot see preview on Standings or leaderboard data on Awards
    const hiddenState = {
        ...state,
        tournament: { ...state.tournament, config: { ...state.tournament.config, awardsVisibility: 'hidden' } }
    };
    const hiddenStandings = renderStandingsTab(hiddenState, false);
    assert.equal(hiddenStandings.includes('Bảng Vinh Danh &amp; Thống Kê Cá Nhân'), false);
    const hiddenAwardsPublic = renderAwardsTab(hiddenState, {}, false);
    assert.ok(hiddenAwardsPublic.includes('đang tạm ẩn'));
    assert.equal(hiddenAwardsPublic.includes(topPlayerName), false);
    assert.equal(hiddenAwardsPublic.includes(topPointsLabel), false);

    // Admin in Hidden mode still sees real names and switcher controls
    const hiddenAwardsAdmin = renderAwardsTab(hiddenState, {}, true);
    assert.ok(hiddenAwardsAdmin.includes(topPlayerName));
    assert.ok(hiddenAwardsAdmin.includes('data-action="set-awards-visibility"'));
    assert.equal(renderStandingsTab(hiddenState, true).includes('Bảng Vinh Danh &amp; Thống Kê Cá Nhân'), false);

    // 2. Anonymous mode: per-session 3-digit codes ("Cặp đôi XXX" / "Cá nhân XXX"), centered "?" team cells, no match details
    const anonState = {
        ...state,
        tournament: {
            ...state.tournament,
            config: { ...state.tournament.config, awardsVisibility: 'anonymous', awardsMaskSeed: 7 }
        }
    };
    const anonStandingsPublic = renderStandingsTab(anonState, false, 101);
    const anonAwardsPublic = renderAwardsTab(anonState, { query: topPlayerName, teamId: state.teams[0].id }, false, 101);
    const anonAwardsReloaded = renderAwardsTab(anonState, {}, false, 202);

    assert.equal(anonStandingsPublic.includes('Bảng Vinh Danh &amp; Thống Kê Cá Nhân'), false);
    assert.ok(anonAwardsPublic.includes('Bảng Xếp Hạng'));
    assert.ok(anonAwardsPublic.includes(topPointsLabel));
    assert.ok(anonAwardsPublic.includes(String(topPlayer.totalPoints)));
    assert.ok(anonAwardsPublic.includes('<th>Đội</th>'));
    assert.ok(anonAwardsPublic.includes('<td>\n                    <span class="team-code-dot sm" style="background:#64748b">?</span>'));
    assert.equal(anonAwardsPublic.includes('<th class="col-left">Đội</th>'), false);
    assert.equal(anonAwardsPublic.includes('Giải Phụ'), false);
    assert.equal(anonAwardsPublic.includes('Chế độ Ẩn danh đang bật'), false);
    assert.equal(anonAwardsPublic.includes('Đội ẩn danh'), false);
    assert.equal(anonAwardsPublic.includes('Level ẩn danh'), false);
    assert.equal(anonAwardsPublic.includes('Chi Tiết Điểm Sau Mỗi Trận'), false);
    assert.equal(anonAwardsPublic.includes('Chi Tiết Từng Trận'), false);
    assert.equal(anonAwardsPublic.includes(topFirstRoundPts), false);
    assert.equal(anonAwardsPublic.includes('id="awards-search-input"'), false);
    assert.equal(anonAwardsPublic.includes('data-action="awards-filter-team"'), false);
    assert.equal(anonAwardsPublic.includes(`vs ${topPlayer.matchLogs[0].opponentLabel}`), false);
    assert.equal(anonAwardsPublic.includes(' vs '), false);

    // Admin still gets left-aligned team/level/pair columns with real names and details
    const anonAwardsAdmin = renderAwardsTab(anonState, {}, true, 101);
    assert.ok(anonAwardsAdmin.includes('<th class="col-left">Đội</th>'));
    assert.ok(anonAwardsAdmin.includes(topPlayerName));

    for (const realTeam of realTeamNames) {
        assert.equal(anonAwardsPublic.includes(realTeam), false, `Leaked team name in anonymous awards: ${realTeam}`);
    }
    for (const realPlayer of realPlayerNames) {
        assert.equal(anonAwardsPublic.includes(realPlayer), false, `Leaked player name in anonymous awards: ${realPlayer}`);
        assert.equal(anonStandingsPublic.includes(realPlayer), false, `Leaked player name in anonymous standings: ${realPlayer}`);
    }

    // Per-page-load seed consistency between Standings card and Awards tab, uniqueness, and new codes on reload
    const maskedSeed101 = anonymizeAwardsLeaderboards(rawPairs, rawPlayers, 101);
    const maskedSeed202 = anonymizeAwardsLeaderboards(rawPairs, rawPlayers, 202);
    const uniqueNames101 = new Set(maskedSeed101.playerBoard.byPoints.map((p) => p.name));
    const uniquePairs101 = new Set(maskedSeed101.pairRows.map((r) => r.playersText));
    assert.equal(uniqueNames101.size, rawPlayers.byPoints.length);
    assert.equal(uniquePairs101.size, rawPairs.length);
    assert.match(maskedSeed101.pairRows[0].playersText, /^Cặp đôi \d{3}$/);
    assert.match(maskedSeed101.playerBoard.byPoints[0].name, /^Cá nhân \d{3}$/);
    assert.equal(maskedSeed101.pairRows[0].team.name, '?');
    assert.equal(maskedSeed101.pairRows[0].levelName, '?');
    assert.equal(maskedSeed101.playerBoard.byPoints[0].pairLabel, '?');
    assert.deepEqual(maskedSeed101.playerBoard.byPoints[0].matchLogs, []);
    assert.equal(anonStandingsPublic.includes(maskedSeed101.playerBoard.byPoints[0].name), false);
    assert.ok(anonAwardsPublic.includes(maskedSeed101.playerBoard.byPoints[0].name));
    assert.ok(anonAwardsReloaded.includes(maskedSeed202.playerBoard.byPoints[0].name));
    assert.notEqual(maskedSeed101.playerBoard.byPoints[0].name, maskedSeed202.playerBoard.byPoints[0].name);
    assert.notDeepEqual(
        maskedSeed101.playerBoard.byPoints.map((p) => p.name),
        maskedSeed202.playerBoard.byPoints.map((p) => p.name)
    );
});

test('roster player catalog, exclusive select options, duplicate detection, and teams subtab UI', () => {
    const registrations = [
        { id: 'r1', full_name: 'Nguyễn Văn An', display_name: 'An', skill_level: 'Lv3 - Mầm non tập sự', status: 'approved' },
        { id: 'r2', full_name: 'Trần Thị Bình', display_name: 'Bình', skill_level: 'Lv1 - Bậc thầy lão luyện', status: 'pending' },
        { id: 'r3', full_name: 'Lê Minh An', display_name: 'An', skill_level: 'Lv2 - Dui dẻ sương sương', status: 'approved' },
        { id: 'r4', full_name: 'Phạm Quốc Cường', display_name: 'Cường', skill_level: 'Lv1 - Bậc thầy lão luyện', status: 'approved' },
        { id: 'r5', full_name: 'Vũ Bị Từ Chối', display_name: 'Blocked', skill_level: 'Lv1 - Bậc thầy lão luyện', status: 'rejected' }
    ];

    const catalog = buildRegisteredPlayerCatalog(registrations);
    assert.equal(catalog.length, 4);
    assert.equal(catalog.some((entry) => entry.value === 'Blocked'), false);

    // Approved entries sorted before pending; within approved, Lv1 -> Lv2 -> Lv3
    assert.equal(catalog[0].value, 'Cường');
    assert.equal(catalog[0].label, 'Cường · Lv1');
    assert.equal(catalog[0].levelIndex, 1);
    assert.equal(catalog[3].value, 'Bình');
    assert.equal(catalog[3].status, 'pending');

    // Blank / whitespace display_name defaults seamlessly to full_name across catalog & options
    const blankNickCatalog = buildRegisteredPlayerCatalog([
        { id: 'rx', full_name: 'Đỗ Hoàng Nam', display_name: '   ', skill_level: 'Lv1 - Bậc thầy lão luyện', status: 'approved' }
    ]);
    assert.equal(blankNickCatalog[0].value, 'Đỗ Hoàng Nam');
    assert.equal(blankNickCatalog[0].label, 'Đỗ Hoàng Nam · Lv1');
    assert.equal(resolveRegisteredDisplayName({ full_name: 'Đỗ Hoàng Nam', display_name: '' }), 'Đỗ Hoàng Nam');

    // Stored pair slot with unique full_name maps cleanly to player's Tên thi đấu in dropdown
    const fullNameMappedHtml = buildPlayerSelectOptionsHtml(catalog, new Set(), 'Phạm Quốc Cường', 1);
    assert.ok(fullNameMappedHtml.includes('value="Cường" selected>Cường · Lv1</option>'));

    // Editing Tên thi đấu (or clearing it back to blank -> full_name) syncs across teamPairs
    const nextRegsRenamed = registrations.map((r) => (
        r.id === 'r4' ? { ...r, display_name: 'Cường Smash' } : r
    ));
    const renamedResult = syncTeamPairsWithRegistrationChange(
        [{ id: 'p1', pair_label: 'A1', level_index: 1, player_1: 'Cường', player_2: 'Bình' }],
        registrations,
        nextRegsRenamed,
        'r4'
    );
    assert.equal(renamedResult.changed, true);
    assert.equal(renamedResult.teamPairs[0].player_1, 'Cường Smash');

    const clearedNickRegs = nextRegsRenamed.map((r) => (
        r.id === 'r4' ? { ...r, display_name: 'Phạm Quốc Cường' } : r
    ));
    const clearedResult = syncTeamPairsWithRegistrationChange(
        renamedResult.teamPairs,
        nextRegsRenamed,
        clearedNickRegs,
        'r4'
    );
    assert.equal(clearedResult.changed, true);
    assert.equal(clearedResult.teamPairs[0].player_1, 'Phạm Quốc Cường');

    // Reconciling un-synced full_name slots updates them to Tên thi đấu
    const reconciled = reconcileTeamPairsDisplayNames(
        [{ id: 'p1', pair_label: 'A1', level_index: 1, player_1: 'Phạm Quốc Cường', player_2: 'Trần Thị Bình' }],
        registrations
    );
    assert.equal(reconciled.changed, true);
    assert.deepEqual(
        [reconciled.teamPairs[0].player_1, reconciled.teamPairs[0].player_2],
        ['Cường', 'Bình']
    );

    // Duplicate display_name values are disambiguated so keys/values stay unique
    const uniqueValues = new Set(catalog.map((entry) => entry.value));
    const uniqueKeys = new Set(catalog.map((entry) => entry.key));
    assert.equal(uniqueValues.size, 4);
    assert.equal(uniqueKeys.size, 4);

    // buildPlayerSelectOptionsHtml strictly shows only players matching targetLevel and excludes otherAssignedKeys
    const otherAssigned = new Set(['cường']);
    const optHtmlForLv1 = buildPlayerSelectOptionsHtml(catalog, otherAssigned, '', 1);
    assert.equal(optHtmlForLv1.includes('value="Cường"'), false);
    assert.ok(optHtmlForLv1.includes('value="Bình"'));
    assert.equal(optHtmlForLv1.includes('value="An (Lê)"'), false);
    assert.equal(optHtmlForLv1.includes('value="An (Nguyễn)"'), false);

    const optHtmlForLv2 = buildPlayerSelectOptionsHtml(catalog, otherAssigned, '', 2);
    assert.ok(optHtmlForLv2.includes('value="An (Lê)"'));
    assert.equal(optHtmlForLv2.includes('value="Bình"'), false);
    assert.equal(optHtmlForLv2.includes('value="An (Nguyễn)"'), false);
    assert.equal(optHtmlForLv2.includes('Level khác'), false);

    // Pre-selected player whose registered level changed to another tier stays preserved with mismatch warning
    const mismatchOptHtml = buildPlayerSelectOptionsHtml(catalog, otherAssigned, 'Bình', 2);
    assert.ok(mismatchOptHtml.includes('value="Bình" selected>Bình (Đang Lv1 — lệch hạng)</option>'));
    assert.ok(mismatchOptHtml.includes('value="An (Lê)"'));

    // Non-registered legacy player name stays selectable with (Ngoài ĐK) badge until changed
    const legacyOptHtml = buildPlayerSelectOptionsHtml(catalog, otherAssigned, 'Minh Khôi', 1);
    assert.ok(legacyOptHtml.includes('value="Minh Khôi" selected>Minh Khôi (Ngoài ĐK)</option>'));

    // findDuplicateRosterPlayers catches same player across slots/teams (case-insensitive)
    assert.deepEqual(
        findDuplicateRosterPlayers([
            { pair_label: 'A1', level_index: 1, player_1: 'Cường', player_2: 'Bình' },
            { pair_label: 'B1', level_index: 1, player_1: 'cường', player_2: 'An' }
        ]).map((d) => ({ name: d.name, slots: d.slots })),
        [{ name: 'Cường', slots: ['A1', 'B1'] }]
    );
    assert.deepEqual(
        findDuplicateRosterPlayers([
            { pair_label: 'A1', level_index: 1, player_1: 'Cường', player_2: 'Bình' },
            { pair_label: 'B1', level_index: 1, player_1: 'Minh Khôi', player_2: '' }
        ]),
        []
    );

    // Admin Teams subtab UI check: concise resize form, single save button, registered dropdowns
    const state = createInitialDemoState();
    state.teams = state.teams.slice(0, 2);
    state.teamPairs = [
        { id: 'p1', team_id: state.teams[0].id, level_index: 1, pair_label: 'A1', player_1: 'Cường', player_2: 'Legacy Player' },
        { id: 'p2', team_id: state.teams[1].id, level_index: 1, pair_label: 'B1', player_1: '', player_2: '' }
    ];
    const html = renderAdminTab(state, {
        subtab: 'teams',
        registrations: [registrations[1], registrations[3], registrations[4]]
    }, 'supabase');

    assert.ok(html.includes('>Áp dụng</button>'));
    assert.equal(html.includes('Tăng số đội sẽ giữ nguyên'), false);
    assert.equal(html.split('data-action="save-all-roster"').length - 1, 1);
    assert.ok(html.includes('data-action="roster-player-select"'));
    assert.ok(html.includes('Legacy Player (Ngoài ĐK)'));

    // On pair B1 (empty slots), 'Cường' is already assigned to A1 so must NOT appear in B1's selects
    const b1Idx = html.indexOf('aria-label="Người chơi 1 B1"');
    assert.ok(b1Idx > -1);
    const b1EndIdx = html.indexOf('</div>', b1Idx);
    const b1Html = html.slice(b1Idx, b1EndIdx);
    assert.equal(b1Html.includes('value="Cường"'), false);
    assert.ok(b1Html.includes('value="Bình"'));
});

test('persistent per-set rally history log, analytics summary, and play-by-play modal', () => {
    const state = createInitialDemoState('main');
    const sm = state.subMatches[0];
    const tm = state.teamMatches.find((m) => m.id === sm.team_match_id);
    const pairA = state.teamPairs.find((p) => p.id === sm.pair_a_id);
    const pairB = state.teamPairs.find((p) => p.id === sm.pair_b_id);
    const teamsMap = new Map(state.teams.map((t) => [t.id, t]));
    const pairsMap = new Map(state.teamPairs.map((p) => [p.id, p]));

    let rally = normalizeRallyState(null, pairA, pairB);
    let score = { a: 0, b: 0 };
    let statRow = normalizeSetPlayerStats(null, 1)[0];
    const logs = [];

    const sequence = ['server-ace', 'partner-attack', 'recv1-defense', 'serve-fault', 'recv2-defense'];
    sequence.forEach((outcome, i) => {
        const res = applyRallyOutcomeToSet(statRow, score, rally, outcome, pairA, pairB);
        const entry = createRallyLogEntry({
            seq: i + 1,
            rallyBefore: rally,
            outcome,
            result: res,
            scoreBefore: score,
            pairA,
            pairB,
            timestamp: `2026-11-20T09:00:0${i}Z`
        });
        assert.ok(entry);
        logs.push(entry);
        statRow = res.statRow;
        score = res.setScore;
        rally = res.rally;
    });

    assert.equal(logs.length, 5);
    assert.equal(logs[0].call, '0-0-2');
    assert.equal(logs[0].scored, true);
    assert.equal(logs[0].a, 1);
    assert.equal(logs[1].call, '1-0-2');
    assert.equal(logs[1].a, 2);
    // Rally 3 recv1-defense at 2-0-2 causes immediate Side-Out to Side B Serve 1!
    assert.equal(logs[2].sideOut, true);
    assert.equal(logs[2].nextTurn, 1);
    // Rally 4 serve-fault at 0-2-1 stays with Side B Serve 2; Rally 5 recv2-defense causes Side-Out back to Side A Serve 1!
    assert.equal(logs[3].sideOut, false);
    assert.equal(logs[3].nextTurn, 2);
    assert.equal(logs[4].sideOut, true);
    assert.equal(logs[4].nextTurn, 1);

    const normalized = normalizeSetRallyLogs([logs, [{ invalid: true }]], 2);
    assert.equal(normalized[0].length, 5);
    assert.equal(normalized[1].length, 0);

    const summary = summarizeSetRallyLog(normalized[0]);
    assert.equal(summary.totalRallies, 5);
    assert.equal(summary.scoringRallies, 2);
    assert.equal(summary.sideOuts, 2);
    assert.equal(summary.maxRunA, 2);
    assert.equal(summary.largestLeadA, 2);
    assert.equal(summary.timeline.length, 6);

    sm.sets = [{ a: score.a, b: score.b }];
    sm.format_override = { ...(sm.format_override || {}), setPlayerStats: [statRow], setRallyLogs: normalized };

    const adminHtml = renderAdminTab(state, { subtab: 'scores', selectedMatchId: tm.id }, 'supabase');
    assert.ok(adminHtml.includes(`data-action="view-set-history" data-sub-id="${sm.id}" data-set-idx="0"`));
    assert.ok(adminHtml.includes('Chi tiết (5)'));

    const publicCardHtml = renderTeamMatchCard(tm, {
        teamsMap,
        pairsMap,
        subMatches: state.subMatches,
        config: state.tournament.config
    }, false);
    assert.ok(publicCardHtml.includes(`data-action="view-set-history" data-sub-id="${sm.id}"`));

    const modalHtml = renderSubMatchHistoryModal(sm.id, state, { setIdx: 0, filter: 'all', sortDesc: false });
    assert.ok(modalHtml.includes('Chi Tiết Diễn Biến Từng Lượt'));
    assert.equal(modalHtml.split('class="history-hero-players"').length - 1, 2);
    assert.equal(modalHtml.split('class="history-player-line"').length - 1, 4);
    assert.ok(modalHtml.includes('history-hero-center'));
    assert.ok(modalHtml.includes('history-hero-score'));
    assert.ok(modalHtml.includes('history-svg'));
    assert.ok(modalHtml.includes('⇄ Đổi giao'));
    assert.ok(modalHtml.includes('0-0-2'));
});

test('customizable level court entry order and cross-level team pairings in auto schedule and match builder', () => {
    assert.deepEqual(normalizeLevelOrder('3-2-1', 3), [3, 2, 1]);
    assert.deepEqual(normalizeLevelOrder([2, 3, 1], 3), [2, 3, 1]);
    assert.deepEqual(normalizeLevelOrder('2', 3), [2, 1, 3]);
    assert.equal(isDefaultLevelOrder([1, 2, 3], [1, 2, 3], 3), true);
    assert.equal(isDefaultLevelOrder([3, 2, 1], [3, 2, 1], 3), false);
    assert.equal(isDefaultLevelOrder([1, 2, 3], [2, 3, 1], 3), false);

    const presets = getLevelOrderPresets(3, ['Level 1', 'Level 2', 'Level 3']);
    assert.equal(presets.length, 6);
    assert.equal(presets[0].key, '1-2-3');
    assert.equal(presets[1].key, '3-2-1');

    const { teams, teamPairs } = buildResizedRoster([], [], 4, 3, 'main');
    const pairsMap = new Map(teamPairs.map((p) => [p.id, p]));
    const teamsMap = new Map(teams.map((t) => [t.id, t]));

    // 1. Reverse head-to-head order: Level 3 -> Level 2 -> Level 1 goes on court first
    const schedRev = generateRoundRobinSchedule(teams, teamPairs, {
        levelsCount: 3,
        levelOrderA: [3, 2, 1],
        levelOrderB: [3, 2, 1]
    });
    const firstMatch = schedRev.teamMatches[0];
    const evalRev = evaluateTeamMatch(firstMatch, schedRev.subMatches, { levelsCount: 3 });
    assert.deepEqual(evalRev.subMatches.map((sm) => sm.level_index), [3, 2, 1]);
    assert.deepEqual(evalRev.subMatches.map((sm) => sm.format_override?.displayOrder), [1, 2, 3]);
    assert.equal(pairsMap.get(evalRev.subMatches[0].pair_a_id).level_index, 3);
    assert.equal(pairsMap.get(evalRev.subMatches[0].pair_b_id).level_index, 3);

    // 2. Asymmetric level lineup between Team A ([2, 3, 1]) and Team B ([3, 1, 2])
    const pairLookup = new Map(teamPairs.map((p) => [`${p.team_id}:${p.level_index}`, p.id]));
    const crossSubs = buildTeamMatchSubMatches('tm_cross', teams[0].id, teams[1].id, pairLookup, {
        levelsCount: 3,
        levelOrderA: [2, 3, 1],
        levelOrderB: [3, 1, 2]
    });
    assert.equal(crossSubs.length, 3);
    assert.equal(pairsMap.get(crossSubs[0].pair_a_id).pair_label, 'A2');
    assert.equal(pairsMap.get(crossSubs[0].pair_b_id).pair_label, 'B3');
    assert.equal(resolveSubMatchDivisionLabel(crossSubs[0], { levelsCount: 3, levelNames: ['Level 1', 'Level 2', 'Level 3'] }, pairsMap.get(crossSubs[0].pair_a_id), pairsMap.get(crossSubs[0].pair_b_id)), 'Level 2 vs Level 3');

    const state = createInitialDemoState('main');
    const schedTabHtml = renderAdminTab(state, { subtab: 'schedule' }, 'local');
    assert.equal(schedTabHtml.includes('id="rr-level-order-a"'), false);
    assert.equal(schedTabHtml.includes('id="sched-level-order-a"'), false);

    // Make subMatch 1 LIVE, subMatch 2 COMPLETED (with 1 completed set + 1 live set), and subMatch 3 UPCOMING
    const tm0 = state.teamMatches[0];
    const tm0Subs = state.subMatches.filter((s) => s.team_match_id === tm0.id).sort((a, b) => a.level_index - b.level_index);
    tm0Subs[0].status = 'live';
    tm0Subs[0].sets = [{ a: 11, b: 6 }, { a: 4, b: 2 }];
    tm0Subs[1].status = 'completed';
    tm0Subs[1].sets = [{ a: 11, b: 5 }, { a: 11, b: 7 }];
    tm0Subs[2].status = 'upcoming';
    tm0Subs[2].sets = [{ a: 0, b: 0 }];

    const scoresTabHtml = renderAdminTab(state, {
        subtab: 'scores',
        selectedMatchId: tm0.id,
        expandedSubs: { [tm0Subs[0].id]: true, [tm0Subs[1].id]: true, [tm0Subs[2].id]: true }
    }, 'local');
    assert.ok(scoresTabHtml.includes('data-action="sub-pair-select"'));
    assert.ok(scoresTabHtml.includes('>Trận 1<'));
    assert.equal(scoresTabHtml.includes('Cặp Team A'), false);
    assert.ok(scoresTabHtml.includes('>Level 1</option>'));
    assert.ok(scoresTabHtml.includes('>Level 2</option>'));
    assert.ok(scoresTabHtml.includes('>Level 3</option>'));

    // Completed Set 1 in Trận 1 completely omits the court scorer box (only shows again if reset), while live Set 2 in Trận 1 is expanded
    assert.ok(scoresTabHtml.includes('set-editor-block set-state-completed is-set-collapsed'));
    assert.equal(scoresTabHtml.includes(`data-set-details="${tm0Subs[0].id}:0"`), false);
    assert.ok(scoresTabHtml.includes('set-editor-block set-state-live is-set-expanded'));
    assert.ok(scoresTabHtml.includes(`class="set-player-box court-simulator-box" data-set-details="${tm0Subs[0].id}:1"`));

    // When a sub-match already has 3 sets, the '+ Thêm Set' button is hidden
    tm0Subs[0].sets = [{ a: 11, b: 6 }, { a: 8, b: 11 }, { a: 4, b: 2 }];
    const scores3SetsHtml = renderAdminTab(state, {
        subtab: 'scores',
        selectedMatchId: tm0.id,
        expandedSubs: { [tm0Subs[0].id]: true }
    }, 'local');
    assert.equal(scores3SetsHtml.includes(`data-action="add-set" data-sub-id="${tm0Subs[0].id}"`), false);
    assert.ok(scores3SetsHtml.includes(`data-action="add-set" data-sub-id="${tm0Subs[2].id}"`));

    // In Trận 3 (upcoming), neither Level 1 (LIVE in Trận 1) nor Level 2 (COMPLETED in Trận 2) is in the dropdown options
    const sub3BlockStart = scoresTabHtml.indexOf(`data-sub-details="${tm0Subs[2].id}"`);
    const sub3BlockEnd = scoresTabHtml.indexOf('set-editor-block', sub3BlockStart);
    const sub3ToolbarHtml = scoresTabHtml.slice(sub3BlockStart, sub3BlockEnd);
    assert.equal(sub3ToolbarHtml.includes('>Level 1</option>'), false);
    assert.equal(sub3ToolbarHtml.includes('>Level 2</option>'), false);
    assert.ok(sub3ToolbarHtml.includes('>Level 3</option>'));
});
