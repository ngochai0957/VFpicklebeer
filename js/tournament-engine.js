/**
 * Pure Tournament Engine for Pickleball Team League (Fixed Lineup)
 * Supports PPA / Ben Johns style set-by-set scoring (Bo1, Bo3, Bo5)
 * and exact Fixed Lineup Team League standings & Round Robin scheduling.
 */

export const TEAM_COLOR_PALETTE = [
    '#2563EB', // Blue
    '#7C3AED', // Purple
    '#059669', // Emerald
    '#D97706', // Amber
    '#DC2626', // Red
    '#0891B2', // Cyan
    '#DB2777', // Pink
    '#4F46E5', // Indigo
    '#65A30D', // Lime
    '#EA580C', // Orange
    '#0D9488', // Teal
    '#9333EA'  // Violet
];

export const AWARDS_VISIBILITY_MODES = ['public', 'anonymous', 'hidden'];

export const DEFAULT_CONFIG = {
    bestOf: 3,
    pointsPerSet: 11,
    winByTwo: true,
    pointCap: 0,
    levelsCount: 3,
    levelNames: ['Level 1', 'Level 2', 'Level 3'],
    levelOrder: [1, 2, 3],
    levelOrderB: [1, 2, 3],
    doubleRoundRobin: false,
    registrationOpen: true,
    awardsVisibility: 'public',
    awardsMaskSeed: 1,
    awardsTopLimit: 5
};

export const AWARDS_TOP_LIMITS = [3, 5, 10, 0];

export const SKILL_LEVEL_OPTIONS = [
    'Lv1 - Bậc thầy lão luyện',
    'Lv2 - Dui dẻ sương sương',
    'Lv3 - Mầm non tập sự'
];

export function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function getTeamCode(index) {
    if (index >= 0 && index < 26) {
        return String.fromCharCode(65 + index);
    }
    return `T${index + 1}`;
}

export function getPairLabel(teamCode, levelIndex) {
    return `${teamCode}${levelIndex}`;
}

/**
 * Normalizes a 1-based level court order permutation [1..levelsCount].
 * Accepts an array (e.g. [3, 2, 1]) or delimiter-separated string ("3-2-1", "3,2,1").
 * Ensures every level from 1..levelsCount appears exactly once in the order they take the court.
 */
export function normalizeLevelOrder(rawOrder, levelsCount = 3) {
    const count = Math.max(1, Math.min(8, Number(levelsCount) || 3));
    let tokens = [];
    if (Array.isArray(rawOrder)) {
        tokens = rawOrder;
    } else if (typeof rawOrder === 'string' && rawOrder.trim()) {
        tokens = rawOrder.trim().split(/[\s,\->/|]+/);
    }

    const seen = new Set();
    const result = [];
    for (const item of tokens) {
        const lvl = Math.floor(Number(item));
        if (Number.isFinite(lvl) && lvl >= 1 && lvl <= count && !seen.has(lvl)) {
            seen.add(lvl);
            result.push(lvl);
        }
    }
    for (let lvl = 1; lvl <= count; lvl++) {
        if (!seen.has(lvl)) {
            seen.add(lvl);
            result.push(lvl);
        }
    }
    return result;
}

export function isDefaultLevelOrder(levelOrderA, levelOrderB = null, levelsCount = 3) {
    const count = Math.max(1, Math.min(8, Number(levelsCount) || 3));
    const orderA = normalizeLevelOrder(levelOrderA, count);
    const orderB = levelOrderB ? normalizeLevelOrder(levelOrderB, count) : orderA;
    for (let i = 0; i < count; i++) {
        if (orderA[i] !== i + 1 || orderB[i] !== i + 1) return false;
    }
    return true;
}

/**
 * Returns preset court entry orders for a given levelsCount (e.g. all 6 permutations for 3 levels).
 */
export function getLevelOrderPresets(levelsCount = 3, levelNames = []) {
    const count = Math.max(1, Math.min(8, Number(levelsCount) || 3));
    const getShortLbl = (lvl) => {
        const custom = typeof levelNames[lvl - 1] === 'string' ? levelNames[lvl - 1].trim() : '';
        return custom || `Level ${lvl}`;
    };
    if (count === 3) {
        const perms = [
            { order: [1, 2, 3], note: 'Mặc định: Level 1 ra sân trước' },
            { order: [3, 2, 1], note: 'Đảo ngược: Level 3 ra sân trước' },
            { order: [2, 3, 1], note: 'Level 2 ra sân trước → Lv3 → Lv1' },
            { order: [2, 1, 3], note: 'Level 2 ra sân trước → Lv1 → Lv3' },
            { order: [3, 1, 2], note: 'Level 3 ra sân trước → Lv1 → Lv2' },
            { order: [1, 3, 2], note: 'Level 1 ra sân trước → Lv3 → Lv2' }
        ];
        return perms.map((p) => ({
            key: p.order.join('-'),
            order: p.order,
            label: `${p.order.map((l) => getShortLbl(l)).join(' → ')} (${p.note})`
        }));
    }
    const asc = Array.from({ length: count }, (_, i) => i + 1);
    const desc = [...asc].reverse();
    const list = [
        {
            key: asc.join('-'),
            order: asc,
            label: `${asc.map((l) => getShortLbl(l)).join(' → ')} (Mặc định: ${getShortLbl(1)} ra sân trước)`
        }
    ];
    if (count > 1) {
        list.push({
            key: desc.join('-'),
            order: desc,
            label: `${desc.map((l) => getShortLbl(l)).join(' → ')} (Đảo ngược: ${getShortLbl(count)} ra sân trước)`
        });
    }
    return list;
}

/**
 * Builds the subMatches array for a single Team Match according to the chosen court entry order
 * of Team A (levelOrderA) and Team B (levelOrderB).
 * By default ([1, 2, 3] vs [1, 2, 3]), creates standard head-to-head Level 1, Level 2, Level 3.
 * When a custom court order or cross-level lineup is chosen, sets format_override.displayOrder (1..levelsCount)
 * and pairs each slot's Team A level vs Team B level in exact court sequence.
 */
export function buildTeamMatchSubMatches(tmId, teamAId, teamBId, pairLookup, options = {}) {
    const levelsCount = Math.max(1, Math.min(8, Number(options.levelsCount) || 3));
    const orderA = normalizeLevelOrder(options.levelOrderA ?? options.levelOrder, levelsCount);
    const orderB = normalizeLevelOrder(options.levelOrderB ?? options.levelOrderA ?? options.levelOrder, levelsCount);
    const hasCustomOrder = !isDefaultLevelOrder(orderA, orderB, levelsCount);

    const lookupPairId = (teamId, lvl) => {
        if (!pairLookup) return null;
        const key = `${teamId}:${lvl}`;
        if (typeof pairLookup.get === 'function') {
            return pairLookup.get(key) || null;
        }
        return pairLookup[key] || null;
    };

    const subs = [];
    for (let slotIdx = 0; slotIdx < levelsCount; slotIdx++) {
        const displayOrder = slotIdx + 1;
        const lvlA = orderA[slotIdx];
        const lvlB = orderB[slotIdx];
        const isCrossLevel = lvlA !== lvlB;
        const levelIndex = isCrossLevel ? lvlA : lvlA;
        const formatOverride = {};
        if (hasCustomOrder) {
            formatOverride.displayOrder = displayOrder;
        }
        if (isCrossLevel) {
            formatOverride.levelA = lvlA;
            formatOverride.levelB = lvlB;
        }
        const cleanOverride = Object.keys(formatOverride).length > 0 ? formatOverride : null;
        const subIdSuffix = isCrossLevel ? `s${displayOrder}_l${lvlA}v${lvlB}` : `l${lvlA}`;

        subs.push({
            id: `${tmId}_${subIdSuffix}`,
            team_match_id: tmId,
            level_index: levelIndex,
            pair_a_id: lookupPairId(teamAId, lvlA),
            pair_b_id: lookupPairId(teamBId, lvlB),
            sets: [{ a: 0, b: 0 }],
            status: 'upcoming',
            winner_override: null,
            format_override: cleanOverride
        });
    }
    return subs;
}

export function resolveSubMatchDivisionLabel(subMatch, config, pairA = null, pairB = null) {
    const normCfg = normalizeConfig(config);
    const lvlA = Number(pairA?.level_index) || Number(subMatch?.format_override?.levelA) || Number(subMatch?.level_index) || 1;
    const lvlB = Number(pairB?.level_index) || Number(subMatch?.format_override?.levelB) || Number(subMatch?.level_index) || 1;
    const nameA = normCfg.levelNames[lvlA - 1] || `Level ${lvlA}`;
    const nameB = normCfg.levelNames[lvlB - 1] || `Level ${lvlB}`;
    if (lvlA !== lvlB) {
        return `${nameA} vs ${nameB}`;
    }
    return nameA;
}

export function normalizeConfig(rawConfig) {
    const merged = { ...DEFAULT_CONFIG, ...(rawConfig || {}) };
    const levelsCount = Math.max(1, Math.min(8, Number(merged.levelsCount) || 3));
    const rawNames = Array.isArray(merged.levelNames) ? merged.levelNames : [];
    const levelNames = [];
    for (let i = 1; i <= levelsCount; i++) {
        const custom = typeof rawNames[i - 1] === 'string' ? rawNames[i - 1].trim() : '';
        levelNames.push(custom || `Level ${i}`);
    }
    const levelOrder = normalizeLevelOrder(merged.levelOrder, levelsCount);
    const levelOrderB = normalizeLevelOrder(merged.levelOrderB ?? merged.levelOrder, levelsCount);
    const awardsVisibility = AWARDS_VISIBILITY_MODES.includes(merged.awardsVisibility)
        ? merged.awardsVisibility
        : 'public';
    const rawMaskSeed = Number(merged.awardsMaskSeed);
    const awardsMaskSeed = Number.isFinite(rawMaskSeed) && rawMaskSeed >= 1 ? Math.floor(rawMaskSeed) : 1;
    const rawTopLimit = merged.awardsTopLimit === undefined || merged.awardsTopLimit === null ? 5 : Number(merged.awardsTopLimit);
    const awardsTopLimit = AWARDS_TOP_LIMITS.includes(rawTopLimit) ? rawTopLimit : 5;

    return {
        bestOf: [1, 3, 5].includes(Number(merged.bestOf)) ? Number(merged.bestOf) : 3,
        pointsPerSet: Math.max(1, Number(merged.pointsPerSet) || 11),
        winByTwo: merged.winByTwo !== false,
        pointCap: Math.max(0, Number(merged.pointCap) || 0),
        levelsCount,
        levelNames,
        levelOrder,
        levelOrderB,
        doubleRoundRobin: Boolean(merged.doubleRoundRobin),
        registrationOpen: merged.registrationOpen !== false,
        awardsVisibility,
        awardsMaskSeed,
        awardsTopLimit
    };
}

