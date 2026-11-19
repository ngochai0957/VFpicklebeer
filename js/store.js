import { APP_CONFIG } from './config.js';
import { createInitialDemoState } from './demo-data.js';
import { normalizeConfig } from './tournament-engine.js';

const STORAGE_KEY_PREFIX = 'pickleball_team_league_v1_';
const SESSION_ADMIN_KEY = 'pickleball_team_league_local_admin_v1';
const BROADCAST_CHANNEL_NAME = 'pickleball_team_league_sync_v1';

function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function normalizeState(raw, tournamentId) {
    const fallback = createInitialDemoState(tournamentId);
    const tournament = raw?.tournament
        ? {
            ...fallback.tournament,
            ...raw.tournament,
            id: raw.tournament.id || tournamentId,
            config: normalizeConfig(raw.tournament.config)
        }
        : fallback.tournament;

    return {
        tournament,
        teams: Array.isArray(raw?.teams) ? raw.teams : [],
        teamPairs: Array.isArray(raw?.teamPairs) ? raw.teamPairs : [],
        teamMatches: Array.isArray(raw?.teamMatches) ? raw.teamMatches : [],
        subMatches: Array.isArray(raw?.subMatches) ? raw.subMatches : []
    };
}

/**
 * LocalStorage-backed store for immediate offline/demo testing.
 * Syncs across open browser tabs via BroadcastChannel + storage events.
 */
class LocalStore {
    constructor(tournamentId) {
        this.mode = 'local';
        this.tournamentId = tournamentId;
        this.storageKey = `${STORAGE_KEY_PREFIX}${tournamentId}`;
        this.listeners = new Set();
        this.authListeners = new Set();
        this.channel = typeof BroadcastChannel !== 'undefined'
            ? new BroadcastChannel(BROADCAST_CHANNEL_NAME)
            : null;
    }

    async init() {
        if (!localStorage.getItem(this.storageKey)) {
            const initial = createInitialDemoState(this.tournamentId);
            localStorage.setItem(this.storageKey, JSON.stringify(initial));
        }

        if (this.channel) {
            this.channel.onmessage = () => this._notifyData();
        }
        window.addEventListener('storage', (ev) => {
            if (ev.key === this.storageKey) this._notifyData();
            if (ev.key === SESSION_ADMIN_KEY) this._notifyAuth();
        });
    }

    _read() {
        try {
            const raw = localStorage.getItem(this.storageKey);
            if (!raw) return createInitialDemoState(this.tournamentId);
            const normalized = normalizeState(JSON.parse(raw), this.tournamentId);
            if (normalized.tournament.name === 'Giải Pickleball Team League 2026') {
                normalized.tournament.name = 'VACIF PickleBeer Team League 2026';
                normalized.tournament.subtitle = 'Giải đồng đội VACIF • Đội hình cố định (Fixed Lineup) • Tỉ số từng Set';
            }
            return normalized;
        } catch {
            return createInitialDemoState(this.tournamentId);
        }
    }

    _write(nextState) {
        const cloned = deepClone(nextState);
        cloned.tournament.updated_at = new Date().toISOString();
        localStorage.setItem(this.storageKey, JSON.stringify(cloned));
        if (this.channel) {
            this.channel.postMessage({ type: 'updated', at: Date.now() });
        }
        this._notifyData();
        return cloned;
    }

    _notifyData() {
        const state = this._read();
        for (const cb of this.listeners) cb(state);
    }

    _notifyAuth() {
        const status = this.isAdminSync();
        for (const cb of this.authListeners) cb(status);
    }

    isAdminSync() {
        return sessionStorage.getItem(SESSION_ADMIN_KEY) === 'true';
    }

    async getAuthState() {
        return {
            isAdmin: this.isAdminSync(),
            email: this.isAdminSync() ? 'local-admin' : null
        };
    }

    async signInAdmin({ password }) {
        if (!password || password !== APP_CONFIG.LOCAL_DEMO_PIN) {
            throw new Error('Sai mã PIN quản trị (Local Demo).');
        }
        sessionStorage.setItem(SESSION_ADMIN_KEY, 'true');
        this._notifyAuth();
        return { isAdmin: true, email: 'local-admin' };
    }

