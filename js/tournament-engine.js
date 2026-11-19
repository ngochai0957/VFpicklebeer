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

export const DEFAULT_CONFIG = {
    bestOf: 3,
    pointsPerSet: 11,
    winByTwo: true,
    pointCap: 0,
    levelsCount: 3,
    levelNames: ['Level 1', 'Level 2', 'Level 3'],
    doubleRoundRobin: false
};

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

export function normalizeConfig(rawConfig) {
    const merged = { ...DEFAULT_CONFIG, ...(rawConfig || {}) };
    const levelsCount = Math.max(1, Math.min(8, Number(merged.levelsCount) || 3));
    const rawNames = Array.isArray(merged.levelNames) ? merged.levelNames : [];
    const levelNames = [];
    for (let i = 1; i <= levelsCount; i++) {
        const custom = typeof rawNames[i - 1] === 'string' ? rawNames[i - 1].trim() : '';
        levelNames.push(custom || `Level ${i}`);
    }
    return {
        bestOf: [1, 3, 5].includes(Number(merged.bestOf)) ? Number(merged.bestOf) : 3,
        pointsPerSet: Math.max(1, Number(merged.pointsPerSet) || 11),
        winByTwo: merged.winByTwo !== false,
        pointCap: Math.max(0, Number(merged.pointCap) || 0),
        levelsCount,
        levelNames,
        doubleRoundRobin: Boolean(merged.doubleRoundRobin)
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
    const allSlots = new Set([...orderA, ...orderB]);

    const rawServer = String(rawRally?.serverSlot || '');
    const serverSlot = allSlots.has(rawServer) ? rawServer : orderA[0];
    const serverSide = serverSlot.startsWith('a') ? 'a' : 'b';
    const serverOrder = serverSide === 'a' ? orderA : orderB;
    const oppOrder = serverSide === 'a' ? orderB : orderA;

    const rawReceiver = String(rawRally?.receiverSlot || '');
    const receiverSlot = oppOrder.includes(rawReceiver) ? rawReceiver : oppOrder[0];

    const serveTurn = serverOrder.length > 1 && Number(rawRally?.serveTurn) === 2 ? 2 : 1;
    return { serverSlot, receiverSlot, serveTurn, orderA, orderB };
}

/**
 * Swaps Position 1 (Right/Even) <-> Position 2 (Left/Odd) for a pair inside a Set.
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
        orderB: nextOrderB
    };
}

/**
 * Updates the active server or receiver role while keeping them on opposite sides.
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
        const nextReceiver = oppOrder[serverIdx] ?? oppOrder[0];
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

    return {
        ...cur,
        serverSlot: oppOrder[0],
        receiverSlot: serverOrder[0],
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
    if (!['server-ace', 'receiver-error', 'server-out', 'receiver-win'].includes(outcome)) {
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
    let nextRally = rally;

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

    if (outcome === 'server-ace') {
        statRow[rally.serverSlot].points = Math.min(99, statRow[rally.serverSlot].points + 1);
        setScore[serverSide] = Math.min(99, setScore[serverSide] + 1);
        nextRally = rotateServerAndReceiverOnScore();
    } else if (outcome === 'receiver-error') {
        statRow[rally.serverSlot].points = Math.min(99, statRow[rally.serverSlot].points + 1);
        statRow[rally.receiverSlot].errors = Math.min(99, statRow[rally.receiverSlot].errors + 1);
        setScore[serverSide] = Math.min(99, setScore[serverSide] + 1);
        nextRally = rotateServerAndReceiverOnScore();
    } else if (outcome === 'server-out') {
        statRow[rally.serverSlot].errors = Math.min(99, statRow[rally.serverSlot].errors + 1);
        nextRally = advanceRallyServeTurn(rally, pairA, pairB);
    } else if (outcome === 'receiver-win') {
        statRow[rally.receiverSlot].points = Math.min(99, statRow[rally.receiverSlot].points + 1);
        nextRally = advanceRallyServeTurn(rally, pairA, pairB);
    }

    return { statRow, setScore, rally: nextRally };
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

                for (let lvl = 1; lvl <= levelsCount; lvl++) {
                    subMatches.push({
                        id: `${tmId}_l${lvl}`,
                        team_match_id: tmId,
                        level_index: lvl,
                        pair_a_id: pairLookup.get(`${teamA.id}:${lvl}`) || null,
                        pair_b_id: pairLookup.get(`${teamB.id}:${lvl}`) || null,
                        sets: [{ a: 0, b: 0 }],
                        status: 'upcoming',
                        winner_override: null,
                        format_override: null
                    });
                }
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
                player_1: existingPair?.player_1 ?? `VĐV ${team.code}${lvl}-1`,
                player_2: existingPair?.player_2 ?? `VĐV ${team.code}${lvl}-2`
            });
        }
    }

    return { teams: nextTeams, teamPairs: nextPairs };
}