/**
 * Determines the winner ('A' | 'B' | null) of a single set.
 */
export function evaluateSetWinner(setScore, formatConfig, options = {}) {
    if (!setScore) return null;
    const a = Number(setScore.a ?? 0);
    const b = Number(setScore.b ?? 0);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return null;

    const target = Math.max(1, Number(formatConfig?.pointsPerSet) || 11);
    const winByTwo = formatConfig?.winByTwo !== false;
    const cap = Math.max(0, Number(formatConfig?.pointCap) || 0);

    if (winByTwo) {
        if (cap > 0 && (a >= cap || b >= cap)) {
            return a > b ? 'A' : 'B';
        }
        if (a >= target && a - b >= 2) return 'A';
        if (b >= target && b - a >= 2) return 'B';
    } else {
        if (a >= target && a > b) return 'A';
        if (b >= target && b > a) return 'B';
    }

    // If a subsequent set already has scores or the sub-match was explicitly marked completed,
    // honor the higher non-zero score (handles retirements or custom set targets).
    if ((options.hasNextSetWithPoints || options.subMatchCompleted) && (a > 0 || b > 0)) {
        return a > b ? 'A' : 'B';
    }

    return null;
}

/**
 * Evaluates a single Level sub-match (multiple sets, Ben Johns / PPA style).
 */
export function evaluateSubMatch(subMatch, tournamentConfig) {
    const baseCfg = normalizeConfig(tournamentConfig);
    const override = subMatch?.format_override || null;
    const effectiveCfg = override ? normalizeConfig({ ...baseCfg, ...override }) : baseCfg;
    const setsNeeded = Math.ceil(effectiveCfg.bestOf / 2);

    const sets = Array.isArray(subMatch?.sets) ? subMatch.sets : [];
    const isCompletedFlag = subMatch?.status === 'completed';

    let setsWonA = 0;
    let setsWonB = 0;
    let pointsA = 0;
    let pointsB = 0;

    const evaluatedSets = sets.map((s, idx) => {
        const a = Math.max(0, Number(s?.a ?? 0) || 0);
        const b = Math.max(0, Number(s?.b ?? 0) || 0);
        pointsA += a;
        pointsB += b;

        const nextSet = sets[idx + 1];
        const hasNextSetWithPoints = Boolean(nextSet && ((Number(nextSet.a) || 0) > 0 || (Number(nextSet.b) || 0) > 0));

        const setWinner = evaluateSetWinner({ a, b }, effectiveCfg, {
            hasNextSetWithPoints,
            subMatchCompleted: isCompletedFlag
        });

        if (setWinner === 'A') setsWonA += 1;
        if (setWinner === 'B') setsWonB += 1;

        return { a, b, winner: setWinner };
    });

    let winner = null;
    if (subMatch?.winner_override === 'A' || subMatch?.winner_override === 'B') {
        winner = subMatch.winner_override;
    } else if (setsWonA >= setsNeeded && setsWonA > setsWonB) {
        winner = 'A';
    } else if (setsWonB >= setsNeeded && setsWonB > setsWonA) {
        winner = 'B';
    } else if (isCompletedFlag) {
        if (setsWonA !== setsWonB) {
            winner = setsWonA > setsWonB ? 'A' : 'B';
        } else if (pointsA !== pointsB) {
            winner = pointsA > pointsB ? 'A' : 'B';
        }
    }

    let effectiveStatus = 'upcoming';
    if (winner || isCompletedFlag) {
        effectiveStatus = 'completed';
    } else if (subMatch?.status === 'live') {
        effectiveStatus = 'live';
    } else if (subMatch?.format_override?.queueState === 'ready') {
        effectiveStatus = 'ready';
    }

    return {
        effectiveConfig: effectiveCfg,
        setsNeeded,
        sets: evaluatedSets,
        setsWonA,
        setsWonB,
        pointsA,
        pointsB,
        winner,
        isDecided: Boolean(winner),
        effectiveStatus
    };
}

export function getSubMatchDisplayOrder(subMatch) {
    const raw = subMatch?.format_override?.displayOrder;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function getSubMatchStatusRank(effectiveStatus) {
    if (effectiveStatus === 'live') return 0;
    if (effectiveStatus === 'ready') return 1;
    if (effectiveStatus === 'completed') return 2;
    return 3;
}

export function compareSubMatches(a, b) {
    const ordA = getSubMatchDisplayOrder(a);
    const ordB = getSubMatchDisplayOrder(b);
    if (ordA !== null && ordB !== null && ordA !== ordB) return ordA - ordB;
    if (ordA !== null && ordB === null) return -1;
    if (ordA === null && ordB !== null) return 1;
    return (a.level_index ?? 0) - (b.level_index ?? 0);
}

/**
 * Evaluates a Team Match (head-to-head tie consisting of N level sub-matches).
 */
export function evaluateTeamMatch(teamMatch, allSubMatches, tournamentConfig) {
    const subs = (allSubMatches || [])
        .filter((sm) => sm.team_match_id === teamMatch.id)
        .sort(compareSubMatches);

    let subWinsA = 0;
    let subWinsB = 0;
    let decidedCount = 0;
    let liveSubCount = 0;
    let setsWonA = 0;
    let setsWonB = 0;
    let pointsA = 0;
    let pointsB = 0;

    const evaluatedSubs = subs.map((sm) => {
        const evalResult = evaluateSubMatch(sm, tournamentConfig);
        if (evalResult.winner === 'A') subWinsA += 1;
        if (evalResult.winner === 'B') subWinsB += 1;
        if (evalResult.isDecided) decidedCount += 1;
        if (evalResult.effectiveStatus === 'live') liveSubCount += 1;

        setsWonA += evalResult.setsWonA;
        setsWonB += evalResult.setsWonB;
        pointsA += evalResult.pointsA;
        pointsB += evalResult.pointsB;

        return {
            ...sm,
            eval: evalResult
        };
    });

    const allSubsDecided = subs.length > 0 && decidedCount === subs.length;
    const isCompleted = teamMatch.status === 'completed' || allSubsDecided;

    let winner = null;
    if (isCompleted && subs.length > 0) {
        if (subWinsA > subWinsB) winner = 'A';
        else if (subWinsB > subWinsA) winner = 'B';
        else winner = 'DRAW';
    }

    let effectiveStatus = teamMatch.status || 'upcoming';
    if (isCompleted) {
        effectiveStatus = 'completed';
    } else if (effectiveStatus !== 'live' && (liveSubCount > 0 || decidedCount > 0)) {
        effectiveStatus = 'live';
    }

    return {
        subMatches: evaluatedSubs,
        subWinsA,
        subWinsB,
        setsWonA,
        setsWonB,
        pointsA,
        pointsB,
        decidedCount,
        totalSubMatches: subs.length,
        isCompleted,
        effectiveStatus,
        winner
    };
}

/**
 * Calculates Team League standings using ONLY round_robin matches.
 * Ranking tiebreakers (exact order from Team League - Fixed Lineup rules):
 *   1. Team Match Wins (Số Team Match thắng)
 *   2. Total Sub-Match Wins (Tổng số trận thắng)
 *   3. Point Differential (Hiệu số điểm = Điểm ghi - Điểm thua)
 *   4. Set Differential -> Points For -> Seed Order (deterministic tiebreakers)
 */
export function calculateStandings(teams, teamMatches, subMatches, tournamentConfig) {
    const statsMap = new Map();

    for (const team of teams || []) {
        statsMap.set(team.id, {
            team,
            teamMatchesPlayed: 0,
            teamMatchWins: 0,
            teamMatchDraws: 0,
            teamMatchLosses: 0,
            subMatchWins: 0,
            subMatchLosses: 0,
            setsWon: 0,
            setsLost: 0,
            setDiff: 0,
            pointsFor: 0,
            pointsAgainst: 0,
            pointDiff: 0,
            form: []
        });
    }

    const rrMatches = (teamMatches || [])
        .filter((tm) => (tm.stage || 'round_robin') === 'round_robin')
        .sort((a, b) => (a.round_number ?? 1) - (b.round_number ?? 1) || (a.sort_order ?? 1) - (b.sort_order ?? 1));

    for (const tm of rrMatches) {
        const statA = statsMap.get(tm.team_a_id);
        const statB = statsMap.get(tm.team_b_id);
        if (!statA || !statB) continue;

        const evalTm = evaluateTeamMatch(tm, subMatches, tournamentConfig);

        // Team Match W/D/L counts when Team Match is completed
        if (evalTm.isCompleted) {
            statA.teamMatchesPlayed += 1;
            statB.teamMatchesPlayed += 1;
            if (evalTm.winner === 'A') {
                statA.teamMatchWins += 1;
                statB.teamMatchLosses += 1;
                statA.form.push('W');
                statB.form.push('L');
            } else if (evalTm.winner === 'B') {
                statB.teamMatchWins += 1;
                statA.teamMatchLosses += 1;
                statB.form.push('W');
                statA.form.push('L');
            } else if (evalTm.winner === 'DRAW') {
                statA.teamMatchDraws += 1;
                statB.teamMatchDraws += 1;
                statA.form.push('D');
                statB.form.push('D');
            }
        }

        // Sub-match wins & point differential accumulate from decided sub-matches
        // (and all points in completed sub-matches) so live rounds reflect finished courts accurately.
        for (const sm of evalTm.subMatches) {
            const ev = sm.eval;
            if (ev.isDecided || evalTm.isCompleted) {
                if (ev.winner === 'A') {
                    statA.subMatchWins += 1;
                    statB.subMatchLosses += 1;
                } else if (ev.winner === 'B') {
                    statB.subMatchWins += 1;
                    statA.subMatchLosses += 1;
                }

                statA.setsWon += ev.setsWonA;
                statA.setsLost += ev.setsWonB;
                statB.setsWon += ev.setsWonB;
                statB.setsLost += ev.setsWonA;

                statA.pointsFor += ev.pointsA;
                statA.pointsAgainst += ev.pointsB;
                statB.pointsFor += ev.pointsB;
                statB.pointsAgainst += ev.pointsA;
            }
        }
    }

    const rows = Array.from(statsMap.values()).map((row) => ({
        ...row,
        setDiff: row.setsWon - row.setsLost,
        pointDiff: row.pointsFor - row.pointsAgainst
    }));

    rows.sort((x, y) => {
        if (y.teamMatchWins !== x.teamMatchWins) return y.teamMatchWins - x.teamMatchWins;
        if (y.subMatchWins !== x.subMatchWins) return y.subMatchWins - x.subMatchWins;
        if (y.pointDiff !== x.pointDiff) return y.pointDiff - x.pointDiff;
        if (y.setDiff !== x.setDiff) return y.setDiff - x.setDiff;
        if (y.pointsFor !== x.pointsFor) return y.pointsFor - x.pointsFor;
        return (x.team.seed_order ?? 999) - (y.team.seed_order ?? 999);
    });

    // Annotate tiebreaker reason when multiple teams share identical Team Match Wins
    const winGroups = new Map();
    for (const r of rows) {
        winGroups.set(r.teamMatchWins, (winGroups.get(r.teamMatchWins) || 0) + 1);
    }

    return rows.map((row, idx) => {
        let tieNote = '';
        if ((winGroups.get(row.teamMatchWins) || 0) > 1 && row.teamMatchesPlayed > 0) {
            const prev = rows[idx - 1];
            const next = rows[idx + 1];
            const peer = (prev && prev.teamMatchWins === row.teamMatchWins)
                ? prev
                : ((next && next.teamMatchWins === row.teamMatchWins) ? next : null);
            if (peer) {
                if (row.subMatchWins !== peer.subMatchWins) tieNote = 'Phân hạng bằng Trận cặp';
                else if (row.pointDiff !== peer.pointDiff) tieNote = 'Phân hạng bằng HS điểm';
                else if (row.setDiff !== peer.setDiff) tieNote = 'Phân hạng bằng HS Set';
            }
        }
        return {
            rank: idx + 1,
            tieNote,
            ...row
        };
    });
}

export function parseScheduleValue(raw) {
    const text = String(raw || '').trim();
    if (!text) return { date: '', time: '' };

    // ISO YYYY-MM-DD with optional separator and time
    const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})(?:\s*[·|•\-,\s]\s*(.+))?$/);
    if (isoMatch) {
        return { date: isoMatch[1], time: (isoMatch[2] || '').trim() };
    }

    // DD/MM/YYYY with optional separator and time
    const vnMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s*[·|•\-,\s]\s*(.+))?$/);
    if (vnMatch) {
        const dd = vnMatch[1].padStart(2, '0');
        const mm = vnMatch[2].padStart(2, '0');
        return { date: `${vnMatch[3]}-${mm}-${dd}`, time: (vnMatch[4] || '').trim() };
    }

    return { date: '', time: text };
}

