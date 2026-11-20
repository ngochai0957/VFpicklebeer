import { createInitialDemoState } from './demo-data.js';
import { createStore } from './store.js';
import {
    applyRallyOutcomeToSet,
    buildPlayerSelectOptionsHtml,
    buildRegisteredPlayerCatalog,
    buildResizedRoster,
    calculateStandings,
    combineScheduleValue,
    createRallyLogEntry,
    escapeHtml,
    evaluateSubMatch,
    evaluateTeamMatch,
    findDuplicateRosterPlayers,
    generateRoundRobinSchedule,
    getSkillLevelRank,
    getSubMatchStatusRank,
    normalizeConfig,
    normalizeRallyState,
    normalizeSetPlayerStats,
    normalizeSetRallyLogs,
    normalizeSkillLevel,
    sanitizeRegistrationPayload,
    selectRallyRole,
    swapRallyCourtOrder
} from './tournament-engine.js';
import {
    REGISTRATION_TABLE_SQL,
    renderAdminLoginModal,
    renderAdminTab,
    renderEditRegistrationModal
} from './ui-admin.js';
import {
    renderAwardsTab,
    renderLiveSpotlight,
    renderMatchesTab,
    renderRegisterPage,
    renderRulesTab,
    renderStandingsTab,
    renderSubMatchHistoryModal,
    renderTeamDetailModal,
    renderTeamsTab,
    renderTvModeView
} from './ui-public.js';

const store = createStore();

function generateSessionMaskSeed() {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const arr = new Uint32Array(1);
        crypto.getRandomValues(arr);
        return (arr[0] % 999983) + 1;
    }
    return Math.floor(Math.random() * 999983) + 1;
}

const appState = {
    data: null,
    isAdmin: false,
    adminEmail: null,
    activeTab: 'standings',
    tvMode: false,
    sessionMaskSeed: generateSessionMaskSeed(),
    teamsQuery: '',
    awardsFilters: {
        teamId: 'all',
        query: ''
    },
    filters: {
        status: 'all',
        round: 'all',
        teamId: 'all',
        query: ''
    },
    adminState: {
        subtab: 'scores',
        selectedMatchId: null,
        rallyBySet: {},
        rallyUndoBySet: {},
        registrations: [],
        registrationsTableMissing: false,
        regQuery: '',
        regStatusFilter: 'all'
    },
    registerState: {
        submitting: false,
        error: '',
        submittedReceipt: null
    },
    modal: null,
    loading: true,
    error: null
};

const pendingSubSaves = new Map();
const activeSavePromises = new Map();
let deferredRender = false;

function syncMobileHeaderHeight() {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    const navEl = document.getElementById('nav-root');
    if (navEl && !navEl.classList.contains('hidden')) {
        const h = window.innerWidth <= 900 ? 0 : (navEl.offsetHeight || 70);
        document.documentElement.style.setProperty('--site-header-h', `${h}px`);
    }
    document.body.classList.remove('mobile-header-hidden');
}

function isRegisterPageMode() {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return ['1', 'true', 'yes'].includes((params.get('register') || '').toLowerCase())
        || params.get('page') === 'register'
        || window.location.hash === '#register';
}

async function loadAdminRegistrations({ rerenderAfter = true } = {}) {
    if (!appState.isAdmin) {
        appState.adminState.registrations = [];
        appState.adminState.registrationsTableMissing = false;
        return;
    }
    try {
        const res = await store.fetchRegistrations();
        appState.adminState.registrations = Array.isArray(res?.rows) ? res.rows : [];
        appState.adminState.registrationsTableMissing = Boolean(res?.tableMissing);
        if (rerenderAfter) renderAll();
    } catch (err) {
        showToast(err.message || 'Không thể tải danh sách đăng ký.', true);
    }
}

