import { useState } from 'react';
import fs from 'fs';
import path from 'path';
import { GetStaticProps } from 'next';
import { TopGameCard } from '../../components/TopGameCard';

export default function TopGamesPage({ games }: { games: any[] }) {
  const [filterTeam, setFilterTeam] = useState('All');

  const uniqueTeams = Array.from(new Set(games.map(g => g.team))).sort();

  const filtered = filterTeam === 'All' 
    ? games.slice(0, 50) 
    : games.filter(g => g.team === filterTeam).slice(0, 50);

  return (
    <div className="bg-gray-950 min-h-screen text-white p-8">
      <h1 className="text-4xl font-black mb-8">Peak Impact: Top 50 Performances of 2026</h1>
      
      <div className="mb-6">
        <label className="mr-2 text-sm text-gray-400">Filter by Team:</label>
        <select 
          onChange={(e) => setFilterTeam(e.target.value)} 
          className="bg-gray-900 p-2 rounded border border-gray-700 text-white"
        >
          <option value="All">All Teams</option>
          {uniqueTeams.map(team => <option key={team} value={team}>{team}</option>)}
        </select>
      </div>

      <div className="grid gap-4">
        {filtered.map((game, i) => <TopGameCard key={`${game.playerId}-${i}`} game={game} rank={i + 1} />)}
      </div>
    </div>
  );
}

export const getStaticProps: GetStaticProps = async () => {
  const filePath = path.join(process.cwd(), 'data', 'processed', 'top_games_pir.json');
  const games = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  return {
    props: { games },
    revalidate: 60,
  };
};
