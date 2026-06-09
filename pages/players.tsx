import React, { useEffect, useState } from 'react';
import playersData from '../data/processed/players_pir.json';
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

const PlayerCard = ({ player, rank, initialView = 'season' }: { player: any; rank: number; initialView?: 'season' | 'latest' }) => {
  const [viewMode, setViewMode] = useState<'season' | 'latest'>(initialView);

  // Extract real variables from the newly processed JSON file
  const gamesPlayed = player.Games_Played || 1;
  const position = player.Player_Position || "Midfielder";
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
    // Determine the latest game category score dynamically based on the proportional shift of total PIR
    let latestVal = 0;
    if (hasLatestGame) {
      const scalar = player.Latest_Round_PIR / (player.Season_Avg_PIR || 100);
      latestVal = (stat.seasonVal || 0) * scalar;
      if (stat.key === 'Avg_cat_ruck' && (stat.seasonVal || 0) < 1) latestVal = 0;
      if (latestVal < 0) latestVal = 0;
    }

    const currentVal = viewMode === 'latest' && hasLatestGame ? latestVal : (stat.seasonVal || 0);
    const delta = hasLatestGame ? latestVal - (stat.seasonVal || 0) : 0;

    return {
      ...stat,
      currentVal: typeof currentVal === 'number' ? currentVal : 0,
      delta: typeof delta === 'number' ? delta : 0
    };
  });

  // Pick top 2 season strengths safely with defined fallback values
  const topStrengths = [...rawStats]
    .filter(s => !s.isNegative)
    .map(s => ({ ...s, seasonVal: s.seasonVal || 0 }))
    .sort((a, b) => b.seasonVal - a.seasonVal)
    .slice(0, 2);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-all flex flex-col justify-between shadow-lg relative overflow-hidden">
      {/* Ranking & Games Badge */}
      <div className="absolute top-0 right-0 flex items-center bg-zinc-950/40 border-b border-l border-zinc-800 rounded-bl-lg overflow-hidden">
        <span className="text-[10px] font-bold text-zinc-400 px-2 py-1 border-r border-zinc-800 bg-zinc-900">
          {gamesPlayed} GP
        </span>
        {rank > 0 && (
          <span className="bg-blue-600/10 text-blue-400 px-3 py-1 text-xs font-bold">
            #{rank}
          </span>
        )}
      </div>

      <div>
        <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-0.5">
          {player["team.name"]}
        </div>
        <h3 className="text-lg font-bold text-white line-clamp-1 leading-snug">
          {player["player.givenName"]} {player["player.surname"]}
        </h3>
        <p className="text-xs text-zinc-400 font-medium mb-3">{position}</p>
      </div>

        {/* Primary Toggle & Main PIR display */}
        <div className="my-3 p-3 bg-zinc-950/50 rounded-lg border border-zinc-800/60">
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
            <span className="text-zinc-400">{stat.label}</span>
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
    </div>
  );
};

const PlayersPage = () => {
  const [isClient, setIsClient] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return null; // Or a loading skeleton
  }

  // Filter and sort players
  const filteredPlayers = playersData
    .filter((player: any) => {
      const fullName = `${player["player.givenName"]} ${player["player.surname"]}`.toLowerCase();
      const team = (player["team.name"] || '').toLowerCase();
      const search = searchTerm.toLowerCase();
      return fullName.includes(search) || team.includes(search);
    })
    .sort((a: any, b: any) => (b.Season_Avg_PIR || 0) - (a.Season_Avg_PIR || 0));

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
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mb-8">
          {paginatedPlayers.map((player: any, index: number) => {
            const globalRank = playersData
              .slice()
              .sort((a: any, b: any) => (b.Season_Avg_PIR || 0) - (a.Season_Avg_PIR || 0))
              .findIndex((p: any) => p["player.playerId"] === player["player.playerId"]) + 1;

            return (
              <PlayerCard
                key={player.playerId || index}
                player={player}
                rank={globalRank}
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
