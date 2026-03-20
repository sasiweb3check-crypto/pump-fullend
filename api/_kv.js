// ─────────────────────────────────────────────────────────────────────────────
// VERCEL KV HELPER
// Thin wrapper around the Vercel KV REST API.
// Uses the env vars Vercel injects automatically when you add a KV store.
// ─────────────────────────────────────────────────────────────────────────────

const KV_REST_API_URL   = process.env.KV_REST_API_URL;
const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;

const KEYS = {
  CACHED_TOKENS:  'pumpsdk:tokens',        // ProcessedToken[]
  DETECTION_MAP:  'pumpsdk:detection_map', // { id -> { detectedAt, priceAtDetection, ath, athAt } }
  SEEN_IDS:       'pumpsdk:seen_ids',       // string[]
  SCAN_COUNT:     'pumpsdk:scan_count',     // number
  LAST_UPDATE:    'pumpsdk:last_update',    // timestamp
};

const TTL_TOKENS      = 3600;   // 1 hour — tokens expire after 1h if no scan
const TTL_DETECTION   = 172800; // 48 hours
const TTL_SEEN        = 172800;
const TTL_SCAN_COUNT  = 2592000; // 30 days
const TTL_LAST_UPDATE = 3600;

// ── KV available? ──────────────────────────────────────────────────────────────
function isKvAvailable() {
  return !!(KV_REST_API_URL && KV_REST_API_TOKEN);
}

// ── Raw REST call ───────────────────────────────────────────────────────────────
async function kvGet(key) {
  if (!isKvAvailable()) return null;
  try {
    const res = await fetch(`${KV_REST_API_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    // Vercel KV REST returns { result: value } — value may be string or JSON
    if (data.result === null || data.result === undefined) return null;
    // If it's a string that looks like JSON, parse it
    if (typeof data.result === 'string') {
      try { return JSON.parse(data.result); } catch { return data.result; }
    }
    return data.result;
  } catch { return null; }
}

async function kvSet(key, value, ttl) {
  if (!isKvAvailable()) return false;
  try {
    const body = ['SET', key, JSON.stringify(value)];
    if (ttl) { body.push('EX'); body.push(String(ttl)); }
    const res = await fetch(`${KV_REST_API_URL}/pipeline`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify([body]),
      signal:  AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch { return false; }
}

async function kvIncr(key) {
  if (!isKvAvailable()) return 0;
  try {
    const res = await fetch(`${KV_REST_API_URL}/incr/${encodeURIComponent(key)}`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` },
      signal:  AbortSignal.timeout(5000),
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return data.result || 0;
  } catch { return 0; }
}

// ── Domain helpers ──────────────────────────────────────────────────────────────

async function getCachedTokens()    { const res = await kvGet(KEYS.CACHED_TOKENS); return res || []; }
async function setCachedTokens(t)   { return kvSet(KEYS.CACHED_TOKENS, t, TTL_TOKENS); }

async function getDetectionMap()    { const res = await kvGet(KEYS.DETECTION_MAP); return res || {}; }
async function setDetectionMap(m)   {
  // Prune to 500 entries
  const entries = Object.entries(m);
  let pruned = m;
  if (entries.length > 500) {
    pruned = Object.fromEntries(
      entries.sort((a, b) => (b[1].detectedAt||0) - (a[1].detectedAt||0)).slice(0, 500)
    );
  }
  return kvSet(KEYS.DETECTION_MAP, pruned, TTL_DETECTION);
}

async function getSeenIds()         { const arr = await kvGet(KEYS.SEEN_IDS); return new Set(Array.isArray(arr) ? arr : []); }
async function saveSeenIds(set)     { return kvSet(KEYS.SEEN_IDS, [...set].slice(-500), TTL_SEEN); }

async function getScanCount()       { const v = await kvGet(KEYS.SCAN_COUNT); return typeof v === 'number' ? v : 0; }
async function incrScanCount(n)     {
  const cur = await getScanCount();
  return kvSet(KEYS.SCAN_COUNT, cur + n, TTL_SCAN_COUNT);
}

async function getLastUpdate()      { const v = await kvGet(KEYS.LAST_UPDATE); return typeof v === 'number' ? v : null; }
async function setLastUpdate(ts)    { return kvSet(KEYS.LAST_UPDATE, ts, TTL_LAST_UPDATE); }

module.exports = {
  isKvAvailable,
  getCachedTokens, setCachedTokens,
  getDetectionMap, setDetectionMap,
  getSeenIds,      saveSeenIds,
  getScanCount,    incrScanCount,
  getLastUpdate,   setLastUpdate,
};
