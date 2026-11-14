import React, { useState } from 'react';
import { DollarSign, ShieldCheck, Eye } from 'lucide-react';
import { formatCurrency, getPlainEnglishInsight } from '../utils/formatters';

/**
 * Individual Executive Card — "The Luxury Interior" aesthetic:
 * - Pure white (#FFFFFF) elevated on #F9F9FB with ultra-soft diffused shadow
 * - Zero harsh borders
 * - Clean status badge in header (no bottom action buttons)
 * - Prominent Projected Profit, Capital Required, Opportunity, and Profit & ROI Calculator
 */
function LuxuryInsightCard({ product }) {
  const [targetUnits, setTargetUnits] = useState(100);

  const insight = getPlainEnglishInsight(product, product.liveDecision);
  const safeUnits = Math.max(0, Number(targetUnits) || 0);
  const estCapitalRequired = safeUnits * insight.unitCost;
  const unitGrossMargin = Math.max(0, insight.retailPrice - insight.unitCost);
  const projectedGrossProfit = safeUnits * unitGrossMargin;

  const badgeColors =
    insight.actionLabel === 'RESTOCK'
      ? 'bg-[#1F5E3B] text-white'
      : insight.actionLabel === 'RUN ADS'
      ? 'bg-[#B68D40] text-white'
      : 'bg-slate-200 text-slate-700';

  const badgeText =
    insight.actionLabel === 'RESTOCK'
      ? 'Restock'
      : insight.actionLabel === 'RUN ADS'
      ? 'Run Ads'
      : 'Hold';

  return (
    <article className="flex flex-col justify-between rounded-3xl bg-white p-7 shadow-luxury transition-shadow duration-200 hover:shadow-luxury-hover">
      <div>
        {/* Top Metadata Row */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-full bg-[#F9F9FB] px-3 py-1 text-xs font-semibold tracking-wide text-slate-600">
            {product.category}
          </span>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${insight.lifecycleBadgeClass}`}
            >
              Stage: {insight.lifecycleStage}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${insight.confidenceBadgeClass}`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {insight.confidenceScore}
            </span>
          </div>
        </div>

        {/* Product Title + Status Pill */}
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <h3 className="text-xl font-extrabold tracking-tight text-slate-900">
            {product.product_name}
          </h3>
          <span
            className={`inline-flex shrink-0 items-center rounded-full px-4 py-1.5 text-sm font-bold tracking-wide ${badgeColors}`}
          >
            {badgeText}
          </span>
        </div>

        <p className="mt-2.5 text-sm leading-relaxed text-slate-600">
          {insight.justification}
        </p>

        {/* Largest Visual Hierarchy: Projected Profit & Capital Required */}
        <div className="mt-5 grid grid-cols-2 gap-4 rounded-2xl bg-[#F9F9FB] p-5">
          <div>
            <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">
              Projected Gross Profit
            </span>
            <span
              className={`mt-1 block text-3xl font-extrabold tracking-tight ${insight.accentTextClass}`}
            >
              {formatCurrency(projectedGrossProfit)}
            </span>
          </div>

          <div>
            <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">
              Est. Capital Required
            </span>
            <span className="mt-1 block text-3xl font-extrabold tracking-tight text-slate-900">
              {formatCurrency(estCapitalRequired)}
            </span>
          </div>
        </div>

        {/* The Opportunity Callout */}
        <div className={`mt-4 rounded-2xl p-4 ${insight.opportunityBgClass}`}>
          <div
            className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${insight.opportunityTitleClass}`}
          >
            <Eye className="h-4 w-4" />
            <span>The Opportunity</span>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-700">
            {insight.marketBlindspot}
          </p>
        </div>

        {/* Profit & ROI Calculator */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#F9F9FB] px-4 py-3.5">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-[#1F5E3B]" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Profit & ROI Calculator
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <span className="text-sm text-slate-600">
              Cost <strong className="text-slate-900">${insight.unitCost.toFixed(2)}</strong> · Retail{' '}
              <strong className="text-slate-900">${insight.retailPrice.toFixed(2)}</strong>
            </span>

            <div className="flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 shadow-sm">
              <label
                htmlFor={`units-${product.product_id}`}
                className="text-xs font-bold uppercase tracking-wide text-slate-500"
              >
                Target Units
              </label>
              <input
                id={`units-${product.product_id}`}
                type="number"
                min="0"
                step="10"
                value={targetUnits}
                onChange={(e) => setTargetUnits(e.target.value)}
                className="w-16 bg-transparent text-right text-base font-extrabold text-slate-900 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

/**
 * PHASE 1: LIGHT MODE - "The Luxury Interior" (Executive View)
 * Clean ceramic off-white (#F9F9FB) canvas with elevated white cards.
 */
export default function LightGrid({
  evaluatedProducts,
  selectedCategory,
  restockCount,
  monitorCount,
}) {
  return (
    <section className="mx-auto max-w-6xl py-2">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
            Inventory & Demand Recommendations
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Showing {evaluatedProducts.length} tracked products in{' '}
            <span className="font-semibold text-slate-900">
              {selectedCategory}
            </span>{' '}
            — ranked by profit opportunity and buyer momentum.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-xs font-bold">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1F5E3B]/10 px-3.5 py-1.5 text-[#1F5E3B]">
            Restock: {restockCount}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F5EFE2] px-3.5 py-1.5 text-[#8E6A2C]">
            Run Ads: {monitorCount}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-slate-600 shadow-sm">
            Hold: {evaluatedProducts.length - restockCount - monitorCount}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-7 lg:grid-cols-2">
        {evaluatedProducts.map((product) => (
          <LuxuryInsightCard key={product.product_id} product={product} />
        ))}
      </div>
    </section>
  );
}
