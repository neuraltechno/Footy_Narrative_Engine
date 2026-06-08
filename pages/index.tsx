import { GetStaticProps } from "next";
import fs from "fs";
import path from "path";
import Link from "next/link";

type InsightData = {
  round: number;
  teams: { name: string; status: string; contenderScore: number }[];
  top_players: { name: string; pir_per_game: number }[];
};

export default function Home({ data }: { data: InsightData }) {
  return (
    <div className="min-h-screen bg-zinc-950 p-8 font-sans text-zinc-100">
      <header className="mb-12 flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-white">AFL Footy Narrative Engine</h1>
          <p className="text-xl text-zinc-400">Round {data.round} Insights</p>
        </div>
        <div className="flex space-x-6">
          <Link href="/teams" className="text-blue-400 hover:underline font-semibold">
            View Team Insights →
          </Link>
          <Link href="/players" className="text-blue-400 hover:underline font-semibold">
            View Player Ratings →
          </Link>
        </div>
      </header>

      <main className="grid gap-12">
        <section className="grid md:grid-cols-2 gap-12">
          <div>
            <h2 className="text-2xl font-semibold mb-6 text-zinc-200">Trending Teams</h2>
            <ul className="space-y-4">
              {data.teams.map((t, i) => (
                <li key={i} className="flex justify-between items-center p-4 bg-zinc-900 rounded-lg shadow-sm border border-zinc-800">
                  <span className="font-medium text-zinc-200">{t.name} ({t.status})</span>
                  <span className="text-sm font-bold bg-zinc-800 text-zinc-100 px-3 py-1 rounded-full border border-zinc-700">{t.contenderScore}/100</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-6 text-zinc-200">Breakout Watch (Top PIR)</h2>
            <ul className="space-y-4">
              {data.top_players.map((p, i) => (
                <li key={i} className="flex justify-between items-center p-4 bg-zinc-900 rounded-lg shadow-sm border border-zinc-800">
                  <span className="font-medium text-zinc-200">{p.name}</span>
                  <span className="text-sm font-bold bg-zinc-800 text-zinc-100 px-3 py-1 rounded-full border border-zinc-700">PIR: {p.pir_per_game.toFixed(1)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}

export const getStaticProps: GetStaticProps = async () => {
  const filePath = path.join(process.cwd(), "data", "latest_insights.json");
  const jsonData = fs.readFileSync(filePath, "utf-8");
  const data = JSON.parse(jsonData);

  return {
    props: { data },
    revalidate: 60,
  };
};
