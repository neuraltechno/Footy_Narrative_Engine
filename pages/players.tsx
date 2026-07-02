import React, { useEffect, useState, useMemo } from 'react';
import allPlayersData from '../json/players/players_pir.json';
import Link from 'next/link';
import RankingMomentum from '../components/RankingMomentum';
import RoundHistoryChart from '../components/RoundHistoryChart';

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

const calculateThresholds = (allPlayers: any[], statKey: string, isNegativeMetric = false) => {
  // Only use players with >= 3 games for threshold calculation
  const eligiblePlayers = allPlayers.filter(p => (p.Games_Played_2026 || 0) >= 3);
  const values = eligiblePlayers.map(p => p[statKey] || 0).sort((a, b) => isNegativeMetric ? a - b : b - a);
  const n = values.length;
  
  if (n === 0) return { unicorn: 0, elite: 0, aflStandard: 0, stateLeague: 0 };

  return {
    unicorn: values[Math.floor(n * 0.01)],
    elite: values[Math.floor(n * 0.12)],
    aflStandard: values[Math.floor(n * 0.65)],
    stateLeague: values[Math.floor(n * 0.90)],
  };
};

const getStatTier = (statKey: string, val: number, thresholds: any) => {
  const t = thresholds[statKey];
  if (!t) return { label: '-', color: 'text-zinc-600' };

  if (statKey === 'Avg_PIR_Negative') {
    if (val <= t.unicorn) return { label: 'Low', color: 'text-emerald-400' };
    if (val <= t.elite) return { label: 'Low', color: 'text-blue-400' };
    if (val <= t.aflStandard) return { label: 'Average', color: 'text-zinc-400' };
    if (val <= t.stateLeague) return { label: 'High', color: 'text-amber-400' };
    return { label: 'Very High', color: 'text-red-500' };
  }

  if (val >= t.unicorn) return { label: 'Unicorn', color: 'text-purple-400' };
  if (val >= t.elite) return { label: 'Elite', color: 'text-amber-400' };
  if (val >= t.aflStandard) return { label: 'AFL Standard', color: 'text-blue-400' };
  if (val >= t.stateLeague) return { label: 'State League', color: 'text-emerald-500' };
  return { label: 'Local Footy', color: 'text-zinc-600' };
};

