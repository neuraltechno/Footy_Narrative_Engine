import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import fs from 'fs';
import path from 'path';
import RankingMomentum from '../components/RankingMomentum';
import RoundHistoryChart from '../components/RoundHistoryChart';
import SiteHeader from '../components/SiteHeader';

const ITEMS_PER_PAGE = 24;

// Two-tier position relationship mapping matching process_stats.R outputs
const POSITION_STRUCTURE = {
  All: [],
  Backs: ['Key Backs', 'General Backs'],
  Midfield: ['Midfield'],
  Ruck: [],
  Forwards: ['Key Forwards', 'General Forwards'],
  Interchange: []
} as const;

type PositionLine = keyof typeof POSITION_STRUCTURE;

// Computes tier cutoffs from whatever slice of players is passed in. Called
// once per position group so a small forward isn't measured against a
// ruckman's contest numbers - see getStatTier below.
const calculateThresholds = (players: any[], statKey: string, isNegativeMetric = false) => {
  const values = players.map((p) => p[statKey] || 0).sort((a, b) => (isNegativeMetric ? a - b : b - a));
  const n = values.length;
  if (n === 0) return { unicorn: 0, elite: 0, aflStandard: 0, stateLeague: 0 };
  return {
    unicorn: values[Math.floor(n * 0.01)],
    elite: values[Math.floor(n * 0.12)],
    aflStandard: values[Math.floor(n * 0.65)],
    stateLeague: values[Math.floor(n * 0.90)],
  };
};

const getStatTier = (statKey: string, val: number, thresholdsForGroup: any) => {
  const t = thresholdsForGroup?.[statKey];
  if (!t) return { label: '—', color: 'text-[var(--slate)]' };

  if (statKey === 'Avg_PIR_Negative') {
    if (val <= t.unicorn) return { label: 'Pristine', color: 'text-[var(--fern-light)]' };
    if (val <= t.elite) return { label: 'Clean', color: 'text-[var(--fern-light)]' };
    if (val <= t.aflStandard) return { label: 'Average', color: 'text-[var(--slate)]' };
    if (val <= t.stateLeague) return { label: 'Loose', color: 'text-[var(--oxblood-light)]' };
    return { label: 'Costly', color: 'text-[var(--oxblood)]' };
  }

  if (val >= t.unicorn) return { label: 'Unicorn', color: 'text-[var(--brass-bright)]' };
  if (val >= t.elite) return { label: 'Elite', color: 'text-[var(--brass)]' };
  if (val >= t.aflStandard) return { label: 'AFL Standard', color: 'text-[var(--fern-light)]' };
  if (val >= t.stateLeague) return { label: 'State League', color: 'text-[var(--slate)]' };
  return { label: 'Local Footy', color: 'text-[var(--slate)]' };
};

