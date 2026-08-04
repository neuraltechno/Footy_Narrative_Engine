import React, { useMemo, useState } from 'react';
import fs from 'fs';
import path from 'path';
import Head from 'next/head';
import SiteHeader from '../../components/SiteHeader';

// ─────────────────────────────────────────────────────────────────────────
// Types
//
// power_rankings.json is one row per team: the current rolling-form
// snapshot (see 60_power_rankings.R). team_metrics_history.json is every
// round for every team (see 30_team_metrics.R) - it's what powers the
// per-team line breakdown and season sparkline below the fold.
// ─────────────────────────────────────────────────────────────────────────

type RoundIndexEntry = {
  round: number;
  file: string;
  team_count: number;
  rising_count: number;
  falling_count: number;
  leader: string | null;
  leader_score: number | null;
};

type PowerRankingsIndex = {
  season: number;
  latest_round: number;
  round_count: number;
  rounds: RoundIndexEntry[];
};

type PowerRanking = {
  team: string;
  round: number;
  rounds_in_window: number;
  rolling_overall_rating: number;
  rolling_system_velocity: number;
  power_score: number;
  power_score_delta: number | null;
  // Opponent-strength adjustment (see 60_power_rankings.R). opponent_strength_index
  // is the average season-to-date power_score of whoever this team actually
  // played across the current form window; league_avg_strength is the
  // league-wide baseline it's compared against. strength_adjustment_factor
  // is opponent_strength_index / league_avg_strength (1 = average draw of
  // opposition). strength_adjusted_power_score is power_score scaled by
  // that factor, and is what power_rank/trend are now based on - power_score
  // itself is unchanged and still included for comparison.
  opponent_strength_index: number | null;
  league_avg_strength: number;
  strength_adjustment_factor: number | null;
  strength_adjusted_power_score: number;
  strength_adjusted_power_score_delta: number | null;
  trend: Trend;
  power_rank: number;
  // The actual AFL ladder spot (Actual_Rank from 50_justice_ladder.R's
  // Justice Ladder - real competition points/percentage, nothing
  // probabilistic). Shown alongside power_rank for context - the two are
  // expected to diverge, that's the point of a form metric. null if no
  // Justice Ladder snapshot was available for this round (see
  // 60_power_rankings.R's justice_ladder/snapshot_dir handling).
  ladder_position: number | null;
};

type TeamRoundMetrics = {
  round: number;
  team: string;
  engine_room_pir: number;
  iron_curtain_pir: number;
  the_arsenal_pir: number;
  total_player_pir: number;
  // Real per-round disposal total, summed from actual player-level game
  // data (see 30_team_metrics.R). null when no real match data was found
  // for this round/team (e.g. a genuine data gap) and the
  // TEAM_METRICS_DEFAULT_ROUND_DISPOSALS fallback was used instead.
  // Replaces the old DI_for (season-cumulative approximation) field.
  actual_round_disposals: number | null;
  approx_round_disposals: number;
  system_velocity: number;
  overall_rating: number;
};

