import { GetStaticProps } from 'next';
import React, { useMemo, useState } from 'react';
import fs from 'fs';
import path from 'path';
import Link from 'next/link';
// Adjust this relative path if teams.tsx doesn't live directly under /pages —
// justice-ladder.tsx (one folder deeper, at pages/league/) imports it as
// '../../components/SiteHeader'.
import SiteHeader from '../components/SiteHeader';

// ─────────────────────────────────────────────────────────────────────────
// Types — mirrors the output of generate_narrative_copy() in
// 95_narrative_copy.R. All copy and all chart data is pre-computed at
// pipeline build time; this file only renders it. Nothing here reads
// story_hooks.json or does any stat calculation.
// ─────────────────────────────────────────────────────────────────────────

type Tone = 'brass' | 'oxblood' | 'fern' | 'slate';
type Stamp = { label: string; tone: Tone };

type MarkerTone = 'brass' | 'parchment';
type Marker = { label: string; value: number; tone: MarkerTone };

type ChartSpec =
  | {
      type: 'compare_track';
      subtype: 'points' | 'rank' | 'diverging';
      min: number;
      max: number;
      invert?: boolean;
      markerA: Marker;
      markerB: Marker;
      footnote?: string;
    }
  | { type: 'stat_spotlight'; value: number; unit: string; caption: string };

type ContentBlock = { type: 'paragraph'; text: string } | { type: 'chart'; chart: ChartSpec };

type TeamStory = {
  team: string;
  lead_priority: number;
  lead_tone: Tone;
  stamps: Stamp[];
  blocks: ContentBlock[];
};

// ─────────────────────────────────────────────────────────────────────────
// Data fetching — reads the pre-written article JSON, nothing else.
// ─────────────────────────────────────────────────────────────────────────

