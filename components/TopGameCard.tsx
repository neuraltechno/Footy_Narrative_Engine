import React from 'react';

export const TopGameCard = ({ game, rank }: { game: any; rank: number }) => (
  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col md:flex-row items-center gap-4 hover:border-blue-500 transition-colors">
    <div className="flex items-center gap-4 flex-1">
      <span className="text-3xl font-bold text-blue-400 w-12">#{rank}</span>
      <img src={game.photoURL} alt={game.surname} className="w-16 h-16 rounded-full bg-gray-800 object-cover" />
      <div>
        <h3 className="font-bold text-white text-lg">{game.givenName} {game.surname}</h3>
        <p className="text-gray-400 text-sm">{game.team} • {game.game_title}</p>
      </div>
    </div>
    
    <div className="text-right flex flex-col items-center">
      <span className="text-4xl font-black text-white">{Math.round(game.PIR)}</span>
      <span className="text-xs text-gray-500 uppercase tracking-widest">PIR</span>
    </div>

    <div className="flex gap-2 mt-2 md:mt-0 flex-wrap">
      {['disposal', 'contest', 'damage', 'grit'].map(stat => (
        <span key={stat} className="px-2 py-1 bg-gray-800 text-gray-300 text-[10px] uppercase font-bold rounded">
          {stat}: {Math.round(game[stat])}
        </span>
      ))}
      {game.ruck > 0 && <span className="px-2 py-1 bg-amber-900 text-amber-200 text-[10px] uppercase font-bold rounded">Ruck: {Math.round(game.ruck)}</span>}
    </div>
  </div>
);
