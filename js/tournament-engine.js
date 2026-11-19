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

/**
 * Groups matches by Court (PickleballBrackets Court Board style) showing Live, Next Up, and Completed counts.
 */
export function buildCourtBoard(teamMatches, subMatches, tournamentConfig) {
    const courtsMap = new Map();
    const sorted = [...(teamMatches || [])].sort((a, b) => (a.round_number ?? 1) - (b.round_number ?? 1) || (a.sort_order ?? 1) - (b.sort_order ?? 1));

    for (const tm of sorted) {
        const courtName = (tm.court || '').trim() || 'Chưa phân sân';
        if (!courtsMap.has(courtName)) {
            courtsMap.set(courtName, { court: courtName, live: [], upcoming: [], completed: [] });
        }
        const ev = evaluateTeamMatch(tm, subMatches, tournamentConfig);
        const bucket = courtsMap.get(courtName);
        if (ev.effectiveStatus === 'live') bucket.live.push({ tm, eval: ev });
        else if (ev.effectiveStatus === 'completed') bucket.completed.push({ tm, eval: ev });
        else bucket.upcoming.push({ tm, eval: ev });
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
