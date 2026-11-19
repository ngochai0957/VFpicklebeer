import { DEFAULT_CONFIG } from './tournament-engine.js';

/**
 * Generates a realistic initial Team League (Fixed Lineup) dataset
 * matching the 4-team x 3-level format with Ben Johns / PPA set-by-set scoring.
 */
export function createInitialDemoState(tournamentId = 'main') {
    const tournament = {
        id: tournamentId,
        name: 'VACIF PickleBeer Team League 2026',
        subtitle: 'Giải đồng đội VACIF • Đội hình cố định (Fixed Lineup) • Tỉ số từng Set',
        status: 'live',
        config: {
            ...DEFAULT_CONFIG,
            bestOf: 3,
            pointsPerSet: 11,
            winByTwo: true,
            pointCap: 0,
            levelsCount: 3,
            levelNames: ['Level 1', 'Level 2', 'Level 3'],
            doubleRoundRobin: false
        },
        updated_at: new Date().toISOString()
    };

    const teams = [
        { id: 'team_a', tournament_id: tournamentId, code: 'A', name: 'Team A — Smash Lab', color: '#2563EB', seed_order: 1 },
        { id: 'team_b', tournament_id: tournamentId, code: 'B', name: 'Team B — Dink Kings', color: '#7C3AED', seed_order: 2 },
        { id: 'team_c', tournament_id: tournamentId, code: 'C', name: 'Team C — Kitchen Aces', color: '#059669', seed_order: 3 },
        { id: 'team_d', tournament_id: tournamentId, code: 'D', name: 'Team D — Spin Hunters', color: '#D97706', seed_order: 4 }
    ];

    const teamPairs = [
        { id: 'pair_a_1', team_id: 'team_a', level_index: 1, pair_label: 'A1', player_1: 'Minh Khôi', player_2: 'Hoàng Nam' },
        { id: 'pair_a_2', team_id: 'team_a', level_index: 2, pair_label: 'A2', player_1: 'Tuấn Anh', player_2: 'Quốc Bảo' },
        { id: 'pair_a_3', team_id: 'team_a', level_index: 3, pair_label: 'A3', player_1: 'Hải Đăng', player_2: 'Gia Huy' },

        { id: 'pair_b_1', team_id: 'team_b', level_index: 1, pair_label: 'B1', player_1: 'Đức Thịnh', player_2: 'Văn Long' },
        { id: 'pair_b_2', team_id: 'team_b', level_index: 2, pair_label: 'B2', player_1: 'Trung Kiên', player_2: 'Thành Đạt' },
        { id: 'pair_b_3', team_id: 'team_b', level_index: 3, pair_label: 'B3', player_1: 'Phúc Lâm', player_2: 'Khánh Duy' },

        { id: 'pair_c_1', team_id: 'team_c', level_index: 1, pair_label: 'C1', player_1: 'Thanh Tùng', player_2: 'Quang Huy' },
        { id: 'pair_c_2', team_id: 'team_c', level_index: 2, pair_label: 'C2', player_1: 'Bảo Long', player_2: 'Nhật Minh' },
        { id: 'pair_c_3', team_id: 'team_c', level_index: 3, pair_label: 'C3', player_1: 'Anh Khoa', player_2: 'Việt Hoàng' },

        { id: 'pair_d_1', team_id: 'team_d', level_index: 1, pair_label: 'D1', player_1: 'Hữu Phước', player_2: 'Tấn Phát' },
        { id: 'pair_d_2', team_id: 'team_d', level_index: 2, pair_label: 'D2', player_1: 'Ngọc Sơn', player_2: 'Đình Toàn' },
        { id: 'pair_d_3', team_id: 'team_d', level_index: 3, pair_label: 'D3', player_1: 'Mạnh Quân', player_2: 'Thái Bình' }
    ];

    const teamMatches = [
        {
            id: 'tm_r1_ab',
            tournament_id: tournamentId,
            round_number: 1,
            round_name: 'Vòng 1',
            stage: 'round_robin',
            team_a_id: 'team_a',
            team_b_id: 'team_b',
            court: 'Sân 1',
            scheduled_time: '08:30',
            status: 'completed',
            sort_order: 1,
            note: ''
        },
        {
            id: 'tm_r1_cd',
            tournament_id: tournamentId,
            round_number: 1,
            round_name: 'Vòng 1',
            stage: 'round_robin',
            team_a_id: 'team_c',
            team_b_id: 'team_d',
            court: 'Sân 2',
            scheduled_time: '08:30',
            status: 'completed',
            sort_order: 2,
            note: ''
        },
        {
            id: 'tm_r2_ac',
            tournament_id: tournamentId,
            round_number: 2,
            round_name: 'Vòng 2',
            stage: 'round_robin',
            team_a_id: 'team_a',
            team_b_id: 'team_c',
            court: 'Sân 1',
            scheduled_time: '10:00',
            status: 'live',
            sort_order: 3,
            note: 'Trận tâm điểm'
        },
        {
            id: 'tm_r2_bd',
            tournament_id: tournamentId,
            round_number: 2,
            round_name: 'Vòng 2',
            stage: 'round_robin',
            team_a_id: 'team_b',
            team_b_id: 'team_d',
            court: 'Sân 2',
            scheduled_time: '10:00',
            status: 'live',
            sort_order: 4,
            note: ''
        },
        {
            id: 'tm_r3_ad',
            tournament_id: tournamentId,
            round_number: 3,
            round_name: 'Vòng 3',
            stage: 'round_robin',
            team_a_id: 'team_a',
            team_b_id: 'team_d',
            court: 'Sân 1',
            scheduled_time: '11:30',
            status: 'upcoming',
            sort_order: 5,
            note: ''
        },
        {
            id: 'tm_r3_bc',
            tournament_id: tournamentId,
            round_number: 3,
            round_name: 'Vòng 3',
            stage: 'round_robin',
            team_a_id: 'team_b',
            team_b_id: 'team_c',
            court: 'Sân 2',
            scheduled_time: '11:30',
            status: 'upcoming',
            sort_order: 6,
            note: ''
        }
    ];

    const subMatches = [
        // Vòng 1: A vs B (Team A thắng 2 - 1)
        {
            id: 'sm_r1_ab_1',
            team_match_id: 'tm_r1_ab',
            level_index: 1,
            pair_a_id: 'pair_a_1',
            pair_b_id: 'pair_b_1',
            sets: [{ a: 11, b: 7 }, { a: 11, b: 8 }],
            status: 'completed',
            winner_override: null,
            format_override: null
        },
        {
            id: 'sm_r1_ab_2',
            team_match_id: 'tm_r1_ab',
            level_index: 2,
            pair_a_id: 'pair_a_2',
            pair_b_id: 'pair_b_2',
            sets: [{ a: 8, b: 11 }, { a: 11, b: 9 }, { a: 7, b: 11 }],
            status: 'completed',
            winner_override: null,
            format_override: null
        },
        {
            id: 'sm_r1_ab_3',
            team_match_id: 'tm_r1_ab',
            level_index: 3,
            pair_a_id: 'pair_a_3',
            pair_b_id: 'pair_b_3',
            sets: [{ a: 11, b: 9 }, { a: 11, b: 6 }],
            status: 'completed',
            winner_override: null,
            format_override: null
        },

        // Vòng 1: C vs D (Team C thắng 2 - 1)
        {
            id: 'sm_r1_cd_1',
            team_match_id: 'tm_r1_cd',
            level_index: 1,
            pair_a_id: 'pair_c_1',
            pair_b_id: 'pair_d_1',
            sets: [{ a: 11, b: 5 }, { a: 9, b: 11 }, { a: 11, b: 8 }],
            status: 'completed',
            winner_override: null,
            format_override: null
        },
        {
            id: 'sm_r1_cd_2',
            team_match_id: 'tm_r1_cd',
            level_index: 2,
            pair_a_id: 'pair_c_2',
            pair_b_id: 'pair_d_2',
            sets: [{ a: 11, b: 9 }, { a: 12, b: 10 }],
            status: 'completed',
            winner_override: null,
            format_override: null
        },
        {
            id: 'sm_r1_cd_3',
            team_match_id: 'tm_r1_cd',
            level_index: 3,
            pair_a_id: 'pair_c_3',
            pair_b_id: 'pair_d_3',
            sets: [{ a: 6, b: 11 }, { a: 9, b: 11 }],
            status: 'completed',
            winner_override: null,
            format_override: null
        },

        // Vòng 2: A vs C (LIVE)
        {
            id: 'sm_r2_ac_1',
            team_match_id: 'tm_r2_ac',
            level_index: 1,
            pair_a_id: 'pair_a_1',
            pair_b_id: 'pair_c_1',
            sets: [{ a: 11, b: 8 }, { a: 11, b: 9 }],
            status: 'completed',
            winner_override: null,
            format_override: null
        },
        {
            id: 'sm_r2_ac_2',
            team_match_id: 'tm_r2_ac',
            level_index: 2,
            pair_a_id: 'pair_a_2',
            pair_b_id: 'pair_c_2',
            sets: [{ a: 9, b: 11 }, { a: 11, b: 7 }, { a: 8, b: 6 }],
            status: 'live',
            winner_override: null,
            format_override: null
        },
        {
            id: 'sm_r2_ac_3',
            team_match_id: 'tm_r2_ac',
            level_index: 3,
            pair_a_id: 'pair_a_3',
            pair_b_id: 'pair_c_3',
            sets: [{ a: 0, b: 0 }],
            status: 'upcoming',
            winner_override: null,
            format_override: null
        },

        // Vòng 2: B vs D (LIVE)
        {
            id: 'sm_r2_bd_1',
            team_match_id: 'tm_r2_bd',
            level_index: 1,
            pair_a_id: 'pair_b_1',
            pair_b_id: 'pair_d_1',
            sets: [{ a: 11, b: 6 }, { a: 10, b: 12 }, { a: 7, b: 5 }],
            status: 'live',
            winner_override: null,
            format_override: null
        },
        {
            id: 'sm_r2_bd_2',
            team_match_id: 'tm_r2_bd',
            level_index: 2,
            pair_a_id: 'pair_b_2',
            pair_b_id: 'pair_d_2',
            sets: [{ a: 0, b: 0 }],
            status: 'upcoming',
            winner_override: null,
            format_override: null
        },
        {
            id: 'sm_r2_bd_3',
            team_match_id: 'tm_r2_bd',
            level_index: 3,
            pair_a_id: 'pair_b_3',
            pair_b_id: 'pair_d_3',
            sets: [{ a: 0, b: 0 }],
            status: 'upcoming',
            winner_override: null,
            format_override: null
        },

        // Vòng 3: A vs D (Upcoming)
        {
            id: 'sm_r3_ad_1',
            team_match_id: 'tm_r3_ad',
            level_index: 1,
            pair_a_id: 'pair_a_1',
            pair_b_id: 'pair_d_1',
            sets: [{ a: 0, b: 0 }],
            status: 'upcoming',
            winner_override: null,
            format_override: null
        },
        {
            id: 'sm_r3_ad_2',
            team_match_id: 'tm_r3_ad',
            level_index: 2,
            pair_a_id: 'pair_a_2',
            pair_b_id: 'pair_d_2',
            sets: [{ a: 0, b: 0 }],
            status: 'upcoming',
            winner_override: null,
            format_override: null
        },
        {
            id: 'sm_r3_ad_3',
            team_match_id: 'tm_r3_ad',
            level_index: 3,
            pair_a_id: 'pair_a_3',
            pair_b_id: 'pair_d_3',
            sets: [{ a: 0, b: 0 }],
            status: 'upcoming',
            winner_override: null,
            format_override: null
        },

        // Vòng 3: B vs C (Upcoming)
        {
            id: 'sm_r3_bc_1',
            team_match_id: 'tm_r3_bc',
            level_index: 1,
            pair_a_id: 'pair_b_1',
            pair_b_id: 'pair_c_1',
            sets: [{ a: 0, b: 0 }],
            status: 'upcoming',
            winner_override: null,
            format_override: null
        },
        {
            id: 'sm_r3_bc_2',
            team_match_id: 'tm_r3_bc',
            level_index: 2,
            pair_a_id: 'pair_b_2',
            pair_b_id: 'pair_c_2',
            sets: [{ a: 0, b: 0 }],
            status: 'upcoming',
            winner_override: null,
            format_override: null
        },
        {
            id: 'sm_r3_bc_3',
            team_match_id: 'tm_r3_bc',
            level_index: 3,
            pair_a_id: 'pair_b_3',
            pair_b_id: 'pair_c_3',
            sets: [{ a: 0, b: 0 }],
            status: 'upcoming',
            winner_override: null,
            format_override: null
        }
    ];

    return {
        tournament,
        teams,
        teamPairs,
        teamMatches,
        subMatches
    };
}