export function combineScheduleValue(dateStr, timeStr) {
    const d = String(dateStr || '').trim();
    const t = String(timeStr || '').trim();
    if (d && t) return `${d} · ${t}`;
    return d || t || '';
}

export function formatScheduleDisplay(dateStr, timeStr) {
    const d = String(dateStr || '').trim();
    const t = String(timeStr || '').trim();
    let dateLabel = d;
    const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) {
        dateLabel = `${iso[3]}/${iso[2]}/${iso[1]}`;
    }
    if (dateLabel && t) return `${dateLabel} · ${t}`;
    return dateLabel || t || '';
}

export function formatScheduleRaw(raw) {
    const parsed = parseScheduleValue(raw);
    return formatScheduleDisplay(parsed.date, parsed.time);
}

export function resolveSubMatchSchedule(subMatch, teamMatch) {
    const tmSched = parseScheduleValue(teamMatch?.scheduled_time);
    const ov = subMatch?.format_override || null;
    const ovCourt = String(ov?.court || '').trim();
    const ovDate = String(ov?.scheduledDate || '').trim();
    const ovTime = String(ov?.scheduledTime || '').trim();

    const parentCourt = String(teamMatch?.court || '').trim();
    const court = ovCourt || parentCourt;
    const date = ovDate || tmSched.date;
    const time = ovTime || tmSched.time;

    return {
        court,
        date,
        time,
        scheduleLabel: formatScheduleDisplay(date, time),
        hasCustomCourt: Boolean(ovCourt && ovCourt !== parentCourt),
        hasCustomTime: Boolean(ovTime),
        hasCustomSchedule: Boolean(ovDate || ovTime)
    };
}

export function getTeamMatchCourts(subMatches, teamMatch) {
    const list = (subMatches || [])
        .map((sm) => resolveSubMatchSchedule(sm, teamMatch).court)
        .filter(Boolean);
    if (list.length === 0 && teamMatch?.court) {
        return [String(teamMatch.court).trim()].filter(Boolean);
    }
    return Array.from(new Set(list)).sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
}

/**
 * Groups matches by Court (PickleballBrackets Court Board style) showing Live, Next Up, and Completed counts.
 * Automatically splits a Team Match across multiple courts when its pairs are assigned to different courts.
 */
export function buildCourtBoard(teamMatches, subMatches, tournamentConfig) {
    const courtsMap = new Map();
    const sorted = [...(teamMatches || [])].sort((a, b) => (a.round_number ?? 1) - (b.round_number ?? 1) || (a.sort_order ?? 1) - (b.sort_order ?? 1));
    const levelNames = normalizeConfig(tournamentConfig).levelNames;

    const ensureBucket = (name) => {
        if (!courtsMap.has(name)) {
            courtsMap.set(name, { court: name, live: [], upcoming: [], completed: [] });
        }
        return courtsMap.get(name);
    };

    for (const tm of sorted) {
        const ev = evaluateTeamMatch(tm, subMatches, tournamentConfig);
        const resolvedList = ev.subMatches.map((sm) => ({
            sm,
            sched: resolveSubMatchSchedule(sm, tm)
        }));
        const distinctCourts = Array.from(new Set(resolvedList.map((x) => x.sched.court || 'Chưa phân sân')));
        const hasSplitCourts = distinctCourts.length > 1 || resolvedList.some((x) => x.sched.hasCustomCourt);

        if (hasSplitCourts && resolvedList.length > 0) {
            for (const { sm, sched } of resolvedList) {
                const courtName = sched.court || 'Chưa phân sân';
                const bucket = ensureBucket(courtName);
                const st = sm.eval.effectiveStatus;
                const levelName = levelNames[sm.level_index - 1] || `Level ${sm.level_index}`;
                const entry = {
                    tm,
                    eval: ev,
                    isSubSlot: true,
                    subMatch: sm,
                    subLabel: levelName,
                    scheduleLabel: sched.scheduleLabel
                };
                if (st === 'live') bucket.live.push(entry);
                else if (st === 'completed') bucket.completed.push(entry);
                else bucket.upcoming.push(entry);
            }
            continue;
        }

        const courtName = (tm.court || '').trim() || 'Chưa phân sân';
        const bucket = ensureBucket(courtName);
        const entry = {
            tm,
            eval: ev,
            scheduleLabel: formatScheduleRaw(tm.scheduled_time)
        };
        if (ev.effectiveStatus === 'live') bucket.live.push(entry);
        else if (ev.effectiveStatus === 'completed') bucket.completed.push(entry);
        else bucket.upcoming.push(entry);
    }

    return Array.from(courtsMap.values()).sort((a, b) => {
        if (a.court === 'Chưa phân sân') return 1;
        if (b.court === 'Chưa phân sân') return -1;
        return a.court.localeCompare(b.court, 'vi', { numeric: true });
    });
}

/**
 * Calculates per-pair W-L and point differential across all matches (or round_robin).
 */
export function calculatePairStats(teamPairs, teamMatches, subMatches, tournamentConfig) {
    const pairStats = new Map();
    for (const p of teamPairs || []) {
        pairStats.set(p.id, {
            played: 0,
            wins: 0,
            losses: 0,
            setsWon: 0,
            setsLost: 0,
            pointsFor: 0,
            pointsAgainst: 0,
            pointDiff: 0
        });
    }

    const tmMap = new Map((teamMatches || []).map((tm) => [tm.id, tm]));

    for (const sm of subMatches || []) {
        const tm = tmMap.get(sm.team_match_id);
        if (!tm) continue;

        const ev = evaluateSubMatch(sm, tournamentConfig);
        if (!ev.isDecided && tm.status !== 'completed') continue;

        const statA = sm.pair_a_id ? pairStats.get(sm.pair_a_id) : null;
        const statB = sm.pair_b_id ? pairStats.get(sm.pair_b_id) : null;

        if (statA) {
            statA.played += 1;
            if (ev.winner === 'A') statA.wins += 1;
            if (ev.winner === 'B') statA.losses += 1;
            statA.setsWon += ev.setsWonA;
            statA.setsLost += ev.setsWonB;
            statA.pointsFor += ev.pointsA;
            statA.pointsAgainst += ev.pointsB;
            statA.pointDiff = statA.pointsFor - statA.pointsAgainst;
        }

        if (statB) {
            statB.played += 1;
            if (ev.winner === 'B') statB.wins += 1;
            if (ev.winner === 'A') statB.losses += 1;
            statB.setsWon += ev.setsWonB;
            statB.setsLost += ev.setsWonA;
            statB.pointsFor += ev.pointsB;
            statB.pointsAgainst += ev.pointsA;
            statB.pointDiff = statB.pointsFor - statB.pointsAgainst;
        }
    }

    return pairStats;
}

const EMPTY_STAT_SLOT = () => ({ points: 0, errors: 0 });

function getSideSlotKeys(side, pair) {
    const first = side === 'a' ? 'a1' : 'b1';
    const second = side === 'a' ? 'a2' : 'b2';
    return pair?.player_2 ? [first, second] : [first];
}

function normalizeSideOrder(rawOrder, defaultSlots) {
    if (defaultSlots.length <= 1) return [...defaultSlots];
    if (Array.isArray(rawOrder) && rawOrder.length === 2) {
        const s0 = String(rawOrder[0] || '');
        const s1 = String(rawOrder[1] || '');
        if (s0 !== s1 && defaultSlots.includes(s0) && defaultSlots.includes(s1)) {
            return [s0, s1];
        }
    }
    return [...defaultSlots];
}

function pickPartnerSlot(slot, sideOrder) {
    if (sideOrder.length <= 1) return sideOrder[0];
    return slot === sideOrder[0] ? sideOrder[1] : sideOrder[0];
}

/**
 * Normalizes a doubles rally state (server, receiver, serve turn 1/2, court position order 1/2).
 * Position index 0 = Right/Even court (1 - Phải), index 1 = Left/Odd court (2 - Trái).
 * Default initial matchup: orderA[0] (Phát 1) -> orderB[0] (Đỡ 1).
 */