function escapeCsvCell(value) {
    const str = String(value ?? '');
    if (/[",\r\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function downloadRegistrationsCsv(rows) {
    const sortedRows = [...(rows || [])].sort((a, b) => {
        const rankDiff = getSkillLevelRank(a.skill_level) - getSkillLevelRank(b.skill_level);
        if (rankDiff !== 0) return rankDiff;
        return String(a.full_name || '').localeCompare(String(b.full_name || ''), 'vi');
    });
    const header = ['#', 'Họ và tên', 'Tên thi đấu', 'Trình độ (Lv1 → Lv3)', 'Trạng thái', 'Thời gian đăng ký'];
    const lines = [
        header.map(escapeCsvCell).join(','),
        ...sortedRows.map((r, idx) => [
            idx + 1,
            r.full_name || '',
            r.display_name || r.full_name || '',
            r.skill_level ? normalizeSkillLevel(r.skill_level) : '',
            r.status === 'approved' ? 'Đã duyệt' : 'Chờ duyệt',
            r.created_at || ''
        ].map(escapeCsvCell).join(','))
    ];
    const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `danh-sach-dang-ky-vdv-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

function isEditingScoreInput() {
    const active = document.activeElement;
    return Boolean(active && active.classList && active.classList.contains('score-num-input'));
}

function collectRosterDraftFromDom() {
    const currentTeams = appState.data?.teams || [];
    const currentPairs = appState.data?.teamPairs || [];
    const config = normalizeConfig(appState.data?.tournament?.config);

    const draftTeams = currentTeams.map((t) => {
        const codeEl = document.querySelector(`[data-team-meta="${t.id}"][data-field="code"]`);
        const nameEl = document.querySelector(`[data-team-meta="${t.id}"][data-field="name"]`);
        const colorEl = document.querySelector(`[data-team-meta="${t.id}"][data-field="color"]`);
        return {
            ...t,
            code: (codeEl?.value ?? t.code).trim() || t.code,
            name: (nameEl?.value ?? t.name).trim() || t.name,
            color: colorEl?.value || t.color
        };
    });

    const draftPairs = [];
    for (const t of draftTeams) {
        for (let lvl = 1; lvl <= config.levelsCount; lvl++) {
            const existing = currentPairs.find((p) => p.team_id === t.id && p.level_index === lvl);
            const lblEl = document.querySelector(`[data-team-id="${t.id}"][data-level="${lvl}"][data-field="pair_label"]`);
            const p1El = document.querySelector(`[data-team-id="${t.id}"][data-level="${lvl}"][data-field="player_1"]`);
            const p2El = document.querySelector(`[data-team-id="${t.id}"][data-level="${lvl}"][data-field="player_2"]`);
            draftPairs.push({
                id: existing?.id || `pair_${t.id}_l${lvl}`,
                team_id: t.id,
                level_index: lvl,
                pair_label: (lblEl?.value ?? existing?.pair_label ?? `${t.code}${lvl}`).trim(),
                player_1: (p1El?.value ?? existing?.player_1 ?? '').trim(),
                player_2: (p2El?.value ?? existing?.player_2 ?? '').trim()
            });
        }
    }
    return { draftTeams, draftPairs };
}

function syncRosterPlayerSelects(changedSelect = null) {
    const selects = Array.from(document.querySelectorAll('#admin-roster-editor .roster-player-select'));
    if (selects.length === 0) return;

    const catalog = buildRegisteredPlayerCatalog(appState.adminState.registrations || []);
    if (changedSelect) {
        const chosenKey = String(changedSelect.value || '').trim().toLowerCase();
        if (chosenKey) {
            const conflict = selects.some((sel) => sel !== changedSelect && String(sel.value || '').trim().toLowerCase() === chosenKey);
            if (conflict) {
                showToast(`VĐV "${changedSelect.value}" đã được chọn ở vị trí khác!`, true);
                changedSelect.value = '';
            }
        }
    }

    const chosenKeysAll = new Set();
    for (const sel of selects) {
        const val = String(sel.value || '').trim();
        const key = val.toLowerCase();
        if (key) chosenKeysAll.add(key);

        const otherAssignedKeys = new Set();
        for (const other of selects) {
            if (other === sel) continue;
            const otherKey = String(other.value || '').trim().toLowerCase();
            if (otherKey) otherAssignedKeys.add(otherKey);
        }
        const lvl = Number(sel.dataset.level) || 1;
        sel.innerHTML = buildPlayerSelectOptionsHtml(catalog, otherAssignedKeys, val, lvl);
        sel.value = val;
    }

    const badge = document.getElementById('roster-pool-badge');
    if (badge) {
        if (catalog.length > 0) {
            const assignedCount = catalog.filter((p) => chosenKeysAll.has(p.key)).length;
            const remaining = Math.max(0, catalog.length - assignedCount);
            badge.textContent = `Chờ xếp: ${remaining}/${catalog.length} VĐV`;
            badge.classList.toggle('is-done', remaining === 0);
        } else {
            badge.textContent = 'Chưa có VĐV ĐK';
            badge.classList.remove('is-done');
        }
    }
}

function showToast(message, isError = false) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast ${isError ? 'error' : ''}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
        el.remove();
    }, 3200);
}

function setSaveStatus(text, isError = false) {
    const el = document.getElementById('admin-save-status');
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? 'var(--crimson)' : 'var(--emerald)';
}

function formatUpdatedTime(iso) {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
        return '';
    }
}

const ICONS = {
    lock: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    refresh: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>',
    sliders: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="2" y1="14" x2="6" y2="14"/><line x1="10" y1="8" x2="14" y2="8"/><line x1="18" y1="16" x2="22" y2="16"/></svg>',
    shieldCheck: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>',
    tv: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="15" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/></svg>',
    share: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>'
};

function formatTwoToneTitle(rawName) {
    const raw = String(rawName || 'Pickleball Team League').trim();
    const legacyMatch = raw.match(/^vacif\s+picklebeer\s+team\s+league\s+(\d{4})$/i);
    if (legacyMatch) {
        return `VaciF PickleBeer ${escapeHtml(legacyMatch[1])} <span>Team League</span>`;
    }
    if (raw.includes('\n')) {
        const [line1, ...rest] = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
        if (rest.length > 0) {
            return `${escapeHtml(line1)} <span>${escapeHtml(rest.join(' '))}</span>`;
        }
    }
    const safe = escapeHtml(raw);
    const parts = safe.trim().split(/\s+/);
    if (parts.length <= 2) return safe;
    const splitAt = Math.max(1, parts.length - 2);
    return `${parts.slice(0, splitAt).join(' ')} <span>${parts.slice(splitAt).join(' ')}</span>`;
}

function renderModeBanner() {
    const footerSync = document.getElementById('footer-sync-text');
    if (footerSync && appState.data) {
        const updated = formatUpdatedTime(appState.data.tournament?.updated_at);
        footerSync.textContent = store.mode === 'supabase'
            ? `Cloud Realtime • Cập nhật lúc ${updated}`
            : `Local Demo Mode • Cập nhật lúc ${updated}`;
    }
}

function renderHeroAndNav() {
    const navEl = document.getElementById('nav-root');
    const heroEl = document.getElementById('hero-root');

    if (isRegisterPageMode()) {
        if (navEl) {
            navEl.innerHTML = '';
            navEl.classList.add('hidden');
        }
        if (heroEl) {
            heroEl.innerHTML = '';
            heroEl.classList.add('hidden');
        }
        return;
    }

    if (navEl) navEl.classList.remove('hidden');

    const state = appState.data;
    if (!state) return;

    const config = normalizeConfig(state.tournament?.config);
    const liveMatchesCount = (state.teamMatches || []).filter((tm) => {
        const ev = evaluateTeamMatch(tm, state.subMatches, config);
        return ev.effectiveStatus === 'live';
    }).length;
    const completedCount = (state.teamMatches || []).filter((tm) => {
        const ev = evaluateTeamMatch(tm, state.subMatches, config);
        return ev.effectiveStatus === 'completed';
    }).length;

    if (navEl) {
        const tab = appState.activeTab;
        const awardsVisibility = config.awardsVisibility || 'public';
        const showAwardsTab = appState.isAdmin || awardsVisibility !== 'hidden';
        const awardsAdminBadge = appState.isAdmin && awardsVisibility !== 'public'
            ? ` <span>${awardsVisibility === 'hidden' ? '🔒' : '🕶'}</span>`
            : '';
        const awardsTabHtml = showAwardsTab
            ? `<button type="button" class="nav-tab ${tab === 'awards' ? 'active' : ''}" data-action="switch-tab" data-tab="awards">Vinh Danh &amp; Point${awardsAdminBadge}</button>`
            : '';
        const adminTabHtml = appState.isAdmin
            ? `<button type="button" class="nav-tab admin-tab ${tab === 'admin' ? 'active' : ''}" data-action="switch-tab" data-tab="admin">${ICONS.sliders} Quản trị</button>`
            : '';

        const adminButton = appState.isAdmin
            ? `<button type="button" class="smallbtn solid" data-action="go-admin">${ICONS.shieldCheck} Admin</button>`
            : `<button type="button" class="smallbtn" data-action="open-login">${ICONS.lock} Quản trị</button>`;

        navEl.innerHTML = `
            <div class="wrap nav-bar-inner">
                <button type="button" class="brand-btn" data-action="switch-tab" data-tab="standings">
                    VACIF <span>PICKLEBEER</span>
                </button>

                <nav class="nav-links" role="tablist" aria-label="Điều hướng">
                    <button type="button" class="nav-tab ${tab === 'standings' ? 'active' : ''}" data-action="switch-tab" data-tab="standings">
                        Bảng Xếp Hạng
                    </button>
                    <button type="button" class="nav-tab ${tab === 'matches' ? 'active' : ''}" data-action="switch-tab" data-tab="matches">
                        Lịch &amp; Kết Quả
                        ${liveMatchesCount > 0 ? `<span class="nav-count live">${liveMatchesCount}</span>` : `<span class="nav-count">${(state.teamMatches || []).length}</span>`}
                    </button>
                    <button type="button" class="nav-tab ${tab === 'teams' ? 'active' : ''}" data-action="switch-tab" data-tab="teams">
                        Đội Hình
                    </button>
                    ${awardsTabHtml}
                    <button type="button" class="nav-tab ${tab === 'rules' ? 'active' : ''}" data-action="switch-tab" data-tab="rules">
                        Thể Thức
                    </button>
                    ${adminTabHtml}
                </nav>

                <div class="header-actions">
                    <button type="button" class="smallbtn icon-only" data-action="toggle-tv-mode" title="Chế độ Màn hình TV Sân" aria-label="Chế độ TV">${ICONS.tv}</button>
                    <button type="button" class="smallbtn icon-only" data-action="share-link" title="Sao chép link chia sẻ giải" aria-label="Chia sẻ link">${ICONS.share}</button>
                    <button type="button" class="smallbtn icon-only" data-action="refresh-data" title="Làm mới dữ liệu" aria-label="Làm mới dữ liệu">${ICONS.refresh}</button>
                    ${adminButton}
                </div>
            </div>
        `;
        syncMobileHeaderHeight();
    }

    const heroElAfter = document.getElementById('hero-root');
    if (heroElAfter) {
        if (appState.tvMode || appState.activeTab !== 'standings') {
            heroElAfter.classList.add('hidden');
            heroElAfter.innerHTML = '';
            return;
        }

        heroElAfter.classList.remove('hidden');

        const statusBadge = state.tournament.status === 'live'
            ? `<span class="pill-status pill-live"><span class="pulse-dot"></span>Đang diễn ra</span>`
            : (state.tournament.status === 'completed'
                ? `<span class="pill-status pill-completed">Đã kết thúc</span>`
                : `<span class="pill-status pill-upcoming">Sắp diễn ra</span>`);

        const syncPill = store.mode === 'supabase'
            ? `<span class="pill-status pill-sync-btn"><span class="pulse-dot green"></span>Realtime</span>`
            : `<button type="button" class="pill-status pill-sync-btn" data-action="open-setup-help" title="Hướng dẫn kết nối Supabase Online"><span class="pulse-dot amber"></span>Local Demo · Online</button>`;

        const teamsCount = (state.teams || []).length;
        const pairsCount = (state.teamPairs || []).length;
        const top3 = calculateStandings(state.teams, state.teamMatches, state.subMatches, config).slice(0, 3);

        const podiumRowsHtml = top3.map((row) => {
            const diffStr = row.pointDiff > 0 ? `+${row.pointDiff}` : String(row.pointDiff);
            return `
                <div class="pulse-podium-row">
                    <div class="pulse-podium-left">
                        <span class="pulse-rank-num ${row.rank === 1 ? 'top1' : ''}">#${row.rank}</span>
                        <span class="team-code-dot sm" style="background:${escapeHtml(row.team.color)}">${escapeHtml(row.team.code)}</span>
                        <span class="pulse-team-name">${escapeHtml(row.team.name)}</span>
                    </div>
                    <span class="pulse-team-stat tabular">${row.teamMatchWins} TM · ${row.subMatchWins} trận (${diffStr})</span>
                </div>
            `;
        }).join('');

        heroElAfter.innerHTML = `
            <div class="wrap">
                <div class="hero-grid">
                    <div>
                        <div class="eyebrow">
                            <span>VACIF · PickleBeer</span>
                            ${statusBadge}
                            ${syncPill}
                        </div>
                        <h1 class="hero-h1">${formatTwoToneTitle(state.tournament.name)}</h1>
                        <p class="hero-desc">${escapeHtml(state.tournament.subtitle)}</p>
                        <div class="hero-cta-row">
                            <button type="button" class="button" data-action="switch-tab" data-tab="matches">Xem Lịch &amp; Tỉ Số</button>
                            <button type="button" class="button secondary" data-action="switch-tab" data-tab="teams">Đội Hình Cố Định</button>
                        </div>
                    </div>

                    <div class="hero-pulse-card">
                        <div class="pulse-card-head">
                            <span>Tổng quan giải đấu</span>
                            <span class="pulse-card-sub">Fixed Lineup · Bo${config.bestOf} (${config.pointsPerSet}đ)</span>
                        </div>

                        <div class="pulse-podium-list">
                            ${podiumRowsHtml || '<div class="section-sub" style="padding:12px 0;">Chưa có dữ liệu xếp hạng.</div>'}
                        </div>

                        <div class="pulse-mini-grid">
                            <div class="pulse-mini-cell">
                                <strong class="tabular">${teamsCount}</strong>
                                <span>Đội</span>
                            </div>
                            <div class="pulse-mini-cell">
                                <strong class="tabular">${pairsCount}</strong>
                                <span>Cặp đấu</span>
                            </div>
                            <div class="pulse-mini-cell">
                                <strong class="tabular">${completedCount}/${(state.teamMatches || []).length}</strong>
                                <span>Hoàn thành</span>
                            </div>
                            <div class="pulse-mini-cell">
                                <strong class="tabular" style="color:${liveMatchesCount > 0 ? 'var(--crimson)' : 'var(--ink)'};">${liveMatchesCount}</strong>
                                <span>Đang Live</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}

function renderMainContent() {
    const mainEl = document.getElementById('main-root');
    if (!mainEl) return;

    document.body.classList.toggle('tv-mode', appState.tvMode);

    if (appState.loading) {
        mainEl.innerHTML = `<div class="card card-pad" style="text-align:center;padding:48px;">Đang tải dữ liệu giải đấu...</div>`;
        return;
    }

    if (appState.error) {
        mainEl.innerHTML = `<div class="alert alert-error">${escapeHtml(appState.error)}</div>`;
        return;
    }

    if (isRegisterPageMode()) {
        document.body.classList.remove('tv-mode');
        mainEl.innerHTML = renderRegisterPage(appState.data?.tournament, appState.registerState);
        return;
    }

    const state = appState.data;
    if (!state) return;

    if (state.isUninitialized && appState.activeTab !== 'admin') {
        mainEl.innerHTML = `
            <div class="card card-pad" style="text-align:center;padding:48px;">
                <h2 style="margin-top:0;">Giải đấu đang được BTC khởi tạo</h2>
                <p class="section-sub">Nếu bạn là Quản trị viên, vui lòng bấm nút <strong>Quản trị</strong> ở góc trên bên phải để đăng nhập và tạo giải đấu.</p>
            </div>
        `;
        return;
    }

    if (appState.tvMode) {
        mainEl.innerHTML = renderTvModeView(state);
        return;
    }

    if (appState.activeTab === 'admin' && appState.isAdmin) {
        mainEl.innerHTML = renderAdminTab(state, appState.adminState, store.mode);
        return;
    }

    const liveBanner = appState.activeTab === 'standings'
        ? renderLiveSpotlight(state, appState.isAdmin, true)
        : '';

    let tabHtml = '';
    if (appState.activeTab === 'standings') tabHtml = renderStandingsTab(state, appState.isAdmin, appState.sessionMaskSeed);
    else if (appState.activeTab === 'matches') tabHtml = renderMatchesTab(state, appState.filters, appState.isAdmin);
    else if (appState.activeTab === 'teams') tabHtml = renderTeamsTab(state, appState.teamsQuery);
    else if (appState.activeTab === 'awards') tabHtml = renderAwardsTab(state, appState.awardsFilters, appState.isAdmin, appState.sessionMaskSeed);
    else if (appState.activeTab === 'rules') tabHtml = renderRulesTab(state);

    mainEl.innerHTML = `${liveBanner}${tabHtml}`;
}

function renderModal() {
    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    if (!appState.modal) {
        modalRoot.innerHTML = '';
        return;
    }

    if (appState.modal.type === 'login') {
        modalRoot.innerHTML = renderAdminLoginModal(store.mode, appState.modal.error || '');
        const pwInput = document.getElementById('admin-login-password');
        if (pwInput) pwInput.focus();
        return;
    }

    if (appState.modal.type === 'team') {
        modalRoot.innerHTML = renderTeamDetailModal(appState.modal.teamId, appState.data);
        return;
    }

    if (appState.modal.type === 'set-history') {
        modalRoot.innerHTML = renderSubMatchHistoryModal(appState.modal.subId, appState.data, appState.modal);
        return;
    }

    if (appState.modal.type === 'edit-registration') {
        const reg = (appState.adminState.registrations || []).find((r) => r.id === appState.modal.regId);
        modalRoot.innerHTML = renderEditRegistrationModal(reg);
        const nameInput = document.getElementById('edit-reg-fullname');
        if (nameInput) nameInput.focus();
        return;
    }

    if (appState.modal.type === 'setup-help') {
        modalRoot.innerHTML = `
            <div class="modal-backdrop" data-action="close-modal">
                <div class="modal-card wide">
                    <div class="modal-header">
                        <h3 class="modal-title">Hướng dẫn kết nối Supabase (Miễn phí • Realtime • 3 phút)</h3>
                        <button type="button" class="modal-close" data-action="close-modal" aria-label="Đóng">✕</button>
                    </div>
                    <div class="modal-body">
                        <ol style="padding-left:20px;line-height:1.7;">
                            <li>Tạo project miễn phí tại <strong>supabase.com</strong>.</li>
                            <li>Mở <strong>SQL Editor</strong> và chạy toàn bộ nội dung file <code>supabase/schema.sql</code>.</li>
                            <li>Vào <strong>Authentication → Users → Add user</strong>, tạo 1 tài khoản duy nhất (Email + Mật khẩu của riêng bạn) và tắt <em>Allow new users to sign up</em> trong Auth Settings.</li>
                            <li>Chạy câu SQL ở cuối file <code>schema.sql</code> để thêm UID của bạn vào bảng <code>public.admin_users</code>.</li>
                            <li>Copy <strong>Project URL</strong> và <strong>anon public key</strong> dán vào <code>js/config.js</code>, rồi deploy thư mục <code>PickleballLeague</code> lên Vercel / Netlify / GitHub Pages.</li>
                        </ol>
                        <div class="alert alert-info" style="margin-bottom:0;">
                            Sau khi kết nối, người xem bên ngoài chỉ cần mở link để xem tỉ số nhảy live, còn chỉ duy nhất bạn đăng nhập được quyền sửa đội, số đội và tỉ số!
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}

function renderAll() {
    if (!appState.isAdmin && appState.activeTab === 'admin') {
        appState.activeTab = 'standings';
    }
    renderModeBanner();
    renderHeroAndNav();
    renderMainContent();
    renderModal();
}

function queueSubMatchSave(subId) {
    if (pendingSubSaves.has(subId)) {
        clearTimeout(pendingSubSaves.get(subId));
    }
    setSaveStatus('Đang lưu...');

    const timer = setTimeout(async () => {
        pendingSubSaves.delete(subId);
        const sm = (appState.data?.subMatches || []).find((x) => x.id === subId);
        if (!sm) return;

        const prevPromise = activeSavePromises.get(subId) || Promise.resolve();
        const nextPromise = prevPromise.then(async () => {
            try {
                await store.updateSubMatch(subId, {
                    sets: sm.sets,
                    status: sm.status,
                    winner_override: sm.winner_override ?? null,
                    format_override: sm.format_override ?? null
                });
                setSaveStatus('Đã lưu ✓');
            } catch (err) {
                setSaveStatus('Lỗi lưu!', true);
                showToast(err.message || 'Không thể lưu tỉ số.', true);
            }
        });
        activeSavePromises.set(subId, nextPromise);
    }, 220);

    pendingSubSaves.set(subId, timer);
}

function clearSubMatchQueueState(sm) {
    if (!sm?.format_override || typeof sm.format_override !== 'object') return;
    if (!('queueState' in sm.format_override)) return;
    const nextOverride = { ...sm.format_override };
    delete nextOverride.queueState;
    sm.format_override = Object.keys(nextOverride).length > 0 ? nextOverride : null;
}

async function applySubMatchQueueStatus(subId, nextStatus) {
    const sm = appState.data?.subMatches.find((x) => x.id === subId);
    if (!sm) return;

    const nextOverride = (sm.format_override && typeof sm.format_override === 'object')
        ? { ...sm.format_override }
        : {};
    let dbStatus = nextStatus;
    if (nextStatus === 'ready') {
        dbStatus = 'upcoming';
        nextOverride.queueState = 'ready';
    } else {
        delete nextOverride.queueState;
    }
    const cleanOverride = Object.keys(nextOverride).length > 0 ? nextOverride : null;
    sm.status = dbStatus;
    sm.format_override = cleanOverride;

    try {
        setSaveStatus('Đang lưu...');
        appState.data = await store.updateSubMatch(subId, {
            status: dbStatus,
            format_override: cleanOverride
        });
        if (nextStatus === 'live') {
            const parentTm = (appState.data.teamMatches || []).find((m) => m.id === sm.team_match_id);
            if (parentTm && parentTm.status === 'upcoming') {
                parentTm.status = 'live';
                appState.data = await store.updateTeamMatch(parentTm.id, { status: 'live' });
            }
        }
        setSaveStatus('Đã lưu ✓');
        const labelMap = {
            upcoming: 'Chưa đấu (ẩn khỏi Live)',
            ready: 'Sắp đấu (hiện mờ trên Live)',
            live: 'Đang đấu (LIVE)',
            completed: 'Đã xong'
        };
        showToast(`Đã chuyển cặp đấu sang: ${labelMap[nextStatus] || nextStatus}.`);
        renderAll();
    } catch (err) {
        setSaveStatus('Lỗi lưu!', true);
        showToast(err.message, true);
    }
}

async function persistSubMatchOrders(orderedSubs, toastMsg) {
    if (!appState.isAdmin || !appState.data || orderedSubs.length === 0) return;
    try {
        setSaveStatus('Đang lưu...');
        const updates = orderedSubs.map((sm, idx) => {
            const nextOverride = (sm.format_override && typeof sm.format_override === 'object')
                ? { ...sm.format_override, displayOrder: idx + 1 }
                : { displayOrder: idx + 1 };
            sm.format_override = nextOverride;
            return { id: sm.id, format_override: nextOverride };
        });
        for (const item of updates) {
            appState.data = await store.updateSubMatch(item.id, { format_override: item.format_override });
        }
        setSaveStatus('Đã lưu ✓');
        showToast(toastMsg);
        renderAll();
    } catch (err) {
        setSaveStatus('Lỗi lưu!', true);
        showToast(err.message, true);
    }
}

async function updateSubMatchOverrideFields(subId, fieldsPatch, toastMsg = '') {
    if (!appState.isAdmin || !appState.data) return;
    const sm = appState.data.subMatches.find((x) => x.id === subId);
    if (!sm) return;

    const nextOverride = (sm.format_override && typeof sm.format_override === 'object')
        ? { ...sm.format_override }
        : {};
    for (const [key, rawVal] of Object.entries(fieldsPatch)) {
        const cleaned = typeof rawVal === 'string' ? rawVal.trim() : rawVal;
        if (!cleaned) delete nextOverride[key];
        else nextOverride[key] = cleaned;
    }
    const cleanOverride = Object.keys(nextOverride).length > 0 ? nextOverride : null;
    sm.format_override = cleanOverride;

    try {
        setSaveStatus('Đang lưu...');
        appState.data = await store.updateSubMatch(subId, { format_override: cleanOverride });
        setSaveStatus('Đã lưu ✓');
        if (toastMsg) showToast(toastMsg);
        renderAll();
    } catch (err) {
        setSaveStatus('Lỗi lưu!', true);
        showToast(err.message, true);
    }
}

function syncSubMatchLifecycle(sm) {
    const sets = Array.isArray(sm.sets) ? sm.sets : [];
    const config = normalizeConfig(appState.data?.tournament?.config);
    const ev = evaluateSubMatch({ ...sm, status: 'live' }, config);
    const hasAnyScore = sets.some((s) => (Number(s.a) || 0) > 0 || (Number(s.b) || 0) > 0);
    if (ev.winner) {
        sm.status = 'completed';
    } else if (hasAnyScore) {
        sm.status = 'live';
    } else {
        sm.status = 'upcoming';
    }
    clearSubMatchQueueState(sm);

    if (hasAnyScore) {
        const parentTm = (appState.data.teamMatches || []).find((m) => m.id === sm.team_match_id);
        if (parentTm && parentTm.status === 'upcoming') {
            parentTm.status = 'live';
            store.updateTeamMatch(parentTm.id, { status: 'live' }).catch(() => { });
        }
    }
}

function getSubMatchPairObjects(sm) {
    const pairs = appState.data?.teamPairs || [];
    return {
        pairA: sm?.pair_a_id ? pairs.find((p) => p.id === sm.pair_a_id) || null : null,
        pairB: sm?.pair_b_id ? pairs.find((p) => p.id === sm.pair_b_id) || null : null
    };
}

function getSetRallyState(subId, setIdx, pairA, pairB) {
    const key = `${subId}:${setIdx}`;
    return normalizeRallyState(appState.adminState.rallyBySet?.[key], pairA, pairB);
}

function setSetRallyState(subId, setIdx, nextRally) {
    if (!appState.adminState.rallyBySet) appState.adminState.rallyBySet = {};
    appState.adminState.rallyBySet[`${subId}:${setIdx}`] = nextRally;
}

function cloneStatRow(row) {
    return {
        a1: { points: Number(row?.a1?.points) || 0, errors: Number(row?.a1?.errors) || 0 },
        a2: { points: Number(row?.a2?.points) || 0, errors: Number(row?.a2?.errors) || 0 },
        b1: { points: Number(row?.b1?.points) || 0, errors: Number(row?.b1?.errors) || 0 },
        b2: { points: Number(row?.b2?.points) || 0, errors: Number(row?.b2?.errors) || 0 }
    };
}

function pushRallyUndoSnapshot(subId, setIdx, statsRow, setsRow, rallyState, rallyLogsArr = []) {
    if (!appState.adminState.rallyUndoBySet) appState.adminState.rallyUndoBySet = {};
    const key = `${subId}:${setIdx}`;
    const stack = Array.isArray(appState.adminState.rallyUndoBySet[key])
        ? appState.adminState.rallyUndoBySet[key]
        : [];
    stack.push({
        statRow: cloneStatRow(statsRow),
        setScore: { a: Number(setsRow?.a) || 0, b: Number(setsRow?.b) || 0 },
        rally: { ...rallyState },
        prevLogs: Array.isArray(rallyLogsArr) ? [...rallyLogsArr] : []
    });
    if (stack.length > 50) stack.shift();
    appState.adminState.rallyUndoBySet[key] = stack;
}

function commitSetStatsAndScore(sm, setIdx, setStats, sets, setRallyLogs = null) {
    const nextOverride = (sm.format_override && typeof sm.format_override === 'object')
        ? { ...sm.format_override }
        : {};
    nextOverride.setPlayerStats = setStats;
    if (Array.isArray(setRallyLogs)) {
        nextOverride.setRallyLogs = setRallyLogs;
    }
    sm.format_override = nextOverride;
    sm.sets = sets;
    syncSubMatchLifecycle(sm);
    queueSubMatchSave(sm.id);
    renderAll();
}

function applyRallyOutcome(subId, setIdx, outcome) {
    if (!appState.isAdmin || !appState.data) return;
    const sm = appState.data.subMatches.find((x) => x.id === subId);
    if (!sm) return;

    const sets = Array.isArray(sm.sets) ? sm.sets.map((s) => ({ a: Number(s.a) || 0, b: Number(s.b) || 0 })) : [{ a: 0, b: 0 }];
    if (!sets[setIdx]) return;

    const { pairA, pairB } = getSubMatchPairObjects(sm);
    const rally = getSetRallyState(subId, setIdx, pairA, pairB);
    const setStats = normalizeSetPlayerStats(sm.format_override?.setPlayerStats, sets.length);
    const setRallyLogs = normalizeSetRallyLogs(sm.format_override?.setRallyLogs, sets.length);
    const result = applyRallyOutcomeToSet(setStats[setIdx], sets[setIdx], rally, outcome, pairA, pairB);
    if (!result) return;

    pushRallyUndoSnapshot(subId, setIdx, setStats[setIdx], sets[setIdx], rally, setRallyLogs[setIdx]);

    const logEntry = createRallyLogEntry({
        seq: setRallyLogs[setIdx].length + 1,
        rallyBefore: rally,
        outcome,
        result,
        scoreBefore: sets[setIdx],
        pairA,
        pairB,
        timestamp: new Date().toISOString()
    });
    if (logEntry) {
        setRallyLogs[setIdx] = [...setRallyLogs[setIdx], logEntry];
    }

    setStats[setIdx] = result.statRow;
    sets[setIdx] = result.setScore;
    setSetRallyState(subId, setIdx, result.rally);
    commitSetStatsAndScore(sm, setIdx, setStats, sets, setRallyLogs);
}

function resetSetStats(subId, setIdx) {
    if (!appState.isAdmin || !appState.data) return;
    const sm = appState.data.subMatches.find((x) => x.id === subId);
    if (!sm) return;

    const sets = Array.isArray(sm.sets) ? sm.sets.map((s) => ({ a: Number(s.a) || 0, b: Number(s.b) || 0 })) : [{ a: 0, b: 0 }];
    if (!sets[setIdx]) return;

    const { pairA, pairB } = getSubMatchPairObjects(sm);
    const rally = getSetRallyState(subId, setIdx, pairA, pairB);
    const setStats = normalizeSetPlayerStats(sm.format_override?.setPlayerStats, sets.length);
    const setRallyLogs = normalizeSetRallyLogs(sm.format_override?.setRallyLogs, sets.length);

    pushRallyUndoSnapshot(subId, setIdx, setStats[setIdx], sets[setIdx], rally, setRallyLogs[setIdx]);

    setStats[setIdx] = {
        a1: { points: 0, errors: 0 },
        a2: { points: 0, errors: 0 },
        b1: { points: 0, errors: 0 },
        b2: { points: 0, errors: 0 }
    };
    setRallyLogs[setIdx] = [];
    sets[setIdx] = { a: 0, b: 0 };
    setSetRallyState(subId, setIdx, normalizeRallyState(null, pairA, pairB));
    commitSetStatsAndScore(sm, setIdx, setStats, sets, setRallyLogs);
}

function undoLastRallyOutcome(subId, setIdx) {
    if (!appState.isAdmin || !appState.data) return;
    const sm = appState.data.subMatches.find((x) => x.id === subId);
    if (!sm) return;

    const key = `${subId}:${setIdx}`;
    const stack = appState.adminState.rallyUndoBySet?.[key];
    if (!Array.isArray(stack) || stack.length === 0) return;

    const sets = Array.isArray(sm.sets) ? sm.sets.map((s) => ({ a: Number(s.a) || 0, b: Number(s.b) || 0 })) : [{ a: 0, b: 0 }];
    if (!sets[setIdx]) return;

    const snap = stack.pop();
    const setStats = normalizeSetPlayerStats(sm.format_override?.setPlayerStats, sets.length);
    const setRallyLogs = normalizeSetRallyLogs(sm.format_override?.setRallyLogs, sets.length);
    setStats[setIdx] = cloneStatRow(snap.statRow);
    sets[setIdx] = { a: Number(snap.setScore.a) || 0, b: Number(snap.setScore.b) || 0 };
    if (Array.isArray(snap.prevLogs)) {
        setRallyLogs[setIdx] = [...snap.prevLogs];
    } else if (setRallyLogs[setIdx].length > 0) {
        setRallyLogs[setIdx] = setRallyLogs[setIdx].slice(0, -1);
    }

    const { pairA, pairB } = getSubMatchPairObjects(sm);
    setSetRallyState(subId, setIdx, normalizeRallyState(snap.rally, pairA, pairB));
    commitSetStatsAndScore(sm, setIdx, setStats, sets, setRallyLogs);
}

async function handleAction(action, el, event) {
    if (action === 'toggle-tv-mode') {
        appState.tvMode = !appState.tvMode;
        renderAll();
        return;
    }

    if (action === 'share-link') {
        const shareUrl = window.location.href;
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(shareUrl);
                showToast('Đã sao chép link bảng điểm để chia sẻ!');
            } else {
                showToast(`Link giải: ${shareUrl}`);
            }
        } catch {
            showToast(`Link giải: ${shareUrl}`);
        }
        return;
    }

    if (action === 'switch-tab') {
        appState.tvMode = false;
        const nextTab = el.dataset.tab;
        const cfg = normalizeConfig(appState.data?.tournament?.config);
        if (nextTab === 'admin' && !appState.isAdmin) {
            appState.modal = { type: 'login', error: '' };
        } else if (nextTab === 'awards' && !appState.isAdmin && cfg.awardsVisibility === 'hidden') {
            appState.activeTab = 'standings';
            showToast('Bảng Vinh Danh & Point đang tạm ẩn bởi Ban tổ chức.');
        } else {
            appState.activeTab = nextTab;
            if (nextTab === 'admin' && appState.isAdmin && (appState.adminState.subtab === 'registrations' || appState.adminState.subtab === 'teams')) {
                await loadAdminRegistrations({ rerenderAfter: false });
            }
        }
        document.body.classList.remove('mobile-header-hidden');
        renderAll();
        return;
    }

    if (action === 'go-admin') {
        if (appState.isAdmin) {
            appState.tvMode = false;
            appState.activeTab = 'admin';
            renderAll();
        }
        return;
    }

    if (action === 'open-login') {
        appState.modal = { type: 'login', error: '' };
        renderModal();
        return;
    }

    if (action === 'open-setup-help') {
        appState.modal = { type: 'setup-help' };
        renderModal();
        return;
    }

    if (action === 'close-modal') {
        if (el.classList.contains('modal-backdrop') && event?.target !== el) {
            return;
        }
        appState.modal = null;
        renderModal();
        return;
    }

    if (action === 'view-team') {
        appState.modal = { type: 'team', teamId: el.dataset.teamId };
        renderModal();
        return;
    }

    if (action === 'refresh-data') {
        try {
            appState.data = await store.fetchState();
            showToast('Đã làm mới bảng điểm mới nhất.');
            renderAll();
        } catch (err) {
            showToast(err.message || 'Lỗi làm mới dữ liệu.', true);
        }
        return;
    }

    if (action === 'filter-status') {
        appState.filters.status = el.dataset.value || 'all';
        renderMainContent();
        return;
    }

    if (action === 'filter-round-btn') {
        appState.filters.round = el.dataset.round || 'all';
        appState.activeTab = 'matches';
        renderAll();
        return;
    }

    if (action === 'admin-subtab') {
        if (!appState.isAdmin) return;
        appState.adminState.subtab = el.dataset.subtab || 'scores';
        if (appState.adminState.subtab === 'registrations' || appState.adminState.subtab === 'teams') {
            await loadAdminRegistrations({ rerenderAfter: false });
        }
        renderMainContent();
        return;
    }

    if (action === 'admin-edit-match') {
        if (!appState.isAdmin) return;
        appState.tvMode = false;
        appState.activeTab = 'admin';
        appState.adminState.subtab = 'scores';
        appState.adminState.selectedMatchId = el.dataset.matchId;
        renderAll();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
    }

    if (action === 'admin-logout') {
        await store.signOutAdmin();
        appState.isAdmin = false;
        appState.adminEmail = null;
        appState.adminState.registrations = [];
        appState.adminState.registrationsTableMissing = false;
        appState.activeTab = 'standings';
        showToast('Đã đăng xuất chế độ Quản trị.');
        renderAll();
        return;
    }

    if (action === 'register-another') {
        appState.registerState = { submitting: false, error: '', submittedReceipt: null };
        renderMainContent();
        return;
    }

    if (action === 'reset-register-form') {
        appState.registerState.error = '';
        return;
    }

    if (action === 'copy-register-link') {
        if (!appState.isAdmin) return;
        const inputEl = document.getElementById('admin-register-link-input');
        const linkVal = inputEl?.value || '';
        if (!linkVal) return;
        try {
            if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(linkVal);
            else showToast(`Link Form: ${linkVal}`);
            showToast('Đã sao chép link Form Đăng Ký!');
        } catch {
            showToast(`Link Form: ${linkVal}`);
        }
        return;
    }

    if (action === 'copy-reg-sql') {
        if (!appState.isAdmin) return;
        try {
            if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(REGISTRATION_TABLE_SQL);
            showToast('Đã sao chép đoạn SQL tạo bảng Đăng ký VĐV!');
        } catch {
            showToast('Hãy bôi đen và copy đoạn SQL trực tiếp từ khung bên dưới.', true);
        }
        return;
    }

    if (action === 'toggle-registration-open') {
        if (!appState.isAdmin || !appState.data) return;
        const curCfg = normalizeConfig(appState.data.tournament?.config);
        const nextOpen = !curCfg.registrationOpen;
        try {
            setSaveStatus('Đang lưu...');
            appState.data = await store.updateTournament({
                config: { ...curCfg, registrationOpen: nextOpen }
            });
            setSaveStatus('Đã lưu ✓');
            showToast(nextOpen ? 'Đã MỞ Form nhận đơn đăng ký VĐV.' : 'Đã TẠM ĐÓNG Form đăng ký VĐV.');
            renderAll();
        } catch (err) {
            setSaveStatus('Lỗi!', true);
            showToast(err.message || 'Không thể đổi trạng thái Form.', true);
        }
        return;
    }

    if (action === 'refresh-registrations') {
        if (!appState.isAdmin) return;
        await loadAdminRegistrations({ rerenderAfter: true });
        showToast('Đã cập nhật danh sách đăng ký mới nhất.');
        return;
    }

    if (action === 'export-registrations-csv') {
        if (!appState.isAdmin) return;
        downloadRegistrationsCsv(appState.adminState.registrations || []);
        showToast('Đã tải xuống file CSV danh sách VĐV.');
        return;
    }

    if (action === 'toggle-reg-status') {
        if (!appState.isAdmin) return;
        const regId = el.dataset.regId;
        const nextStatus = el.dataset.nextStatus === 'approved' ? 'approved' : 'pending';
        try {
            setSaveStatus('Đang lưu...');
            const res = await store.updateRegistration(regId, { status: nextStatus });
            appState.adminState.registrations = res?.rows || [];
            setSaveStatus('Đã lưu ✓');
            renderMainContent();
        } catch (err) {
            setSaveStatus('Lỗi!', true);
            showToast(err.message || 'Không thể cập nhật trạng thái.', true);
        }
        return;
    }

    if (action === 'edit-registration') {
        if (!appState.isAdmin) return;
        const regId = el.dataset.regId;
        const reg = (appState.adminState.registrations || []).find((r) => r.id === regId);
        if (!reg) return;
        appState.modal = { type: 'edit-registration', regId };
        renderModal();
        return;
    }

    if (action === 'delete-registration') {
        if (!appState.isAdmin) return;
        const regId = el.dataset.regId;
        if (!confirm('Xóa đơn đăng ký này khỏi danh sách?')) return;
        try {
            setSaveStatus('Đang xóa...');
            const res = await store.deleteRegistration(regId);
            appState.adminState.registrations = res?.rows || [];
            setSaveStatus('Đã xóa ✓');
            showToast('Đã xóa đơn đăng ký.');
            renderAll();
        } catch (err) {
            setSaveStatus('Lỗi!', true);
            showToast(err.message || 'Không thể xóa đơn.', true);
        }
        return;
    }

    if (action === 'quick-match-status') {
        if (!appState.isAdmin) return;
        const matchId = el.dataset.matchId;
        const nextStatus = el.dataset.status;
        try {
            setSaveStatus('Đang lưu...');
            appState.data = await store.updateTeamMatch(matchId, { status: nextStatus });
            setSaveStatus('Đã lưu ✓');
            showToast(nextStatus === 'live' ? 'Đã bật trạng thái LIVE!' : (nextStatus === 'completed' ? 'Đã hoàn thành Team Match!' : 'Đã chuyển sang Sắp đấu.'));
            renderAll();
        } catch (err) {
            setSaveStatus('Lỗi!', true);
            showToast(err.message, true);
        }
        return;
    }

    if (action === 'quick-sub-status') {
        if (!appState.isAdmin) return;
        await applySubMatchQueueStatus(el.dataset.subId, el.dataset.status);
        return;
    }

    if (action === 'move-sub-order') {
        if (!appState.isAdmin || !appState.data) return;
        const subId = el.dataset.subId;
        const dir = el.dataset.dir;
        const targetSm = appState.data.subMatches.find((x) => x.id === subId);
        if (!targetSm) return;
        const tm = appState.data.teamMatches.find((m) => m.id === targetSm.team_match_id);
        if (!tm) return;
        const config = normalizeConfig(appState.data.tournament?.config);
        const evalTm = evaluateTeamMatch(tm, appState.data.subMatches, config);
        const list = [...evalTm.subMatches];
        const idx = list.findIndex((x) => x.id === subId);
        const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
        if (idx < 0 || swapIdx < 0 || swapIdx >= list.length) return;
        [list[idx], list[swapIdx]] = [list[swapIdx], list[idx]];
        await persistSubMatchOrders(list, 'Đã cập nhật thứ tự cặp đấu.');
        return;
    }

    if (action === 'quick-sub-court') {
        if (!appState.isAdmin) return;
        const nextCourt = String(el.dataset.court || '').trim();
        await updateSubMatchOverrideFields(
            el.dataset.subId,
            { court: nextCourt },
            nextCourt ? `Đã gán cặp sang ${nextCourt}.` : 'Đã đưa cặp về dùng sân chung của trận.'
        );
        return;
    }

    if (action === 'select-rally-role') {
        if (!appState.isAdmin || !appState.data) return;
        const subId = el.dataset.subId;
        const setIdx = Number(el.dataset.setIdx);
        const sm = appState.data.subMatches.find((x) => x.id === subId);
        if (!sm) return;
        const { pairA, pairB } = getSubMatchPairObjects(sm);
        const cur = getSetRallyState(subId, setIdx, pairA, pairB);
        setSetRallyState(subId, setIdx, selectRallyRole(cur, el.dataset.role, el.dataset.slot, pairA, pairB));
        renderAll();
        return;
    }

    if (action === 'swap-court-order') {
        if (!appState.isAdmin || !appState.data) return;
        const subId = el.dataset.subId;
        const setIdx = Number(el.dataset.setIdx);
        const side = el.dataset.side;
        const sm = appState.data.subMatches.find((x) => x.id === subId);
        if (!sm) return;
        const { pairA, pairB } = getSubMatchPairObjects(sm);
        const cur = getSetRallyState(subId, setIdx, pairA, pairB);
        setSetRallyState(subId, setIdx, swapRallyCourtOrder(cur, side, pairA, pairB));
        renderAll();
        return;
    }

    if (action === 'set-serve-turn') {
        if (!appState.isAdmin || !appState.data) return;
        const subId = el.dataset.subId;
        const setIdx = Number(el.dataset.setIdx);
        const sm = appState.data.subMatches.find((x) => x.id === subId);
        if (!sm) return;
        const { pairA, pairB } = getSubMatchPairObjects(sm);
        const cur = getSetRallyState(subId, setIdx, pairA, pairB);
        setSetRallyState(subId, setIdx, normalizeRallyState({ ...cur, serveTurn: Number(el.dataset.turn) }, pairA, pairB));
        renderAll();
        return;
    }

    if (action === 'view-set-history') {
        appState.modal = {
            type: 'set-history',
            subId: el.dataset.subId,
            setIdx: Math.max(0, Number(el.dataset.setIdx) || 0),
            filter: 'all',
            sortDesc: false
        };
        renderModal();
        return;
    }

    if (action === 'switch-history-set' && appState.modal?.type === 'set-history') {
        appState.modal.setIdx = Math.max(0, Number(el.dataset.setIdx) || 0);
        renderModal();
        return;
    }

    if (action === 'history-filter' && appState.modal?.type === 'set-history') {
        appState.modal.filter = el.dataset.filter === 'scored' ? 'scored' : 'all';
        renderModal();
        return;
    }

    if (action === 'history-sort' && appState.modal?.type === 'set-history') {
        appState.modal.sortDesc = !appState.modal.sortDesc;
        renderModal();
        return;
    }

    if (action === 'rally-outcome') {
        if (!appState.isAdmin) return;
        applyRallyOutcome(el.dataset.subId, Number(el.dataset.setIdx), el.dataset.outcome);
        return;
    }

    if (action === 'undo-rally-outcome') {
        if (!appState.isAdmin) return;
        undoLastRallyOutcome(el.dataset.subId, Number(el.dataset.setIdx));
        return;
    }

    if (action === 'reset-set-stats') {
        if (!appState.isAdmin) return;
        resetSetStats(el.dataset.subId, Number(el.dataset.setIdx));
        return;
    }

    if (action === 'add-set') {
        if (!appState.isAdmin) return;
        const subId = el.dataset.subId;
        const sm = appState.data?.subMatches.find((x) => x.id === subId);
        if (!sm) return;
        sm.sets = [...(sm.sets || []), { a: 0, b: 0 }];
        if (sm.status === 'completed') sm.status = 'live';
        queueSubMatchSave(subId);
        renderAll();
        return;
    }

    if (action === 'remove-set') {
        if (!appState.isAdmin) return;
        const subId = el.dataset.subId;
        const setIdx = Number(el.dataset.setIdx);
        const sm = appState.data?.subMatches.find((x) => x.id === subId);
        if (!sm || !Array.isArray(sm.sets) || sm.sets.length <= 1) return;
        sm.sets = sm.sets.filter((_, idx) => idx !== setIdx);
        if (Array.isArray(sm.format_override?.setPlayerStats)) {
            sm.format_override.setPlayerStats = sm.format_override.setPlayerStats.filter((_, idx) => idx !== setIdx);
        }
        if (Array.isArray(sm.format_override?.setRallyLogs)) {
            sm.format_override.setRallyLogs = sm.format_override.setRallyLogs.filter((_, idx) => idx !== setIdx);
        }
        for (const bag of [appState.adminState.rallyBySet, appState.adminState.rallyUndoBySet]) {
            if (!bag) continue;
            for (const key of Object.keys(bag)) {
                if (key.startsWith(`${subId}:`)) delete bag[key];
            }
        }
        syncSubMatchLifecycle(sm);
        queueSubMatchSave(subId);
        renderAll();
        return;
    }

    if (action === 'save-all-roster') {
        if (!appState.isAdmin) return;
        try {
            const { draftTeams, draftPairs } = collectRosterDraftFromDom();
            const duplicates = findDuplicateRosterPlayers(draftPairs);
            if (duplicates.length > 0) {
                const d = duplicates[0];
                showToast(`VĐV "${d.name}" bị chọn trùng ở ${d.slots.join(', ')}. Mỗi VĐV chỉ được xếp 1 vị trí.`, true);
                return;
            }
            setSaveStatus('Đang lưu đội hình...');
            appState.data = await store.saveAllRoster(draftTeams, draftPairs);
            setSaveStatus('Đã lưu ✓');
            showToast('Đã cập nhật tên đội và đội hình cố định!');
            renderAll();
        } catch (err) {
            setSaveStatus('Lỗi lưu!', true);
            showToast(err.message || 'Lỗi lưu đội hình.', true);
        }
        return;
    }

    if (action === 'set-awards-visibility') {
        if (!appState.isAdmin || !appState.data) return;
        const nextVisibility = String(el.dataset.visibility || 'public');
        if (!['public', 'anonymous', 'hidden'].includes(nextVisibility)) return;
        const currentCfg = normalizeConfig(appState.data.tournament?.config);
        try {
            setSaveStatus('Đang lưu...');
            appState.data = await store.updateTournament({
                config: {
                    ...currentCfg,
                    awardsVisibility: nextVisibility,
                    awardsMaskSeed: currentCfg.awardsMaskSeed || 1
                }
            });
            setSaveStatus('Đã lưu ✓');
            const labelMap = {
                public: 'Đã bật chế độ Công khai Bảng Vinh Danh & Point.',
                anonymous: 'Đã bật chế độ Ẩn danh mã 3 số (random mới mỗi lần mở trang).',
                hidden: 'Đã ẩn hoàn toàn Bảng Vinh Danh & Point khỏi người xem.'
            };
            showToast(labelMap[nextVisibility]);
            renderAll();
        } catch (err) {
            setSaveStatus('Lỗi!', true);
            showToast(err.message || 'Không thể cập nhật chế độ hiển thị.', true);
        }
        return;
    }

    if (action === 'delete-match') {
        if (!appState.isAdmin) return;
        const matchId = el.dataset.matchId;
        if (!confirm('Bạn chắc chắn muốn xóa cuộc đối đầu (Team Match) này?')) return;
        try {
            appState.data = await store.deleteTeamMatch(matchId);
            showToast('Đã xóa trận đấu.');
            renderAll();
        } catch (err) {
            showToast(err.message || 'Không thể xóa trận đấu.', true);
        }
        return;
    }

    if (action === 'export-json') {
        if (!appState.isAdmin || !appState.data) return;
        const blob = new Blob([JSON.stringify(appState.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pickleball-league-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Đã tải xuống file sao lưu JSON.');
        return;
    }

    if (action === 'reset-demo') {
        if (!appState.isAdmin) return;
        if (!appState.data?.isUninitialized && !confirm('Khôi phục toàn bộ về dữ liệu mẫu 6 đội × 3 cặp? Dữ liệu hiện tại sẽ bị ghi đè.')) {
            return;
        }
        try {
            setSaveStatus('Đang khởi tạo...');
            const fresh = createInitialDemoState(appState.data?.tournament?.id || 'main');
            appState.data = await store.importFullState(fresh);
            setSaveStatus('Đã lưu ✓');
            showToast('Đã khởi tạo dữ liệu mẫu thành công!');
            renderAll();
        } catch (err) {
            setSaveStatus('Lỗi!', true);
            showToast(err.message || 'Không thể khởi tạo dữ liệu mẫu.', true);
        }
    }
}

document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    handleAction(target.dataset.action, target, event);
});

document.addEventListener('change', async (event) => {
    const target = event.target;

    if (target.id === 'admin-import-json-input') {
        if (!appState.isAdmin) return;
        const file = target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            appState.data = await store.importFullState(parsed);
            showToast('Đã nhập dữ liệu từ file JSON thành công!');
            renderAll();
        } catch (err) {
            showToast(`File JSON không hợp lệ: ${err.message}`, true);
        }
        target.value = '';
        return;
    }

    const action = target.dataset?.action;
    if (!action) return;

    if (action === 'filter-round') {
        appState.filters.round = target.value;
        renderMainContent();
        return;
    }

    if (action === 'filter-team') {
        appState.filters.teamId = target.value;
        renderMainContent();
        return;
    }

    if (action === 'admin-select-match') {
        appState.adminState.selectedMatchId = target.value;
        renderMainContent();
        return;
    }

    if (action === 'sub-status') {
        if (!appState.isAdmin) return;
        await applySubMatchQueueStatus(target.dataset.subId, target.value);
        return;
    }

    if (action === 'sub-bestof' || action === 'sub-points') {
        if (!appState.isAdmin) return;
        const subId = target.dataset.subId;
        const sm = appState.data?.subMatches.find((x) => x.id === subId);
        if (!sm) return;

        const nextOverride = { ...(sm.format_override || {}) };
        if (action === 'sub-bestof') {
            if (target.value === 'default') delete nextOverride.bestOf;
            else nextOverride.bestOf = Number(target.value);
        } else {
            if (target.value === 'default') delete nextOverride.pointsPerSet;
            else nextOverride.pointsPerSet = Number(target.value);
        }

        const cleanOverride = Object.keys(nextOverride).length > 0 ? nextOverride : null;
        sm.format_override = cleanOverride;
        try {
            setSaveStatus('Đang lưu...');
            await store.updateSubMatch(subId, { format_override: cleanOverride });
            setSaveStatus('Đã lưu ✓');
            renderAll();
        } catch (err) {
            setSaveStatus('Lỗi lưu!', true);
            showToast(err.message, true);
        }
        return;
    }

    if (action === 'sub-override-field') {
        if (!appState.isAdmin) return;
        const field = target.dataset.field;
        if (!['court', 'scheduledTime'].includes(field)) return;
        await updateSubMatchOverrideFields(target.dataset.subId, { [field]: target.value });
        return;
    }

    if (action === 'awards-filter-team') {
        appState.awardsFilters.teamId = target.value;
        renderMainContent();
        return;
    }

    if (action === 'reg-filter-status') {
        appState.adminState.regStatusFilter = target.value || 'all';
        renderMainContent();
        return;
    }

    if (action === 'roster-player-select') {
        if (!appState.isAdmin) return;
        syncRosterPlayerSelects(target);
        return;
    }
});

document.addEventListener('input', (event) => {
    const target = event.target;
    if (target.dataset?.action === 'filter-query' || target.dataset?.action === 'awards-filter-query' || target.dataset?.action === 'reg-filter-query') {
        const inputId = target.id;
        const selStart = target.selectionStart;
        const selEnd = target.selectionEnd;

        if (target.dataset.action === 'awards-filter-query') {
            appState.awardsFilters.query = target.value;
        } else if (target.dataset.action === 'reg-filter-query') {
            appState.adminState.regQuery = target.value;
        } else if (inputId === 'teams-search-input') {
            appState.teamsQuery = target.value;
        } else {
            appState.filters.query = target.value;
        }
        renderMainContent();

        if (inputId) {
            const restored = document.getElementById(inputId);
            if (restored) {
                restored.focus();
                if (typeof selStart === 'number' && typeof selEnd === 'number') {
                    restored.setSelectionRange(selStart, selEnd);
                }
            }
        }
    }
});

document.addEventListener('submit', async (event) => {
    const form = event.target;
    event.preventDefault();

    if (form.id === 'player-registration-form') {
        const fd = new FormData(form);
        appState.registerState.submitting = true;
        appState.registerState.error = '';
        renderMainContent();
        try {
            const res = await store.submitRegistration({
                full_name: fd.get('full_name'),
                display_name: fd.get('display_name'),
                skill_level: fd.get('skill_level')
            });
            appState.registerState = {
                submitting: false,
                error: '',
                submittedReceipt: res.entry
            };
            if (appState.isAdmin) {
                await loadAdminRegistrations({ rerenderAfter: false });
            }
            renderMainContent();
        } catch (err) {
            appState.registerState = {
                submitting: false,
                error: err.message || 'Không thể gửi phiếu đăng ký.',
                submittedReceipt: null
            };
            renderMainContent();
        }
        return;
    }

    if (form.id === 'admin-login-form') {
        const fd = new FormData(form);
        try {
            const res = await store.signInAdmin({
                email: fd.get('email') ? String(fd.get('email')) : '',
                password: String(fd.get('password') || '')
            });
            appState.isAdmin = res.isAdmin;
            appState.adminEmail = res.email;
            appState.modal = null;
            appState.activeTab = 'admin';
            await loadAdminRegistrations({ rerenderAfter: false });
            showToast('Đăng nhập Quản trị thành công!');
            renderAll();
        } catch (err) {
            appState.modal = { type: 'login', error: err.message || 'Đăng nhập thất bại.' };
            renderModal();
        }
        return;
    }

    if (!appState.isAdmin) return;

    if (form.id === 'admin-add-registration-form') {
        const fd = new FormData(form);
        try {
            setSaveStatus('Đang thêm...');
            await store.submitRegistration({
                full_name: fd.get('full_name'),
                display_name: fd.get('display_name'),
                skill_level: fd.get('skill_level')
            }, 'approved');
            await loadAdminRegistrations({ rerenderAfter: false });
            setSaveStatus('Đã lưu ✓');
            showToast('Đã thêm VĐV vào danh sách.');
            renderAll();
        } catch (err) {
            setSaveStatus('Lỗi!', true);
            showToast(err.message || 'Không thể thêm VĐV.', true);
        }
        return;
    }

    if (form.id === 'admin-edit-registration-form') {
        const regId = form.dataset.regId;
        const fd = new FormData(form);
        try {
            const clean = sanitizeRegistrationPayload({
                full_name: fd.get('full_name'),
                display_name: fd.get('display_name'),
                skill_level: fd.get('skill_level')
            });
            const nextStatus = fd.get('status') === 'pending' ? 'pending' : 'approved';
            setSaveStatus('Đang lưu...');
            const res = await store.updateRegistration(regId, {
                full_name: clean.full_name,
                display_name: clean.display_name,
                skill_level: clean.skill_level,
                status: nextStatus
            });
            appState.adminState.registrations = res?.rows || [];
            appState.modal = null;
            renderModal();
            setSaveStatus('Đã lưu ✓');
            showToast('Đã cập nhật thông tin & trình độ VĐV.');
            renderAll();
        } catch (err) {
            setSaveStatus('Lỗi!', true);
            showToast(err.message || 'Không thể cập nhật thông tin.', true);
        }
        return;
    }

    if (form.id === 'admin-match-meta-form') {
        const matchId = form.dataset.matchId;
        const fd = new FormData(form);
        const combinedSched = combineScheduleValue(fd.get('scheduled_date'), fd.get('scheduled_time'));
        try {
            setSaveStatus('Đang lưu...');
            appState.data = await store.updateTeamMatch(matchId, {
                status: String(fd.get('status') || 'upcoming'),
                court: String(fd.get('court') || '').trim(),
                scheduled_time: combinedSched,
                note: String(fd.get('note') || '').trim()
            });
            setSaveStatus('Đã lưu ✓');
            showToast('Đã cập nhật trạng thái, ngày giờ & sân!');
            renderAll();
        } catch (err) {
            setSaveStatus('Lỗi lưu!', true);
            showToast(err.message, true);
        }
        return;
    }

    if (form.id === 'admin-resize-roster-form') {
        const fd = new FormData(form);
        const targetTeams = Math.max(2, Math.min(16, Number(fd.get('teamCount')) || 4));
        const targetLevels = Math.max(1, Math.min(8, Number(fd.get('levelsCount')) || 3));

        const currentTeamsCount = appState.data.teams.length;
        const currentLevelsCount = normalizeConfig(appState.data.tournament?.config).levelsCount;

        if ((targetTeams < currentTeamsCount || targetLevels < currentLevelsCount)
            && !confirm('Giảm số đội hoặc số cặp sẽ xóa dữ liệu của các đội/cặp bị dư và trận liên quan. Tiếp tục?')) {
            return;
        }

        try {
            const { draftTeams, draftPairs } = collectRosterDraftFromDom();
            const duplicates = findDuplicateRosterPlayers(draftPairs);
            if (duplicates.length > 0) {
                const d = duplicates[0];
                showToast(`VĐV "${d.name}" bị chọn trùng ở ${d.slots.join(', ')}. Hãy xử lý trước khi áp dụng.`, true);
                return;
            }
            setSaveStatus('Đang cập nhật quy mô...');
            const currentCfg = normalizeConfig(appState.data.tournament?.config);
            const nextLevelNames = Array.from({ length: targetLevels }, (_, idx) => currentCfg.levelNames[idx] || `Level ${idx + 1}`);

            await store.updateTournament({
                config: {
                    ...currentCfg,
                    levelsCount: targetLevels,
                    levelNames: nextLevelNames
                }
            });

            const { teams: nextTeams, teamPairs: nextPairs } = buildResizedRoster(
                draftTeams,
                draftPairs,
                targetTeams,
                targetLevels,
                appState.data.tournament.id
            );

            const keepTeamIds = new Set(nextTeams.map((t) => t.id));
            const keepPairIds = new Set(nextPairs.map((p) => p.id));
            const removedTeamIds = appState.data.teams.filter((t) => !keepTeamIds.has(t.id)).map((t) => t.id);
            const removedPairIds = appState.data.teamPairs.filter((p) => !keepPairIds.has(p.id)).map((p) => p.id);

            appState.data = await store.saveAllRoster(nextTeams, nextPairs, removedTeamIds, removedPairIds);
            setSaveStatus('Đã lưu ✓');
            if (targetTeams !== currentTeamsCount) {
                showToast(`Đã đổi thành ${targetTeams} đội × ${targetLevels} cặp/đội. Hãy sang tab Lịch Thi Đấu để sinh lại lịch vòng tròn.`);
            } else {
                showToast(`Đã cập nhật quy mô: ${targetTeams} đội × ${targetLevels} cặp/đội.`);
            }
            renderAll();
        } catch (err) {
            setSaveStatus('Lỗi!', true);
            showToast(err.message, true);
        }
        return;
    }

    if (form.id === 'admin-generate-rr-form') {
        const fd = new FormData(form);
        const doubleRR = fd.get('doubleRoundRobin') === 'on';
        const hasExistingRr = appState.data.teamMatches.some((tm) => (tm.stage || 'round_robin') === 'round_robin');

        if (hasExistingRr && !confirm('Sinh lại lịch vòng tròn sẽ thay thế toàn bộ lịch & tỉ số vòng tròn hiện tại (trận Playoff giữ nguyên). Tiếp tục?')) {
            return;
        }

        try {
            setSaveStatus('Đang tạo lịch...');
            const config = normalizeConfig(appState.data.tournament?.config);
            await store.updateTournament({ config: { ...config, doubleRoundRobin: doubleRR } });

            const { teamMatches, subMatches } = generateRoundRobinSchedule(
                appState.data.teams,
                appState.data.teamPairs,
                {
                    doubleRoundRobin: doubleRR,
                    levelsCount: config.levelsCount,
                    tournamentId: appState.data.tournament.id
                }
            );

            appState.data = await store.replaceRoundRobinSchedule(teamMatches, subMatches);
            setSaveStatus('Đã lưu ✓');
            showToast(`Đã tạo ${teamMatches.length} cuộc đối đầu vòng tròn!`);
            renderAll();
        } catch (err) {
            setSaveStatus('Lỗi!', true);
            showToast(err.message, true);
        }
        return;
    }

    if (form.id === 'admin-add-match-form') {
        const fd = new FormData(form);
        const teamAId = String(fd.get('team_a_id') || '');
        const teamBId = String(fd.get('team_b_id') || '');
        if (!teamAId || !teamBId || teamAId === teamBId) {
            showToast('Vui lòng chọn 2 đội khác nhau.', true);
            return;
        }

        try {
            setSaveStatus('Đang thêm trận...');
            const config = normalizeConfig(appState.data.tournament?.config);
            const stage = String(fd.get('stage') || 'playoff');
            const roundNumber = appState.data.teamMatches.reduce((max, m) => Math.max(max, m.round_number || 1), 0) + 1;
            const sortOrder = appState.data.teamMatches.reduce((max, m) => Math.max(max, m.sort_order || 1), 0) + 1;
            const tmId = `tm_${stage}_${Date.now().toString(36)}`;

            const newMatch = {
                id: tmId,
                tournament_id: appState.data.tournament.id,
                round_number: roundNumber,
                round_name: String(fd.get('round_name') || 'Playoff').trim(),
                stage,
                team_a_id: teamAId,
                team_b_id: teamBId,
                court: String(fd.get('court') || '').trim(),
                scheduled_time: combineScheduleValue(fd.get('scheduled_date'), fd.get('scheduled_time')),
                status: 'upcoming',
                sort_order: sortOrder,
                note: ''
            };

            const pairLookup = new Map(appState.data.teamPairs.map((p) => [`${p.team_id}:${p.level_index}`, p.id]));
            const newSubs = [];
            for (let lvl = 1; lvl <= config.levelsCount; lvl++) {
                newSubs.push({
                    id: `${tmId}_l${lvl}`,
                    team_match_id: tmId,
                    level_index: lvl,
                    pair_a_id: pairLookup.get(`${teamAId}:${lvl}`) || null,
                    pair_b_id: pairLookup.get(`${teamBId}:${lvl}`) || null,
                    sets: [{ a: 0, b: 0 }],
                    status: 'upcoming',
                    winner_override: null,
                    format_override: null
                });
            }

            appState.data = await store.createTeamMatch(newMatch, newSubs);
            setSaveStatus('Đã lưu ✓');
            showToast('Đã thêm cuộc đối đầu mới!');
            renderAll();
        } catch (err) {
            setSaveStatus('Lỗi!', true);
            showToast(err.message, true);
        }
        return;
    }

    if (form.id === 'admin-settings-form') {
        const fd = new FormData(form);
        const currentCfg = normalizeConfig(appState.data.tournament?.config);
        const levelNames = currentCfg.levelNames.map((old, idx) => {
            const val = String(fd.get(`levelName_${idx}`) || '').trim();
            return val || `Level ${idx + 1}`;
        });

        try {
            setSaveStatus('Đang lưu...');
            appState.data = await store.updateTournament({
                name: String(fd.get('name') || '').trim() || appState.data.tournament.name,
                subtitle: String(fd.get('subtitle') || '').trim(),
                status: String(fd.get('status') || 'live'),
                config: {
                    ...currentCfg,
                    bestOf: Number(fd.get('bestOf')) || 3,
                    pointsPerSet: Math.max(1, Number(fd.get('pointsPerSet')) || 11),
                    pointCap: Math.max(0, Number(fd.get('pointCap')) || 0),
                    winByTwo: fd.get('winByTwo') === 'on',
                    awardsVisibility: String(fd.get('awardsVisibility') || currentCfg.awardsVisibility || 'public'),
                    levelNames
                }
            });
            setSaveStatus('Đã lưu ✓');
            showToast('Đã lưu cài đặt giải đấu!');
            renderAll();
        } catch (err) {
            setSaveStatus('Lỗi!', true);
            showToast(err.message, true);
        }
    }
});

document.addEventListener('focusout', () => {
    if (deferredRender) {
        setTimeout(() => {
            if (deferredRender && !isEditingScoreInput()) {
                deferredRender = false;
                renderAll();
            }
        }, 0);
    }
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && appState.modal) {
        appState.modal = null;
        renderModal();
    }
});

if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => {
        syncMobileHeaderHeight();
    }, { passive: true });
}

async function bootstrap() {
    renderMainContent();
    try {
        await store.init();
        const auth = await store.getAuthState();
        appState.isAdmin = auth.isAdmin;
        appState.adminEmail = auth.email;
        appState.data = await store.fetchState();
        if (appState.isAdmin) {
            await loadAdminRegistrations({ rerenderAfter: false });
        }
        appState.loading = false;

        store.onAuthChange(async (isAdmin, info) => {
            appState.isAdmin = isAdmin;
            appState.adminEmail = info?.email || null;
            if (isAdmin) {
                await loadAdminRegistrations({ rerenderAfter: false });
            } else {
                appState.adminState.registrations = [];
                appState.adminState.registrationsTableMissing = false;
            }
            renderAll();
        });

        store.subscribe((freshData) => {
            // Preserve local pending sub-match edits if admin is mid-click
            if (pendingSubSaves.size > 0 && appState.data?.subMatches) {
                const pendingIds = new Set(pendingSubSaves.keys());
                const localMap = new Map(appState.data.subMatches.map((s) => [s.id, s]));
                freshData.subMatches = freshData.subMatches.map((s) => (pendingIds.has(s.id) && localMap.has(s.id) ? localMap.get(s.id) : s));
            }
            appState.data = freshData;
            if (isEditingScoreInput()) {
                deferredRender = true;
                return;
            }
            renderAll();
        });
    } catch (err) {
        appState.loading = false;
        appState.error = err.message || 'Không thể khởi động ứng dụng.';
    }
    renderAll();
}

bootstrap();
