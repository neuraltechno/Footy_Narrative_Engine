import React, { useMemo, useState } from 'react';
import fs from 'fs';
import path from 'path';
import CategoryLeaderboard, { KingLeader } from '../../components/CategoryLeaderboard';
import SiteHeader from '../../components/SiteHeader';

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

type CategoryBlock = {
  label: string;
  stat_description: string;
  gap_to_second: number | null;
  leaders: KingLeader[];
};

type CategoryKingsData = {
  generated_round: number;
  categories: Record<string, CategoryBlock>;
};

// Fixed display order, matching CATEGORY_KINGS_DEFS in 00_config.R. Only
// keys actually present in the JSON are rendered, so an added/removed
// backend category doesn't break the page - it just appears/disappears.
const CATEGORY_ORDER = ['disposal', 'contest_clearance', 'damaging_impact', 'defensive_grit', 'ruck'];

// Colour is the one thing the JSON payload doesn't (and shouldn't) carry -
// everything else (label, description) comes straight from the data so the
// R config stays the single source of truth for wording.
const CATEGORY_COLOR: Record<string, string> = {
  disposal: 'var(--brass)',
  contest_clearance: 'var(--oxblood-light)',
  damaging_impact: 'var(--brass-bright)',
  defensive_grit: 'var(--slate)',
  ruck: 'var(--fern-light)',
};

// ─────────────────────────────────────────────────────────────────────────
// Data fetching
// ─────────────────────────────────────────────────────────────────────────
// Static generation, matching every other page in the site - the JSON is
// pre-baked overnight, so there's nothing here that needs a per-request
// server round trip.