export function normalizeRallyState(rawRally, pairA, pairB) {
    const slotsA = getSideSlotKeys('a', pairA);
    const slotsB = getSideSlotKeys('b', pairB);
    const orderA = normalizeSideOrder(rawRally?.orderA, slotsA);
    const orderB = normalizeSideOrder(rawRally?.orderB, slotsB);
    const fixedA = Boolean(rawRally?.fixedA);
    const fixedB = Boolean(rawRally?.fixedB);
    const fixedOrderA = normalizeSideOrder(rawRally?.fixedOrderA, orderA);
    const fixedOrderB = normalizeSideOrder(rawRally?.fixedOrderB, orderB);
    const allSlots = new Set([...orderA, ...orderB]);

    const rawServer = String(rawRally?.serverSlot || '');
    const serverSlot = allSlots.has(rawServer) ? rawServer : orderA[0];
    const serverSide = serverSlot.startsWith('a') ? 'a' : 'b';
    const serverOrder = serverSide === 'a' ? orderA : orderB;
    const oppOrder = serverSide === 'a' ? orderB : orderA;

    const rawReceiver = String(rawRally?.receiverSlot || '');
    const receiverSlot = oppOrder.includes(rawReceiver) ? rawReceiver : oppOrder[0];

    const serveTurn = serverOrder.length > 1
        ? (rawRally?.serveTurn == null ? 2 : (Number(rawRally.serveTurn) === 2 ? 2 : 1))
        : 1;
    return {
        serverSlot,
        receiverSlot,
        serveTurn,
        orderA,
        orderB,
        fixedA,
        fixedB,
        fixedOrderA,
        fixedOrderB
    };
}

/**
 * Swaps Position 1 (Right/Even) <-> Position 2 (Left/Odd) for a pair inside a Set.
 * When manually swapped (via button or drag-and-drop), also updates that pair's fixed anchor order.
 */
export function swapRallyCourtOrder(rawRally, side, pairA, pairB) {
    const cur = normalizeRallyState(rawRally, pairA, pairB);
    const nextOrderA = side === 'a' && cur.orderA.length === 2
        ? [cur.orderA[1], cur.orderA[0]]
        : cur.orderA;
    const nextOrderB = side === 'b' && cur.orderB.length === 2
        ? [cur.orderB[1], cur.orderB[0]]
        : cur.orderB;
    return {
        ...cur,
        orderA: nextOrderA,
        orderB: nextOrderB,
        fixedOrderA: side === 'a' ? [...nextOrderA] : cur.fixedOrderA,
        fixedOrderB: side === 'b' ? [...nextOrderB] : cur.fixedOrderB
    };
}

/**
 * Toggles Fixed Position (Stacking) ON/OFF for a pair ('a' | 'b').
 * When turned ON, captures the pair's current [Right, Left] order as its fixed home anchor
 * so that whenever the pair finishes its service turn (Side-Out), it automatically returns to this exact order.
 */
export function toggleRallyFixedOrder(rawRally, side, pairA, pairB) {
    const cur = normalizeRallyState(rawRally, pairA, pairB);
    if (side === 'a') {
        const nextFixedA = !cur.fixedA;
        return {
            ...cur,
            fixedA: nextFixedA,
            fixedOrderA: nextFixedA ? [...cur.orderA] : cur.fixedOrderA
        };
    }
    if (side === 'b') {
        const nextFixedB = !cur.fixedB;
        return {
            ...cur,
            fixedB: nextFixedB,
            fixedOrderB: nextFixedB ? [...cur.orderB] : cur.fixedOrderB
        };
    }
    return cur;
}

/**
 * Updates the active server or receiver role while keeping them on opposite sides.
 * When changing server within the already-serving team, preserves the current receiver selection for maximum flexibility.
 */
export function selectRallyRole(rawRally, role, slot, pairA, pairB) {
    const cur = normalizeRallyState(rawRally, pairA, pairB);
    const allValid = new Set([...cur.orderA, ...cur.orderB]);
    if (!allValid.has(slot)) return cur;

    if (role === 'server') {
        const prevSide = cur.serverSlot.startsWith('a') ? 'a' : 'b';
        const nextSide = slot.startsWith('a') ? 'a' : 'b';
        const serverOrder = nextSide === 'a' ? cur.orderA : cur.orderB;
        const oppOrder = nextSide === 'a' ? cur.orderB : cur.orderA;
        const serverIdx = Math.max(0, serverOrder.indexOf(slot));
        const keepCurrentReceiver = nextSide === prevSide && oppOrder.includes(cur.receiverSlot);
        const nextReceiver = keepCurrentReceiver
            ? cur.receiverSlot
            : (oppOrder[serverIdx] ?? oppOrder[0]);
        return normalizeRallyState({
            ...cur,
            serverSlot: slot,
            receiverSlot: nextReceiver,
            serveTurn: nextSide !== prevSide ? 1 : cur.serveTurn
        }, pairA, pairB);
    }

    if (role === 'receiver') {
        const recvSide = slot.startsWith('a') ? 'a' : 'b';
        const recvOrder = recvSide === 'a' ? cur.orderA : cur.orderB;
        const oppOrder = recvSide === 'a' ? cur.orderB : cur.orderA;
        const sameTeamServer = cur.serverSlot.startsWith(recvSide);
        const recvIdx = Math.max(0, recvOrder.indexOf(slot));
        const nextServer = sameTeamServer ? (oppOrder[recvIdx] ?? oppOrder[0]) : cur.serverSlot;
        return normalizeRallyState({
            ...cur,
            serverSlot: nextServer,
            receiverSlot: slot,
            serveTurn: sameTeamServer ? 1 : cur.serveTurn
        }, pairA, pairB);
    }

    return cur;
}

/**
 * Handles court drag-and-drop between two player zones:
 * - Same team side (e.g. a1 <-> a2): swaps court positions 1 (Right) <-> 2 (Left).
 * - Across the net (e.g. a1 -> b2): sets sourceSlot as Server (Phát) and targetSlot as Receiver (Đỡ).
 */
export function applyCourtDragDrop(rawRally, sourceSlot, targetSlot, pairA, pairB) {
    const cur = normalizeRallyState(rawRally, pairA, pairB);
    const src = String(sourceSlot || '').trim();
    const dst = String(targetSlot || '').trim();
    const allValid = new Set([...cur.orderA, ...cur.orderB]);
    if (!src || !dst || src === dst || !allValid.has(src) || !allValid.has(dst)) {
        return cur;
    }

    const srcSide = src.startsWith('a') ? 'a' : 'b';
    const dstSide = dst.startsWith('a') ? 'a' : 'b';
    if (srcSide === dstSide) {
        return swapRallyCourtOrder(cur, srcSide, pairA, pairB);
    }

    const prevServerSide = cur.serverSlot.startsWith('a') ? 'a' : 'b';
    return normalizeRallyState({
        ...cur,
        serverSlot: src,
        receiverSlot: dst,
        serveTurn: srcSide !== prevServerSide ? 1 : cur.serveTurn
    }, pairA, pairB);
}

/**
 * Advances doubles service turn on a lost rally (Serve 1 -> partner Serve 2 -> Side-out).
 */
export function advanceRallyServeTurn(rawRally, pairA, pairB) {
    const cur = normalizeRallyState(rawRally, pairA, pairB);
    const serverSide = cur.serverSlot.startsWith('a') ? 'a' : 'b';
    const serverOrder = serverSide === 'a' ? cur.orderA : cur.orderB;
    const oppOrder = serverSide === 'a' ? cur.orderB : cur.orderA;

    if (cur.serveTurn === 1 && serverOrder.length > 1) {
        const nextServer = pickPartnerSlot(cur.serverSlot, serverOrder);
        const nextIdx = Math.max(0, serverOrder.indexOf(nextServer));
        return {
            ...cur,
            serverSlot: nextServer,
            receiverSlot: oppOrder[nextIdx] ?? oppOrder[0],
            serveTurn: 2
        };
    }

    // Side-out: if the outgoing serving team has Fixed Position (Stacking) enabled,
    // restore their home [Right, Left] anchor order regardless of how many odd/even points they scored.
    const nextOrderA = serverSide === 'a' && cur.fixedA ? [...cur.fixedOrderA] : cur.orderA;
    const nextOrderB = serverSide === 'b' && cur.fixedB ? [...cur.fixedOrderB] : cur.orderB;
    const nextNewServerOrder = serverSide === 'a' ? nextOrderB : nextOrderA;
    const nextNewReceiverOrder = serverSide === 'a' ? nextOrderA : nextOrderB;

    return {
        ...cur,
        orderA: nextOrderA,
        orderB: nextOrderB,
        serverSlot: nextNewServerOrder[0],
        receiverSlot: nextNewReceiverOrder[0],
        serveTurn: 1
    };
}

/**
 * Applies a single doubles rally outcome under Side-Out scoring rules:
 * - 'server-ace' / 'receiver-error': +1 point to server, +1 Set score,
 *   serving pair swaps Left/Right court order so server stays diagonally opposite receiver (1 <-> 2).
 * - 'server-out': +1 error to server, 0 Set score, advance serve turn (1->2->side-out).
 * - 'receiver-win': +1 point to receiver, 0 Set score, advance serve turn (1->2->side-out).
 */
export function applyRallyOutcomeToSet(rawStatsRow, rawScoreRow, rawRally, outcome, pairA, pairB) {
    if (!VALID_RALLY_OUTCOMES.has(outcome)) {
        return null;
    }

    const rally = normalizeRallyState(rawRally, pairA, pairB);
    const statRow = {
        a1: { points: Math.max(0, Number(rawStatsRow?.a1?.points) || 0), errors: Math.max(0, Number(rawStatsRow?.a1?.errors) || 0) },
        a2: { points: Math.max(0, Number(rawStatsRow?.a2?.points) || 0), errors: Math.max(0, Number(rawStatsRow?.a2?.errors) || 0) },
        b1: { points: Math.max(0, Number(rawStatsRow?.b1?.points) || 0), errors: Math.max(0, Number(rawStatsRow?.b1?.errors) || 0) },
        b2: { points: Math.max(0, Number(rawStatsRow?.b2?.points) || 0), errors: Math.max(0, Number(rawStatsRow?.b2?.errors) || 0) }
    };
    const setScore = {
        a: Math.max(0, Math.min(99, Number(rawScoreRow?.a) || 0)),
        b: Math.max(0, Math.min(99, Number(rawScoreRow?.b) || 0))
    };
    const serverSide = rally.serverSlot.startsWith('a') ? 'a' : 'b';
    const serverOrder = serverSide === 'a' ? rally.orderA : rally.orderB;
    const oppOrder = serverSide === 'a' ? rally.orderB : rally.orderA;
    const partnerSlot = serverOrder.find((k) => k !== rally.serverSlot) || rally.serverSlot;
    const recv1Slot = oppOrder[0] || rally.receiverSlot;
    const recv2Slot = oppOrder[1] || oppOrder[0] || rally.receiverSlot;
    let nextRally = rally;
    let actorSlot = null;

    const rotateServerAndReceiverOnScore = () => {
        const swappedServerOrder = serverOrder.length === 2 ? [serverOrder[1], serverOrder[0]] : [...serverOrder];
        const newServerIdx = Math.max(0, swappedServerOrder.indexOf(rally.serverSlot));
        const nextReceiver = oppOrder[newServerIdx] ?? oppOrder[0];
        return {
            ...rally,
            orderA: serverSide === 'a' ? swappedServerOrder : rally.orderA,
            orderB: serverSide === 'b' ? swappedServerOrder : rally.orderB,
            receiverSlot: nextReceiver
        };
    };

    if (outcome === 'server-ace' || outcome === 'server-attack') {
        actorSlot = rally.serverSlot;
        statRow[actorSlot].points = Math.min(99, statRow[actorSlot].points + 1);
        setScore[serverSide] = Math.min(99, setScore[serverSide] + 1);
        nextRally = rotateServerAndReceiverOnScore();
    } else if (outcome === 'partner-attack') {
        actorSlot = partnerSlot;
        statRow[actorSlot].points = Math.min(99, statRow[actorSlot].points + 1);
        setScore[serverSide] = Math.min(99, setScore[serverSide] + 1);
        nextRally = rotateServerAndReceiverOnScore();
    } else if (outcome === 'recv1-defense') {
        actorSlot = recv1Slot;
        statRow[actorSlot].errors = Math.min(99, statRow[actorSlot].errors + 1);
        nextRally = advanceRallyServeTurn(rally, pairA, pairB);
    } else if (outcome === 'recv2-defense') {
        actorSlot = recv2Slot;
        statRow[actorSlot].errors = Math.min(99, statRow[actorSlot].errors + 1);
        nextRally = advanceRallyServeTurn(rally, pairA, pairB);
    } else if (outcome === 'serve-fault') {
        actorSlot = rally.serverSlot;
        nextRally = advanceRallyServeTurn(rally, pairA, pairB);
    } else if (outcome === 'receiver-error') {
        actorSlot = rally.serverSlot;
        statRow[rally.serverSlot].points = Math.min(99, statRow[rally.serverSlot].points + 1);
        statRow[rally.receiverSlot].errors = Math.min(99, statRow[rally.receiverSlot].errors + 1);
        setScore[serverSide] = Math.min(99, setScore[serverSide] + 1);
        nextRally = rotateServerAndReceiverOnScore();
    } else if (outcome === 'server-out') {
        actorSlot = rally.serverSlot;
        statRow[rally.serverSlot].errors = Math.min(99, statRow[rally.serverSlot].errors + 1);
        nextRally = advanceRallyServeTurn(rally, pairA, pairB);
    } else if (outcome === 'receiver-win') {
        actorSlot = rally.receiverSlot;
        statRow[rally.receiverSlot].errors = Math.min(99, statRow[rally.receiverSlot].errors + 1);
        nextRally = advanceRallyServeTurn(rally, pairA, pairB);
    }

    return { statRow, setScore, rally: nextRally, actorSlot };
}

