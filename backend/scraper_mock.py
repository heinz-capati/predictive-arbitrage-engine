"""
Mock Social & E-Commerce Signal Generator for Free-Tier Testing
Simulates 44 days of raw signals across 13 SKUs spanning 3 core categories:
- Pet Supplies (5 SKUs)
- Athletic Gear (4 SKUs)
- Health & Wellness (4 SKUs)

Exhibits distinct market regimes for testing Newsvendor thresholds & lifecycle stages:
1. Viral Breakout (Peak Hype -> Restock/Capitalize: Action_Threshold > 1.2)
2. Sustained Build (Peak Hype / Emerging -> Restock/Capitalize: Action_Threshold > 1.2)
3. Run Ads / Monitor (Emerging -> Run Ads/Monitor: 0.8 < Action_Threshold <= 1.2)
4. Post-Peak Decay (Fading -> Ignore/Hold: Action_Threshold <= 0.8)
"""

from datetime import datetime, timedelta
from typing import List, Dict, Any
import numpy as np


PRODUCT_CATALOG: List[Dict[str, Any]] = [
    # --- PET SUPPLIES (5 SKUs) ---
    {
        "product_id": "SKU-PET-001",
        "product_name": "Self-Cleaning Ultrasonic Fountain",
        "category": "Pet Supplies",
        "base_engagement": 1850.0,
        "base_velocity": 96.0,
        "base_discrepancy": 19.5,
        "unit_cost": 18.50,
        "retail_price": 54.00,
        "regime": "viral_breakout",
    },
    {
        "product_id": "SKU-PET-002",
        "product_name": "Cooling Gel Mat Pads",
        "category": "Pet Supplies",
        "base_engagement": 1420.0,
        "base_velocity": 82.0,
        "base_discrepancy": 14.8,
        "unit_cost": 9.20,
        "retail_price": 29.00,
        "regime": "run_ads_monitor",
    },
    {
        "product_id": "SKU-PET-003",
        "product_name": "Chew Knot Ropes",
        "category": "Pet Supplies",
        "base_engagement": 980.0,
        "base_velocity": 115.0,
        "base_discrepancy": 8.4,
        "unit_cost": 3.40,
        "retail_price": 12.50,
        "regime": "post_peak_decay",
    },
    {
        "product_id": "SKU-PET-004",
        "product_name": "Sounding Plush Toys",
        "category": "Pet Supplies",
        "base_engagement": 1260.0,
        "base_velocity": 74.0,
        "base_discrepancy": 13.2,
        "unit_cost": 4.80,
        "retail_price": 16.90,
        "regime": "emerging_steady",
    },
    {
        "product_id": "SKU-PET-005",
        "product_name": "Fish Oil Supplements",
        "category": "Pet Supplies",
        "base_engagement": 1640.0,
        "base_velocity": 108.0,
        "base_discrepancy": 21.0,
        "unit_cost": 11.00,
        "retail_price": 34.50,
        "regime": "sustained_build",
    },

    # --- ATHLETIC GEAR (4 SKUs) ---
    {
        "product_id": "SKU-ATH-001",
        "product_name": "TPE Resistance Bands with Handles",
        "category": "Athletic Gear",
        "base_engagement": 2100.0,
        "base_velocity": 132.0,
        "base_discrepancy": 22.4,
        "unit_cost": 8.75,
        "retail_price": 28.00,
        "regime": "viral_breakout",
    },
    {
        "product_id": "SKU-ATH-002",
        "product_name": "Compression Tights",
        "category": "Athletic Gear",
        "base_engagement": 1580.0,
        "base_velocity": 89.0,
        "base_discrepancy": 15.6,
        "unit_cost": 14.20,
        "retail_price": 42.00,
        "regime": "run_ads_monitor",
    },
    {
        "product_id": "SKU-ATH-003",
        "product_name": "Thermal Honeycomb Knee Pads",
        "category": "Athletic Gear",
        "base_engagement": 1790.0,
        "base_velocity": 104.0,
        "base_discrepancy": 20.1,
        "unit_cost": 7.60,
        "retail_price": 24.50,
        "regime": "sustained_build",
    },
    {
        "product_id": "SKU-ATH-004",
        "product_name": "Size 7 Indoor Basketball",
        "category": "Athletic Gear",
        "base_engagement": 1310.0,
        "base_velocity": 68.0,
        "base_discrepancy": 9.1,
        "unit_cost": 12.80,
        "retail_price": 32.00,
        "regime": "post_peak_decay",
    },

    # --- HEALTH & WELLNESS (4 SKUs) ---
    {
        "product_id": "SKU-HLTH-001",
        "product_name": "Magnesium Glycinate Gummies",
        "category": "Health & Wellness",
        "base_engagement": 2450.0,
        "base_velocity": 145.0,
        "base_discrepancy": 24.8,
        "unit_cost": 10.50,
        "retail_price": 36.00,
        "regime": "viral_breakout",
    },
    {
        "product_id": "SKU-HLTH-002",
        "product_name": "Ashwagandha Root Extract",
        "category": "Health & Wellness",
        "base_engagement": 1680.0,
        "base_velocity": 94.0,
        "base_discrepancy": 16.2,
        "unit_cost": 9.40,
        "retail_price": 29.50,
        "regime": "run_ads_monitor",
    },
    {
        "product_id": "SKU-HLTH-003",
        "product_name": "Post-Workout Recovery Powder",
        "category": "Health & Wellness",
        "base_engagement": 1920.0,
        "base_velocity": 112.0,
        "base_discrepancy": 19.9,
        "unit_cost": 16.00,
        "retail_price": 48.00,
        "regime": "sustained_build",
    },
    {
        "product_id": "SKU-HLTH-004",
        "product_name": "Zinc Picolinate",
        "category": "Health & Wellness",
        "base_engagement": 1120.0,
        "base_velocity": 76.0,
        "base_discrepancy": 7.8,
        "unit_cost": 6.20,
        "retail_price": 19.00,
        "regime": "post_peak_decay",
    },
]


