/**
 * Formatting & Decision Rule Helpers for the Arbitrage Engine UI
 */

export const formatDecimal = (value, digits = 2) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '0.00';
  }
  return Number(value).toFixed(digits);
};

export const formatSignedDecimal = (value, digits = 2) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '0.00';
  }
  const num = Number(value);
  return `${num > 0 ? '+' : ''}${num.toFixed(digits)}`;
};

export const formatPercent = (value, digits = 1) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '0.0%';
  }
  return `${Number(value).toFixed(digits)}%`;
};

export const formatCompactNumber = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '0';
  }
  return Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(value));
};

export const formatCurrency = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '$0';
  }
  return Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(value));
};

export const formatShortDate = (dateStr) => {
  if (!dateStr) return '';
  const parts = String(dateStr).split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[1]}/${parts[2]}`;
};

/**
 * Evaluates the Newsvendor Action_Threshold decision rule dynamically:
 * Action_Threshold = (C_u / (C_u + C_o)) * (1 + (omega * M_trend))
 * - > 1.2: "Restock/Capitalize"
 * - 0.8 < x <= 1.2: "Run Ads/Monitor"
 * - <= 0.8: "Ignore"
 */
export const computeNewsvendorDecision = (
  momentumDecayFactor,
  costUnderage = 60,
  costOverage = 40,
  omega = 1.0
) => {
  const cu = Number(costUnderage) || 60;
  const co = Number(costOverage) || 40;
  const w = Number(omega) ?? 1.0;
  const mTrend = Number(momentumDecayFactor) || 0;

  const criticalFractile = cu + co > 0 ? cu / (cu + co) : 0.6;
  const actionThreshold = criticalFractile * (1 + w * mTrend);

  let decisionStatus = 'Ignore';
  if (actionThreshold > 1.2) {
    decisionStatus = 'Restock/Capitalize';
  } else if (actionThreshold > 0.8) {
    decisionStatus = 'Run Ads/Monitor';
  }

  return {
    criticalFractile,
    actionThreshold: Number(actionThreshold.toFixed(4)),
    decisionStatus,
  };
};

export const getStatusTheme = (status) => {
  switch (status) {
    case 'Restock/Capitalize':
      return {
        label: 'Restock / Capitalize',
        headline: 'RESTOCK & CAPTURE MARGIN',
        subheadline:
          'Social demand is outpacing marketplace supply (Action Threshold > 1.20)',
        badgeBg: 'bg-[#00E5FF]/10 text-[#00E5FF] border-[#00E5FF]/40',
        bannerBg:
          'from-[#00E5FF]/[0.07] via-white/[0.03] to-white/[0.02] border-white/10',
        glow: 'shadow-[0_0_40px_-10px_rgba(0,229,255,0.22)]',
        accentText: 'text-[#00E5FF]',
        dotColor: 'bg-[#00E5FF]',
      };
    case 'Run Ads/Monitor':
      return {
        label: 'Run Ads / Monitor',
        headline: 'SCALE PAID CAMPAIGNS',
        subheadline:
          'Buyer momentum is climbing in a profitable testing window (0.80 < T ≤ 1.20)',
        badgeBg: 'bg-[#7A4DE8]/15 text-[#B497FF] border-[#7A4DE8]/45',
        bannerBg:
          'from-[#7A4DE8]/[0.10] via-white/[0.03] to-white/[0.02] border-white/10',
        glow: 'shadow-[0_0_35px_-10px_rgba(122,77,232,0.24)]',
        accentText: 'text-[#B497FF]',
        dotColor: 'bg-[#7A4DE8]',
      };
    default:
      return {
        label: 'Hold / Ignore',
        headline: 'HOLD INVENTORY & PRESERVE CASH',
        subheadline:
          'Trend momentum has cooled below the restock threshold (Threshold ≤ 0.80)',
        badgeBg: 'bg-white/[0.05] text-slate-400 border-white/10',
        bannerBg:
          'from-white/[0.04] via-white/[0.02] to-transparent border-white/10',
        glow: 'shadow-none',
        accentText: 'text-slate-400',
        dotColor: 'bg-slate-500',
      };
  }
};

/**
 * Generates plain-English Executive Insights metadata for 'Light Mode - The Luxury Interior':
 * Palette: Forest Green (#1F5E3B) for Restock/High Confidence,
 * Champagne/Gold (#9B7432 / #FAF6EB) for Emerging/Run Ads opportunities.
 */
export const getPlainEnglishInsight = (product, liveDecision) => {
  const decisionStatus =
    typeof liveDecision === 'string'
      ? liveDecision
      : liveDecision?.decisionStatus || product?.decision_status || 'Ignore';
  const actionThreshold =
    typeof liveDecision === 'object' && liveDecision?.actionThreshold !== undefined
      ? Number(liveDecision.actionThreshold)
      : Number(product?.action_threshold || 0);

  const mTrend = Number(product?.momentum_decay_factor || 0);
  const daysSincePeak = Number(product?.days_since_peak || 0);
  const spreadPct = Math.round(Number(product?.price_discrepancy || 15));

  // Compute 48-hour social surge percentage from trailing history when available
  const history = product?.history30d || [];
  let socialSpikePct = 38;
  if (history.length >= 3) {
    const latestEng = Number(
      history[history.length - 1]?.intent_weighted_engagement || 1
    );
    const prev48hEng = Number(
      history[history.length - 3]?.intent_weighted_engagement || 1
    );
    if (prev48hEng > 0) {
      socialSpikePct = Math.max(
        12,
        Math.round(Math.abs(((latestEng - prev48hEng) / prev48hEng) * 100))
      );
    }
  }

  // 1. Trend Lifecycle Stage based on M_trend (Decay)
  let lifecycleStage = 'Fading';
  let lifecycleBadgeClass = 'bg-slate-100 text-slate-600';
  if (mTrend >= 1.0 && daysSincePeak === 0) {
    lifecycleStage = 'Peak Hype';
    lifecycleBadgeClass = 'bg-[#1F5E3B]/10 text-[#1F5E3B]';
  } else if (mTrend > 0.25 && daysSincePeak <= 2) {
    lifecycleStage = 'Emerging';
    lifecycleBadgeClass = 'bg-[#F5EFE2] text-[#8E6A2C]';
  }

  // 2. Arbitrage Confidence Score based on Newsvendor Action Threshold
  let confidenceScore = 'Low';
  let confidenceBadgeClass = 'bg-slate-100 text-slate-600';
  if (actionThreshold > 1.2) {
    confidenceScore = 'High Confidence';
    confidenceBadgeClass = 'bg-[#1F5E3B]/10 text-[#1F5E3B]';
  } else if (actionThreshold > 0.8) {
    confidenceScore = 'Medium';
    confidenceBadgeClass = 'bg-[#F5EFE2] text-[#8E6A2C]';
  }

  // 3. Pricing variables for the inline Profit & ROI Calculator
  const unitCost = Number(product?.unit_cost) || 12.0;
  const retailPrice =
    Number(product?.retail_price) ||
    Number((unitCost * (1 + Math.max(0.35, spreadPct / 100 + 0.25))).toFixed(2));

  // 4. Plain-English Action & The Opportunity (Luxury Interior tokens)
  if (decisionStatus === 'Restock/Capitalize') {
    return {
      actionLabel: 'RESTOCK',
      actionButtonClass:
        'bg-[#1F5E3B] text-white hover:bg-[#17482D] active:translate-y-[1px] shadow-tactile-btn',
      accentTextClass: 'text-[#1F5E3B]',
      opportunityBgClass: 'bg-[#1F5E3B]/[0.04]',
      opportunityTitleClass: 'text-[#1F5E3B]',
      lifecycleStage,
      lifecycleBadgeClass,
      confidenceScore,
      confidenceBadgeClass,
      unitCost,
      retailPrice,
      justification:
        "Social buzz is climbing fast, but competitors haven't raised their prices yet. This is your window to stock up and capture the margin.",
      marketBlindspot: `Buyer interest jumped ${socialSpikePct}% in the last 48 hours while retail prices across major storefronts haven't budged—leaving a ${spreadPct}% margin spread on the table.`,
    };
  }

  if (decisionStatus === 'Run Ads/Monitor') {
    return {
      actionLabel: 'RUN ADS',
      actionButtonClass:
        'bg-[#B68D40] text-white hover:bg-[#9C7631] active:translate-y-[1px] shadow-tactile-gold',
      accentTextClass: 'text-[#8E6A2C]',
      opportunityBgClass: 'bg-[#FAF6EC]',
      opportunityTitleClass: 'text-[#8E6A2C]',
      lifecycleStage,
      lifecycleBadgeClass,
      confidenceScore,
      confidenceBadgeClass,
      unitCost,
      retailPrice,
      justification:
        "Social buzz is climbing fast, but competitors haven't raised their prices yet. This is your window to stock up and capture the margin.",
      marketBlindspot: `Shopper searches rose ${socialSpikePct}% over the last 48 hours while competitors are still priced at baseline (${spreadPct}% profit spread)—ideal for low-CPA ad testing.`,
    };
  }

  return {
    actionLabel: 'HOLD',
    actionButtonClass:
      'bg-slate-200/90 text-slate-700 hover:bg-slate-300/90 active:translate-y-[1px]',
    accentTextClass: 'text-slate-600',
    opportunityBgClass: 'bg-slate-50',
    opportunityTitleClass: 'text-slate-600',
    lifecycleStage,
    lifecycleBadgeClass,
    confidenceScore,
    confidenceBadgeClass,
    unitCost,
    retailPrice,
    justification:
      'The viral hype is cooling off. Keep your cash liquid and avoid getting stuck with dead inventory.',
    marketBlindspot: `Social mentions have slowed over the last 48 hours and marketplace price spreads have tightened to ${spreadPct}%, leaving little room for short-term margin gains.`,
  };
};
