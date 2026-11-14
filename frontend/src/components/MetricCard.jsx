import React from 'react';

/**
 * Glassmorphic Bento-Grid KPI Telemetry Panel for Quant Terminal View
 */
export default function MetricCard({
  title,
  value,
  unit = '',
  formula = '',
  subtitle = '',
  trendValue = null,
  accent = 'cyan',
  icon: Icon = null,
}) {
  const accentStyles = {
    cyan: 'text-[#00E5FF]',
    purple: 'text-[#B497FF]',
    violet: 'text-[#B497FF]',
    emerald: 'text-[#00E5FF]',
    amber: 'text-slate-100',
    slate: 'text-slate-100',
  };

  const iconBgStyles = {
    cyan: 'bg-[#00E5FF]/10 text-[#00E5FF] border-[#00E5FF]/25',
    purple: 'bg-[#7A4DE8]/15 text-[#B497FF] border-[#7A4DE8]/30',
    violet: 'bg-[#7A4DE8]/15 text-[#B497FF] border-[#7A4DE8]/30',
    emerald: 'bg-[#00E5FF]/10 text-[#00E5FF] border-[#00E5FF]/25',
    amber: 'bg-white/[0.06] text-slate-300 border-white/10',
    slate: 'bg-white/[0.06] text-slate-300 border-white/10',
  };

  const valueColor = accentStyles[accent] || accentStyles.cyan;
  const iconBox = iconBgStyles[accent] || iconBgStyles.cyan;

  return (
    <div className="flex flex-col justify-between rounded-xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl transition-colors duration-150 hover:border-white/20">
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs font-semibold uppercase tracking-wider text-slate-300">
            {title}
          </span>
          {Icon && (
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${iconBox}`}>
              <Icon className="h-4 w-4" />
            </div>
          )}
        </div>

        <div className="mt-2.5 flex flex-wrap items-baseline gap-2">
          <span className={`font-mono text-2xl font-bold tracking-tight ${valueColor}`}>
            {value}
          </span>
          {unit && (
            <span className="font-mono text-xs font-medium text-slate-300">
              {unit}
            </span>
          )}
          {trendValue !== null && (
            <span
              className={`ml-auto rounded px-2 py-0.5 font-mono text-xs font-semibold ${
                Number(trendValue) >= 0
                  ? 'bg-[#00E5FF]/10 text-[#00E5FF]'
                  : 'bg-rose-500/15 text-rose-300'
              }`}
            >
              {Number(trendValue) >= 0 ? '+' : ''}
              {Number(trendValue).toFixed(1)}%
            </span>
          )}
        </div>
      </div>

      {(formula || subtitle) && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2.5 text-xs text-slate-300">
          {subtitle && <span className="leading-snug">{subtitle}</span>}
          {formula && (
            <code className="rounded border border-white/10 bg-black/60 px-2 py-0.5 font-mono text-[11px] text-slate-200">
              {formula}
            </code>
          )}
        </div>
      )}
    </div>
  );
}