def generate_mock_raw_signals(days: int = 44, seed: int = 42) -> List[Dict[str, Any]]:
    """
    Generate deterministic timestamped `raw_signals` entries covering `days`
    to warm up the 14-day rolling median/MAD window and produce a rich 30-day
    trailing visualization window across all 13 SKUs.
    """
    rng = np.random.default_rng(seed)
    end_date = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    start_date = end_date - timedelta(days=days - 1)

    signals: List[Dict[str, Any]] = []

    for product in PRODUCT_CATALOG:
        pid = product["product_id"]
        pname = product["product_name"]
        cat = product["category"]
        base_eng = product["base_engagement"]
        base_vel = product["base_velocity"]
        base_disc = product["base_discrepancy"]
        unit_cost = product["unit_cost"]
        retail_price = product["retail_price"]
        regime = product["regime"]

        for day_idx in range(days):
            current_date = start_date + timedelta(days=day_idx)
            noise = rng.normal(0.0, 0.055)

            # Default baseline
            engagement = base_eng * np.exp(noise)
            velocity = base_vel * (1.0 + rng.normal(0.0, 0.04))
            discrepancy = base_disc + rng.normal(0.0, 0.7)

            if regime == "viral_breakout":
                # Sharp TikTok/Reels viral acceleration in the final 48-72 hours
                if day_idx == days - 3:
                    engagement = base_eng * 1.12
                elif day_idx == days - 2:
                    engagement = base_eng * 1.24
                elif day_idx == days - 1:
                    engagement = base_eng * 1.54
                    velocity = base_vel * 1.18  # E-comm lagging behind social spike
                    discrepancy = base_disc + 9.5

            elif regime == "sustained_build":
                if day_idx >= days - 6:
                    step = day_idx - (days - 6)
                    engagement = base_eng * (1.045 ** step) * np.exp(noise * 0.22)
                    if day_idx == days - 1:
                        engagement = base_eng * 1.39
                        velocity = base_vel * 1.28
                        discrepancy = base_disc + 6.2

            elif regime == "run_ads_monitor":
                # Moderate positive momentum (0.8 < Action_Threshold <= 1.2)
                if day_idx >= days - 14 and day_idx < days - 2:
                    engagement = base_eng * (1.0 + 0.04 * np.sin(day_idx))
                elif day_idx == days - 2:
                    engagement = base_eng * 1.09
                elif day_idx == days - 1:
                    engagement = base_eng * 1.132
                    velocity = base_vel * 1.09
                    discrepancy = base_disc + 3.4

            elif regime == "emerging_steady":
                if day_idx >= days - 14 and day_idx < days - 2:
                    engagement = base_eng * (1.0 + 0.04 * np.cos(day_idx))
                elif day_idx == days - 2:
                    engagement = base_eng * 1.07
                elif day_idx == days - 1:
                    engagement = base_eng * 1.135
                    velocity = base_vel * 1.07
                    discrepancy = base_disc + 2.8

            elif regime == "post_peak_decay":
                # Peaked 9 days ago, now decaying (Action_Threshold < 0.8)
                peak_day = days - 10
                if day_idx == peak_day:
                    engagement = base_eng * 1.65
                elif day_idx > peak_day:
                    elapsed = day_idx - peak_day
                    engagement = base_eng * (1.65 * np.exp(-0.095 * elapsed))
                    velocity = base_vel * (1.3 * np.exp(-0.085 * elapsed))
                    discrepancy = max(2.5, base_disc - elapsed * 0.7)

            signals.append(
                {
                    "signal_id": f"{pid}_{current_date.strftime('%Y%m%d')}",
                    "product_id": pid,
                    "product_name": pname,
                    "category": cat,
                    "timestamp": current_date.isoformat() + "Z",
                    "date": current_date.strftime("%Y-%m-%d"),
                    "intent_weighted_engagement": round(float(engagement), 2),
                    "ecomm_velocity": round(float(velocity), 2),
                    "price_discrepancy": round(float(discrepancy), 2),
                    "unit_cost": round(float(unit_cost), 2),
                    "retail_price": round(float(retail_price), 2),
                }
            )

    return signals


if __name__ == "__main__":
    sample_signals = generate_mock_raw_signals(days=44)
    print(f"Generated {len(sample_signals)} mock raw_signals documents across {len(PRODUCT_CATALOG)} SKUs.")
    print("Sample document:", sample_signals[-1])
