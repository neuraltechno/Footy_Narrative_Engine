import { GetStaticProps } from "next";
import fs from "fs";
import path from "path";
import Link from "next/link";
import React, { useState } from "react";
import config from "../config.json";

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

type TeamInsight = { name: string; status: string; contenderScore: number };

type BreakoutPlayer = {
  playerId: string;
  givenName: string;
  surname: string;
  team: string;
  photoURL?: string;
  age: number;
  position: string;
  delta: number;
  breakout_score: number;
};

type TopPlayer = {
  "player.givenName": string;
  "player.surname": string;
  Season_Avg_PIR: number;
  "player.team"?: string;
};

type TopGame = { givenName: string; surname: string; PIR: number; game_title: string };

type CategoryKing = { category: string; leader: { name: string; score: number } };

type JusticeTeam = {
  team: string;
  Justice_Rank: number;
  Actual_Rank: number;
  Luck_Rating: number;
  Luck_Status: string;
  Justice_Rank_Movement: number;
};

type InsightData = {
  round: number;
  teams: TeamInsight[];
  topBreakoutPlayers: BreakoutPlayer[];
  top10Players: TopPlayer[];
  top10Games: TopGame[];
  topCategoryKings: CategoryKing[];
  headline?: string;
  dek?: string;
};

type JusticeSpotlight = {
  luckiest: JusticeTeam | null;
  cursed: JusticeTeam | null;
  biggestMover: JusticeTeam | null;
};

// ─────────────────────────────────────────────────────────────────────────
// Small presentational helpers
// ─────────────────────────────────────────────────────────────────────────

function NavTab({ href, label, emphasis = false }: { href: string; label: string; emphasis?: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-sm border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors ${
        emphasis
          ? "border-[var(--brass)] text-[var(--brass)] hover:bg-[var(--brass)]/10"
          : "border-[var(--hairline)] text-[var(--slate)] hover:border-[var(--slate)] hover:text-[var(--parchment)]"
      }`}
    >
      {label}
    </Link>
  );
}

function PlayerPhoto({ src, alt }: { src?: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !src) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm border border-[var(--hairline)] bg-[var(--ink)] font-mono text-[9px] text-[var(--slate)]">
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
      className="h-12 w-12 shrink-0 rounded-sm border border-[var(--hairline)] bg-[var(--ink)] object-cover"
    />
  );
}

function MovementArrow({ value }: { value: number }) {
  if (value === 0) return <span className="font-mono text-xs text-[var(--slate)]">—</span>;
  const up = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 font-mono text-xs ${up ? "text-[var(--fern-light)]" : "text-[var(--oxblood-light)]"}`}>
      <svg width="8" height="8" viewBox="0 0 10 10" className={up ? "" : "rotate-180"}>
        <path d="M5 0 L10 8 L0 8 Z" fill="currentColor" />
      </svg>
      {Math.abs(value)}
    </span>
  );
}

function TeaserTile({
  href,
  eyebrow,
  hook,
  stat,
  statLabel,
  photoSrc,
  photoAlt,
  glyph,
}: {
  href: string;
  eyebrow: string;
  hook: string;
  stat?: string;
  statLabel?: string;
  photoSrc?: string;
  photoAlt?: string;
  glyph?: string;
}) {
  return (
    <Link
      href={href}
      className="group flex h-full flex-col justify-between rounded-sm border border-[var(--hairline)] bg-[var(--panel)] p-4 transition-colors hover:bg-[var(--panel-hover)] hover:border-[var(--brass)]/60"
    >
      <div>
        <div className="mb-3 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--brass)]">{eyebrow}</span>
          {photoSrc !== undefined ? (
            <PlayerPhoto src={photoSrc} alt={photoAlt || eyebrow} />
          ) : (
            <span className="text-xl leading-none opacity-80">{glyph}</span>
          )}
        </div>
        <p className="font-display text-sm leading-snug text-[var(--parchment)]">{hook}</p>
      </div>
      <div className="mt-4 flex items-center justify-between">
        {stat ? (
          <span className="font-mono text-sm font-bold text-[var(--fern-light)]">
            {stat} <span className="text-[10px] font-normal uppercase tracking-wide text-[var(--slate)]">{statLabel}</span>
          </span>
        ) : (
          <span />
        )}
        <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--slate)] transition-colors group-hover:text-[var(--brass)]">
          Read &rarr;
        </span>
      </div>
    </Link>
  );
}

