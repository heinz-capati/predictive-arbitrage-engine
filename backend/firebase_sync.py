"""
Firebase Firestore Provisioning & Synchronization Pipeline
Manages schema validation and batch upserts for the two primary collections:
1. `raw_signals`
2. `arbitrage_scores`

Also outputs a local JSON snapshot to `/frontend/public/mock_firestore_snapshot.json`
when running in offline/free-tier local mode or alongside Firestore sync.
"""

import json
import os
from pathlib import Path
from typing import Dict, Any, List, Optional

ROOT_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT_DIR / ".env"

try:
    from dotenv import load_dotenv
    load_dotenv(dotenv_path=ENV_PATH)
except ImportError:
    # Fallback parser if python-dotenv is not installed in the active environment
    if ENV_PATH.exists():
        for _line in ENV_PATH.read_text(encoding="utf-8").splitlines():
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _k, _v = _line.split("=", 1)
                os.environ.setdefault(_k.strip(), _v.strip())

from math_engine import ArbitrageMathEngine
from scraper_mock import generate_mock_raw_signals

FIRESTORE_SCHEMA_DEFINITION: Dict[str, Any] = {
    "collections": {
        "raw_signals": {
            "document_id_pattern": "{product_id}_{YYYYMMDD}",
            "fields": {
                "signal_id": "string",
                "product_id": "string (indexed)",
                "product_name": "string",
                "category": "string",
                "timestamp": "timestamp / ISO-8601 string (indexed)",
                "date": "string (YYYY-MM-DD)",
                "intent_weighted_engagement": "number (float)",
                "ecomm_velocity": "number (float, units/day)",
                "price_discrepancy": "number (float, % spread across marketplaces)",
                "unit_cost": "number (float, landed unit cost USD)",
                "retail_price": "number (float, target market retail price USD)",
            },
        },
        "arbitrage_scores": {
            "document_id_pattern": "{product_id}_{YYYY-MM-DD}",
            "fields": {
                "product_id": "string (indexed)",
                "product_name": "string",
                "category": "string",
                "date": "string (YYYY-MM-DD, indexed)",
                "z_score_social": "number (float, MAD-normalized Z-score)",
                "momentum_decay_factor": "number (float, M_trend)",
                "action_threshold": "number (float, Newsvendor target score)",
                "decision_status": "string (Restock/Capitalize | Run Ads/Monitor | Ignore)",
                "ecomm_velocity": "number (float)",
                "price_discrepancy": "number (float)",
                "unit_cost": "number (float)",
                "retail_price": "number (float)",
                "intent_weighted_engagement": "number (float)",
            },
        },
    }
}


class FirestoreArbitrageSync:
    """
    Handles Firebase Admin initialization and batched writes for `raw_signals`
    and `arbitrage_scores`.
    """

    def __init__(self, service_account_path: Optional[str] = None) -> None:
        raw_path = (
            service_account_path
            or os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH")
            or os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        )
        if raw_path and not os.path.isabs(raw_path):
            resolved = (ROOT_DIR / raw_path).resolve()
            self.service_account_path = str(resolved) if resolved.exists() else raw_path
        else:
            self.service_account_path = raw_path
        self.db = None
        self._init_firestore()

    def _init_firestore(self) -> None:
        if not self.service_account_path or not os.path.exists(
            self.service_account_path
        ):
            print(
                "[FirestoreSync] No active service account JSON detected. "
                "Running in Local Snapshot + Schema Provisioning mode."
            )
            return

        try:
            import firebase_admin
            from firebase_admin import credentials, firestore

            if not firebase_admin._apps:
                cred = credentials.Certificate(self.service_account_path)
                firebase_admin.initialize_app(cred)
            self.db = firestore.client()
            print("[FirestoreSync] Connected to Firebase Firestore instance.")
        except Exception as exc:
            print(f"[FirestoreSync] Firestore initialization skipped: {exc}")
            self.db = None

    def sync_collections(
        self,
        raw_signals: List[Dict[str, Any]],
        arbitrage_scores: List[Dict[str, Any]],
    ) -> Dict[str, int]:
        """
        Pushes `raw_signals` and `arbitrage_scores` to Firebase Firestore in batches
        of 400 documents (respecting Firestore's 500-op batch limit).
        """
        stats = {
            "raw_signals_synced": 0,
            "arbitrage_scores_synced": 0,
        }

        if self.db is None:
            return stats

        # Batch write raw_signals
        batch = self.db.batch()
        op_count = 0
        for signal in raw_signals:
            doc_id = signal.get("signal_id") or f"{signal['product_id']}_{signal['date']}"
            doc_ref = self.db.collection("raw_signals").document(doc_id)
            batch.set(doc_ref, signal, merge=True)
            op_count += 1
            stats["raw_signals_synced"] += 1
            if op_count >= 400:
                batch.commit()
                batch = self.db.batch()
                op_count = 0
        if op_count > 0:
            batch.commit()

        # Batch write arbitrage_scores
        batch = self.db.batch()
        op_count = 0
        for score in arbitrage_scores:
            doc_id = f"{score['product_id']}_{score['date']}"
            doc_ref = self.db.collection("arbitrage_scores").document(doc_id)
            batch.set(doc_ref, score, merge=True)
            op_count += 1
            stats["arbitrage_scores_synced"] += 1
            if op_count >= 400:
                batch.commit()
                batch = self.db.batch()
                op_count = 0
        if op_count > 0:
            batch.commit()

        return stats


def execute_pipeline_and_export() -> None:
    """
    Runs the full ingestion -> math engine -> Firestore sync pipeline
    and writes the deterministic JSON payload for the frontend fallback hook.
    """
    raw_signals = generate_mock_raw_signals(days=44)
    engine = ArbitrageMathEngine(
        rolling_window=14,
        decay_lambda=0.1,
        omega=1.0,
        cost_underage=60.0,
        cost_overage=40.0,
    )
    processed_df = engine.process_signals(raw_signals)
    arbitrage_scores = engine.to_arbitrage_records(processed_df)

    syncer = FirestoreArbitrageSync()
    sync_stats = syncer.sync_collections(raw_signals, arbitrage_scores)

    # Export local snapshot for frontend zero-latency hydration
    frontend_public_dir = (
        Path(__file__).resolve().parent.parent / "frontend" / "public"
    )
    frontend_public_dir.mkdir(parents=True, exist_ok=True)
    snapshot_path = frontend_public_dir / "mock_firestore_snapshot.json"

    payload = {
        "schema": FIRESTORE_SCHEMA_DEFINITION,
        "generated_at": raw_signals[-1]["timestamp"] if raw_signals else "",
        "parameters": {
            "rolling_window": engine.rolling_window,
            "decay_lambda": engine.decay_lambda,
            "omega": engine.omega,
            "cost_underage": engine.cost_underage,
            "cost_overage": engine.cost_overage,
            "critical_fractile": round(engine.critical_fractile, 4),
        },
        "raw_signals": raw_signals[-150:],
        "arbitrage_scores": arbitrage_scores,
    }

    with open(snapshot_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    print(
        f"[Pipeline Complete] Processed {len(arbitrage_scores)} arbitrage records. "
        f"Firestore synced: {sync_stats}. Snapshot written to {snapshot_path}."
    )


if __name__ == "__main__":
    execute_pipeline_and_export()
