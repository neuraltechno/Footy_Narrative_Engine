import React, { useMemo, useState } from 'react';
import fs from 'fs';
import path from 'path';
import SiteHeader from '../../components/SiteHeader';

// ─────────────────────────────────────────────────────────────────────────
// Types
//
// team_match_centers.json is match_evals filtered to the latest completed
// round (see 40_match_metrics.R / process_stats.R) - one row per fixture.
//
// quarter_breakdown / quarters_led_* / is_comeback_win / etc. come from the
// score-worm quarter data added in 40_match_metrics.R: nulls are expected
// for any match where quarter data wasn't available (e.g. a gap in the
// source feed for that match) or where the game was a draw (no "winner's
// deficit" to measure) - every component below treats them as optional.
// ─────────────────────────────────────────────────────────────────────────

type QuarterBreakdown = {
  quarter: number;
  home_goals: number;
  home_behinds: number;
  away_goals: number;
  away_behinds: number;
  home_goals_cum: number;
  home_behinds_cum: number;
  away_goals_cum: number;
  away_behinds_cum: number;
  home_score_qtr: number;
  away_score_qtr: number;
  home_score_cum: number;
  away_score_cum: number;
  home_xscore_qtr: number;
  away_xscore_qtr: number;
  home_xscore_cum: number;
  away_xscore_cum: number;
  margin_at_break: number;
  xmargin_at_break: number;
};

type MatchCenter = {
  round: number;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  home_goals: number;
  home_behinds: number;
  away_goals: number;
  away_behinds: number;
  home_raw_xscore: number;
  away_raw_xscore: number;
  home_engine_room_pir: number;
  home_iron_curtain_pir: number;
  home_the_arsenal_pir: number;
  home_system_velocity: number;
  away_engine_room_pir: number;
  away_iron_curtain_pir: number;
  away_the_arsenal_pir: number;
  away_system_velocity: number;
  expected_winner: string;
  actual_winner: string;
  is_robbery: boolean;
  luck_delta: number;
  quarter_breakdown: QuarterBreakdown[] | null;
  quarters_led_home: number | null;
  quarters_led_away: number | null;
  is_comeback_win: boolean | null;
  biggest_deficit_overcome: number | null;
  largest_lead_surrendered: number | null;
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
    const matchesDir = (file: string) => path.join(process.cwd(), 'json', currentSeason, 'matches', file);

    const matches: MatchCenter[] = safeRead(matchesDir('team_match_centers.json'), []);

    return {
      props: { matches, currentSeason },
      revalidate: 60,
    };
  } catch (error) {
    console.error('Static build compilation failed for match centre pipeline:', error);
    return {
      props: { matches: [], currentSeason: '' },
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

function scoreline(goals: number, behinds: number, total: number): string {
  return `${goals}.${behinds} (${total})`;
}

// Standard AFL "quarter time" notation - goals.behinds.total, all
// cumulative to that point in the match (e.g. 2.3.15) - distinct from the
// scoreline() parenthesised style used for the full-time score elsewhere
// on this card, and deliberately terser to fit inside a quarter column.
function quarterScoreline(goals: number, behinds: number, total: number): string {
  return `${goals}.${behinds}.${total}`;
}

function quarterLabel(quarter: number): string {
  return quarter <= 4 ? `Q${quarter}` : 'ET';
}

// SVG clipPath ids must be unique across the whole page - with a grid of
// match cards, each rendering its own worm chart, plain "upper"/"lower"
// ids would collide and browsers would resolve every clip-path to the
// first match on the page. Derived from the same key used for React's
// list key / the expand-toggle state, just sanitized to valid id characters.
function svgId(key: string): string {
  return key.replace(/[^a-zA-Z0-9-]/g, '-');
}

function initials(team: string): string {
  const words = team.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[words.length - 2][0] + words[words.length - 1][0]).toUpperCase();
}

const MONOGRAM_PALETTE = ['--brass', '--fern-light', '--oxblood-light', '--brass-bright'] as const;
function monogramColor(team: string): string {
  let hash = 0;
  for (let i = 0; i < team.length; i++) hash = (hash * 31 + team.charCodeAt(i)) >>> 0;
  return `var(${MONOGRAM_PALETTE[hash % MONOGRAM_PALETTE.length]})`;
}

// Same category/colour language as the Power Rankings page, so a reader
// carries the mapping across both pages for free.
const LINE_CATEGORIES: { homeKey: keyof MatchCenter; awayKey: keyof MatchCenter; label: string; sub: string; color: string }[] = [
  { homeKey: 'home_engine_room_pir', awayKey: 'away_engine_room_pir', label: 'Engine Room', sub: 'Midfield + Ruck', color: 'var(--brass)' },
  { homeKey: 'home_iron_curtain_pir', awayKey: 'away_iron_curtain_pir', label: 'Iron Curtain', sub: 'Backs', color: 'var(--fern-light)' },
  { homeKey: 'home_the_arsenal_pir', awayKey: 'away_the_arsenal_pir', label: 'The Arsenal', sub: 'Forwards', color: 'var(--oxblood-light)' },
];

// A verdict on how the match's momentum actually unfolded, derived purely
// from fields already computed server-side (see 40_match_metrics.R) - no
// client-side math beyond string formatting. Returns null when there's
// nothing distinctive to say (draw, no quarter data, or a genuinely flat
// contest with no lead change of note) rather than forcing a caption.
function momentumCaption(match: MatchCenter): string | null {
  const bd = match.quarter_breakdown;
  if (!bd || bd.length === 0 || match.actual_winner === 'Draw') return null;

  const winner = match.actual_winner;
  const loser = winner === match.home_team ? match.away_team : match.home_team;

  if (match.is_comeback_win && match.biggest_deficit_overcome) {
    return `${winner} trailed by as much as ${formatStatValue(match.biggest_deficit_overcome, 0)} points before getting home.`;
  }
  if (match.largest_lead_surrendered && match.largest_lead_surrendered > 0) {
    return `${loser} led by as many as ${formatStatValue(match.largest_lead_surrendered, 0)} points before fading.`;
  }
  const wireToWire =
    (winner === match.home_team && match.quarters_led_home === bd.length) ||
    (winner === match.away_team && match.quarters_led_away === bd.length);
  if (wireToWire) {
    return `${winner} led at every change of ends.`;
  }
  return null;
}

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

function RobberyTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-[var(--oxblood-light)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[var(--oxblood-light)]">
      ⚑ Robbery
    </span>
  );
}

function DrawTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-[var(--slate)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[var(--slate)]">
      Drawn
    </span>
  );
}

function ComebackTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-[var(--fern-light)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[var(--fern-light)]">
      ↻ Comeback
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-sm border border-dashed border-[var(--hairline)] px-6 py-16 text-center">
      <p className="font-mono text-xs uppercase tracking-wide text-[var(--slate)]">{text}</p>
    </div>
  );
}

function PillFilter({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-sm border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brass)] ${
        active
          ? 'border-[var(--brass)] text-[var(--brass)]'
          : 'border-[var(--hairline)] text-[var(--slate)] hover:border-[var(--slate)]'
      }`}
    >
      {label}
    </button>
  );
}

// Smaller sibling of PillFilter, scoped to switching content within an
// already-expanded card rather than filtering the whole page.
function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-sm px-2 py-1 font-mono text-[9px] uppercase tracking-wide transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brass)] ${
        active ? 'bg-[var(--ink)] text-[var(--brass)]' : 'text-[var(--slate)] hover:text-[var(--parchment)]'
      }`}
    >
      {label}
    </button>
  );
}

// Butterfly/mirrored bar: home grows leftward from the centre line, away
// grows rightward, both scaled against the league-wide max for that
// category so bars are comparable match to match, not just within one card.
function MirrorBar({
  label,
  sub,
  homeValue,
  awayValue,
  max,
  color,
}: {
  label: string;
  sub: string;
  homeValue: number;
  awayValue: number;
  max: number;
  color: string;
}) {
  const homePct = max > 0 ? Math.max(2, Math.min(100, (homeValue / max) * 100)) : 0;
  const awayPct = max > 0 ? Math.max(2, Math.min(100, (awayValue / max) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-center gap-2 font-mono text-[10px] uppercase tracking-wide text-[var(--slate)]">
        <span>{label}</span>
        <span className="normal-case text-[var(--slate)]/70">· {sub}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-10 shrink-0 text-right font-mono text-xs text-[var(--parchment)]">{formatStatValue(homeValue)}</span>
        <div className="flex h-1.5 flex-1 justify-end overflow-hidden rounded-full bg-[var(--ink)]">
          <div className="h-full rounded-full" style={{ width: `${homePct}%`, backgroundColor: color }} />
        </div>
        <div className="h-3 w-px shrink-0 bg-[var(--hairline)]" />
        <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--ink)]">
          <div className="h-full rounded-full" style={{ width: `${awayPct}%`, backgroundColor: color }} />
        </div>
        <span className="w-10 shrink-0 font-mono text-xs text-[var(--parchment)]">{formatStatValue(awayValue)}</span>
      </div>
    </div>
  );
}

