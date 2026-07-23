import React, { useMemo, useState } from 'react';
import fs from 'fs';
import path from 'path';
import SiteHeader from '../../components/SiteHeader';

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

type CumulativePoint = {
  team: string;
  round: number;
  round_metres: number;
  cumulative_metres: number;
};

type RoundTeam = {
  rank: number;
  team: string;
  total_metres: number;
};

type TopGame = {
  playerId: string;
  givenName: string;
  surname: string;
  team: string;
  jumperNumber: number;
  photoURL: string;
  round: number;
  opponent: string;
  metresGained: number;
  game_title: string;
};

type MetersGainedData = {
  generated_round: number;
  cumulative: CumulativePoint[];
  round: RoundTeam[];
  top_games: TopGame[];
};

// ─────────────────────────────────────────────────────────────────────────
// Data fetching
// ─────────────────────────────────────────────────────────────────────────

export const getStaticProps = async () => {
  try {
    const configPath = path.join(process.cwd(), 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const currentSeason = config.CURRENT_SEASON;

    const dataPath = path.join(process.cwd(), 'json', currentSeason, 'players', 'meters_gained.json');
    const data: MetersGainedData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

    return {
      props: { data, currentSeason },
      revalidate: 60,
    };
  } catch (error) {
    console.error('Static build compilation failed for meters gained data pipeline:', error);
    return {
      props: {
        data: { generated_round: 0, cumulative: [], round: [], top_games: [] },
        currentSeason: '',
      },
      revalidate: 10,
    };
  }
};

// ─────────────────────────────────────────────────────────────────────────
// Small presentational helpers
// ─────────────────────────────────────────────────────────────────────────

// Five-colour palette pulled from the site's own CSS variables so team
// lines stay on-theme rather than introducing a separate chart palette.
const LINE_PALETTE = [
  { var: 'var(--brass)', label: 'brass' },
  { var: 'var(--oxblood-light)', label: 'oxblood' },
  { var: 'var(--fern-light)', label: 'fern' },
  { var: 'var(--parchment)', label: 'parchment' },
  { var: 'var(--slate)', label: 'slate' },
] as const;

const MAX_SELECTED_TEAMS = 5;

function fmtMetres(n: number) {
  return `${Math.round(n).toLocaleString()}m`;
}

function PlayerPhoto({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !src) {
    return (
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-sm border border-[var(--hairline)] bg-[var(--ink)] font-mono text-[9px] text-[var(--slate)]">
        N/A
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-14 w-14 shrink-0 rounded-sm border border-[var(--hairline)] bg-[var(--ink)] object-cover"
    />
  );
}

function HighlightCard({
  eyebrow,
  name,
  detail,
  tone,
}: {
  eyebrow: string;
  name: string;
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
      <div className="font-display mt-1 text-lg font-medium text-[var(--parchment)]">{name}</div>
      <div className="font-mono text-xs text-[var(--slate)]">{detail}</div>
    </div>
  );
}

function TeamChip({
  label,
  color,
  active,
  onClick,
}: {
  label: string;
  color: string | null;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brass)] ${
        active
          ? 'border-[var(--brass)] text-[var(--parchment)]'
          : 'border-[var(--hairline)] text-[var(--slate)] hover:border-[var(--slate)]'
      }`}
    >
      {active && color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Cumulative build-up chart (custom SVG - no external chart dependency)
// ─────────────────────────────────────────────────────────────────────────

function CumulativeChart({
  cumulative,
  selectedTeams,
  colorFor,
  latestRound,
}: {
  cumulative: CumulativePoint[];
  selectedTeams: string[];
  colorFor: (team: string) => string;
  latestRound: number;
}) {
  const width = 900;
  const height = 380;
  const margin = { top: 20, right: 24, bottom: 36, left: 60 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  const rounds = useMemo(
    () => Array.from(new Set(cumulative.map((d) => d.round))).sort((a, b) => a - b),
    [cumulative]
  );
  const minRound = rounds.length ? rounds[0] : 0;
  const maxRound = rounds.length ? rounds[rounds.length - 1] : 1;
  const roundSpan = Math.max(1, maxRound - minRound);

  const byTeam = useMemo(() => {
    const map = new Map<string, CumulativePoint[]>();
    cumulative
      .filter((d) => selectedTeams.includes(d.team))
      .forEach((d) => {
        const arr = map.get(d.team) ?? [];
        arr.push(d);
        map.set(d.team, arr);
      });
    map.forEach((arr) => arr.sort((a, b) => a.round - b.round));
    return map;
  }, [cumulative, selectedTeams]);

  const maxY = useMemo(() => {
    let max = 0;
    byTeam.forEach((points) => {
      points.forEach((p) => {
        if (p.cumulative_metres > max) max = p.cumulative_metres;
      });
    });
    return max > 0 ? max * 1.08 : 1;
  }, [byTeam]);

  const xScale = (round: number) => margin.left + ((round - minRound) / roundSpan) * plotW;
  const yScale = (value: number) => margin.top + plotH - (value / maxY) * plotH;

  const yTicks = 4;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => (maxY / yTicks) * i);

  const xTickStep = rounds.length > 16 ? 2 : 1;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Cumulative meters gained by round">
      {/* Gridlines + Y axis labels */}
      {yTickValues.map((v, i) => (
        <g key={i}>
          <line
            x1={margin.left}
            x2={width - margin.right}
            y1={yScale(v)}
            y2={yScale(v)}
            stroke="var(--hairline)"
            strokeWidth={1}
          />
          <text
            x={margin.left - 10}
            y={yScale(v) + 3}
            textAnchor="end"
            className="font-mono"
            fontSize={10}
            fill="var(--slate)"
          >
            {fmtMetres(v)}
          </text>
        </g>
      ))}

      {/* X axis labels */}
      {rounds
        .filter((r) => (r - minRound) % xTickStep === 0)
        .map((r) => (
          <text
            key={r}
            x={xScale(r)}
            y={height - margin.bottom + 18}
            textAnchor="middle"
            className="font-mono"
            fontSize={10}
            fill="var(--slate)"
          >
            R{r}
          </text>
        ))}

      {/* Latest round marker */}
      <line
        x1={xScale(latestRound)}
        x2={xScale(latestRound)}
        y1={margin.top}
        y2={height - margin.bottom}
        stroke="var(--brass)"
        strokeWidth={1}
        strokeDasharray="3 3"
        opacity={0.6}
      />

      {/* Team lines */}
      {Array.from(byTeam.entries()).map(([team, points]) => {
        if (points.length === 0) return null;
        const color = colorFor(team);
        const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.round)},${yScale(p.cumulative_metres)}`).join(' ');
        return (
          <g key={team}>
            <path d={d} fill="none" stroke={color} strokeWidth={2} />
            {points.map((p) => (
              <circle key={p.round} cx={xScale(p.round)} cy={yScale(p.cumulative_metres)} r={2.5} fill={color}>
                <title>
                  {team} · Round {p.round} · {fmtMetres(p.cumulative_metres)} cumulative ({fmtMetres(p.round_metres)} this round)
                </title>
              </circle>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Latest round bar comparison
// ─────────────────────────────────────────────────────────────────────────

function RoundBars({ round }: { round: RoundTeam[] }) {
  const max = round.length ? Math.max(...round.map((r) => r.total_metres)) : 1;
  return (
    <div className="space-y-2">
      {round.map((r) => (
        <div key={r.team} className="flex items-center gap-3">
          <span className="w-6 shrink-0 text-right font-mono text-[10px] text-[var(--slate)]">{r.rank}</span>
          <span className="w-40 shrink-0 truncate font-mono text-[11px] text-[var(--parchment)]">{r.team}</span>
          <div className="h-3 flex-1 rounded-sm bg-[var(--hairline)]">
            <div
              className="h-3 rounded-sm bg-[var(--brass)]"
              style={{ width: `${Math.max(2, (r.total_metres / max) * 100)}%` }}
            />
          </div>
          <span className="w-16 shrink-0 text-right font-mono text-[11px] text-[var(--slate)]">
            {fmtMetres(r.total_metres)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Top 5 single-game leaderboard
// ─────────────────────────────────────────────────────────────────────────

function TopGameCard({ game, rank }: { game: TopGame; rank: number }) {
  const fullName = `${game.givenName} ${game.surname}`;
  return (
    <div className="flex items-center gap-4 rounded-sm border border-[var(--hairline)] bg-[var(--panel)] p-4">
      <span className="font-display w-8 shrink-0 text-2xl font-semibold text-[var(--brass)]">
        №{rank}
      </span>
      <PlayerPhoto src={game.photoURL} alt={fullName} />
      <div className="min-w-0 flex-1">
        <div className="font-display truncate text-base font-medium text-[var(--parchment)]">{fullName}</div>
        <div className="font-mono text-[11px] text-[var(--slate)]">{game.team}</div>
        <div className="font-mono text-[10px] text-[var(--slate)]">
          Round {game.round} vs {game.opponent}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-display text-2xl font-semibold text-[var(--fern-light)]">
          {fmtMetres(game.metresGained)}
        </div>
        <div className="font-mono text-[9px] uppercase tracking-wide text-[var(--slate)]">gained</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────

export default function MetersGained({ data, currentSeason }: { data: MetersGainedData; currentSeason: string }) {
  const allTeams = useMemo(
    () => Array.from(new Set(data.cumulative.map((d) => d.team))).sort(),
    [data.cumulative]
  );

  // Default selection: the 5 teams with the highest final cumulative total,
  // so the chart opens showing the season's ground-gained leaders.
  const finalTotals = useMemo(() => {
    const map = new Map<string, number>();
    data.cumulative.forEach((d) => {
      const current = map.get(d.team) ?? 0;
      if (d.cumulative_metres > current) map.set(d.team, d.cumulative_metres);
    });
    return map;
  }, [data.cumulative]);

  const defaultTeams = useMemo(
    () =>
      [...allTeams]
        .sort((a, b) => (finalTotals.get(b) ?? 0) - (finalTotals.get(a) ?? 0))
        .slice(0, MAX_SELECTED_TEAMS),
    [allTeams, finalTotals]
  );

  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const activeTeams = selectedTeams.length ? selectedTeams : defaultTeams;

  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    activeTeams.forEach((team, i) => map.set(team, LINE_PALETTE[i % LINE_PALETTE.length].var));
    return map;
  }, [activeTeams]);

  function toggleTeam(team: string) {
    setSelectedTeams((prev) => {
      const base = prev.length ? prev : defaultTeams;
      if (base.includes(team)) {
        return base.filter((t) => t !== team);
      }
      if (base.length >= MAX_SELECTED_TEAMS) {
        return [...base.slice(1), team];
      }
      return [...base, team];
    });
  }

  const seasonLeader = useMemo(() => {
    if (finalTotals.size === 0) return null;
    let bestTeam = '';
    let bestValue = -Infinity;
    finalTotals.forEach((v, t) => {
      if (v > bestValue) {
        bestValue = v;
        bestTeam = t;
      }
    });
    return { team: bestTeam, value: bestValue };
  }, [finalTotals]);

  const roundLeader = data.round[0] ?? null;
  const topGame = data.top_games[0] ?? null;

  return (
    <>
      <main className="font-body min-h-screen bg-[var(--ink)] px-6 py-12 text-[var(--parchment)] sm:px-10 lg:px-16">
        <div className="mx-auto max-w-6xl">
          <SiteHeader />

          {/* ── Header ───────────────────────────────────────────── */}
          <header className="mb-10 border-b border-[var(--hairline)] pb-8">
            <div className="mb-3 flex items-center gap-3 font-mono text-[11px] tracking-[0.25em] text-[var(--brass)]">
              <span className="inline-block h-px w-8 bg-[var(--brass)]" />
              TERRITORY LEDGER · {currentSeason} SEASON
            </div>
            <h1 className="font-display text-4xl font-semibold tracking-tight text-[var(--parchment)] sm:text-5xl">
              Meters Gained
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--slate)]">
              Ground won, round by round. The chart below tracks each team&apos;s cumulative meters gained across
              the season - toggle clubs on and off to compare their build-up. Below that, Round {data.generated_round}
              {' '}in isolation, and the five biggest single-game hauls recorded all year.
            </p>
          </header>

          {/* ── Highlights ───────────────────────────────────────── */}
          <section className="mb-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {seasonLeader && (
              <HighlightCard
                eyebrow="Season Cumulative Leader"
                name={seasonLeader.team}
                detail={`${fmtMetres(seasonLeader.value)} gained to date`}
                tone="brass"
              />
            )}
            {roundLeader && (
              <HighlightCard
                eyebrow={`Round ${data.generated_round} Leader`}
                name={roundLeader.team}
                detail={`${fmtMetres(roundLeader.total_metres)} this round`}
                tone="fern"
              />
            )}
            {topGame && (
              <HighlightCard
                eyebrow="Biggest Single-Game Gain"
                name={`${topGame.givenName.charAt(0)}. ${topGame.surname}`}
                detail={`${fmtMetres(topGame.metresGained)} · Round ${topGame.round} vs ${topGame.opponent}`}
                tone="oxblood"
              />
            )}
          </section>

          {/* ── Cumulative chart ─────────────────────────────────── */}
          <section className="mb-12">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-xl font-medium text-[var(--parchment)]">Cumulative Build-Up</h2>
              <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--slate)]">
                Up to {MAX_SELECTED_TEAMS} clubs at once
              </span>
            </div>
            <div className="rounded-sm border border-[var(--hairline)] bg-[var(--panel)] p-4">
              {data.cumulative.length === 0 ? (
                <div className="px-6 py-16 text-center font-mono text-xs uppercase tracking-wide text-[var(--slate)]">
                  No meters gained data available.
                </div>
              ) : (
                <CumulativeChart
                  cumulative={data.cumulative}
                  selectedTeams={activeTeams}
                  colorFor={(team) => colorMap.get(team) ?? 'var(--slate)'}
                  latestRound={data.generated_round}
                />
              )}
              <div className="mt-4 flex flex-wrap gap-1.5 border-t border-[var(--hairline)] pt-4">
                {allTeams.map((team) => (
                  <TeamChip
                    key={team}
                    label={team}
                    color={colorMap.get(team) ?? null}
                    active={activeTeams.includes(team)}
                    onClick={() => toggleTeam(team)}
                  />
                ))}
              </div>
            </div>
          </section>

          {/* ── Latest round bars ────────────────────────────────── */}
          <section className="mb-12">
            <h2 className="font-display mb-3 text-xl font-medium text-[var(--parchment)]">
              Round {data.generated_round} · Team Totals
            </h2>
            <div className="rounded-sm border border-[var(--hairline)] bg-[var(--panel)] p-4">
              {data.round.length === 0 ? (
                <div className="px-6 py-16 text-center font-mono text-xs uppercase tracking-wide text-[var(--slate)]">
                  No data available for this round.
                </div>
              ) : (
                <RoundBars round={data.round} />
              )}
            </div>
          </section>

          {/* ── Top 5 single-game leaderboard ────────────────────── */}
          <section className="mb-8">
            <h2 className="font-display mb-3 text-xl font-medium text-[var(--parchment)]">
              Top 5 Games This Season
            </h2>
            {data.top_games.length === 0 ? (
              <div className="rounded-sm border border-dashed border-[var(--hairline)] px-6 py-16 text-center">
                <p className="font-mono text-xs uppercase tracking-wide text-[var(--slate)]">
                  No qualifying games recorded yet.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {data.top_games.map((game, idx) => (
                  <TopGameCard key={`${game.playerId}-${game.round}`} game={game} rank={idx + 1} />
                ))}
              </div>
            )}
          </section>

          {/* ── Legend ───────────────────────────────────────────── */}
          <div className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-[10px] uppercase tracking-wide text-[var(--slate)]">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-px w-4 border-t border-dashed border-[var(--brass)]" /> Latest round marker
            </span>
            <span>Click a club chip to add or swap it into the cumulative chart</span>
          </div>
        </div>
      </main>
    </>
  );
}