export const getStaticProps: GetStaticProps = async () => {
  const configPath = path.join(process.cwd(), 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const currentSeason = config.CURRENT_SEASON;

  const dataPath = path.join(process.cwd(), 'json', currentSeason, 'league', 'team_narratives.json');
  const stories: TeamStory[] = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  return {
    props: { stories, currentSeason },
    revalidate: 60,
  };
};

// ─────────────────────────────────────────────────────────────────────────
// Small presentational helpers — mirrors ToneText/StampBadge in
// justice-ladder.tsx so both pages read as the same publication.
// ─────────────────────────────────────────────────────────────────────────

const TONE_BORDER: Record<Tone, string> = {
  brass: 'border-[var(--brass)] text-[var(--brass)]',
  oxblood: 'border-[var(--oxblood-light)] text-[var(--oxblood-light)]',
  fern: 'border-[var(--fern-light)] text-[var(--fern-light)]',
  slate: 'border-[var(--slate)] text-[var(--slate)]',
};

const TONE_BORDER_L: Record<Tone, string> = {
  brass: 'border-[var(--brass)]',
  oxblood: 'border-[var(--oxblood-light)]',
  fern: 'border-[var(--fern-light)]',
  slate: 'border-[var(--slate)]',
};

const MARKER_BG: Record<MarkerTone, string> = {
  brass: 'bg-[var(--brass)]',
  parchment: 'bg-[var(--parchment)]',
};

const MARKER_TEXT: Record<MarkerTone, string> = {
  brass: 'text-[var(--brass)]',
  parchment: 'text-[var(--parchment)]',
};

function StampBadge({ label, tone }: Stamp) {
  return (
    <span
      className={`inline-block select-none rounded-sm border-[1.5px] px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] ${TONE_BORDER[tone]}`}
      style={{ transform: 'rotate(-2deg)' }}
    >
      {label}
    </span>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

// ─────────────────────────────────────────────────────────────────────────
// CompareTrack — the one chart component every "compare_track" spec
// renders through, whether it's plotting points, ladder ranks, or a
// diverging luck margin. brass marker = the model/deserved/baseline
// number, parchment marker = the real-world number (same convention as
// the Justice Ladder page's PointsBar). Marker A always sits above the
// track, marker B below, so labels never collide even when the two
// values land close together.
// ─────────────────────────────────────────────────────────────────────────

function TrackMarker({ pos, tone, label, value, side }: { pos: number; tone: MarkerTone; label: string; value: number; side: 'above' | 'below' }) {
  const isAbove = side === 'above';
  return (
    <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${pos}%` }}>
      <div className={`flex flex-col items-center ${isAbove ? 'flex-col-reverse' : ''}`}>
        <div className={`h-2.5 w-2.5 shrink-0 rounded-full border-2 border-[var(--ink)] ${MARKER_BG[tone]}`} />
        <div className={`whitespace-nowrap text-center font-mono ${MARKER_TEXT[tone]} ${isAbove ? 'mb-1.5' : 'mt-1.5'}`}>
          <div className="text-[9px] uppercase tracking-wide opacity-80">{label}</div>
          <div className="text-sm font-bold">{value}</div>
        </div>
      </div>
    </div>
  );
}

function CompareTrack({ chart }: { chart: Extract<ChartSpec, { type: 'compare_track' }> }) {
  const { min, max, markerA, markerB, subtype, invert, footnote } = chart;
  const span = max - min || 1;
  const pct = (v: number) => clamp(((v - min) / span) * 100, 0, 100);
  const posA = pct(markerA.value);
  const posB = pct(markerB.value);
  const zeroPos = min < 0 && max > 0 ? pct(0) : null;

  return (
    <div className="my-3 rounded-sm border border-[var(--hairline)] bg-[var(--ink)]/40 px-6 pb-4 pt-9">
      <div className="relative mb-1 h-1">
        <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-[var(--hairline)]" />
        {zeroPos !== null && (
          <div className="absolute top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-[var(--slate)]" style={{ left: `${zeroPos}%` }} />
        )}
        <TrackMarker pos={posA} tone={markerA.tone} label={markerA.label} value={markerA.value} side="above" />
        <TrackMarker pos={posB} tone={markerB.tone} label={markerB.label} value={markerB.value} side="below" />
      </div>
      {subtype === 'rank' && (
        <div className="mt-9 flex justify-between font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--slate)]">
          <span>{invert ? 'Best' : min}</span>
          <span>{invert ? 'Worst' : max}</span>
        </div>
      )}
      {footnote && <div className="mt-9 font-mono text-[10px] text-[var(--slate)]">{footnote}</div>}
    </div>
  );
}

function StatSpotlight({ chart }: { chart: Extract<ChartSpec, { type: 'stat_spotlight' }> }) {
  return (
    <div className="my-3 flex items-center gap-4 rounded-sm border border-[var(--hairline)] bg-[var(--ink)]/40 p-5">
      <div className="font-display text-4xl font-bold leading-none text-[var(--brass)]">
        {chart.value}
        <span className="ml-1 font-mono text-xs font-normal uppercase tracking-wide text-[var(--slate)]">{chart.unit}</span>
      </div>
      <div className="font-mono text-xs text-[var(--slate)]">{chart.caption}</div>
    </div>
  );
}

function Block({ block, isLede }: { block: ContentBlock; isLede: boolean }) {
  if (block.type === 'paragraph') {
    return (
      <p
        className={
          isLede
            ? "mb-5 font-display text-xl leading-relaxed text-[var(--parchment)] first-letter:mr-1 first-letter:float-left first-letter:font-display first-letter:text-6xl first-letter:font-bold first-letter:leading-[0.8] first-letter:text-[var(--brass)]"
            : 'mb-5 text-[15px] leading-relaxed text-[var(--parchment)]/90'
        }
      >
        {block.text}
      </p>
    );
  }
  return block.chart.type === 'stat_spotlight' ? <StatSpotlight chart={block.chart} /> : <CompareTrack chart={block.chart} />;
}

// ─────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────

export default function Teams({ stories, currentSeason }: { stories: TeamStory[]; currentSeason: string }) {
  const [query, setQuery] = useState('');

  const rows = useMemo(
    () => stories.filter((t) => t.team.toLowerCase().includes(query.toLowerCase())),
    [stories, query]
  );

  return (
    <main className="font-body min-h-screen bg-[var(--ink)] px-6 py-12 text-[var(--parchment)] sm:px-10 lg:px-16">
      <div className="mx-auto max-w-3xl">
        <SiteHeader />

        {/* ── Header ───────────────────────────────────────────── */}
        <header className="mb-10 border-b border-[var(--hairline)] pb-8">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 font-mono text-[11px] tracking-[0.25em] text-[var(--brass)]">
              <span className="inline-block h-px w-8 bg-[var(--brass)]" />
              STORY DESK · {currentSeason} SEASON
            </div>
            <Link href="/" className="font-mono text-xs text-[var(--brass)] hover:underline">
              ← Back to Dashboard
            </Link>
          </div>
          <h1 className="font-display text-4xl font-semibold tracking-tight text-[var(--parchment)] sm:text-5xl">
            This Round's Storylines
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--slate)]">
            Every write-up below is generated straight from the Justice Ladder, Form Pulse and Robbery of the Round
            data — no line here isn't backed by a number in the underlying model.
          </p>
        </header>

        {/* ── Controls ─────────────────────────────────────────── */}
        <div className="mb-12">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search club…"
            className="w-full max-w-xs rounded-sm border border-[var(--hairline)] bg-[var(--panel)] px-3 py-2 font-mono text-xs text-[var(--parchment)] placeholder:text-[var(--slate)] focus:border-[var(--brass)] focus:outline-none"
          />
        </div>

        {/* ── Articles ─────────────────────────────────────────── */}
        <div>
          {rows.map((story) => (
            <article key={story.team} className={`mb-14 border-l-2 pl-6 ${TONE_BORDER_L[story.lead_tone]}`}>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {story.stamps.map((stamp, i) => (
                  <StampBadge key={i} {...stamp} />
                ))}
              </div>
              <h2 className="mb-5 font-display text-3xl font-semibold text-[var(--parchment)] sm:text-4xl">
                {story.team}
              </h2>
              {story.blocks.map((block, i) => (
                <Block key={i} block={block} isLede={i === 0 && block.type === 'paragraph'} />
              ))}
            </article>
          ))}

          {rows.length === 0 && (
            <p className="py-12 text-center font-mono text-sm text-[var(--slate)]">
              No club matches "{query}".
            </p>
          )}
        </div>
      </div>
    </main>
  );
}