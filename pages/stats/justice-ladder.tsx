import React, { useMemo, useState } from 'react';
import fs from 'fs';
import path from 'path';
import SiteHeader from '../../components/SiteHeader';

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

type TeamJustice = {
  team: string;
  Games_Played: number;
  Justice_Rank: number;
  Actual_Rank: number;
  Rank_Delta: number;
  Expected_Points: number;
  Actual_Points: number;
  Luck_Rating: number;
  Luck_Rating_Per_Game: number;
  Pythagorean_Expected_Points: number;
  Pythagorean_Luck: number;
  Home_Luck_Rating: number;
  Away_Luck_Rating: number;
  Rolling_Games: number;
  Rolling_Luck_Rating: number;
  Expected_Percent: number;
  Actual_Percent: number;
  Percent_Delta: number;
  Net_xScore_Marg: number;
  Strength_Of_Schedule: number;
  Low_Sample_Warning: boolean;
  Luck_Status: string;
  Justice_Rank_Prev: number;
  Luck_Rating_Prev: number;
  Justice_Rank_Movement: number;
  Luck_Rating_Change: number;
};

type SortKey = 'Justice_Rank' | 'Luck_Rating' | 'Rank_Delta' | 'Justice_Rank_Movement';

// ─────────────────────────────────────────────────────────────────────────
// Data fetching (unchanged contract)
// ─────────────────────────────────────────────────────────────────────────

