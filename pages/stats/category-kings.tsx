import React, { useState, useMemo } from 'react';
import fs from 'fs';
import path from 'path';
import { CategoryPodium } from '../../components/CategoryPodium';

export async function getServerSideProps() {
  const configPath = path.join(process.cwd(), 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const currentSeason = config.CURRENT_SEASON;

  const dataPath = path.join(process.cwd(), 'json', currentSeason, 'players', 'category_kings.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  return {
    props: { data, currentSeason },
  };
}

export default function CategoryKings({ data, season }: { data: any, season: string }) {
  const [selectedTeam, setSelectedTeam] = useState<string>('All');

  const teams = useMemo(() => {
    const all = Object.values(data as any).flat().map((p: any) => p.team);
    return ['All', ...Array.from(new Set(all))];
  }, []);

  const filteredData = useMemo(() => {
    const result: any = {};
    Object.keys(data).forEach(key => {
      // @ts-ignore
      result[key] = selectedTeam === 'All' 
        ? data[key] 
        : data[key].filter((p: any) => p.team === selectedTeam);
    });
    return result;
  }, [selectedTeam]);

  const categories = [
    { key: 'Avg_cat_disposal', title: 'Disposal Masters', subtitle: 'Elite ball-winning efficiency', color: 'border-sky-500' },
    { key: 'Avg_cat_contest_clearance', title: 'Contest Beasts', subtitle: 'Dominance in the inner circle', color: 'border-red-600' },
    { key: 'Avg_cat_damaging_impact', title: 'Damage Dealers', subtitle: 'Highest score involvement rate', color: 'border-amber-500' },
    { key: 'Avg_cat_defensive_grit', title: 'Grit Machines', subtitle: 'Unrelenting defensive pressure', color: 'border-zinc-500' },
    { key: 'Avg_cat_ruck', title: 'Ruck Titans', subtitle: 'Mastery of the aerial duel', color: 'border-emerald-500' },
  ];

  return (
    <main className="min-h-screen bg-zinc-950 p-8 text-zinc-50">
      <header className="mb-12">
        <h1 className="text-4xl font-extrabold mb-2">The {season} Category Kings</h1>
        <p className="text-zinc-400 mb-6">Tracking the elite performers across every vital statistic.</p>
        
        <select 
          className="bg-zinc-900 border border-zinc-700 px-4 py-2 rounded-lg text-sm"
          value={selectedTeam}
          onChange={(e) => setSelectedTeam(e.target.value)}
        >
          {teams.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {categories.map(cat => (
          <CategoryPodium 
            key={cat.key}
            title={cat.title}
            subtitle={cat.subtitle}
            themeColor={cat.color}
            // @ts-ignore
            players={filteredData[cat.key]} 
          />
        ))}
      </section>
    </main>
  );
}
