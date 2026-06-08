import React, { useEffect, useState } from 'react';
import playersData from '../data/processed/players_pir.json';

const PlayersPage = () => {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return null; // Or a loading skeleton
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Player Impact Rating (PIR) - Season 2026</h1>
      <table className="min-w-full bg-white border border-gray-200">
        <thead>
          <tr>
            <th className="px-4 py-2 border-b">Player</th>
            <th className="px-4 py-2 border-b">Team</th>
            <th className="px-4 py-2 border-b">Season Avg PIR</th>
            <th className="px-4 py-2 border-b">Latest Round PIR</th>
          </tr>
        </thead>
        <tbody>
          {playersData
            .slice() // Copy array before sorting to avoid mutation issues
            .sort((a: any, b: any) => b.Season_Avg_PIR - a.Season_Avg_PIR)
            .map((player: any, index: number) => (
            <tr key={player.playerId || index}>
              <td className="px-4 py-2 border-b">{player["player.givenName"]} {player["player.surname"]}</td>
              <td className="px-4 py-2 border-b">{player["team.name"]}</td>
              <td className="px-4 py-2 border-b">{player.Season_Avg_PIR != null ? player.Season_Avg_PIR.toFixed(2) : "N/A"}</td>
              <td className="px-4 py-2 border-b">{player.Latest_Round_PIR != null ? player.Latest_Round_PIR.toFixed(2) : "N/A"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default PlayersPage;
