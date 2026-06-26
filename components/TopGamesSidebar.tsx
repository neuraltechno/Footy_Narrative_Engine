import Link from 'next/link';

export const TopGamesSidebar = ({ data }: { data: any[] }) => (
  <div className="bg-black p-5 rounded-2xl border border-gray-800">
    <h2 className="text-white font-black mb-4 uppercase tracking-tighter text-xl">Top 5 Performances</h2>
    <div className="space-y-3">
      {data.slice(0, 5).map((game, i) => (
        <div key={game.playerId} className="flex justify-between items-center text-sm">
          <span className="text-blue-500 font-bold truncate">#{i + 1} {game.surname}</span>
          <span className="text-white font-mono font-bold">{Math.round(game.PIR)}</span>
        </div>
      ))}
    </div>
    <Link href="/records/top-games" className="block mt-6 text-blue-400 text-sm hover:underline">
      View Full Top 25 Masterlist →
    </Link>
  </div>
);