type PowerRankingsTab = 'rankings' | 'form_trend' | 'line_breakdown' | 'system_velocity';

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

    const index: PowerRankingsIndex = safeRead(leagueDir('power_rankings_index.json'), {
      season: currentSeason,
      latest_round: 0,
      round_count: 0,
      rounds: [],
    });

    const allRounds: Record<number, PowerRanking[]> = {};
    for (const entry of index.rounds) {
      allRounds[entry.round] = safeRead(leagueDir(entry.file), []);
    }

    const teamHistory: TeamRoundMetrics[] = safeRead(teamsDir('team_metrics_history.json'), []);

    return {
      props: { index, allRounds, teamHistory, currentSeason },
      revalidate: 60,
    };
  } catch (error) {
    console.error('Static build compilation failed for power rankings pipeline:', error);
    return {
      props: {
        index: { season: '', latest_round: 0, round_count: 0, rounds: [] },
        allRounds: {},
        teamHistory: [],
        currentSeason: '',
      },
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

// Shared shape used by every season-long "all clubs, one stat" chart
// (System Velocity, Engine Room, Iron Curtain, Arsenal) - groups by team,
// sorted by round.
function buildCategorySeries(
  rows: TeamRoundMetrics[],
  key: keyof TeamRoundMetrics
): Map<string, { round: number; value: number }[]> {
  const map = new Map<string, { round: number; value: number }[]>();
  rows.forEach((row) => {
    const list = map.get(row.team) ?? [];
    list.push({ round: row.round, value: Number(row[key]) || 0 });
    map.set(row.team, list);
  });
  map.forEach((list) => list.sort((a, b) => a.round - b.round));
  return map;
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

// monogramColor only cycles through 4 theme colors (fine for a badge with
// the team's initials printed inside it) - on an 18-line season chart that
// means several clubs would render in the exact same color, which defeats
// the point. chartColor instead spaces every club evenly around the hue
// wheel based on its position in the full team list, so every club gets a
// genuinely distinct color regardless of how many colors the theme defines.
function chartColor(team: string, allTeams: string[]): string {
  const idx = allTeams.indexOf(team);
  if (idx === -1 || allTeams.length === 0) return 'var(--slate)';
  const hue = (idx / allTeams.length) * 360;
  return `hsl(${hue.toFixed(0)}, 68%, 62%)`;
}

const TREND_STYLE: Record<Trend, { border: string; text: string; glyph: string }> = {
  Rising: { border: 'border-[var(--fern-light)]', text: 'text-[var(--fern-light)]', glyph: '▲' },
  Steady: { border: 'border-[var(--slate)]', text: 'text-[var(--slate)]', glyph: '▬' },
  Falling: { border: 'border-[var(--oxblood-light)]', text: 'text-[var(--oxblood-light)]', glyph: '▼' },
  'New / Insufficient History': { border: 'border-[var(--slate)]', text: 'text-[var(--slate)]', glyph: '•' },
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

// Shows the actual number behind the trend label - "Rising"/"Falling" on
// their own don't say by how much, or make it obvious why two teams with
// similar power scores can carry opposite badges.
function DeltaChip({ delta }: { delta: number | null | undefined }) {
  if (delta == null || Number.isNaN(delta)) return null;
  const color = delta > 0 ? 'text-[var(--fern-light)]' : delta < 0 ? 'text-[var(--oxblood-light)]' : 'text-[var(--slate)]';
  const sign = delta > 0 ? '+' : '';
  return (
    <span className={`font-mono text-[10px] ${color}`}>
      {sign}
      {formatStatValue(delta)} vs last stretch
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

// The signature device for this page: manila-style ledger tabs, staggered
// slightly like real folder tabs. Copied from top-games.tsx so both ledger
// pages share the exact same tab styling/behaviour.
function LedgerTabs({
  tabs,
  active,
  onSelect,
}: {
  tabs: { key: PowerRankingsTab; label: string; count: number }[];
  active: PowerRankingsTab;
  onSelect: (key: PowerRankingsTab) => void;
}) {
  return (
    <div className="mb-0 flex flex-wrap items-end gap-1">
      {tabs.map((tab, i) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            onClick={() => onSelect(tab.key)}
            style={{ transform: isActive ? 'translateY(0)' : `translateY(${2 + (i % 2)}px)` }}
            className={`rounded-t-sm border border-b-0 px-4 py-2.5 text-left transition-colors ${
              isActive
                ? 'border-[var(--hairline)] bg-[var(--panel)] text-[var(--parchment)]'
                : 'border-transparent bg-[var(--ink)] text-[var(--slate)] hover:text-[var(--parchment)]'
            }`}
          >
            <div className="font-mono text-[9px] uppercase tracking-[0.14em]">{tab.label}</div>
            <div className={`font-display text-sm ${isActive ? 'text-[var(--brass)]' : 'text-[var(--slate)]'}`}>
              {tab.count}
            </div>
          </button>
        );
      })}
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
// Season charts (hand-rolled SVG, same approach as Sparkline above - no
// chart library dependency)
// ─────────────────────────────────────────────────────────────────────────

type ChartSeries = {
  key: string;
  color: string;
  points: { round: number; value: number }[];
  emphasized?: boolean;
};

function MultiSeriesChart({
  series,
  width = 640,
  height = 220,
  onSeriesClick,
}: {
  series: ChartSeries[];
  width?: number;
  height?: number;
  onSeriesClick?: (key: string) => void;
}) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; team: string; round: number; value: number } | null>(null);

  const allPoints = series.flatMap((s) => s.points);
  if (allPoints.length < 2) {
    return <div className="font-mono text-[10px] text-[var(--slate)]">Not enough rounds yet to chart.</div>;
  }

  const rounds = allPoints.map((p) => p.round);
  const values = allPoints.map((p) => p.value);
  const minRound = Math.min(...rounds);
  const maxRound = Math.max(...rounds);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const roundRange = maxRound - minRound || 1;
  const valueRange = maxValue - minValue || 1;
  const padY = 12;
  const padX = 34; // room for the Y-axis value labels on the left

  const toXY = (p: { round: number; value: number }) => {
    const x = padX + ((p.round - minRound) / roundRange) * (width - padX);
    const y = padY + (1 - (p.value - minValue) / valueRange) * (height - padY * 2);
    return { x, y };
  };

  const hoveredKey = tooltip?.team ?? null;

  // Draw plain lines first, focused/hovered lines last so they sit on top
  const ordered = [...series].sort((a, b) => {
    const aUp = a.emphasized || a.key === hoveredKey ? 1 : 0;
    const bUp = b.emphasized || b.key === hoveredKey ? 1 : 0;
    return aUp - bUp;
  });

  const yTicks = [minValue, (minValue + maxValue) / 2, maxValue];

  function handleMove(e: React.MouseEvent<SVGPolylineElement>, s: ChartSeries, coords: { x: number; y: number }[]) {
    const svg = (e.target as SVGElement).ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = width / rect.width;
    const mouseX = (e.clientX - rect.left) * scaleX;
    let nearestIdx = 0;
    let minDist = Infinity;
    coords.forEach((c, i) => {
      const d = Math.abs(c.x - mouseX);
      if (d < minDist) {
        minDist = d;
        nearestIdx = i;
      }
    });
    const point = s.points[nearestIdx];
    const c = coords[nearestIdx];
    setTooltip({ x: c.x, y: c.y, team: s.key, round: point.round, value: point.value });
  }

  // Tooltip box position, nudged so it never renders off either edge
  const tooltipBoxWidth = 132;
  const tooltipX = tooltip ? Math.min(Math.max(tooltip.x + 8, 0), width - tooltipBoxWidth) : 0;
  const tooltipY = tooltip ? Math.max(tooltip.y - 32, 2) : 0;

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible" onMouseLeave={() => setTooltip(null)}>
        {/* Y-axis gridlines + value labels */}
        {yTicks.map((v, i) => {
          const y = padY + (1 - (v - minValue) / valueRange) * (height - padY * 2);
          return (
            <g key={i}>
              <line x1={padX - 4} x2={width} y1={y} y2={y} stroke="var(--hairline)" strokeWidth={0.5} strokeDasharray="2,3" />
              <text x={0} y={y + 3} fontSize={8} fill="var(--slate)" fontFamily="monospace">
                {formatStatValue(v)}
              </text>
            </g>
          );
        })}

        {ordered.map((s) => {
          const coords = s.points.map(toXY);
          const pointsAttr = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
          const last = coords[coords.length - 1];
          const isUp = s.emphasized || s.key === hoveredKey;
          return (
            <g
              key={s.key}
              onClick={() => onSeriesClick?.(s.key)}
              className={onSeriesClick ? 'cursor-pointer' : undefined}
            >
              {/* Invisible wide hit-area so thin faded lines are still easy to click/hover */}
              <polyline
                points={pointsAttr}
                fill="none"
                stroke="transparent"
                strokeWidth={12}
                style={{ pointerEvents: 'stroke' }}
                onMouseMove={(e) => handleMove(e, s, coords)}
              />
              <polyline
                points={pointsAttr}
                fill="none"
                stroke={s.color}
                strokeWidth={isUp ? 2.5 : 1}
                strokeOpacity={isUp ? 1 : 0.3}
                strokeLinejoin="round"
                strokeLinecap="round"
                style={{ pointerEvents: 'none' }}
              />
              {isUp && last && <circle cx={last.x} cy={last.y} r={3} fill={s.color} style={{ pointerEvents: 'none' }} />}
            </g>
          );
        })}

        {/* Hover tooltip - team, round, and exact value at the nearest point */}
        {tooltip && (
          <g transform={`translate(${tooltipX}, ${tooltipY})`} style={{ pointerEvents: 'none' }}>
            <rect width={tooltipBoxWidth} height={34} rx={3} fill="var(--ink)" stroke="var(--hairline)" strokeWidth={0.75} />
            <text x={7} y={14} fontSize={9} fontWeight={600} fill="var(--parchment)" fontFamily="monospace">
              {tooltip.team}
            </text>
            <text x={7} y={26} fontSize={9} fill="var(--slate)" fontFamily="monospace">
              Round {tooltip.round} · {formatStatValue(tooltip.value)}
            </text>
          </g>
        )}
      </svg>
      <div className="mt-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-wide text-[var(--slate)]">
        <span>Round {minRound}</span>
        <span>Round {maxRound}</span>
      </div>
    </div>
  );
}

// Used for the Form Score, System Velocity, and Line Breakdown tabs - every
// club plotted, one club highlighted (via the selector, a click on its
// line, or a hover), everyone else faded. Hovering any line also shows its
// club name as a native tooltip.
function TeamCompareChartPanel({
  title,
  unitLabel,
  seriesMap,
  allTeams,
  focusTeam,
  onFocusChange,
}: {
  title: string;
  unitLabel: string;
  seriesMap: Map<string, { round: number; value: number }[]>;
  allTeams: string[];
  focusTeam: string;
  onFocusChange: (team: string) => void;
}) {
  const series: ChartSeries[] = allTeams
    .map((team) => ({
      key: team,
      color: chartColor(team, allTeams),
      points: seriesMap.get(team) ?? [],
      emphasized: team === focusTeam,
    }))
    .filter((s) => s.points.length > 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--brass)]">{title}</div>
        <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-[var(--slate)]">
          Focus club
          <select
            value={focusTeam}
            onChange={(e) => onFocusChange(e.target.value)}
            className="rounded-sm border border-[var(--hairline)] bg-[var(--ink)] px-2 py-1 font-mono text-[11px] text-[var(--parchment)] focus:border-[var(--brass)] focus:outline-none"
          >
            {allTeams.map((team) => (
              <option key={team} value={team}>
                {team}
              </option>
            ))}
          </select>
        </label>
      </div>
      <MultiSeriesChart series={series} onSeriesClick={onFocusChange} />
      <div className="mt-3 flex items-center gap-2 font-mono text-[10px] text-[var(--slate)]">
        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: chartColor(focusTeam, allTeams) }} />
        {focusTeam || 'No club selected'} highlighted · {unitLabel} · click or hover any line to identify a club
      </div>
    </div>
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
          <div className="flex flex-wrap items-center gap-2">
            {ranking.ladder_position != null && (
              <span className="inline-flex items-center gap-1 rounded-sm border border-[var(--hairline)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[var(--slate)]">
                Ladder №{ranking.ladder_position}
              </span>
            )}
            <TrendBadge trend={ranking.trend} />
            <DeltaChip delta={ranking.strength_adjusted_power_score_delta} />
            {thinSample && (
              <span className="font-mono text-[9px] uppercase tracking-wide text-[var(--slate)]">
                {ranking.rounds_in_window}-rd sample
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-6 text-right">
          <div>
            <div className="font-display text-2xl font-semibold text-[var(--brass)]">{formatStatValue(ranking.strength_adjusted_power_score)}</div>
            <div className="font-mono text-[9px] uppercase tracking-wide text-[var(--slate)]">Form Score</div>
            <div className="font-mono text-[9px] text-[var(--slate)]/60">raw {formatStatValue(ranking.power_score)}</div>
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
                <div>
                  <div className="text-[9px] uppercase tracking-wide text-[var(--slate)]">Opponent Strength (window)</div>
                  <div className="text-[var(--parchment)]">
                    {formatStatValue(ranking.opponent_strength_index)}
                    <span className="text-[var(--slate)]"> · league avg {formatStatValue(ranking.league_avg_strength)}</span>
                  </div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wide text-[var(--slate)]">Draw Difficulty</div>
                  <div className="text-[var(--parchment)]">
                    {ranking.strength_adjustment_factor == null
                      ? '—'
                      : ranking.strength_adjustment_factor > 1.02
                        ? `Tougher than average (×${formatStatValue(ranking.strength_adjustment_factor, 2)})`
                        : ranking.strength_adjustment_factor < 0.98
                          ? `Easier than average (×${formatStatValue(ranking.strength_adjustment_factor, 2)})`
                          : `About average (×${formatStatValue(ranking.strength_adjustment_factor, 2)})`}
                  </div>
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
                        {latestRoundLine.actual_round_disposals == null ? 'Estimated' : 'Actual'}
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

function RoundNavigator({
  rounds,
  selectedRound,
  latestRound,
  onSelect,
}: {
  rounds: RoundIndexEntry[];
  selectedRound: number;
  latestRound: number;
  onSelect: (round: number) => void;
}) {
  const sortedRounds = [...rounds].sort((a, b) => a.round - b.round);
  const idx = sortedRounds.findIndex((r) => r.round === selectedRound);
  const hasPrev = idx > 0;
  const hasNext = idx < sortedRounds.length - 1;

  const navBtn = `rounded-sm border border-[var(--hairline)] px-2.5 py-1 font-mono text-[11px] transition-colors
    hover:border-[var(--slate)] disabled:cursor-not-allowed disabled:opacity-30
    focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brass)]`;

  return (
    <div className="flex items-center gap-2">
      <button
        className={navBtn}
        disabled={!hasPrev}
        onClick={() => hasPrev && onSelect(sortedRounds[idx - 1].round)}
        aria-label="Previous round"
      >
        ←
      </button>

      <select
        value={selectedRound}
        onChange={(e) => onSelect(Number(e.target.value))}
        className="rounded-sm border border-[var(--hairline)] bg-[var(--panel)] px-2.5 py-1 font-mono text-[11px] text-[var(--parchment)] focus:border-[var(--brass)] focus:outline-none"
      >
        {sortedRounds.map((r) => (
          <option key={r.round} value={r.round}>
            Round {r.round}{r.round === latestRound ? ' (latest)' : ''}
          </option>
        ))}
      </select>

      <button
        className={navBtn}
        disabled={!hasNext}
        onClick={() => hasNext && onSelect(sortedRounds[idx + 1].round)}
        aria-label="Next round"
      >
        →
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────

export default function TeamPowerRankings({
  index,
  allRounds,
  teamHistory,
  currentSeason,
}: {
  index: PowerRankingsIndex;
  allRounds: Record<number, PowerRanking[]>;
  teamHistory: TeamRoundMetrics[];
  currentSeason: string;
}) {
  const [selectedRound, setSelectedRound] = useState<number>(index.latest_round);
  const [query, setQuery] = useState('');
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PowerRankingsTab>('rankings');
  const [focusTeamOverride, setFocusTeamOverride] = useState<string | null>(null);

  const powerRankings = allRounds[selectedRound] ?? [];
  const isLatestRound = selectedRound === index.latest_round;

  const handleRoundSelect = (round: number) => {
    if (round === selectedRound) return;
    setSelectedRound(round);
    setQuery('');
    setExpandedTeam(null);
  };

  const switchTab = (tab: PowerRankingsTab) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setQuery('');
    setExpandedTeam(null);
  };

  // Every club that appears anywhere in the round-by-round export, for the
  // chart tabs' Focus Club selector - not just clubs present in the
  // currently selected round.
  const allTeams = useMemo(() => {
    const set = new Set<string>();
    Object.values(allRounds).forEach((rows) => rows.forEach((r) => set.add(r.team)));
    return Array.from(set).sort();
  }, [allRounds]);

  const defaultFocusTeam = useMemo(() => {
    const latest = [...(allRounds[index.latest_round] ?? [])].sort((a, b) => a.power_rank - b.power_rank);
    return latest[0]?.team ?? allTeams[0] ?? '';
  }, [allRounds, index.latest_round, allTeams]);

  const focusTeam = focusTeamOverride ?? defaultFocusTeam;

  // Form Score across every round, per club - built from the round-by-round
  // export (allRounds) rather than team_metrics_history, since Form Score
  // only exists on the power rankings side of the pipeline.
  const formScoreSeries = useMemo(() => {
    const map = new Map<string, { round: number; value: number }[]>();
    Object.values(allRounds).forEach((rows) => {
      rows.forEach((r) => {
        const list = map.get(r.team) ?? [];
        list.push({ round: r.round, value: r.strength_adjusted_power_score });
        map.set(r.team, list);
      });
    });
    map.forEach((list) => list.sort((a, b) => a.round - b.round));
    return map;
  }, [allRounds]);

  // System velocity across every round, per club - from team_metrics_history
  // (already the full season, not just the selected round).
  const velocitySeries = useMemo(() => buildCategorySeries(teamHistory, 'system_velocity'), [teamHistory]);

  // Engine Room / Iron Curtain / Arsenal, season to date, one series-map per
  // category, all clubs - same "compare chart" shape as Form Score/Velocity
  // above, so each line category gets its own all-clubs chart rather than
  // cramming one club's three lines onto a single chart.
  const engineRoomSeries = useMemo(() => buildCategorySeries(teamHistory, 'engine_room_pir'), [teamHistory]);
  const ironCurtainSeries = useMemo(() => buildCategorySeries(teamHistory, 'iron_curtain_pir'), [teamHistory]);
  const arsenalSeries = useMemo(() => buildCategorySeries(teamHistory, 'the_arsenal_pir'), [teamHistory]);
  const lineCategorySeriesMaps: Record<string, Map<string, { round: number; value: number }[]>> = {
    engine_room_pir: engineRoomSeries,
    iron_curtain_pir: ironCurtainSeries,
    the_arsenal_pir: arsenalSeries,
  };

  const latestRoundByTeam = useMemo(() => {
    const map = new Map<string, TeamRoundMetrics>();
    for (const row of teamHistory) {
      if (row.round === selectedRound) map.set(row.team, row);
    }
    return map;
  }, [teamHistory, selectedRound]);

  const lineMaxima = useMemo(() => {
    const maxima: Record<string, number> = {};
    for (const cat of LINE_CATEGORIES) {
      maxima[cat.key as string] = Math.max(0, ...Array.from(latestRoundByTeam.values()).map((r) => Number(r[cat.key]) || 0));
    }
    return maxima;
  }, [latestRoundByTeam]);

  const velocityHistoryByTeam = useMemo(() => {
    const map = new Map<string, number[]>();
    const sorted = [...teamHistory].filter(r => r.round <= selectedRound).sort((a, b) => a.round - b.round);
    for (const row of sorted) {
      const list = map.get(row.team) ?? [];
      list.push(row.system_velocity);
      map.set(row.team, list);
    }
    return map;
  }, [teamHistory, selectedRound]);

  const filteredRankings = useMemo(() => {
    return [...powerRankings]
      .filter((r) => r.team.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => a.power_rank - b.power_rank);
  }, [powerRankings, query]);

  const risingCount = powerRankings.filter((r) => r.trend === 'Rising').length;
  const fallingCount = powerRankings.filter((r) => r.trend === 'Falling').length;

  const tabs: { key: PowerRankingsTab; label: string; count: number }[] = [
    { key: 'rankings', label: `Round ${selectedRound}`, count: powerRankings.length },
    { key: 'form_trend', label: 'Form Score Trend', count: index.round_count },
    { key: 'line_breakdown', label: 'Line Breakdown', count: index.round_count },
    { key: 'system_velocity', label: 'System Velocity', count: index.round_count },
  ];

  return (
    <>
      <main className="font-body min-h-screen bg-[var(--ink)] px-6 py-12 text-[var(--parchment)] sm:px-10 lg:px-16">
        <div className="mx-auto max-w-5xl">
          
                    <SiteHeader />
          
          {/* ── Header ───────────────────────────────────────────── */}
          <Head>
            <title>The Form Pulse — AFL Power Rankings | Footy Narrative Engine</title>
          </Head>
          <header className="mb-10 border-b border-[var(--hairline)] pb-8">
            <div className="mb-3 flex items-center gap-3 font-mono text-[11px] tracking-[0.25em] text-[var(--brass)]">
              <span className="inline-block h-px w-8 bg-[var(--brass)]" />
              LEDGER · {currentSeason} SEASON · ROUND {selectedRound}
              {isLatestRound && <span className="text-[var(--slate)]">· LATEST</span>}
            </div>
            <h1 className="font-display text-4xl font-semibold tracking-tight text-[var(--parchment)] sm:text-5xl">
              The Form Pulse
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--slate)]">
              Every team ranked on a rolling {powerRankings[0]?.rounds_in_window ? `${Math.max(...powerRankings.map((r) => r.rounds_in_window))}-round` : 'trailing'} form
              window, adjusted for the strength of the sides they've actually played — not a single result, and not a
              soft draw. This is form, not the ladder: {risingCount} club{risingCount === 1 ? ' is' : 's are'} building
              form, {fallingCount} {fallingCount === 1 ? 'is' : 'are'} cooling off. Open a team to see its Engine Room
              / Iron Curtain / Arsenal split, its draw difficulty, and its velocity trend for the season.
            </p>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--slate)]">
              Form Score adjusts each team's raw output for who they actually played this window — beating a strong
              side is worth more than cruising past a weak one, and vice versa. The <span className="text-[var(--slate)]/70">raw</span> figure
              under each score is the same output before that adjustment, for comparison.
            </p>
          </header>

          {/* ── Ledger tabs ──────────────────────────────────────── */}
          <LedgerTabs tabs={tabs} active={activeTab} onSelect={switchTab} />

          <div className="rounded-b-sm rounded-tr-sm border border-[var(--hairline)] bg-[var(--panel)] p-5 sm:p-6">
            {activeTab === 'rankings' && (
              <>
                {/* ── Round navigator ──────────────────────────────── */}
                <div className="mb-6 flex items-center justify-between gap-4 rounded-sm border border-[var(--hairline)] bg-[var(--ink)] px-4 py-3">
                  <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--slate)]">
                    {index.round_count} round{index.round_count === 1 ? '' : 's'} available
                  </span>
                  <RoundNavigator
                    rounds={index.rounds}
                    selectedRound={selectedRound}
                    latestRound={index.latest_round}
                    onSelect={handleRoundSelect}
                  />
                </div>

                {/* ── Search ───────────────────────────────────────── */}
                <div className="mb-6">
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search club…"
                    className="w-full max-w-xs rounded-sm border border-[var(--hairline)] bg-[var(--ink)] px-3 py-2 font-mono text-xs text-[var(--parchment)] placeholder:text-[var(--slate)] focus:border-[var(--brass)] focus:outline-none"
                  />
                </div>

                {/* ── Ranked list ──────────────────────────────────── */}
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
              </>
            )}

            {/* ── Form Score, season to date ───────────────────────── */}
            {activeTab === 'form_trend' && (
              <TeamCompareChartPanel
                title="Form Score, Season to Date"
                unitLabel="Form Score"
                seriesMap={formScoreSeries}
                allTeams={allTeams}
                focusTeam={focusTeam}
                onFocusChange={setFocusTeamOverride}
              />
            )}

            {/* ── System velocity, season to date ──────────────────── */}
            {activeTab === 'system_velocity' && (
              <TeamCompareChartPanel
                title="System Velocity, Season to Date"
                unitLabel="System Velocity"
                seriesMap={velocitySeries}
                allTeams={allTeams}
                focusTeam={focusTeam}
                onFocusChange={setFocusTeamOverride}
              />
            )}

            {/* ── Line breakdown, season to date - one chart per category, all clubs ── */}
            {activeTab === 'line_breakdown' && (
              <div className="space-y-10">
                {LINE_CATEGORIES.map((cat) => (
                  <TeamCompareChartPanel
                    key={cat.key as string}
                    title={`${cat.label} · ${cat.sub}, Season to Date`}
                    unitLabel={cat.label}
                    seriesMap={lineCategorySeriesMaps[cat.key as string]}
                    allTeams={allTeams}
                    focusTeam={focusTeam}
                    onFocusChange={setFocusTeamOverride}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Legend ───────────────────────────────────────────── */}
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[10px] uppercase tracking-wide text-[var(--slate)]">
            <span>Form Score = (Rolling Overall Rating × 0.7) + (Rolling System Velocity × 30), then scaled by opponent strength faced</span>
            <span>Draw Difficulty = strength of opponents actually played this window vs. the league average - beating tough teams counts for more</span>
            <span>System Velocity = team PIR per disposal, a shape-of-play read independent of raw PIR volume</span>
            <span>Engine Room = Midfield + Ruck · Iron Curtain = Backs · The Arsenal = Forwards</span>
          </div>
        </div>
      </main>
    </>
  );
}