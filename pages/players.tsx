import React, { useEffect, useState } from 'react';
import allPlayersData from '../data/processed/players_pir.json';
import Link from 'next/link';
import RankingMomentum from '../components/RankingMomentum';

const ITEMS_PER_PAGE = 24;

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
  const position = player.playerPosition || "Midfielder";
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
            <p className="text-xs text-zinc-400 font-medium">{position}</p>
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
          <div>
            <div className="text-[10px] text-zinc-400 mb-0.5">Impact Rating</div>
            <div className={`text-2xl font-black ${viewMode === 'latest' ? 'text-blue-400' : 'text-white'}`}>
              {viewMode === 'season'
                ? (player.Season_Avg_PIR != null ? player.Season_Avg_PIR.toFixed(1) : "0.0")
                : (player.Latest_Round_PIR != null ? player.Latest_Round_PIR.toFixed(1) : "0.0")
              }
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
          {roundHistory.length > 0 && (
            <div className="mb-4 bg-zinc-950/40 border border-zinc-800/50 rounded-lg p-2.5">
              <div className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold mb-2 flex justify-between items-center">
                <span>PIR Round Breakdown</span>
                <span className="text-[8px] text-zinc-600">Rounds {roundHistory[0].round}–{roundHistory[roundHistory.length - 1].round}</span>
              </div>
              <div className="relative flex items-end h-16 pt-2 px-1 w-full gap-1">
                {roundHistory.map((h: any, i: number) => {
                  const barHeight = (Math.min(220, h.pir || 0) / 220) * 100;
                  let barColor = 'bg-zinc-600';
                  if (h.pir >= 200) barColor = 'bg-amber-400';
                  else if (h.pir >= 150) barColor = 'bg-emerald-500';
                  else if (h.pir >= 100) barColor = 'bg-blue-500';
                  
                  const displayPir = h.running_avg_pir != null ? h.running_avg_pir : (h.pir || 0);

                  return (
                    <div key={i} className="group flex-1 flex flex-col justify-end items-center relative h-full">
                      <div 
                        className={`w-full rounded-t-sm transition-all duration-300 ${barColor}`}
                        style={{ height: `${barHeight}%` }}
                      />
                      <div className="absolute -top-6 hidden group-hover:block bg-zinc-800 text-[9px] font-bold text-white py-0.5 px-1.5 rounded border border-zinc-700 shadow-xl whitespace-nowrap z-50">
                        R{h.round}: {displayPir.toFixed(0)}
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

  const positions = ['All', 'Back Pocket', 'Inside/Outside Mid', 'Centre Half Back', 'Centre Half Forward', 'Full Back', 'Full Forward', 'Forward Pocket', 'Half Back Flank', 'Half Forward Flank', 'Utility', 'Inside Mid', 'Ruckman', 'Wing'];

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

  if (!isClient) return null;
  // A master array of players who actually qualify for 2026 data analytics
  const eligibleSeasonPlayers = allPlayersData.filter((p: any) => (p.Games_Played_2026 || 0) >= 3);

  // Filter and sort players matching processed backend keys
  const filteredPlayers = eligibleSeasonPlayers
    .filter((player: any) => {
      // Existing search and position filters
      const fullName = `${player['player.givenName']} ${player['player.surname']}`.toLowerCase();
      const team = (player['team.name'] || '').toLowerCase();
      const search = searchTerm.toLowerCase();
      const playerPos = player.playerPosition || "Midfielder";
      
      const matchesSearch = fullName.includes(search) || team.includes(search);
      const matchesPosition = positionFilter === 'All' || playerPos === positionFilter;
      
      return matchesSearch && matchesPosition;
    })
    .sort((a: any, b: any) => (b.Season_Avg_PIR || 0) - (a.Season_Avg_PIR || 0));

  const thresholds = {
    Avg_cat_disposal: calculateThresholds(eligibleSeasonPlayers, 'Avg_cat_disposal'),
    Avg_cat_contest_clearance: calculateThresholds(eligibleSeasonPlayers, 'Avg_cat_contest_clearance'),
    Avg_cat_damaging_impact: calculateThresholds(eligibleSeasonPlayers, 'Avg_cat_damaging_impact'),
    Avg_cat_defensive_grit: calculateThresholds(eligibleSeasonPlayers, 'Avg_cat_defensive_grit'),
    Avg_cat_ruck: calculateThresholds(eligibleSeasonPlayers, 'Avg_cat_ruck'),
    Avg_PIR_Negative: calculateThresholds(eligibleSeasonPlayers, 'Avg_PIR_Negative', true),
  };

  const totalItems = filteredPlayers.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
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
          No players found matching your search.
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