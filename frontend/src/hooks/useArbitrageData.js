import { useState, useEffect, useMemo } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import {
   initializeFirestore,
  getFirestore,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';

/**
 * Custom hook that hydrates the UI immediately with the local Python Math Engine
 * snapshot (`/mock_firestore_snapshot.json`) in <100ms, and concurrently
 * synchronizes with Firebase Firestore (`raw_signals` & `arbitrage_scores`)
 * using long-polling transport + a strict 4-second timeout so WebChannel / proxy
 * hangs can never block the UI on the loading screen.
 */
export function useArbitrageData() {
  const [rawSignals, setRawSignals] = useState([]);
  const [arbitrageScores, setArbitrageScores] = useState([]);
  const [schemaDefinition, setSchemaDefinition] = useState(null);
  const [dataSource, setDataSource] = useState('Synchronizing...');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function loadFromSnapshot() {
      const response = await fetch('/mock_firestore_snapshot.json');
      if (!response.ok) {
        throw new Error('Failed to load local arbitrage engine snapshot');
      }
      const data = await response.json();
      if (!isMounted) return false;
      setRawSignals(data.raw_signals || []);
      setArbitrageScores(data.arbitrage_scores || []);
      setSchemaDefinition(data.schema || null);
      setDataSource('Python Math Engine Snapshot (Firestore Schema Synced)');
      setLoading(false);
      return true;
    }

    async function initDataLayer() {
      const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
      const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
      // Normalize accidental double "1:1:" prefix in VITE_FIREBASE_APP_ID
      const rawAppId = import.meta.env.VITE_FIREBASE_APP_ID || '';
      const appId = rawAppId.replace(/^1:1:/, '1:');

      const hasLiveCredentials =
        apiKey &&
        projectId &&
        apiKey !== 'your_firebase_api_key_here' &&
        projectId !== 'your-project-id';

      // Step 1: Hydrate immediately from local Python Math Engine snapshot
      // so the dashboard renders in <100ms without blocking on Firestore WebChannel backoff.
      let snapshotLoaded = false;
      try {
        snapshotLoaded = await loadFromSnapshot();
      } catch (snapErr) {
        if (!hasLiveCredentials && isMounted) {
          setError(snapErr.message);
          setLoading(false);
          return;
        }
      }

      if (!hasLiveCredentials) {
        return;
      }

      // Step 2: Concurrently fetch live Firestore collections with long-polling + 4s timeout
      try {
        const firebaseConfig = {
          apiKey,
          authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
          projectId,
          storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
          messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
          appId,
        };

        let db;
        if (getApps().length === 0) {
          const app = initializeApp(firebaseConfig);
          db = initializeFirestore(app, {
            experimentalForceLongPolling: true,
          });
        } else {
          db = getFirestore(getApps()[0]);
        }

        const scoresQuery = query(
          collection(db, 'arbitrage_scores'),
          orderBy('date', 'asc'),
          limit(500)
        );
        const signalsQuery = query(
          collection(db, 'raw_signals'),
          orderBy('date', 'asc'),
          limit(500)
        );

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Firestore query timed out after 4000ms')),
            4000
          )
        );

        const [scoresSnap, signalsSnap] = await Promise.race([
          Promise.all([getDocs(scoresQuery), getDocs(signalsQuery)]),
          timeoutPromise,
        ]);

        if (!scoresSnap.empty && isMounted) {
          const liveScores = scoresSnap.docs.map((d) => d.data());
          const liveSignals = signalsSnap.docs.map((d) => d.data());
          setArbitrageScores(liveScores);
          setRawSignals(liveSignals);
          setDataSource(`Firebase Firestore (${projectId})`);
          setLoading(false);
        }
      } catch (firestoreErr) {
        console.warn(
          '[useArbitrageData] Using pre-hydrated Python math engine snapshot:',
          firestoreErr.message || firestoreErr
        );
        if (!snapshotLoaded && isMounted) {
          setError(firestoreErr.message || 'Failed to load arbitrage data');
          setLoading(false);
        }
      }
    }

    initDataLayer();
    return () => {
      isMounted = false;
    };
  }, []);

  // Group time-series by product_id (last 30 days for leading indicator curves)
  const productMap = useMemo(() => {
    const grouped = {};
    for (const row of arbitrageScores) {
      if (!grouped[row.product_id]) {
        grouped[row.product_id] = [];
      }
      grouped[row.product_id].push(row);
    }
    Object.keys(grouped).forEach((pid) => {
      grouped[pid].sort((a, b) => a.date.localeCompare(b.date));
    });
    return grouped;
  }, [arbitrageScores]);

  // Latest daily snapshot per product for Left Pane & Center Action Engine
  const latestProducts = useMemo(() => {
    return Object.keys(productMap)
      .map((pid) => {
        const series = productMap[pid];
        const latest = series[series.length - 1];
        const prev = series.length > 1 ? series[series.length - 2] : latest;
        const velocityDelta =
          prev && prev.ecomm_velocity > 0
            ? ((latest.ecomm_velocity - prev.ecomm_velocity) /
                prev.ecomm_velocity) *
              100
            : 0;
        return {
          ...latest,
          velocityDelta,
          history30d: series.slice(-30),
        };
      })
      .sort((a, b) => b.action_threshold - a.action_threshold);
  }, [productMap]);

  return {
    rawSignals,
    arbitrageScores,
    latestProducts,
    productMap,
    schemaDefinition,
    dataSource,
    loading,
    error,
  };
}
