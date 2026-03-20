// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY SCORING — nichxbt pump.fun SDK method (v2)
// Based on $pump-sdk case study: Feb 26 2026, $2.1M vol, 142x, 100K+ txns/48h
//
// IMPROVEMENTS over v1:
// 1. Graduation Speed — now interacts with volume (fast + high vol = max bonus)
// 2. Volume Velocity — dedicated momentum score using h1/h6 acceleration ratio
// 3. Price Multiple — weighted toward sustained moves, not single-candle spikes
// 4. Buy Pressure — promoted to its own scored dimension (was just a bonus)
// 5. V/L Efficiency — volume-to-liquidity ratio scored (key nichxbt signal)
// 6. Market Cap Bonus — micro caps get upside multiplier, extended caps penalised
// 7. Total max = 100 (clean, no gaps)
// ─────────────────────────────────────────────────────────────────────────────

export const STRATEGY_WEIGHTS = {
  graduationSpeed: 18,  // Fast BC graduation = organic urgency
  volumeVelocity:  22,  // Volume size + acceleration
  priceMultiple:   16,  // Sustained price appreciation
  buyPressure:     12,  // Buy/sell ratio — real demand signal
  liquidityDepth:   8,  // Committed liquidity after graduation
  txFrequency:     12,  // Transaction frequency = community engagement
  vlEfficiency:     6,  // Volume/liquidity ratio — nichxbt flywheel signal
  socialSignal:     6,  // Dev/tech narrative keywords
};
// Total max: 18+22+16+12+8+12+6+6 = 100 ✓

