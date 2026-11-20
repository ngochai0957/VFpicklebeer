-- Auto-generated seed from js/demo-data.js (6 teams x 3 pairs, 12 team matches, 36 sub-matches)
-- Run this in Supabase Dashboard -> SQL Editor to populate live/production data.
BEGIN;

INSERT INTO public.tournaments (id, name, subtitle, status, config) VALUES ('main', 'VaciF PickleBeer 2026 Team League', 'Giải đồng đội VACIF • Đội hình cố định (Fixed Lineup) • Tỉ số từng Set', 'live', '{"bestOf":3,"pointsPerSet":11,"winByTwo":true,"pointCap":0,"levelsCount":3,"levelNames":["Level 1","Level 2","Level 3"],"doubleRoundRobin":false,"registrationOpen":true,"awardsVisibility":"public","awardsMaskSeed":1}'::jsonb)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, subtitle = EXCLUDED.subtitle, status = EXCLUDED.status, config = EXCLUDED.config;

DELETE FROM public.team_matches WHERE tournament_id = 'main';
DELETE FROM public.teams WHERE tournament_id = 'main';

INSERT INTO public.teams (id, tournament_id, code, name, color, seed_order) VALUES
  ('team_a', 'main', 'A', 'Team A — Smash Lab', '#2563EB', 1),
  ('team_b', 'main', 'B', 'Team B — Dink Kings', '#7C3AED', 2),
  ('team_c', 'main', 'C', 'Team C — Kitchen Aces', '#059669', 3),
  ('team_d', 'main', 'D', 'Team D — Spin Hunters', '#D97706', 4),
  ('team_e', 'main', 'E', 'Team E — Volley Storm', '#DC2626', 5),
  ('team_f', 'main', 'F', 'Team F — Net Ninjas', '#0891B2', 6);

INSERT INTO public.team_pairs (id, team_id, level_index, pair_label, player_1, player_2) VALUES
  ('pair_a_1', 'team_a', 1, 'A1', 'Minh Khôi', 'Hoàng Nam'),
  ('pair_a_2', 'team_a', 2, 'A2', 'Tuấn Anh', 'Quốc Bảo'),
  ('pair_a_3', 'team_a', 3, 'A3', 'Hải Đăng', 'Gia Huy'),
  ('pair_b_1', 'team_b', 1, 'B1', 'Đức Thịnh', 'Văn Long'),
  ('pair_b_2', 'team_b', 2, 'B2', 'Trung Kiên', 'Thành Đạt'),
  ('pair_b_3', 'team_b', 3, 'B3', 'Phúc Lâm', 'Khánh Duy'),
  ('pair_c_1', 'team_c', 1, 'C1', 'Thanh Tùng', 'Quang Huy'),
  ('pair_c_2', 'team_c', 2, 'C2', 'Bảo Long', 'Nhật Minh'),
  ('pair_c_3', 'team_c', 3, 'C3', 'Anh Khoa', 'Việt Hoàng'),
  ('pair_d_1', 'team_d', 1, 'D1', 'Hữu Phước', 'Tấn Phát'),
  ('pair_d_2', 'team_d', 2, 'D2', 'Ngọc Sơn', 'Đình Toàn'),
  ('pair_d_3', 'team_d', 3, 'D3', 'Mạnh Quân', 'Thái Bình'),
  ('pair_e_1', 'team_e', 1, 'E1', 'Xuân Bách', 'Minh Đức'),
  ('pair_e_2', 'team_e', 2, 'E2', 'Hoàng Quân', 'Tiến Dũng'),
  ('pair_e_3', 'team_e', 3, 'E3', 'Kỳ Phong', 'Huy Vũ'),
  ('pair_f_1', 'team_f', 1, 'F1', 'Bảo Khánh', 'Gia Khiêm'),
  ('pair_f_2', 'team_f', 2, 'F2', 'Thiên Ân', 'Quang Minh'),
  ('pair_f_3', 'team_f', 3, 'F3', 'Tuấn Kiệt', 'Nam Khánh');

