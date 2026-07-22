import React, { useMemo, useState } from 'react';
import fs from 'fs';
import path from 'path';
import SiteHeader from '../../components/SiteHeader';

// ─────────────────────────────────────────────────────────────────────────
// Types
//
// The season/round leaderboards carry the full box-score block from the
// backend (60+ raw stat columns) as well as a fixed set of identity
// fields. Rather than typing every stat column by hand - which would go
// stale the moment a new stat is added upstream - identity fields are
// typed explicitly and everything else is read dynamically off the object.
// ─────────────────────────────────────────────────────────────────────────

const IDENTITY_KEYS = [
  'playerId', 'givenName', 'surname', 'team', 'jumperNumber',
  'photoURL', 'round', 'opponent', 'PIR', 'game_title', '__rank',
] as const;

type GameLedgerEntry = {
  playerId: string;
  givenName: string;
  surname: string;
  team: string;
  jumperNumber: number;
  photoURL: string;
  round: number;
  opponent: string;
  PIR: number;
  game_title: string;
  [statKey: string]: any;
};

type ThreeRoundStretch = {
  playerId: string;
  givenName: string;
  surname: string;
  team: string;
  photoURL: string;
  cumulative_three_round_pir: number;
};

type TeamOfRoundPlayer = {
  slot_order: number;
  position_name: string;
  position_group: string;
  position_line: string;
  playerId: string;
  givenName: string;
  surname: string;
  team: string;
  photoURL: string;
  PIR: number;
};

type ESCGame = {
  playerId: string;
  givenName: string;
  surname: string;
  team: string;
  jumperNumber: number;
  photoURL: string;
  round: number;
  opponent: string;
  ESC: number;
  game_title: string;
};

type LedgerTab = 'season' | 'round' | 'team_of_round' | 'stretches' | 'esc';

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
    const dir = (file: string) => path.join(process.cwd(), 'json', currentSeason, 'players', file);

    const seasonGames: GameLedgerEntry[] = safeRead(dir('top_games_season_pir.json'), []);
    const roundGames: GameLedgerEntry[] = safeRead(dir('top_games_round_pir.json'), []);
    const threeRoundStretches: ThreeRoundStretch[] = safeRead(dir('top_three_round_pir.json'), []);
    const teamOfRound: TeamOfRoundPlayer[] = safeRead(dir('team_of_the_round.json'), []);
    const escGames: ESCGame[] = safeRead(dir('top_esc_games.json'), []);

    return {
      props: { seasonGames, roundGames, threeRoundStretches, teamOfRound, escGames, currentSeason },
      revalidate: 60,
    };
  } catch (error) {
    console.error('Static build compilation failed for top games ledger pipeline:', error);
    return {
      props: { seasonGames: [], roundGames: [], threeRoundStretches: [], teamOfRound: [], escGames: [], currentSeason: '' },
      revalidate: 10,
    };
  }
};

// ─────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────

// "clearances.totalClearances" -> "Total Clearances"; "onePercenters" -> "One Percenters"
function prettifyStatKey(key: string): string {
  const last = key.includes('.') ? key.split('.').pop()! : key;
  const spaced = last.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatStatValue(value: any): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(1);
  return String(value);
}

const CORE_STAT_KEYS = ['disposals', 'goals', 'tackles', 'marks', 'clearances.totalClearances', 'inside50s'];

// ─────────────────────────────────────────────────────────────────────────
// Formation layout for Team of the Round
//
// The 18 on-field slot_orders (from the R script) are grouped into the six
// real AFL lines, ordered forward line first (attacking end) down to the
// back line, three players per row - same order a team sheet is read in.
// Slots 19-23 (Utility/interchange) aren't part of any line, so they're
// rendered separately as a bench strip beneath the ground rows.
// ─────────────────────────────────────────────────────────────────────────

const FORMATION_ROWS: { label: string; slots: [number, number, number] }[] = [
  { label: 'Forward Line', slots: [16, 17, 18] },
  { label: 'Half-Forward Line', slots: [13, 14, 15] },
  { label: 'Followers', slots: [10, 11, 12] },
  { label: 'Centre Line', slots: [7, 8, 9] },
  { label: 'Half-Back Line', slots: [4, 5, 6] },
  { label: 'Back Line', slots: [1, 2, 3] },
];

// ─────────────────────────────────────────────────────────────────────────
// Small presentational helpers (shared visual language with the Breakout Dossier)
// ─────────────────────────────────────────────────────────────────────────