function PlayerPhoto({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !src) {
    return (
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-sm border border-[var(--hairline)] bg-[var(--ink)] font-mono text-[9px] text-[var(--slate)]">
        N/A
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-16 w-16 shrink-0 rounded-sm border border-[var(--hairline)] bg-[var(--ink)] object-cover"
    />
  );
}

function DnpStamp({ roundsSince }: { roundsSince: number }) {
  const text = roundsSince === 1 ? 'OUT LAST ROUND' : `OUT ${roundsSince} ROUNDS`;
  return (
    <span
      className="inline-block select-none rounded-sm border-[1.5px] border-[var(--oxblood-light)] px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.14em] text-[var(--oxblood-light)]"
      style={{ transform: 'rotate(-2deg)' }}
      title="Rank may have moved purely because other players took the field, not this player's form"
    >
      {text}
    </span>
  );
}

const PlayerCard = ({ player, rank, thresholdsForGroup, isExpanded, onToggle, totalEligiblePlayers }: { player: any; rank: number; thresholdsForGroup: any; isExpanded: boolean; onToggle: () => void; totalEligiblePlayers: number }) => {
  const [viewMode, setViewMode] = useState<'season' | 'latest'>('season');

  const gamesPlayed = player.Games_Played_2026 || 0;
  const positionDisplay = player.playerPosition
    ? `${player.playerPosition} · ${player.playerGroup || 'Utility'}`
    : 'Utility';

  const roundHistory = player.PIR_History || [];
  const hasLatestGame = player.Latest_Round_PIR && player.Latest_Round_PIR > 0;
  const playedLatestRound = player.Played_Latest_Round !== false;

  const rawStats = [
    { key: 'Avg_cat_disposal', label: 'Disposal', seasonVal: player.Avg_cat_disposal || 0 },
    { key: 'Avg_cat_contest_clearance', label: 'Contest/Clearance', seasonVal: player.Avg_cat_contest_clearance || 0 },
    { key: 'Avg_cat_damaging_impact', label: 'Damaging Impact', seasonVal: player.Avg_cat_damaging_impact || 0 },
    { key: 'Avg_cat_defensive_grit', label: 'Defensive Grit', seasonVal: player.Avg_cat_defensive_grit || 0 },
    { key: 'Avg_cat_ruck', label: 'Ruck', seasonVal: player.Avg_cat_ruck || 0 },
    { key: 'Avg_PIR_Negative', label: 'Negative Drag', seasonVal: player.Avg_PIR_Negative || 0, isNegative: true },
  ];

  const stats = rawStats.map((stat) => {
    let latestVal = 0;
    if (hasLatestGame) {
      // Approximation: the backend stores season-level category averages,
      // not a per-category breakdown of the latest round in isolation. We
      // scale the season shape by how the latest PIR compares to the season
      // average, which tracks direction and rough magnitude without
      // claiming false precision.
      const scalar = player.Latest_Round_PIR / (player.Season_Avg_PIR || 100);
      latestVal = (stat.seasonVal || 0) * scalar;
      if (stat.key === 'Avg_cat_ruck' && (stat.seasonVal || 0) < 1) latestVal = 0;
      if (latestVal < 0) latestVal = 0;
    }

    const currentVal = viewMode === 'latest' && hasLatestGame ? latestVal : (stat.seasonVal || 0);
    const delta = hasLatestGame ? latestVal - (stat.seasonVal || 0) : 0;
    const showTag = !(stat.key === 'Avg_cat_ruck' && currentVal <= 0);
    const tier = showTag ? getStatTier(stat.key, currentVal, thresholdsForGroup) : null;

    return {
      ...stat,
      currentVal: typeof currentVal === 'number' ? currentVal : 0,
      delta: typeof delta === 'number' ? delta : 0,
      tier,
      showTag,
    };
  });

  // Significant_Strengths comes back from R as {} rather than [] when empty
  // (an artifact of how jsonlite serializes a zero-row data frame)
  const topStrengths = Array.isArray(player?.Significant_Strengths) ? player.Significant_Strengths : [];

  return (
    <div
      className={`relative flex flex-col justify-between overflow-hidden rounded-sm border border-[var(--hairline)] bg-[var(--panel)] p-5 shadow-lg transition-colors hover:bg-[var(--panel-hover)] ${!isExpanded ? 'cursor-pointer' : ''}`}
      onClick={onToggle}
    >
      {/* Ranking & Games Badge */}
      <div className="absolute right-0 top-0 flex items-center overflow-hidden rounded-bl-sm border-b border-l border-[var(--hairline)] bg-[var(--ink)]/60">
        <span className="border-r border-[var(--hairline)] px-2 py-1 font-mono text-[10px] font-bold text-[var(--slate)]">
          {gamesPlayed} GP
        </span>
        {rank > 0 && rank !== 9999 && (
          <span className="bg-[var(--brass)] px-3 py-1 font-mono text-xs font-bold text-[var(--ink)]">
            №{String(rank).padStart(3, '0')}
          </span>
        )}
      </div>

      <div>
        <div className="flex items-start gap-4">
          <PlayerPhoto src={player.photoURL} alt={`${player['player.givenName']} ${player['player.surname']}`} />
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 truncate font-mono text-xs font-bold uppercase tracking-wider text-[var(--slate)]">
              {player['team.name']} · #{player.playerJumperNumber}
            </div>
            <h3 className="font-display truncate text-lg font-semibold leading-snug text-[var(--parchment)]">
              {player['player.givenName']} {player['player.surname']}
            </h3>
            <p className="text-xs font-medium text-[var(--slate)]">{positionDisplay}</p>
            <p className="font-mono text-[11px] text-[var(--slate)]">
              {player.Age} yrs · {player.heightInCm} · {player.weightInKg}
            </p>
            <div className="mt-1 font-mono text-[10px] text-[var(--slate)]">
              {player.careerGames || 0} games · {player.careerWins || 0}W / {player.careerDraws || 0}D / {player.careerLosses || 0}L
              {' '}({player.careerGames && player.careerGames > 0 ? ((player.careerWins / player.careerGames) * 100).toFixed(0) : 0}%)
            </div>
          </div>
        </div>

        {!playedLatestRound && (
          <div className="mt-3">
            <DnpStamp roundsSince={player.Rounds_Since_Last_Game || 1} />
          </div>
        )}
      </div>

      {/* Primary Toggle & Main PIR display */}
      <div className="my-3 rounded-sm border border-[var(--hairline)] bg-[var(--ink)]/60 p-3" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex rounded-sm border border-[var(--hairline)] bg-[var(--panel)] p-0.5">
            <button
              onClick={() => setViewMode('season')}
              className={`rounded-sm px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-all ${
                viewMode === 'season' ? 'bg-[var(--hairline)] text-[var(--parchment)]' : 'text-[var(--slate)] hover:text-[var(--parchment)]'
              }`}
            >
              Season
            </button>
            <button
              onClick={() => { if (hasLatestGame) setViewMode('latest'); }}
              disabled={!hasLatestGame}
              className={`rounded-sm px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-all ${
                !hasLatestGame
                  ? 'cursor-not-allowed opacity-30'
                  : viewMode === 'latest'
                  ? 'bg-[var(--brass)] text-[var(--ink)]'
                  : 'text-[var(--slate)] hover:text-[var(--parchment)]'
              }`}
              title={!hasLatestGame ? 'Did not play in latest round' : undefined}
            >
              Latest
            </button>
          </div>
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--slate)]">
            {viewMode === 'season' ? 'Season Avg' : 'Latest Round'}
          </span>
        </div>

        <div className="flex items-end justify-between">
          <div className="flex items-end gap-4">
            <div>
              <div className="mb-0.5 font-mono text-[10px] text-[var(--slate)]">Impact Rating</div>
              <div className={`font-display text-2xl font-semibold ${viewMode === 'latest' ? 'text-[var(--brass)]' : 'text-[var(--parchment)]'}`}>
                {viewMode === 'season'
                  ? (player.Season_Avg_PIR != null ? player.Season_Avg_PIR.toFixed(1) : '0.0')
                  : (player.Latest_Round_PIR != null ? player.Latest_Round_PIR.toFixed(1) : '0.0')}
              </div>
            </div>

            <div className="flex items-center gap-1.5 pb-0.5">
              <div className="flex flex-col rounded-sm border border-[var(--hairline)] bg-[var(--panel)]/60 px-2 py-0.5 font-mono text-[9px] leading-tight">
                <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--slate)]">High</span>
                <span className="font-bold text-[var(--fern-light)]">{player.Max_PIR != null ? player.Max_PIR.toFixed(1) : '0.0'}</span>
              </div>
              <div className="flex flex-col rounded-sm border border-[var(--hairline)] bg-[var(--panel)]/60 px-2 py-0.5 font-mono text-[9px] leading-tight">
                <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--slate)]">Low</span>
                <span className="font-bold text-[var(--oxblood-light)]">{player.Min_PIR != null ? player.Min_PIR.toFixed(1) : '0.0'}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-0.5 rounded-sm border border-[var(--hairline)] bg-[var(--panel)]/80 px-2 py-1 text-right">
            {player.Trend === 'up' && (
              <div className="flex items-center gap-0.5 font-mono text-xs font-bold text-[var(--fern-light)]">
                <span>▲</span><span>{player.Rank_Delta > 0 ? `+${player.Rank_Delta}` : player.Rank_Delta}</span>
              </div>
            )}
            {player.Trend === 'down' && (
              <div className="flex items-center gap-0.5 font-mono text-xs font-bold text-[var(--oxblood-light)]">
                <span>▼</span><span>{player.Rank_Delta}</span>
              </div>
            )}
            {player.Trend === 'stable' && <span className="font-mono text-xs font-bold text-[var(--slate)]">—</span>}
            {!playedLatestRound && player.Rank_Delta !== 0 && (
              <span className="font-mono text-[7px] uppercase tracking-wide text-[var(--slate)]">while sidelined</span>
            )}
          </div>
        </div>
      </div>

      <div className="-mt-2 mb-2 text-center font-mono text-[10px] font-bold text-[var(--slate)] opacity-70">
        {isExpanded ? '▲ Close File' : '▼ Open File'}
      </div>

      {isExpanded && (
        <>
          {/* Significant Strengths */}
          <div className="mb-4 rounded-sm border border-[var(--fern-light)]/20 bg-[var(--fern-light)]/5 p-2.5">
            <div className="mb-1 flex items-baseline justify-between">
              <div className="font-mono text-[9px] font-black uppercase tracking-wider text-[var(--fern-light)]">
                Standout Categories
              </div>
              <div className="font-mono text-[8px] uppercase tracking-wide text-[var(--slate)]">
                vs {player.playerGroup || 'position'} peers
              </div>
            </div>
            <div className="space-y-1">
              {topStrengths.length > 0 ? (
                topStrengths.map((str: any) => (
                  <div key={str.category} className="flex justify-between text-xs text-[var(--parchment)]">
                    <span className="text-[var(--slate)]">⚡ {str.category}</span>
                    <span className="font-mono font-extrabold text-[var(--fern-light)]">
                      +{typeof str.value === 'number' ? str.value.toFixed(1) : '0.0'}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-xs italic text-[var(--slate)]">No categories above his position's average yet</div>
              )}
            </div>
          </div>

          {roundHistory.length > 0 && (
            <RankingMomentum
              rankHistory={roundHistory}
              currentRank={rank}
              momentum={player.Trend}
              totalEligiblePlayers={totalEligiblePlayers}
            />
          )}

          <RoundHistoryChart roundHistory={roundHistory} />

          {/* Stat Breakdown */}
          <div className="mt-2 space-y-2 border-t border-[var(--hairline)] pt-3">
            <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--slate)]">PIR Breakdown</div>
            {stats.map((stat) => (
              <div key={stat.label} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-[var(--slate)]">{stat.label}</span>
                  {stat.showTag && stat.tier && (
                    <span className={`rounded-sm bg-[var(--ink)]/60 px-1.5 py-0.5 font-mono text-[8px] font-black uppercase tracking-widest ${stat.tier.color}`}>
                      {stat.tier.label}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 font-mono">
                  {viewMode === 'latest' && hasLatestGame && (
                    <span className={`text-[10px] font-bold ${
                      stat.delta != null && stat.delta >= 0
                        ? stat.isNegative ? 'text-[var(--oxblood-light)]/80' : 'text-[var(--fern-light)]/80'
                        : stat.isNegative ? 'text-[var(--fern-light)]/80' : 'text-[var(--oxblood-light)]/80'
                    }`}>
                      {typeof stat.delta === 'number' ? (stat.delta >= 0 ? '+' : '') + stat.delta.toFixed(1) : '0.0'}
                    </span>
                  )}
                  <span className={`${stat.isNegative ? 'text-[var(--oxblood-light)]' : 'text-[var(--parchment)]'} font-semibold`}>
                    {typeof stat.currentVal === 'number'
                      ? (stat.isNegative ? `-${stat.currentVal.toFixed(1)}` : stat.currentVal.toFixed(1))
                      : '0.0'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

function HighlightCard({ eyebrow, name, detail, tone }: { eyebrow: string; name: string; detail: string; tone: 'brass' | 'oxblood' | 'fern' }) {
  const border = {
    brass: 'border-[var(--brass)]',
    oxblood: 'border-[var(--oxblood-light)]',
    fern: 'border-[var(--fern-light)]',
  }[tone];
  return (
    <div className={`rounded-sm border-l-2 bg-[var(--panel)] px-4 py-3 ${border}`}>
      <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--slate)]">{eyebrow}</div>
      <div className="font-display mt-1 text-lg font-medium text-[var(--parchment)]">{name}</div>
      <div className="font-mono text-xs text-[var(--slate)]">{detail}</div>
    </div>
  );
}

const PlayersPage = ({ allPlayersData, currentSeason }: { allPlayersData: any[]; currentSeason: string }) => {
  const [isClient, setIsClient] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [lineFilter, setLineFilter] = useState<PositionLine>('All');
  const [groupFilter, setGroupFilter] = useState<string>('All');
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  const toggleCard = (id: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  useEffect(() => { setIsClient(true); }, []);

  const handleLineChange = (line: PositionLine) => {
    setLineFilter(line);
    setGroupFilter('All');
    setCurrentPage(1);
  };

  const eligibleSeasonPlayers = useMemo(
    () => allPlayersData.filter((p: any) => (p.Games_Played_2026 || 0) >= 3),
    [allPlayersData]
  );

  const latestRound = useMemo(() => {
    let max = 0;
    allPlayersData.forEach((p: any) => {
      (p.PIR_History || []).forEach((h: any) => { if (h.round > max) max = h.round; });
    });
    return max;
  }, [allPlayersData]);

  // Tier thresholds computed PER POSITION GROUP - a small forward's "Elite"
  // disposal number and a ruckman's "Elite" disposal number are different
  // numbers, because they're being measured against different peers.
  const thresholdsByGroup = useMemo(() => {
    const groups = Array.from(new Set(eligibleSeasonPlayers.map((p: any) => p.playerGroup)));
    const result: Record<string, any> = {};
    groups.forEach((g) => {
      const groupPlayers = eligibleSeasonPlayers.filter((p: any) => p.playerGroup === g);
      result[g] = {
        Avg_cat_disposal: calculateThresholds(groupPlayers, 'Avg_cat_disposal'),
        Avg_cat_contest_clearance: calculateThresholds(groupPlayers, 'Avg_cat_contest_clearance'),
        Avg_cat_damaging_impact: calculateThresholds(groupPlayers, 'Avg_cat_damaging_impact'),
        Avg_cat_defensive_grit: calculateThresholds(groupPlayers, 'Avg_cat_defensive_grit'),
        Avg_cat_ruck: calculateThresholds(groupPlayers, 'Avg_cat_ruck'),
        Avg_PIR_Negative: calculateThresholds(groupPlayers, 'Avg_PIR_Negative', true),
      };
    });
    return result;
  }, [eligibleSeasonPlayers]);

  const filteredPlayers = useMemo(() => {
    return eligibleSeasonPlayers
      .filter((player: any) => {
        const fullName = `${player['player.givenName']} ${player['player.surname']}`.toLowerCase();
        const team = (player['team.name'] || '').toLowerCase();
        const search = searchTerm.toLowerCase();
        const matchesSearch = fullName.includes(search) || team.includes(search);
        const matchesLine = lineFilter === 'All' || player.playerLine === lineFilter;
        const matchesGroup = groupFilter === 'All' || player.playerGroup === groupFilter;
        return matchesSearch && matchesLine && matchesGroup;
      })
      .sort((a: any, b: any) => (b.Season_Avg_PIR || 0) - (a.Season_Avg_PIR || 0));
  }, [eligibleSeasonPlayers, searchTerm, lineFilter, groupFilter]);

  // ── Editorial highlights ────────────────────────────────────────────
  const seasonLeader = useMemo(
    () => (eligibleSeasonPlayers.length ? eligibleSeasonPlayers.reduce((a: any, b: any) => (b.Season_Avg_PIR > a.Season_Avg_PIR ? b : a)) : null),
    [eligibleSeasonPlayers]
  );
  const ironLedger = useMemo(() => {
    const durable = allPlayersData.filter((p: any) => (p.Games_Played_2026 || 0) >= 8);
    return durable.length ? durable.reduce((a: any, b: any) => (b.Min_PIR > a.Min_PIR ? b : a)) : null;
  }, [allPlayersData]);
  const fastestRiser = useMemo(() => {
    // Only considers players who actually played the latest round, so a
    // "riser" is always a real form move, never inactivity-driven drift.
    const movers = eligibleSeasonPlayers.filter((p: any) => p.Trend === 'up' && p.Played_Latest_Round !== false);
    return movers.length ? movers.reduce((a: any, b: any) => (b.Rank_Delta > a.Rank_Delta ? b : a)) : null;
  }, [eligibleSeasonPlayers]);

  if (!isClient) return null;

  const totalItems = filteredPlayers.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
  const activePage = Math.min(currentPage, totalPages);
  const startIndex = (activePage - 1) * ITEMS_PER_PAGE;
  const paginatedPlayers = filteredPlayers.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  const availableSubGroups = POSITION_STRUCTURE[lineFilter];

  return (
    <>
      

      <main className="font-body min-h-screen bg-[var(--ink)] px-6 py-12 text-[var(--parchment)] sm:px-10 lg:px-16">
        <div className="mx-auto max-w-7xl">
          
                    <SiteHeader />
          
          {/* ── Header ───────────────────────────────────────────── */}
          <header className="mb-10 border-b border-[var(--hairline)] pb-8">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 font-mono text-[11px] tracking-[0.25em] text-[var(--brass)]">
                <span className="inline-block h-px w-8 bg-[var(--brass)]" />
                PLAYER LEDGER · {currentSeason} SEASON · THROUGH ROUND {latestRound}
              </div>
              <Link href="/" className="font-mono text-xs font-semibold text-[var(--brass)] hover:underline whitespace-nowrap">
                ← Back to Dashboard
              </Link>
            </div>
            <h1 className="font-display text-4xl font-semibold tracking-tight text-[var(--parchment)] sm:text-5xl">
              The Impact Ledger
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--slate)]">
              Every player who's taken the park this season, scored on a single Impact Rating that weighs winning
              the contest — a contested mark, a spoil, an intercept — as heavily as clean disposal. Rucks and key
              defenders show up here as often as midfielders do; that's the system working as intended, not a quirk.
            </p>
          </header>

          {/* ── Case highlights ─────────────────────────────────── */}
          <section className="mb-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {seasonLeader && (
              <HighlightCard
                eyebrow="Season Leader"
                name={`${seasonLeader['player.givenName'].charAt(0)}. ${seasonLeader['player.surname']}`}
                detail={`${seasonLeader.Season_Avg_PIR.toFixed(1)} avg · ${seasonLeader.playerGroup}`}
                tone="brass"
              />
            )}
            {ironLedger ? (
              <HighlightCard
                eyebrow="Iron Ledger (Highest Floor)"
                name={`${ironLedger['player.givenName'].charAt(0)}. ${ironLedger['player.surname']}`}
                detail={`Never below ${ironLedger.Min_PIR.toFixed(1)} · ${ironLedger.Games_Played_2026} games`}
                tone="fern"
              />
            ) : (
              <HighlightCard eyebrow="Iron Ledger (Highest Floor)" name="—" detail="Not enough games played yet" tone="fern" />
            )}
            {fastestRiser ? (
              <HighlightCard
                eyebrow="Fastest Riser This Round"
                name={`${fastestRiser['player.givenName'].charAt(0)}. ${fastestRiser['player.surname']}`}
                detail={`+${fastestRiser.Rank_Delta} places · ${fastestRiser.playerGroup}`}
                tone="oxblood"
              />
            ) : (
              <HighlightCard eyebrow="Fastest Riser This Round" name="—" detail="No confirmed risers this round" tone="oxblood" />
            )}
          </section>

          {/* ── Controls ─────────────────────────────────────────── */}
          <div className="mb-6 flex flex-col gap-3 border-b border-[var(--hairline)] pb-6 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <input
              type="text"
              placeholder="Search players or teams…"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="w-full max-w-xs rounded-sm border border-[var(--hairline)] bg-[var(--panel)] px-3 py-2 font-mono text-xs text-[var(--parchment)] placeholder-[var(--slate)] focus:border-[var(--brass)] focus:outline-none"
            />

            <div className="flex flex-wrap items-center gap-3">
              <button onClick={() => setExpandedCards(new Set(paginatedPlayers.map((p: any) => p['player.playerId'])))} className="font-mono text-xs font-bold text-[var(--slate)] hover:text-[var(--brass)]">
                Open All
              </button>
              <button onClick={() => setExpandedCards(new Set())} className="font-mono text-xs font-bold text-[var(--slate)] hover:text-[var(--brass)]">
                Close All
              </button>

              <select
                value={lineFilter}
                onChange={(e) => handleLineChange(e.target.value as PositionLine)}
                className="rounded-sm border border-[var(--hairline)] bg-[var(--panel)] px-3 py-2 font-mono text-xs text-[var(--parchment)] focus:border-[var(--brass)] focus:outline-none"
              >
                {(Object.keys(POSITION_STRUCTURE) as PositionLine[]).map((line) => (
                  <option key={line} value={line}>{line === 'All' ? 'All Positions' : line}</option>
                ))}
              </select>

              {availableSubGroups.length > 0 && (
                <select
                  value={groupFilter}
                  onChange={(e) => { setGroupFilter(e.target.value); setCurrentPage(1); }}
                  className="rounded-sm border border-[var(--hairline)] bg-[var(--panel)] px-3 py-2 font-mono text-xs text-[var(--parchment)] focus:border-[var(--brass)] focus:outline-none"
                >
                  <option value="All">All {lineFilter}</option>
                  {availableSubGroups.map((group) => (
                    <option key={group} value={group}>{group}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* ── Ledger grid ──────────────────────────────────────── */}
          {paginatedPlayers.length > 0 ? (
            <div className="mb-8 grid grid-cols-1 items-start gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {paginatedPlayers.map((player: any) => {
                const isEligible = (player.Games_Played_2026 || 0) >= 3;
                const lastHistoryEntry = player.PIR_History && player.PIR_History.length > 0 ? player.PIR_History[player.PIR_History.length - 1] : null;
                const displayRank = lastHistoryEntry && isEligible ? lastHistoryEntry.rank : 9999;
                const playerId = player['player.playerId'];

                return (
                  <PlayerCard
                    key={playerId}
                    player={player}
                    rank={displayRank}
                    thresholdsForGroup={thresholdsByGroup[player.playerGroup] || {}}
                    isExpanded={expandedCards.has(playerId)}
                    onToggle={() => toggleCard(playerId)}
                    totalEligiblePlayers={eligibleSeasonPlayers.length}
                  />
                );
              })}
            </div>
          ) : (
            <div className="rounded-sm border border-dashed border-[var(--hairline)] px-6 py-16 text-center">
              <p className="font-mono text-xs uppercase tracking-wide text-[var(--slate)]">No open files match the current filters.</p>
            </div>
          )}

          {/* ── Pagination ───────────────────────────────────────── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-[var(--hairline)] pt-6">
              <div className="font-mono text-xs text-[var(--slate)]">
                Showing <span className="font-semibold text-[var(--parchment)]">{startIndex + 1}</span> to{' '}
                <span className="font-semibold text-[var(--parchment)]">{Math.min(startIndex + ITEMS_PER_PAGE, totalItems)}</span>{' '}
                of <span className="font-semibold text-[var(--parchment)]">{totalItems}</span> players
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={activePage === 1}
                  className="rounded-sm border border-[var(--hairline)] px-4 py-2 font-mono text-xs font-semibold text-[var(--parchment)] transition-colors hover:border-[var(--brass)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <div className="flex items-center px-4 font-mono text-xs text-[var(--slate)]">
                  Page {activePage} of {totalPages}
                </div>
                <button
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={activePage === totalPages}
                  className="rounded-sm border border-[var(--hairline)] px-4 py-2 font-mono text-xs font-semibold text-[var(--parchment)] transition-colors hover:border-[var(--brass)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* ── Legend ───────────────────────────────────────────── */}
          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 border-t border-[var(--hairline)] pt-6 font-mono text-[10px] uppercase tracking-wide text-[var(--slate)]">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--brass-bright)]" /> Unicorn = top 1% for that position</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--brass)]" /> Elite = top 12% for that position</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--oxblood-light)]" /> OUT stamp = missed the most recent round; any rank move that round reflects other players' form, not his</span>
            <span>Standout Categories and stat tiers are measured against a player's own position group, not the whole league.</span>
          </div>
        </div>
      </main>
    </>
  );
};

export async function getServerSideProps() {
  const configPath = path.join(process.cwd(), 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const currentSeason = config.CURRENT_SEASON;

  const playersPath = path.join(process.cwd(), 'json', currentSeason, 'players', 'players_pir.json');
  const playersData = JSON.parse(fs.readFileSync(playersPath, 'utf8'));

  return {
    props: {
      allPlayersData: playersData,
      currentSeason,
    },
  };
}

export default PlayersPage;