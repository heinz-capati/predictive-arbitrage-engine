import React from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from 'recharts';
import {
  ShoppingCart,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  Sparkles,
} from 'lucide-react';
import AlertBanner from './AlertBanner';
import {
  formatDecimal,
  formatSignedDecimal,
  formatPercent,
  formatCompactNumber,
  formatShortDate,
  computeNewsvendorDecision,
  getStatusTheme,
} from '../utils/formatters';

/**
 * Custom Tooltip for the 30-Day Recharts Social Leading Indicator Chart
 */
function CustomCurveTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0]?.payload;

  return (
    <div className="rounded-xl border border-slate-700/90 bg-obsidian-950/95 p-3 shadow-xl backdrop-blur-md">
      <div className="mb-1.5 flex items-center justify-between gap-4 border-b border-slate-800 pb-1 font-mono text-xs text-slate-300">
        <span>Date: {label}</span>
        <span className="text-emerald-400">
          T = {formatDecimal(row?.action_threshold, 3)}
        </span>
      </div>
      <div className="space-y-1 font-mono text-xs">
        <div className="flex items-center justify-between gap-4">
          <span className="text-cyan-400">Z_social (MAD):</span>
          <span className="font-bold text-white">
            {formatSignedDecimal(row?.z_score_social, 3)}σ
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-violet-400">M_trend (Decay):</span>
          <span className="font-bold text-white">
            {formatSignedDecimal(row?.momentum_decay_factor, 3)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-400">Intent Engagement:</span>
          <span className="text-slate-200">
            {formatCompactNumber(row?.intent_weighted_engagement)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-400">E-comm Velocity:</span>
          <span className="text-slate-200">
            {formatDecimal(row?.ecomm_velocity, 1)} u/day
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Strict Dual-Pane Layout + Prominent Center Action Engine:
 * - Left Pane: E-commerce Lagging Indicators (Sales Velocity & Price Discrepancy table/list)
 * - Center Module: The Action Engine (AlertBanner & Newsvendor threshold controls)
 * - Right Pane: Social Leading Indicators (Recharts 30-day Z_social & M_trend decay curves)
 */
export default function DualPane({
  products,
  selectedProductId,
  onSelectProduct,
  params,
  onChangeParams,
  onResetParams,
}) {
  const selectedProduct =
    products.find((p) => p.product_id === selectedProductId) || products[0];

  const selectedDecision = selectedProduct
    ? computeNewsvendorDecision(
        selectedProduct.momentum_decay_factor,
        params.cu,
        params.co,
        params.omega
      )
    : { actionThreshold: 0, decisionStatus: 'Ignore', criticalFractile: 0.6 };

  const chartData = selectedProduct?.history30d || [];

  return (
    <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-12">
      {/* LEFT PANE: E-COMMERCE LAGGING INDICATORS (4 Columns on XL) */}
      <section className="flex h-[620px] flex-col rounded-2xl border border-slate-800/90 bg-obsidian-900/90 p-5 xl:col-span-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/30">
              <ShoppingCart className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight text-slate-100">
                Market Pricing & Sales Velocity
              </h2>
              <p className="text-xs text-slate-400">
                Daily unit velocity & cross-market price spreads
              </p>
            </div>
          </div>
          <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-slate-300">
            {products.length} SKUs
          </span>
        </div>

        {/* Table Header */}
        <div className="mt-3 grid grid-cols-12 gap-2 border-b border-slate-800/80 pb-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          <div className="col-span-5">Product / Category</div>
          <div className="col-span-3 text-right">Sales Vel.</div>
          <div className="col-span-2 text-right">Spread</div>
          <div className="col-span-2 text-right">Target</div>
        </div>

        {/* Interactive Product Rows (Scrollable within fixed height) */}
        <div className="mt-2 flex-1 space-y-2 overflow-y-auto pr-1">
          {products.map((item) => {
            const isSelected = item.product_id === selectedProduct?.product_id;
            const liveEval = computeNewsvendorDecision(
              item.momentum_decay_factor,
              params.cu,
              params.co,
              params.omega
            );
            const itemTheme = getStatusTheme(liveEval.decisionStatus);

            return (
              <button
                key={item.product_id}
                type="button"
                onClick={() => onSelectProduct(item.product_id)}
                className={`group grid w-full grid-cols-12 items-center gap-2 rounded-xl border p-3 text-left transition-all duration-150 ${
                  isSelected
                    ? 'border-emerald-500/50 bg-obsidian-800/95 shadow-md ring-1 ring-emerald-500/30'
                    : 'border-slate-800/70 bg-obsidian-950/60 hover:border-slate-700 hover:bg-obsidian-850'
                }`}
              >
                <div className="col-span-5 pr-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${itemTheme.dotColor}`}
                    />
                    <span className="truncate font-mono text-[11px] font-semibold text-slate-300">
                      {item.product_id}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs font-semibold text-white group-hover:text-emerald-300">
                    {item.product_name}
                  </p>
                  <span className="text-[10px] text-slate-400">
                    {item.category}
                  </span>
                </div>

                {/* Sales Velocity */}
                <div className="col-span-3 text-right font-mono">
                  <span className="block text-xs font-bold text-slate-100">
                    {formatDecimal(item.ecomm_velocity, 1)}/d
                  </span>
                  <span
                    className={`inline-flex items-center text-[10px] ${
                      item.velocityDelta >= 0
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {item.velocityDelta >= 0 ? (
                      <ArrowUpRight className="h-3 w-3" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3" />
                    )}
                    {Math.abs(item.velocityDelta).toFixed(1)}%
                  </span>
                </div>

                {/* Price Discrepancy */}
                <div className="col-span-2 text-right font-mono">
                  <span
                    className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${
                      item.price_discrepancy >= 20
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : item.price_discrepancy >= 12
                        ? 'bg-amber-500/15 text-amber-300'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {formatPercent(item.price_discrepancy, 1)}
                  </span>
                </div>

                {/* Computed Action Threshold */}
                <div className="col-span-2 text-right font-mono">
                  <span
                    className={`block text-xs font-extrabold ${itemTheme.accentText}`}
                  >
                    {formatDecimal(liveEval.actionThreshold, 2)}
                  </span>
                  <span className="text-[9px] uppercase text-slate-400">
                    {liveEval.decisionStatus === 'Restock/Capitalize'
                      ? 'RESTOCK'
                      : liveEval.decisionStatus === 'Run Ads/Monitor'
                      ? 'ADS'
                      : 'HOLD'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Cross-Market Profit Spread Footnote */}
        <div className="mt-3 shrink-0 rounded-xl border border-slate-800/80 bg-obsidian-950/80 p-3 text-xs text-slate-400">
          <div className="flex items-center gap-1.5 font-semibold text-slate-300">
            <Layers className="h-3.5 w-3.5 text-amber-400" />
            <span>Cross-Market Profit Spread</span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed">
            A wide <span className="text-slate-200">Price Spread (%)</span>{' '}
            paired with steady <span className="text-slate-200">Sales Velocity</span>{' '}
            while <span className="text-cyan-400">Z_social</span> climbs signals an
            underpriced product ready to scale.
          </p>
        </div>
      </section>

      {/* CENTER MODULE: THE ACTION ENGINE (4 Columns on XL) */}
      <section className="h-[620px] xl:col-span-4">
        <AlertBanner
          product={selectedProduct}
          computedDecision={selectedDecision}
          params={params}
          onChangeParams={onChangeParams}
          onResetParams={onResetParams}
        />
      </section>

      {/* RIGHT PANE: SOCIAL LEADING INDICATORS (4 Columns on XL) */}
      <section className="flex h-[620px] flex-col justify-between rounded-2xl border border-slate-800/90 bg-obsidian-900/90 p-5 xl:col-span-4">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 ring-1 ring-cyan-500/30">
                <Activity className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold tracking-tight text-slate-100">
                  Social Momentum & Trend Decay
                </h2>
                <p className="text-xs text-slate-400">
                  30-day buyer buzz (Z_social) & trend durability (M_trend)
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 px-2.5 py-0.5 font-mono text-[11px] text-cyan-300 ring-1 ring-cyan-500/30">
              <Sparkles className="h-3 w-3" />
              λ = 0.10
            </span>
          </div>

          {/* Equation Strip */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800/80 bg-obsidian-950/90 px-3 py-2 font-mono text-[11px] text-slate-300">
            <span>Z = (log1p(E_t) - Med_14) / (1.4826 · MAD_14)</span>
            <span className="text-violet-400">M = ΔZ · e^(-λt)</span>
          </div>
        </div>

        {/* Recharts 30-Day Line & Area Chart (Locked to clean 340px height) */}
        <div className="my-3 h-[340px] w-full shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 10, right: 10, left: -18, bottom: 0 }}
            >
              <defs>
                <linearGradient id="zSocialGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#1e293b"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tickFormatter={formatShortDate}
                stroke="#64748b"
                tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
                minTickGap={18}
              />
              <YAxis
                stroke="#64748b"
                tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
                domain={['auto', 'auto']}
              />
              <Tooltip content={<CustomCurveTooltip />} />
              <Legend
                wrapperStyle={{
                  fontSize: '11px',
                  fontFamily: 'JetBrains Mono',
                  paddingTop: '8px',
                }}
              />
              <ReferenceLine
                y={2.0}
                stroke="#10b981"
                strokeDasharray="4 4"
                label={{
                  value: 'Breakout (+2σ)',
                  position: 'insideTopRight',
                  fill: '#10b981',
                  fontSize: 10,
                }}
              />
              <ReferenceLine y={0} stroke="#475569" />
              <Area
                type="monotone"
                dataKey="z_score_social"
                name="Z_social (MAD Z-Score)"
                stroke="#22d3ee"
                strokeWidth={2.5}
                fill="url(#zSocialGrad)"
                dot={false}
                activeDot={{ r: 5, fill: '#22d3ee' }}
              />
              <Line
                type="monotone"
                dataKey="momentum_decay_factor"
                name="M_trend (Decay Curve)"
                stroke="#a855f7"
                strokeWidth={2.2}
                dot={false}
                activeDot={{ r: 4, fill: '#a855f7' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Trailing Signal Summary Footer */}
        {selectedProduct && (
          <div className="grid shrink-0 grid-cols-3 gap-2 border-t border-slate-800 pt-3 font-mono text-xs">
            <div className="rounded-lg bg-obsidian-950/80 p-2.5">
              <span className="block text-[10px] text-slate-400">
                Raw Intent (E_t)
              </span>
              <span className="mt-0.5 block font-bold text-slate-100">
                {formatCompactNumber(
                  selectedProduct.intent_weighted_engagement
                )}
              </span>
            </div>
            <div className="rounded-lg bg-obsidian-950/80 p-2.5">
              <span className="block text-[10px] text-slate-400">
                ΔZ Day-over-Day
              </span>
              <span
                className={`mt-0.5 block font-bold ${
                  selectedProduct.delta_z_social >= 0
                    ? 'text-cyan-400'
                    : 'text-rose-400'
                }`}
              >
                {formatSignedDecimal(selectedProduct.delta_z_social, 2)}
              </span>
            </div>
            <div className="rounded-lg bg-obsidian-950/80 p-2.5">
              <span className="block text-[10px] text-slate-400">
                Decay Exp(-λt)
              </span>
              <span className="mt-0.5 block font-bold text-violet-400">
                {formatDecimal(
                  Math.exp(-0.1 * (selectedProduct.days_since_peak || 0)),
                  3
                )}
              </span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
