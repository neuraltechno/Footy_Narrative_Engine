import { GetStaticProps } from "next";
import fs from "fs";
import path from "path";

type TeamData = {
  teams: { name: string; status: string; contenderScore: number; narrative: string }[];
};

export default function Teams({ data }: { data: TeamData }) {
  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans">
      <header className="mb-12">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900">AFL Team Insights</h1>
        <p className="text-xl text-zinc-600">Deep-dive analysis into team performance trends.</p>
      </header>

      <main className="grid gap-6">
        {data.teams.map((team, i) => (
          <div key={i} className="p-8 bg-white rounded-lg shadow-sm border border-zinc-200">
            <h2 className="text-2xl font-bold mb-4">{team.name}</h2>
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div className="bg-zinc-100 p-4 rounded text-center">
                <p className="text-sm text-zinc-500 uppercase tracking-wider">Status</p>
                <p className="text-xl font-bold">{team.status}</p>
              </div>
              <div className="bg-zinc-100 p-4 rounded text-center">
                <p className="text-sm text-zinc-500 uppercase tracking-wider">Contender Score</p>
                <p className="text-3xl font-bold">{team.contenderScore}</p>
              </div>
            </div>
            <p className="text-zinc-700 leading-relaxed italic border-l-4 border-zinc-900 pl-4">{team.narrative}</p>
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
