# Arbitrage Engine | Smart Demand & Inventory Forecaster

> **Spot trending products before competitors and allocate your capital where it actually counts.**

## The Business Problem

E-commerce operators consistently face a dual-sided working capital problem: tying up cash in dead inventory (overstock) or running out of stock during viral demand spikes (understock). Relying on lagging historical sales data leads to reactive decisions and missed arbitrage windows.

## The Solution

This is a live, full-stack quantitative operations terminal. By scraping real-time supply signals across the US Shopify market and weighting them against social momentum decay, this engine applies the Newsvendor Inventory Model to output definitive **Restock**, **Run Ads**, or **Ignore** signals.

### Dual-Mode UI Architecture

- **The Executive View (Light Mode):** A clean, human-readable dashboard prioritizing SKUs by arbitrage confidence. Built for rapid decision-making, featuring a Profit & ROI Calculator to estimate upfront capital requirements versus projected gross profit.
- **The Operator's Console (Dark Mode):** A dense, quantitative terminal for deep-dive analysis. Displays raw T-14 momentum decay charts, MAD Z-Score visualizers, and the exact Newsvendor critical fractile outputs driving the engine's logic.

### Technical Stack & Pipeline

- **Live Market Ingestion:** Python 3, Pandas, and BeautifulSoup4 bypass brittle HTML scraping by targeting Shopify `/products.json` endpoints to ingest live pricing and catalog data with built-in bundle-exclusion filters.
- **Backend Database:** Google Firebase (Firestore NoSQL) / Firebase Admin SDK.
- **Frontend:** React, Vite, Tailwind CSS, Recharts.
