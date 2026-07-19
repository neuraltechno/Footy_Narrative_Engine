import React from 'react';

const RankingMomentum = ({ rankHistory, currentRank, momentum, totalEligiblePlayers }: { rankHistory: any[], currentRank: number, momentum: string, totalEligiblePlayers: number }) => {

  // 1. Define distinct player cutoffs
  const cutoffs = {
    unicorn: Math.max(1, Math.ceil(totalEligiblePlayers * 0.01)),
    elite: Math.max(5, Math.ceil(totalEligiblePlayers * 0.12)),
    aflStd: Math.max(15, Math.ceil(totalEligiblePlayers * 0.65)),
    state: Math.max(65, Math.ceil(totalEligiblePlayers * 0.90)),
    local: totalEligiblePlayers
  };

  // 2. Tier bands, each scaled to occupy an equal visual slice regardless of
  // how many players actually sit inside it
  const tiers = [
    { label: 'Unicorn', fill: 'var(--brass-bright)', opacity: 0.16, yMin: 0,  yMax: 20,  rankMin: 1,                  rankMax: cutoffs.unicorn },
    { label: 'Elite',   fill: 'var(--brass)',         opacity: 0.14, yMin: 20, yMax: 40,  rankMin: cutoffs.unicorn + 1, rankMax: cutoffs.elite },
    { label: 'AFL Std', fill: 'var(--fern-light)',    opacity: 0.10, yMin: 40, yMax: 60,  rankMin: cutoffs.elite + 1,   rankMax: cutoffs.aflStd },
    { label: 'State',   fill: 'var(--slate)',         opacity: 0.10, yMin: 60, yMax: 80,  rankMin: cutoffs.aflStd + 1,  rankMax: cutoffs.state },
    { label: 'Local',   fill: 'var(--hairline)',      opacity: 0.6,  yMin: 80, yMax: 100, rankMin: cutoffs.state + 1,   rankMax: cutoffs.local },
  ];

  // 3. Mapping function: scales a rank linearly *within* its specific tier box
  const getCustomScaledY = (rank: number) => {
    if (!rank || rank <= 0 || rank > totalEligiblePlayers) return 100;
    const tier = tiers.find(t => rank >= t.rankMin && rank <= t.rankMax) || tiers[tiers.length - 1];
    const range = tier.rankMax - tier.rankMin;
    const positionInRange = range === 0 ? 0 : (rank - tier.rankMin) / range;
    return tier.yMin + positionInRange * (tier.yMax - tier.yMin);
  };

  // 4. Map and filter points, carrying through whether the player actually
  // played that round (rank can still move on rounds they missed, since a
  // missed round's average carries forward flat while others move around it)
  const formattedPoints = rankHistory.map((h, i) => {
    const isUnranked = !h.rank || h.rank <= 0 || h.rank === 9999 || h.rank > totalEligiblePlayers;
    return {
      x: i * (400 / Math.max(1, rankHistory.length - 1)),
      y: getCustomScaledY(h.rank),
      rank: h.rank,
      round: h.round,
      played: h.played !== false,
      isUnranked
    };
  });

  const validPoints = formattedPoints.filter(p => !p.isUnranked);
  const polylinePointsStr = validPoints.map(p => `${p.x},${p.y}`).join(" ");
  const hasInactiveMovement = validPoints.some(p => !p.played);

  const momentumColor = momentum === 'up' ? 'text-[var(--fern-light)]' : momentum === 'down' ? 'text-[var(--oxblood-light)]' : 'text-[var(--slate)]';

  return (
    <div className="rounded-sm border border-[var(--hairline)] bg-[var(--ink)]/60 p-4">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--slate)]">Current Standing</div>
          <div className="font-display text-2xl font-semibold text-[var(--parchment)]">
            {currentRank && currentRank <= totalEligiblePlayers ? `${currentRank}${currentRank === 1 ? 'st' : currentRank === 2 ? 'nd' : currentRank === 3 ? 'rd' : 'th'}` : 'Unranked'}
          </div>
          <div className={`font-mono text-xs font-bold ${momentumColor}`}>
            {momentum === 'up' ? '▲ Climbing' : momentum === 'down' ? '▼ Slipping' : '— Holding'}
          </div>
        </div>
      </div>

      <div className="group relative h-32 w-full">
        <svg viewBox="0 0 400 100" preserveAspectRatio="none" className="h-full w-full overflow-visible">
          {/* Background Tier Bands */}
          {tiers.map((t, i) => (
            <g key={i}>
              <rect x="0" y={t.yMin} width="400" height={t.yMax - t.yMin} fill={t.fill} fillOpacity={t.opacity} />
              <text
                x="2"
                y={t.yMax - 4}
                className="fill-[var(--slate)] font-bold uppercase tracking-tighter"
                style={{ fontSize: '6px', fontFamily: 'JetBrains Mono, monospace' }}
              >
                {t.label}
              </text>
            </g>
          ))}

          {/* Trend Polyline */}
          {validPoints.length > 0 && (
            <polyline fill="none" stroke="var(--brass)" strokeWidth="3" strokeLinejoin="round" points={polylinePointsStr} />
          )}

          {/* Data points - hollow ring on rounds the player didn't feature */}
          {formattedPoints.map((p, i) => {
            if (p.isUnranked) return null;
            return (
              <g key={i} className="group/dot cursor-pointer">
                <circle cx={p.x} cy={p.y} r="6" fill="transparent" />
                {p.played ? (
                  <circle cx={p.x} cy={p.y} r="3" fill="var(--brass-bright)" />
                ) : (
                  <circle cx={p.x} cy={p.y} r="3" fill="var(--ink)" stroke="var(--slate)" strokeWidth="1.5" />
                )}
                <rect
                  x={p.x - 26}
                  y={p.y - 32}
                  width="52"
                  height="22"
                  rx="2"
                  className="opacity-0 group-hover/dot:opacity-100 transition-opacity"
                  fill="var(--panel)"
                  stroke="var(--hairline)"
                />
                <text
                  x={p.x}
                  y={p.y - 22}
                  textAnchor="middle"
                  className="opacity-0 group-hover/dot:opacity-100 pointer-events-none font-bold"
                  style={{ fontSize: '8px', fill: 'var(--parchment)', fontFamily: 'JetBrains Mono, monospace' }}
                >
                  R{p.round}: #{p.rank}{!p.played ? ' *' : ''}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {hasInactiveMovement && (
        <div className="mt-1 font-mono text-[8px] text-[var(--slate)]">
          <span className="text-[var(--parchment)]">○</span> hollow point = rank moved while not on the park that round
        </div>
      )}
    </div>
  );
};

export default RankingMomentum;