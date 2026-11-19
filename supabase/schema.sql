-- ============================================================================
-- Pickleball Team League (Fixed Lineup) — Supabase Schema & Strict RLS
-- ============================================================================
-- Run this entire script once in Supabase Dashboard -> SQL Editor.
-- After running, create ONE Admin user in Authentication -> Users -> Add user,
-- disable public signups, and register that user's UUID in public.admin_users.
-- ============================================================================

-- 1. Admin Registry (ONLY users listed here can mutate tournament data)
CREATE TABLE IF NOT EXISTS public.admin_users (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    note TEXT NOT NULL DEFAULT 'Tournament Admin',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Signed-in user can only check whether their own UID is in admin_users.
-- No INSERT/UPDATE/DELETE policies exist for anon or authenticated;
-- rows can ONLY be added via Supabase SQL Editor (postgres role).
DROP POLICY IF EXISTS "Admin self check" ON public.admin_users;
CREATE POLICY "Admin self check"
    ON public.admin_users
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.admin_users
        WHERE user_id = auth.uid()
    );
$$;

-- 2. Tournaments
CREATE TABLE IF NOT EXISTS public.tournaments (
    id TEXT PRIMARY KEY DEFAULT 'main',
    name TEXT NOT NULL,
    subtitle TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('upcoming', 'live', 'completed')),
    config JSONB NOT NULL DEFAULT '{
        "bestOf": 3,
        "pointsPerSet": 11,
        "winByTwo": true,
        "pointCap": 0,
        "levelsCount": 3,
        "levelNames": ["Level 1", "Level 2", "Level 3"],
        "doubleRoundRobin": false
    }'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Teams
CREATE TABLE IF NOT EXISTS public.teams (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#2563EB',
    seed_order INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_teams_tournament ON public.teams(tournament_id, seed_order);

-- 4. Fixed Lineup Pairs per Team
CREATE TABLE IF NOT EXISTS public.team_pairs (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    level_index INTEGER NOT NULL CHECK (level_index >= 1),
    pair_label TEXT NOT NULL,
    player_1 TEXT NOT NULL DEFAULT '',
    player_2 TEXT NOT NULL DEFAULT '',
    UNIQUE (team_id, level_index)
);

CREATE INDEX IF NOT EXISTS idx_team_pairs_team ON public.team_pairs(team_id, level_index);

-- 5. Team Matches (Head-to-head tie between Team A and Team B)
CREATE TABLE IF NOT EXISTS public.team_matches (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL DEFAULT 1,
    round_name TEXT NOT NULL DEFAULT 'Vòng 1',
    stage TEXT NOT NULL DEFAULT 'round_robin' CHECK (stage IN ('round_robin', 'playoff')),
    team_a_id TEXT REFERENCES public.teams(id) ON DELETE CASCADE,
    team_b_id TEXT REFERENCES public.teams(id) ON DELETE CASCADE,
    court TEXT NOT NULL DEFAULT '',
    scheduled_time TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'live', 'completed')),
    sort_order INTEGER NOT NULL DEFAULT 1,
    note TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_team_matches_tournament ON public.team_matches(tournament_id, stage, round_number, sort_order);

-- 6. Sub-Matches (Each Level pair matchup inside a Team Match, scored set-by-set)
CREATE TABLE IF NOT EXISTS public.sub_matches (
    id TEXT PRIMARY KEY,
    team_match_id TEXT NOT NULL REFERENCES public.team_matches(id) ON DELETE CASCADE,
    level_index INTEGER NOT NULL CHECK (level_index >= 1),
    pair_a_id TEXT REFERENCES public.team_pairs(id) ON DELETE SET NULL,
    pair_b_id TEXT REFERENCES public.team_pairs(id) ON DELETE SET NULL,
    sets JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'live', 'completed')),
    winner_override TEXT CHECK (winner_override IN ('A', 'B') OR winner_override IS NULL),
    format_override JSONB,
    UNIQUE (team_match_id, level_index)
);

CREATE INDEX IF NOT EXISTS idx_sub_matches_team_match ON public.sub_matches(team_match_id, level_index);

-- 7. Updated_at trigger on tournaments
CREATE OR REPLACE FUNCTION public.touch_tournament_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tournaments_updated_at ON public.tournaments;
CREATE TRIGGER trg_tournaments_updated_at
    BEFORE UPDATE ON public.tournaments
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_tournament_updated_at();

-- 8. Row Level Security (Public Read-Only, Single-Admin Write)
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_matches ENABLE ROW LEVEL SECURITY;

-- Public read access for external spectators
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['tournaments', 'teams', 'team_pairs', 'team_matches', 'sub_matches']
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Public read %s" ON public.%I', tbl, tbl);
        EXECUTE format('CREATE POLICY "Public read %s" ON public.%I FOR SELECT TO anon, authenticated USING (true)', tbl, tbl);

        EXECUTE format('DROP POLICY IF EXISTS "Admin insert %s" ON public.%I', tbl, tbl);
        EXECUTE format('CREATE POLICY "Admin insert %s" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_admin())', tbl, tbl);

        EXECUTE format('DROP POLICY IF EXISTS "Admin update %s" ON public.%I', tbl, tbl);
        EXECUTE format('CREATE POLICY "Admin update %s" ON public.%I FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())', tbl, tbl);

        EXECUTE format('DROP POLICY IF EXISTS "Admin delete %s" ON public.%I', tbl, tbl);
        EXECUTE format('CREATE POLICY "Admin delete %s" ON public.%I FOR DELETE TO authenticated USING (public.is_admin())', tbl, tbl);
    END LOOP;
END $$;

-- 9. Realtime Replication (so external users see live scores without refreshing)
ALTER TABLE public.tournaments REPLICA IDENTITY FULL;
ALTER TABLE public.teams REPLICA IDENTITY FULL;
ALTER TABLE public.team_pairs REPLICA IDENTITY FULL;
ALTER TABLE public.team_matches REPLICA IDENTITY FULL;
ALTER TABLE public.sub_matches REPLICA IDENTITY FULL;

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['tournaments', 'teams', 'team_pairs', 'team_matches', 'sub_matches']
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
              AND schemaname = 'public'
              AND tablename = tbl
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
        END IF;
    END LOOP;
END $$;

-- ============================================================================
-- STEP FINAL (RUN AFTER CREATING YOUR ADMIN USER IN AUTHENTICATION -> USERS):
-- Replace 'admin@yourdomain.com' with your real admin email and run:
--
-- INSERT INTO public.admin_users (user_id, note)
-- SELECT id, 'Primary Tournament Admin'
-- FROM auth.users
-- WHERE email = 'admin@yourdomain.com'
-- ON CONFLICT (user_id) DO NOTHING;
-- ============================================================================
