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

  // 2. Hand-crafted UI heights (0 to 100) ensuring every section is perfectly readable
  // This completely stops the text squishing seen in image_fb1643.png
  const tiers = [
    { label: 'Unicorn', color: 'fill-purple-950/40', yMin: 0,   yMax: 20,  rankMin: 1,                  rankMax: cutoffs.unicorn },
    { label: 'Elite',   color: 'fill-amber-950/40',  yMin: 20,  yMax: 40,  rankMin: cutoffs.unicorn + 1, rankMax: cutoffs.elite },
    { label: 'AFL Std', color: 'fill-blue-950/40',   yMin: 40,  yMax: 60,  rankMin: cutoffs.elite + 1,   rankMax: cutoffs.aflStd },
    { label: 'State',   color: 'fill-emerald-950/40',yMin: 60,  yMax: 80,  rankMin: cutoffs.aflStd + 1,  rankMax: cutoffs.state },
    { label: 'Local',   color: 'fill-zinc-800/40',   yMin: 80,  yMax: 100, rankMin: cutoffs.state + 1,   rankMax: cutoffs.local },
  ];

  // 3. Mapping function: Scales a rank linearly *within* its specific tier box
  const getCustomScaledY = (rank: number) => {
    if (!rank || rank <= 0 || rank > totalEligiblePlayers) return 100;

    // Find which tier the rank belongs to
    const tier = tiers.find(t => rank >= t.rankMin && rank <= t.rankMax) || tiers[tiers.length - 1];
    
    // Percent position within that specific rank bracket
    const range = tier.rankMax - tier.rankMin;
    const positionInRange = range === 0 ? 0 : (rank - tier.rankMin) / range;
    
    // Map that position into the visual UI pixel space (yMin to yMax)
    return tier.yMin + positionInRange * (tier.yMax - tier.yMin);
  };

  // 4. Map and filter points to discard unranked/dummy data rounds (like 9999)
  const formattedPoints = rankHistory.map((h, i) => {
    const isUnranked = !h.rank || h.rank <= 0 || h.rank === 9999 || h.rank > totalEligiblePlayers;
    return {
      x: i * (400 / Math.max(1, rankHistory.length - 1)),
      y: getCustomScaledY(h.rank),
      rank: h.rank,
      round: h.round,
      isUnranked
    };
  });

  // Build the SVG path string seamlessly skipping any unranked initial rounds
  const validPoints = formattedPoints.filter(p => !p.isUnranked);
  const polylinePointsStr = validPoints.map(p => `${p.x},${p.y}`).join(" ");

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Current Rank</div>
          <div className="text-2xl font-black text-white">
            {currentRank && currentRank <= totalEligiblePlayers ? `${currentRank}${currentRank === 1 ? 'st' : currentRank === 2 ? 'nd' : currentRank === 3 ? 'rd' : 'th'}` : 'N/A'}
          </div>
          <div className={`text-xs font-bold ${momentum === 'up' ? 'text-emerald-400' : momentum === 'down' ? 'text-red-400' : 'text-zinc-500'}`}>
            {momentum === 'up' ? '▲ Improving' : momentum === 'down' ? '▼ Slipping' : '— Stable'}
          </div>
        </div>
      </div>
      
      <div className="h-32 w-full relative group">
        <svg viewBox="0 0 400 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
          {/* Background Tier Bands */}
          {tiers.map((t, i) => (
            <g key={i}>
              <rect x="0" y={t.yMin} width="400" height={t.yMax - t.yMin} className={t.color} />
              <text 
                x="2" 
                y={t.yMax - 4} // Neatly anchors text right near the bottom boundary of each spaced out box
                className="text-[6px] fill-zinc-500 font-bold uppercase tracking-tighter" 
                style={{ fontSize: '6px' }}
              >
                {t.label}
              </text>
            </g>
          ))}
          
          {/* Trend Polyline - Only connects real, active ranks */}
          {validPoints.length > 0 && (
            <polyline
              fill="none"
              stroke="#22d3ee"
              strokeWidth="3"
              strokeLinejoin="round"
              points={polylinePointsStr}
            />
          )}
          
          {/* Interactive Data Dots - Hidden for unranked matches */}
          {formattedPoints.map((p, i) => {
            if (p.isUnranked) return null; // Simply don't render placeholder rounds
            return (
              <g key={i} className="group/dot cursor-pointer">
                <circle cx={p.x} cy={p.y} r="6" className="fill-transparent" />
                <circle cx={p.x} cy={p.y} r="3" className="fill-cyan-400" />
                <rect
                  x={p.x - 20}
                  y={p.y - 30}
                  width="40"
                  height="20"
                  rx="4"
                  className="opacity-0 group-hover/dot:opacity-100 fill-zinc-800 stroke-zinc-600 transition-opacity"
                />
                <text
                  x={p.x}
                  y={p.y - 17}
                  textAnchor="middle"
                  className="opacity-0 group-hover/dot:opacity-100 fill-white text-[8px] font-bold pointer-events-none"
                  style={{ fontSize: '8px' }}
                >
                  R{p.round}: #{p.rank}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

export default RankingMomentum;