import { useState, useEffect, useCallback, useRef } from 'react';
import { scoreToken } from '../utils/scoring';

// ─────────────────────────────────────────────────────────────────────────────
// STORAGE KEYS
// ─────────────────────────────────────────────────────────────────────────────
const WATCHLIST_ADDRESSES_KEY = 'pumpsdk_watchlist_addresses'; // string[] of contract addresses
const WATCHLIST_DETECTION_KEY = 'pumpsdk_watchlist_detection'; // { id -> detection snapshot }

function loadAddresses() {
  try { return JSON.parse(localStorage.getItem(WATCHLIST_ADDRESSES_KEY) || '[]'); } catch { return []; }
}
function saveAddresses(arr) {
  try { localStorage.setItem(WATCHLIST_ADDRESSES_KEY, JSON.stringify(arr)); } catch {}
}
function loadDetection() {
  try { return JSON.parse(localStorage.getItem(WATCHLIST_DETECTION_KEY) || '{}'); } catch { return {}; }
}
function saveDetection(map) {
  try { localStorage.setItem(WATCHLIST_DETECTION_KEY, JSON.stringify(map)); } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// FETCH SINGLE TOKEN — DexScreener /tokens/:address
// Returns the best Solana pair (highest liquidity)
// ─────────────────────────────────────────────────────────────────────────────
async function fetchPairForAddress(address) {
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${address}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const pairs = data.pairs || [];
    if (pairs.length === 0) return null;

    // Prefer Solana pairs, then highest liquidity
    const sorted = [...pairs].sort((a, b) => {
      const aS = (a.chainId === 'solana' ? 10000 : 0) + (a.liquidity?.usd || 0);
      const bS = (b.chainId === 'solana' ? 10000 : 0) + (b.liquidity?.usd || 0);
      return bS - aS;
    });
    return sorted[0];
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROCESS A RAW PAIR into a full tracked token (same logic as scanner)
// ─────────────────────────────────────────────────────────────────────────────
function processWatchedPair(rawPair, detectionMap) {
  const id = rawPair.pairAddress || rawPair.baseToken?.address;
  const currentPrice = parseFloat(rawPair.priceUsd || 0);
  const scoreResult = scoreToken(rawPair);
  const now = Date.now();

  let detection = detectionMap[id];
  if (!detection) {
    detection = {
      detectedAt: now,
      priceAtDetection: currentPrice,
      ath: currentPrice,
      athAt: now,
    };
  } else if (currentPrice > detection.ath) {
    detection = { ...detection, ath: currentPrice, athAt: now };
  }

  const gainSinceDetection = detection.priceAtDetection > 0
    ? ((currentPrice - detection.priceAtDetection) / detection.priceAtDetection) * 100
    : 0;
  const athGain = detection.priceAtDetection > 0
    ? ((detection.ath - detection.priceAtDetection) / detection.priceAtDetection) * 100
    : 0;

  return {
    rawPair,
    token: {
      ...rawPair,
      _score: scoreResult,
      _id: id,
      _detectedAt: detection.detectedAt,
      _priceAtDetection: detection.priceAtDetection,
      _ath: detection.ath,
      _athAt: detection.athAt,
      _gainSinceDetection: gainSinceDetection,
      _athGain: athGain,
      _watchlisted: true,
    },
    detection,
    id,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN HOOK
// ─────────────────────────────────────────────────────────────────────────────
export function useWatchlist() {
  const [addresses, setAddresses] = useState(loadAddresses);
  const [tokens, setTokens]       = useState([]);    // processed token objects
  const [loading, setLoading]     = useState(false);  // initial bulk load
  const [refreshing, setRefreshing] = useState({}); // { address -> bool } per-token refresh
  const [errors, setErrors]       = useState({});    // { address -> error string }

  const detectionRef  = useRef(loadDetection());
  const intervalRef   = useRef(null);
  const persistTimer  = useRef(null);

  // ── Persist detection map (debounced) ──────────────────────────────────────
  const scheduleSave = useCallback(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => saveDetection(detectionRef.current), 2000);
  }, []);

  // ── Fetch and process all watched addresses ────────────────────────────────
  const refreshAll = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);

    const currentAddresses = loadAddresses(); // read fresh from storage
    if (currentAddresses.length === 0) {
      setTokens([]);
      if (isInitial) setLoading(false);
      return;
    }

    const results = await Promise.allSettled(
      currentAddresses.map(addr => fetchPairForAddress(addr))
    );

    const newErrors = {};
    const newTokens = [];

    results.forEach((result, idx) => {
      const addr = currentAddresses[idx];
      if (result.status === 'fulfilled' && result.value) {
        const { token, detection, id } = processWatchedPair(result.value, detectionRef.current);
        detectionRef.current[id] = detection;
        newTokens.push(token);
      } else {
        newErrors[addr] = result.reason?.message || 'Failed to fetch';
      }
    });

    setTokens(newTokens);
    setErrors(newErrors);
    scheduleSave();
    if (isInitial) setLoading(false);
  }, [scheduleSave]);

  // ── Refresh single token ───────────────────────────────────────────────────
  const refreshToken = useCallback(async (address) => {
    setRefreshing(prev => ({ ...prev, [address]: true }));
    const pair = await fetchPairForAddress(address);
    if (pair) {
      const { token, detection, id } = processWatchedPair(pair, detectionRef.current);
      detectionRef.current[id] = detection;
      setTokens(prev => prev.map(t =>
        (t.baseToken?.address === address || t.pairAddress === address) ? token : t
      ));
      scheduleSave();
    }
    setRefreshing(prev => ({ ...prev, [address]: false }));
  }, [scheduleSave]);

  // ── Add a token to watchlist ───────────────────────────────────────────────
  const addToWatchlist = useCallback(async (address, existingToken = null) => {
    const addr = address.trim();
    if (!addr) return false;

    // Avoid duplicates
    const current = loadAddresses();
    if (current.includes(addr)) return true; // already in list

    const newAddresses = [...current, addr];
    saveAddresses(newAddresses);
    setAddresses(newAddresses);

    // If we already have the token data (from lookup), inject it immediately
    if (existingToken) {
      const { token, detection, id } = processWatchedPair(
        existingToken,
        detectionRef.current
      );
      detectionRef.current[id] = detection;
      setTokens(prev => {
        // Don't add duplicate
        const exists = prev.some(t => t._id === id);
        return exists ? prev : [...prev, token];
      });
      scheduleSave();
    } else {
      // Fetch fresh
      setRefreshing(prev => ({ ...prev, [addr]: true }));
      const pair = await fetchPairForAddress(addr);
      if (pair) {
        const { token, detection, id } = processWatchedPair(pair, detectionRef.current);
        detectionRef.current[id] = detection;
        setTokens(prev => [...prev, token]);
        scheduleSave();
      }
      setRefreshing(prev => ({ ...prev, [addr]: false }));
    }
    return true;
  }, [scheduleSave]);

  // ── Remove from watchlist ──────────────────────────────────────────────────
  const removeFromWatchlist = useCallback((address) => {
    const updated = loadAddresses().filter(a => a !== address);
    saveAddresses(updated);
    setAddresses(updated);
    setTokens(prev => prev.filter(t =>
      t.baseToken?.address !== address && t.pairAddress !== address
    ));
  }, []);

  // ── Check if address is in watchlist ──────────────────────────────────────
  const isWatchlisted = useCallback((address) => {
    return loadAddresses().includes(address);
  }, []);

  // ── On mount: load + start polling ────────────────────────────────────────
  useEffect(() => {
    const detection = detectionRef.current; // capture at effect-run time
    refreshAll(true);
    intervalRef.current = setInterval(() => refreshAll(false), 30000);
    return () => {
      clearInterval(intervalRef.current);
      if (persistTimer.current) clearTimeout(persistTimer.current);
      saveDetection(detection);
    };
  }, [refreshAll]);

  return {
    addresses,
    tokens,
    loading,
    refreshing,
    errors,
    addToWatchlist,
    removeFromWatchlist,
    refreshToken,
    isWatchlisted,
    refreshAll,
    count: addresses.length,
  };
}