function SpotlightCard({
  eyebrow,
  team,
  tone,
  children,
}: {
  eyebrow: string;
  team: string;
  tone: "brass" | "oxblood" | "fern";
  children: React.ReactNode;
}) {
  const border = {
    brass: "border-[var(--brass)]",
    oxblood: "border-[var(--oxblood-light)]",
    fern: "border-[var(--fern-light)]",
  }[tone];
  return (
    <div className={`rounded-sm border-l-2 bg-[var(--panel)] px-4 py-3 ${border}`}>
      <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--slate)]">{eyebrow}</div>
      <div className="font-display mt-1 text-lg font-medium text-[var(--parchment)]">{team}</div>
      <div className="mt-1 font-mono text-xs text-[var(--slate)]">{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Narrative fallback
// ─────────────────────────────────────────────────────────────────────────

function buildFallbackNarrative(
  data: InsightData,
  justice: JusticeSpotlight
): { headline: string; dek: string } {
  const topContender = data.teams.length
    ? data.teams.reduce((a, b) => (b.contenderScore > a.contenderScore ? b : a))
    : null;
  const topBreakout = data.topBreakoutPlayers[0];

  const luckLine =
    justice.luckiest && justice.cursed
      ? `${justice.luckiest.team} is riding the run of the season while ${justice.cursed.team} can't catch a break`
      : topContender
      ? `${topContender.name} heads the power rankings at ${topContender.contenderScore}/100`
      : "The ladder is taking shape";

  const headline = `Round ${data.round}: ${luckLine}`;

  const dekParts: string[] = [];
  if (topBreakout) {
    dekParts.push(`${topBreakout.givenName} ${topBreakout.surname} is this week's fastest riser`);
  }
  if (data.top10Games[0]) {
    dekParts.push(`${data.top10Games[0].givenName} ${data.top10Games[0].surname} posted the standout individual game`);
  }
  const dek = dekParts.length
    ? dekParts.join(", and ") + "."
    : "Every result, ranked, weighed and cross-examined.";

  return { headline, dek };
}

// ─────────────────────────────────────────────────────────────────────────
// Page Component
// ─────────────────────────────────────────────────────────────────────────

export default function Home({ data, justice }: { data: InsightData; justice: JusticeSpotlight }) {
  const { headline, dek } = data.headline
    ? { headline: data.headline, dek: data.dek || "" }
    : buildFallbackNarrative(data, justice);

  const topContender = data.teams.length
    ? data.teams.reduce((a, b) => (b.contenderScore > a.contenderScore ? b : a))
    : null;
  const topBreakout = data.topBreakoutPlayers[0];
  const topGame = data.top10Games[0];
  const topSeasonLeader = data.top10Players[0];
  const topCategoryKing = data.topCategoryKings[0];

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
          font-family: "Fraunces", Georgia, serif;
        }
        .font-mono {
          font-family: "JetBrains Mono", ui-monospace, monospace;
        }
        .font-body {
          font-family: "Inter", system-ui, sans-serif;
        }
        @media (prefers-reduced-motion: reduce) {
          * {
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>

      <main className="font-body min-h-screen bg-[var(--ink)] px-6 py-10 text-[var(--parchment)] sm:px-10 lg:px-16">
        <div className="mx-auto max-w-6xl">
          {/* ── Utility bar ──────────────────────────────────────── */}
          <div className="mb-10 flex flex-col gap-4 border-b border-[var(--hairline)] pb-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 font-mono text-[11px] tracking-[0.25em] text-[var(--brass)]">
              <span className="inline-block h-px w-8 bg-[var(--brass)]" />
              FOOTY NARRATIVE ENGINE
            </div>
            <nav className="flex flex-wrap gap-2">
              <NavTab href="/teams" label="Team Insights" />
              <NavTab href="/players" label="Player Ratings" />
              <NavTab href="/stats/top-games" label="Top Games" />
              <NavTab href="/stats/category-kings" label="Category Kings" />
              <NavTab href="/stats/breakout-watch" label="Breakout Watch" />
              <NavTab href="/stats/justice-ladder" label="Justice Ladder" emphasis />
            </nav>
          </div>

          {/* ── Hero storyline ───────────────────────────────────── */}
          <header className="mb-14">
            <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--slate)]">
              Round {data.round} Storyline
            </div>
            <h1 className="font-display max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight text-[var(--parchment)] sm:text-5xl">
              {headline}
            </h1>
            {dek && <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--slate)]">{dek}</p>}

            <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-[var(--hairline)] pt-6 font-mono text-xs">
              {topContender && (
                <span className="text-[var(--slate)]">
                  Top contender <span className="text-[var(--parchment)]">{topContender.name}</span>{" "}
                  <span className="text-[var(--brass)]">{topContender.contenderScore}/100</span>
                </span>
              )}
              {topSeasonLeader && (
                <span className="text-[var(--slate)]">
                  Season leader{" "}
                  <span className="text-[var(--parchment)]">
                    {topSeasonLeader["player.givenName"]} {topSeasonLeader["player.surname"]}
                  </span>{" "}
                  <span className="text-[var(--brass)]">{topSeasonLeader["Season_Avg_PIR"].toFixed(1)} avg</span>
                </span>
              )}
              {topGame && (
                <span className="text-[var(--slate)]">
                  Best single game{" "}
                  <span className="text-[var(--parchment)]">
                    {topGame.givenName} {topGame.surname}
                  </span>{" "}
                  <span className="text-[var(--brass)]">{topGame.PIR.toFixed(1)} PIR</span>
                </span>
              )}
            </div>
          </header>

          {/* ── Teaser tiles ─────────────────────────────────────── */}
          <section className="mb-14">
            <div className="mb-6 flex items-center justify-between border-b border-[var(--hairline)] pb-4">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--brass)]">This Week's Files</div>
                <h2 className="font-display mt-1 text-xl font-semibold text-[var(--parchment)]">Dig Deeper</h2>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {topContender && (
                <TeaserTile
                  href="/teams"
                  eyebrow="Team Insights"
                  hook={`${topContender.name} sits top of the power rankings, rated ${topContender.status.toLowerCase()}.`}
                  stat={`${topContender.contenderScore}/100`}
                  statLabel="contender score"
                  glyph="📊"
                />
              )}
              {topSeasonLeader && (
                <TeaserTile
                  href="/players"
                  eyebrow="Player Ratings"
                  hook={`${topSeasonLeader["player.givenName"]} ${topSeasonLeader["player.surname"]} leads the competition on season average.`}
                  stat={topSeasonLeader["Season_Avg_PIR"].toFixed(1)}
                  statLabel="PIR / game"
                  glyph="🏆"
                />
              )}
              {topGame && (
                <TeaserTile
                  href="/stats/top-games"
                  eyebrow="Top Games"
                  hook={`${topGame.givenName} ${topGame.surname} produced the biggest individual game of the season so far.`}
                  stat={topGame.PIR.toFixed(1)}
                  statLabel="PIR"
                  glyph="🔥"
                />
              )}
              {topCategoryKing && (
                <TeaserTile
                  href="/stats/category-kings"
                  eyebrow="Category Kings"
                  hook={`${topCategoryKing.leader.name} tops the ${topCategoryKing.category} charts.`}
                  stat={topCategoryKing.leader.score.toFixed(1)}
                  statLabel={topCategoryKing.category}
                  glyph="👑"
                />
              )}
              {topBreakout && (
                <TeaserTile
                  href="/stats/breakout-watch"
                  eyebrow="Breakout Watch"
                  hook={`${topBreakout.givenName} ${topBreakout.surname} (${topBreakout.team || "AFL Club"}) is this week's fastest riser.`}
                  stat={`+${topBreakout.breakout_score.toFixed(1)}`}
                  statLabel="breakout score"
                  photoSrc={topBreakout.photoURL}
                  photoAlt={`${topBreakout.givenName} ${topBreakout.surname}`}
                />
              )}
            </div>
          </section>

          {/* ── Spotlight: Justice Ladder ────────────────────────── */}
          <section>
            <div className="mb-6 flex items-center justify-between border-b border-[var(--hairline)] pb-4">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--brass)]">This Week's Verdict</div>
                <h2 className="font-display mt-1 text-xl font-semibold text-[var(--parchment)]">The Justice Ladder</h2>
                <p className="mt-1 max-w-xl text-xs text-[var(--slate)]">
                  Who's over-performing their underlying numbers, who's due a reckoning — and who moved the most.
                </p>
              </div>
              <Link
                href="/stats/justice-ladder"
                className="shrink-0 font-mono text-[11px] uppercase tracking-wide text-[var(--slate)] transition-colors hover:text-[var(--brass)]"
              >
                Read The Full Ladder &rarr;
              </Link>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {justice.luckiest && (
                <SpotlightCard eyebrow="Luckiest" team={justice.luckiest.team} tone="brass">
                  <span className="text-[var(--brass)]">+{justice.luckiest.Luck_Rating.toFixed(1)}</span> luck rating ·
                  ladder rank {justice.luckiest.Actual_Rank}
                </SpotlightCard>
              )}
              {justice.cursed && (
                <SpotlightCard eyebrow="Cursed" team={justice.cursed.team} tone="oxblood">
                  <span className="text-[var(--oxblood-light)]">{justice.cursed.Luck_Rating.toFixed(1)}</span> luck rating ·
                  ladder rank {justice.cursed.Actual_Rank}
                </SpotlightCard>
              )}
              {justice.biggestMover && (
                <SpotlightCard eyebrow="Biggest Mover" team={justice.biggestMover.team} tone="fern">
                  <span className="inline-flex items-center gap-1">
                    <MovementArrow value={justice.biggestMover.Justice_Rank_Movement} /> in Justice Rank this round
                  </span>
                </SpotlightCard>
              )}
            </div>
          </section>

          {/* ── Footer note ──────────────────────────────────────── */}
          <div className="mt-14 flex flex-wrap gap-x-6 gap-y-2 border-t border-[var(--hairline)] pt-6 font-mono text-[10px] uppercase tracking-wide text-[var(--slate)]">
            <span>Compiled overnight from the Round {data.round} dataset</span>
            <span>All figures reflect Player Impact Rating (PIR) unless noted</span>
          </div>
        </div>
      </main>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Data fetching
