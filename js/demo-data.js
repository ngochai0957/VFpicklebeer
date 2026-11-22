import { DEFAULT_CONFIG } from './tournament-engine.js';

/**
 * Generates a realistic initial Team League (Fixed Lineup) dataset
 * with 6 teams × 3 levels across Round-Robin rounds and Ben Johns / PPA set scoring.
 */
export function createInitialDemoState(tournamentId = 'main') {
    const tournament = {
        id: tournamentId,
        name: 'VaciF PickleBeer 2026 Team League',
        subtitle: 'Giải PickleBall nội bộ VACIF • Vợt cầm chắc, bia rót đầy — thắng thì gáy, thua thì dzô!',
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
        { id: 'team_d', tournament_id: tournamentId, code: 'D', name: 'Team D — Spin Hunters', color: '#D97706', seed_order: 4 },
        { id: 'team_e', tournament_id: tournamentId, code: 'E', name: 'Team E — Volley Storm', color: '#DC2626', seed_order: 5 },
        { id: 'team_f', tournament_id: tournamentId, code: 'F', name: 'Team F — Net Ninjas', color: '#0891B2', seed_order: 6 }
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
        { id: 'pair_d_3', team_id: 'team_d', level_index: 3, pair_label: 'D3', player_1: 'Mạnh Quân', player_2: 'Thái Bình' },

        { id: 'pair_e_1', team_id: 'team_e', level_index: 1, pair_label: 'E1', player_1: 'Xuân Bách', player_2: 'Minh Đức' },
        { id: 'pair_e_2', team_id: 'team_e', level_index: 2, pair_label: 'E2', player_1: 'Hoàng Quân', player_2: 'Tiến Dũng' },
        { id: 'pair_e_3', team_id: 'team_e', level_index: 3, pair_label: 'E3', player_1: 'Kỳ Phong', player_2: 'Huy Vũ' },

        { id: 'pair_f_1', team_id: 'team_f', level_index: 1, pair_label: 'F1', player_1: 'Bảo Khánh', player_2: 'Gia Khiêm' },
        { id: 'pair_f_2', team_id: 'team_f', level_index: 2, pair_label: 'F2', player_1: 'Thiên Ân', player_2: 'Quang Minh' },
        { id: 'pair_f_3', team_id: 'team_f', level_index: 3, pair_label: 'F3', player_1: 'Tuấn Kiệt', player_2: 'Nam Khánh' }
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
            id: 'tm_r1_ef',
            tournament_id: tournamentId,
            round_number: 1,
            round_name: 'Vòng 1',
            stage: 'round_robin',
            team_a_id: 'team_e',
            team_b_id: 'team_f',
            court: 'Sân 1',
            scheduled_time: '09:15',
            status: 'completed',
            sort_order: 3,
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
            sort_order: 4,
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
            sort_order: 5,
            note: ''
        },
        {
            id: 'tm_r2_eb',
            tournament_id: tournamentId,
            round_number: 2,
            round_name: 'Vòng 2',
            stage: 'round_robin',
            team_a_id: 'team_e',
            team_b_id: 'team_b',
            court: 'Sân 1',
            scheduled_time: '09:45',
            status: 'completed',
            sort_order: 6,
            note: ''
        },
        {
            id: 'tm_r2_df',
            tournament_id: tournamentId,
            round_number: 2,
            round_name: 'Vòng 2',
            stage: 'round_robin',
            team_a_id: 'team_d',
            team_b_id: 'team_f',
            court: 'Sân 2',
            scheduled_time: '10:15',
            status: 'live',
            sort_order: 7,
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
            sort_order: 8,
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
            sort_order: 9,
            note: ''
        },
        {
            id: 'tm_r3_ae',
            tournament_id: tournamentId,
            round_number: 3,
            round_name: 'Vòng 3',
            stage: 'round_robin',
            team_a_id: 'team_a',
            team_b_id: 'team_e',
            court: 'Sân 2',
            scheduled_time: '12:00',
            status: 'upcoming',
            sort_order: 10,
            note: 'Trận tranh ngôi đầu'
        },
        {
            id: 'tm_r3_cf',
            tournament_id: tournamentId,
            round_number: 3,
            round_name: 'Vòng 3',
            stage: 'round_robin',
            team_a_id: 'team_c',
            team_b_id: 'team_f',
            court: 'Sân 2',
            scheduled_time: '12:30',
            status: 'upcoming',
            sort_order: 11,
            note: ''
        },
        {
            id: 'tm_r3_ce',
            tournament_id: tournamentId,
            round_number: 3,
            round_name: 'Vòng 3',
            stage: 'round_robin',
            team_a_id: 'team_c',
            team_b_id: 'team_e',
            court: 'Sân 2',
            scheduled_time: '13:00',
            status: 'upcoming',
            sort_order: 12,
            note: 'Trận chốt bảng'
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
            format_override: {
                setPlayerStats: [
                    { a1: { points: 7, errors: 4 }, a2: { points: 4, errors: 3 }, b1: { points: 4, errors: 6 }, b2: { points: 3, errors: 5 } },
                    { a1: { points: 7, errors: 4 }, a2: { points: 4, errors: 4 }, b1: { points: 5, errors: 6 }, b2: { points: 3, errors: 5 } }
                ]
            }
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
            format_override: {
                setPlayerStats: [
                    { a1: { points: 5, errors: 6 }, a2: { points: 3, errors: 5 }, b1: { points: 7, errors: 4 }, b2: { points: 4, errors: 4 } },
                    { a1: { points: 6, errors: 5 }, a2: { points: 5, errors: 4 }, b1: { points: 5, errors: 6 }, b2: { points: 4, errors: 5 } },
                    { a1: { points: 4, errors: 6 }, a2: { points: 3, errors: 5 }, b1: { points: 6, errors: 4 }, b2: { points: 5, errors: 3 } }
                ]
            }
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
            format_override: {
                setPlayerStats: [
                    { a1: { points: 6, errors: 5 }, a2: { points: 5, errors: 4 }, b1: { points: 5, errors: 6 }, b2: { points: 4, errors: 5 } },
                    { a1: { points: 7, errors: 3 }, a2: { points: 4, errors: 3 }, b1: { points: 4, errors: 6 }, b2: { points: 2, errors: 5 } }
                ]
            }
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
            format_override: {
                setPlayerStats: [
                    { a1: { points: 7, errors: 3 }, a2: { points: 4, errors: 2 }, b1: { points: 3, errors: 6 }, b2: { points: 2, errors: 5 } },
                    { a1: { points: 5, errors: 6 }, a2: { points: 4, errors: 5 }, b1: { points: 6, errors: 5 }, b2: { points: 5, errors: 4 } },
                    { a1: { points: 6, errors: 4 }, a2: { points: 5, errors: 4 }, b1: { points: 5, errors: 6 }, b2: { points: 3, errors: 5 } }
                ]
            }
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
            format_override: {
                setPlayerStats: [
                    { a1: { points: 6, errors: 5 }, a2: { points: 5, errors: 4 }, b1: { points: 6, errors: 6 }, b2: { points: 3, errors: 5 } },
                    { a1: { points: 7, errors: 5 }, a2: { points: 5, errors: 5 }, b1: { points: 6, errors: 6 }, b2: { points: 4, errors: 6 } }
                ]
            }
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
            format_override: {
                setPlayerStats: [
                    { a1: { points: 4, errors: 6 }, a2: { points: 2, errors: 5 }, b1: { points: 7, errors: 3 }, b2: { points: 4, errors: 3 } },
                    { a1: { points: 5, errors: 6 }, a2: { points: 4, errors: 5 }, b1: { points: 6, errors: 5 }, b2: { points: 5, errors: 4 } }
                ]
            }
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
            format_override: {
                setPlayerStats: [
                    { a1: { points: 6, errors: 4 }, a2: { points: 5, errors: 4 }, b1: { points: 5, errors: 6 }, b2: { points: 3, errors: 5 } },
                    { a1: { points: 7, errors: 5 }, a2: { points: 4, errors: 4 }, b1: { points: 5, errors: 6 }, b2: { points: 4, errors: 5 } }
                ]
            }
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
            format_override: {
                setPlayerStats: [
                    { a1: { points: 4, errors: 6 }, a2: { points: 5, errors: 5 }, b1: { points: 7, errors: 5 }, b2: { points: 4, errors: 4 } },
                    { a1: { points: 6, errors: 4 }, a2: { points: 5, errors: 3 }, b1: { points: 4, errors: 6 }, b2: { points: 3, errors: 5 } },
                    { a1: { points: 4, errors: 3 }, a2: { points: 4, errors: 3 }, b1: { points: 4, errors: 4 }, b2: { points: 2, errors: 4 } }
                ]
            }
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
            format_override: {
                setPlayerStats: [
                    { a1: { points: 7, errors: 3 }, a2: { points: 4, errors: 3 }, b1: { points: 4, errors: 6 }, b2: { points: 2, errors: 5 } },
                    { a1: { points: 6, errors: 6 }, a2: { points: 4, errors: 6 }, b1: { points: 7, errors: 5 }, b2: { points: 5, errors: 5 } },
                    { a1: { points: 4, errors: 3 }, a2: { points: 3, errors: 2 }, b1: { points: 3, errors: 4 }, b2: { points: 2, errors: 3 } }
                ]
            }
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
        },

        // Vòng 1: E vs F (Team E thắng 2 - 1)
        {
            id: 'sm_r1_ef_1',
            team_match_id: 'tm_r1_ef',
            level_index: 1,
            pair_a_id: 'pair_e_1',
            pair_b_id: 'pair_f_1',
            sets: [{ a: 11, b: 8 }, { a: 11, b: 6 }],
            status: 'completed',
            winner_override: null,
            format_override: {
                setPlayerStats: [
                    { a1: { points: 6, errors: 3 }, a2: { points: 5, errors: 3 }, b1: { points: 5, errors: 5 }, b2: { points: 3, errors: 5 } },
                    { a1: { points: 6, errors: 2 }, a2: { points: 5, errors: 3 }, b1: { points: 4, errors: 6 }, b2: { points: 2, errors: 4 } }
                ]
            }
        },
        {
            id: 'sm_r1_ef_2',
            team_match_id: 'tm_r1_ef',
            level_index: 2,
            pair_a_id: 'pair_e_2',
            pair_b_id: 'pair_f_2',
            sets: [{ a: 11, b: 9 }, { a: 11, b: 9 }],
            status: 'completed',
            winner_override: null,
            format_override: {
                setPlayerStats: [
                    { a1: { points: 6, errors: 4 }, a2: { points: 5, errors: 4 }, b1: { points: 5, errors: 5 }, b2: { points: 4, errors: 5 } },
                    { a1: { points: 6, errors: 3 }, a2: { points: 5, errors: 4 }, b1: { points: 5, errors: 5 }, b2: { points: 4, errors: 5 } }
                ]
            }
        },
        {
            id: 'sm_r1_ef_3',
            team_match_id: 'tm_r1_ef',
            level_index: 3,
            pair_a_id: 'pair_e_3',
            pair_b_id: 'pair_f_3',
            sets: [{ a: 8, b: 11 }, { a: 9, b: 11 }],
            status: 'completed',
            winner_override: null,
            format_override: {
                setPlayerStats: [
                    { a1: { points: 5, errors: 5 }, a2: { points: 3, errors: 5 }, b1: { points: 6, errors: 3 }, b2: { points: 5, errors: 4 } },
                    { a1: { points: 5, errors: 5 }, a2: { points: 4, errors: 4 }, b1: { points: 6, errors: 4 }, b2: { points: 5, errors: 3 } }
                ]
            }
        },

        // Vòng 2: E vs B (Team E thắng 2 - 1)
        {
            id: 'sm_r2_eb_1',
            team_match_id: 'tm_r2_eb',
            level_index: 1,
            pair_a_id: 'pair_e_1',
            pair_b_id: 'pair_b_1',
            sets: [{ a: 8, b: 11 }, { a: 9, b: 11 }],
            status: 'completed',
            winner_override: null,
            format_override: {
                setPlayerStats: [
                    { a1: { points: 4, errors: 5 }, a2: { points: 4, errors: 4 }, b1: { points: 6, errors: 3 }, b2: { points: 5, errors: 3 } },
                    { a1: { points: 5, errors: 4 }, a2: { points: 4, errors: 5 }, b1: { points: 6, errors: 4 }, b2: { points: 5, errors: 3 } }
                ]
            }
        },
        {
            id: 'sm_r2_eb_2',
            team_match_id: 'tm_r2_eb',
            level_index: 2,
            pair_a_id: 'pair_e_2',
            pair_b_id: 'pair_b_2',
            sets: [{ a: 11, b: 6 }, { a: 11, b: 8 }],
            status: 'completed',
            winner_override: null,
            format_override: {
                setPlayerStats: [
                    { a1: { points: 6, errors: 2 }, a2: { points: 5, errors: 3 }, b1: { points: 3, errors: 5 }, b2: { points: 3, errors: 4 } },
                    { a1: { points: 6, errors: 3 }, a2: { points: 5, errors: 3 }, b1: { points: 5, errors: 4 }, b2: { points: 3, errors: 5 } }
                ]
            }
        },
        {
            id: 'sm_r2_eb_3',
            team_match_id: 'tm_r2_eb',
            level_index: 3,
            pair_a_id: 'pair_e_3',
            pair_b_id: 'pair_b_3',
            sets: [{ a: 11, b: 9 }, { a: 12, b: 10 }],
            status: 'completed',
            winner_override: null,
            format_override: {
                setPlayerStats: [
                    { a1: { points: 6, errors: 3 }, a2: { points: 5, errors: 4 }, b1: { points: 5, errors: 5 }, b2: { points: 4, errors: 4 } },
                    { a1: { points: 7, errors: 4 }, a2: { points: 5, errors: 3 }, b1: { points: 6, errors: 4 }, b2: { points: 4, errors: 5 } }
                ]
            }
        },

        // Vòng 2: D vs F (LIVE)
        {
            id: 'sm_r2_df_1',
            team_match_id: 'tm_r2_df',
            level_index: 1,
            pair_a_id: 'pair_d_1',
            pair_b_id: 'pair_f_1',
            sets: [{ a: 11, b: 9 }, { a: 9, b: 11 }, { a: 6, b: 4 }],
            status: 'live',
            winner_override: null,
            format_override: {
                setPlayerStats: [
                    { a1: { points: 6, errors: 3 }, a2: { points: 5, errors: 4 }, b1: { points: 5, errors: 5 }, b2: { points: 4, errors: 4 } },
                    { a1: { points: 5, errors: 5 }, a2: { points: 4, errors: 4 }, b1: { points: 6, errors: 4 }, b2: { points: 5, errors: 3 } },
                    { a1: { points: 3, errors: 2 }, a2: { points: 3, errors: 1 }, b1: { points: 2, errors: 3 }, b2: { points: 2, errors: 2 } }
                ]
            }
        },
        {
            id: 'sm_r2_df_2',
            team_match_id: 'tm_r2_df',
            level_index: 2,
            pair_a_id: 'pair_d_2',
            pair_b_id: 'pair_f_2',
            sets: [{ a: 0, b: 0 }],
            status: 'upcoming',
            winner_override: null,
            format_override: { queueState: 'ready' }
        },
        {
            id: 'sm_r2_df_3',
            team_match_id: 'tm_r2_df',
            level_index: 3,
            pair_a_id: 'pair_d_3',
            pair_b_id: 'pair_f_3',
            sets: [{ a: 0, b: 0 }],
            status: 'upcoming',
            winner_override: null,
            format_override: null
        },

        // Vòng 3: A vs E, C vs F & Chung Kết (Upcoming)
        {
            id: 'sm_r3_ae_1',
            team_match_id: 'tm_r3_ae',
            level_index: 1,
            pair_a_id: 'pair_a_1',
            pair_b_id: 'pair_e_1',
            sets: [{ a: 0, b: 0 }],
            status: 'upcoming',
            winner_override: null,
            format_override: null
        },
        {
            id: 'sm_r3_ae_2',
            team_match_id: 'tm_r3_ae',
            level_index: 2,
            pair_a_id: 'pair_a_2',
            pair_b_id: 'pair_e_2',
            sets: [{ a: 0, b: 0 }],
            status: 'upcoming',
            winner_override: null,
            format_override: null
        },
        {
            id: 'sm_r3_ae_3',
            team_match_id: 'tm_r3_ae',
            level_index: 3,
            pair_a_id: 'pair_a_3',
            pair_b_id: 'pair_e_3',
            sets: [{ a: 0, b: 0 }],
            status: 'upcoming',
            winner_override: null,
            format_override: null
        },
        {
            id: 'sm_r3_cf_1',
            team_match_id: 'tm_r3_cf',
            level_index: 1,
            pair_a_id: 'pair_c_1',
            pair_b_id: 'pair_f_1',
            sets: [{ a: 0, b: 0 }],
            status: 'upcoming',
            winner_override: null,
            format_override: null
        },
        {
            id: 'sm_r3_cf_2',
            team_match_id: 'tm_r3_cf',
            level_index: 2,
            pair_a_id: 'pair_c_2',
            pair_b_id: 'pair_f_2',
            sets: [{ a: 0, b: 0 }],
            status: 'upcoming',
            winner_override: null,
            format_override: null
        },
        {
            id: 'sm_r3_cf_3',
            team_match_id: 'tm_r3_cf',
            level_index: 3,
            pair_a_id: 'pair_c_3',
            pair_b_id: 'pair_f_3',
            sets: [{ a: 0, b: 0 }],
            status: 'upcoming',
            winner_override: null,
            format_override: null
        },
        {
            id: 'sm_r3_ce_1',
            team_match_id: 'tm_r3_ce',
            level_index: 1,
            pair_a_id: 'pair_c_1',
            pair_b_id: 'pair_e_1',
            sets: [{ a: 0, b: 0 }],
            status: 'upcoming',
            winner_override: null,
            format_override: null
        },
        {
            id: 'sm_r3_ce_2',
            team_match_id: 'tm_r3_ce',
            level_index: 2,
            pair_a_id: 'pair_c_2',
            pair_b_id: 'pair_e_2',
            sets: [{ a: 0, b: 0 }],
            status: 'upcoming',
            winner_override: null,
            format_override: null
        },
        {
            id: 'sm_r3_ce_3',
            team_match_id: 'tm_r3_ce',
            level_index: 3,
            pair_a_id: 'pair_c_3',
            pair_b_id: 'pair_e_3',
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
