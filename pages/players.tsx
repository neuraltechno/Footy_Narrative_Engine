import React from 'react';
import playersData from '../data/processed/players_pir.json';

const PlayersPage = () => {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Player Impact Rating (PIR) - Round 13</h1>
      <table className="min-w-full bg-white border border-gray-200">
        <thead>
          <tr>
            <th className="px-4 py-2 border-b">Player</th>
            <th className="px-4 py-2 border-b">Team</th>
            <th className="px-4 py-2 border-b">PIR</th>
          </tr>
        </thead>
        <tbody>
          {playersData.map((player: any, index: number) => (
            <tr key={index}>
              <td className="px-4 py-2 border-b">{player["player.givenName"]} {player["player.surname"]}</td>
              <td className="px-4 py-2 border-b">{player["team.name"]}</td>
              <td className="px-4 py-2 border-b">{player.PIR != null ? player.PIR.toFixed(2) : "N/A"}</td>

            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default PlayersPage;