export function scoreToken(token) {
  const scores = {};

  const ageMins = token.pairCreatedAt
    ? (Date.now() - token.pairCreatedAt) / 60000
    : 9999;

  const vol24h  = token.volume?.h24 || 0;
  const vol6h   = token.volume?.h6  || 0;
  const vol1h   = token.volume?.h1  || 0;
  const liquidity = token.liquidity?.usd || 0;
  const mcap      = token.marketCap || 0;

  const txns      = token.txns?.h24 || {};
  const txBuys    = txns.buys  || 0;
  const txSells   = txns.sells || 0;
  const totalTxns = txBuys + txSells;
  const buyRatio  = totalTxns > 0 ? txBuys / totalTxns : 0.5;

  const p5m  = token.priceChange?.m5  || 0;
  const p1h  = token.priceChange?.h1  || 0;
  const p6h  = token.priceChange?.h6  || 0;
  const p24h = token.priceChange?.h24 || 0;

  // ── 1. GRADUATION SPEED (0-18) ───────────────────────────────────────────
  // pump-sdk: 19 min. Fast graduation + meaningful volume = highest signal.
  // Speed score is weighted by whether volume is actually there to back it up.
  let speedBase;
  if      (ageMins <= 20)  speedBase = 18;
  else if (ageMins <= 30)  speedBase = 15;
  else if (ageMins <= 60)  speedBase = 11;
  else if (ageMins <= 120) speedBase = 7;
  else if (ageMins <= 360) speedBase = 3;
  else                     speedBase = 0;

  // Penalty if token is fast but has almost no volume (bot graduation, not organic)
  if (speedBase >= 11 && vol1h < 500) speedBase = Math.max(0, speedBase - 5);

  scores.graduationSpeed = speedBase;

  // ── 2. VOLUME VELOCITY (0-22) ────────────────────────────────────────────
  // pump-sdk: $787K day 1, $264K peak hour.
  // Score = base (volume size) + acceleration bonus (is it building or dying?)
  let volBase;
  if      (vol24h >= 500000) volBase = 16;
  else if (vol24h >= 200000) volBase = 13;
  else if (vol24h >= 100000) volBase = 10;
  else if (vol24h >= 50000)  volBase = 7;
  else if (vol24h >= 10000)  volBase = 4;
  else if (vol24h >= 2000)   volBase = 2;
  else                       volBase = 0;

  // Acceleration: how does this hour compare to the 6h average?
  // >1.5x average = accelerating (viral), <0.5x = fading fast
  const hourlyAvg6h = vol6h > 0 ? vol6h / 6 : 0;
  const accel = hourlyAvg6h > 0 ? vol1h / hourlyAvg6h : 1;
  let accelBonus = 0;
  if      (accel >= 3.0) accelBonus = 6;  // 3x+ vs average = explosive
  else if (accel >= 2.0) accelBonus = 4;  // 2x = strong momentum
  else if (accel >= 1.5) accelBonus = 2;  // 1.5x = building
  else if (accel < 0.4)  accelBonus = -3; // Rapidly fading — penalise

  scores.volumeVelocity = Math.max(0, Math.min(22, volBase + accelBonus));

  // ── 3. PRICE MULTIPLE (0-16) ─────────────────────────────────────────────
  // pump-sdk: 10.1x on BC alone, 142x to ATH.
  // Weight 24h change more than 5m spike (sustained > flash pump)
  // Negative price = real penalty (distribution signal)
  const sustainedMove = Math.max(p1h, p6h, p24h); // best sustained timeframe
  const flashMove = p5m;

  let priceScore;
  if      (sustainedMove >= 500) priceScore = 16;
  else if (sustainedMove >= 200) priceScore = 13;
  else if (sustainedMove >= 100) priceScore = 10;
  else if (sustainedMove >= 50)  priceScore = 7;
  else if (sustainedMove >= 20)  priceScore = 4;
  else if (sustainedMove >= 0)   priceScore = 2;
  else                           priceScore = 0; // negative = dump in progress

  // Small bonus if 5m is also positive (momentum continuing right now)
  if (flashMove > 5 && sustainedMove > 0) priceScore = Math.min(16, priceScore + 1);

  scores.priceMultiple = priceScore;

  // ── 4. BUY PRESSURE (0-12) ───────────────────────────────────────────────
  // pump-sdk's organic demand showed in consistent buy dominance.
  // This is the most real-time signal of whether traders are accumulating or exiting.
  let buyScore;
  if      (buyRatio >= 0.75) buyScore = 12;  // Overwhelmingly bullish
  else if (buyRatio >= 0.65) buyScore = 10;  // Strong buy pressure
  else if (buyRatio >= 0.55) buyScore = 7;   // Mild buy lean
  else if (buyRatio >= 0.45) buyScore = 4;   // Balanced — neutral
  else if (buyRatio >= 0.35) buyScore = 2;   // Sell lean — caution
  else                       buyScore = 0;   // Sell dominance — danger

  // Require minimum tx volume for buy pressure to matter
  if (totalTxns < 50) buyScore = Math.min(buyScore, 3);

  scores.buyPressure = buyScore;

  // ── 5. LIQUIDITY DEPTH (0-8) ─────────────────────────────────────────────
  // Committed liquidity after graduation = holders who aren't just flipping
  let liqScore;
  if      (liquidity >= 200000) liqScore = 8;
  else if (liquidity >= 100000) liqScore = 7;
  else if (liquidity >= 50000)  liqScore = 5;
  else if (liquidity >= 20000)  liqScore = 3;
  else if (liquidity >= 5000)   liqScore = 1;
  else                          liqScore = 0;

  scores.liquidityDepth = liqScore;

  // ── 6. TX FREQUENCY (0-12) ───────────────────────────────────────────────
  // pump-sdk: 100,371 txns in 48h = ~2,091/hr. High tx = real community, not bots.
  // Scale by age to normalise — a 1h old token with 500 txns is better than
  // a 24h old token with the same count.
  const effectiveHours = Math.max(1, Math.min(ageMins / 60, 24));
  const txPerHour = totalTxns / effectiveHours;

  let txScore;
  if      (txPerHour >= 2000) txScore = 12;  // pump-sdk tier
  else if (txPerHour >= 800)  txScore = 10;  // Very high
  else if (txPerHour >= 300)  txScore = 7;   // Strong
  else if (txPerHour >= 100)  txScore = 5;   // Moderate
  else if (txPerHour >= 30)   txScore = 3;   // Low
  else                        txScore = 1;

  scores.txFrequency = txScore;

  // ── 7. V/L EFFICIENCY (0-6) ──────────────────────────────────────────────
  // Volume-to-Liquidity ratio: the nichxbt flywheel creates massive V/L.
  // pump-sdk had extreme V/L (>100x). This signals thin liquidity being recycled
  // by high-conviction traders — the viral loop signature.
  // BUT: extremely high V/L (>50x) with low absolute liquidity = wash trading risk
  const vlRatio = liquidity > 0 ? vol24h / liquidity : 0;

  let vlScore;
  if      (vlRatio >= 50 && liquidity >= 20000) vlScore = 6;  // Exceptional
  else if (vlRatio >= 20 && liquidity >= 10000) vlScore = 5;  // Strong flywheel
  else if (vlRatio >= 10)                       vlScore = 4;  // Good engagement
  else if (vlRatio >= 5)                        vlScore = 2;  // Normal
  else if (vlRatio >= 1)                        vlScore = 1;  // Low
  else                                          vlScore = 0;

  scores.vlEfficiency = vlScore;

  // ── 8. SOCIAL / DEV NARRATIVE SIGNAL (0-6) ───────────────────────────────
  // pump-sdk worked because of a real dev narrative. These keywords signal that.
  // Expanded keyword list with stronger weighting for highest-conviction signals.
  const name     = (token.baseToken?.name   || '').toLowerCase();
  const symbol   = (token.baseToken?.symbol || '').toLowerCase();
  const combined = name + ' ' + symbol;

  const tier1 = ['sdk', 'mcp', 'agent', 'api', 'github', 'open source', 'opensrc'];
  const tier2 = ['dev', 'build', 'code', 'hack', 'fork', 'deploy', 'protocol', 'tool'];
  const tier3 = ['ai', 'bot', 'web3', 'defi', 'solana', 'pump', 'smart', 'contract'];

  const t1hits = tier1.filter(kw => combined.includes(kw)).length;
  const t2hits = tier2.filter(kw => combined.includes(kw)).length;
  const t3hits = tier3.filter(kw => combined.includes(kw)).length;

  let socialScore = 0;
  if      (t1hits >= 1) socialScore = 6;        // Tier 1 keyword = instant max
  else if (t2hits >= 2) socialScore = 5;        // Two tier-2 = strong dev signal
  else if (t2hits >= 1 && t3hits >= 1) socialScore = 4;
  else if (t2hits >= 1) socialScore = 3;
  else if (t3hits >= 2) socialScore = 2;
  else if (t3hits >= 1) socialScore = 1;

  scores.socialSignal = socialScore;

  // ── MCAP BONUS/PENALTY (applied after sum) ───────────────────────────────
  // Micro cap with high score = maximum upside opportunity.
  // Fully extended mcap with high score = late, high risk.
  // ── MCAP BONUS/PENALTY (applied after sum) ───────────────────────────────
  const rawTotal = Object.values(scores).reduce((a, b) => a + b, 0);

  let mcapModifier = 0;
  if      (mcap > 0 && mcap < 50000)        mcapModifier = 3;
  else if (mcap >= 50000 && mcap < 200000)   mcapModifier = 1;
  else if (mcap >= 500000 && mcap < 1500000) mcapModifier = -2;
  else if (mcap >= 1500000)                  mcapModifier = -5;

  // ── FRESHNESS DECAY — tokens age out of relevance ────────────────────────
  // A score-80 token from 8h ago is less interesting than score-65 from 15min ago.
  // Decay starts after 30min, reaches 0.4x multiplier at 8h (480min).
  // Formula: max(0.4, 1 - (ageMins / 480))
  const freshnessMultiplier = Math.max(0.4, 1 - (ageMins / 480));
  const adjustedRaw = (rawTotal + mcapModifier) * freshnessMultiplier;
  const total = Math.max(0, Math.min(100, Math.round(adjustedRaw)));

  // ── Grade ─────────────────────────────────────────────────────────────────
  let grade, recommendation;
  if      (total >= 78) { grade = 'S'; recommendation = 'STRONG FIT'; }
  else if (total >= 62) { grade = 'A'; recommendation = 'GOOD FIT'; }
  else if (total >= 46) { grade = 'B'; recommendation = 'MODERATE FIT'; }
  else if (total >= 30) { grade = 'C'; recommendation = 'WEAK FIT'; }
  else                  { grade = 'D'; recommendation = 'NO FIT'; }

  return { scores, total, grade, recommendation, mcapModifier, freshnessMultiplier };
}