INSERT INTO public.team_matches (id, tournament_id, round_number, round_name, stage, team_a_id, team_b_id, court, scheduled_time, status, sort_order, note) VALUES
  ('tm_r1_ab', 'main', 1, 'Vòng 1', 'round_robin', 'team_a', 'team_b', 'Sân 1', '08:30', 'completed', 1, ''),
  ('tm_r1_cd', 'main', 1, 'Vòng 1', 'round_robin', 'team_c', 'team_d', 'Sân 2', '08:30', 'completed', 2, ''),
  ('tm_r1_ef', 'main', 1, 'Vòng 1', 'round_robin', 'team_e', 'team_f', 'Sân 1', '09:15', 'completed', 3, ''),
  ('tm_r2_ac', 'main', 2, 'Vòng 2', 'round_robin', 'team_a', 'team_c', 'Sân 1', '10:00', 'live', 4, 'Trận tâm điểm'),
  ('tm_r2_bd', 'main', 2, 'Vòng 2', 'round_robin', 'team_b', 'team_d', 'Sân 2', '10:00', 'live', 5, ''),
  ('tm_r2_eb', 'main', 2, 'Vòng 2', 'round_robin', 'team_e', 'team_b', 'Sân 1', '09:45', 'completed', 6, ''),
  ('tm_r2_df', 'main', 2, 'Vòng 2', 'round_robin', 'team_d', 'team_f', 'Sân 2', '10:15', 'live', 7, ''),
  ('tm_r3_ad', 'main', 3, 'Vòng 3', 'round_robin', 'team_a', 'team_d', 'Sân 1', '11:30', 'upcoming', 8, ''),
  ('tm_r3_bc', 'main', 3, 'Vòng 3', 'round_robin', 'team_b', 'team_c', 'Sân 2', '11:30', 'upcoming', 9, ''),
  ('tm_r3_ae', 'main', 3, 'Vòng 3', 'round_robin', 'team_a', 'team_e', 'Sân 2', '12:00', 'upcoming', 10, 'Trận tranh ngôi đầu'),
  ('tm_r3_cf', 'main', 3, 'Vòng 3', 'round_robin', 'team_c', 'team_f', 'Sân 2', '12:30', 'upcoming', 11, ''),
  ('tm_r3_ce', 'main', 3, 'Vòng 3', 'round_robin', 'team_c', 'team_e', 'Sân 2', '13:00', 'upcoming', 12, 'Trận chốt bảng');

