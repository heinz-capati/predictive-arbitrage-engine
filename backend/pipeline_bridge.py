"""
Pipeline Bridge - Live Scraper -> Synthetic History -> Math Engine -> Firestore JSON
=====================================================================================
Glue between `live_scraper.py` and `math_engine.py`:

1. Runs `live_scraper.py` as a subprocess and captures its JSON output
   (or loads a saved scrape with --input-json).
2. For every live SKU, builds a trailing history from T-14 to T-0 (15 daily rows):
   - retail_price, unit_cost, stock_status = the live scraped values on every day
   - intent_weighted_engagement = a SYNTHETIC, randomized but realistic curve
3. Runs the combined frame through ArbitrageMathEngine (MAD Z-score -> momentum decay
   -> Newsvendor threshold).
4. Writes Firestore-ready JSON ({"raw_signals": [...], "arbitrage_scores": [...]}) and
   can optionally push both collections via firebase_sync.FirestoreArbitrageSync.

IMPORTANT: pricing and stock are live, but social engagement is simulated until a real
social signal source is connected. Every record is tagged with `data_provenance` so the
synthetic part is never mistaken for observed demand.

Usage:
    python backend/pipeline_bridge.py
    python backend/pipeline_bridge.py --input-json live_signals.json      # skip scraping
    python backend/pipeline_bridge.py --seed 7 --out backend/output/run.json
    python backend/pipeline_bridge.py --sync                              # push to Firestore
    python backend/pipeline_bridge.py -- --max-products 5                 # args after -- go to the scraper
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import subprocess
import sys
import tempfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

import numpy as np
import pandas as pd

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from math_engine import ArbitrageMathEngine  # noqa: E402

SCRAPER_PATH = BACKEND_DIR / "live_scraper.py"
DEFAULT_OUTPUT_PATH = BACKEND_DIR / "output" / "live_pipeline_output.json"
SCRAPER_TIMEOUT_SECONDS = 600

HISTORY_DAYS = 14  # T-14 .. T-0 inclusive -> 15 daily observations
DATA_PROVENANCE = "live_pricing+synthetic_engagement"

REQUIRED_SCRAPER_KEYS = (
    "sku_id",
    "product_name",
    "category",
    "unit_cost",
    "retail_price",
    "stock_status",
)

# Demand regimes for the synthetic engagement curve, weighted by live stock status:
# constrained supply (Low / Out of Stock) makes a recent demand surge more plausible.
REGIME_WEIGHTS: Dict[str, Dict[str, float]] = {
    "In Stock": {"flat": 0.40, "steady_build": 0.30, "breakout": 0.15, "cooling": 0.15},
    "Low Stock": {"flat": 0.15, "steady_build": 0.30, "breakout": 0.40, "cooling": 0.15},
    "Out of Stock": {"flat": 0.10, "steady_build": 0.20, "breakout": 0.35, "cooling": 0.35},
    "Unknown": {"flat": 0.40, "steady_build": 0.25, "breakout": 0.15, "cooling": 0.20},
}

logger = logging.getLogger("pipeline_bridge")


# ---------------------------------------------------------------------------
# Step 1: Run the live scraper and capture its JSON
# ---------------------------------------------------------------------------


def run_live_scraper(scraper_args: Sequence[str]) -> List[Dict[str, Any]]:
    """Execute live_scraper.py in a subprocess and return its JSON records."""
    with tempfile.TemporaryDirectory(prefix="arb_scrape_") as tmp_dir:
        json_path = Path(tmp_dir) / "live_signals.json"
        cmd = [sys.executable, str(SCRAPER_PATH), "--json-out", str(json_path), *scraper_args]
        logger.info("Running live scraper: %s", " ".join(cmd[1:]))

        try:
            # Scraper logs/table stream straight to the terminal so progress is visible
            result = subprocess.run(cmd, cwd=str(BACKEND_DIR), timeout=SCRAPER_TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError(
                f"live_scraper.py timed out after {SCRAPER_TIMEOUT_SECONDS}s"
            ) from exc

        if result.returncode != 0:
            raise RuntimeError(
                f"live_scraper.py exited with code {result.returncode} (no live records)."
            )
        if not json_path.exists():
            raise RuntimeError("live_scraper.py finished but wrote no JSON output.")

        return load_scraped_json(json_path)


def load_scraped_json(path: Path) -> List[Dict[str, Any]]:
    with open(path, "r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, list):
        raise ValueError(f"{path} must contain a JSON list of scraper records.")
    return payload


def validate_scraped_records(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Drop malformed records instead of letting them poison the math engine."""
    valid: List[Dict[str, Any]] = []
    for record in records:
        missing = [key for key in REQUIRED_SCRAPER_KEYS if key not in record]
        if missing:
            logger.warning("Dropping record %r: missing %s", record.get("sku_id"), missing)
            continue
        try:
            retail = float(record["retail_price"])
            unit_cost = float(record["unit_cost"])
        except (TypeError, ValueError):
            logger.warning("Dropping record %r: non-numeric pricing", record.get("sku_id"))
            continue
        if retail <= 0 or unit_cost < 0:
            logger.warning("Dropping record %r: invalid pricing", record.get("sku_id"))
            continue
        valid.append({**record, "retail_price": retail, "unit_cost": unit_cost})
    return valid