/**
 * Validates and normalizes a player pre-registration submission.
 */
export function sanitizeRegistrationPayload(raw) {
    const fullName = String(raw?.full_name || '').trim().slice(0, 80);
    if (!fullName) {
        throw new Error('Vui lòng nhập Họ và tên.');
    }

    const rawDisplay = String(raw?.display_name || '').trim().slice(0, 40);
    const displayName = rawDisplay || fullName.slice(0, 40);

    const skillLevel = String(raw?.skill_level || '').trim().slice(0, 60);
    if (!skillLevel) {
        throw new Error('Vui lòng chọn Trình độ (Tự đánh giá).');
    }

    return {
        full_name: fullName,
        display_name: displayName,
        skill_level: skillLevel,
        preferred_partner: '',
        avoid_partner: ''
    };
}

/**
 * Normalizes legacy and current skill level labels into canonical SKILL_LEVEL_OPTIONS entries (Lv1 -> Lv3).
 */
export function normalizeSkillLevel(skillLabel) {
    const text = String(skillLabel || '').trim();
    if (!text) return 'Chưa rõ';
    const exactIdx = SKILL_LEVEL_OPTIONS.indexOf(text);
    if (exactIdx >= 0) return SKILL_LEVEL_OPTIONS[exactIdx];

    const lower = text.toLowerCase();
    if (lower.includes('lão luyện') || lower.includes('bậc thầy') || lower.includes('3.0') || lower.includes('lv1') || lower.includes('level 1')) {
        return SKILL_LEVEL_OPTIONS[0];
    }
    if (lower.includes('dui dẻ') || lower.includes('sương sương') || lower.includes('2.5') || lower.includes('lv2') || lower.includes('level 2')) {
        return SKILL_LEVEL_OPTIONS[1];
    }
    if (lower.includes('mầm non') || lower.includes('tập sự') || lower.includes('1.5') || lower.includes('lv3') || lower.includes('level 3')) {
        return SKILL_LEVEL_OPTIONS[2];
    }
    return text;
}

/**
 * Returns sort priority for skill levels ordered descending from Lv1 (0) down to Lv3 (2).
 */
export function getSkillLevelRank(skillLabel) {
    const normalized = normalizeSkillLevel(skillLabel);
    const idx = SKILL_LEVEL_OPTIONS.indexOf(normalized);
    return idx >= 0 ? idx : 99;
}

/**
 * Summarizes pre-tournament player registrations ordered from Lv1 down to Lv3.
 */
export function summarizeRegistrations(registrations = []) {
    const list = Array.isArray(registrations) ? registrations : [];
    let approved = 0;
    let pending = 0;
    let rejected = 0;
    const skillCounts = new Map(SKILL_LEVEL_OPTIONS.map((opt) => [opt, 0]));

    for (const r of list) {
        const st = r?.status || 'pending';
        if (st === 'approved') approved += 1;
        else if (st === 'rejected') rejected += 1;
        else pending += 1;

        const skill = normalizeSkillLevel(r?.skill_level);
        skillCounts.set(skill, (skillCounts.get(skill) || 0) + 1);
    }

    const bySkill = Array.from(skillCounts.entries())
        .map(([label, count]) => ({ label, count, rank: getSkillLevelRank(label) }))
        .sort((a, b) => a.rank - b.rank || b.count - a.count || a.label.localeCompare(b.label, 'vi'))
        .map(({ label, count }) => ({ label, count }));

    return {
        total: list.length,
        approved,
        pending,
        rejected,
        bySkill
    };
}

/**
 * Resolves a registered player's tournament display name:
 * prefers Tên thi đấu (`display_name`), defaulting to Họ và tên (`full_name`) when blank.
 */
export function resolveRegisteredDisplayName(reg) {
    const nick = String(reg?.display_name || '').trim();
    if (nick) return nick;
    return String(reg?.full_name || '').trim();
}

/**
 * Builds a normalized, deduplicated roster-picker catalog from non-rejected registrations.
 */
export function buildRegisteredPlayerCatalog(registrations = []) {
    const active = (Array.isArray(registrations) ? registrations : []).filter((r) => (r?.status || 'pending') !== 'rejected');

    const baseCounts = new Map();
    for (const r of active) {
        const baseName = resolveRegisteredDisplayName(r);
        if (!baseName) continue;
        const k = baseName.toLowerCase();
        baseCounts.set(k, (baseCounts.get(k) || 0) + 1);
    }

    const usedValues = new Set();
    const entries = [];
    for (const r of active) {
        const fullName = String(r?.full_name || '').trim();
        const baseName = resolveRegisteredDisplayName(r);
        if (!baseName) continue;

        let value = baseName;
        if ((baseCounts.get(baseName.toLowerCase()) || 0) > 1 && fullName) {
            const firstToken = fullName.split(/\s+/)[0];
            const suffix = firstToken && firstToken.toLowerCase() !== baseName.toLowerCase() ? firstToken : fullName;
            value = `${baseName} (${suffix})`;
        }
        let uniqueValue = value;
        let serial = 2;
        while (usedValues.has(uniqueValue.toLowerCase())) {
            uniqueValue = `${value} #${serial}`;
            serial += 1;
        }
        usedValues.add(uniqueValue.toLowerCase());

        const rank = getSkillLevelRank(r?.skill_level);
        const levelIndex = rank < 10 ? rank + 1 : 99;
        const shortLvl = levelIndex <= 3 ? `Lv${levelIndex}` : '';
        const status = r?.status || 'pending';
        const suffixParts = [shortLvl, status !== 'approved' ? 'Chờ duyệt' : ''].filter(Boolean);

        entries.push({
            id: r?.id || '',
            value: uniqueValue,
            key: uniqueValue.toLowerCase(),
            fullName,
            fullKey: fullName.toLowerCase(),
            levelIndex,
            status,
            label: suffixParts.length > 0 ? `${uniqueValue} · ${suffixParts.join(' · ')}` : uniqueValue
        });
    }

    return entries.sort((a, b) => {
        const appDiff = (a.status === 'approved' ? 0 : 1) - (b.status === 'approved' ? 0 : 1);
        if (appDiff !== 0) return appDiff;
        const lvlDiff = a.levelIndex - b.levelIndex;
        if (lvlDiff !== 0) return lvlDiff;
        return a.label.localeCompare(b.label, 'vi');
    });
}

function buildUniqueFullNameLookup(catalog = []) {
    const counts = new Map();
    const firstMatch = new Map();
    const valueKeys = new Set();
    for (const entry of catalog || []) {
        if (entry?.key) valueKeys.add(entry.key);
        const fk = entry?.fullKey;
        if (!fk) continue;
        counts.set(fk, (counts.get(fk) || 0) + 1);
        if (!firstMatch.has(fk)) firstMatch.set(fk, entry);
    }
    const uniqueByFull = new Map();
    for (const [fk, count] of counts.entries()) {
        if (count === 1 && !valueKeys.has(fk)) {
            uniqueByFull.set(fk, firstMatch.get(fk));
        }
    }
    return uniqueByFull;
}

/**
 * Resolves a stored pair player string cleanly to the corresponding catalog value (matching key or unique fullName).
 */
export function resolveCatalogPlayerValue(catalog = [], currentValue = '') {
    const curVal = String(currentValue || '').trim();
    if (!curVal) return '';
    const curKey = curVal.toLowerCase();
    const list = Array.isArray(catalog) ? catalog : [];
    const exactEntry = list.find((p) => p.key === curKey);
    if (exactEntry) return exactEntry.value;
    const uniqueFull = buildUniqueFullNameLookup(list).get(curKey);
    return uniqueFull ? uniqueFull.value : curVal;
}

/**
 * Reconciles `teamPairs` player names so slots matching a registration's `full_name` use `Tên thi đấu` (or `full_name` when blank).
 */
export function reconcileTeamPairsDisplayNames(teamPairs = [], registrations = []) {
    const catalog = buildRegisteredPlayerCatalog(registrations);
    const uniqueByFull = buildUniqueFullNameLookup(catalog);
    let changed = false;
    const nextPairs = (teamPairs || []).map((pair) => {
        const nextPair = { ...pair };
        for (const field of ['player_1', 'player_2']) {
            const cur = String(pair?.[field] || '').trim();
            if (!cur) continue;
            const curKey = cur.toLowerCase();
            if (catalog.some((e) => e.key === curKey)) continue;
            const matched = uniqueByFull.get(curKey);
            if (matched && matched.value !== cur) {
                nextPair[field] = matched.value;
                changed = true;
            }
        }
        return nextPair;
    });
    return { teamPairs: nextPairs, changed };
}