INSERT INTO public.sub_matches (id, team_match_id, level_index, pair_a_id, pair_b_id, sets, status, winner_override, format_override) VALUES
  ('sm_r1_ab_1', 'tm_r1_ab', 1, 'pair_a_1', 'pair_b_1', '[{"a":11,"b":7},{"a":11,"b":8}]'::jsonb, 'completed', NULL, '{"setPlayerStats":[{"a1":{"points":7,"errors":4},"a2":{"points":4,"errors":3},"b1":{"points":4,"errors":6},"b2":{"points":3,"errors":5}},{"a1":{"points":7,"errors":4},"a2":{"points":4,"errors":4},"b1":{"points":5,"errors":6},"b2":{"points":3,"errors":5}}]}'::jsonb),
  ('sm_r1_ab_2', 'tm_r1_ab', 2, 'pair_a_2', 'pair_b_2', '[{"a":8,"b":11},{"a":11,"b":9},{"a":7,"b":11}]'::jsonb, 'completed', NULL, '{"setPlayerStats":[{"a1":{"points":5,"errors":6},"a2":{"points":3,"errors":5},"b1":{"points":7,"errors":4},"b2":{"points":4,"errors":4}},{"a1":{"points":6,"errors":5},"a2":{"points":5,"errors":4},"b1":{"points":5,"errors":6},"b2":{"points":4,"errors":5}},{"a1":{"points":4,"errors":6},"a2":{"points":3,"errors":5},"b1":{"points":6,"errors":4},"b2":{"points":5,"errors":3}}]}'::jsonb),
  ('sm_r1_ab_3', 'tm_r1_ab', 3, 'pair_a_3', 'pair_b_3', '[{"a":11,"b":9},{"a":11,"b":6}]'::jsonb, 'completed', NULL, '{"setPlayerStats":[{"a1":{"points":6,"errors":5},"a2":{"points":5,"errors":4},"b1":{"points":5,"errors":6},"b2":{"points":4,"errors":5}},{"a1":{"points":7,"errors":3},"a2":{"points":4,"errors":3},"b1":{"points":4,"errors":6},"b2":{"points":2,"errors":5}}]}'::jsonb),
  ('sm_r1_cd_1', 'tm_r1_cd', 1, 'pair_c_1', 'pair_d_1', '[{"a":11,"b":5},{"a":9,"b":11},{"a":11,"b":8}]'::jsonb, 'completed', NULL, '{"setPlayerStats":[{"a1":{"points":7,"errors":3},"a2":{"points":4,"errors":2},"b1":{"points":3,"errors":6},"b2":{"points":2,"errors":5}},{"a1":{"points":5,"errors":6},"a2":{"points":4,"errors":5},"b1":{"points":6,"errors":5},"b2":{"points":5,"errors":4}},{"a1":{"points":6,"errors":4},"a2":{"points":5,"errors":4},"b1":{"points":5,"errors":6},"b2":{"points":3,"errors":5}}]}'::jsonb),
  ('sm_r1_cd_2', 'tm_r1_cd', 2, 'pair_c_2', 'pair_d_2', '[{"a":11,"b":9},{"a":12,"b":10}]'::jsonb, 'completed', NULL, '{"setPlayerStats":[{"a1":{"points":6,"errors":5},"a2":{"points":5,"errors":4},"b1":{"points":6,"errors":6},"b2":{"points":3,"errors":5}},{"a1":{"points":7,"errors":5},"a2":{"points":5,"errors":5},"b1":{"points":6,"errors":6},"b2":{"points":4,"errors":6}}]}'::jsonb),
  ('sm_r1_cd_3', 'tm_r1_cd', 3, 'pair_c_3', 'pair_d_3', '[{"a":6,"b":11},{"a":9,"b":11}]'::jsonb, 'completed', NULL, '{"setPlayerStats":[{"a1":{"points":4,"errors":6},"a2":{"points":2,"errors":5},"b1":{"points":7,"errors":3},"b2":{"points":4,"errors":3}},{"a1":{"points":5,"errors":6},"a2":{"points":4,"errors":5},"b1":{"points":6,"errors":5},"b2":{"points":5,"errors":4}}]}'::jsonb),
  ('sm_r2_ac_1', 'tm_r2_ac', 1, 'pair_a_1', 'pair_c_1', '[{"a":11,"b":8},{"a":11,"b":9}]'::jsonb, 'completed', NULL, '{"setPlayerStats":[{"a1":{"points":6,"errors":4},"a2":{"points":5,"errors":4},"b1":{"points":5,"errors":6},"b2":{"points":3,"errors":5}},{"a1":{"points":7,"errors":5},"a2":{"points":4,"errors":4},"b1":{"points":5,"errors":6},"b2":{"points":4,"errors":5}}]}'::jsonb),
  ('sm_r2_ac_2', 'tm_r2_ac', 2, 'pair_a_2', 'pair_c_2', '[{"a":9,"b":11},{"a":11,"b":7},{"a":8,"b":6}]'::jsonb, 'live', NULL, '{"setPlayerStats":[{"a1":{"points":4,"errors":6},"a2":{"points":5,"errors":5},"b1":{"points":7,"errors":5},"b2":{"points":4,"errors":4}},{"a1":{"points":6,"errors":4},"a2":{"points":5,"errors":3},"b1":{"points":4,"errors":6},"b2":{"points":3,"errors":5}},{"a1":{"points":4,"errors":3},"a2":{"points":4,"errors":3},"b1":{"points":4,"errors":4},"b2":{"points":2,"errors":4}}]}'::jsonb),
  ('sm_r2_ac_3', 'tm_r2_ac', 3, 'pair_a_3', 'pair_c_3', '[{"a":0,"b":0}]'::jsonb, 'upcoming', NULL, NULL),
  ('sm_r2_bd_1', 'tm_r2_bd', 1, 'pair_b_1', 'pair_d_1', '[{"a":11,"b":6},{"a":10,"b":12},{"a":7,"b":5}]'::jsonb, 'live', NULL, '{"setPlayerStats":[{"a1":{"points":7,"errors":3},"a2":{"points":4,"errors":3},"b1":{"points":4,"errors":6},"b2":{"points":2,"errors":5}},{"a1":{"points":6,"errors":6},"a2":{"points":4,"errors":6},"b1":{"points":7,"errors":5},"b2":{"points":5,"errors":5}},{"a1":{"points":4,"errors":3},"a2":{"points":3,"errors":2},"b1":{"points":3,"errors":4},"b2":{"points":2,"errors":3}}]}'::jsonb),
  ('sm_r2_bd_2', 'tm_r2_bd', 2, 'pair_b_2', 'pair_d_2', '[{"a":0,"b":0}]'::jsonb, 'upcoming', NULL, NULL),
  ('sm_r2_bd_3', 'tm_r2_bd', 3, 'pair_b_3', 'pair_d_3', '[{"a":0,"b":0}]'::jsonb, 'upcoming', NULL, NULL),
  ('sm_r3_ad_1', 'tm_r3_ad', 1, 'pair_a_1', 'pair_d_1', '[{"a":0,"b":0}]'::jsonb, 'upcoming', NULL, NULL),
  ('sm_r3_ad_2', 'tm_r3_ad', 2, 'pair_a_2', 'pair_d_2', '[{"a":0,"b":0}]'::jsonb, 'upcoming', NULL, NULL),
  ('sm_r3_ad_3', 'tm_r3_ad', 3, 'pair_a_3', 'pair_d_3', '[{"a":0,"b":0}]'::jsonb, 'upcoming', NULL, NULL),
  ('sm_r3_bc_1', 'tm_r3_bc', 1, 'pair_b_1', 'pair_c_1', '[{"a":0,"b":0}]'::jsonb, 'upcoming', NULL, NULL),
  ('sm_r3_bc_2', 'tm_r3_bc', 2, 'pair_b_2', 'pair_c_2', '[{"a":0,"b":0}]'::jsonb, 'upcoming', NULL, NULL),
  ('sm_r3_bc_3', 'tm_r3_bc', 3, 'pair_b_3', 'pair_c_3', '[{"a":0,"b":0}]'::jsonb, 'upcoming', NULL, NULL),
  ('sm_r1_ef_1', 'tm_r1_ef', 1, 'pair_e_1', 'pair_f_1', '[{"a":11,"b":8},{"a":11,"b":6}]'::jsonb, 'completed', NULL, '{"setPlayerStats":[{"a1":{"points":6,"errors":3},"a2":{"points":5,"errors":3},"b1":{"points":5,"errors":5},"b2":{"points":3,"errors":5}},{"a1":{"points":6,"errors":2},"a2":{"points":5,"errors":3},"b1":{"points":4,"errors":6},"b2":{"points":2,"errors":4}}]}'::jsonb),
  ('sm_r1_ef_2', 'tm_r1_ef', 2, 'pair_e_2', 'pair_f_2', '[{"a":11,"b":9},{"a":11,"b":9}]'::jsonb, 'completed', NULL, '{"setPlayerStats":[{"a1":{"points":6,"errors":4},"a2":{"points":5,"errors":4},"b1":{"points":5,"errors":5},"b2":{"points":4,"errors":5}},{"a1":{"points":6,"errors":3},"a2":{"points":5,"errors":4},"b1":{"points":5,"errors":5},"b2":{"points":4,"errors":5}}]}'::jsonb),
  ('sm_r1_ef_3', 'tm_r1_ef', 3, 'pair_e_3', 'pair_f_3', '[{"a":8,"b":11},{"a":9,"b":11}]'::jsonb, 'completed', NULL, '{"setPlayerStats":[{"a1":{"points":5,"errors":5},"a2":{"points":3,"errors":5},"b1":{"points":6,"errors":3},"b2":{"points":5,"errors":4}},{"a1":{"points":5,"errors":5},"a2":{"points":4,"errors":4},"b1":{"points":6,"errors":4},"b2":{"points":5,"errors":3}}]}'::jsonb),
  ('sm_r2_eb_1', 'tm_r2_eb', 1, 'pair_e_1', 'pair_b_1', '[{"a":8,"b":11},{"a":9,"b":11}]'::jsonb, 'completed', NULL, '{"setPlayerStats":[{"a1":{"points":4,"errors":5},"a2":{"points":4,"errors":4},"b1":{"points":6,"errors":3},"b2":{"points":5,"errors":3}},{"a1":{"points":5,"errors":4},"a2":{"points":4,"errors":5},"b1":{"points":6,"errors":4},"b2":{"points":5,"errors":3}}]}'::jsonb),
  ('sm_r2_eb_2', 'tm_r2_eb', 2, 'pair_e_2', 'pair_b_2', '[{"a":11,"b":6},{"a":11,"b":8}]'::jsonb, 'completed', NULL, '{"setPlayerStats":[{"a1":{"points":6,"errors":2},"a2":{"points":5,"errors":3},"b1":{"points":3,"errors":5},"b2":{"points":3,"errors":4}},{"a1":{"points":6,"errors":3},"a2":{"points":5,"errors":3},"b1":{"points":5,"errors":4},"b2":{"points":3,"errors":5}}]}'::jsonb),
  ('sm_r2_eb_3', 'tm_r2_eb', 3, 'pair_e_3', 'pair_b_3', '[{"a":11,"b":9},{"a":12,"b":10}]'::jsonb, 'completed', NULL, '{"setPlayerStats":[{"a1":{"points":6,"errors":3},"a2":{"points":5,"errors":4},"b1":{"points":5,"errors":5},"b2":{"points":4,"errors":4}},{"a1":{"points":7,"errors":4},"a2":{"points":5,"errors":3},"b1":{"points":6,"errors":4},"b2":{"points":4,"errors":5}}]}'::jsonb),
  ('sm_r2_df_1', 'tm_r2_df', 1, 'pair_d_1', 'pair_f_1', '[{"a":11,"b":9},{"a":9,"b":11},{"a":6,"b":4}]'::jsonb, 'live', NULL, '{"setPlayerStats":[{"a1":{"points":6,"errors":3},"a2":{"points":5,"errors":4},"b1":{"points":5,"errors":5},"b2":{"points":4,"errors":4}},{"a1":{"points":5,"errors":5},"a2":{"points":4,"errors":4},"b1":{"points":6,"errors":4},"b2":{"points":5,"errors":3}},{"a1":{"points":3,"errors":2},"a2":{"points":3,"errors":1},"b1":{"points":2,"errors":3},"b2":{"points":2,"errors":2}}]}'::jsonb),
  ('sm_r2_df_2', 'tm_r2_df', 2, 'pair_d_2', 'pair_f_2', '[{"a":0,"b":0}]'::jsonb, 'upcoming', NULL, '{"queueState":"ready"}'::jsonb),
  ('sm_r2_df_3', 'tm_r2_df', 3, 'pair_d_3', 'pair_f_3', '[{"a":0,"b":0}]'::jsonb, 'upcoming', NULL, NULL),
  ('sm_r3_ae_1', 'tm_r3_ae', 1, 'pair_a_1', 'pair_e_1', '[{"a":0,"b":0}]'::jsonb, 'upcoming', NULL, NULL),
  ('sm_r3_ae_2', 'tm_r3_ae', 2, 'pair_a_2', 'pair_e_2', '[{"a":0,"b":0}]'::jsonb, 'upcoming', NULL, NULL),
  ('sm_r3_ae_3', 'tm_r3_ae', 3, 'pair_a_3', 'pair_e_3', '[{"a":0,"b":0}]'::jsonb, 'upcoming', NULL, NULL),
  ('sm_r3_cf_1', 'tm_r3_cf', 1, 'pair_c_1', 'pair_f_1', '[{"a":0,"b":0}]'::jsonb, 'upcoming', NULL, NULL),
  ('sm_r3_cf_2', 'tm_r3_cf', 2, 'pair_c_2', 'pair_f_2', '[{"a":0,"b":0}]'::jsonb, 'upcoming', NULL, NULL),
  ('sm_r3_cf_3', 'tm_r3_cf', 3, 'pair_c_3', 'pair_f_3', '[{"a":0,"b":0}]'::jsonb, 'upcoming', NULL, NULL),
  ('sm_r3_ce_1', 'tm_r3_ce', 1, 'pair_c_1', 'pair_e_1', '[{"a":0,"b":0}]'::jsonb, 'upcoming', NULL, NULL),
  ('sm_r3_ce_2', 'tm_r3_ce', 2, 'pair_c_2', 'pair_e_2', '[{"a":0,"b":0}]'::jsonb, 'upcoming', NULL, NULL),
  ('sm_r3_ce_3', 'tm_r3_ce', 3, 'pair_c_3', 'pair_e_3', '[{"a":0,"b":0}]'::jsonb, 'upcoming', NULL, NULL);

COMMIT;
