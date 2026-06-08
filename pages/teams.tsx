import { GetStaticProps } from "next";
import fs from "fs";
import path from "path";
import Link from "next/link";

type TeamData = {
  teams: { name: string; status: string; contenderScore: number; narrative: string }[];
};

export default function Teams({ data }: { data: TeamData }) {
  return (
    <div className="min-h-screen bg-zinc-950 p-8 font-sans text-zinc-100">
      <header className="mb-12 flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-white">AFL Team Insights</h1>
          <p className="text-xl text-zinc-400">Deep-dive analysis into team performance trends.</p>
        </div>
        <Link href="/" className="text-blue-400 hover:underline font-semibold">
          ← Back to Dashboard
        </Link>
      </header>

      <main className="grid gap-6">
        {data.teams.map((team, i) => (
          <div key={i} className="p-8 bg-zinc-900 rounded-lg shadow-sm border border-zinc-800">
            <h2 className="text-2xl font-bold mb-4 text-white">{team.name}</h2>
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div className="bg-zinc-950 p-4 rounded text-center border border-zinc-800">
                <p className="text-sm text-zinc-500 uppercase tracking-wider">Status</p>
                <p className="text-xl font-bold text-zinc-200">{team.status}</p>
              </div>
              <div className="bg-zinc-950 p-4 rounded text-center border border-zinc-800">
                <p className="text-sm text-zinc-500 uppercase tracking-wider">Contender Score</p>
                <p className="text-3xl font-bold text-zinc-100">{team.contenderScore}</p>
              </div>
            </div>
            <p className="text-zinc-300 leading-relaxed italic border-l-4 border-blue-500 pl-4 bg-zinc-950/50 py-3 pr-4 rounded-r">{team.narrative}</p>
          </div>
        ))}
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
