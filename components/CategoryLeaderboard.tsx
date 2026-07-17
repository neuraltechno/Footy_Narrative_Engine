import React, { useState } from 'react';
import Link from 'next/link';

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────
// Exported so any page rendering category_kings.json (the Category Kings
// page today, potentially a player profile "standings" widget later) can
// share the same shape instead of redefining it.

export type Movement = 'new' | 'up' | 'down' | 'same';

export type KingLeader = {
  rank: number;
  playerId: string;
  givenName: string;
  surname: string;
  team: string;
  photoURL: string;
  score: number;
  movement: Movement;
  streak?: number | null;
};

// ─────────────────────────────────────────────────────────────────────────
// Small presentational helpers (module-private - only this component uses them)
// ─────────────────────────────────────────────────────────────────────────

function PlayerPhoto({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !src) {
    return (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-[var(--hairline)] bg-[var(--ink)] font-mono text-[8px] text-[var(--slate)]">
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
      className="h-11 w-11 shrink-0 rounded-sm border border-[var(--hairline)] bg-[var(--ink)] object-cover"
    />
  );
}

function movementTitle(movement: Movement) {
  switch (movement) {
    case 'new':
      return 'New to the top 5 this round';
    case 'up':
      return 'Moved up since last round';
    case 'down':
      return 'Slipped since last round';
    default:
      return 'Unchanged since last round';
  }
}

function MovementBadge({ movement }: { movement: Movement }) {
  const map: Record<Movement, { text: string; className: string }> = {
    new: { text: 'NEW', className: 'text-[var(--brass-bright)]' },
    up: { text: '▲', className: 'text-[var(--fern-light)]' },
    down: { text: '▼', className: 'text-[var(--oxblood-light)]' },
    same: { text: '–', className: 'text-[var(--slate)]' },
  };
  const { text, className } = map[movement];
  return (
    <span className={`font-mono text-[10px] font-bold tracking-wide ${className}`} title={movementTitle(movement)}>
      {text}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────
// Renders one category's top-N leaderboard: rank, photo, name/team, streak
// caption on the reigning #1, score, and a movement badge. Handles its own
// empty state so callers don't need to branch on leaders.length themselves.

export default function CategoryLeaderboard({
  leaders,
  accentColor,
  emptyMessage = 'No matches in this filter',
}: {
  leaders: KingLeader[];
  accentColor: string;
  emptyMessage?: string;
}) {
  if (leaders.length === 0) {
    return (
      <div className="rounded-sm border border-dashed border-[var(--hairline)] px-4 py-6 text-center">
        <p className="font-mono text-[10px] uppercase tracking-wide text-[var(--slate)]">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <ol className="flex flex-col gap-2">
      {leaders.map((player) => {
        const fullName = `${player.givenName} ${player.surname}`;
        return (
          <li key={player.playerId}>
            <Link
              href={`/players/${player.playerId}`}
              className="flex items-center gap-3 rounded-sm border border-transparent px-2 py-1.5 transition-colors hover:border-[var(--hairline)] hover:bg-[var(--panel-hover)]"
            >
              <span
                className="font-display w-5 shrink-0 text-center text-sm font-semibold"
                style={{ color: player.rank === 1 ? accentColor : 'var(--slate)' }}
              >
                {player.rank}
              </span>
              <PlayerPhoto src={player.photoURL} alt={fullName} />
              <div className="min-w-0 flex-1">
                <div className="font-display truncate text-sm font-medium text-[var(--parchment)]">{fullName}</div>
                <div className="font-mono text-[10px] text-[var(--slate)]">
                  {player.team}
                  {player.rank === 1 && player.streak && player.streak > 1 && (
                    <span className="text-[var(--brass)]"> · {player.streak} rds on top</span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="font-mono text-sm font-semibold text-[var(--parchment)]">
                  {player.score.toFixed(1)}
                </span>
                <MovementBadge movement={player.movement} />
              </div>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}