    async signOutAdmin() {
        sessionStorage.removeItem(SESSION_ADMIN_KEY);
        this._notifyAuth();
    }

    onAuthChange(cb) {
        this.authListeners.add(cb);
        return () => this.authListeners.delete(cb);
    }

    async fetchState() {
        return this._read();
    }

    subscribe(cb) {
        this.listeners.add(cb);
        return () => this.listeners.delete(cb);
    }

    async updateTournament(patch) {
        const state = this._read();
        state.tournament = {
            ...state.tournament,
            ...patch,
            config: normalizeConfig(patch.config ? { ...state.tournament.config, ...patch.config } : state.tournament.config)
        };
        return this._write(state);
    }

    async saveTeamAndPairs(team, pairs) {
        const state = this._read();
        const tIdx = state.teams.findIndex((t) => t.id === team.id);
        if (tIdx >= 0) state.teams[tIdx] = { ...state.teams[tIdx], ...team };
        else state.teams.push(team);

        for (const p of pairs) {
            const pIdx = state.teamPairs.findIndex((x) => x.id === p.id);
            if (pIdx >= 0) state.teamPairs[pIdx] = { ...state.teamPairs[pIdx], ...p };
            else state.teamPairs.push(p);
        }
        return this._write(state);
    }

    async saveAllRoster(nextTeams, nextPairs, removedTeamIds = [], removedPairIds = []) {
        const state = this._read();
        const removedTeamsSet = new Set(removedTeamIds);
        const removedPairsSet = new Set(removedPairIds);

        state.teams = deepClone(nextTeams);
        state.teamPairs = deepClone(nextPairs);

        if (removedTeamsSet.size > 0) {
            const removedMatchIds = new Set(
                state.teamMatches
                    .filter((tm) => removedTeamsSet.has(tm.team_a_id) || removedTeamsSet.has(tm.team_b_id))
                    .map((tm) => tm.id)
            );
            state.teamMatches = state.teamMatches.filter((tm) => !removedMatchIds.has(tm.id));
            state.subMatches = state.subMatches.filter((sm) => !removedMatchIds.has(sm.team_match_id));
        }

        // Sync sub-matches when levelsCount expands or shrinks
        const levelsCount = Math.max(1, Number(state.tournament.config?.levelsCount) || 3);
        const pairLookup = new Map(state.teamPairs.map((p) => [`${p.team_id}:${p.level_index}`, p.id]));

        state.subMatches = state.subMatches.filter((sm) => {
            if (sm.level_index > levelsCount) return false;
            if (removedPairsSet.has(sm.pair_a_id) || removedPairsSet.has(sm.pair_b_id)) {
                return sm.level_index <= levelsCount;
            }
            return true;
        });

        for (const tm of state.teamMatches) {
            for (let lvl = 1; lvl <= levelsCount; lvl++) {
                const exists = state.subMatches.find((sm) => sm.team_match_id === tm.id && sm.level_index === lvl);
                if (!exists) {
                    state.subMatches.push({
                        id: `${tm.id}_l${lvl}_${Date.now().toString(36)}`,
                        team_match_id: tm.id,
                        level_index: lvl,
                        pair_a_id: pairLookup.get(`${tm.team_a_id}:${lvl}`) || null,
                        pair_b_id: pairLookup.get(`${tm.team_b_id}:${lvl}`) || null,
                        sets: [{ a: 0, b: 0 }],
                        status: 'upcoming',
                        winner_override: null,
                        format_override: null
                    });
                } else {
                    exists.pair_a_id = pairLookup.get(`${tm.team_a_id}:${lvl}`) || exists.pair_a_id;
                    exists.pair_b_id = pairLookup.get(`${tm.team_b_id}:${lvl}`) || exists.pair_b_id;
                }
            }
        }

        return this._write(state);
    }

