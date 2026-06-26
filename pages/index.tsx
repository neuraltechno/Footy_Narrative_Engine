import { GetStaticProps } from "next";
import fs from "fs";
import path from "path";
import Link from "next/link";

type InsightData = {
  round: number;
  teams: { name: string; status: string; contenderScore: number }[];
  top_players: { name: string; pir_per_game: number }[];
  top10Players: { 
    "player.givenName": string; 
    "player.surname": string; 
    "Season_Avg_PIR": number;
    "player.team"?: string; // Matches layout structure of game performances
  }[];
  top10Games: { "givenName": string; "surname": string; "PIR": number; "game_title": string }[];
  topCategoryKings: { category: string; leader: { name: string; score: number } }[];
};

// Helper to determine status badge styling dynamically
const getStatusColor = (status: string) => {
  const s = status.toLowerCase();
  if (s.includes("contender") || s.includes("rising") || s.includes("up")) {
    return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  }
  if (s.includes("falling") || s.includes("struggling") || s.includes("down")) {
    return "bg-rose-500/10 text-rose-400 border-rose-500/20";
  }
  return "bg-amber-500/10 text-amber-400 border-amber-500/20";
};

export default function Home({ data }: { data: InsightData }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-blue-500/30 selection:text-blue-200 relative overflow-hidden">
      {/* Subtle background tech grid lines */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293708_1px,transparent_1px),linear-gradient(to_bottom,#1f293708_1px,transparent_1px)] bg-[size:4rem_4rem] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        
        {/* Header Console */}
        <header className="mb-16 flex flex-col md:flex-row md:items-end md:justify-between gap-6 border-b border-zinc-800 pb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-semibold text-blue-400 uppercase tracking-wider mb-3">
              ⚡ Stat-Engine Active
            </div>
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
              AFL Footy Narrative Engine
            </h1>
            <p className="text-zinc-400 mt-2 text-lg">
              Advanced performance indexes & analytic narratives for <span className="text-white font-semibold">Round {data.round}</span>
            </p>
          </div>
          
          {/* Quick Navigation Controls */}
          <nav className="flex flex-wrap gap-2">
            <Link href="/teams" className="px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-sm font-medium transition text-zinc-300 hover:text-white">
              Team Insights &rarr;
            </Link>
            <Link href="/players" className="px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-sm font-medium transition text-zinc-300 hover:text-white">
              Player Ratings &rarr;
            </Link>
            <Link href="/records/top-games" className="px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-sm font-medium transition text-zinc-300 hover:text-white">
              Top Games &rarr;
            </Link>
            <Link href="/stats/category-kings" className="px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-sm font-medium transition text-zinc-300 hover:text-white">
              Category Kings &rarr;
            </Link>
            <Link href="/stats/breakout-watch" className="px-4 py-2 rounded-lg bg-emerald-900/20 border border-emerald-500/30 hover:border-emerald-500/50 text-sm font-medium transition text-emerald-300 hover:text-white">
              Breakout Watch &rarr;
            </Link>
          </nav>

        </header>

        {/* Dashboard Panels */}
        <main className="space-y-16">
          
          {/* Row 1: Dynamic Narrative Indexes */}
          <section className="grid lg:grid-cols-2 gap-8">
            {/* Trending Teams Panel */}
            <div className="bg-zinc-900/40 backdrop-blur-sm border border-zinc-800/80 rounded-2xl p-6 sm:p-8">
              <div className="mb-6">
                <h2 className="text-xl font-bold tracking-tight text-white">Trending Teams</h2>
                <p className="text-xs text-zinc-500 mt-1">Calculated power rankings and flag readiness</p>
              </div>
              <div className="space-y-3">
                {data.teams.map((t, i) => (
                  <div key={i} className="group flex justify-between items-center p-4 bg-zinc-900/60 border border-zinc-800/50 rounded-xl hover:border-zinc-700 transition duration-200">
                    <div className="flex items-center gap-3">
                      <span className="text-zinc-300 font-semibold tracking-wide group-hover:text-blue-400 transition">{t.name}</span>
                      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${getStatusColor(t.status)}`}>
                        {t.status}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-mono font-bold bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-200 group-hover:text-white group-hover:bg-zinc-900 transition">
                        {t.contenderScore}<span className="text-zinc-600 text-xs font-normal">/100</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Breakout Watch Panel */}
            <div className="bg-zinc-900/40 backdrop-blur-sm border border-zinc-800/80 rounded-2xl p-6 sm:p-8">
              <div className="mb-6">
                <h2 className="text-xl font-bold tracking-tight text-white">Breakout Watch (Top PIR)</h2>
                <p className="text-xs text-zinc-500 mt-1">Players drastically outperforming historical expectations</p>
              </div>
              <div className="space-y-3">
                {data.top_players.map((p, i) => (
                  <div key={i} className="group flex justify-between items-center p-4 bg-zinc-900/60 border border-zinc-800/50 rounded-xl hover:border-zinc-700 transition duration-200">
                    <span className="text-zinc-300 font-medium group-hover:text-blue-400 transition">{p.name}</span>
                    <span className="text-xs font-mono font-bold text-blue-400 bg-blue-500/5 px-2.5 py-1 rounded-lg border border-blue-500/10">
                      PIR {p.pir_per_game.toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Row 2: Symmetric Leaderboards */}
          <section className="grid lg:grid-cols-2 gap-8">
            {/* Top 10 Season Leaders Leaderboard */}
            <div className="bg-zinc-900/20 border border-zinc-900 rounded-2xl p-6">
              <div className="flex justify-between items-center mb-6 pb-4 border-b border-zinc-900">
                <div>
                  <h2 className="text-lg font-bold text-white">Top 10 Season Leaders</h2>
                  <p className="text-xs text-zinc-500">Highest Season Average PIR</p>
                </div>
                <Link href="/players" className="text-xs font-medium text-blue-400 hover:text-blue-300 transition">
                  View All &rarr;
                </Link>
              </div>
              <div className="divide-y divide-zinc-900/60">
                {data.top10Players.map((p, i) => (
                  <div key={i} className="flex justify-between items-center py-3 group">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono text-xs text-zinc-600 w-4 font-bold">{i + 1}</span>
                      <div className="min-w-0">
                        <p className="text-zinc-300 text-sm group-hover:text-white transition truncate font-medium">
                          {p["player.givenName"]} {p["player.surname"]}
                        </p>
                        {/* Club name matching structural placement of match metadata */}
                        <p className="text-[10px] text-zinc-500 truncate uppercase tracking-wider">
                          {p["player.team"] || "AFL Club"}
                        </p>
                      </div>
                    </div>
                    <span className="font-mono text-xs font-semibold text-zinc-400 bg-zinc-900/80 px-2 py-1 rounded border border-zinc-800/50 shrink-0 ml-4">
                      {p["Season_Avg_PIR"].toFixed(1)} <span className="text-[10px] text-zinc-600">AVG</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top 10 Single Match Performances */}
            <div className="bg-zinc-900/20 border border-zinc-900 rounded-2xl p-6">
              <div className="flex justify-between items-center mb-6 pb-4 border-b border-zinc-900">
                <div>
                  <h2 className="text-lg font-bold text-white">Top 10 Match Performances</h2>
                  <p className="text-xs text-zinc-500">Highest individual single-game scores</p>
                </div>
                <Link href="/records/top-games" className="text-xs font-medium text-blue-400 hover:text-blue-300 transition">
                  View All &rarr;
                </Link>
              </div>
              <div className="divide-y divide-zinc-900/60">
                {data.top10Games.map((g, i) => (
                  <div key={i} className="flex justify-between items-center py-3 group">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono text-xs text-zinc-600 w-4 font-bold">{i + 1}</span>
                      <div className="min-w-0">
                        <p className="text-zinc-300 text-sm group-hover:text-white transition truncate font-medium">
                          {g.givenName} {g.surname}
                        </p>
                        <p className="text-[10px] text-zinc-500 truncate">{g.game_title}</p>
                      </div>
                    </div>
                    <span className="font-mono text-xs font-bold text-emerald-400 bg-emerald-500/5 px-2 py-1 rounded border border-emerald-500/10 ml-4 shrink-0">
                      {g.PIR.toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            </section>

            {/* Category Kings */}
            <section className="bg-zinc-900/20 border border-zinc-900 rounded-2xl p-6">
              <div className="flex justify-between items-center mb-6 pb-4 border-b border-zinc-900">
                <div>
                  <h2 className="text-lg font-bold text-white">Category Kings</h2>
                  <p className="text-xs text-zinc-500">Top performers by specialized skill</p>
                </div>
                <Link href="/stats/category-kings" className="text-xs font-medium text-blue-400 hover:text-blue-300 transition">
                  View All &rarr;
                </Link>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {data.topCategoryKings.map((item, i) => (
                  <div key={i} className="bg-zinc-900/40 p-4 rounded-xl border border-zinc-800">
                    <p className="text-[10px] uppercase text-zinc-500 font-bold tracking-wider">{item.category}</p>
                    <p className="text-sm font-semibold text-white mt-1">{item.leader.name}</p>
                    <p className="text-xs text-blue-400 font-mono mt-0.5">{item.leader.score.toFixed(1)}</p>
                  </div>
                ))}
              </div>
            </section>

          </main>
        </div>
      </div>
  );
}

export const getStaticProps: GetStaticProps = async () => {
  const filePath = path.join(process.cwd(), "data", "latest_insights.json");
  const jsonData = fs.readFileSync(filePath, "utf-8");
  const data = JSON.parse(jsonData);

  const playersFilePath = path.join(process.cwd(), "data", "processed", "players_pir.json");
  const playersData = JSON.parse(fs.readFileSync(playersFilePath, "utf-8"));
  const top10Players = playersData
    .sort((a: any, b: any) => b.Season_Avg_PIR - a.Season_Avg_PIR)
    .slice(0, 10);

  const gamesFilePath = path.join(process.cwd(), "data", "processed", "top_games_pir.json");
  const gamesData = JSON.parse(fs.readFileSync(gamesFilePath, "utf-8"));
  const top10Games = gamesData
    .sort((a: any, b: any) => b.PIR - a.PIR)
    .slice(0, 10);

  const categoryKingsFilePath = path.join(process.cwd(), "data", "processed", "category_kings.json");
  const categoryKingsData = JSON.parse(fs.readFileSync(categoryKingsFilePath, "utf-8"));
  const topCategoryKings = Object.entries(categoryKingsData).map(([key, value]: [string, any]) => ({
    category: key.replace("Avg_cat_", "").replace(/_/g, " "),
    leader: value[0]
  }));

  return {
    props: { 
      data: { 
        ...data, 
        top10Players, 
        top10Games,
        topCategoryKings
      } 
    },
    revalidate: 60,
  };
};