export const getStaticProps = async () => {
  try {
    const configPath = path.join(process.cwd(), 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const currentSeason = config.CURRENT_SEASON;

    const dataPath = path.join(process.cwd(), 'json', currentSeason, 'players', 'category_kings.json');
    const data: CategoryKingsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

    return {
      props: { data, currentSeason },
      revalidate: 60,
    };
  } catch (error) {
    console.error('Static build compilation failed for category kings data pipeline:', error);
    return {
      props: { data: { generated_round: 0, categories: {} }, currentSeason: '' },
      revalidate: 10,
    };
  }
};

// ─────────────────────────────────────────────────────────────────────────
// Small presentational helpers
// ─────────────────────────────────────────────────────────────────────────

function gapNarrative(gap: number | null) {
  if (gap === null || Number.isNaN(gap)) return null;
  if (gap >= 5) return 'Running away with it';
  if (gap >= 2) return 'Clear at the top';
  if (gap > 0) return 'Nervous top spot';
  return 'Tied at the top';
}

function HighlightCard({
  eyebrow,
  name,
  detail,
  color,
}: {
  eyebrow: string;
  name: string;
  detail: string;
  color: string;
}) {
  return (
    <div className="rounded-sm border-l-2 bg-[var(--panel)] px-4 py-3" style={{ borderLeftColor: color }}>
      <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--slate)]">{eyebrow}</div>
      <div className="font-display mt-1 text-lg font-medium text-[var(--parchment)]">{name}</div>
      <div className="font-mono text-xs text-[var(--slate)]">{detail}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────

export default function CategoryKings({ data, currentSeason }: { data: CategoryKingsData; currentSeason: string }) {
  const [query, setQuery] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('All');

  const categoryKeys = useMemo(
    () => CATEGORY_ORDER.filter((key) => data.categories?.[key]),
    [data.categories]
  );

  const teams = useMemo(() => {
    const all = categoryKeys.flatMap((key) => data.categories[key].leaders.map((p) => p.team));
    return ['All', ...Array.from(new Set(all)).sort()];
  }, [categoryKeys, data.categories]);

  const filteredCategories = useMemo(() => {
    const result: Record<string, KingLeader[]> = {};
    categoryKeys.forEach((key) => {
      result[key] = data.categories[key].leaders.filter((p) => {
        const matchesTeam = selectedTeam === 'All' || p.team === selectedTeam;
        const matchesQuery = `${p.givenName} ${p.surname}`.toLowerCase().includes(query.toLowerCase());
        return matchesTeam && matchesQuery;
      });
    });
    return result;
  }, [categoryKeys, data.categories, selectedTeam, query]);

  // Longest-reigning king across every category - streak is only ever set
  // on the #1 entry, so this is a straight max over rank-1 rows.
  const longestReign = useMemo< { key: string; player: KingLeader } | null >(() => {
    let best: { key: string; player: KingLeader } | null = null;
    categoryKeys.forEach((key) => {
      const cat = data.categories[key] as { leaders?: KingLeader[]; gap_to_second?: number | null };
      const king = cat?.leaders?.find((p) => p.rank === 1 && Boolean(p.streak));
      if (king && (!best || (king.streak ?? 0) > (best.player.streak ?? 0))) {
        best = { key, player: king };
      }
    });
    return best;
  }, [categoryKeys, data.categories]);

  const widestGap = useMemo< { key: string; gap: number } | null >(() => {
    let best: { key: string; gap: number } | null = null;
    categoryKeys.forEach((key) => {
      const cat = data.categories[key] as { leaders?: KingLeader[]; gap_to_second?: number | null };
      const gap = cat?.gap_to_second;
      if (gap !== null && gap !== undefined && (!best || gap > best.gap)) {
        best = { key, gap };
      }
    });
    return best;
  }, [categoryKeys, data.categories]);

  // Freshly-crowned kings this round - a genuinely new #1, not just a new
  // face somewhere in the top 5.
  const newKings = useMemo< Array<{ key: string; player: KingLeader }> >(
    () =>
      categoryKeys
        .map((key) => {
          const cat = data.categories[key] as { leaders?: KingLeader[]; gap_to_second?: number | null };
          return { key, player: cat?.leaders?.find((p) => p.rank === 1) };
        })
        .filter((entry): entry is { key: string; player: KingLeader } => Boolean(entry.player && entry.player.movement === 'new')),
    [categoryKeys, data.categories]
  );

  return (
    <>
      

      <main className="font-body min-h-screen bg-[var(--ink)] px-6 py-12 text-[var(--parchment)] sm:px-10 lg:px-16">
        <div className="mx-auto max-w-6xl">

          <SiteHeader />

          {/* ── Header ───────────────────────────────────────────── */}
          <header className="mb-10 border-b border-[var(--hairline)] pb-8">
            <div className="mb-3 flex items-center gap-3 font-mono text-[11px] tracking-[0.25em] text-[var(--brass)]">
              <span className="inline-block h-px w-8 bg-[var(--brass)]" />
              LEADERBOARD LEDGER · {currentSeason} SEASON
              {data.generated_round > 0 && <span>· ROUND {data.generated_round}</span>}
            </div>
            <h1 className="font-display text-4xl font-semibold tracking-tight text-[var(--parchment)] sm:text-5xl">
              The Category Kings
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--slate)]">
              Tracking the elite performers across every vital statistic. Five thrones, five contests - watch who's
              holding the line and who's closing in.
            </p>
          </header>

          {/* ── Highlights ───────────────────────────────────────── */}
          <section className="mb-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {longestReign ? (
              <HighlightCard
                eyebrow="Longest Reign"
                name={`${longestReign.player.givenName.charAt(0)}. ${longestReign.player.surname}`}
                detail={`${longestReign.player.streak} rounds atop ${data.categories[longestReign.key]?.label || longestReign.key}`}
                color={CATEGORY_COLOR[longestReign.key]}
              />
            ) : (
              <HighlightCard eyebrow="Longest Reign" name="—" detail="No streak data yet" color="var(--slate)" />
            )}
            {widestGap ? (
              <HighlightCard
                eyebrow="Widest Margin"
                name={data.categories[widestGap.key].label}
                detail={`Clear by ${widestGap.gap.toFixed(1)} - ${gapNarrative(widestGap.gap)}`}
                color={CATEGORY_COLOR[widestGap.key]}
              />
            ) : (
              <HighlightCard eyebrow="Widest Margin" name="—" detail="No gap data yet" color="var(--slate)" />
            )}
            {newKings.length > 0 ? (
              <HighlightCard
                eyebrow="Freshly Crowned"
                name={`${newKings[0].player!.givenName.charAt(0)}. ${newKings[0].player!.surname}`}
                detail={`New #1 in ${data.categories[newKings[0].key].label}${
                  newKings.length > 1 ? ` (+${newKings.length - 1} more)` : ''
                }`}
                color="var(--brass-bright)"
              />
            ) : (
              <HighlightCard eyebrow="Freshly Crowned" name="—" detail="No new kings this round" color="var(--slate)" />
            )}
          </section>

          {/* ── Controls ─────────────────────────────────────────── */}
          <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search player…"
              className="w-full max-w-xs rounded-sm border border-[var(--hairline)] bg-[var(--panel)] px-3 py-2 font-mono text-xs text-[var(--parchment)] placeholder:text-[var(--slate)] focus:border-[var(--brass)] focus:outline-none"
            />
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="rounded-sm border border-[var(--hairline)] bg-[var(--panel)] px-3 py-2 font-mono text-xs text-[var(--parchment)] focus:border-[var(--brass)] focus:outline-none"
            >
              {teams.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* ── Category grid ────────────────────────────────────── */}
          {categoryKeys.length === 0 ? (
            <div className="rounded-sm border border-dashed border-[var(--hairline)] px-6 py-16 text-center">
              <p className="font-mono text-xs uppercase tracking-wide text-[var(--slate)]">
                No category data available for this round.
              </p>
            </div>
          ) : (
            <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              {categoryKeys.map((key) => {
                const category = data.categories[key];
                const color = CATEGORY_COLOR[key];
                const gapText = gapNarrative(category.gap_to_second);

                return (
                  <div
                    key={key}
                    className="rounded-sm border-t-2 bg-[var(--panel)] p-5"
                    style={{ borderTopColor: color }}
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <h2 className="font-display text-xl font-semibold text-[var(--parchment)]">
                          {category.label}
                        </h2>
                        <p className="font-mono text-[11px] text-[var(--slate)]">{category.stat_description}</p>
                      </div>
                      {category.gap_to_second !== null && (
                        <div className="shrink-0 text-right">
                          <div className="font-mono text-[10px] uppercase tracking-wide text-[var(--slate)]">
                            Gap to #2
                          </div>
                          <div className="font-display text-base font-medium" style={{ color }}>
                            +{category.gap_to_second.toFixed(1)}
                          </div>
                          {gapText && <div className="font-mono text-[9px] text-[var(--slate)]">{gapText}</div>}
                        </div>
                      )}
                    </div>

                    <CategoryLeaderboard leaders={filteredCategories[key]} accentColor={color} />
                  </div>
                );
              })}
            </section>
          )}

          {/* ── Legend ───────────────────────────────────────────── */}
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[10px] uppercase tracking-wide text-[var(--slate)]">
            <span className="flex items-center gap-1.5">
              <span className="text-[var(--brass-bright)]">NEW</span> New to the top 5 this round
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-[var(--fern-light)]">▲</span> Moved up
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-[var(--oxblood-light)]">▼</span> Moved down
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-[var(--slate)]">–</span> Unchanged
            </span>
            <span>Streak = consecutive rounds spent as the #1 in that category</span>
          </div>
        </div>
      </main>
    </>
  );
}