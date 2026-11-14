import React, { useState, useEffect } from 'react';
import {
  Database,
  Cpu,
  AlertTriangle,
  Code2,
  Filter,
  Sun,
  Terminal,
} from 'lucide-react';
import { useArbitrageData } from './hooks/useArbitrageData';
import LightGrid from './components/LightGrid';
import DarkTable from './components/DarkTable';
import { computeNewsvendorDecision } from './utils/formatters';

const DEFAULT_NEWSVENDOR_PARAMS = {
  cu: 60,
  co: 40,
  omega: 1.0,
};

const CATEGORY_OPTIONS = [
  'All Categories',
  'Pet Supplies',
  'Athletic Gear',
  'Health & Wellness',
];

export default function App() {
  const {
    latestProducts,
    schemaDefinition,
    dataSource,
    loading,
    error,
  } = useArbitrageData();

  const [selectedProductId, setSelectedProductId] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [params, setParams] = useState(DEFAULT_NEWSVENDOR_PARAMS);
  const [showSchemaModal, setShowSchemaModal] = useState(false);
  // Controls split-personality UI: false -> Light Mode ("The Luxury Interior") | true -> Dark Mode ("Under the Hood")
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Synchronize isDarkMode strictly with the DOM's `dark` class on <html>
  useEffect(() => {
    const rootEl = document.documentElement;
    if (isDarkMode) {
      rootEl.classList.add('dark');
    } else {
      rootEl.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Filter main Firestore product array by selectedCategory
  const filteredProducts =
    selectedCategory === 'All Categories'
      ? latestProducts
      : latestProducts.filter((p) => p.category === selectedCategory);

  // Keep selectedProductId valid within the currently filtered category
  useEffect(() => {
    if (filteredProducts.length > 0) {
      const existsInFilter = filteredProducts.some(
        (p) => p.product_id === selectedProductId
      );
      if (!existsInFilter) {
        setSelectedProductId(filteredProducts[0].product_id);
      }
    }
  }, [filteredProducts, selectedProductId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F9F9FB] text-slate-800 dark:bg-[#050505] dark:text-slate-200">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1F5E3B] border-t-transparent dark:border-[#00E5FF] dark:border-t-transparent" />
          <p className="font-mono text-xs uppercase tracking-widest text-slate-500 dark:text-slate-400">
            Synchronizing Arbitrage Math Engine & Firestore Telemetry...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F9F9FB] p-6 text-slate-800 dark:bg-[#050505] dark:text-slate-200">
        <div className="max-w-md rounded-2xl bg-white p-6 shadow-luxury dark:border dark:border-rose-500/40 dark:bg-rose-950/20">
          <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
            <AlertTriangle className="h-5 w-5" />
            <h1 className="font-mono text-sm font-bold uppercase">
              Telemetry Ingestion Error
            </h1>
          </div>
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{error}</p>
        </div>
      </div>
    );
  }

  // Evaluate filtered products based on live Newsvendor parameters
  const evaluatedProducts = filteredProducts.map((p) => ({
    ...p,
    liveDecision: computeNewsvendorDecision(
      p.momentum_decay_factor,
      params.cu,
      params.co,
      params.omega
    ),
  }));

  const restockCount = evaluatedProducts.filter(
    (p) => p.liveDecision.decisionStatus === 'Restock/Capitalize'
  ).length;
  const monitorCount = evaluatedProducts.filter(
    (p) => p.liveDecision.decisionStatus === 'Run Ads/Monitor'
  ).length;

  const topBreakout =
    evaluatedProducts.length > 0 ? evaluatedProducts[0] : null;

  return (
    <div className="min-h-screen bg-[#F9F9FB] text-slate-900 dark:bg-[#050505] dark:text-slate-100">
      {/* Top Command Bar */}
      <header className="sticky top-0 z-30 bg-white/85 shadow-[0_1px_0_rgba(15,23,42,0.05)] backdrop-blur-xl dark:border-b dark:border-white/10 dark:bg-[#050505]/85 dark:shadow-none">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-6 py-3.5">
          {/* Brand Title & Subtitle */}
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1F5E3B] text-white shadow-sm dark:border dark:border-[#00E5FF]/30 dark:bg-[#00E5FF]/10 dark:text-[#00E5FF]">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white">
                Arbitrage Engine | Smart Demand & Inventory Forecaster
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Spot trending products before competitors and allocate your capital where it actually counts.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Category Router Dropdown */}
            <div className="relative inline-flex items-center">
              <Filter className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-slate-400" />
              <select
                aria-label="Filter by Category"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="cursor-pointer rounded-xl bg-[#F2F3F7] py-2 pl-8 pr-8 text-xs font-bold text-slate-800 transition hover:bg-slate-200/70 focus:outline-none dark:border dark:border-white/10 dark:bg-white/[0.04] dark:font-mono dark:text-slate-200 dark:hover:border-white/20"
              >
                {CATEGORY_OPTIONS.map((category) => (
                  <option
                    key={category}
                    value={category}
                    className="bg-white text-slate-900 dark:bg-[#0A0A0D] dark:text-slate-100"
                  >
                    {category}
                  </option>
                ))}
              </select>
            </div>

            {/* PHASE 3: Heavy Tactile Toggle Switch (Executive Insights <-> Quant Terminal) */}
            <button
              type="button"
              role="switch"
              aria-checked={isDarkMode}
              aria-label="Toggle Executive Insights and Quant Terminal Mode"
              onClick={() => setIsDarkMode((prev) => !prev)}
              className={`group relative inline-flex h-10 w-[224px] cursor-pointer items-center rounded-xl p-1 shadow-inner transition-colors duration-150 focus:outline-none ${
                isDarkMode
                  ? 'border border-white/15 bg-black/80'
                  : 'border border-slate-200/80 bg-[#ECEEF3]'
              }`}
            >
              {/* Sliding Tactile Thumb */}
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute left-1 top-1 h-8 w-[108px] rounded-lg transition-transform duration-150 ${
                  isDarkMode
                    ? 'translate-x-[106px] border border-[#00E5FF]/40 bg-white/[0.09] shadow-[0_2px_12px_rgba(0,229,255,0.22)]'
                    : 'translate-x-0 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.12)]'
                }`}
              />

              {/* Left Label: Executive Light Mode */}
              <span
                className={`relative z-10 flex w-1/2 items-center justify-center gap-1.5 text-xs font-bold tracking-tight transition-colors ${
                  !isDarkMode ? 'text-[#1F5E3B]' : 'text-slate-500'
                }`}
              >
                <Sun className="h-3.5 w-3.5" />
                <span>Insights</span>
              </span>

              {/* Right Label: Quant Terminal Dark Mode */}
              <span
                className={`relative z-10 flex w-1/2 items-center justify-center gap-1.5 font-mono text-xs font-bold tracking-tight transition-colors ${
                  isDarkMode ? 'text-[#00E5FF]' : 'text-slate-500'
                }`}
              >
                <Terminal className="h-3.5 w-3.5" />
                <span>Metrics</span>
              </span>
            </button>

            {isDarkMode && (
              <>
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-[11px] text-slate-300 backdrop-blur-md">
                  <Database className="h-3.5 w-3.5 text-[#00E5FF]" />
                  <span>{dataSource}</span>
                </div>

                <button
                  type="button"
                  onClick={() => setShowSchemaModal((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-[11px] font-medium text-slate-200 transition hover:border-[#00E5FF]/40 hover:text-white"
                >
                  <Code2 className="h-3.5 w-3.5 text-[#00E5FF]" />
                  {showSchemaModal ? 'Hide Schema' : 'Firestore Schema'}
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Workspace Container */}
      <main className="mx-auto max-w-[1600px] space-y-6 px-6 py-7">
        {/* Optional Collapsible Firestore Schema Inspector (Dark Mode Only) */}
        {isDarkMode && showSchemaModal && schemaDefinition && (
          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-[#00E5FF]">
                  Firebase Firestore Provisioned Collections Schema
                </h2>
                <p className="text-xs text-slate-400">
                  Collections: `raw_signals` (unstructured social + e-comm) and `arbitrage_scores` (daily computed Newsvendor outputs)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSchemaModal(false)}
                className="font-mono text-xs text-slate-400 hover:text-white"
              >
                [Close]
              </button>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              {Object.entries(schemaDefinition.collections || {}).map(
                ([colName, colMeta]) => (
                  <div
                    key={colName}
                    className="rounded-lg border border-white/10 bg-black/60 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-bold text-[#00E5FF]">
                        /{colName}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">
                        Doc ID: {colMeta.document_id_pattern}
                      </span>
                    </div>
                    <pre className="mt-3 overflow-x-auto font-mono text-[11px] leading-relaxed text-slate-300">
                      {JSON.stringify(colMeta.fields, null, 2)}
                    </pre>
                  </div>
                )
              )}
            </div>
          </section>
        )}

        {/* Strict Conditional Rendering: LightGrid ("The Luxury Interior") vs. DarkTable ("Under the Hood") */}
        {isDarkMode ? (
          <DarkTable
            products={filteredProducts}
            evaluatedProducts={evaluatedProducts}
            selectedProductId={selectedProductId}
            onSelectProduct={setSelectedProductId}
            params={params}
            onChangeParams={setParams}
            onResetParams={() => setParams(DEFAULT_NEWSVENDOR_PARAMS)}
            restockCount={restockCount}
            monitorCount={monitorCount}
            topBreakout={topBreakout}
          />
        ) : (
          <LightGrid
            evaluatedProducts={evaluatedProducts}
            selectedCategory={selectedCategory}
            restockCount={restockCount}
            monitorCount={monitorCount}
          />
        )}
      </main>
    </div>
  );
}
