// pages/api/trigger-update.ts
import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    console.log("Fetching 2026 AFL data from source...");

    // Using a direct fetch approach to bypass R environment complexity
    // In a production app, replace this URL with the verified API endpoint from your data provider
    const response = await fetch('https://api.afltables.com/stats/2026');
    const rawData = await response.json();

    // Data processing logic here...
    // For now, mapping to your required structure
    const processedTeams = rawData.teams.map((team: any) => ({
      name: team.name,
      trendScore: team.trend || 50,
      contenderScore: team.contender || 50,
      narrative: team.summary || "Performance analysis ongoing."
    }));

    const filePath = path.join(process.cwd(), "data", "teams.json");
    fs.writeFileSync(filePath, JSON.stringify({ teams: processedTeams }, null, 2));

    res.status(200).json({ message: 'Data updated successfully using direct API fetch' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to update data', error: String(error) });
  }
}
