import React, { useState, useEffect, useMemo } from 'react';
import { BreakoutCard } from '../../components/BreakoutCard';

// Define explicit structure matching your R script's JSON output
interface BreakoutPlayer {
  playerId: string;
  givenName: string;
  surname: string;
  team: string;
  photoURL: string;
  age: number;
  position: string;
  season_avg: number;
  recent_avg: number;
  delta: number;
  peak_game: number;
  breakout_score: number;
}

type SortKey = 'breakout_score' | 'delta' | 'age';

export default function BreakoutWatchPage() {
  const [players, setPlayers] = useState<BreakoutPlayer[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Interactive UI Filters
  const [activePosition, setActivePosition] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<SortKey>('breakout_score');

  useEffect(() => {
    fetch('/breakout_watch.json')
      .then(res => {
        if (!res.ok) throw new Error('Unable to retrieve current breakout tracking data.');
        return res.json();
      })
      .then(data => {
        // Initial sorting by breakout score as the default priority
        const sortedData = [...data].sort((a, b) => b.breakout_score - a.breakout_score);
        setPlayers(sortedData);
        setIsLoading(false);
      })
      .catch(err => {
        console.error("Failed to load breakout data", err);
        setError(err.message);
        setIsLoading(false);
      });
  }, []);

  // Compute High-Level Market Insights
  const marketMetrics = useMemo(() => {
    if (players.length === 0) return { avgScore: 0, topRiser: 'N/A', count: 0 };
    const avg = players.reduce((sum, p) => sum + p.breakout_score, 0) / players.length;
    const top = [...players].sort((a, b) => b.breakout_score - a.breakout_score)[0];
    return {
      avgScore: Math.round(avg * 10) / 10,
      topRiser: `${top.givenName.charAt(0)}. ${top.surname}`,
      count: players.length
    };
  }, [players]);

  // Process and Filter Data based on User Selections
  const filteredAndSortedPlayers = useMemo(() => {
    let result = [...players];
    
    if (activePosition !== 'ALL') {
      result = result.filter(p => p.position.toUpperCase() === activePosition.toUpperCase());
    }

    result.sort((a, b) => {
      if (sortBy === 'age') return a.age - b.age; // Younger = higher priority for breakouts
      return b[sortBy] - a[sortBy];
    });

    return result;
  }, [players, activePosition, sortBy]);

  // Split into Top Tier and regular list to give Breakout Heroes ultimate focus
  const { leaders, challengers } = useMemo(() => {
    return {
      leaders: filteredAndSortedPlayers.slice(0, 3),
      challengers: filteredAndSortedPlayers.slice(3)
    };
  }, [filteredAndSortedPlayers]);

  const uniquePositions = ['ALL', ...Array.from(new Set(players.map(p => p.position.toUpperCase())))];

  return (
    <div className="min-h-screen bg-[#070708] text-gray-100 p-4 md:p-8 selection:bg-amber-500 selection:text-black">
      <div className="max-w-7xl mx-auto">
        
        {/* Header Section */}
        <header className="relative mb-12 pb-8 border-b border-zinc-800/60">
          <div className="absolute top-0 right-0 w-72 h-72 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
          
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold uppercase tracking-wider mb-3">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" /> Live PIR Tracker
              </div>
              <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight uppercase italic">
                The PIR Stock Market <span className="text-zinc-500 font-light font-sans not-italic">/</span> <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-orange-500 to-amber-200">Breakout Watch</span>
              </h1>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2 text-gray-400 text-base leading-relaxed">
              Our 3-round rolling model calculates a high-velocity <strong className="text-white font-semibold">Breakout Score</strong>. 
              It isolates emerging talent outperforming seasonal baselines by combining a youth-weighted performance surge (Delta) with a 20% quality baseline weight.
              <p className="text-zinc-500 text-xs mt-3 italic">
                *Requirements: Age ≤ 26. Minimum 2 games played over the last 3 rounds.
              </p>
            </div>

            {/* Micro Market Dashboard widgets */}
            <div className="grid grid-cols-3 gap-3 p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/80 backend-stats backdrop-blur-sm">
              <div className="text-center lg:text-left">
                <span className="block text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Market Size</span>
                <span className="text-xl md:text-2xl font-black text-white">{marketMetrics.count} <span className="text-xs text-zinc-500 font-normal">Players</span></span>
              </div>
              <div className="text-center lg:text-left border-x border-zinc-800 px-2">
                <span className="block text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Avg Breakout</span>
                <span className="text-xl md:text-2xl font-black text-amber-400">{marketMetrics.avgScore}</span>
              </div>
              <div className="text-center lg:text-left">
                <span className="block text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Market Leader</span>
                <span className="text-sm md:text-base font-bold text-white truncate block mt-1">{marketMetrics.topRiser}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Error State */}
        {error && (
          <div className="bg-red-950/20 border border-red-900/50 text-red-400 px-4 py-3 rounded-xl max-w-xl mb-8 flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <p className="text-sm"><span className="font-bold">Data Feed Exception:</span> {error}</p>
          </div>
        )}

        {/* Control Center (Filters & Sorts) */}
        {!isLoading && players.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-8 pb-4 border-b border-zinc-900">
            {/* Position Selector */}
            <div className="flex flex-wrap gap-1.5 bg-zinc-900/60 p-1 rounded-lg border border-zinc-800/40">
              {uniquePositions.map(pos => (
                <button
                  key={pos}
                  onClick={() => setActivePosition(pos)}
                  className={`px-3 py-1 rounded-md text-xs font-bold tracking-wide transition-all ${
                    activePosition === pos 
                      ? 'bg-gradient-to-b from-zinc-700 to-zinc-800 text-white shadow-md border border-zinc-600/30' 
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>

            {/* Metric Sorting Engine */}
            <div className="flex items-center gap-2 self-end sm:self-auto text-xs">
              <span className="text-zinc-500 font-medium">Rank By:</span>
              <div className="inline-flex rounded-lg overflow-hidden border border-zinc-800">
                {(['breakout_score', 'delta', 'age'] as SortKey[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => setSortBy(key)}
                    className={`px-3 py-1.5 font-bold tracking-tight capitalize transition-colors ${
                      sortBy === key 
                        ? 'bg-amber-500 text-black' 
                        : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                    }`}
                  >
                    {key.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Loading / Skeleton State */}
        {isLoading ? (
          <div className="space-y-12">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-zinc-900/30 border border-zinc-800/80 rounded-2xl h-80 animate-pulse relative overflow-hidden" />
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Tier 1: The Heavy Hitters (Top 3 Spotlights) */}
            {leaders.length > 0 && (
              <section className="mb-12">
                <div className="flex items-center gap-2 mb-6">
                  <h2 className="text-xs font-black tracking-widest text-amber-400 uppercase">Tier 1 // Peak Velocity</h2>
                  <div className="h-[1px] bg-gradient-to-r from-amber-500/30 to-transparent flex-1" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {leaders.map((player, idx) => (
                    <div 
                      key={player.playerId} 
                      className="relative rounded-2xl transition-transform duration-300 hover:-translate-y-1 group"
                    >
                      {/* Premium gold glow underlay effect on top performers */}
                      <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-amber-500/20 via-orange-500/5 to-transparent opacity-70 group-hover:opacity-100 transition-opacity" />
                      <div className="absolute top-3 right-4 z-20 bg-black/60 text-amber-400 font-black text-xs px-2.5 py-1 rounded-md border border-amber-500/30 shadow-lg italic">
                        RANK #{idx + 1}
                      </div>
                      <div className="relative bg-[#0d0d10] rounded-2xl overflow-hidden border border-zinc-800/80">
                        <BreakoutCard player={player} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Tier 2: The Challengers */}
            {challengers.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-6">
                  <h2 className="text-xs font-black tracking-widest text-zinc-400 uppercase">Tier 2 // Market Challengers</h2>
                  <div className="h-[1px] bg-zinc-800 flex-1" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {challengers.map((player) => (
                    <div key={player.playerId} className="hover:-translate-y-0.5 transition-transform duration-200">
                      <BreakoutCard player={player} />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* Empty List Fallback */}
        {!isLoading && filteredAndSortedPlayers.length === 0 && !error && (
          <div className="text-center py-24 bg-zinc-900/10 border border-dashed border-zinc-800/60 rounded-2xl backdrop-blur-sm max-w-2xl mx-auto">
            <svg className="w-8 h-8 mx-auto text-zinc-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-zinc-400 font-medium">No breakout profiles match the selected configuration filters.</p>
          </div>
        )}

      </div>
    </div>
  );
}