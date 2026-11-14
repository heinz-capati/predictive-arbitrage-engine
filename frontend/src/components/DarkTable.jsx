import React from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from 'recharts';
import {
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  Terminal,
} from 'lucide-react';
import AlertBanner from './AlertBanner';
import MetricCard from './MetricCard';
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
 * Glassmorphic Tooltip for the Wireframe Glowing Recharts Curve
 */
function QuantCurveTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0]?.payload;

  return (
    <div className="rounded-lg border border-white/15 bg-[#050505]/95 p-3 shadow-2xl backdrop-blur-xl">
      <div className="mb-1.5 flex items-center justify-between gap-4 border-b border-white/10 pb-1.5 font-mono text-xs text-slate-200">
        <span>{label}</span>
        <span className="font-bold text-[#00E5FF]">
          T = {formatDecimal(row?.action_threshold, 3)}
        </span>
      </div>
      <div className="space-y-1 font-mono text-xs">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#00E5FF]">Z_social:</span>
          <span className="font-bold text-white">
            {formatSignedDecimal(row?.z_score_social, 3)}σ
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#B497FF]">M_trend:</span>
          <span className="font-bold text-white">
            {formatSignedDecimal(row?.momentum_decay_factor, 3)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-400">Intent E_t:</span>
          <span className="text-slate-200">
            {formatCompactNumber(row?.intent_weighted_engagement)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-400">Velocity:</span>
          <span className="text-slate-200">
            {formatDecimal(row?.ecomm_velocity, 1)} u/d
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * PHASE 2: DARK MODE - "Under the Hood" (Quant Terminal View)
 * - #050505 true-black canvas with glassmorphic Bento-grid panels (1px white/10 borders)
 * - Electric Cyan (#00E5FF) for data pipelines & Soft Neon Purple (#7A4DE8) for Z-score/decay
 * - High-density flex-row data table (zero cards) with JetBrains Mono precision
 * - Wireframe-thin glowing Recharts curves & zero clipped text
 */
export default function DarkTable({
  products,
  evaluatedProducts,
  selectedProductId,
  onSelectProduct,
  params,
  onChangeParams,
  onResetParams,
  restockCount,
  monitorCount,
  topBreakout,
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
    <div className="space-y-5">
      {/* Top Bento-Grid Quant KPI Strip */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Peak Social Z-Score"
          value={
            topBreakout
              ? `${formatSignedDecimal(topBreakout.z_score_social, 2)}σ`
              : '0.00σ'
          }
          subtitle={topBreakout ? topBreakout.product_name : 'N/A'}
          formula="(log1p(E)-Med14)/(1.4826·MAD14)"
          accent="purple"
          icon={Activity}
        />
        <MetricCard
          title="Peak Decay Momentum"
          value={
            topBreakout
              ? formatSignedDecimal(topBreakout.momentum_decay_factor, 3)
              : '0.000'
          }
          subtitle="Decay λ = 0.10"
          formula="ΔZ · exp(-λt)"
          accent="purple"
          icon={Terminal}
        />
        <MetricCard
          title="Restock Signals"
          value={restockCount}
          unit={`/ ${evaluatedProducts.length} SKUs`}
          subtitle="Threshold > 1.20"
          formula={`Ads Queue: ${monitorCount}`}
          accent="cyan"
          icon={Layers}
        />
        <MetricCard
          title="Critical Fractile"
          value={formatDecimal(params.cu / (params.cu + params.co), 3)}
          unit={`Cu=${params.cu} Co=${params.co}`}
          subtitle={`ω = ${params.omega.toFixed(1)}`}
          formula="Cu / (Cu + Co)"
          accent="cyan"
          icon={Terminal}
        />
      </section>

      {/* Main Bento-Grid Shell: Responsive Stretch Height so nothing is ever clipped */}
      <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-12">
        {/* LEFT PANEL: DENSE FLEX-ROW DATA TABLE (5 Columns) */}
        <section className="flex flex-col rounded-xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl xl:col-span-5 xl:max-h-[680px]">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div>
              <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-100">
                Market Pricing & Sales Velocity
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                High-density SKU feed — click any row to inspect curves
              </p>
            </div>
            <span className="shrink-0 rounded border border-[#00E5FF]/30 bg-[#00E5FF]/10 px-2.5 py-0.5 font-mono text-xs font-semibold text-[#00E5FF]">
              {products.length} ROWS
            </span>
          </div>

          {/* Monospace Flex-Row Table Header */}
          <div className="mt-3 flex items-center gap-2 border-b border-white/10 px-2 py-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-300">
            <div className="w-[40%] shrink-0">SKU / Product</div>
            <div className="w-[16%] text-right">Vel</div>
            <div className="w-[14%] text-right">Spread</div>
            <div className="w-[15%] text-right">Z-Score</div>
            <div className="w-[15%] text-right">Target</div>
          </div>

          {/* Dense Flex-Row Body */}
          <div className="mt-1 flex-1 divide-y divide-white/[0.06] overflow-y-auto pr-1">
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
                  className={`flex w-full items-center gap-2 px-2 py-2.5 text-left transition-colors duration-100 ${
                    isSelected
                      ? 'bg-[#00E5FF]/[0.09] ring-1 ring-inset ring-[#00E5FF]/40'
                      : 'hover:bg-white/[0.04]'
                  }`}
                >
                  {/* SKU + Wrapped Name (no awkward cutoff) */}
                  <div className="w-[40%] shrink-0 pr-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${itemTheme.dotColor}`}
                      />
                      <span className="font-mono text-[11px] font-semibold text-[#00E5FF]">
                        {item.product_id}
                      </span>
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-xs font-medium leading-snug text-slate-100">
                      {item.product_name}
                    </div>
                  </div>

                  {/* Sales Velocity */}
                  <div className="w-[16%] text-right font-mono">
                    <div className="text-xs font-bold text-slate-100">
                      {formatDecimal(item.ecomm_velocity, 1)}
                    </div>
                    <div
                      className={`inline-flex items-center justify-end text-[11px] ${
                        item.velocityDelta >= 0
                          ? 'text-[#00E5FF]'
                          : 'text-rose-400'
                      }`}
                    >
                      {item.velocityDelta >= 0 ? (
                        <ArrowUpRight className="h-3 w-3" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3" />
                      )}
                      {Math.abs(item.velocityDelta).toFixed(1)}%
                    </div>
                  </div>

                  {/* Price Spread */}
                  <div className="w-[14%] text-right font-mono text-xs text-slate-200">
                    {formatPercent(item.price_discrepancy, 1)}
                  </div>

                  {/* Z-Score */}
                  <div className="w-[15%] text-right font-mono text-xs font-semibold text-[#B497FF]">
                    {formatSignedDecimal(item.z_score_social, 2)}σ
                  </div>

                  {/* Action Threshold */}
                  <div className="w-[15%] text-right font-mono">
                    <div className={`text-xs font-bold ${itemTheme.accentText}`}>
                      {formatDecimal(liveEval.actionThreshold, 2)}
                    </div>
                    <div className="text-[10px] font-semibold uppercase text-slate-400">
                      {liveEval.decisionStatus === 'Restock/Capitalize'
                        ? 'RESTOCK'
                        : liveEval.decisionStatus === 'Run Ads/Monitor'
                        ? 'ADS'
                        : 'HOLD'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Cross-Market Profit Spread Footer */}
          <div className="mt-3 shrink-0 rounded-lg border border-white/10 bg-black/50 px-3.5 py-2.5">
            <div className="flex items-center justify-between font-mono text-xs text-slate-200">
              <span className="font-semibold text-[#00E5FF]">
                Cross-Market Profit Spread
              </span>
              <span className="text-[11px] text-slate-400">PIPE: FIRESTORE</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">
              Wide Price Spread (%) + rising <span className="font-mono text-[#B497FF]">Z_social</span> signals an underpriced supply bottleneck.
            </p>
          </div>
        </section>

        {/* CENTER PANEL: ACTION ENGINE (3 Columns) */}
        <section className="xl:col-span-3">
          <AlertBanner
            product={selectedProduct}
            computedDecision={selectedDecision}
            params={params}
            onChangeParams={onChangeParams}
            onResetParams={onResetParams}
          />
        </section>

        {/* RIGHT PANEL: WIREFRAME GLOWING CHARTS (4 Columns) */}
        <section className="flex flex-col justify-between rounded-xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl xl:col-span-4 xl:max-h-[680px]">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
              <div>
                <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-100">
                  Social Momentum & Trend Decay
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  30-day wireframe telemetry (Z_social & M_trend)
                </p>
              </div>
              <span className="rounded border border-[#7A4DE8]/40 bg-[#7A4DE8]/15 px-2.5 py-0.5 font-mono text-xs font-semibold text-[#B497FF]">
                λ = 0.10
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/50 px-3 py-2 font-mono text-[11px] text-slate-300">
              <span>Z = (log1p(E) - Med14) / (1.4826·MAD14)</span>
              <span className="text-[#B497FF]">M = ΔZ · e^(-λt)</span>
            </div>
          </div>

          {/* Wireframe-Thin Glowing Recharts Graph */}
          <div className="my-3 h-[380px] w-full shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 12, right: 12, left: -16, bottom: 0 }}
              >
                <defs>
                  <filter id="cyanGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="2.5" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  <filter id="purpleGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="2.5" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <CartesianGrid
                  strokeDasharray="2 4"
                  stroke="rgba(255,255,255,0.06)"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatShortDate}
                  stroke="#64748b"
                  tick={{ fontSize: 11, fontFamily: 'JetBrains Mono', fill: '#94a3b8' }}
                  minTickGap={18}
                />
                <YAxis
                  stroke="#64748b"
                  tick={{ fontSize: 11, fontFamily: 'JetBrains Mono', fill: '#94a3b8' }}
                  domain={['auto', 'auto']}
                />
                <Tooltip content={<QuantCurveTooltip />} />
                <Legend
                  wrapperStyle={{
                    fontSize: '11px',
                    fontFamily: 'JetBrains Mono',
                    paddingTop: '8px',
                  }}
                />
                <ReferenceLine
                  y={2.0}
                  stroke="#00E5FF"
                  strokeOpacity={0.5}
                  strokeDasharray="3 3"
                  label={{
                    value: '+2σ BREAKOUT',
                    position: 'insideTopRight',
                    fill: '#00E5FF',
                    fontSize: 10,
                    fontFamily: 'JetBrains Mono',
                  }}
                />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.14)" />
                <Line
                  type="monotone"
                  dataKey="z_score_social"
                  name="Z_social (Pipeline)"
                  stroke="#00E5FF"
                  strokeWidth={1.6}
                  dot={false}
                  activeDot={{ r: 4, fill: '#00E5FF' }}
                  filter="url(#cyanGlow)"
                />
                <Line
                  type="monotone"
                  dataKey="momentum_decay_factor"
                  name="M_trend (Decay)"
                  stroke="#7A4DE8"
                  strokeWidth={1.6}
                  dot={false}
                  activeDot={{ r: 4, fill: '#7A4DE8' }}
                  filter="url(#purpleGlow)"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Trailing Monospace Telemetry Footer */}
          {selectedProduct && (
            <div className="grid shrink-0 grid-cols-3 gap-2.5 border-t border-white/10 pt-3 font-mono text-xs">
              <div className="rounded-lg border border-white/10 bg-black/50 p-2.5">
                <span className="block text-[11px] uppercase text-slate-400">
                  Raw Intent
                </span>
                <span className="mt-1 block text-sm font-bold text-[#00E5FF]">
                  {formatCompactNumber(
                    selectedProduct.intent_weighted_engagement
                  )}
                </span>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/50 p-2.5">
                <span className="block text-[11px] uppercase text-slate-400">
                  ΔZ Daily
                </span>
                <span
                  className={`mt-1 block text-sm font-bold ${
                    selectedProduct.delta_z_social >= 0
                      ? 'text-[#00E5FF]'
                      : 'text-rose-400'
                  }`}
                >
                  {formatSignedDecimal(selectedProduct.delta_z_social, 2)}
                </span>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/50 p-2.5">
                <span className="block text-[11px] uppercase text-slate-400">
                  Exp(-λt)
                </span>
                <span className="mt-1 block text-sm font-bold text-[#B497FF]">
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
    </div>
  );
}