/**
 * Propagates edits to a single player registration (`Tên thi đấu` or `Họ và tên`) across `teamPairs` throughout the tournament.
 */
export function syncTeamPairsWithRegistrationChange(teamPairs = [], prevRegistrations = [], nextRegistrations = [], regId = '') {
    const prevReg = (prevRegistrations || []).find((r) => r.id === regId);
    const nextReg = (nextRegistrations || []).find((r) => r.id === regId);
    if (!prevReg || !nextReg) {
        return reconcileTeamPairsDisplayNames(teamPairs, nextRegistrations);
    }

    const prevCatalog = buildRegisteredPlayerCatalog(prevRegistrations);
    const nextCatalog = buildRegisteredPlayerCatalog(nextRegistrations);
    const prevEntry = prevCatalog.find((e) => e.id === regId);
    const nextEntry = nextCatalog.find((e) => e.id === regId);
    const nextValue = nextEntry?.value || resolveRegisteredDisplayName(nextReg);
    if (!nextValue) return { teamPairs: [...(teamPairs || [])], changed: false };

    const candidateKeys = new Set();
    if (prevEntry?.key) candidateKeys.add(prevEntry.key);
    const oldDisplayKey = resolveRegisteredDisplayName(prevReg).toLowerCase();
    if (oldDisplayKey) candidateKeys.add(oldDisplayKey);

    const oldFullKey = String(prevReg.full_name || '').trim().toLowerCase();
    const otherSharesOldFull = oldFullKey && (prevRegistrations || []).some((r) => (
        r.id !== regId
        && (r.status || 'pending') !== 'rejected'
        && (
            String(r.full_name || '').trim().toLowerCase() === oldFullKey
            || resolveRegisteredDisplayName(r).toLowerCase() === oldFullKey
        )
    ));
    if (oldFullKey && !otherSharesOldFull) {
        candidateKeys.add(oldFullKey);
    }

    let changed = false;
    const nextPairs = (teamPairs || []).map((pair) => {
        const nextPair = { ...pair };
        for (const field of ['player_1', 'player_2']) {
            const cur = String(pair?.[field] || '').trim();
            if (!cur) continue;
            if (candidateKeys.has(cur.toLowerCase()) && cur !== nextValue) {
                nextPair[field] = nextValue;
                changed = true;
            }
        }
        return nextPair;
    });

    if (!changed) {
        return reconcileTeamPairsDisplayNames(teamPairs, nextRegistrations);
    }
    return { teamPairs: nextPairs, changed: true };
}

/**
 * Builds `<option>` markup for a roster slot matched to its bracket level while excluding players already chosen in other slots.
 */
export function buildPlayerSelectOptionsHtml(catalog = [], otherAssignedKeys = new Set(), currentValue = '', targetLevel = 1) {
    const resolvedVal = resolveCatalogPlayerValue(catalog, currentValue);
    const curVal = String(resolvedVal || '').trim();
    const curKey = curVal.toLowerCase();
    const list = Array.isArray(catalog) ? catalog : [];
    const strictLevelMatch = targetLevel >= 1 && targetLevel <= SKILL_LEVEL_OPTIONS.length;

    const levelPool = strictLevelMatch
        ? list.filter((p) => p.levelIndex === targetLevel)
        : list;
    const available = levelPool.filter((p) => p.key === curKey || !otherAssignedKeys.has(p.key));
    const existingEntry = curKey ? list.find((p) => p.key === curKey) : null;
    const inLevelPool = Boolean(existingEntry && (!strictLevelMatch || existingEntry.levelIndex === targetLevel));

    const renderOpt = (p) => `<option value="${escapeHtml(p.value)}" ${p.key === curKey ? 'selected' : ''}>${escapeHtml(p.label)}</option>`;

    let optionsBody = `<option value="" ${!curVal ? 'selected' : ''}>— Chọn người chơi —</option>`;
    if (curVal && !inLevelPool) {
        if (existingEntry) {
            const curLvlTag = existingEntry.levelIndex <= SKILL_LEVEL_OPTIONS.length ? `Lv${existingEntry.levelIndex}` : 'Chưa rõ';
            optionsBody += `<option value="${escapeHtml(curVal)}" selected>${escapeHtml(curVal)} (Đang ${curLvlTag} — lệch hạng)</option>`;
        } else {
            optionsBody += `<option value="${escapeHtml(curVal)}" selected>${escapeHtml(curVal)} (Ngoài ĐK)</option>`;
        }
    }

    if (available.length > 0) {
        optionsBody += available.map(renderOpt).join('');
    } else if (list.length === 0) {
        optionsBody += '<option value="" disabled>Chưa có người chơi trong Đăng Ký</option>';
    } else if (strictLevelMatch && levelPool.length === 0) {
        optionsBody += `<option value="" disabled>Chưa có người chơi Level ${targetLevel} trong ĐK</option>`;
    } else if (strictLevelMatch) {
        optionsBody += `<option value="" disabled>Đã chọn hết người chơi Level ${targetLevel}</option>`;
    } else {
        optionsBody += '<option value="" disabled>Đã chọn hết người chơi ĐK</option>';
    }

    return optionsBody;
}

/**
 * Detects duplicate player names assigned to multiple slots across fixed lineup pairs.
 */
export function findDuplicateRosterPlayers(teamPairs = []) {
    const seen = new Map();
    const duplicates = [];

    for (const pair of teamPairs || []) {
        const slotName = pair?.pair_label || `L${pair?.level_index || '?'}`;
        for (const field of ['player_1', 'player_2']) {
            const name = String(pair?.[field] || '').trim();
            if (!name) continue;
            const key = name.toLowerCase();
            if (!seen.has(key)) {
                seen.set(key, { name, slots: [slotName] });
            } else {
                const entry = seen.get(key);
                entry.slots.push(slotName);
                if (entry.slots.length === 2) {
                    duplicates.push(entry);
                }
            }
        }
    }

    return duplicates;
}

export function normalizeSetPlayerStats(rawStats, setCount = 1) {
    const count = Math.max(1, Number(setCount) || 1);
    const list = Array.isArray(rawStats) ? rawStats : [];
    return Array.from({ length: count }, (_, idx) => {
        const row = list[idx] && typeof list[idx] === 'object' ? list[idx] : {};
        const clampStat = (slot) => ({
            points: Math.max(0, Math.min(99, Number(row[slot]?.points) || 0)),
            errors: Math.max(0, Math.min(99, Number(row[slot]?.errors) || 0))
        });
        return {
            a1: clampStat('a1'),
            a2: clampStat('a2'),
            b1: clampStat('b1'),
            b2: clampStat('b2')
        };
    });
}

export function sumSubMatchPlayerStats(subMatch) {
    const setsLen = Array.isArray(subMatch?.sets) ? subMatch.sets.length : 1;
    const rawArr = subMatch?.format_override?.setPlayerStats;
    const rows = normalizeSetPlayerStats(rawArr, Math.max(setsLen, Array.isArray(rawArr) ? rawArr.length : 1));
    const totals = {
        a1: EMPTY_STAT_SLOT(),
        a2: EMPTY_STAT_SLOT(),
        b1: EMPTY_STAT_SLOT(),
        b2: EMPTY_STAT_SLOT()
    };
    for (const r of rows) {
        for (const key of ['a1', 'a2', 'b1', 'b2']) {
            totals[key].points += r[key].points;
            totals[key].errors += r[key].errors;
        }
    }
    return totals;
}

const VALID_RALLY_OUTCOMES = new Set([
    'server-ace',
    'server-attack',
    'partner-attack',
    'recv1-defense',
    'recv2-defense',
    'serve-fault',
    'receiver-error',
    'server-out',
    'receiver-win'
]);
const SCORING_RALLY_OUTCOMES = new Set(['server-ace', 'server-attack', 'partner-attack', 'receiver-error']);
const VALID_RALLY_SLOTS = new Set(['a1', 'a2', 'b1', 'b2']);

/**
 * Normalizes per-set persistent rally history arrays inside `subMatch.format_override.setRallyLogs`.
 */
export function normalizeSetRallyLogs(rawLogs, setCount = 1) {
    const rawArr = Array.isArray(rawLogs) ? rawLogs : [];
    const count = Math.max(1, Number(setCount) || 1, rawArr.length);
    return Array.from({ length: count }, (_, idx) => {
        const list = Array.isArray(rawArr[idx]) ? rawArr[idx] : [];
        const cleanList = [];
        for (const item of list) {
            if (!item || typeof item !== 'object') continue;
            if (!VALID_RALLY_OUTCOMES.has(item.outcome)) continue;
            const sSlot = VALID_RALLY_SLOTS.has(item.sSlot) ? item.sSlot : 'a1';
            const rSlot = VALID_RALLY_SLOTS.has(item.rSlot) ? item.rSlot : 'b1';
            const aSlot = VALID_RALLY_SLOTS.has(item.aSlot) ? item.aSlot : '';
            const sSide = item.sSide === 'b' || sSlot.startsWith('b') ? 'b' : 'a';
            const scored = Boolean(item.scored ?? SCORING_RALLY_OUTCOMES.has(item.outcome));
            const sideOut = Boolean(item.sideOut);
            cleanList.push({
                n: Math.max(1, Number(item.n) || cleanList.length + 1),
                outcome: item.outcome,
                sSide,
                sSlot,
                rSlot,
                ...(aSlot ? { aSlot } : {}),
                turn: Number(item.turn) === 2 ? 2 : 1,
                nextTurn: Number(item.nextTurn) === 2 ? 2 : 1,
                sPos: Number(item.sPos) === 2 ? 2 : 1,
                rPos: Number(item.rPos) === 2 ? 2 : 1,
                a: Math.max(0, Math.min(99, Number(item.a) || 0)),
                b: Math.max(0, Math.min(99, Number(item.b) || 0)),
                scored,
                sideOut,
                call: String(item.call || '').slice(0, 16),
                ts: String(item.ts || '').slice(0, 40)
            });
        }
        return cleanList;
    });
}

/**
 * Creates a compact rally history log entry from before/after rally snapshots.
 */
