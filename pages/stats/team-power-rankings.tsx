import React, { useMemo, useState } from 'react';
import fs from 'fs';
import path from 'path';

// ─────────────────────────────────────────────────────────────────────────
// Types
//
// power_rankings.json is one row per team: the current rolling-form
// snapshot (see 60_power_rankings.R). team_metrics_history.json is every
// round for every team (see 30_team_metrics.R) - it's what powers the
// per-team line breakdown and season sparkline below the fold.
// ─────────────────────────────────────────────────────────────────────────

type Trend = 'Surging' | 'Steady' | 'Faltering';

type PowerRanking = {
  team: string;
  round: number;
  rounds_in_window: number;
  rolling_overall_rating: number;
  rolling_system_velocity: number;
  power_score: number;
  trend: Trend;
  power_rank: number;
};

type TeamRoundMetrics = {
  round: number;
  team: string;
  engine_room_pir: number;
  iron_curtain_pir: number;
  the_arsenal_pir: number;
  total_player_pir: number;
  DI_for: number | null;
  approx_round_disposals: number;
  system_velocity: number;
  overall_rating: number;
};

// ─────────────────────────────────────────────────────────────────────────
// Data fetching
// ─────────────────────────────────────────────────────────────────────────

function safeRead<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`Static build compilation failed reading ${filePath}:`, error);
    return fallback;
  }
}

export const getStaticProps = async () => {
  try {
    const configPath = path.join(process.cwd(), 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const currentSeason = config.CURRENT_SEASON;
    const leagueDir = (file: string) => path.join(process.cwd(), 'json', currentSeason, 'league', file);
    const teamsDir = (file: string) => path.join(process.cwd(), 'json', currentSeason, 'teams', file);

    const powerRankings: PowerRanking[] = safeRead(leagueDir('power_rankings.json'), []);
    const teamHistory: TeamRoundMetrics[] = safeRead(teamsDir('team_metrics_history.json'), []);

    return {
      props: { powerRankings, teamHistory, currentSeason },
      revalidate: 60,
    };
  } catch (error) {
    console.error('Static build compilation failed for power rankings pipeline:', error);
    return {
      props: { powerRankings: [], teamHistory: [], currentSeason: '' },
      revalidate: 10,
    };
  }
};

// ─────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────

function formatStatValue(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(decimals);
}

function initials(team: string): string {
  const words = team.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[words.length - 2][0] + words[words.length - 1][0]).toUpperCase();
}

// Deterministic accent per team so the same club always gets the same
// monogram colour across a session, without hand-maintaining a team->colour
// map as clubs get added/renamed.
const MONOGRAM_PALETTE = ['--brass', '--fern-light', '--oxblood-light', '--brass-bright'] as const;
function monogramColor(team: string): string {
  let hash = 0;
  for (let i = 0; i < team.length; i++) hash = (hash * 31 + team.charCodeAt(i)) >>> 0;
  return `var(${MONOGRAM_PALETTE[hash % MONOGRAM_PALETTE.length]})`;
}

const TREND_STYLE: Record<Trend, { border: string; text: string; glyph: string }> = {
  Surging: { border: 'border-[var(--fern-light)]', text: 'text-[var(--fern-light)]', glyph: '▲' },
  Steady: { border: 'border-[var(--slate)]', text: 'text-[var(--slate)]', glyph: '▬' },
  Faltering: { border: 'border-[var(--oxblood-light)]', text: 'text-[var(--oxblood-light)]', glyph: '▼' },
};

// Line-breakdown categories, in a fixed order, with the colour language
// carried over onto the Match Centre page for the same three categories.
const LINE_CATEGORIES: { key: keyof TeamRoundMetrics; label: string; sub: string; color: string }[] = [
  { key: 'engine_room_pir', label: 'Engine Room', sub: 'Midfield + Ruck', color: 'var(--brass)' },
  { key: 'iron_curtain_pir', label: 'Iron Curtain', sub: 'Backs', color: 'var(--fern-light)' },
  { key: 'the_arsenal_pir', label: 'The Arsenal', sub: 'Forwards', color: 'var(--oxblood-light)' },
];