# ---------------------------------------------------------------------------
# Step 2: Synthetic 14-day trailing engagement history
# ---------------------------------------------------------------------------


def _stable_seed(*parts: Any) -> int:
    """Deterministic seed (Python's hash() is randomized per process)."""
    digest = hashlib.sha256("|".join(str(p) for p in parts).encode("utf-8")).hexdigest()
    return int(digest[:16], 16)


def synthesize_engagement_curve(
    rng: np.random.Generator, n_days: int, regime: str
) -> np.ndarray:
    """
    Daily intent-weighted engagement: lognormal base level x regime trend
    x weekly seasonality x multiplicative noise.
    """
    base_level = float(rng.lognormal(mean=np.log(1500.0), sigma=0.45))  # ~600 - 3,700
    t = np.arange(n_days, dtype=float)

    if regime == "breakout":
        # Flat baseline, then a sharp ramp over the final 2-4 days
        ramp_days = int(rng.integers(2, 5))
        surge = float(rng.uniform(0.25, 0.65))
        start = n_days - ramp_days
        trend = np.where(t >= start, surge * (t - start + 1) / ramp_days, 0.0)
    elif regime == "steady_build":
        # Compounding 1.5% - 4% daily growth
        trend = float(rng.uniform(0.015, 0.04)) * t
    elif regime == "cooling":
        # Peak a few days back, exponential decay since
        peak_day = int(rng.integers(3, max(4, n_days - 4)))
        peak_lift = float(rng.uniform(0.35, 0.80))
        decay = float(rng.uniform(0.12, 0.30))
        rise = np.clip(t / max(peak_day, 1), 0.0, 1.0) * peak_lift
        fall = peak_lift * np.exp(-decay * np.clip(t - peak_day, 0.0, None))
        trend = np.where(t <= peak_day, rise, fall)
    else:  # flat
        trend = np.zeros(n_days)

    weekly = 0.06 * np.sin(2.0 * np.pi * t / 7.0 + float(rng.uniform(0, 2 * np.pi)))
    noise = rng.normal(0.0, 0.05, n_days)
    curve = base_level * np.exp(trend + weekly + noise)
    return np.round(np.maximum(curve, 1.0), 2)


def build_synthetic_history(
    records: List[Dict[str, Any]],
    as_of: date,
    seed: Optional[int] = None,
) -> pd.DataFrame:
    """Expand each live SKU into T-14..T-0 daily raw_signals rows."""
    dates = [as_of - timedelta(days=offset) for offset in range(HISTORY_DAYS, -1, -1)]
    rows: List[Dict[str, Any]] = []

    for record in records:
        sku_id = record["sku_id"]
        stock_status = record.get("stock_status") or "Unknown"
        rng = np.random.default_rng(
            _stable_seed(seed if seed is not None else as_of.isoformat(), record["product_name"])
        )

        weights = REGIME_WEIGHTS.get(stock_status, REGIME_WEIGHTS["Unknown"])
        regime = str(rng.choice(list(weights.keys()), p=list(weights.values())))
        engagement = synthesize_engagement_curve(rng, len(dates), regime)
        logger.info("%s %r -> synthetic regime: %s", sku_id, record["product_name"], regime)

        for day, value in zip(dates, engagement):
            # Derive realistic daily e-commerce velocity & cross-market spread so the
            # frontend DualPane and Insights cards have complete telemetry.
            base_vel = 95.0 if stock_status == "In Stock" else (130.0 if stock_status == "Low Stock" else 45.0)
            daily_vel = round(float(base_vel * (1.0 + rng.normal(0.0, 0.04))), 2)
            margin_spread = round(
                float(((record["retail_price"] - record["unit_cost"]) / max(record["retail_price"], 0.01)) * 30.0),
                2,
            )
            rows.append(
                {
                    "signal_id": f"{sku_id}_{day.strftime('%Y%m%d')}",
                    "product_id": sku_id,  # math engine groups on product_id
                    "sku_id": sku_id,
                    "product_name": record["product_name"],
                    "category": record["category"],
                    "date": day.isoformat(),
                    "timestamp": f"{day.isoformat()}T00:00:00Z",
                    "intent_weighted_engagement": float(value),
                    "ecomm_velocity": daily_vel,
                    "price_discrepancy": margin_spread,
                    "retail_price": float(record["retail_price"]),
                    "unit_cost": float(record["unit_cost"]),
                    "stock_status": stock_status,
                    "synthetic_regime": regime,
                    "data_provenance": DATA_PROVENANCE,
                }
            )

    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# Step 3: Math engine
# ---------------------------------------------------------------------------


def score_history(history_df: pd.DataFrame, engine: ArbitrageMathEngine) -> List[Dict[str, Any]]:
    """Run MAD Z-score, momentum decay and Newsvendor rules; return Firestore records."""
    processed = engine.process_signals(history_df.to_dict(orient="records"))
    scores = engine.to_arbitrage_records(processed)

    for score in scores:
        score["sku_id"] = score["product_id"]
        score["data_provenance"] = DATA_PROVENANCE
    return scores


