// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENT STORAGE LAYER
// Handles all localStorage read/write with safety guards.
// Never throws — always fails gracefully.
// ─────────────────────────────────────────────────────────────────────────────

const KEYS = {
  DETECTION_MAP:  'pumpsdk_detection_map',   // { id -> { detectedAt, priceAtDetection, ath, athAt } }
  SEEN_IDS:       'pumpsdk_seen_ids',         // string[] of all seen pair IDs
  SCAN_COUNT:     'pumpsdk_scan_count',       // total tokens ever seen
  LAST_UPDATE:    'pumpsdk_last_update',      // timestamp of last successful scan
  CACHED_TOKENS:  'pumpsdk_cached_tokens',   // last full processed token list (for instant display)
};

// How long cached token data is considered "fresh enough" to display on load (5 min)
const CACHE_MAX_AGE_MS = 5 * 60 * 1000;

// Max entries kept in detection map (prevents unbounded growth)
const MAX_DETECTION_ENTRIES = 500;

// ── Safe read ──────────────────────────────────────────────────────────────────
function safeGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

// ── Safe write ─────────────────────────────────────────────────────────────────
function safeSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    // QuotaExceededError or Safari private mode
    console.warn('[storage] write failed for', key, e?.name);
    // If quota exceeded, try to clear old cached tokens and retry
    if (e?.name === 'QuotaExceededError' || e?.code === 22) {
      try {
        localStorage.removeItem(KEYS.CACHED_TOKENS);
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

// ── Detection Map ──────────────────────────────────────────────────────────────
export function loadDetectionMap() {
  return safeGet(KEYS.DETECTION_MAP, {});
}

export function saveDetectionMap(map) {
  // Prune to most recent MAX_DETECTION_ENTRIES by detectedAt to prevent bloat
  const entries = Object.entries(map);
  if (entries.length > MAX_DETECTION_ENTRIES) {
    const sorted = entries.sort((a, b) => (b[1].detectedAt || 0) - (a[1].detectedAt || 0));
    const pruned = Object.fromEntries(sorted.slice(0, MAX_DETECTION_ENTRIES));
    safeSet(KEYS.DETECTION_MAP, pruned);
  } else {
    safeSet(KEYS.DETECTION_MAP, map);
  }
}

// ── Seen IDs ───────────────────────────────────────────────────────────────────
export function loadSeenIds() {
  const arr = safeGet(KEYS.SEEN_IDS, []);
  return new Set(Array.isArray(arr) ? arr : []);
}

export function saveSeenIds(set) {
  // Only persist up to MAX_DETECTION_ENTRIES IDs
  const arr = [...set].slice(-MAX_DETECTION_ENTRIES);
  safeSet(KEYS.SEEN_IDS, arr);
}

// ── Scan count ─────────────────────────────────────────────────────────────────
export function loadScanCount() {
  const val = safeGet(KEYS.SCAN_COUNT, 0);
  return typeof val === 'number' ? val : 0;
}

export function saveScanCount(count) {
  safeSet(KEYS.SCAN_COUNT, count);
}

// ── Last update timestamp ─────────────────────────────────────────────────────
export function loadLastUpdate() {
  const val = safeGet(KEYS.LAST_UPDATE, null);
  return typeof val === 'number' ? val : null;
}

export function saveLastUpdate(ts) {
  safeSet(KEYS.LAST_UPDATE, ts);
}

// ── Cached token list (for instant display on reload) ─────────────────────────
export function loadCachedTokens() {
  const cached = safeGet(KEYS.CACHED_TOKENS, null);
  if (!cached || !Array.isArray(cached.tokens)) return null;
  // Only return if within freshness window
  const age = Date.now() - (cached.savedAt || 0);
  if (age > CACHE_MAX_AGE_MS) return null;
  return cached.tokens;
}

export function saveCachedTokens(tokens) {
  // Strip heavy/redundant data before saving — keep only what's needed for display
  const slim = tokens.map(t => ({
    // Core token fields
    pairAddress: t.pairAddress,
    chainId: t.chainId,
    dexId: t.dexId,
    pairCreatedAt: t.pairCreatedAt,
    baseToken: t.baseToken,
    quoteToken: t.quoteToken,
    priceUsd: t.priceUsd,
    priceChange: t.priceChange,
    volume: t.volume,
    liquidity: t.liquidity,
    txns: t.txns,
    marketCap: t.marketCap,
    fdv: t.fdv,
    // Computed fields
    _id: t._id,
    _score: t._score,
    _detectedAt: t._detectedAt,
    _priceAtDetection: t._priceAtDetection,
    _ath: t._ath,
    _athAt: t._athAt,
    _gainSinceDetection: t._gainSinceDetection,
    _athGain: t._athGain,
  }));

  safeSet(KEYS.CACHED_TOKENS, { tokens: slim, savedAt: Date.now() });
}

// ── Clear all persisted data ───────────────────────────────────────────────────
export function clearAllStorage() {
  Object.values(KEYS).forEach(key => {
    try { localStorage.removeItem(key); } catch {}
  });
}

// ── Storage health check ───────────────────────────────────────────────────────
export function getStorageInfo() {
  const keys = Object.values(KEYS);
  let totalBytes = 0;
  const details = {};
  keys.forEach(key => {
    try {
      const val = localStorage.getItem(key);
      const bytes = val ? new Blob([val]).size : 0;
      totalBytes += bytes;
      details[key] = bytes;
    } catch {}
  });
  return { totalBytes, details };
}