// The time-axis sibling of MirrorBar above: instead of two bars mirrored
// left/right for one snapshot, this mirrors up/down (home ahead above the
// line, away ahead below it) across each quarter break, so the eye reads
// "who was ahead, and by how much, at every change of ends" as literally a
// row of vertical MirrorBars laid across time. Every number plotted here is
// already computed in 40_match_metrics.R - this component only scales and
// positions divs.
// The time-axis "score worm" - a continuous margin line across the match
// (positive/home above the baseline, negative/away below), filled by
// whoever's ahead at each point. Reads as one gesture instead of four
// separate bar comparisons, which is the actual point: a steadily
// climbing line and a line that swings back and forth tell two very
// different stories even when the final margin is identical. Every value
// plotted is already computed in 40_match_metrics.R - this component only
// scales points into an SVG viewBox and draws them.
function MomentumWorm({
  breakdown,
  homeTeam,
  awayTeam,
  compact = false,
  idPrefix,
}: {
  breakdown: QuarterBreakdown[] | null;
  homeTeam: string;
  awayTeam: string;
  compact?: boolean;
  idPrefix: string;
}) {
  if (!breakdown || breakdown.length === 0) {
    if (compact) return <div className="h-24" />; // keeps card heights aligned in the grid even without data
    return (
      <p className="font-mono text-[10px] uppercase tracking-wide text-[var(--slate)]">
        Quarter-by-quarter data unavailable for this match.
      </p>
    );
  }

  const n = breakdown.length;
  const width = 320;
  const plotHeight = compact ? 50 : 74;
  const topPad = compact ? 14 : 20; // reserved above the plot for home's scores
  const bottomPad = compact ? 14 : 20; // reserved below the plot for away's scores
  const qLabelPad = compact ? 10 : 14;
  const xLeft = 30;
  const xRight = width - 10;
  const xStep = n > 1 ? (xRight - xLeft) / (n - 1) : 0;
  const maxAbsMargin = Math.max(6, ...breakdown.map((q) => Math.abs(q.margin_at_break)));
  const amplitude = plotHeight / 2 - 6;
  const mid = topPad + plotHeight / 2;
  const plotBottom = topPad + plotHeight;

  const points = breakdown.map((q, i) => ({
    x: xLeft + i * xStep,
    y: mid - (q.margin_at_break / maxAbsMargin) * amplitude,
    q,
  }));

  const linePoints = points.map((p) => `${p.x},${p.y}`).join(' ');
  const areaPath = `M ${points[0].x},${mid} ${points.map((p) => `L ${p.x},${p.y}`).join(' ')} L ${points[n - 1].x},${mid} Z`;
  const upperClipId = `${idPrefix}-worm-upper`;
  const lowerClipId = `${idPrefix}-worm-lower`;

  const homeLabelY = topPad - 4;
  const awayLabelY = plotBottom + bottomPad - 4;
  const qLabelY = plotBottom + bottomPad + qLabelPad - 4;
  const height = qLabelY + 4;
  const fontScore = compact ? 6.5 : 8;
  const fontLabel = compact ? 6 : 7;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: compact ? 108 : 168, display: 'block' }}>
      <line x1={xLeft} y1={mid} x2={xRight} y2={mid} stroke="var(--hairline)" strokeWidth={1} />
      <clipPath id={upperClipId}>
        <rect x="0" y={topPad} width={width} height={plotHeight / 2} />
      </clipPath>
      <clipPath id={lowerClipId}>
        <rect x="0" y={mid} width={width} height={plotHeight / 2} />
      </clipPath>
      <path d={areaPath} fill="var(--brass)" opacity={0.28} clipPath={`url(#${upperClipId})`} />
      <path d={areaPath} fill="var(--oxblood-light)" opacity={0.28} clipPath={`url(#${lowerClipId})`} />
      <polyline points={linePoints} fill="none" stroke="var(--parchment)" strokeWidth={1.5} />
      {points.map((p, i) => {
        const isFinal = i === n - 1;
        const homeAhead = p.q.margin_at_break > 0;
        const awayAhead = p.q.margin_at_break < 0;
        const dotColor = homeAhead ? 'var(--brass)' : awayAhead ? 'var(--oxblood-light)' : 'var(--slate)';
        const title =
          p.q.margin_at_break === 0
            ? `${quarterLabel(p.q.quarter)}: scores level`
            : `${quarterLabel(p.q.quarter)}: ${homeAhead ? homeTeam : awayTeam} by ${Math.abs(p.q.margin_at_break)}`;
        return (
          <g key={p.q.quarter}>
            <title>{title}</title>
            <circle cx={p.x} cy={p.y} r={isFinal ? 3 : 2.2} fill={dotColor} />
            {/* Home's score always sits above the plot, always brass - a
                fixed rule rather than only colouring the leading team, so
                which row belongs to which side never has to be inferred. */}
            <text x={p.x} y={homeLabelY} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize={fontScore} fill="var(--brass)">
              {quarterScoreline(p.q.home_goals_cum, p.q.home_behinds_cum, p.q.home_score_cum)}
            </text>
            {/* Away's score always sits below the plot, always oxblood. */}
            <text
              x={p.x}
              y={awayLabelY}
              textAnchor="middle"
              fontFamily="ui-monospace, monospace"
              fontSize={fontScore}
              fill="var(--oxblood-light)"
            >
              {quarterScoreline(p.q.away_goals_cum, p.q.away_behinds_cum, p.q.away_score_cum)}
            </text>
            <text
              x={p.x}
              y={qLabelY}
              textAnchor="middle"
              fontFamily="ui-monospace, monospace"
              fontSize={fontLabel}
              letterSpacing="0.05em"
              fill="var(--slate)"
            >
              {quarterLabel(p.q.quarter).toUpperCase()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function QuarterScoreTable({ breakdown, homeTeam, awayTeam }: { breakdown: QuarterBreakdown[] | null; homeTeam: string; awayTeam: string }) {
  if (!breakdown || breakdown.length === 0) return null;
  return (
    <table className="w-full border-collapse font-mono text-[10px]">
      <thead>
        <tr>
          <th className="pb-1 text-left font-normal uppercase tracking-wide text-[var(--slate)]">Running score</th>
          {breakdown.map((q) => (
            <th key={q.quarter} className="pb-1 text-right font-normal uppercase tracking-wide text-[var(--slate)]">
              {quarterLabel(q.quarter)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr className="border-t border-[var(--hairline)]">
          <td className="py-1 text-left text-[var(--parchment)]">{homeTeam}</td>
          {breakdown.map((q) => (
            <td key={q.quarter} className="py-1 text-right text-[var(--parchment)]">
              {scoreline(q.home_goals_cum, q.home_behinds_cum, q.home_score_cum)}
            </td>
          ))}
        </tr>
        <tr className="border-t border-[var(--hairline)]">
          <td className="py-1 text-left text-[var(--parchment)]">{awayTeam}</td>
          {breakdown.map((q) => (
            <td key={q.quarter} className="py-1 text-right text-[var(--parchment)]">
              {scoreline(q.away_goals_cum, q.away_behinds_cum, q.away_score_cum)}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Match card
// ─────────────────────────────────────────────────────────────────────────

function MatchCard({
  match,
  matchKey,
  lineMaxima,
  expanded,
  onToggle,
}: {
  match: MatchCenter;
  matchKey: string;
  lineMaxima: Record<string, number>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [tab, setTab] = useState<'lines' | 'momentum'>('lines');

  const isDraw = match.actual_winner === 'Draw';
  const homeWon = !isDraw && match.actual_winner === match.home_team;
  const awayWon = !isDraw && match.actual_winner === match.away_team;
  const xscoreFavouredHome = match.home_raw_xscore > match.away_raw_xscore;
  const caption = momentumCaption(match);

  return (
    <div className="rounded-sm border border-[var(--hairline)] bg-[var(--panel)] p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--slate)]">Round {match.round}</span>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {isDraw && <DrawTag />}
          {!isDraw && match.is_robbery && <RobberyTag />}
          {!isDraw && match.is_comeback_win && <ComebackTag />}
        </div>
      </div>

      {/* ── Scoreline ─────────────────────────────────────────── */}
      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex items-center gap-2">
          <TeamMonogram team={match.home_team} />
          <div className="min-w-0">
            <div className={`font-display truncate text-sm font-medium ${homeWon ? 'text-[var(--brass)]' : 'text-[var(--parchment)]'}`}>
              {match.home_team}
            </div>
            <div className="font-mono text-[11px] text-[var(--slate)]">{scoreline(match.home_goals, match.home_behinds, match.home_score)}</div>
          </div>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-wide text-[var(--slate)]">vs</div>
        <div className="flex items-center justify-end gap-2 text-right">
          <div className="min-w-0">
            <div className={`font-display truncate text-sm font-medium ${awayWon ? 'text-[var(--brass)]' : 'text-[var(--parchment)]'}`}>
              {match.away_team}
            </div>
            <div className="font-mono text-[11px] text-[var(--slate)]">{scoreline(match.away_goals, match.away_behinds, match.away_score)}</div>
          </div>
          <TeamMonogram team={match.away_team} />
        </div>
      </div>

      {/* ── Momentum caption ─────────────────────────────────── */}
      {caption && <p className="mt-3 font-body text-[12px] leading-snug text-[var(--slate)]">{caption}</p>}

      {/* ── Quarter-by-quarter strip (always visible, no expand needed) ── */}
      <div className="mt-3 border-t border-[var(--hairline)] pt-3">
        <div className="mb-1.5 font-mono text-[9px] uppercase tracking-wide text-[var(--slate)]">By Quarter</div>
        <MomentumWorm breakdown={match.quarter_breakdown} homeTeam={match.home_team} awayTeam={match.away_team} compact idPrefix={svgId(matchKey)} />
      </div>

      {/* ── Expected score / luck strip ──────────────────────── */}
      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[var(--hairline)] pt-3 font-mono text-xs">
        <div className="text-center">
          <div className={xscoreFavouredHome ? 'text-[var(--parchment)]' : 'text-[var(--slate)]'}>
            {formatStatValue(match.home_raw_xscore)}
          </div>
          <div className="text-[9px] uppercase tracking-wide text-[var(--slate)]">Expected</div>
        </div>
        <div className="text-center">
          <div className={match.is_robbery ? 'text-[var(--oxblood-light)]' : 'text-[var(--parchment)]'}>{formatStatValue(match.luck_delta)}</div>
          <div className="text-[9px] uppercase tracking-wide text-[var(--slate)]">Luck Index</div>
        </div>
        <div className="text-center">
          <div className={!xscoreFavouredHome ? 'text-[var(--parchment)]' : 'text-[var(--slate)]'}>
            {formatStatValue(match.away_raw_xscore)}
          </div>
          <div className="text-[9px] uppercase tracking-wide text-[var(--slate)]">Expected</div>
        </div>
      </div>

      {/* ── Expandable breakdown (line PIR / quarter momentum) ── */}
      <button onClick={onToggle} className="mt-3 w-full text-center font-mono text-[9px] uppercase tracking-wide text-[var(--slate)]">
        {expanded ? 'Hide breakdown ▲' : 'Full breakdown ▼'}
      </button>

      {expanded && (
        <div className="mt-3 border-l-2 border-[var(--brass)] pl-4 pt-1">
          <div className="mb-3 flex gap-1 rounded-sm bg-[var(--ink)]/40 p-1">
            <TabButton label="Lines" active={tab === 'lines'} onClick={() => setTab('lines')} />
            <TabButton label="Momentum" active={tab === 'momentum'} onClick={() => setTab('momentum')} />
          </div>

          {tab === 'lines' ? (
            <div className="space-y-3">
              {LINE_CATEGORIES.map((cat) => (
                <MirrorBar
                  key={cat.label}
                  label={cat.label}
                  sub={cat.sub}
                  homeValue={Number(match[cat.homeKey]) || 0}
                  awayValue={Number(match[cat.awayKey]) || 0}
                  max={lineMaxima[cat.label] ?? 0}
                  color={cat.color}
                />
              ))}
              <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wide text-[var(--slate)]">
                <span>System Velocity</span>
                <span className="text-[var(--parchment)] normal-case">
                  {formatStatValue(match.home_system_velocity, 2)} — {formatStatValue(match.away_system_velocity, 2)}
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <QuarterScoreTable breakdown={match.quarter_breakdown} homeTeam={match.home_team} awayTeam={match.away_team} />
              {(match.quarters_led_home !== null || match.quarters_led_away !== null) && (
                <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wide text-[var(--slate)]">
                  <span>Change of ends led</span>
                  <span className="text-[var(--parchment)] normal-case">
                    {formatStatValue(match.quarters_led_home, 0)} — {formatStatValue(match.quarters_led_away, 0)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Case of the Round: the week's most dramatic swing, surfaced above the
// grid. Only renders when there's a genuine qualifying match (a real
// comeback win with a measurable deficit overcome) - an empty round just
// omits the section rather than manufacturing drama that isn't there.
// ─────────────────────────────────────────────────────────────────────────

function SpotlightCard({ match }: { match: MatchCenter }) {
  const loser = match.actual_winner === match.home_team ? match.away_team : match.home_team;
  const caption = momentumCaption(match);

  return (
    <section className="mb-8 rounded-sm border border-[var(--brass)] bg-[var(--panel)] p-6">
      <div className="mb-3 flex items-center gap-3 font-mono text-[10px] uppercase tracking-wide text-[var(--brass)]">
        <span className="inline-block h-px w-8 bg-[var(--brass)]" />
        Case of the Round · Greatest Comeback
      </div>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
        <div className="lg:w-72 lg:shrink-0">
          <h2 className="font-display text-2xl font-semibold leading-tight text-[var(--parchment)]">
            {match.actual_winner}
            <span className="mx-2 text-[var(--slate)]">d.</span>
            {loser}
          </h2>
          <p className="mt-1 font-mono text-[11px] text-[var(--slate)]">
            {scoreline(match.home_goals, match.home_behinds, match.home_score)} — {scoreline(match.away_goals, match.away_behinds, match.away_score)}
          </p>
          {caption && <p className="mt-3 font-body text-sm leading-relaxed text-[var(--parchment)]">{caption}</p>}
        </div>
        <div className="flex-1">
          <MomentumWorm breakdown={match.quarter_breakdown} homeTeam={match.home_team} awayTeam={match.away_team} idPrefix="spotlight" />
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────

type MatchFilter = 'all' | 'robberies' | 'comebacks';

export default function MatchCentre({ matches, currentSeason }: { matches: MatchCenter[]; currentSeason: string }) {
  const [filter, setFilter] = useState<MatchFilter>('all');
  const [query, setQuery] = useState('');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const latestRound = useMemo(() => (matches.length ? Math.max(...matches.map((m) => m.round)) : null), [matches]);

  const robberyCount = matches.filter((m) => m.is_robbery).length;
  const comebackCount = matches.filter((m) => m.is_comeback_win).length;

  const spotlightMatch = useMemo(() => {
    const comebacks = matches.filter((m) => m.is_comeback_win && (m.biggest_deficit_overcome ?? 0) > 0 && m.quarter_breakdown && m.quarter_breakdown.length > 0);
    if (comebacks.length === 0) return null;
    return comebacks.reduce((best, m) => ((m.biggest_deficit_overcome ?? 0) > (best.biggest_deficit_overcome ?? 0) ? m : best));
  }, [matches]);

  const lineMaxima = useMemo(() => {
    const maxima: Record<string, number> = {};
    for (const cat of LINE_CATEGORIES) {
      maxima[cat.label] = Math.max(
        0,
        ...matches.map((m) => Number(m[cat.homeKey]) || 0),
        ...matches.map((m) => Number(m[cat.awayKey]) || 0)
      );
    }
    return maxima;
  }, [matches]);

  const filteredMatches = useMemo(() => {
    return matches
      .filter((m) => {
        if (filter === 'robberies') return m.is_robbery;
        if (filter === 'comebacks') return m.is_comeback_win;
        return true;
      })
      .filter((m) => `${m.home_team} ${m.away_team}`.toLowerCase().includes(query.toLowerCase()));
  }, [matches, filter, query]);

  const summaryParts = [
    robberyCount > 0 ? `${robberyCount} match${robberyCount === 1 ? '' : 'es'} went against the model` : null,
    comebackCount > 0 ? `${comebackCount} comeback${comebackCount === 1 ? '' : 's'} in the shake-up` : null,
  ].filter(Boolean);

  return (
    <>
      

      <main className="font-body min-h-screen bg-[var(--ink)] px-6 py-12 text-[var(--parchment)] sm:px-10 lg:px-16">
        <div className="mx-auto max-w-6xl">
          
                    <SiteHeader />
          
          {/* ── Header ───────────────────────────────────────────── */}
          <header className="mb-10 border-b border-[var(--hairline)] pb-8">
            <div className="mb-3 flex items-center gap-3 font-mono text-[11px] tracking-[0.25em] text-[var(--brass)]">
              <span className="inline-block h-px w-8 bg-[var(--brass)]" />
              LEDGER · {currentSeason} SEASON{latestRound ? ` · ROUND ${latestRound}` : ''}
            </div>
            <h1 className="font-display text-4xl font-semibold tracking-tight text-[var(--parchment)] sm:text-5xl">
              Match Centre
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--slate)]">
              Every result from Round {latestRound ?? '—'} against its expected-score baseline.{' '}
              {summaryParts.length > 0 ? `${summaryParts.join(', ')} this round.` : 'Form held this round - no robberies, no comebacks.'}
            </p>
          </header>

          {/* ── Case of the Round ───────────────────────────────── */}
          {spotlightMatch && <SpotlightCard match={spotlightMatch} />}

          {/* ── Controls ─────────────────────────────────────────── */}
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search club…"
              className="w-full max-w-xs rounded-sm border border-[var(--hairline)] bg-[var(--panel)] px-3 py-2 font-mono text-xs text-[var(--parchment)] placeholder:text-[var(--slate)] focus:border-[var(--brass)] focus:outline-none"
            />
            <div className="flex flex-wrap gap-1.5">
              <PillFilter label={`All Matches (${matches.length})`} active={filter === 'all'} onClick={() => setFilter('all')} />
              <PillFilter label={`Robberies Only (${robberyCount})`} active={filter === 'robberies'} onClick={() => setFilter('robberies')} />
              <PillFilter label={`Comebacks Only (${comebackCount})`} active={filter === 'comebacks'} onClick={() => setFilter('comebacks')} />
            </div>
          </div>

          {/* ── Match grid ───────────────────────────────────────── */}
          {filteredMatches.length === 0 ? (
            <EmptyState text="No matches found for the current filters." />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {filteredMatches.map((match) => {
                const key = `${match.round}-${match.home_team}-${match.away_team}`;
                return (
                  <MatchCard
                    key={key}
                    matchKey={key}
                    match={match}
                    lineMaxima={lineMaxima}
                    expanded={expandedKey === key}
                    onToggle={() => setExpandedKey(expandedKey === key ? null : key)}
                  />
                );
              })}
            </div>
          )}

          {/* ── Legend ───────────────────────────────────────────── */}
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[10px] uppercase tracking-wide text-[var(--slate)]">
            <span>Expected = smoothed scoring baseline from each team's own shot volume, independent of conversion luck</span>
            <span>Luck Index = gap between the actual margin and the expected margin</span>
            <span>Robbery = the team favoured by Expected score didn't win</span>
            <span>Comeback = the eventual winner trailed at some point before triumphing</span>
            <span>By Quarter = margin over time - home's running score always sits above the chart (brass), away's always below (oxblood)</span>
            <span>Engine Room = Midfield + Ruck · Iron Curtain = Backs · The Arsenal = Forwards</span>
          </div>
        </div>
      </main>
    </>
  );
}