    async replaceRoundRobinSchedule(newTeamMatches, newSubMatches) {
        const state = this._read();
        const oldRrIds = new Set(
            state.teamMatches
                .filter((tm) => (tm.stage || 'round_robin') === 'round_robin')
                .map((tm) => tm.id)
        );
        const playoffMatches = state.teamMatches.filter((tm) => tm.stage === 'playoff');
        const playoffSubs = state.subMatches.filter((sm) => !oldRrIds.has(sm.team_match_id));

        state.teamMatches = [...deepClone(newTeamMatches), ...playoffMatches];
        state.subMatches = [...deepClone(newSubMatches), ...playoffSubs];
        return this._write(state);
    }

    async createTeamMatch(teamMatch, newSubMatches) {
        const state = this._read();
        state.teamMatches.push(deepClone(teamMatch));
        state.subMatches.push(...deepClone(newSubMatches));
        return this._write(state);
    }

    async updateTeamMatch(teamMatchId, patch) {
        const state = this._read();
        const idx = state.teamMatches.findIndex((tm) => tm.id === teamMatchId);
        if (idx >= 0) {
            state.teamMatches[idx] = { ...state.teamMatches[idx], ...patch };
        }
        return this._write(state);
    }

    async deleteTeamMatch(teamMatchId) {
        const state = this._read();
        state.teamMatches = state.teamMatches.filter((tm) => tm.id !== teamMatchId);
        state.subMatches = state.subMatches.filter((sm) => sm.team_match_id !== teamMatchId);
        return this._write(state);
    }

    async updateSubMatch(subMatchId, patch) {
        const state = this._read();
        const idx = state.subMatches.findIndex((sm) => sm.id === subMatchId);
        if (idx >= 0) {
            state.subMatches[idx] = { ...state.subMatches[idx], ...patch };
        }
        return this._write(state);
    }

    async importFullState(rawState) {
        const normalized = normalizeState(rawState, this.tournamentId);
        return this._write(normalized);
    }
}

/**
 * Supabase Cloud Store — Public read via RLS, Single-Admin write via Auth + admin_users table,
 * and live Realtime synchronization across all connected viewers.
 */
class SupabaseStore {
    constructor(url, anonKey, tournamentId) {
        this.mode = 'supabase';
        this.url = url;
        this.anonKey = anonKey;
        this.tournamentId = tournamentId;
        this.supabase = null;
        this.listeners = new Set();
        this.authListeners = new Set();
        this.channel = null;
        this.refreshTimer = null;
        this.isAdminCached = false;
    }

