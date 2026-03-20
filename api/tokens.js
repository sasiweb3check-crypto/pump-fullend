// ─────────────────────────────────────────────────────────────────────────────
// /api/tokens — Read-only endpoint
//
// Called by the React app every 30s (via useTokenScanner hook).
// Returns the latest processed tokens from Vercel KV.
// The heavy scan work already happened in /api/scan (cron).
// This is just a fast KV read — sub-10ms response time.
// ─────────────────────────────────────────────────────────────────────────────

const {
  getCachedTokens,
  getScanCount,
  getLastUpdate,
  isKvAvailable,
} = require('./_kv');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, no-cache');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!isKvAvailable()) {
    // KV not set up yet — return empty so UI shows "configuring" state
    return res.status(200).json({
      tokens:     [],
      scanCount:  0,
      lastUpdate: null,
      kvReady:    false,
    });
  }

  try {
    const [tokens, scanCount, lastUpdate] = await Promise.all([
      getCachedTokens(),
      getScanCount(),
      getLastUpdate(),
    ]);

    return res.status(200).json({
      tokens:     Array.isArray(tokens) ? tokens : [],
      scanCount:  scanCount  || 0,
      lastUpdate: lastUpdate || null,
      kvReady:    true,
    });
  } catch (e) {
    console.error('[tokens] error:', e.message);
    return res.status(500).json({ error: e.message, tokens: [], scanCount: 0, lastUpdate: null, kvReady: false });
  }
};