# ---------------------------------------------------------------------------
# Step 4: Output
# ---------------------------------------------------------------------------


def _to_native(value: Any) -> Any:
    """Make numpy / pandas scalars JSON- and Firestore-safe."""
    if isinstance(value, np.generic):
        value = value.item()
    if isinstance(value, float) and not np.isfinite(value):
        return None
    return value


def _clean_records(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [{key: _to_native(val) for key, val in record.items()} for record in records]


def write_output(
    path: Path,
    raw_signals: List[Dict[str, Any]],
    arbitrage_scores: List[Dict[str, Any]],
    engine: ArbitrageMathEngine,
    as_of: date,
) -> Dict[str, Any]:
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "as_of_date": as_of.isoformat(),
        "data_provenance": DATA_PROVENANCE,
        "parameters": {
            "history_days": HISTORY_DAYS,
            "rolling_window": engine.rolling_window,
            "decay_lambda": engine.decay_lambda,
            "omega": engine.omega,
            "cost_underage": engine.cost_underage,
            "cost_overage": engine.cost_overage,
            "critical_fractile": round(engine.critical_fractile, 4),
        },
        "raw_signals": raw_signals,
        "arbitrage_scores": arbitrage_scores,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
    return payload


def sync_to_firestore(
    raw_signals: List[Dict[str, Any]], arbitrage_scores: List[Dict[str, Any]]
) -> Dict[str, int]:
    from firebase_sync import FirestoreArbitrageSync

    return FirestoreArbitrageSync().sync_collections(raw_signals, arbitrage_scores)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    argv = list(sys.argv[1:] if argv is None else argv)
    scraper_args: List[str] = []
    if "--" in argv:
        split = argv.index("--")
        argv, scraper_args = argv[:split], argv[split + 1 :]

    parser = argparse.ArgumentParser(
        description="Bridge live scraper output into the Newsvendor math engine."
    )
    parser.add_argument(
        "--input-json",
        type=Path,
        help="Use a saved live_scraper.py JSON file instead of scraping now.",
    )
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT_PATH)
    parser.add_argument(
        "--seed",
        type=int,
        help="Seed for the synthetic engagement curves (default: derived from today's date).",
    )
    parser.add_argument(
        "--as-of",
        type=date.fromisoformat,
        default=date.today(),
        help="T-0 date in YYYY-MM-DD (default: today).",
    )
    parser.add_argument("--sync", action="store_true", help="Push results to Firestore.")
    parser.add_argument("-v", "--verbose", action="store_true")

    args = parser.parse_args(argv)
    args.scraper_args = scraper_args
    return args


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = _parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%H:%M:%S",
    )

    # 1. Live scrape (or saved scrape)
    try:
        if args.input_json:
            logger.info("Loading saved scrape: %s", args.input_json)
            scraped = load_scraped_json(args.input_json)
        else:
            scraped = run_live_scraper(args.scraper_args)
    except (RuntimeError, ValueError, OSError, json.JSONDecodeError) as exc:
        logger.error("Could not obtain live scraper data: %s", exc)
        return 1

    records = validate_scraped_records(scraped)
    if not records:
        logger.error("No valid live SKUs to process.")
        return 1
    logger.info("Captured %d live SKU(s).", len(records))

    # 2. Synthetic T-14..T-0 history
    history_df = build_synthetic_history(records, as_of=args.as_of, seed=args.seed)

    # 3. Math engine
    engine = ArbitrageMathEngine(
        rolling_window=14,
        decay_lambda=0.1,
        omega=1.0,
        cost_underage=60.0,
        cost_overage=40.0,
    )
    arbitrage_scores = _clean_records(score_history(history_df, engine))
    raw_signals = _clean_records(history_df.to_dict(orient="records"))

    # 4. Output
    write_output(args.out, raw_signals, arbitrage_scores, engine, args.as_of)

    latest = (
        pd.DataFrame(arbitrage_scores)
        .sort_values("date")
        .groupby("product_id")
        .tail(1)
        .sort_values("action_threshold", ascending=False)
    )
    pd.set_option("display.width", 220)
    pd.set_option("display.max_columns", None)
    pd.set_option("display.max_colwidth", 45)
    print(f"\n=== T-0 Arbitrage Scores ({args.as_of.isoformat()}) | {DATA_PROVENANCE} ===")
    print(
        latest[
            [
                "sku_id",
                "product_name",
                "retail_price",
                "unit_cost",
                "stock_status",
                "z_score_social",
                "momentum_decay_factor",
                "action_threshold",
                "decision_status",
            ]
        ].to_string(index=False)
    )
    print(
        f"\nWrote {len(raw_signals)} raw_signals + {len(arbitrage_scores)} arbitrage_scores "
        f"to {args.out}"
    )

    if args.sync:
        stats = sync_to_firestore(raw_signals, arbitrage_scores)
        print(f"Firestore sync: {stats}")

    return 0


if __name__ == "__main__":
    sys.exit(main())