    async init() {
        const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
        this.supabase = createClient(this.url, this.anonKey, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: false
            }
        });

        this.supabase.auth.onAuthStateChange(async () => {
            const authState = await this.getAuthState();
            for (const cb of this.authListeners) cb(authState.isAdmin, authState);
        });
    }

    async _checkAdminRecord(userId) {
        if (!userId) return false;
        const { data, error } = await this.supabase
            .from('admin_users')
            .select('user_id')
            .eq('user_id', userId)
            .maybeSingle();
        if (error) {
            console.warn('Admin verification check failed:', error.message);
            return false;
        }
        return Boolean(data?.user_id);
    }

    async getAuthState() {
        const { data } = await this.supabase.auth.getSession();
        const session = data?.session;
        if (!session?.user) {
            this.isAdminCached = false;
            return { isAdmin: false, email: null };
        }
        const verified = await this._checkAdminRecord(session.user.id);
        this.isAdminCached = verified;
        return {
            isAdmin: verified,
            email: session.user.email || null
        };
    }

    async signInAdmin({ email, password }) {
        const targetEmail = (email || APP_CONFIG.ADMIN_EMAIL || '').trim();
        if (!targetEmail) {
            throw new Error('Vui lòng nhập Email Admin (hoặc cấu hình sẵn ADMIN_EMAIL trong js/config.js).');
        }
        if (!password) {
            throw new Error('Vui lòng nhập Mật khẩu quản trị.');
        }

        const { data, error } = await this.supabase.auth.signInWithPassword({
            email: targetEmail,
            password
        });
        if (error) {
            throw new Error('Đăng nhập thất bại: Sai email hoặc mật khẩu.');
        }

        const verified = await this._checkAdminRecord(data.user?.id);
        if (!verified) {
            await this.supabase.auth.signOut();
            throw new Error('Tài khoản này không có quyền Admin trong bảng admin_users.');
        }

        this.isAdminCached = true;
        return { isAdmin: true, email: data.user.email };
    }

    async signOutAdmin() {
        await this.supabase.auth.signOut();
        this.isAdminCached = false;
    }

    onAuthChange(cb) {
        this.authListeners.add(cb);
        return () => this.authListeners.delete(cb);
    }

    async fetchState() {
        const { data: tourney, error: tErr } = await this.supabase
            .from('tournaments')
            .select('*')
            .eq('id', this.tournamentId)
            .maybeSingle();

        if (tErr) throw new Error(`Không thể tải dữ liệu giải đấu: ${tErr.message}`);

        if (!tourney) {
            return {
                isUninitialized: true,
                tournament: {
                    id: this.tournamentId,
                    name: 'VACIF PickleBeer Team League 2026',
                    subtitle: 'Giải đồng đội VACIF • Chưa khởi tạo dữ liệu giải đấu',
                    status: 'upcoming',
                    config: normalizeConfig(null),
                    updated_at: new Date().toISOString()
                },
                teams: [],
                teamPairs: [],
                teamMatches: [],
                subMatches: []
            };
        }

        const [teamsRes, matchesRes] = await Promise.all([
            this.supabase
                .from('teams')
                .select('*')
                .eq('tournament_id', this.tournamentId)
                .order('seed_order', { ascending: true }),
            this.supabase
                .from('team_matches')
                .select('*')
                .eq('tournament_id', this.tournamentId)
                .order('round_number', { ascending: true })
                .order('sort_order', { ascending: true })
        ]);

        if (teamsRes.error) throw teamsRes.error;
        if (matchesRes.error) throw matchesRes.error;

        const teams = teamsRes.data || [];
        const teamMatches = matchesRes.data || [];
        const teamIds = teams.map((t) => t.id);
        const matchIds = teamMatches.map((m) => m.id);

        const [pairsRes, subsRes] = await Promise.all([
            teamIds.length > 0
                ? this.supabase.from('team_pairs').select('*').in('team_id', teamIds).order('level_index', { ascending: true })
                : Promise.resolve({ data: [], error: null }),
            matchIds.length > 0
                ? this.supabase.from('sub_matches').select('*').in('team_match_id', matchIds).order('level_index', { ascending: true })
                : Promise.resolve({ data: [], error: null })
        ]);

        if (pairsRes.error) throw pairsRes.error;
        if (subsRes.error) throw subsRes.error;

        return {
            isUninitialized: false,
            tournament: {
                ...tourney,
                config: normalizeConfig(tourney.config)
            },
            teams,
            teamPairs: pairsRes.data || [],
            teamMatches,
            subMatches: subsRes.data || []
        };
    }

    subscribe(cb) {
        this.listeners.add(cb);

        if (!this.channel && this.supabase) {
            const scheduleRefresh = () => {
                clearTimeout(this.refreshTimer);
                this.refreshTimer = setTimeout(async () => {
                    try {
                        const latest = await this.fetchState();
                        for (const listener of this.listeners) listener(latest);
                    } catch (err) {
                        console.warn('Realtime refresh failed:', err);
                    }
                }, 150);
            };

            this.channel = this.supabase
                .channel(`league-realtime-${this.tournamentId}`)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'tournaments' }, scheduleRefresh)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, scheduleRefresh)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'team_pairs' }, scheduleRefresh)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'team_matches' }, scheduleRefresh)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'sub_matches' }, scheduleRefresh)
                .subscribe();
        }

        return () => {
            this.listeners.delete(cb);
            if (this.listeners.size === 0 && this.channel) {
                this.supabase.removeChannel(this.channel);
                this.channel = null;
            }
        };
    }

    async _ensureSucceeded(res, label) {
        if (res.error) {
            throw new Error(`${label}: ${res.error.message}`);
        }
        return res.data;
    }

    async updateTournament(patch) {
        const current = await this.fetchState();
        const merged = {
            id: this.tournamentId,
            name: patch.name ?? current.tournament.name,
            subtitle: patch.subtitle ?? current.tournament.subtitle,
            status: patch.status ?? current.tournament.status,
            config: normalizeConfig(patch.config ? { ...current.tournament.config, ...patch.config } : current.tournament.config)
        };
        await this._ensureSucceeded(
            await this.supabase.from('tournaments').upsert(merged),
            'Cập nhật giải đấu'
        );
        return this.fetchState();
    }

    async saveTeamAndPairs(team, pairs) {
        await this._ensureSucceeded(
            await this.supabase.from('teams').upsert(team),
            'Lưu thông tin đội'
        );
        if (pairs.length > 0) {
            await this._ensureSucceeded(
                await this.supabase.from('team_pairs').upsert(pairs),
                'Lưu danh sách cặp'
            );
        }
        return this.fetchState();
    }

    async saveAllRoster(nextTeams, nextPairs, removedTeamIds = [], removedPairIds = []) {
        if (removedTeamIds.length > 0) {
            await this._ensureSucceeded(
                await this.supabase.from('teams').delete().in('id', removedTeamIds),
                'Xóa đội dư'
            );
        }
        if (removedPairIds.length > 0) {
            await this._ensureSucceeded(
                await this.supabase.from('team_pairs').delete().in('id', removedPairIds),
                'Xóa cặp dư'
            );
        }
        if (nextTeams.length > 0) {
            await this._ensureSucceeded(
                await this.supabase.from('teams').upsert(nextTeams),
                'Cập nhật danh sách đội'
            );
        }
        if (nextPairs.length > 0) {
            await this._ensureSucceeded(
                await this.supabase.from('team_pairs').upsert(nextPairs),
                'Cập nhật cặp đấu'
            );
        }

        // Sync sub_matches against current levelsCount & pair links
        const state = await this.fetchState();
        const levelsCount = Math.max(1, Number(state.tournament.config?.levelsCount) || 3);
        const pairLookup = new Map(nextPairs.map((p) => [`${p.team_id}:${p.level_index}`, p.id]));

        const extraSubIds = state.subMatches
            .filter((sm) => sm.level_index > levelsCount)
            .map((sm) => sm.id);

        if (extraSubIds.length > 0) {
            await this._ensureSucceeded(
                await this.supabase.from('sub_matches').delete().in('id', extraSubIds),
                'Xóa trận level thừa'
            );
        }

        const subUpserts = [];
        for (const tm of state.teamMatches) {
            for (let lvl = 1; lvl <= levelsCount; lvl++) {
                const existing = state.subMatches.find((sm) => sm.team_match_id === tm.id && sm.level_index === lvl);
                if (!existing) {
                    subUpserts.push({
                        id: `${tm.id}_l${lvl}_${Date.now().toString(36)}`,
                        team_match_id: tm.id,
                        level_index: lvl,
                        pair_a_id: pairLookup.get(`${tm.team_a_id}:${lvl}`) || null,
                        pair_b_id: pairLookup.get(`${tm.team_b_id}:${lvl}`) || null,
                        sets: [{ a: 0, b: 0 }],
                        status: 'upcoming',
                        winner_override: null,
                        format_override: null
                    });
                } else {
                    const pairAId = pairLookup.get(`${tm.team_a_id}:${lvl}`) || null;
                    const pairBId = pairLookup.get(`${tm.team_b_id}:${lvl}`) || null;
                    if (existing.pair_a_id !== pairAId || existing.pair_b_id !== pairBId) {
                        subUpserts.push({
                            ...existing,
                            pair_a_id: pairAId,
                            pair_b_id: pairBId
                        });
                    }
                }
            }
        }

        if (subUpserts.length > 0) {
            await this._ensureSucceeded(
                await this.supabase.from('sub_matches').upsert(subUpserts),
                'Đồng bộ các trận theo Level'
            );
        }

        return this.fetchState();
    }

    async replaceRoundRobinSchedule(newTeamMatches, newSubMatches) {
        await this._ensureSucceeded(
            await this.supabase
                .from('team_matches')
                .delete()
                .eq('tournament_id', this.tournamentId)
                .eq('stage', 'round_robin'),
            'Xóa lịch vòng tròn cũ'
        );

        if (newTeamMatches.length > 0) {
            await this._ensureSucceeded(
                await this.supabase.from('team_matches').insert(newTeamMatches),
                'Tạo lịch vòng tròn mới'
            );
        }
        if (newSubMatches.length > 0) {
            await this._ensureSucceeded(
                await this.supabase.from('sub_matches').insert(newSubMatches),
                'Tạo các trận cặp vòng tròn'
            );
        }
        return this.fetchState();
    }

    async createTeamMatch(teamMatch, newSubMatches) {
        await this._ensureSucceeded(
            await this.supabase.from('team_matches').insert(teamMatch),
            'Thêm trận đấu'
        );
        if (newSubMatches.length > 0) {
            await this._ensureSucceeded(
                await this.supabase.from('sub_matches').insert(newSubMatches),
                'Thêm trận cặp'
            );
        }
        return this.fetchState();
    }

    async updateTeamMatch(teamMatchId, patch) {
        await this._ensureSucceeded(
            await this.supabase.from('team_matches').update(patch).eq('id', teamMatchId),
            'Cập nhật trận đấu'
        );
        return this.fetchState();
    }

    async deleteTeamMatch(teamMatchId) {
        await this._ensureSucceeded(
            await this.supabase.from('team_matches').delete().eq('id', teamMatchId),
            'Xóa trận đấu'
        );
        return this.fetchState();
    }

    async updateSubMatch(subMatchId, patch) {
        await this._ensureSucceeded(
            await this.supabase.from('sub_matches').update(patch).eq('id', subMatchId),
            'Cập nhật tỉ số set'
        );
        return this.fetchState();
    }

    async importFullState(rawState) {
        const normalized = normalizeState(rawState, this.tournamentId);
        // Clean existing tournament children and re-insert atomically per table
        await this._ensureSucceeded(
            await this.supabase.from('tournaments').upsert({
                ...normalized.tournament,
                id: this.tournamentId
            }),
            'Import giải đấu'
        );

        await this._ensureSucceeded(
            await this.supabase.from('team_matches').delete().eq('tournament_id', this.tournamentId),
            'Làm sạch lịch cũ'
        );
        await this._ensureSucceeded(
            await this.supabase.from('teams').delete().eq('tournament_id', this.tournamentId),
            'Làm sạch đội cũ'
        );

        const teams = normalized.teams.map((t) => ({ ...t, tournament_id: this.tournamentId }));
        if (teams.length > 0) {
            await this._ensureSucceeded(await this.supabase.from('teams').insert(teams), 'Import đội');
        }
        if (normalized.teamPairs.length > 0) {
            await this._ensureSucceeded(await this.supabase.from('team_pairs').insert(normalized.teamPairs), 'Import cặp đấu');
        }

        const teamMatches = normalized.teamMatches.map((tm) => ({ ...tm, tournament_id: this.tournamentId }));
        if (teamMatches.length > 0) {
            await this._ensureSucceeded(await this.supabase.from('team_matches').insert(teamMatches), 'Import lịch đấu');
        }
        if (normalized.subMatches.length > 0) {
            await this._ensureSucceeded(await this.supabase.from('sub_matches').insert(normalized.subMatches), 'Import tỉ số');
        }

        return this.fetchState();
    }
}

export function createStore() {
    const url = (APP_CONFIG.SUPABASE_URL || '').trim();
    const anonKey = (APP_CONFIG.SUPABASE_ANON_KEY || '').trim();
    const tournamentId = (APP_CONFIG.TOURNAMENT_ID || 'main').trim();

    if (url && anonKey) {
        return new SupabaseStore(url, anonKey, tournamentId);
    }
    return new LocalStore(tournamentId);
}
