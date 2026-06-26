import React from 'react';

interface Player {
  name: string;
  team: string;
  photoURL: string;
  score: number;
}

interface Props {
  title: string;
  subtitle: string;
  themeColor: string; // Tailwind class e.g., "border-blue-500"
  players: Player[];
}

export const CategoryPodium: React.FC<Props> = ({ title, subtitle, themeColor, players }) => {
  if (!players || players.length === 0) return null;
  const [top, ...others] = players;

  return (
    <div className={`bg-zinc-900 border-t-4 ${themeColor} p-6 rounded-xl shadow-2xl`}>
      <h2 className="text-xl font-bold text-zinc-100">{title}</h2>
      <p className="text-sm text-zinc-400 mb-6">{subtitle}</p>

      {/* Rank #1 */}
      {top && (
        <div className="relative mb-6 p-4 bg-zinc-950 rounded-lg border border-zinc-800 flex items-center gap-4">
          <img src={top.photoURL} alt={top.name} className="w-16 h-16 rounded-full object-cover border-2 border-zinc-700" />
          <div className="flex-grow">
            <div className="text-xs text-zinc-500 uppercase tracking-widest font-bold">#1 Leader</div>
            <div className="font-bold text-lg text-zinc-50">{top.name}</div>
            <div className="text-xs text-zinc-400">{top.team}</div>
          </div>
          <div className={`px-3 py-1 rounded-full bg-zinc-800 border ${themeColor.replace('border-', 'border-')}`}>
            <span className="font-mono font-bold text-zinc-50">{top.score.toFixed(1)}</span>
          </div>
        </div>
      )}

      {/* Ranks 2-5 */}
      <div className="space-y-3">
        {others.map((player, idx) => (
          <div key={idx} className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0">
            <div className="flex items-center gap-3">
              <span className="text-zinc-600 font-mono font-bold text-sm w-6">#{idx + 2}</span>
              <span className="text-zinc-300 font-medium">{player.name}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-500">{player.team}</span>
              <span className="font-mono text-zinc-100 font-bold">{player.score.toFixed(1)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
