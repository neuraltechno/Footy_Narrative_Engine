import React, { useEffect, useState } from 'react';
import allPlayersData from '../data/processed/players_pir.json';
import Link from 'next/link';

const ITEMS_PER_PAGE = 24;

// Helper to estimate a position based on high-impact categories if not present
const getEstimatedPosition = (player: any) => {
  const categories = [
    { name: 'Ruck', val: player.Avg_cat_ruck || 0 },
    { name: 'Forward', val: player.Avg_cat_damaging_impact || 0 },
    { name: 'Midfielder', val: player.Avg_cat_contest_clearance || 0 },
    { name: 'Defender', val: player.Avg_cat_defensive_grit || 0 },
    { name: 'Winger/Midfielder', val: player.Avg_cat_disposal || 0 }
  ];
  // Sort descending
  const top = categories.sort((a, b) => b.val - a.val)[0];
  if (player.Avg_cat_ruck > 15) return 'Ruck';
  return top ? top.name : 'Midfielder';
};

const calculateThresholds = (allPlayers: any[], statKey: string, isNegativeMetric = false) => {
  const values = allPlayers.map(p => p[statKey] || 0).sort((a, b) => isNegativeMetric ? a - b : b - a);
  const n = values.length;
  
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
    // For negative drag, lower values are better (less drag).
    // Swap tier logic: Lower val = higher tier (better performance).
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

const PlayerCard = ({ player, rank, initialView = 'season', thresholds, isExpanded, onToggle }: { player: any; rank: number; initialView?: 'season' | 'latest', thresholds: any, isExpanded: boolean, onToggle: () => void }) => {
  const [viewMode, setViewMode] = useState<'season' | 'latest'>(initialView);

  // Extract real variables from the newly processed JSON file
  const gamesPlayed = player.Games_Played_2026 || 0;
  const position = player.playerPosition || "Midfielder";
  const roundHistory = player.PIR_History || [];

  const hasLatestGame = player.Latest_Round_PIR && player.Latest_Round_PIR > 0;

  // Let's calculate the categories based on the active view mode
  const rawStats = [
    { key: 'Avg_cat_disposal', label: 'Disposal', seasonVal: player.Avg_cat_disposal || 0 },
    { key: 'Avg_cat_contest_clearance', label: 'Contest/Clearance', seasonVal: player.Avg_cat_contest_clearance || 0 },
    { key: 'Avg_cat_damaging_impact', label: 'Damaging Impact', seasonVal: player.Avg_cat_damaging_impact || 0 },
    { key: 'Avg_cat_defensive_grit', label: 'Defensive Grit', seasonVal: player.Avg_cat_defensive_grit || 0 },
    { key: 'Avg_cat_ruck', label: 'Ruck', seasonVal: player.Avg_cat_ruck || 0 },
    { key: 'Avg_PIR_Negative', label: 'Negative Drag', seasonVal: player.Avg_PIR_Negative || 0, isNegative: true }
  ];

  const stats = rawStats.map((stat) => {
    // Determine the latest game category score dynamically
    let latestVal = 0;
    if (hasLatestGame) {
      const scalar = player.Latest_Round_PIR / (player.Season_Avg_PIR || 100);
      latestVal = (stat.seasonVal || 0) * scalar;
      if (stat.key === 'Avg_cat_ruck' && (stat.seasonVal || 0) < 1) latestVal = 0;
      if (latestVal < 0) latestVal = 0;
    }

    const currentVal = viewMode === 'latest' && hasLatestGame ? latestVal : (stat.seasonVal || 0);
    const delta = hasLatestGame ? latestVal - (stat.seasonVal || 0) : 0;
    
    // Determine if the tag should be shown
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

  // Pick top 2 season strengths safely with defined fallback values
  const topStrengths = [...rawStats]
    .filter(s => !s.isNegative)
    .map(s => ({ ...s, seasonVal: s.seasonVal || 0 }))
    .sort((a, b) => b.seasonVal - a.seasonVal)
    .slice(0, 2);

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
        {rank > 0 && (
          <span className="bg-blue-600 text-white px-3 py-1 text-xs font-bold">
            #{rank}
          </span>
        )}
      </div>

      <div>
        <div className="flex gap-4 items-start">
          <img src={player.photoURL} alt={`${player['player.givenName']} {player['player.surname']}`} className="w-16 h-16 rounded-lg bg-zinc-800 object-cover" />
          <div className="flex-1">
            <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-0.5">
              {player['team.name']} · #{player.playerJumperNumber}
            </div>
            <h3 className="text-lg font-bold text-white line-clamp-1 leading-snug">
              {player['player.givenName']} {player['player.surname']}
            </h3>
            <p className="text-xs text-zinc-400 font-medium">{position}</p>
            <p className="text-xs text-zinc-500">{player.Age} yrs · {player.heightInCm} · {player.weightInKg}</p>
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
                  if (hasLatestGame) {
                    setViewMode('latest');
                  }
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
              {viewMode === 'season' ? 'Season Avg' : 'Round 13'}
            </span>
          </div>

          <div className="flex justify-between items-end">
            <div>
              <div className="text-[10px] text-zinc-400 mb-0.5">Impact Rating</div>
              <div className={`text-2xl font-black ${viewMode === 'latest' ? 'text-blue-400' : 'text-white'}`}>
                {viewMode === 'season'
                  ? (player.Season_Avg_PIR != null ? player.Season_Avg_PIR.toFixed(1) : "0.0")
                  : (player.Latest_Round_PIR != null ? player.Latest_Round_PIR.toFixed(1) : "0.0")
                }
              </div>
            </div>
            {viewMode === 'latest' && hasLatestGame && player.Season_Avg_PIR != null && (
              <div className="text-right">
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                  (player.Latest_Round_PIR - player.Season_Avg_PIR) >= 0 
                    ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-500/10' 
                    : 'bg-red-950/50 text-red-400 border border-red-500/10'
                }`}>
                  {(player.Latest_Round_PIR - player.Season_Avg_PIR) >= 0 ? '▲' : '▼'}{' '}
                  {Math.abs(player.Latest_Round_PIR - player.Season_Avg_PIR).toFixed(1)}
                </span>
              </div>
            )}
          </div>
        </div>

      {/* Dynamic Key Strengths Highlight */}
      <div className="mb-4 bg-emerald-950/10 border border-emerald-500/10 rounded-lg p-2.5">
        <div className="text-[9px] uppercase tracking-wider text-emerald-400 font-black mb-1">Significant Strengths</div>
        <div className="space-y-1">
          {topStrengths.map((str) => (
            <div key={str.label} className="text-xs flex justify-between text-zinc-300">
              <span className="text-zinc-400">⚡ {str.label}</span>
              <span className="font-extrabold text-emerald-400">+{typeof str.seasonVal === 'number' ? str.seasonVal.toFixed(1) : "0.0"}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="text-[10px] text-zinc-600 text-center -mt-2 mb-2 font-bold opacity-70">
        {isExpanded ? '▲ Collapse' : '▼ Expand'}
      </div>

      {isExpanded && (
        <>
          {/* Interactive Sparkline / Round History Bar Chart */}
          {roundHistory.length > 0 && (
            <div className="mb-4 bg-zinc-950/40 border border-zinc-800/50 rounded-lg p-2.5">
              <div className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold mb-2 flex justify-between items-center">
                <span>PIR Form History</span>
                <span className="text-[8px] text-zinc-600">Rounds {roundHistory[0].round}–{roundHistory[roundHistory.length - 1].round}</span>
              </div>
              <div className="flex items-end justify-between gap-1 h-9 pt-1.5 px-1">
                {roundHistory.map((h: any, idx: number) => {
                  // Normalize heights relative to a max potential PIR of 220
                  const maxPIRVal = 220;
                  const heightPercent = Math.min(100, Math.max(10, (h.pir / maxPIRVal) * 100));
                  
                  // Tier color scheme
                  let barColor = 'bg-zinc-700 hover:bg-zinc-600'; // Standard Contributions (<100)
                  if (h.pir >= 200) {
                    barColor = 'bg-amber-400 hover:bg-amber-300'; // Immortal Zone
                  } else if (h.pir >= 150) {
                    barColor = 'bg-emerald-500 hover:bg-emerald-400'; // Match Winner
                  } else if (h.pir >= 100) {
                    barColor = 'bg-blue-500 hover:bg-blue-400'; // Game Changer
                  }

                  return (
                    <div
                      key={idx}
                      style={{ height: `${heightPercent}%` }}
                      className={`flex-1 min-w-[6px] rounded-t-sm transition-all duration-300 cursor-pointer relative group ${barColor}`}
                    >
                      {/* Micro Hover Tooltip */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-zinc-950 text-[9px] font-bold text-white py-0.5 px-1.5 rounded border border-zinc-800 shadow-xl whitespace-nowrap z-30">
                        R{h.round}: {h.pir != null ? h.pir.toFixed(1) : "0.0"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
  const [positionFilter, setPositionFilter] = useState('All');
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  const positions = ['All', 'Back Pocket', 'Centre Half Back', 'Centre Half Forward', 'Forward Pocket', 'Full Back', 'Full Forward', 'Half Back Flank', 'Half Forward Flank', 'Inside Mid', 'Ruck Rover', 'Ruckman', 'Utility', 'Wing'];

  const toggleCard = (id: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedCards(new Set(paginatedPlayers.map((p: any) => p["player.playerId"] || p.id)));
  };

  const collapseAll = () => {
    setExpandedCards(new Set());
  };

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return null; // Or a loading skeleton
  }

  // Filter and sort players
  const filteredPlayers = allPlayersData
    .filter((player: any) => {
      const fullName = `${player.givenName} ${player.surname}`.toLowerCase();
      const team = (player.teamName || '').toLowerCase();
      const search = searchTerm.toLowerCase();
      const playerPos = player.Player_Position || "Midfielder";
      
      const matchesSearch = fullName.includes(search) || team.includes(search);
      const matchesPosition = positionFilter === 'All' || playerPos === positionFilter;
      
      return matchesSearch && matchesPosition;
    })
    .sort((a: any, b: any) => {
        // Sort by rank: Apply 3-game filter only if they would be in the top 50.
        // Logic: If they have < 3 games, push them down past the top 50.
        const aQualifies = (a.Games_Played_2026 || 0) >= 3;
        const bQualifies = (b.Games_Played_2026 || 0) >= 3;
        
        if (aQualifies && !bQualifies) return -1;
        if (!aQualifies && bQualifies) return 1;
        
        return (b.Season_Avg_PIR || 0) - (a.Season_Avg_PIR || 0);
    });

  const thresholds = {
    Avg_cat_disposal: calculateThresholds(allPlayersData, 'Avg_cat_disposal'),
    Avg_cat_contest_clearance: calculateThresholds(allPlayersData, 'Avg_cat_contest_clearance'),
    Avg_cat_damaging_impact: calculateThresholds(allPlayersData, 'Avg_cat_damaging_impact'),
    Avg_cat_defensive_grit: calculateThresholds(allPlayersData, 'Avg_cat_defensive_grit'),
    Avg_cat_ruck: calculateThresholds(allPlayersData, 'Avg_cat_ruck'),
    Avg_PIR_Negative: calculateThresholds(allPlayersData, 'Avg_PIR_Negative', true),
  };

  // Pagination math
  const totalItems = filteredPlayers.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
  
  // Ensure page bounds
  const activePage = Math.min(currentPage, totalPages);
  const startIndex = (activePage - 1) * ITEMS_PER_PAGE;
  const paginatedPlayers = filteredPlayers.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  return (
    <div className="min-h-screen bg-zinc-950 p-8 font-sans text-zinc-100">
      <header className="mb-12 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2 text-white">Player Impact Rating (PIR) - Season 2026</h1>
          <p className="text-zinc-400">Complete statistical rating of all active AFL players.</p>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={expandAll} className="text-xs font-bold text-zinc-400 hover:text-white">Expand All</button>
          <button onClick={collapseAll} className="text-xs font-bold text-zinc-400 hover:text-white">Collapse All</button>
          <select
            value={positionFilter}
            onChange={(e) => {
              setPositionFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-zinc-200"
          >
            {positions.map(pos => (
              <option key={pos} value={pos}>{pos}</option>
            ))}
          </select>
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

      {/* Players Card Grid */}
      {paginatedPlayers.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mb-8 items-start">
            {paginatedPlayers.map((player: any, index: number) => {
            // Rank based on all players, regardless of pagination
            const allEligiblePlayers = allPlayersData
              .filter((p: any) => (p.Games_Played_2026 || 0) >= 3)
              .sort((a: any, b: any) => (b.Season_Avg_PIR || 0) - (a.Season_Avg_PIR || 0));

            const isEligible = (player.Games_Played_2026 || 0) >= 3;
            const globalRank = isEligible 
              ? allEligiblePlayers.findIndex((p: any) => p["player.playerId"] === player["player.playerId"]) + 1
              : 0; // Rank 0 means unranked
            
            const playerId = player["player.playerId"] || index.toString();

            return (
              <PlayerCard
                key={playerId}
                player={player}
                rank={globalRank}
                thresholds={thresholds}
                isExpanded={expandedCards.has(playerId)}
                onToggle={() => toggleCard(playerId)}
              />
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 text-zinc-500 bg-zinc-900/50 rounded-xl border border-zinc-800">
          No players found matching your search.
        </div>
      )}

      {/* Pagination Controls */}
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