export function createRallyLogEntry({
    seq = 1,
    rallyBefore,
    outcome,
    result,
    scoreBefore,
    pairA,
    pairB,
    timestamp = ''
}) {
    if (!VALID_RALLY_OUTCOMES.has(outcome) || !result) return null;
    const cur = normalizeRallyState(rallyBefore, pairA, pairB);
    const sSide = cur.serverSlot.startsWith('a') ? 'a' : 'b';
    const serverOrder = sSide === 'a' ? cur.orderA : cur.orderB;
    const oppOrder = sSide === 'a' ? cur.orderB : cur.orderA;
    const sPos = Math.max(1, serverOrder.indexOf(cur.serverSlot) + 1);
    const rPos = Math.max(1, oppOrder.indexOf(cur.receiverSlot) + 1);
    const beforeA = Math.max(0, Number(scoreBefore?.a) || 0);
    const beforeB = Math.max(0, Number(scoreBefore?.b) || 0);
    const serverScoreBefore = sSide === 'a' ? beforeA : beforeB;
    const recvScoreBefore = sSide === 'a' ? beforeB : beforeA;
    const nextSide = result.rally?.serverSlot?.startsWith('b') ? 'b' : 'a';

    return {
        n: Math.max(1, Number(seq) || 1),
        outcome,
        sSide,
        sSlot: cur.serverSlot,
        rSlot: cur.receiverSlot,
        ...(result.actorSlot && VALID_RALLY_SLOTS.has(result.actorSlot) ? { aSlot: result.actorSlot } : {}),
        turn: cur.serveTurn,
        nextTurn: Number(result.rally?.serveTurn) === 2 ? 2 : 1,
        sPos: sPos === 2 ? 2 : 1,
        rPos: rPos === 2 ? 2 : 1,
        a: Math.max(0, Number(result.setScore?.a) || 0),
        b: Math.max(0, Number(result.setScore?.b) || 0),
        scored: SCORING_RALLY_OUTCOMES.has(outcome),
        sideOut: nextSide !== sSide,
        call: `${serverScoreBefore}-${recvScoreBefore}-${cur.serveTurn}`,
        ts: String(timestamp || '')
    };
}

/**
 * Computes set analytics (longest scoring runs, side-outs, max leads, progression points) from rally logs.
 */
export function summarizeSetRallyLog(logs = []) {
    const clean = normalizeSetRallyLogs([logs], 1)[0] || [];
    let scoringRallies = 0;
    let sideOuts = 0;
    let maxRunA = 0;
    let maxRunB = 0;
    let curRunA = 0;
    let curRunB = 0;
    let largestLeadA = 0;
    let largestLeadB = 0;
    const first = clean[0];
    const startA = first ? Math.max(0, first.a - (first.scored && first.sSide === 'a' ? 1 : 0)) : 0;
    const startB = first ? Math.max(0, first.b - (first.scored && first.sSide === 'b' ? 1 : 0)) : 0;
    const timeline = [{ n: 0, a: startA, b: startB }];

    for (const e of clean) {
        if (e.sideOut) sideOuts += 1;
        if (e.scored) {
            scoringRallies += 1;
            if (e.sSide === 'a') {
                curRunA += 1;
                curRunB = 0;
                if (curRunA > maxRunA) maxRunA = curRunA;
            } else {
                curRunB += 1;
                curRunA = 0;
                if (curRunB > maxRunB) maxRunB = curRunB;
            }
        } else if (e.sideOut) {
            curRunA = 0;
            curRunB = 0;
        }

        const lead = e.a - e.b;
        if (lead > largestLeadA) largestLeadA = lead;
        if (-lead > largestLeadB) largestLeadB = -lead;

        timeline.push({
            n: e.n,
            a: e.a,
            b: e.b,
            sSide: e.sSide,
            scored: e.scored
        });
    }

    return {
        totalRallies: clean.length,
        scoringRallies,
        sideOuts,
        maxRunA,
        maxRunB,
        largestLeadA,
        largestLeadB,
        timeline
    };
}

/**
 * Ranks all fixed pairs across ALL matches (round_robin + playoff) for "Cặp Đôi Ăn Ý":
 * Most Pair Wins -> Best Point Differential -> Best Set Differential -> Most Points For.
 */
export function calculatePairLeaderboard(teams, teamPairs, teamMatches, subMatches, tournamentConfig) {
    const config = normalizeConfig(tournamentConfig);
    const teamsMap = new Map((teams || []).map((t) => [t.id, t]));
    const statsMap = calculatePairStats(teamPairs, teamMatches, subMatches, config);

    const rows = (teamPairs || []).map((pair) => {
        const team = teamsMap.get(pair.team_id) || { id: pair.team_id, name: '?', code: '?', color: '#0E7C5B', seed_order: 99 };
        const st = statsMap.get(pair.id) || {
            played: 0, wins: 0, losses: 0, setsWon: 0, setsLost: 0, pointsFor: 0, pointsAgainst: 0, pointDiff: 0
        };
        const setDiff = st.setsWon - st.setsLost;
        return {
            pair,
            team,
            levelName: config.levelNames[pair.level_index - 1] || `Level ${pair.level_index}`,
            playersText: `${pair.player_1 || ''}${pair.player_2 ? ` / ${pair.player_2}` : ''}`.trim() || pair.pair_label,
            ...st,
            setDiff
        };
    });

    rows.sort((x, y) => {
        if (y.wins !== x.wins) return y.wins - x.wins;
        if (y.pointDiff !== x.pointDiff) return y.pointDiff - x.pointDiff;
        if (y.setDiff !== x.setDiff) return y.setDiff - x.setDiff;
        if (y.pointsFor !== x.pointsFor) return y.pointsFor - x.pointsFor;
        return (x.team.seed_order ?? 99) - (y.team.seed_order ?? 99) || (x.pair.level_index ?? 1) - (y.pair.level_index ?? 1);
    });

    return rows.map((row, idx) => ({ rank: idx + 1, ...row }));
}

/**
 * Aggregates individual player Points Scored & Out/Net Errors across ALL matches
 * (regardless of whether their pair or team won or lost).
 */
export function calculatePlayerLeaderboard(teams, teamPairs, teamMatches, subMatches, tournamentConfig) {
    const config = normalizeConfig(tournamentConfig);
    const teamsMap = new Map((teams || []).map((t) => [t.id, t]));
    const pairsMap = new Map((teamPairs || []).map((p) => [p.id, p]));
    const playersMap = new Map();

    const sortedMatches = [...(teamMatches || [])].sort((a, b) => {
        if ((a.stage || 'round_robin') !== (b.stage || 'round_robin')) {
            return a.stage === 'playoff' ? 1 : -1;
        }
        return (a.round_number ?? 1) - (b.round_number ?? 1) || (a.sort_order ?? 1) - (b.sort_order ?? 1);
    });

    const ensurePlayerEntry = (nameRaw, team, pair) => {
        const name = String(nameRaw || '').trim();
        if (!name || !team) return null;
        const key = `${team.id}::${name.toLowerCase()}`;
        if (!playersMap.has(key)) {
            playersMap.set(key, {
                key,
                name,
                team,
                pairLabelsSet: new Set(),
                levelNamesSet: new Set(),
                matchesPlayed: 0,
                pairWins: 0,
                pairLosses: 0,
                totalPoints: 0,
                totalErrors: 0,
                matchLogs: []
            });
        }
        const entry = playersMap.get(key);
        if (pair?.pair_label) entry.pairLabelsSet.add(pair.pair_label);
        if (pair?.level_index) {
            entry.levelNamesSet.add(config.levelNames[pair.level_index - 1] || `Level ${pair.level_index}`);
        }
        return entry;
    };

    // Pre-seed every registered roster player so 0-point players still appear cleanly when needed
    for (const pair of teamPairs || []) {
        const team = teamsMap.get(pair.team_id);
        ensurePlayerEntry(pair.player_1, team, pair);
        ensurePlayerEntry(pair.player_2, team, pair);
    }

    for (const tm of sortedMatches) {
        const teamA = teamsMap.get(tm.team_a_id);
        const teamB = teamsMap.get(tm.team_b_id);
        const evTm = evaluateTeamMatch(tm, subMatches, config);

        for (const sm of evTm.subMatches) {
            const ev = sm.eval;
            const sums = sumSubMatchPlayerStats(sm);
            const hasStats = ['a1', 'a2', 'b1', 'b2'].some((k) => sums[k].points > 0 || sums[k].errors > 0);
            const hasPlayedScore = (ev.sets || []).some((s) => s.a > 0 || s.b > 0);
            if (!ev.isDecided && ev.effectiveStatus !== 'live' && !hasStats && !hasPlayedScore) {
                continue;
            }

            const pairA = sm.pair_a_id ? pairsMap.get(sm.pair_a_id) : null;
            const pairB = sm.pair_b_id ? pairsMap.get(sm.pair_b_id) : null;
            const scoreSummary = (ev.sets || []).map((s) => `${s.a}-${s.b}`).join(', ');
            const levelName = config.levelNames[sm.level_index - 1] || `Level ${sm.level_index}`;

            const recordSide = (pair, team, oppTeam, oppPair, slot1, slot2, sideKey) => {
                if (!pair || !team) return;
                const wonPair = ev.winner === sideKey;
                const lostPair = Boolean(ev.winner && ev.winner !== sideKey);
                const oppName = oppTeam?.code || oppPair?.pair_label || '?';
                const logBase = {
                    matchId: tm.id,
                    subId: sm.id,
                    roundName: tm.round_name || `Vòng ${tm.round_number || 1}`,
                    levelName,
                    opponentLabel: oppName,
                    scoreSummary,
                    wonPair,
                    lostPair
                };

                for (const [playerName, slotKey] of [[pair.player_1, slot1], [pair.player_2, slot2]]) {
                    const pEntry = ensurePlayerEntry(playerName, team, pair);
                    if (!pEntry) continue;
                    const pts = sums[slotKey].points;
                    const errs = sums[slotKey].errors;
                    pEntry.matchesPlayed += 1;
                    if (wonPair) pEntry.pairWins += 1;
                    if (lostPair) pEntry.pairLosses += 1;
                    pEntry.totalPoints += pts;
                    pEntry.totalErrors += errs;
                    pEntry.matchLogs.push({ ...logBase, points: pts, errors: errs });
                }
            };

            recordSide(pairA, teamA, teamB, pairB, 'a1', 'a2', 'A');
            recordSide(pairB, teamB, teamA, pairA, 'b1', 'b2', 'B');
        }
    }

    const baseList = Array.from(playersMap.values()).map((p) => ({
        ...p,
        pairLabel: Array.from(p.pairLabelsSet).join(', '),
        levelLabel: Array.from(p.levelNamesSet).join(', '),
        avgPoints: p.matchesPlayed > 0 ? Number((p.totalPoints / p.matchesPlayed).toFixed(1)) : 0,
        avgErrors: p.matchesPlayed > 0 ? Number((p.totalErrors / p.matchesPlayed).toFixed(1)) : 0
    }));

    const byPoints = [...baseList]
        .sort((a, b) => {
            if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
            if (a.totalErrors !== b.totalErrors) return a.totalErrors - b.totalErrors;
            if (b.matchesPlayed !== a.matchesPlayed) return b.matchesPlayed - a.matchesPlayed;
            return a.name.localeCompare(b.name, 'vi');
        })
        .map((row, idx) => ({ rank: idx + 1, ...row }));

    const byErrors = [...baseList]
        .sort((a, b) => {
            if (b.totalErrors !== a.totalErrors) return b.totalErrors - a.totalErrors;
            if (b.matchesPlayed !== a.matchesPlayed) return b.matchesPlayed - a.matchesPlayed;
            if (a.totalPoints !== b.totalPoints) return a.totalPoints - b.totalPoints;
            return a.name.localeCompare(b.name, 'vi');
        })
        .map((row, idx) => ({ rank: idx + 1, ...row }));

    return {
        players: baseList,
        byPoints,
        byErrors,
        hasAnyStats: baseList.some((p) => p.totalPoints > 0 || p.totalErrors > 0)
    };
}

const ANON_MASKED_TEAM = Object.freeze({
    id: 'anon',
    name: '?',
    code: '?',
    color: '#64748b'
});

function hashStringWithSeed(str, seed) {
    let h = (2166136261 ^ (seed >>> 0)) >>> 0;
    const text = String(str || '');
    for (let i = 0; i < text.length; i += 1) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
}

function buildSeededPermutation(length, seed, salt) {
    const indices = Array.from({ length }, (_, idx) => idx);
    let state = (hashStringWithSeed(salt, seed) || 0x9e3779b9) >>> 0;
    for (let i = indices.length - 1; i > 0; i -= 1) {
        state ^= (state << 13) >>> 0;
        state ^= (state >>> 17) >>> 0;
        state ^= (state << 5) >>> 0;
        const j = (state >>> 0) % (i + 1);
        const tmp = indices[i];
        indices[i] = indices[j];
        indices[j] = tmp;
    }
    return indices;
}

function formatThreeDigitCode(pool, index) {
    if (index < pool.length) {
        return String(100 + pool[index]);
    }
    return String(100 + index);
}

/**
 * Deterministically replaces pair and player identities with unique 3-digit
 * random codes ("Cặp đôi XXX" / "Cá nhân XXX"), masks teams/levels as "?",
 * and strips per-match logs while keeping aggregate statistics intact.
 */
export function anonymizeAwardsLeaderboards(pairRows = [], playerBoard = {}, seed = 1) {
    const numericSeed = Number.isFinite(Number(seed)) && Number(seed) >= 1 ? Math.floor(Number(seed)) : 1;

    const getPairKey = (row, fallbackIdx) => (
        row?.pair?.id
        || `${row?.team?.id || ''}::${row?.levelName || ''}::${row?.playersText || fallbackIdx}`
    );
    const getPlayerKey = (row, fallbackIdx) => (
        row?.key
        || `${row?.team?.id || ''}::${String(row?.name || fallbackIdx).toLowerCase()}`
    );

    const uniquePairKeys = Array.from(new Set((pairRows || []).map(getPairKey))).sort();
    const pairCodePool = buildSeededPermutation(900, numericSeed, 'pairs3d');
    const pairAliasMap = new Map();
    uniquePairKeys.forEach((key, idx) => {
        pairAliasMap.set(key, `Cặp đôi ${formatThreeDigitCode(pairCodePool, idx)}`);
    });

    const allPlayerRows = [
        ...(playerBoard.players || []),
        ...(playerBoard.byPoints || []),
        ...(playerBoard.byErrors || [])
    ];
    const uniquePlayerKeys = Array.from(new Set(allPlayerRows.map(getPlayerKey))).sort();
    const playerCodePool = buildSeededPermutation(900, numericSeed, 'players3d');
    const playerAliasMap = new Map();
    uniquePlayerKeys.forEach((key, idx) => {
        playerAliasMap.set(key, `Cá nhân ${formatThreeDigitCode(playerCodePool, idx)}`);
    });

    const maskedPairs = (pairRows || []).map((row, idx) => {
        const alias = pairAliasMap.get(getPairKey(row, idx)) || `Cặp đôi ${String(100 + idx)}`;
        return {
            ...row,
            pair: row.pair ? { id: `anon_pair_${idx + 1}`, team_id: 'anon', pair_label: '?' } : row.pair,
            team: { ...ANON_MASKED_TEAM },
            levelName: '?',
            playersText: alias
        };
    });

    const maskPlayerRow = (row, idx) => {
        const alias = playerAliasMap.get(getPlayerKey(row, idx)) || `Cá nhân ${String(100 + idx)}`;
        return {
            ...row,
            key: `anon_player_${idx + 1}`,
            name: alias,
            team: { ...ANON_MASKED_TEAM },
            pairLabel: '?',
            levelLabel: '?',
            matchLogs: []
        };
    };

    return {
        pairRows: maskedPairs,
        playerBoard: {
            players: (playerBoard.players || []).map(maskPlayerRow),
            byPoints: (playerBoard.byPoints || []).map(maskPlayerRow),
            byErrors: (playerBoard.byErrors || []).map(maskPlayerRow),
            hasAnyStats: Boolean(playerBoard.hasAnyStats)
        }
    };
}

/**
 * Generates a balanced Round-Robin schedule using the Circle Method.
 * For 4 teams [A, B, C, D], matches the infographic order:
 *   Vòng 1: A vs B | C vs D
 *   Vòng 2: A vs C | B vs D
 *   Vòng 3: A vs D | B vs C
 */
export function generateRoundRobinSchedule(teams, teamPairs, options = {}) {
    const orderedTeams = [...(teams || [])].sort((a, b) => (a.seed_order ?? 0) - (b.seed_order ?? 0));
    const n = orderedTeams.length;
    if (n < 2) {
        return { teamMatches: [], subMatches: [] };
    }

    const levelsCount = Math.max(1, Number(options.levelsCount) || 3);
    const doubleRR = Boolean(options.doubleRoundRobin);
    const tournamentId = options.tournamentId || 'main';
    const startSort = Number(options.startSortOrder) || 1;
    const levelOrderA = normalizeLevelOrder(options.levelOrderA ?? options.levelOrder, levelsCount);
    const levelOrderB = normalizeLevelOrder(options.levelOrderB ?? options.levelOrderA ?? options.levelOrder, levelsCount);

    // Reverse the rotating tail so Round 1 pairs adjacent seeds (A vs B, C vs D for 4 teams)
    const circle = [orderedTeams[0], ...orderedTeams.slice(1).reverse()];
    if (circle.length % 2 === 1) {
        circle.push(null); // BYE
    }

    const m = circle.length;
    const roundsPerLeg = m - 1;
    const half = m / 2;

    const pairLookup = new Map();
    for (const p of teamPairs || []) {
        pairLookup.set(`${p.team_id}:${p.level_index}`, p.id);
    }

    const teamMatches = [];
    const subMatches = [];
    let sortCounter = startSort;

    const createLeg = (legIndex) => {
        const list = [...circle];
        for (let r = 0; r < roundsPerLeg; r++) {
            const roundNumber = legIndex * roundsPerLeg + (r + 1);
            const roundName = `Vòng ${roundNumber}`;
            const pairings = [];

            for (let i = 0; i < half; i++) {
                const t1 = list[i];
                const t2 = list[m - 1 - i];
                if (!t1 || !t2) continue;

                // Keep lower seed on left in Leg 1, swap in Leg 2
                let left = t1;
                let right = t2;
                if (legIndex === 0 && (left.seed_order ?? 0) > (right.seed_order ?? 0)) {
                    [left, right] = [right, left];
                } else if (legIndex === 1) {
                    if ((left.seed_order ?? 0) < (right.seed_order ?? 0)) {
                        [left, right] = [right, left];
                    }
                }
                pairings.push([left, right]);
            }

            // Sort pairings within a round cleanly by first team's seed_order
            pairings.sort((a, b) => (a[0].seed_order ?? 0) - (b[0].seed_order ?? 0));

            pairings.forEach(([teamA, teamB], idx) => {
                const tmId = `tm_rr_r${roundNumber}_${teamA.code}_${teamB.code}_${Date.now().toString(36)}_${sortCounter}`;
                teamMatches.push({
                    id: tmId,
                    tournament_id: tournamentId,
                    round_number: roundNumber,
                    round_name: roundName,
                    stage: 'round_robin',
                    team_a_id: teamA.id,
                    team_b_id: teamB.id,
                    court: `Sân ${idx + 1}`,
                    scheduled_time: '',
                    status: 'upcoming',
                    sort_order: sortCounter++,
                    note: ''
                });

                const matchSubs = buildTeamMatchSubMatches(tmId, teamA.id, teamB.id, pairLookup, {
                    levelsCount,
                    levelOrderA,
                    levelOrderB
                });
                subMatches.push(...matchSubs);
            });

            // Rotate circle[1..m-1]
            const last = list[m - 1];
            for (let k = m - 1; k > 1; k--) {
                list[k] = list[k - 1];
            }
            list[1] = last;
        }
    };

    createLeg(0);
    if (doubleRR) {
        createLeg(1);
    }

    return { teamMatches, subMatches };
}

/**
 * Resizes teams and fixed lineup pairs while preserving existing names/players.
 */
export function buildResizedRoster(existingTeams, existingPairs, targetTeamCount, targetLevelsCount, tournamentId = 'main') {
    const safeTeamCount = Math.max(2, Math.min(16, Number(targetTeamCount) || 4));
    const safeLevelsCount = Math.max(1, Math.min(8, Number(targetLevelsCount) || 3));

    const sortedTeams = [...(existingTeams || [])].sort((a, b) => (a.seed_order ?? 0) - (b.seed_order ?? 0));
    const pairMap = new Map();
    for (const p of existingPairs || []) {
        pairMap.set(`${p.team_id}:${p.level_index}`, p);
    }

    const nextTeams = [];
    const nextPairs = [];

    for (let i = 0; i < safeTeamCount; i++) {
        const existing = sortedTeams[i];
        const code = getTeamCode(i);
        const teamId = existing?.id || `team_${code.toLowerCase()}_${Date.now().toString(36)}_${i}`;

        const team = {
            id: teamId,
            tournament_id: tournamentId,
            code: existing?.code || code,
            name: existing?.name || `Team ${code}`,
            color: existing?.color || TEAM_COLOR_PALETTE[i % TEAM_COLOR_PALETTE.length],
            seed_order: i + 1
        };
        nextTeams.push(team);

        for (let lvl = 1; lvl <= safeLevelsCount; lvl++) {
            const existingPair = pairMap.get(`${team.id}:${lvl}`);
            nextPairs.push({
                id: existingPair?.id || `pair_${team.id}_l${lvl}`,
                team_id: team.id,
                level_index: lvl,
                pair_label: existingPair?.pair_label || getPairLabel(team.code, lvl),
                player_1: existingPair?.player_1 ?? `Người chơi ${team.code}${lvl}-1`,
                player_2: existingPair?.player_2 ?? `Người chơi ${team.code}${lvl}-2`
            });
        }
    }

    return { teams: nextTeams, teamPairs: nextPairs };
}