export async function getServerSideProps() {
  const configPath = path.join(process.cwd(), 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const currentSeason = config.CURRENT_SEASON;

  const dataPath = path.join(process.cwd(), 'json', currentSeason, 'league', 'justice_ladder.json');
  const data: TeamJustice[] = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  return {
    props: { data, currentSeason },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Small presentational helpers
// ─────────────────────────────────────────────────────────────────────────

function verdict(status: string) {
  if (status.startsWith('Lucky')) {
    return { label: 'LUCKY', tone: 'brass' as const };
  }
  if (status.startsWith('Cursed')) {
    return { label: 'CURSED', tone: 'oxblood' as const };
  }
  return { label: 'BALANCED', tone: 'slate' as const };
}

function ToneText({ tone, children, className = '' }: { tone: 'brass' | 'oxblood' | 'fern' | 'slate'; children: React.ReactNode; className?: string }) {
  const map = {
    brass: 'text-[var(--brass)]',
    oxblood: 'text-[var(--oxblood-light)]',
    fern: 'text-[var(--fern-light)]',
    slate: 'text-[var(--slate)]',
  };
  return <span className={`${map[tone]} ${className}`}>{children}</span>;
}

function Stamp({ status }: { status: string }) {
  const { label, tone } = verdict(status);
  const border = {
    brass: 'border-[var(--brass)] text-[var(--brass)]',
    oxblood: 'border-[var(--oxblood-light)] text-[var(--oxblood-light)]',
    slate: 'border-[var(--slate)] text-[var(--slate)]',
  }[tone];
  return (
    <span
      className={`inline-block select-none rounded-sm border-[1.5px] px-2 py-0.5 font-mono text-[10px] font-bold tracking-[0.18em] ${border}`}
      style={{ transform: 'rotate(-2deg)' }}
    >
      {label}
    </span>
  );
}

function MovementArrow({ value }: { value: number }) {
  if (value === 0) return <span className="text-[var(--slate)] font-mono text-xs">—</span>;
  const up = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 font-mono text-xs ${up ? 'text-[var(--fern-light)]' : 'text-[var(--oxblood-light)]'}`}>
      <svg width="8" height="8" viewBox="0 0 10 10" className={up ? '' : 'rotate-180'}>
        <path d="M5 0 L10 8 L0 8 Z" fill="currentColor" />
      </svg>
      {Math.abs(value)}
    </span>
  );
}

function PointsBar({ expected, actual, max }: { expected: number; actual: number; max: number }) {
  const expPct = Math.min(100, (expected / max) * 100);
  const actPct = Math.min(100, (actual / max) * 100);
  return (
    <div className="w-28">
      <div className="relative h-1.5 rounded-full bg-[var(--hairline)]">
        <div
          className="absolute top-1/2 h-2 w-2 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-[var(--ink)] bg-[var(--brass)]"
          style={{ left: `${expPct}%` }}
          title={`Expected: ${expected.toFixed(1)}`}
        />
        <div
          className="absolute top-1/2 h-2 w-2 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-[var(--ink)] bg-[var(--parchment)]"
          style={{ left: `${actPct}%` }}
          title={`Actual: ${actual}`}
        />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-[var(--slate)]">
        <span>{expected.toFixed(1)}</span>
        <span className="text-[var(--parchment)]">{actual}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────

export default function JusticeLadder({ data, currentSeason }: { data: TeamJustice[]; currentSeason: string }) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('Justice_Rank');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [expanded, setExpanded] = useState<string | null>(null);

  const maxPoints = useMemo(
    () => Math.max(...data.map((t) => Math.max(t.Expected_Points, t.Actual_Points))) * 1.08,
    [data]
  );

  const luckiest = useMemo(
    () => data.reduce((a, b) => (b.Luck_Rating > a.Luck_Rating ? b : a)),
    [data]
  );
  const cursed = useMemo(
    () => data.reduce((a, b) => (b.Luck_Rating < a.Luck_Rating ? b : a)),
    [data]
  );
  const biggestMover = useMemo(
    () => data.reduce((a, b) => (Math.abs(b.Rank_Delta) > Math.abs(a.Rank_Delta) ? b : a)),
    [data]
  );

  const rows = useMemo(() => {
    const filtered = data.filter((t) => t.team.toLowerCase().includes(query.toLowerCase()));
    const sorted = [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return sorted;
  }, [data, query, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  return (
    <>
      

      <main className="font-body min-h-screen bg-[var(--ink)] px-6 py-12 text-[var(--parchment)] sm:px-10 lg:px-16">
        <div className="mx-auto max-w-6xl">

                    <SiteHeader />
          
          {/* ── Header ───────────────────────────────────────────── */}
          <header className="mb-10 border-b border-[var(--hairline)] pb-8">
            <div className="mb-3 flex items-center gap-3 font-mono text-[11px] tracking-[0.25em] text-[var(--brass)]">
              <span className="inline-block h-px w-8 bg-[var(--brass)]" />
              TRIBUNAL RULING · {currentSeason} SEASON
            </div>
            <h1 className="font-display text-4xl font-semibold tracking-tight text-[var(--parchment)] sm:text-5xl">
              The Justice Ladder
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--slate)]">
              Every team's actual ladder position, cross-examined against what their on-field performance
              says they deserved. A negative luck index means the result flattered them; a positive index
              means the fixture list owes them one.
            </p>
          </header>

          {/* ── Case highlights ─────────────────────────────────── */}
          <section className="mb-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <HighlightCard
              eyebrow="Luckiest Verdict"
              team={luckiest.team}
              detail={`+${luckiest.Luck_Rating.toFixed(1)} luck index`}
              tone="brass"
            />
            <HighlightCard
              eyebrow="Most Cursed"
              team={cursed.team}
              detail={`${cursed.Luck_Rating.toFixed(1)} luck index`}
              tone="oxblood"
            />
            <HighlightCard
              eyebrow="Biggest Miscarriage"
              team={biggestMover.team}
              detail={`${biggestMover.Rank_Delta > 0 ? '+' : ''}${biggestMover.Rank_Delta} rank delta`}
              tone="fern"
            />
          </section>

          {/* ── Controls ─────────────────────────────────────────── */}
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search club…"
              className="w-full max-w-xs rounded-sm border border-[var(--hairline)] bg-[var(--panel)] px-3 py-2 font-mono text-xs text-[var(--parchment)] placeholder:text-[var(--slate)] focus:border-[var(--brass)] focus:outline-none"
            />
            <div className="flex gap-2 font-mono text-[11px] tracking-wide text-[var(--slate)]">
              <SortButton label="Justice Rank" active={sortKey === 'Justice_Rank'} dir={sortDir} onClick={() => toggleSort('Justice_Rank')} />
              <SortButton label="Luck Index" active={sortKey === 'Luck_Rating'} dir={sortDir} onClick={() => toggleSort('Luck_Rating')} />
              <SortButton label="Rank Δ" active={sortKey === 'Rank_Delta'} dir={sortDir} onClick={() => toggleSort('Rank_Delta')} />
            </div>
          </div>

          {/* ── Docket / table ───────────────────────────────────── */}
          <div className="overflow-x-auto rounded-sm border border-[var(--hairline)]">
            <table className="w-full min-w-[860px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--hairline)] font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--slate)]">
                  <th className="p-4 font-medium">Case №</th>
                  <th className="p-4 font-medium">Club</th>
                  <th className="p-4 font-medium">Ladder Pos.</th>
                  <th className="p-4 font-medium">Verdict Δ</th>
                  <th className="p-4 font-medium">Points (Exp / Act)</th>
                  <th className="p-4 font-medium">Luck Index</th>
                  <th className="p-4 font-medium">Ruling</th>
                  <th className="w-8 p-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--hairline)]">
                {rows.map((team) => {
                  const isOpen = expanded === team.team;
                  return (
                    <React.Fragment key={team.team}>
                      <tr
                        onClick={() => setExpanded(isOpen ? null : team.team)}
                        className="cursor-pointer transition-colors hover:bg-[var(--panel-hover)]"
                      >
                        <td className="p-4 align-top">
                          <div className="flex items-center gap-2">
                            <span className="font-display text-xl font-semibold text-[var(--brass)]">
                              {String(team.Justice_Rank).padStart(2, '0')}
                            </span>
                            <MovementArrow value={team.Justice_Rank_Movement} />
                          </div>
                        </td>
                        <td className="p-4 align-top">
                          <span className="font-display text-base font-medium">{team.team}</span>
                          {team.Low_Sample_Warning && (
                            <div className="mt-1 font-mono text-[9px] uppercase tracking-wide text-[var(--oxblood-light)]">
                              ⚠ small sample
                            </div>
                          )}
                        </td>
                        <td className="p-4 align-top font-mono text-sm text-[var(--slate)]">{team.Actual_Rank}</td>
                        <td className="p-4 align-top font-mono text-sm">
                          <ToneText tone={team.Rank_Delta > 0 ? 'fern' : team.Rank_Delta < 0 ? 'oxblood' : 'slate'}>
                            {team.Rank_Delta > 0 ? '+' : ''}
                            {team.Rank_Delta}
                          </ToneText>
                        </td>
                        <td className="p-4 align-top">
                          <PointsBar expected={team.Expected_Points} actual={team.Actual_Points} max={maxPoints} />
                        </td>
                        <td className="p-4 align-top font-mono text-sm">
                          <ToneText tone={team.Luck_Rating > 0 ? 'brass' : team.Luck_Rating < 0 ? 'oxblood' : 'slate'}>
                            {team.Luck_Rating > 0 ? '+' : ''}
                            {team.Luck_Rating.toFixed(1)}
                          </ToneText>
                        </td>
                        <td className="p-4 align-top">
                          <Stamp status={team.Luck_Status} />
                        </td>
                        <td className="p-4 align-top text-[var(--slate)]">
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 10 10"
                            className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
                          >
                            <path d="M0 3 L5 8 L10 3" fill="none" stroke="currentColor" strokeWidth="1.5" />
                          </svg>
                        </td>
                      </tr>

                      {isOpen && (
                        <tr className="bg-[var(--panel)]">
                          <td colSpan={8} className="px-4 pb-6 pt-2">
                            <div className="grid grid-cols-2 gap-x-8 gap-y-3 border-l-2 border-[var(--brass)] pl-5 font-mono text-xs sm:grid-cols-4">
                              <DetailStat label="Home Luck" value={team.Home_Luck_Rating.toFixed(1)} />
                              <DetailStat label="Away Luck" value={team.Away_Luck_Rating.toFixed(1)} />
                              <DetailStat
                                label={`Last ${team.Rolling_Games} Games`}
                                value={team.Rolling_Luck_Rating.toFixed(1)}
                              />
                              <DetailStat label="Pythagorean Luck" value={team.Pythagorean_Luck.toFixed(1)} />
                              <DetailStat label="Expected %" value={team.Expected_Percent.toFixed(1)} />
                              <DetailStat label="Actual %" value={team.Actual_Percent.toFixed(1)} />
                              <DetailStat label="Net xScore Margin" value={team.Net_xScore_Marg.toFixed(1)} />
                              <DetailStat label="Strength of Schedule" value={team.Strength_Of_Schedule.toFixed(1)} />
                            </div>
                            <p className="mt-4 pl-5 text-xs italic text-[var(--slate)]">
                              Previously ranked №{team.Justice_Rank_Prev} at {team.Luck_Rating_Prev.toFixed(1)} —{' '}
                              {team.Luck_Rating_Change > 0 ? 'trending luckier' : team.Luck_Rating_Change < 0 ? 'trending more cursed' : 'holding steady'} ({team.Luck_Rating_Change > 0 ? '+' : ''}
                              {team.Luck_Rating_Change.toFixed(1)}).
                            </p>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Legend ───────────────────────────────────────────── */}
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[10px] uppercase tracking-wide text-[var(--slate)]">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[var(--brass)]" /> Expected points
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[var(--parchment)]" /> Actual points
            </span>
            <span>Positive luck index = overachieved (lucky) · Negative = underachieved (cursed)</span>
          </div>
        </div>
      </main>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────

function HighlightCard({
  eyebrow,
  team,
  detail,
  tone,
}: {
  eyebrow: string;
  team: string;
  detail: string;
  tone: 'brass' | 'oxblood' | 'fern';
}) {
  const border = {
    brass: 'border-[var(--brass)]',
    oxblood: 'border-[var(--oxblood-light)]',
    fern: 'border-[var(--fern-light)]',
  }[tone];
  return (
    <div className={`rounded-sm border-l-2 bg-[var(--panel)] px-4 py-3 ${border}`}>
      <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--slate)]">{eyebrow}</div>
      <div className="font-display mt-1 text-lg font-medium text-[var(--parchment)]">{team}</div>
      <div className="font-mono text-xs text-[var(--slate)]">{detail}</div>
    </div>
  );
}

function SortButton({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: 'asc' | 'desc';
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-sm border px-2.5 py-1.5 transition-colors ${
        active
          ? 'border-[var(--brass)] text-[var(--brass)]'
          : 'border-[var(--hairline)] text-[var(--slate)] hover:border-[var(--slate)]'
      }`}
    >
      {label} {active ? (dir === 'asc' ? '↑' : '↓') : ''}
    </button>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wide text-[var(--slate)]">{label}</div>
      <div className="text-[var(--parchment)]">{value}</div>
    </div>
  );
}