// ─────────────────────────────────────────────────────────────────────────────
// SIGNAL TAGS — shown on each token card
// ─────────────────────────────────────────────────────────────────────────────
export function getSignalTags(token, scoreResult) {
  const tags = [];
  const { scores, mcapModifier } = scoreResult;

  const vol24h    = token.volume?.h24 || 0;
  const vol6h     = token.volume?.h6  || 0;
  const vol1h     = token.volume?.h1  || 0;
  const liquidity = token.liquidity?.usd || 0;
  const mcap      = token.marketCap || 0;
  const txns      = token.txns?.h24 || {};
  const totalTxns = (txns.buys || 0) + (txns.sells || 0);
  const buyRatio  = totalTxns > 0 ? (txns.buys || 0) / totalTxns : 0.5;
  const ageMins   = token.pairCreatedAt ? (Date.now() - token.pairCreatedAt) / 60000 : 9999;
  const hourlyAvg = vol6h > 0 ? vol6h / 6 : 0;
  const accel     = hourlyAvg > 0 ? vol1h / hourlyAvg : 1;
  const vlRatio   = liquidity > 0 ? vol24h / liquidity : 0;

  // Positive signals
  if (scores.graduationSpeed >= 15)  tags.push({ label: '⚡ Fast Grad',    type: 'positive' });
  if (scores.volumeVelocity  >= 16)  tags.push({ label: '📈 Vol Surge',    type: 'positive' });
  if (accel >= 2.0)                  tags.push({ label: '🔥 Accelerating', type: 'positive' });
  if (scores.priceMultiple   >= 10)  tags.push({ label: '🚀 Strong Move',  type: 'positive' });
  if (scores.buyPressure     >= 10)  tags.push({ label: '💚 Buy Dom',      type: 'positive' });
  if (scores.txFrequency     >= 10)  tags.push({ label: '⚙️ High TX',      type: 'positive' });
  if (scores.liquidityDepth  >= 7)   tags.push({ label: '💧 Deep Liq',     type: 'positive' });
  if (scores.socialSignal    >= 5)   tags.push({ label: '🛠 Dev Narrative', type: 'positive' });
  if (vlRatio >= 20)                 tags.push({ label: '🌀 V/L Flywheel', type: 'positive' });
  if (mcap > 0 && mcap < 50000)      tags.push({ label: '🟢 Micro Cap',    type: 'positive' });
  if (ageMins <= 30)                 tags.push({ label: '🆕 Just Graduated', type: 'positive' });

  // Warning signals
  if (vlRatio > 100 && liquidity < 10000) tags.push({ label: '⚠️ Thin Liq',    type: 'warning' });
  if (mcap >= 1000000)                    tags.push({ label: '⚠️ Extended',     type: 'warning' });
  if (accel < 0.4 && vol24h > 5000)       tags.push({ label: '📉 Vol Fading',   type: 'warning' });
  if (mcapModifier < 0)                   tags.push({ label: '⚠️ Late Stage',   type: 'warning' });

  // Negative signals
  if (buyRatio < 0.40)               tags.push({ label: '🔴 Sell Pressure', type: 'negative' });
  if (scores.priceMultiple === 0 &&
      (token.priceChange?.h24 || 0) < -20) tags.push({ label: '📉 Dumping',   type: 'negative' });

  return tags;
}

