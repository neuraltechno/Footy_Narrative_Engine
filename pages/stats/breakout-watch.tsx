import React, { useState, useEffect } from 'react';
import { BreakoutCard } from '../../components/BreakoutCard';

export default function BreakoutWatchPage() {
  const [players, setPlayers] = useState([]);

  useEffect(() => {
    fetch('/breakout_watch.json')
      .then(res => {
        if (!res.ok) throw new Error('Network response was not ok');
        return res.json();
      })
      .then(data => setPlayers(data))
      .catch(err => console.error("Failed to load breakout data", err));
  }, []);

  return (
    <div className="min-h-screen bg-black text-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="mb-12">
          <h1 className="text-4xl font-black text-white tracking-tight mb-2 uppercase italic">
            The PIR Stock Market: Breakout Watch
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl">
            Identifying emerging stars fundamentally outperforming their seasonal 
            baselines across our rolling 3-round performance model.
          </p>
        </header>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {players.map((player: any) => (
            <BreakoutCard key={player.playerId} player={player} />
          ))}
        </div>
      </div>
    </div>
  );
}