// ─────────────────────────────────────────────────────────────────────────
// Small presentational helpers
// ─────────────────────────────────────────────────────────────────────────

function TeamMonogram({ team, size = 12 }: { team: string; size?: number }) {
  const dim = `h-${size} w-${size}`;
  const color = monogramColor(team);
  return (
    <div
      className={`flex ${dim} shrink-0 items-center justify-center rounded-sm border bg-[var(--ink)] font-display text-xs font-semibold`}
      style={{ borderColor: color, color }}
    >
      {initials(team)}
    </div>
  );
}

function TrendBadge({ trend }: { trend: Trend }) {
  const s = TREND_STYLE[trend];
  return (
    <span className={`inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${s.border} ${s.text}`}>
      <span>{s.glyph}</span>
      {trend}
    </span>
  );
}

function PowerRankBadge({ rank }: { rank: number }) {
  const medal = rank === 1 ? 'text-[var(--brass-bright)]' : rank <= 4 ? 'text-[var(--brass)]' : 'text-[var(--slate)]';
  return <span className={`font-display text-xl font-semibold ${medal}`}>№{String(rank).padStart(2, '0')}</span>;
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-sm border border-dashed border-[var(--hairline)] px-6 py-16 text-center">
      <p className="font-mono text-xs uppercase tracking-wide text-[var(--slate)]">{text}</p>
    </div>
  );
}