// ─────────────────────────────────────────────────────────────────────────────
// BUY SIGNAL — 7-condition convergence check for manual trade alerts
//
// Fires when real-time conditions align for a high-probability entry.
// Each condition is evaluated independently so you can see exactly what fired.
//
// SIGNAL LEVELS:
//   STRONG BUY  — 5+ of 7 conditions pass  → pulsing green alert on card
//   WATCH        — 4 of 7 conditions pass   → amber alert, monitor closely
//   null         — <4 conditions            → no alert shown
//
// CONDITIONS:
//   1. MOMENTUM SURGE   — vol1h > 2× the 6h hourly average (volume accelerating now)
//   2. BUY WALL         — buy pressure ≥ 65% in 24h txns (demand dominating)
//   3. PRICE BREAKOUT   — 5m change > +2% AND 1h change > 0% (momentum confirmed)
//   4. MICRO ENTRY      — mcap < $150K (still early, max upside room)
//   5. FRESH TOKEN      — age < 60 minutes (first wave, not echo)
//   6. LIQUID ENOUGH    — liquidity ≥ $8K (can enter and exit cleanly)
//   7. SCORE GATE       — overall strategy score ≥ 62 (A-grade minimum)
// ─────────────────────────────────────────────────────────────────────────────
export function getBuySignal(token, scoreResult) {
  const ageMins   = token.pairCreatedAt ? (Date.now() - token.pairCreatedAt) / 60000 : 9999;
  const vol6h     = token.volume?.h6 || 0;
  const vol1h     = token.volume?.h1 || 0;
  const liquidity = token.liquidity?.usd || 0;
  const mcap      = token.marketCap || 0;
  const txns      = token.txns?.h24 || {};
  const totalTxns = (txns.buys || 0) + (txns.sells || 0);
  const buyRatio  = totalTxns > 0 ? txns.buys / totalTxns : 0;
  const p5m       = token.priceChange?.m5 || 0;
  const p1h       = token.priceChange?.h1 || 0;
  const hourlyAvg = vol6h > 0 ? vol6h / 6 : 0;
  const accel     = hourlyAvg > 0 ? vol1h / hourlyAvg : 0;

  const conditions = [
    {
      id:     'momentum',
      label:  'Vol Surge',
      desc:   `Vol1h ${accel.toFixed(1)}× avg`,
      pass:   accel >= 2.0,
    },
    {
      id:     'buywall',
      label:  'Buy Wall',
      desc:   `${(buyRatio * 100).toFixed(0)}% buys`,
      pass:   buyRatio >= 0.65,
    },
    {
      id:     'breakout',
      label:  'Breakout',
      desc:   `5m ${p5m >= 0 ? '+' : ''}${p5m.toFixed(1)}% · 1h ${p1h >= 0 ? '+' : ''}${p1h.toFixed(1)}%`,
      pass:   p5m > 2 && p1h > 0,
    },
    {
      id:     'micro',
      label:  'Micro Cap',
      desc:   mcap > 0 ? `$${(mcap / 1000).toFixed(0)}K mcap` : 'mcap unknown',
      pass:   mcap > 0 && mcap < 150000,
    },
    {
      id:     'fresh',
      label:  'Fresh',
      desc:   ageMins < 9999 ? `${ageMins.toFixed(0)}m old` : 'age unknown',
      pass:   ageMins < 60,
    },
    {
      id:     'liquid',
      label:  'Liquid',
      desc:   `$${(liquidity / 1000).toFixed(1)}K liq`,
      pass:   liquidity >= 8000,
    },
    {
      id:     'score',
      label:  'A-Grade+',
      desc:   `Score ${scoreResult.total}/100`,
      pass:   scoreResult.total >= 62,
    },
  ];

  const passCount = conditions.filter(c => c.pass).length;

  let level = null;
  if (passCount >= 5) level = 'STRONG_BUY';
  else if (passCount === 4) level = 'WATCH';

  if (!level) return null;

  return {
    level,        // 'STRONG_BUY' | 'WATCH'
    passCount,    // how many of 7 fired
    conditions,   // full breakdown for tooltip/expand
    firedAt: Date.now(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// INTRADAY SIGNAL — purpose-built for 1.5x–4x same-day targets
//
// Unlike getBuySignal (7 conditions for swing), this is tuned for tokens
// in their first 20 minutes post-graduation where intraday moves of 50–300%
// happen in 15–60 minute windows.
//
// INTRA CONDITIONS (6 checks, needs 4+ to fire):
//   1. ULTRA FRESH    — age ≤ 20 minutes (first wave only)
//   2. 5M VOL BURST   — vol5m > $500 (real money flowing in right now)
//   3. 5M BUY SURGE   — 5m buys > 5m sells (immediate demand)
//   4. PRICE PUMPING  — 5m change > +3% (price moving up now)
//   5. MICRO ENTRY    — mcap < $100K (room for 3–10x)
//   6. MOMENTUM LIVE  — vol1h > 1.8× hourly average (building not fading)
//
// LEVELS:
//   INTRA_NOW  — 5 or 6 conditions → act within next 5–10 min window
//   INTRA_SOON — 4 conditions → conditions forming, watch closely
// ─────────────────────────────────────────────────────────────────────────────
export function getIntraSignal(token, scoreResult) {
  const ageMins   = token.pairCreatedAt ? (Date.now() - token.pairCreatedAt) / 60000 : 9999;
  const mcap      = token.marketCap || 0;
  const vol5m     = token.volume?.m5 || 0;
  const vol1h     = token.volume?.h1 || 0;
  const vol6h     = token.volume?.h6 || 0;
  const p5m       = token.priceChange?.m5 || 0;
  const txns5m    = token.txns?.m5 || {};
  const buys5m    = txns5m.buys  || 0;
  const sells5m   = txns5m.sells || 0;
  const hourlyAvg = vol6h > 0 ? vol6h / 6 : 0;
  const accel     = hourlyAvg > 0 ? vol1h / hourlyAvg : 0;

  // Score gate — only tokens with A+ grade can be intra targets
  if ((scoreResult?.total || 0) < 55) return null;

  const conditions = [
    {
      id:    'ultra_fresh',
      label: 'Ultra Fresh',
      desc:  ageMins < 9999 ? `${ageMins.toFixed(0)}m old` : 'age unknown',
      pass:  ageMins <= 20,
    },
    {
      id:    'vol5m_burst',
      label: '5m Vol Burst',
      desc:  `$${vol5m > 0 ? (vol5m).toFixed(0) : '0'} in 5m`,
      pass:  vol5m >= 500,
    },
    {
      id:    'buy_surge',
      label: '5m Buy Surge',
      desc:  buys5m + sells5m > 0 ? `${buys5m}B vs ${sells5m}S` : 'no data',
      pass:  buys5m > sells5m && buys5m + sells5m >= 3,
    },
    {
      id:    'price_pumping',
      label: 'Price Pumping',
      desc:  `5m ${p5m >= 0 ? '+' : ''}${p5m.toFixed(1)}%`,
      pass:  p5m >= 3,
    },
    {
      id:    'micro_entry',
      label: 'Micro Cap',
      desc:  mcap > 0 ? `$${(mcap / 1000).toFixed(0)}K` : 'unknown',
      pass:  mcap > 0 && mcap < 100000,
    },
    {
      id:    'momentum_live',
      label: 'Momentum Live',
      desc:  hourlyAvg > 0 ? `${accel.toFixed(1)}× avg` : 'building',
      pass:  accel >= 1.8 || (hourlyAvg === 0 && vol1h > 1000),
    },
  ];

  const passCount = conditions.filter(c => c.pass).length;

  let level = null;
  if (passCount >= 5)      level = 'INTRA_NOW';
  else if (passCount >= 4) level = 'INTRA_SOON';

  if (!level) return null;

  // Urgency score — higher = act faster
  const urgency = Math.min(100, Math.round(
    (passCount / 6) * 60 +
    Math.min(20, Math.max(0, 20 - ageMins)) +          // younger = more urgent
    Math.min(10, p5m > 0 ? Math.min(p5m, 10) : 0) +   // price momentum
    Math.min(10, accel > 0 ? Math.min(accel * 2, 10) : 0) // vol accel
  ));

  return {
    level,        // 'INTRA_NOW' | 'INTRA_SOON'
    passCount,
    conditions,
    urgency,      // 0–100
    firedAt: Date.now(),
  };
}

export function formatVolume(num) {
  if (!num) return '$0';
  if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`;
  if (num >= 1000)    return `$${(num / 1000).toFixed(1)}K`;
  return `$${num.toFixed(0)}`;
}

export function formatPrice(price) {
  if (!price) return '$0';
  if (price < 0.000001) return `$${price.toExponential(2)}`;
  if (price < 0.001)    return `$${price.toFixed(8)}`;
  if (price < 1)        return `$${price.toFixed(6)}`;
  return `$${price.toFixed(4)}`;
}

export function timeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60)    return `${seconds}s ago`;
  if (seconds < 3600)  return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function getMcapPhase(mcap) {
  if (!mcap || mcap === 0) return { phase: 'UNKNOWN', color: '#5a7a94', label: '?', emoji: '⚪', desc: 'Unknown' };
  if (mcap < 50000)    return { phase: 'MICRO',  color: '#00ff8c', label: '<$50K',      emoji: '🟢', desc: 'Pre-viral — max upside' };
  if (mcap < 200000)   return { phase: 'SMALL',  color: '#00d4ff', label: '$50K-200K',  emoji: '🔵', desc: 'Discovery — sweet spot' };
  if (mcap < 500000)   return { phase: 'MID',    color: '#ffd700', label: '$200K-500K', emoji: '🟡', desc: 'Momentum — building' };
  if (mcap < 1500000)  return { phase: 'LARGE',  color: '#ff8300', label: '$500K-1.5M', emoji: '🟠', desc: 'Peak retail — caution' };
  return                { phase: 'MEGA',   color: '#ff4444', label: '>$1.5M',     emoji: '🔴', desc: 'Distribution risk — exit zone' };
}