const PlayerCard = ({ player, rank, filteredHistory, initialView = 'season', thresholds, isExpanded, onToggle }: { player: any; rank: number; filteredHistory: any[]; initialView?: 'season' | 'latest', thresholds: any, isExpanded: boolean, onToggle: () => void }) => {
  const [viewMode, setViewMode] = useState<'season' | 'latest'>(initialView);

  const gamesPlayed = player.Games_Played_2026 || 0;
  
  // Clean dynamic display representing the hierarchical status of the player
  const positionDisplay = player.playerPosition 
    ? `${player.playerPosition} (${player.playerGroup || 'Utility'})`
    : "Midfielder";

  const roundHistory = player.PIR_History || [];
  const hasLatestGame = player.Latest_Round_PIR && player.Latest_Round_PIR > 0;

  const rawStats = [
    { key: 'Avg_cat_disposal', label: 'Disposal', seasonVal: player.Avg_cat_disposal || 0 },
    { key: 'Avg_cat_contest_clearance', label: 'Contest/Clearance', seasonVal: player.Avg_cat_contest_clearance || 0 },
    { key: 'Avg_cat_damaging_impact', label: 'Damaging Impact', seasonVal: player.Avg_cat_damaging_impact || 0 },
    { key: 'Avg_cat_defensive_grit', label: 'Defensive Grit', seasonVal: player.Avg_cat_defensive_grit || 0 },
    { key: 'Avg_cat_ruck', label: 'Ruck', seasonVal: player.Avg_cat_ruck || 0 },
    { key: 'Avg_PIR_Negative', label: 'Negative Drag', seasonVal: player.Avg_PIR_Negative || 0, isNegative: true }
  ];

  const stats = rawStats.map((stat) => {
    let latestVal = 0;
    if (hasLatestGame) {
      const scalar = player.Latest_Round_PIR / (player.Season_Avg_PIR || 100);
      latestVal = (stat.seasonVal || 0) * scalar;
      if (stat.key === 'Avg_cat_ruck' && (stat.seasonVal || 0) < 1) latestVal = 0;
      if (latestVal < 0) latestVal = 0;
    }

    const currentVal = viewMode === 'latest' && hasLatestGame ? latestVal : (stat.seasonVal || 0);
    const delta = hasLatestGame ? latestVal - (stat.seasonVal || 0) : 0;
    const showTag = !(stat.key === 'Avg_cat_ruck' && currentVal <= 0);
    const tier = showTag ? getStatTier(stat.key, currentVal, thresholds) : null;

    return {
      ...stat,
      currentVal: typeof currentVal === 'number' ? currentVal : 0,
      delta: typeof delta === 'number' ? delta : 0,
      tier,
      showTag
    };
  });

  // Safely extract the pre-calculated strengths from your R backend JSON payload
  const topStrengths = player?.Significant_Strengths || [];

  return (
    <div 
      className={`bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-all flex flex-col justify-between shadow-lg relative overflow-hidden ${!isExpanded ? 'cursor-pointer' : ''}`}
      onClick={onToggle}
    >
      {/* Ranking & Games Badge */}
      <div className="absolute top-0 right-0 flex items-center bg-zinc-950/40 border-b border-l border-zinc-800 rounded-bl-lg overflow-hidden">
        <span className="text-[10px] font-bold text-zinc-400 px-2 py-1 border-r border-zinc-800 bg-zinc-900">
          {gamesPlayed} GP(2026)
        </span>
        {rank > 0 && rank !== 9999 && (
          <span className="bg-blue-600 text-white px-3 py-1 text-xs font-bold">
            #{rank}
          </span>
        )}
      </div>

      <div>
        <div className="flex gap-4 items-start">
          <img src={player.photoURL} alt={`${player['player.givenName']} ${player['player.surname']}`} className="w-16 h-16 rounded-lg bg-zinc-800 object-cover" />
          <div className="flex-1">
            <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-0.5">
              {player['team.name']} · #{player.playerJumperNumber}
            </div>
            <h3 className="text-lg font-bold text-white line-clamp-1 leading-snug">
              {player['player.givenName']} {player['player.surname']}
            </h3>
            <p className="text-xs text-zinc-400 font-medium">{positionDisplay}</p>
            <p className="text-xs text-zinc-500">{player.Age} yrs · {player.heightInCm}cm · {player.weightInKg}kg</p>
            <div className="text-[10px] text-zinc-500 mt-1">
              {player.careerGames || 0} Games · {player.careerWins}W / {player.careerDraws || 0}D / {player.careerLosses || 0}L ({player.careerGames && player.careerGames > 0 ? ((player.careerWins / player.careerGames) * 100).toFixed(0) : 0}%)
            </div>
          </div>
        </div>
      </div>

      {/* Primary Toggle & Main PIR display */}
      <div className="my-3 p-3 bg-zinc-950/50 rounded-lg border border-zinc-800/60" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-2.5">
          <div className="flex bg-zinc-900 p-0.5 rounded-md border border-zinc-800">
            <button
              onClick={() => setViewMode('season')}
              className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-all ${
                viewMode === 'season'
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Season
            </button>
            <button
              onClick={() => {
                if (hasLatestGame) setViewMode('latest');
              }}
              disabled={!hasLatestGame}
              className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-all ${
                !hasLatestGame
                  ? 'opacity-30 cursor-not-allowed'
                  : viewMode === 'latest'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title={!hasLatestGame ? "Did not play in latest round" : undefined}
            >
              Latest
            </button>
          </div>
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
            {viewMode === 'season' ? 'Season Avg' : 'Latest Round'}
          </span>
        </div>

        <div className="flex justify-between items-end">
          <div className="flex items-end gap-4">
            <div>
              <div className="text-[10px] text-zinc-400 mb-0.5">Impact Rating</div>
              <div className={`text-2xl font-black ${viewMode === 'latest' ? 'text-blue-400' : 'text-white'}`}>
                {viewMode === 'season'
                  ? (player.Season_Avg_PIR != null ? player.Season_Avg_PIR.toFixed(1) : "0.0")
                  : (player.Latest_Round_PIR != null ? player.Latest_Round_PIR.toFixed(1) : "0.0")
                }
              </div>
            </div>

            {/* High / Low Season Ranges Panel */}
            <div className="flex items-center gap-1.5 pb-0.5">
              <div className="flex flex-col bg-zinc-900/50 px-2 py-0.5 rounded border border-zinc-800/40 text-[9px] font-medium leading-tight">
                <span className="text-zinc-500 text-[8px] font-bold uppercase tracking-wider">High</span>
                <span className="text-emerald-400 font-bold">
                  {player.Max_PIR != null ? player.Max_PIR.toFixed(1) : "0.0"}
                </span>
              </div>
              <div className="flex flex-col bg-zinc-900/50 px-2 py-0.5 rounded border border-zinc-800/40 text-[9px] font-medium leading-tight">
                <span className="text-zinc-500 text-[8px] font-bold uppercase tracking-wider">Low</span>
                <span className="text-red-400 font-bold">
                  {player.Min_PIR != null ? player.Min_PIR.toFixed(1) : "0.0"}
                </span>
              </div>
            </div>
          </div>
          
          {/* Modernized Rank Momentum Indicator */}
          <div className="text-right flex items-center gap-1.5 bg-zinc-900/80 px-2 py-1 rounded border border-zinc-800/80">
            {player.Trend === 'up' && (
              <div className="flex items-center gap-0.5 font-bold text-xs text-emerald-400">
                <span>▲</span>
                <span>{player.Rank_Delta > 0 ? `+${player.Rank_Delta}` : player.Rank_Delta}</span>
              </div>
            )}
            {player.Trend === 'down' && (
              <div className="flex items-center gap-0.5 font-bold text-xs text-red-400">
                <span>▼</span>
                <span>{player.Rank_Delta}</span>
              </div>
            )}
            {player.Trend === 'stable' && (
              <span className="text-zinc-500 font-bold text-xs">—</span>
            )}
          </div>
        </div>
      </div>

      <div className="text-[10px] text-zinc-600 text-center -mt-2 mb-2 font-bold opacity-70">
        {isExpanded ? '▲ Collapse' : '▼ Expand'}
      </div>

      {isExpanded && (
        <>
          {/* Dynamic Key Strengths Highlight */}
          <div className="mb-4 bg-emerald-950/10 border border-emerald-500/10 rounded-lg p-2.5">
            <div className="flex items-baseline justify-between mb-1">
              <div className="text-[9px] uppercase tracking-wider text-emerald-400 font-black">
                Significant Strengths
              </div>
              <div className="text-[8px] tracking-wide text-zinc-500 uppercase font-medium">
                vs league mean
              </div>
            </div>
            
            <div className="space-y-1">
              {topStrengths.length > 0 ? (
                topStrengths.map((str) => (
                  <div key={str.category} className="text-xs flex justify-between text-zinc-300">
                    <span className="text-zinc-400">⚡ {str.category}</span>
                    <span className="font-extrabold text-emerald-400">
                      +{typeof str.value === 'number' ? str.value.toFixed(1) : "0.0"}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-xs text-zinc-500 italic">No metrics above league average</div>
              )}
            </div>
          </div>

          {/* PIR Trend Line Chart */}
          {filteredHistory.length > 0 && (
            <RankingMomentum 
              rankHistory={filteredHistory} 
              currentRank={rank} 
              momentum={player.Trend}
              totalEligiblePlayers={allPlayersData.filter((p: any) => (p.Games_Played_2026 || 0) >= 3).length}
            />
          )}

          {/* Interactive Sparkline / Round History Bar Chart */}
          <RoundHistoryChart roundHistory={roundHistory} />


          {/* Stat Breakdown */}
          <div className="mt-2 pt-3 border-t border-zinc-800/60 space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">PIR Breakdown</div>
            {stats.map((stat) => (
              <div key={stat.label} className="flex justify-between items-center text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-400">{stat.label}</span>
                  {stat.showTag && (
                    <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-sm ${stat.tier.color} bg-zinc-800/30`}>
                      {stat.tier.label}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 font-mono">
                  {viewMode === 'latest' && hasLatestGame && (
                    <span className={`text-[10px] font-bold ${
                      stat.delta != null && stat.delta >= 0 
                        ? stat.isNegative ? 'text-red-400/80' : 'text-emerald-400/80' 
                        : stat.isNegative ? 'text-emerald-400/80' : 'text-red-400/80'
                    }`}>
                      {typeof stat.delta === 'number' ? (stat.delta >= 0 ? '+' : '') + stat.delta.toFixed(1) : '0.0'}
                    </span>
                  )}
                  <span className={`${stat.isNegative ? 'text-red-400' : 'text-emerald-400'} font-semibold`}>
                    {typeof stat.currentVal === 'number' 
                      ? (stat.isNegative ? `-${stat.currentVal.toFixed(1)}` : stat.currentVal.toFixed(1)) 
                      : "0.0"}
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

const PlayersPage = () => {
  const [isClient, setIsClient] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Hierarchical Position Filters
  const [lineFilter, setLineFilter] = useState<PositionLine>('All');
  const [groupFilter, setGroupFilter] = useState<string>('All');

  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  const toggleCard = (id: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedCards(new Set(paginatedPlayers.map((p: any) => p["player.playerId"])));
  };

  const collapseAll = () => {
    setExpandedCards(new Set());
  };

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Safe handler to prevent out-of-bounds cross-filtering
  const handleLineChange = (line: PositionLine) => {
    setLineFilter(line);
    setGroupFilter('All');
    setCurrentPage(1);
  };

  const eligibleSeasonPlayers = useMemo(() => {
    return allPlayersData.filter((p: any) => (p.Games_Played_2026 || 0) >= 3);
  }, []);

  // Updated filter framework honoring playerLine and playerGroup
  const filteredPlayers = useMemo(() => {
    return eligibleSeasonPlayers
      .filter((player: any) => {
        const fullName = `${player['player.givenName']} ${player['player.surname']}`.toLowerCase();
        const team = (player['team.name'] || '').toLowerCase();
        const search = searchTerm.toLowerCase();
        
        const matchesSearch = fullName.includes(search) || team.includes(search);
        
        // 1. Check macro line assignment (Backs, Forwards, etc.)
        const matchesLine = lineFilter === 'All' || player.playerLine === lineFilter;
        
        // 2. Check micro group assignment (Key Backs, General Forwards, etc.)
        const matchesGroup = groupFilter === 'All' || player.playerGroup === groupFilter;
        
        return matchesSearch && matchesLine && matchesGroup;
      })
      .sort((a: any, b: any) => (b.Season_Avg_PIR || 0) - (a.Season_Avg_PIR || 0));
  }, [eligibleSeasonPlayers, searchTerm, lineFilter, groupFilter]);

  const thresholds = useMemo(() => {
    return {
      Avg_cat_disposal: calculateThresholds(eligibleSeasonPlayers, 'Avg_cat_disposal'),
      Avg_cat_contest_clearance: calculateThresholds(eligibleSeasonPlayers, 'Avg_cat_contest_clearance'),
      Avg_cat_damaging_impact: calculateThresholds(eligibleSeasonPlayers, 'Avg_cat_damaging_impact'),
      Avg_cat_defensive_grit: calculateThresholds(eligibleSeasonPlayers, 'Avg_cat_defensive_grit'),
      Avg_cat_ruck: calculateThresholds(eligibleSeasonPlayers, 'Avg_cat_ruck'),
      Avg_PIR_Negative: calculateThresholds(eligibleSeasonPlayers, 'Avg_PIR_Negative', true),
    };
  }, [eligibleSeasonPlayers]);

  if (!isClient) return null;

  const totalItems = filteredPlayers.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
  const activePage = Math.min(currentPage, totalPages);
  const startIndex = (activePage - 1) * ITEMS_PER_PAGE;
  const paginatedPlayers = filteredPlayers.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  // Derive dynamic sub-options group based on selected macro line
  const availableSubGroups = POSITION_STRUCTURE[lineFilter];

  return (
    <div className="min-h-screen bg-zinc-950 p-8 font-sans text-zinc-100">
      <header className="mb-8 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2 text-white">Player Impact Rating (PIR) - Season 2026</h1>
          <p className="text-zinc-400">Complete statistical rating of all active AFL players.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <button onClick={expandAll} className="text-xs font-bold text-zinc-400 hover:text-white">Expand All</button>
          <button onClick={collapseAll} className="text-xs font-bold text-zinc-400 hover:text-white">Collapse All</button>
          
          {/* Main Line Macro Select Filter */}
          <select
            value={lineFilter}
            onChange={(e) => handleLineChange(e.target.value as PositionLine)}
            className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-zinc-200 font-medium"
          >
            {(Object.keys(POSITION_STRUCTURE) as PositionLine[]).map(line => (
              <option key={line} value={line}>
                {line === 'All' ? 'All Positions' : line}
              </option>
            ))}
          </select>

          {/* Conditional Sub-Group Filter Dropdown */}
          {availableSubGroups.length > 0 && (
            <select
              value={groupFilter}
              onChange={(e) => {
                setGroupFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-zinc-200 animate-fadeIn"
            >
              <option value="All">All {lineFilter}</option>
              {availableSubGroups.map(group => (
                <option key={group} value={group}>{group}</option>
              ))}
            </select>
          )}

          <input
            type="text"
            placeholder="Search players or teams..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-zinc-200 placeholder-zinc-500 w-64"
          />
          <Link href="/" className="text-blue-400 hover:underline font-semibold text-sm whitespace-nowrap">
            ← Back to Dashboard
          </Link>
        </div>
      </header>

      {paginatedPlayers.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mb-8 items-start">
          {paginatedPlayers.map((player: any) => {
            const isEligible = (player.Games_Played_2026 || 0) >= 3;
            const lastHistoryEntry = (player.PIR_History && player.PIR_History.length > 0) 
              ? player.PIR_History[player.PIR_History.length - 1] 
              : null;
            
            const displayRank = lastHistoryEntry && isEligible ? lastHistoryEntry.rank : 9999;
            const filteredHistory = player.PIR_History || [];
            const playerId = player["player.playerId"];

            return (
              <PlayerCard
                key={playerId}
                player={player}
                rank={displayRank}
                filteredHistory={filteredHistory}
                thresholds={thresholds}
                isExpanded={expandedCards.has(playerId)}
                onToggle={() => toggleCard(playerId)}
              />
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 text-zinc-500 bg-zinc-900/50 rounded-xl border border-zinc-800">
          No players found matching your selected filters.
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-zinc-800 pt-6 mt-8">
          <div className="text-sm text-zinc-400">
            Showing <span className="font-semibold text-zinc-200">{startIndex + 1}</span> to{' '}
            <span className="font-semibold text-zinc-200">
              {Math.min(startIndex + ITEMS_PER_PAGE, totalItems)}
            </span>{' '}
            of <span className="font-semibold text-zinc-200">{totalItems}</span> players
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={activePage === 1}
              className="px-4 py-2 text-sm font-semibold bg-zinc-900 border border-zinc-800 rounded-md hover:bg-zinc-850 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <div className="flex items-center px-4 text-sm text-zinc-300">
              Page {activePage} of {totalPages}
            </div>
            <button
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={activePage === totalPages}
              className="px-4 py-2 text-sm font-semibold bg-zinc-900 border border-zinc-800 rounded-md hover:bg-zinc-850 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlayersPage;