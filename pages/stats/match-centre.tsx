import React, { useMemo, useState } from 'react';
import fs from 'fs';
import path from 'path';

// ─────────────────────────────────────────────────────────────────────────
// Types
//
// team_match_centers.json is match_evals filtered to the latest completed
// round (see 40_match_metrics.R / process_stats.R) - one row per fixture.
// ─────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────
// Match card
// ─────────────────────────────────────────────────────────────────────────

function MatchCard({ match, lineMaxima, expanded, onToggle }: { match: MatchCenter; lineMaxima: Record<string, number>; expanded: boolean; onToggle: () => void }) {
  const isDraw = match.actual_winner === 'Draw';
  const homeWon = !isDraw && match.actual_winner === match.home_team;
  const awayWon = !isDraw && match.actual_winner === match.away_team;
  const xscoreFavouredHome = match.home_raw_xscore > match.away_raw_xscore;

  return (
    <div className="rounded-sm border border-[var(--hairline)] bg-[var(--panel)] p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--slate)]">Round {match.round}</span>
        {isDraw ? <DrawTag /> : match.is_robbery ? <RobberyTag /> : null}
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

      {/* ── Expandable line-by-line breakdown ────────────────── */}
      <button onClick={onToggle} className="mt-3 w-full text-center font-mono text-[9px] uppercase tracking-wide text-[var(--slate)]">
        {expanded ? 'Hide line breakdown ▲' : 'Line breakdown ▼'}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 border-l-2 border-[var(--brass)] pl-4 pt-1">
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
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────

type MatchFilter = 'all' | 'robberies';

export default function MatchCentre({ matches, currentSeason }: { matches: MatchCenter[]; currentSeason: string }) {
  const [filter, setFilter] = useState<MatchFilter>('all');
  const [query, setQuery] = useState('');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const latestRound = useMemo(() => (matches.length ? Math.max(...matches.map((m) => m.round)) : null), [matches]);

  const robberyCount = matches.filter((m) => m.is_robbery).length;

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
      .filter((m) => (filter === 'robberies' ? m.is_robbery : true))
      .filter((m) => `${m.home_team} ${m.away_team}`.toLowerCase().includes(query.toLowerCase()));
  }, [matches, filter, query]);

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
        <div className="mx-auto max-w-6xl">
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
              {robberyCount > 0
                ? `${robberyCount} match${robberyCount === 1 ? '' : 'es'} went against the model this round.`
                : 'No robberies this round - form held.'}
            </p>
          </header>

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
            <span>Engine Room = Midfield + Ruck · Iron Curtain = Backs · The Arsenal = Forwards</span>
          </div>
        </div>
      </main>
    </>
  );
}