function PlayerPhoto({ src, alt, size = 14 }: { src: string; alt: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const dim = `h-${size} w-${size}`;
  if (failed || !src) {
    return (
      <div className={`flex ${dim} shrink-0 items-center justify-center rounded-sm border border-[var(--hairline)] bg-[var(--ink)] font-mono text-[9px] text-[var(--slate)]`}>
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
      className={`${dim} shrink-0 rounded-sm border border-[var(--hairline)] bg-[var(--ink)] object-cover`}
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

function RankBadge({ rank }: { rank: number }) {
  return (
    <span className="font-display text-lg font-semibold text-[var(--brass)]">
      №{String(rank).padStart(2, '0')}
    </span>
  );
}

function PositionCard({ player }: { player: TeamOfRoundPlayer }) {
  const fullName = `${player.givenName} ${player.surname}`;
  return (
    <div className="rounded-sm border border-[var(--hairline)] bg-[var(--ink)] p-3 text-center">
      <div className="flex justify-center">
        <PlayerPhoto src={player.photoURL} alt={fullName} size={16} />
      </div>
      <div className="font-mono text-[9px] uppercase tracking-wide text-[var(--slate)]">{player.position_name}</div>
      <div className="font-display mt-1 truncate text-sm font-medium text-[var(--parchment)]">{fullName}</div>
      <div className="font-mono text-[10px] text-[var(--slate)]">{player.team}</div>
      <div className="font-display mt-1 text-lg font-semibold text-[var(--brass)]">{formatStatValue(player.PIR)}</div>
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

// The signature device for this page: manila-style ledger tabs, staggered
// slightly like real folder tabs, standing in for the file navigation.
function LedgerTabs({
  tabs,
  active,
  onSelect,
}: {
  tabs: { key: LedgerTab; label: string; count: number }[];
  active: LedgerTab;
  onSelect: (key: LedgerTab) => void;
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

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-sm border border-dashed border-[var(--hairline)] px-6 py-16 text-center">
      <p className="font-mono text-xs uppercase tracking-wide text-[var(--slate)]">{text}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Game leaderboard card (used for both Season Top 50 and This Round)
// ─────────────────────────────────────────────────────────────────────────

function GameCard({ game, rank, expanded, onToggle }: { game: GameLedgerEntry; rank: number; expanded: boolean; onToggle: () => void }) {
  const fullName = `${game.givenName} ${game.surname}`;
  const extraStatEntries = Object.keys(game)
    .filter((k) => !IDENTITY_KEYS.includes(k as any))
    .map((k) => [k, game[k]] as const);

  return (
    <div
      onClick={onToggle}
      className="cursor-pointer rounded-sm border border-[var(--hairline)] bg-[var(--panel)] p-4 transition-colors hover:bg-[var(--panel-hover)]"
    >
      <div className="flex items-start justify-between gap-2">
        <RankBadge rank={rank} />
        <div className="text-right font-mono text-[10px] text-[var(--slate)]">
          R{game.round} vs {game.opponent}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <PlayerPhoto src={game.photoURL} alt={fullName} />
        <div className="min-w-0 flex-1">
          <div className="font-display truncate text-base font-medium text-[var(--parchment)]">{fullName}</div>
          <div className="font-mono text-[11px] text-[var(--slate)]">
            {game.team}{game.jumperNumber != null ? ` · #${game.jumperNumber}` : ''}
          </div>
        </div>
        <div className="text-right">
          <div className="font-display text-2xl font-semibold text-[var(--brass)]">{formatStatValue(game.PIR)}</div>
          <div className="font-mono text-[9px] uppercase tracking-wide text-[var(--slate)]">PIR</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[var(--hairline)] pt-3 font-mono text-xs sm:grid-cols-6">
        {CORE_STAT_KEYS.map((key) => (
          <div key={key} className="text-center">
            <div className="text-[var(--parchment)]">{formatStatValue(game[key])}</div>
            <div className="text-[9px] uppercase tracking-wide text-[var(--slate)]">{prettifyStatKey(key)}</div>
          </div>
        ))}
      </div>

      {expanded && (
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-l-2 border-[var(--brass)] pl-4 pt-3 font-mono text-xs sm:grid-cols-3">
          {extraStatEntries.map(([key, value]) => (
            <DetailStat key={key} label={prettifyStatKey(key)} value={formatStatValue(value)} />
          ))}
        </div>
      )}

      <div className="mt-3 text-center font-mono text-[9px] uppercase tracking-wide text-[var(--slate)]">
        {expanded ? 'Hide full box score ▲' : 'Full box score ▼'}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────

export default function TopGamesLedger({
  seasonGames,
  roundGames,
  threeRoundStretches,
  teamOfRound,
  escGames,
  currentSeason,
}: {
  seasonGames: GameLedgerEntry[];
  roundGames: GameLedgerEntry[];
  threeRoundStretches: ThreeRoundStretch[];
  teamOfRound: TeamOfRoundPlayer[];
  escGames: ESCGame[];
  currentSeason: string;
}) {
  const [activeTab, setActiveTab] = useState<LedgerTab>('season');
  const [query, setQuery] = useState('');
  const [teamFilter, setTeamFilter] = useState('All');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const latestRound = useMemo(
    () => (roundGames.length ? Math.max(...roundGames.map((g) => g.round)) : null),
    [roundGames]
  );

  const tabs: { key: LedgerTab; label: string; count: number }[] = [
    { key: 'season', label: 'Season Top 50', count: seasonGames.length },
    { key: 'round', label: latestRound ? `Round ${latestRound}` : 'This Round', count: roundGames.length },
    { key: 'team_of_round', label: 'Team of the Round', count: teamOfRound.length },
    { key: 'stretches', label: '3-Round Stretches', count: threeRoundStretches.length },
    { key: 'esc', label: 'ESC Leaderboard', count: escGames.length },
  ];

  const gameSourceForTab: GameLedgerEntry[] | ESCGame[] =
    activeTab === 'season' ? seasonGames : activeTab === 'round' ? roundGames : escGames;

  const teams = useMemo(() => {
    const source =
      activeTab === 'season' ? seasonGames : activeTab === 'round' ? roundGames : activeTab === 'esc' ? escGames : [];
    return ['All', ...Array.from(new Set(source.map((g: any) => g.team))).sort()];
  }, [activeTab, seasonGames, roundGames, escGames]);

  const filteredGames = useMemo(() => {
    if (activeTab !== 'season' && activeTab !== 'round' && activeTab !== 'esc') return [];
    const source: any[] = activeTab === 'season' ? seasonGames : activeTab === 'round' ? roundGames : escGames;
    return source
      .map((g, i) => ({ ...g, __rank: i + 1 })) // rank reflects position in the full ledger, fixed before filtering
      .filter((g) => {
        const matchesQuery = `${g.givenName} ${g.surname} ${g.team}`.toLowerCase().includes(query.toLowerCase());
        const matchesTeam = teamFilter === 'All' || g.team === teamFilter;
        return matchesQuery && matchesTeam;
      });
  }, [activeTab, seasonGames, roundGames, escGames, query, teamFilter]);

  const interchangeBench = useMemo(
    () => [...teamOfRound].filter((p) => p.slot_order > 18).sort((a, b) => a.slot_order - b.slot_order),
    [teamOfRound]
  );

  function switchTab(key: LedgerTab) {
    setActiveTab(key);
    setQuery('');
    setTeamFilter('All');
    setExpandedKey(null);
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
              LEDGER · {currentSeason} SEASON
            </div>
            <h1 className="font-display text-4xl font-semibold tracking-tight text-[var(--parchment)] sm:text-5xl">
              Peak Impact
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--slate)]">
              Every entry in the performance ledger: the 50 best games of the season, the standout
              performances from the latest round, a best-25 built purely on positional output, the hottest
              3-round stretches, and the leaderboard weighted for scoring impact rather than raw volume.
            </p>
          </header>

          {/* ── Ledger tabs ──────────────────────────────────────── */}
          <LedgerTabs tabs={tabs} active={activeTab} onSelect={switchTab} />

          <div className="rounded-b-sm rounded-tr-sm border border-[var(--hairline)] bg-[var(--panel)] p-5 sm:p-6">
            {/* ── Controls (game-based tabs only) ───────────────── */}
            {(activeTab === 'season' || activeTab === 'round' || activeTab === 'esc') && (
              <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search player or club…"
                  className="w-full max-w-xs rounded-sm border border-[var(--hairline)] bg-[var(--ink)] px-3 py-2 font-mono text-xs text-[var(--parchment)] placeholder:text-[var(--slate)] focus:border-[var(--brass)] focus:outline-none"
                />
                <div className="flex flex-wrap gap-1.5">
                  {teams.map((team) => (
                    <PillFilter key={team} label={team} active={teamFilter === team} onClick={() => setTeamFilter(team)} />
                  ))}
                </div>
              </div>
            )}

            {/* ── Season Top 50 / This Round / ESC Leaderboard ────── */}
            {(activeTab === 'season' || activeTab === 'round') && (
              filteredGames.length === 0 ? (
                <EmptyState text="No games match the current filters." />
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {(filteredGames as GameLedgerEntry[]).map((game) => {
                    const key = `${activeTab}-${game.playerId}-${game.round}`;
                    return (
                      <GameCard
                        key={key}
                        game={game}
                        rank={game.__rank}
                        expanded={expandedKey === key}
                        onToggle={() => setExpandedKey(expandedKey === key ? null : key)}
                      />
                    );
                  })}
                </div>
              )
            )}

            {activeTab === 'esc' && (
              filteredGames.length === 0 ? (
                <EmptyState text="No games match the current filters." />
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {(filteredGames as (ESCGame & { __rank: number })[]).map((game) => {
                    const fullName = `${game.givenName} ${game.surname}`;
                    return (
                      <div
                        key={`${game.playerId}-${game.round}`}
                        className="rounded-sm border border-[var(--hairline)] bg-[var(--ink)] p-4"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <RankBadge rank={game.__rank} />
                          <div className="text-right font-mono text-[10px] text-[var(--slate)]">
                            R{game.round} vs {game.opponent}
                          </div>
                        </div>
                        <div className="mt-3 flex items-center gap-3">
                          <PlayerPhoto src={game.photoURL} alt={fullName} />
                          <div className="min-w-0 flex-1">
                            <div className="font-display truncate text-base font-medium text-[var(--parchment)]">{fullName}</div>
                            <div className="font-mono text-[11px] text-[var(--slate)]">
                              {game.team}{game.jumperNumber != null ? ` · #${game.jumperNumber}` : ''}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-display text-2xl font-semibold text-[var(--fern-light)]">
                              {formatStatValue(game.ESC)}
                            </div>
                            <div className="font-mono text-[9px] uppercase tracking-wide text-[var(--slate)]">ESC</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {/* ── Team of the Round ────────────────────────────── */}
            {activeTab === 'team_of_round' && (
              teamOfRound.length === 0 ? (
                <EmptyState text="No team of the round has been generated yet." />
              ) : (
                <div className="space-y-6">
                  {FORMATION_ROWS.map((row) => {
                    const players = row.slots
                      .map((slot) => teamOfRound.find((p) => p.slot_order === slot))
                      .filter((p): p is TeamOfRoundPlayer => Boolean(p));
                    if (players.length === 0) return null;
                    return (
                      <div key={row.label}>
                        <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--brass)]">
                          {row.label}
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          {players.map((p) => (
                            <PositionCard key={p.playerId} player={p} />
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {interchangeBench.length > 0 && (
                    <div>
                      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--brass)]">
                        Interchange · {interchangeBench.length}
                      </div>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                        {interchangeBench.map((p) => (
                          <PositionCard key={p.playerId} player={p} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            )}

            {/* ── 3-Round Stretches ────────────────────────────── */}
            {activeTab === 'stretches' && (
              threeRoundStretches.length === 0 ? (
                <EmptyState text="No qualifying 3-round stretches yet this season." />
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {threeRoundStretches.map((p, idx) => {
                    const fullName = `${p.givenName} ${p.surname}`;
                    return (
                      <div
                        key={p.playerId}
                        className="flex items-center gap-3 rounded-sm border border-[var(--hairline)] bg-[var(--ink)] p-3"
                      >
                        <RankBadge rank={idx + 1} />
                        <PlayerPhoto src={p.photoURL} alt={fullName} />
                        <div className="min-w-0 flex-1">
                          <div className="font-display truncate text-base font-medium text-[var(--parchment)]">{fullName}</div>
                          <div className="font-mono text-[11px] text-[var(--slate)]">{p.team}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-display text-xl font-semibold text-[var(--oxblood-light)]">
                            {formatStatValue(p.cumulative_three_round_pir)}
                          </div>
                          <div className="font-mono text-[9px] uppercase tracking-wide text-[var(--slate)]">3-Rd PIR</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>

          {/* ── Legend ───────────────────────────────────────────── */}
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[10px] uppercase tracking-wide text-[var(--slate)]">
            <span>PIR = Traditional Player Impact Rating</span>
            <span>ESC = Expected Score Contribution, weighted for scoring impact over raw volume</span>
            <span>Team of the Round = top single-game PIR at each on-field position in the latest round, filling a full 23-player match-day sheet (18 starters + 5 interchange)</span>
          </div>
        </div>
      </main>
    </>
  );
}