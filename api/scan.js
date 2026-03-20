// ─────────────────────────────────────────────────────────────────────────────
// /api/scan — Vercel Serverless Function (cron + manual trigger)
//
// Called by:
//   1. Vercel Cron (every 30s via vercel.json crons config)
//   2. The React app when user clicks "Refresh" (POST /api/scan)
//
// What it does:
//   1. Fetches new Solana pairs from DexScreener (pumpswap + raydium)
//   2. Applies quality gate filters
//   3. Scores every token using the nichxbt 8-signal engine
//   4. Tracks detection history (first-seen price, ATH, gain)
//   5. Saves processed tokens + metadata to Vercel KV
//
// The React app then just reads /api/tokens — zero scanning in the browser.
// ─────────────────────────────────────────────────────────────────────────────

const {
  getCachedTokens, setCachedTokens,
  getDetectionMap, setDetectionMap,
  getSeenIds,      saveSeenIds,
  getScanCount,    incrScanCount,
  setLastUpdate,   isKvAvailable,
} = require('./_kv');

const { isValidPair, scoreToken } = require('./_scoring');

const DEXSCREENER = 'https://api.dexscreener.com';
const CUTOFF_48H  = 48 * 60 * 60 * 1000;

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchPairs(query) {
  try {
    const res = await fetch(`${DEXSCREENER}/latest/dex/search?q=${encodeURIComponent(query)}`, {
      headers: { Accept: 'application/json' },
      signal:  AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.pairs || []).filter(p =>
      p.chainId === 'solana' &&
      p.pairCreatedAt > Date.now() - CUTOFF_48H
    );
  } catch (e) {
    console.error(`[scan] fetchPairs(${query}) error:`, e.message);
    return [];
  }
}

// ── Main scan logic ───────────────────────────────────────────────────────────

async function runScan() {
  if (!isKvAvailable()) {
    throw new Error('Vercel KV not configured. Add KV_REST_API_URL and KV_REST_API_TOKEN.');
  }

  // Fetch both sources in parallel
  const [pumpswapPairs, raydiumPairs] = await Promise.all([
    fetchPairs('pumpswap'),
    fetchPairs('raydium solana pump'),
  ]);

  // Deduplicate by pairAddress
  const seen = new Set();
  const allPairs = [...pumpswapPairs, ...raydiumPairs].filter(p => {
    if (!p.pairAddress || seen.has(p.pairAddress)) return false;
    seen.add(p.pairAddress);
    return true;
  });

  // Quality gate
  const validPairs = allPairs.filter(isValidPair);

  // Load detection state from KV
  const [detectionMap, seenIds] = await Promise.all([
    getDetectionMap(),
    getSeenIds(),
  ]);

  const now = Date.now();
  let newCount = 0;

  // Score + enrich each token
  const processed = validPairs.map(token => {
    const id           = token.pairAddress || token.baseToken?.address;
    const currentPrice = parseFloat(token.priceUsd || 0);
    const scoreResult  = scoreToken(token);

    let detection = detectionMap[id];
    if (!detection) {
      detection = { detectedAt: now, priceAtDetection: currentPrice, ath: currentPrice, athAt: now };
      detectionMap[id] = detection;
      if (!seenIds.has(id)) { newCount++; seenIds.add(id); }
    } else if (currentPrice > detection.ath) {
      detection = { ...detection, ath: currentPrice, athAt: now };
      detectionMap[id] = detection;
    }

    const gainSinceDetection = detection.priceAtDetection > 0
      ? ((currentPrice - detection.priceAtDetection) / detection.priceAtDetection) * 100 : 0;
    const athGain = detection.priceAtDetection > 0
      ? ((detection.ath - detection.priceAtDetection) / detection.priceAtDetection) * 100 : 0;

    return {
      ...token,
      _score:              scoreResult,
      _id:                 id,
      _detectedAt:         detection.detectedAt,
      _priceAtDetection:   detection.priceAtDetection,
      _ath:                detection.ath,
      _athAt:              detection.athAt,
      _gainSinceDetection: gainSinceDetection,
      _athGain:            athGain,
    };
  }).sort((a, b) => b._score.total - a._score.total);

  // Persist everything to KV in parallel
  await Promise.all([
    setCachedTokens(processed),
    setDetectionMap(detectionMap),
    saveSeenIds(seenIds),
    setLastUpdate(now),
    newCount > 0 ? incrScanCount(newCount) : Promise.resolve(),
  ]);

  console.log(`[scan] ✓ ${processed.length} tokens | ${newCount} new | ${now}`);
  return { total: processed.length, newCount, timestamp: now };
}

// ── Handler ───────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // Auth — protect from abuse (cron calls include this header automatically)
  const secret = req.headers['x-cron-secret'] || req.query.secret;
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await runScan();
    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    console.error('[scan] error:', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
};
