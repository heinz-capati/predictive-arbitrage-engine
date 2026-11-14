"""
Predictive Demand & Trend Arbitrage Engine - Core Mathematical Engine
Implements MAD Z-Score Social Normalization, Exponential Decay Momentum,
and Newsvendor Arbitrage Decision Thresholds using Pandas and NumPy.
"""

from typing import Dict, Any, List, Optional
import numpy as np
import pandas as pd


class ArbitrageMathEngine:
    """
    Core mathematical engine for normalizing unstructured social momentum
    against e-commerce velocity and computing Newsvendor arbitrage thresholds.
    """

    MAD_SCALE_FACTOR: float = 1.4826
    EPSILON: float = 1e-9

    def __init__(
        self,
        rolling_window: int = 14,
        decay_lambda: float = 0.1,
        omega: float = 1.0,
        cost_underage: float = 60.0,
        cost_overage: float = 40.0,
    ) -> None:
        self.rolling_window = rolling_window
        self.decay_lambda = decay_lambda
        self.omega = omega
        self.cost_underage = cost_underage
        self.cost_overage = cost_overage
        self.critical_fractile = self.cost_underage / (
            self.cost_underage + self.cost_overage
        )

    @staticmethod
    def _rolling_mad(series: pd.Series, window: int) -> pd.Series:
        """
        Compute the rolling Median Absolute Deviation (MAD) over a specified window.
        MAD_w = median(|x - median_w(x)|)
        """
        def calc_mad(values: np.ndarray) -> float:
            med = np.median(values)
            return float(np.median(np.abs(values - med)))

        return series.rolling(window=window, min_periods=3).apply(calc_mad, raw=True)

    @staticmethod
    def _compute_days_since_peak(series: pd.Series) -> pd.Series:
        """
        Calculate the number of days elapsed (`t`) since the running historical
        or rolling 14-day peak of the Z-score for a single product time series.
        """
        values = series.to_numpy(dtype=float)
        n = len(values)
        days_since_peak = np.zeros(n, dtype=float)

        running_max = -np.inf
        last_peak_idx = 0

        for i in range(n):
            val = values[i]
            if np.isnan(val):
                days_since_peak[i] = 0.0
                continue
            if val >= running_max:
                running_max = val
                last_peak_idx = i
                days_since_peak[i] = 0.0
            else:
                days_since_peak[i] = float(i - last_peak_idx)

        return pd.Series(days_since_peak, index=series.index)

    def compute_social_z_score(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        1. The Social Normalization Engine (MAD Z-Score):
        Z_social = (log1p(E_t) - Median_14) / (1.4826 * MAD_14)
        """
        df = df.copy()
        df["log_engagement"] = np.log1p(
            np.maximum(0.0, df["intent_weighted_engagement"].astype(float))
        )

        df["median_14"] = df.groupby("product_id")["log_engagement"].transform(
            lambda s: s.rolling(window=self.rolling_window, min_periods=3).median()
        )

        df["mad_14"] = df.groupby("product_id")["log_engagement"].transform(
            lambda s: self._rolling_mad(s, self.rolling_window)
        )

        denominator = (self.MAD_SCALE_FACTOR * df["mad_14"]).replace(0.0, np.nan)
        df["z_score_social"] = (
            (df["log_engagement"] - df["median_14"]) / (denominator + self.EPSILON)
        ).fillna(0.0)

        # Clip extreme statistical outliers caused by cold-start windows
        df["z_score_social"] = df["z_score_social"].clip(lower=-10.0, upper=15.0)
        return df

    def compute_momentum_and_decay(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        2. The Momentum & Decay Calculator:
        Calculate the day-over-day change in the Z-score and apply an exponential
        decay based on days since peak.
        M_trend = (delta_Z_social) * exp(-lambda * t)
        """
        df = df.copy()

        df["delta_z_social"] = (
            df.groupby("product_id")["z_score_social"].diff().fillna(0.0)
        )

        df["days_since_peak"] = df.groupby("product_id", group_keys=False)[
            "z_score_social"
        ].apply(self._compute_days_since_peak)

        df["decay_multiplier"] = np.exp(-self.decay_lambda * df["days_since_peak"])
        df["momentum_decay_factor"] = df["delta_z_social"] * df["decay_multiplier"]
        return df

    def compute_arbitrage_decision(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        3. The Arbitrage Decision Rule (Newsvendor Target):
        Action_Threshold = (C_u / (C_u + C_o)) * (1 + (omega * M_trend))

        Logic rule:
        - Action_Threshold > 1.2       -> "Restock/Capitalize"
        - 0.8 < Action_Threshold <= 1.2 -> "Run Ads/Monitor"
        - Action_Threshold <= 0.8      -> "Ignore"
        """
        df = df.copy()

        df["action_threshold"] = self.critical_fractile * (
            1.0 + (self.omega * df["momentum_decay_factor"])
        )

        conditions = [
            df["action_threshold"] > 1.2,
            (df["action_threshold"] > 0.8) & (df["action_threshold"] <= 1.2),
        ]
        choices = ["Restock/Capitalize", "Run Ads/Monitor"]

        df["decision_status"] = np.select(conditions, choices, default="Ignore")
        return df

    def process_signals(self, raw_signals: List[Dict[str, Any]]) -> pd.DataFrame:
        """
        Full pipeline execution from unstructured `raw_signals` list of dicts
        to normalized `arbitrage_scores` DataFrame.
        """
        if not raw_signals:
            return pd.DataFrame()

        df = pd.DataFrame(raw_signals)
        df["date"] = pd.to_datetime(df["date"])
        df = df.sort_values(by=["product_id", "date"]).reset_index(drop=True)

        df = self.compute_social_z_score(df)
        df = self.compute_momentum_and_decay(df)
        df = self.compute_arbitrage_decision(df)

        # Round numerical outputs for clean storage and visualization
        numeric_cols = [
            "z_score_social",
            "delta_z_social",
            "momentum_decay_factor",
            "action_threshold",
            "ecomm_velocity",
            "price_discrepancy",
            "unit_cost",
            "retail_price",
        ]
        for col in numeric_cols:
            if col in df.columns:
                df[col] = df[col].astype(float).round(4)

        df["date"] = df["date"].dt.strftime("%Y-%m-%d")
        return df

    def to_arbitrage_records(self, processed_df: pd.DataFrame) -> List[Dict[str, Any]]:
        """
        Serialize processed DataFrame into Firestore `arbitrage_scores` schema documents.
        """
        if processed_df.empty:
            return []

        output_columns = [
            "product_id",
            "product_name",
            "category",
            "date",
            "intent_weighted_engagement",
            "ecomm_velocity",
            "price_discrepancy",
            "unit_cost",
            "retail_price",
            "stock_status",
            "z_score_social",
            "delta_z_social",
            "days_since_peak",
            "momentum_decay_factor",
            "action_threshold",
            "decision_status",
        ]
        available_cols = [c for c in output_columns if c in processed_df.columns]
        return processed_df[available_cols].to_dict(orient="records")


if __name__ == "__main__":
    from scraper_mock import generate_mock_raw_signals

    raw_data = generate_mock_raw_signals(days=30)
    engine = ArbitrageMathEngine(
        rolling_window=14,
        decay_lambda=0.1,
        omega=1.0,
        cost_underage=60.0,
        cost_overage=40.0,
    )
    scored_df = engine.process_signals(raw_data)
    latest_snapshot = scored_df.groupby("product_id").tail(1)
    print("=== Predictive Demand & Trend Arbitrage Engine: Latest Snapshot ===")
    print(
        latest_snapshot[
            [
                "product_id",
                "product_name",
                "date",
                "z_score_social",
                "momentum_decay_factor",
                "action_threshold",
                "decision_status",
            ]
        ].to_string(index=False)
    )