// Horizontal bar for one line-category, scaled against the league max for
// that category in the current round - so "Engine Room" bars are
// comparable across every team's card, not just within one team.
function LineBar({ label, sub, value, max, color }: { label: string; sub: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(2, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between font-mono text-[10px] uppercase tracking-wide text-[var(--slate)]">
        <span>
          {label} <span className="normal-case text-[var(--slate)]/70">· {sub}</span>
        </span>
        <span className="text-[var(--parchment)]">{formatStatValue(value)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--ink)]">
        <div className="h-full rounded-full transition-[width]" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

// Hand-rolled sparkline (no chart dependency) tracing a team's system
// velocity across the season so far.
function Sparkline({ values, width = 168, height = 32, color = 'var(--brass)' }: { values: number[]; width?: number; height?: number; color?: string }) {
  if (values.length < 2) {
    return <div className="font-mono text-[10px] text-[var(--slate)]">Not enough rounds yet for a trend line.</div>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const lastPoint = points[points.length - 1].split(',').map(Number);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastPoint[0]} cy={lastPoint[1]} r={2.5} fill={color} />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Team row (rank list item + expandable detail)
// ─────────────────────────────────────────────────────────────────────────

function TeamRow({
  ranking,
  latestRoundLine,
  velocityHistory,
  lineMaxima,
  expanded,
  onToggle,
}: {
  ranking: PowerRanking;
  latestRoundLine: TeamRoundMetrics | undefined;
  velocityHistory: number[];
  lineMaxima: Record<string, number>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const thinSample = ranking.rounds_in_window < 3;

  return (
    <div className="rounded-sm border border-[var(--hairline)] bg-[var(--panel)] transition-colors hover:bg-[var(--panel-hover)]">
      <button onClick={onToggle} className="flex w-full flex-wrap items-center gap-4 px-4 py-4 text-left sm:flex-nowrap">
        <PowerRankBadge rank={ranking.power_rank} />
        <TeamMonogram team={ranking.team} />
        <div className="min-w-0 flex-1">
          <div className="font-display truncate text-base font-medium text-[var(--parchment)]">{ranking.team}</div>
          <div className="flex items-center gap-2">
            <TrendBadge trend={ranking.trend} />
            {thinSample && (
              <span className="font-mono text-[9px] uppercase tracking-wide text-[var(--slate)]">
                {ranking.rounds_in_window}-rd sample
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-6 text-right">
          <div>
            <div className="font-display text-2xl font-semibold text-[var(--brass)]">{formatStatValue(ranking.power_score)}</div>
            <div className="font-mono text-[9px] uppercase tracking-wide text-[var(--slate)]">Power Score</div>
          </div>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-wide text-[var(--slate)]">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="border-t border-[var(--hairline)] px-4 py-4">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="space-y-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--brass)]">
                Round {latestRoundLine?.round ?? ranking.round} Line Breakdown
              </div>
              {latestRoundLine ? (
                LINE_CATEGORIES.map((cat) => (
                  <LineBar
                    key={cat.key}
                    label={cat.label}
                    sub={cat.sub}
                    value={Number(latestRoundLine[cat.key]) || 0}
                    max={lineMaxima[cat.key as string] ?? 0}
                    color={cat.color}
                  />
                ))
              ) : (
                <div className="font-mono text-[10px] text-[var(--slate)]">No round data available.</div>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--brass)]">System Velocity, Season to Date</div>
                <div className="mt-2 flex items-center gap-3">
                  <Sparkline values={velocityHistory} />
                  <div className="font-display text-lg font-semibold text-[var(--parchment)]">
                    {formatStatValue(ranking.rolling_system_velocity, 2)}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 font-mono text-xs">
                <div>
                  <div className="text-[9px] uppercase tracking-wide text-[var(--slate)]">Rolling Overall Rating</div>
                  <div className="text-[var(--parchment)]">{formatStatValue(ranking.rolling_overall_rating, 2)}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wide text-[var(--slate)]">Form Window</div>
                  <div className="text-[var(--parchment)]">{ranking.rounds_in_window} round{ranking.rounds_in_window === 1 ? '' : 's'}</div>
                </div>
                {latestRoundLine && (
                  <>
                    <div>
                      <div className="text-[9px] uppercase tracking-wide text-[var(--slate)]">Total PIR (Round {latestRoundLine.round})</div>
                      <div className="text-[var(--parchment)]">{formatStatValue(latestRoundLine.total_player_pir)}</div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-wide text-[var(--slate)]">Disposal Baseline</div>
                      <div className="text-[var(--parchment)]">
                        {latestRoundLine.DI_for == null ? 'Estimated' : 'Season-to-date'}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────

export default function TeamPowerRankings({
  powerRankings,
  teamHistory,
  currentSeason,
}: {
  powerRankings: PowerRanking[];
  teamHistory: TeamRoundMetrics[];
  currentSeason: string;
}) {
  const [query, setQuery] = useState('');
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  const latestRound = useMemo(
    () => (teamHistory.length ? Math.max(...teamHistory.map((r) => r.round)) : null),
    [teamHistory]
  );

  const latestRoundByTeam = useMemo(() => {
    const map = new Map<string, TeamRoundMetrics>();
    if (latestRound == null) return map;
    for (const row of teamHistory) {
      if (row.round === latestRound) map.set(row.team, row);
    }
    return map;
  }, [teamHistory, latestRound]);

  const lineMaxima = useMemo(() => {
    const maxima: Record<string, number> = {};
    for (const cat of LINE_CATEGORIES) {
      maxima[cat.key as string] = Math.max(0, ...Array.from(latestRoundByTeam.values()).map((r) => Number(r[cat.key]) || 0));
    }
    return maxima;
  }, [latestRoundByTeam]);

  const velocityHistoryByTeam = useMemo(() => {
    const map = new Map<string, number[]>();
    const sorted = [...teamHistory].sort((a, b) => a.round - b.round);
    for (const row of sorted) {
      const list = map.get(row.team) ?? [];
      list.push(row.system_velocity);
      map.set(row.team, list);
    }
    return map;
  }, [teamHistory]);

  const filteredRankings = useMemo(() => {
    return [...powerRankings]
      .filter((r) => r.team.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => a.power_rank - b.power_rank);
  }, [powerRankings, query]);

  const surgingCount = powerRankings.filter((r) => r.trend === 'Surging').length;
  const falteringCount = powerRankings.filter((r) => r.trend === 'Faltering').length;

  return (
    <>
      <style jsx global>{`
        :root {
          --ink: #10151a;
          --panel: #161d22;
          --panel-hover: #1b2329;
          --parchment: #ede6d6;
          --brass: #c9a227;
          --brass-bright: #e0be4a;
          --fern-light: #8fbd7c;
          --oxblood: #a8433a;
          --oxblood-light: #d97862;
          --slate: #8c97a0;
          --hairline: #262e33;
        }
        .font-display {
          font-family: 'Fraunces', Georgia, serif;
        }
        .font-mono {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
        }
        .font-body {
          font-family: 'Inter', system-ui, sans-serif;
        }
        @media (prefers-reduced-motion: reduce) {
          * {
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>

      <main className="font-body min-h-screen bg-[var(--ink)] px-6 py-12 text-[var(--parchment)] sm:px-10 lg:px-16">
        <div className="mx-auto max-w-5xl">
          {/* ── Header ───────────────────────────────────────────── */}
          <header className="mb-10 border-b border-[var(--hairline)] pb-8">
            <div className="mb-3 flex items-center gap-3 font-mono text-[11px] tracking-[0.25em] text-[var(--brass)]">
              <span className="inline-block h-px w-8 bg-[var(--brass)]" />
              LEDGER · {currentSeason} SEASON{latestRound ? ` · ROUND ${latestRound}` : ''}
            </div>
            <h1 className="font-display text-4xl font-semibold tracking-tight text-[var(--parchment)] sm:text-5xl">
              Power Rankings
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--slate)]">
              Every team ranked on a rolling {powerRankings[0]?.rounds_in_window ? `${Math.max(...powerRankings.map((r) => r.rounds_in_window))}-round` : 'trailing'} form
              window, not a single result. {surgingCount} club{surgingCount === 1 ? ' is' : 's are'} surging,{' '}
              {falteringCount} {falteringCount === 1 ? 'is' : 'are'} faltering. Open a team to see its Engine Room / Iron
              Curtain / Arsenal split and its velocity trend for the season.
            </p>
          </header>

          {/* ── Search ───────────────────────────────────────────── */}
          <div className="mb-6">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search club…"
              className="w-full max-w-xs rounded-sm border border-[var(--hairline)] bg-[var(--panel)] px-3 py-2 font-mono text-xs text-[var(--parchment)] placeholder:text-[var(--slate)] focus:border-[var(--brass)] focus:outline-none"
            />
          </div>

          {/* ── Ranked list ──────────────────────────────────────── */}
          {filteredRankings.length === 0 ? (
            <EmptyState text="No teams match the current search." />
          ) : (
            <div className="space-y-2">
              {filteredRankings.map((ranking) => (
                <TeamRow
                  key={ranking.team}
                  ranking={ranking}
                  latestRoundLine={latestRoundByTeam.get(ranking.team)}
                  velocityHistory={velocityHistoryByTeam.get(ranking.team) ?? []}
                  lineMaxima={lineMaxima}
                  expanded={expandedTeam === ranking.team}
                  onToggle={() => setExpandedTeam(expandedTeam === ranking.team ? null : ranking.team)}
                />
              ))}
            </div>
          )}

          {/* ── Legend ───────────────────────────────────────────── */}
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[10px] uppercase tracking-wide text-[var(--slate)]">
            <span>Power Score = (Rolling Overall Rating × 0.7) + (Rolling System Velocity × 30)</span>
            <span>System Velocity = team PIR per estimated disposal, a shape-of-play read independent of raw PIR volume</span>
            <span>Engine Room = Midfield + Ruck · Iron Curtain = Backs · The Arsenal = Forwards</span>
          </div>
        </div>
      </main>
    </>
  );
}