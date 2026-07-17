import React, { useMemo, useState } from 'react';
import fs from 'fs';
import path from 'path';

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

type TrendLabel = 'sustained_riser' | 'accelerating' | 'one_off_spike';

type BreakoutPlayer = {
  playerId: string;
  givenName: string;
  surname: string;
  team: string;
  photoURL: string;
  age: number;
  career_games: number | null;
  qualifies_via: 'age' | 'career_games';
  position: string;
  position_group: string;
  season_avg: number;
  recent_avg: number;
  delta: number;
  trend_label: TrendLabel;
  breakout_score: number;
  peak_game: number;
};

type SortKey = 'breakout_score' | 'delta' | 'age';

// ─────────────────────────────────────────────────────────────────────────
// Data fetching
// ─────────────────────────────────────────────────────────────────────────

export const getStaticProps = async () => {
  try {
    const configPath = path.join(process.cwd(), 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const currentSeason = config.CURRENT_SEASON;

    const dataPath = path.join(process.cwd(), 'json', currentSeason, 'players', 'breakout_watch.json');
    const data: BreakoutPlayer[] = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

    return {
      props: { data, currentSeason },
      revalidate: 60,
    };
  } catch (error) {
    console.error('Static build compilation failed for breakout watch data pipeline:', error);
    return {
      props: { data: [], currentSeason: '' },
      revalidate: 10,
    };
  }
};

// ─────────────────────────────────────────────────────────────────────────
// Small presentational helpers
// ─────────────────────────────────────────────────────────────────────────

function trendVerdict(label: TrendLabel) {
  if (label === 'sustained_riser') return { text: 'SUSTAINED RISE', tone: 'fern' as const };
  if (label === 'accelerating') return { text: 'ACCELERATING', tone: 'brass' as const };
  return { text: 'ONE-OFF SPIKE', tone: 'oxblood' as const };
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

function Stamp({ label }: { label: TrendLabel }) {
  const { text, tone } = trendVerdict(label);
  const border = {
    brass: 'border-[var(--brass)] text-[var(--brass)]',
    oxblood: 'border-[var(--oxblood-light)] text-[var(--oxblood-light)]',
    fern: 'border-[var(--fern-light)] text-[var(--fern-light)]',
  }[tone];
  return (
    <span
      className={`inline-block select-none rounded-sm border-[1.5px] px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.14em] ${border}`}
      style={{ transform: 'rotate(-2deg)' }}
    >
      {text}
    </span>
  );
}

// Flags a player who's over the age cutoff but still qualifies as an
// early-career prospect on games played - otherwise there's no visible
// reason they're on the list at all.
function GamesPathwayBadge() {
  return (
    <span
      className="inline-block select-none rounded-sm border-[1.5px] border-[var(--slate)] px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.14em] text-[var(--slate)]"
      title="Qualifies on career games played rather than age"
    >
      EARLY CAREER
    </span>
  );
}

// Two-dot trajectory bar: brass dot marks the season baseline, parchment
// dot marks the last-3-round form. The gap between them *is* the delta.
function FormBar({ seasonAvg, recentAvg, max }: { seasonAvg: number; recentAvg: number; max: number }) {
  const basePct = Math.min(100, (seasonAvg / max) * 100);
  const recentPct = Math.min(100, (recentAvg / max) * 100);
  return (
    <div className="w-full">
      <div className="relative h-1.5 rounded-full bg-[var(--hairline)]">
        <div
          className="absolute top-1/2 h-2 w-2 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-[var(--panel)] bg-[var(--brass)]"
          style={{ left: `${basePct}%` }}
          title={`Season baseline: ${seasonAvg.toFixed(1)}`}
        />
        <div
          className="absolute top-1/2 h-2 w-2 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-[var(--panel)] bg-[var(--parchment)]"
          style={{ left: `${recentPct}%` }}
          title={`Last 3 rounds: ${recentAvg.toFixed(1)}`}
        />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-[var(--slate)]">
        <span>{seasonAvg.toFixed(1)}</span>
        <span className="text-[var(--parchment)]">{recentAvg.toFixed(1)}</span>
      </div>
    </div>
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
      className={`rounded-sm border px-2.5 py-1.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brass)] ${
        active
          ? 'border-[var(--brass)] text-[var(--brass)]'
          : 'border-[var(--hairline)] text-[var(--slate)] hover:border-[var(--slate)]'
      }`}
    >
      {label} {active ? (dir === 'asc' ? '↑' : '↓') : ''}
    </button>
  );
}

function PositionChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
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

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wide text-[var(--slate)]">{label}</div>
      <div className="text-[var(--parchment)]">{value}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────

export default function BreakoutWatch({ data, currentSeason }: { data: BreakoutPlayer[]; currentSeason: string }) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('breakout_score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [activePosition, setActivePosition] = useState<string>('ALL');
  const [expanded, setExpanded] = useState<string | null>(null);

  const maxForm = useMemo(
    () => (data.length ? Math.max(...data.flatMap((p) => [p.season_avg, p.recent_avg])) * 1.08 : 1),
    [data]
  );

  const topScore = useMemo(
    () => (data.length ? data.reduce((a, b) => (b.breakout_score > a.breakout_score ? b : a)) : null),
    [data]
  );
  const mostSustained = useMemo(() => {
    const sustained = data.filter((p) => p.trend_label === 'sustained_riser');
    if (sustained.length === 0) return null;
    return sustained.reduce((a, b) => (b.breakout_score > a.breakout_score ? b : a));
  }, [data]);
  const youngest = useMemo(
    () => (data.length ? data.reduce((a, b) => (b.age < a.age ? b : a)) : null),
    [data]
  );

  const positions = useMemo(
    () => ['ALL', ...Array.from(new Set(data.map((p) => p.position_group))).sort()],
    [data]
  );

  const rows = useMemo(() => {
    const filtered = data.filter((p) => {
      const matchesQuery =
        `${p.givenName} ${p.surname} ${p.team}`.toLowerCase().includes(query.toLowerCase());
      const matchesPosition = activePosition === 'ALL' || p.position_group === activePosition;
      return matchesQuery && matchesPosition;
    });
    const sorted = [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return sorted;
  }, [data, query, sortKey, sortDir, activePosition]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'age' ? 'asc' : 'desc');
    }
  }

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
              SCOUTING FILE · {currentSeason} SEASON
            </div>
            <h1 className="font-display text-4xl font-semibold tracking-tight text-[var(--parchment)] sm:text-5xl">
              The Breakout Dossier
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--slate)]">
              A 3-round rolling model, weighted for youth, isolating players whose recent form has broken
              clear of their season baseline. The bar on each file plots that gap directly: brass marks
              where they've averaged all year, parchment marks where they're averaging right now.
            </p>
          </header>

          {/* ── Case highlights ─────────────────────────────────── */}
          <section className="mb-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {topScore && (
              <HighlightCard
                eyebrow="Highest Breakout Score"
                name={`${topScore.givenName.charAt(0)}. ${topScore.surname}`}
                detail={`${topScore.breakout_score.toFixed(1)} score · ${topScore.team}`}
                tone="brass"
              />
            )}
            {mostSustained ? (
              <HighlightCard
                eyebrow="Most Sustained Rise"
                name={`${mostSustained.givenName.charAt(0)}. ${mostSustained.surname}`}
                detail={`+${mostSustained.delta.toFixed(1)} delta, low variance`}
                tone="fern"
              />
            ) : (
              <HighlightCard eyebrow="Most Sustained Rise" name="—" detail="No sustained risers this round" tone="fern" />
            )}
            {youngest && (
              <HighlightCard
                eyebrow="Youngest On Watch"
                name={`${youngest.givenName.charAt(0)}. ${youngest.surname}`}
                detail={`Age ${youngest.age} · ${youngest.position}`}
                tone="oxblood"
              />
            )}
          </section>

          {/* ── Controls ─────────────────────────────────────────── */}
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search player or club…"
              className="w-full max-w-xs rounded-sm border border-[var(--hairline)] bg-[var(--panel)] px-3 py-2 font-mono text-xs text-[var(--parchment)] placeholder:text-[var(--slate)] focus:border-[var(--brass)] focus:outline-none"
            />
            <div className="flex gap-2 font-mono text-[11px] tracking-wide text-[var(--slate)]">
              <SortButton label="Breakout Score" active={sortKey === 'breakout_score'} dir={sortDir} onClick={() => toggleSort('breakout_score')} />
              <SortButton label="Delta" active={sortKey === 'delta'} dir={sortDir} onClick={() => toggleSort('delta')} />
              <SortButton label="Age" active={sortKey === 'age'} dir={sortDir} onClick={() => toggleSort('age')} />
            </div>
          </div>

          <div className="mb-8 flex flex-wrap gap-1.5">
            {positions.map((pos) => (
              <PositionChip key={pos} label={pos} active={activePosition === pos} onClick={() => setActivePosition(pos)} />
            ))}
          </div>

          {/* ── Dossier grid ─────────────────────────────────────── */}
          {rows.length === 0 ? (
            <div className="rounded-sm border border-dashed border-[var(--hairline)] px-6 py-16 text-center">
              <p className="font-mono text-xs uppercase tracking-wide text-[var(--slate)]">
                No open files match the current filters.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {rows.map((player, idx) => {
                const isOpen = expanded === player.playerId;
                const fullName = `${player.givenName} ${player.surname}`;
                return (
                  <div
                    key={player.playerId}
                    onClick={() => setExpanded(isOpen ? null : player.playerId)}
                    className="cursor-pointer rounded-sm border border-[var(--hairline)] bg-[var(--panel)] p-4 transition-colors hover:bg-[var(--panel-hover)]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-display text-lg font-semibold text-[var(--brass)]">
                        №{String(idx + 1).padStart(2, '0')}
                      </span>
                      <div className="flex flex-col items-end gap-1">
                        <Stamp label={player.trend_label} />
                        {player.qualifies_via === 'career_games' && <GamesPathwayBadge />}
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-3">
                      <PlayerPhoto src={player.photoURL} alt={fullName} />
                      <div className="min-w-0">
                        <div className="font-display truncate text-base font-medium text-[var(--parchment)]">{fullName}</div>
                        <div className="font-mono text-[11px] text-[var(--slate)]">{player.team}</div>
                        <div className="font-mono text-[10px] text-[var(--slate)]">
                          Age {player.age} · {player.position}
                          {player.career_games != null && (
                            <span className={player.qualifies_via === 'career_games' ? 'text-[var(--parchment)]' : ''}>
                              {' '}· {player.career_games} career games
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <FormBar seasonAvg={player.season_avg} recentAvg={player.recent_avg} max={maxForm} />
                    </div>

                    <div className="mt-3 flex items-center justify-between font-mono text-xs">
                      <ToneText tone="fern">+{player.delta.toFixed(1)} delta</ToneText>
                      <ToneText tone="brass">{player.breakout_score.toFixed(1)} score</ToneText>
                    </div>

                    {isOpen && (
                      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-l-2 border-[var(--brass)] pl-4 pt-3 font-mono text-xs">
                        <DetailStat label="Position Group" value={player.position_group} />
                        <DetailStat label="Peak Game (Season)" value={player.peak_game.toFixed(1)} />
                        <DetailStat label="Season Avg" value={player.season_avg.toFixed(1)} />
                        <DetailStat label="Last 3 Rounds Avg" value={player.recent_avg.toFixed(1)} />
                        <DetailStat
                          label="Career Games"
                          value={player.career_games != null ? String(player.career_games) : '—'}
                        />
                        <DetailStat
                          label="Qualifies Via"
                          value={player.qualifies_via === 'career_games' ? 'Career games' : 'Age'}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Legend ───────────────────────────────────────────── */}
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[10px] uppercase tracking-wide text-[var(--slate)]">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[var(--brass)]" /> Season baseline
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[var(--parchment)]" /> Last 3 rounds
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-3 rounded-sm border-[1.5px] border-[var(--slate)]" /> Early career = qualifies on games played, not age
            </span>
            <span>Sustained rise = trending up with low variance · Accelerating = trending up · One-off spike = one big game skewing the average</span>
          </div>
        </div>
      </main>
    </>
  );
}