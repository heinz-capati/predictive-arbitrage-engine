import React from 'react';
import {
  Zap,
  TrendingUp,
  PauseCircle,
  Sliders,
  RotateCcw,
} from 'lucide-react';
import {
  formatDecimal,
  formatSignedDecimal,
  getStatusTheme,
} from '../utils/formatters';

/**
 * Action Engine: What To Do Next (Glassmorphic Bento Panel for Quant Terminal View)
 */
export default function AlertBanner({
  product,
  computedDecision,
  params,
  onChangeParams,
  onResetParams,
}) {
  if (!product) return null;

  const { actionThreshold, decisionStatus, criticalFractile } = computedDecision;
  const theme = getStatusTheme(decisionStatus);

  // Position marker on threshold gauge (0.0 to 2.2 scale)
  const gaugePercent = Math.min(
    100,
    Math.max(2, (actionThreshold / 2.2) * 100)
  );

  const StatusIcon =
    decisionStatus === 'Restock/Capitalize'
      ? Zap
      : decisionStatus === 'Run Ads/Monitor'
      ? TrendingUp
      : PauseCircle;

  return (
    <div
      className={`relative flex h-full flex-col justify-between rounded-xl border bg-gradient-to-br p-5 backdrop-blur-xl transition-all duration-200 ${theme.bannerBg} ${theme.glow}`}
    >
      {/* Top Status Header */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${theme.dotColor}`}
            />
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-slate-100">
              Action Engine: What To Do Next
            </span>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 font-mono text-xs font-semibold ${theme.badgeBg}`}
          >
            <StatusIcon className="h-3.5 w-3.5" />
            {theme.label}
          </span>
        </div>

        {/* Selected SKU Context */}
        <div className="mt-3.5">
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span className="font-mono font-semibold text-[#00E5FF]">
              {product.product_id}
            </span>
            <span className="rounded border border-white/10 bg-white/[0.05] px-2.5 py-0.5 font-mono text-[11px] text-slate-200">
              {product.category}
            </span>
          </div>
          <h2 className="mt-1.5 text-lg font-bold leading-snug tracking-tight text-white">
            {product.product_name}
          </h2>
        </div>

        {/* Action Threshold Callout */}
        <div className="mt-4 rounded-lg border border-white/10 bg-black/50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div
                className={`flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-wider ${theme.accentText}`}
              >
                <StatusIcon className="h-4 w-4 shrink-0" />
                <span>{theme.headline}</span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                {theme.subheadline}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <span className="block font-mono text-[11px] uppercase tracking-wider text-slate-400">
                Threshold
              </span>
              <span
                className={`font-mono text-3xl font-extrabold tracking-tight ${theme.accentText}`}
              >
                {formatDecimal(actionThreshold, 3)}
              </span>
            </div>
          </div>

          {/* Visual Decision Rule Spectrum Bar */}
          <div className="mt-4">
            <div className="mb-1.5 flex justify-between font-mono text-[11px] text-slate-400">
              <span>0.0 Hold</span>
              <span>0.80 Ads</span>
              <span>1.20 Restock</span>
              <span>2.2+</span>
            </div>
            <div className="relative h-2.5 w-full overflow-hidden rounded-full border border-white/10 bg-black p-0.5">
              <div className="flex h-full w-full overflow-hidden rounded-full">
                <div style={{ width: '36.36%' }} className="bg-white/10" />
                <div style={{ width: '18.18%' }} className="bg-[#7A4DE8]/70" />
                <div style={{ width: '45.46%' }} className="bg-[#00E5FF]/80" />
              </div>
              <div
                style={{ left: `calc(${gaugePercent}% - 5px)` }}
                className="absolute top-0 h-2.5 w-2.5 rounded-sm bg-white shadow-[0_0_8px_#00E5FF] transition-all duration-200"
              />
            </div>
          </div>
        </div>

        {/* Equation Breakdown Grid */}
        <div className="mt-3.5 grid grid-cols-3 gap-2.5">
          <div className="rounded-lg border border-white/10 bg-black/45 p-3">
            <span className="block font-mono text-[11px] uppercase text-slate-400">
              Z_social
            </span>
            <span className="mt-1 block font-mono text-base font-bold text-[#B497FF]">
              {formatSignedDecimal(product.z_score_social, 2)}σ
            </span>
            <span className="font-mono text-[11px] text-slate-400">14d MAD</span>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/45 p-3">
            <span className="block font-mono text-[11px] uppercase text-slate-400">
              M_trend
            </span>
            <span className="mt-1 block font-mono text-base font-bold text-[#7A4DE8]">
              {formatSignedDecimal(product.momentum_decay_factor, 3)}
            </span>
            <span className="font-mono text-[11px] text-slate-400">
              t={product.days_since_peak ?? 0}d peak
            </span>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/45 p-3">
            <span className="block font-mono text-[11px] uppercase text-slate-400">
              Fractile
            </span>
            <span className="mt-1 block font-mono text-base font-bold text-[#00E5FF]">
              {formatDecimal(criticalFractile, 3)}
            </span>
            <span className="font-mono text-[11px] text-slate-400">Cu/(Cu+Co)</span>
          </div>
        </div>
      </div>

      {/* Live Newsvendor Parameter Controls */}
      <div className="mt-4 rounded-lg border border-white/10 bg-black/45 p-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-slate-200">
            <Sliders className="h-3.5 w-3.5 text-[#00E5FF]" />
            <span>Newsvendor Parameters</span>
          </div>
          <button
            type="button"
            onClick={onResetParams}
            className="inline-flex items-center gap-1 rounded border border-white/15 bg-white/[0.05] px-2.5 py-1 font-mono text-[11px] text-slate-200 hover:border-white/30 hover:text-white"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        </div>

        <div className="mt-3 space-y-2.5 text-xs">
          <div>
            <div className="flex justify-between font-mono text-xs">
              <span className="text-slate-300">Underage Cost (C_u):</span>
              <span className="font-bold text-[#00E5FF]">${params.cu}</span>
            </div>
            <input
              type="range"
              min="10"
              max="150"
              step="5"
              value={params.cu}
              onChange={(e) =>
                onChangeParams({ ...params, cu: Number(e.target.value) })
              }
              className="mt-1.5 h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-white/15 accent-[#00E5FF]"
            />
          </div>

          <div>
            <div className="flex justify-between font-mono text-xs">
              <span className="text-slate-300">Overage Cost (C_o):</span>
              <span className="font-bold text-[#B497FF]">${params.co}</span>
            </div>
            <input
              type="range"
              min="10"
              max="150"
              step="5"
              value={params.co}
              onChange={(e) =>
                onChangeParams({ ...params, co: Number(e.target.value) })
              }
              className="mt-1.5 h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-white/15 accent-[#7A4DE8]"
            />
          </div>

          <div>
            <div className="flex justify-between font-mono text-xs">
              <span className="text-slate-300">Momentum Weight (ω):</span>
              <span className="font-bold text-slate-100">
                {Number(params.omega).toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0.2"
              max="2.5"
              step="0.1"
              value={params.omega}
              onChange={(e) =>
                onChangeParams({ ...params, omega: Number(e.target.value) })
              }
              className="mt-1.5 h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-white/15 accent-[#00E5FF]"
            />
          </div>
        </div>

        <div className="mt-3 rounded border border-white/10 bg-black/70 px-3 py-2 font-mono text-xs text-slate-300">
          T = [C_u / (C_u + C_o)] × (1 + ω · M_trend)
        </div>
      </div>
    </div>
  );
}
