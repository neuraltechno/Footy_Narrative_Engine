import React from 'react';

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

export const BreakoutCard = ({ player }: { player: BreakoutPlayer }) => {
  const maxBaseline = 350;
  
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 shadow-2xl hover:border-emerald-500/50 transition-all">
      {/* Header */}
      <div className="flex items-center gap-4 mb-4">
        <img src={player.photoURL} alt={player.surname} className="w-16 h-16 rounded-full border-2 border-gray-600 bg-gray-800" />
        <div>
          <h3 className="text-xl font-bold text-white">{player.givenName} {player.surname}</h3>
          <p className="text-gray-400 text-sm">{player.position} • {player.team} • {player.age}yo</p>
        </div>
      </div>

      {/* Delta Badge */}
      <div className="flex gap-2 mb-6">
        <span className="inline-block bg-emerald-500/20 text-emerald-400 font-bold px-3 py-1 rounded-full text-lg border border-emerald-500/30">
          +{player.delta.toFixed(1)} Delta
        </span>
        <span className="inline-block bg-blue-500/20 text-blue-400 font-bold px-3 py-1 rounded-full text-lg border border-blue-500/30">
          {(player.breakout_score || 0).toFixed(1)} Score
        </span>
      </div>

      {/* Comparison */}
      <div className="space-y-3 mb-6">
        <div>
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Season Avg</span>
            <span>{player.season_avg.toFixed(1)}</span>
          </div>
          <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden">
            <div className="bg-gray-500 h-full" style={{ width: `${(player.season_avg / maxBaseline) * 100}%` }}></div>
          </div>
        </div>
        <div>
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Recent 3-Round Avg</span>
            <span className="text-emerald-400">{player.recent_avg.toFixed(1)}</span>
          </div>
          <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden">
            <div className="bg-emerald-500 h-full" style={{ width: `${(player.recent_avg / maxBaseline) * 100}%` }}></div>
          </div>
        </div>
      </div>

      {/* Ceiling */}
      <div className="text-xs text-gray-500 border-t border-gray-800 pt-3">
        <span className="font-semibold text-white">🔥 High-Volatility Ceiling:</span> Registered a peak game PIR of {player.peak_game.toFixed(0)} this season.
      </div>
    </div>
  );
};