// ─────────────────────────────────────────────────────────────────────────

export const getStaticProps: GetStaticProps = async () => {
  const currentSeason = config.CURRENT_SEASON;
  const filePath = path.join(process.cwd(), "data", "latest_insights.json");
  const jsonData = fs.readFileSync(filePath, "utf-8");
  const data = JSON.parse(jsonData);

  const breakoutFilePath = path.join(process.cwd(), "json", currentSeason, "players", "breakout_watch.json");
  const breakoutData = JSON.parse(fs.readFileSync(breakoutFilePath, "utf-8"));
  const topBreakoutPlayers = breakoutData
    .sort((a: any, b: any) => b.breakout_score - a.breakout_score)
    .slice(0, 5);

  const playersFilePath = path.join(process.cwd(), "json", currentSeason, "players", "players_pir.json");
  const playersData = JSON.parse(fs.readFileSync(playersFilePath, "utf-8"));
  const top10Players = playersData
    .sort((a: any, b: any) => b.Season_Avg_PIR - a.Season_Avg_PIR)
    .slice(0, 5);

  const gamesFilePath = path.join(process.cwd(), "json", currentSeason, "players", "top_games_pir.json");
  const gamesData = JSON.parse(fs.readFileSync(gamesFilePath, "utf-8"));
  const top10Games = gamesData.sort((a: any, b: any) => b.PIR - a.PIR).slice(0, 5);

  const categoryKingsFilePath = path.join(process.cwd(), "json", currentSeason, "players", "category_kings.json");
  const categoryKingsData = JSON.parse(fs.readFileSync(categoryKingsFilePath, "utf-8"));
  
  // Defensive check: If the JSON has a "categories" wrapper, parse that. Else fall back to key mapping.
  const categoriesSource = categoryKingsData.categories || categoryKingsData;

  const topCategoryKings = Object.entries(categoriesSource)
    .map(([key, value]: [string, any]) => {
      // Safely drill down to locate the leading player
      const leaders = value?.leaders || value;
      const topLeader = Array.isArray(leaders) ? leaders[0] : null;

      if (!topLeader) return null;

      return {
        category: value?.label || key.replace("Avg_cat_", "").replace(/_/g, " "),
        leader: {
          name: `${topLeader.givenName} ${topLeader.surname}`,
          score: topLeader.score,
        },
      };
    })
    .filter(Boolean) as CategoryKing[]; // Filters out any null values

  // Justice Ladder spotlight — same source file as /stats/justice-ladder.
  let justice: JusticeSpotlight = { luckiest: null, cursed: null, biggestMover: null };
  try {
    const justiceFilePath = path.join(process.cwd(), "json", currentSeason, "league", "justice_ladder.json");
    const justiceData: JusticeTeam[] = JSON.parse(fs.readFileSync(justiceFilePath, "utf-8"));
    if (justiceData.length) {
      justice = {
        luckiest: justiceData.reduce((a, b) => (b.Luck_Rating > a.Luck_Rating ? b : a)),
        cursed: justiceData.reduce((a, b) => (b.Luck_Rating < a.Luck_Rating ? b : a)),
        biggestMover: justiceData.reduce((a, b) =>
          Math.abs(b.Justice_Rank_Movement) > Math.abs(a.Justice_Rank_Movement) ? b : a
        ),
      };
    }
  } catch (err) {
    console.error("Justice Ladder spotlight unavailable for homepage:", err);
  }

  return {
    props: {
      data: {
        ...data,
        topBreakoutPlayers,
        top10Players,
        top10Games,
        topCategoryKings,
      },
      justice,
    },
    revalidate: 60,
  };
};