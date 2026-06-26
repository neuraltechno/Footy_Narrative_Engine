import React from 'react';

const RoundHistoryChart = ({ roundHistory }: { roundHistory: any }) => {
  // 1. Structural Fix: Handle R's nested data.frame-to-JSON double array wrapper safely
  const actualHistory = Array.isArray(roundHistory?.[0]) ? roundHistory[0] : roundHistory;

  if (!actualHistory || !Array.isArray(actualHistory) || actualHistory.length === 0) return null;

  // Find maximum value dynamically to scale heights better on low-scoring defenders
  const maxScoreInHistory = Math.max(...actualHistory.map((h: any) => h.pir || 0), 100);
  const chartCeiling = Math.min(220, maxScoreInHistory + 20);

  return (
    <div className="mb-4 bg-zinc-950/40 border border-zinc-800/50 rounded-lg p-2.5">
      <div className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold mb-2 flex justify-between items-center">
        <span>PIR Round Performance Tracker</span>
        <span className="text-[8px] text-zinc-600">
          Rounds {actualHistory[0]?.round}–{actualHistory[actualHistory.length - 1]?.round}
        </span>
      </div>
      
      {/* Chart Canvas */}
      <div className="relative flex items-end h-16 pt-2 px-1 w-full gap-1.5 border-b border-zinc-800/40 pb-1">
        {actualHistory.map((h: any, i: number) => {
          const roundPir = h.pir || 0;
          const runningAvg = h.running_avg_pir || 0;
          
          // Calculate proportional height based on actual context
          const barHeight = (Math.min(chartCeiling, roundPir) / chartCeiling) * 100;
          
          // Dynamic Colors matching pure stat thresholds
          let barColor = 'bg-zinc-700/80';
          if (roundPir >= 150) barColor = 'bg-amber-400';
          else if (roundPir >= 110) barColor = 'bg-emerald-500';
          else if (roundPir >= 80) barColor = 'bg-blue-500';
          else if (roundPir > 0) barColor = 'bg-zinc-500';

          return (
            <div key={i} className="group flex-1 flex flex-col justify-end items-center relative h-full">
              {/* Individual Round Bar */}
              <div 
                className={`w-full rounded-t-sm transition-all duration-300 group-hover:brightness-110 ${barColor}`}
                style={{ height: `${Math.max(barHeight, 4)}%` }} // 4% floor so 0 scores aren't completely hidden
              />
              
              {/* Rich Context Tooltip */}
              <div className="absolute -top-12 hidden group-hover:flex flex-col bg-zinc-900 text-[9px] p-1.5 rounded border border-zinc-700 shadow-2xl pointer-events-none z-50 min-w-[85px]">
                <div className="font-bold text-zinc-400 border-b border-zinc-800 pb-0.5 mb-0.5">Round {h.round}</div>
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-500">PIR:</span>
                  <span className="font-black text-white">{roundPir.toFixed(1)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-500">AVG:</span>
                  <span className="font-bold text-zinc-300">{runningAvg.toFixed(1)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Round X-Axis Labels */}
      <div className="flex justify-between w-full pt-1 px-1 text-[7px] font-bold text-zinc-600 uppercase tracking-widest">
        {actualHistory.map((h: any, i: number) => (
          <span key={i} className="flex-1 text-center">R{h.round}</span>
        ))}
      </div>
    </div>
  );
};

export default RoundHistoryChart;