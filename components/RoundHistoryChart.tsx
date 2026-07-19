import React from 'react';

type RoundEntry = {
  round: number;
  pir: number;
  rank: number;
  running_avg_pir: number;
  played?: boolean;
};

const RoundHistoryChart = ({ roundHistory }: { roundHistory: any }) => {
  // Structural guard: R's data.frame-to-JSON serialization can occasionally
  // double-wrap a list column in an extra array layer.
  const actualHistory: RoundEntry[] = Array.isArray(roundHistory?.[0]) ? roundHistory[0] : roundHistory;

  if (!actualHistory || !Array.isArray(actualHistory) || actualHistory.length === 0) return null;

  const maxScoreInHistory = Math.max(...actualHistory.map((h) => h.pir || 0), 100);
  const chartCeiling = Math.min(220, maxScoreInHistory + 20);

  return (
    <div className="mb-4 rounded-sm border border-[var(--hairline)] bg-[var(--ink)]/60 p-2.5">
      <div className="mb-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-wider text-[var(--slate)]">
        <span className="font-bold">Round-By-Round Ledger</span>
        <span className="text-[8px]">
          R{actualHistory[0]?.round}–R{actualHistory[actualHistory.length - 1]?.round}
        </span>
      </div>

      {/* Chart Canvas */}
      <div className="relative flex h-16 w-full items-end gap-1.5 border-b border-[var(--hairline)] px-1 pb-1 pt-2">
        {actualHistory.map((h, i) => {
          const roundPir = h.pir || 0;
          const runningAvg = h.running_avg_pir || 0;
          const played = h.played !== false && roundPir > 0;

          const barHeight = (Math.min(chartCeiling, roundPir) / chartCeiling) * 100;

          let barColor = 'bg-[var(--slate)]/60';
          if (roundPir >= 150) barColor = 'bg-[var(--brass-bright)]';
          else if (roundPir >= 110) barColor = 'bg-[var(--brass)]';
          else if (roundPir >= 80) barColor = 'bg-[var(--fern-light)]';
          else if (roundPir > 0) barColor = 'bg-[var(--slate)]';

          return (
            <div key={i} className="group relative flex h-full flex-1 flex-col items-center justify-end">
              {played ? (
                <div
                  className={`w-full rounded-t-sm transition-all duration-300 group-hover:brightness-125 ${barColor}`}
                  style={{ height: `${Math.max(barHeight, 4)}%` }}
                />
              ) : (
                <div
                  className="w-full rounded-t-sm border border-dashed border-[var(--hairline)]"
                  style={{ height: '6%' }}
                  title="Did not play"
                />
              )}

              {/* Tooltip */}
              <div className="pointer-events-none absolute -top-12 z-50 hidden min-w-[85px] flex-col rounded-sm border border-[var(--hairline)] bg-[var(--panel)] p-1.5 font-mono text-[9px] shadow-2xl group-hover:flex">
                <div className="mb-0.5 border-b border-[var(--hairline)] pb-0.5 font-bold text-[var(--slate)]">
                  Round {h.round}
                </div>
                {played ? (
                  <>
                    <div className="flex justify-between gap-2">
                      <span className="text-[var(--slate)]">PIR:</span>
                      <span className="font-black text-[var(--parchment)]">{roundPir.toFixed(1)}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-[var(--slate)]">Avg:</span>
                      <span className="font-bold text-[var(--brass)]">{runningAvg.toFixed(1)}</span>
                    </div>
                  </>
                ) : (
                  <div className="text-[var(--oxblood-light)]">Did not play</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Round X-Axis Labels */}
      <div className="flex w-full justify-between px-1 pt-1 font-mono text-[7px] uppercase tracking-widest text-[var(--slate)]">
        {actualHistory.map((h, i) => (
          <span key={i} className="flex-1 text-center">R{h.round}</span>
        ))}
      </div>
    </div>
  );
};

export default RoundHistoryChart;