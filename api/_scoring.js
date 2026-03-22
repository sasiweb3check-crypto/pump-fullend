// ─────────────────────────────────────────────────────────────────────────────
// SHARED SCORING — used by Vercel serverless functions
// Duplicated here because Vercel api/ functions can't import from src/
// Keep in sync with src/utils/scoring.js
// ─────────────────────────────────────────────────────────────────────────────

const CUTOFF_48H    = 48 * 60 * 60 * 1000;
const MAX_MCAP      = 5_000_000;
const MIN_MCAP      = 1_000;
const MIN_VOL24H    = 500;
const MIN_LIQUIDITY = 1_000;
const VALID_DEX_IDS = new Set(['pumpswap', 'raydium', 'meteora', 'orca']);

function isValidPair(p) {
  if (p.chainId !== 'solana') return false;
  if (!VALID_DEX_IDS.has((p.dexId || '').toLowerCase())) return false;
  if (!p.priceUsd || parseFloat(p.priceUsd) <= 0) return false;
  if (!p.pairCreatedAt || p.pairCreatedAt < Date.now() - CUTOFF_48H) return false;
  const mcap = p.marketCap || p.fdv || 0;
  if (mcap > 0 && mcap < MIN_MCAP) return false;
  if (mcap > MAX_MCAP) return false;
  if ((p.volume?.h24 || 0) < MIN_VOL24H) return false;
  if ((p.liquidity?.usd || 0) < MIN_LIQUIDITY) return false;
  if (!p.baseToken?.address || !p.baseToken?.symbol) return false;
  return true;
}

function scoreToken(token) {
  const scores = {};
  const ageMins   = token.pairCreatedAt ? (Date.now() - token.pairCreatedAt) / 60000 : 9999;
  const vol24h    = token.volume?.h24 || 0;
  const vol6h     = token.volume?.h6  || 0;
  const vol1h     = token.volume?.h1  || 0;
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

  // 1. Graduation Speed (0-18)
  let speedBase;
  if      (ageMins <= 20)  speedBase = 18;
  else if (ageMins <= 30)  speedBase = 15;
  else if (ageMins <= 60)  speedBase = 11;
  else if (ageMins <= 120) speedBase = 7;
  else if (ageMins <= 360) speedBase = 3;
  else                     speedBase = 0;
  if (speedBase >= 11 && vol1h < 500) speedBase = Math.max(0, speedBase - 5);
  scores.graduationSpeed = speedBase;

  // 2. Volume Velocity (0-22)
  let volBase;
  if      (vol24h >= 500000) volBase = 16;
  else if (vol24h >= 200000) volBase = 13;
  else if (vol24h >= 100000) volBase = 10;
  else if (vol24h >= 50000)  volBase = 7;
  else if (vol24h >= 10000)  volBase = 4;
  else if (vol24h >= 2000)   volBase = 2;
  else                       volBase = 0;
  const hourlyAvg6h = vol6h > 0 ? vol6h / 6 : 0;
  const accel = hourlyAvg6h > 0 ? vol1h / hourlyAvg6h : 1;
  let accelBonus = 0;
  if      (accel >= 3.0) accelBonus = 6;
  else if (accel >= 2.0) accelBonus = 4;
  else if (accel >= 1.5) accelBonus = 2;
  else if (accel < 0.4)  accelBonus = -3;
  scores.volumeVelocity = Math.max(0, Math.min(22, volBase + accelBonus));

  // 3. Price Multiple (0-16)
  const sustainedMove = Math.max(p1h, p6h, p24h);
  let priceScore;
  if      (sustainedMove >= 500) priceScore = 16;
  else if (sustainedMove >= 200) priceScore = 13;
  else if (sustainedMove >= 100) priceScore = 10;
  else if (sustainedMove >= 50)  priceScore = 7;
  else if (sustainedMove >= 20)  priceScore = 4;
  else if (sustainedMove >= 0)   priceScore = 2;
  else                           priceScore = 0;
  if (p5m > 5 && sustainedMove > 0) priceScore = Math.min(16, priceScore + 1);
  scores.priceMultiple = priceScore;

  // 4. Buy Pressure (0-12)
  let buyScore;
  if      (buyRatio >= 0.75) buyScore = 12;
  else if (buyRatio >= 0.65) buyScore = 10;
  else if (buyRatio >= 0.55) buyScore = 7;
  else if (buyRatio >= 0.45) buyScore = 4;
  else if (buyRatio >= 0.35) buyScore = 2;
  else                       buyScore = 0;
  if (totalTxns < 50) buyScore = Math.min(buyScore, 3);
  scores.buyPressure = buyScore;

  // 5. Liquidity Depth (0-8)
  let liqScore;
  if      (liquidity >= 200000) liqScore = 8;
  else if (liquidity >= 100000) liqScore = 7;
  else if (liquidity >= 50000)  liqScore = 5;
  else if (liquidity >= 20000)  liqScore = 3;
  else if (liquidity >= 5000)   liqScore = 1;
  else                          liqScore = 0;
  scores.liquidityDepth = liqScore;

  // 6. TX Frequency (0-12)
  const effectiveHours = Math.max(1, Math.min(ageMins / 60, 24));
  const txPerHour = totalTxns / effectiveHours;
  let txScore;
  if      (txPerHour >= 2000) txScore = 12;
  else if (txPerHour >= 800)  txScore = 10;
  else if (txPerHour >= 300)  txScore = 7;
  else if (txPerHour >= 100)  txScore = 5;
  else if (txPerHour >= 30)   txScore = 3;
  else                        txScore = 1;
  scores.txFrequency = txScore;

  // 7. V/L Efficiency (0-6)
  const vlRatio = liquidity > 0 ? vol24h / liquidity : 0;
  let vlScore;
  if      (vlRatio >= 50 && liquidity >= 20000) vlScore = 6;
  else if (vlRatio >= 20 && liquidity >= 10000) vlScore = 5;
  else if (vlRatio >= 10)                       vlScore = 4;
  else if (vlRatio >= 5)                        vlScore = 2;
  else if (vlRatio >= 1)                        vlScore = 1;
  else                                          vlScore = 0;
  scores.vlEfficiency = vlScore;

  // 8. Social Signal (0-6)
  const name     = (token.baseToken?.name   || '').toLowerCase();
  const symbol   = (token.baseToken?.symbol || '').toLowerCase();
  const combined = name + ' ' + symbol;
  const tier1 = ['sdk','mcp','agent','api','github','open source','opensrc'];
  const tier2 = ['dev','build','code','hack','fork','deploy','protocol','tool'];
  const tier3 = ['ai','bot','web3','defi','solana','pump','smart','contract'];
  const t1hits = tier1.filter(kw => combined.includes(kw)).length;
  const t2hits = tier2.filter(kw => combined.includes(kw)).length;
  const t3hits = tier3.filter(kw => combined.includes(kw)).length;
  let socialScore = 0;
  if      (t1hits >= 1)                     socialScore = 6;
  else if (t2hits >= 2)                     socialScore = 5;
  else if (t2hits >= 1 && t3hits >= 1)      socialScore = 4;
  else if (t2hits >= 1)                     socialScore = 3;
  else if (t3hits >= 2)                     socialScore = 2;
  else if (t3hits >= 1)                     socialScore = 1;
  scores.socialSignal = socialScore;

  // ── 9. EARLY EXPLOSION INDEX (0-10) ──────────────────────────────────────
  // The $LARRY Signal: $22.5K MC · $81.8K 1h Vol · +577% 1h → 10x from call.
  // Fires ONLY for micro-MC (<$50K) tokens in the first 60 minutes.
  // Core insight: Vol/MC ratio >2.0 early = market pricing in a re-rating
  // before aggregator bots and CT pick it up. Four sub-signals:
  //   1. Vol/MC ratio     (0-6) — the explosive size mismatch
  //   2. Age tightness    (0-2) — earlier = more runway
  //   3. Buy confirmation (0-2, can be -2) — organic vs wash
  //   4. TX velocity      (0-2) — txns/min as holder momentum proxy
  // ─────────────────────────────────────────────────────────────────────────
  let eeiScore = 0;
  const eeiMcap      = token.marketCap || 0;
  const eeiFdv       = token.fdv || 0;
  const eeiBestMcFinal = (eeiMcap > 0 && eeiFdv > 0)
    ? Math.min(eeiMcap, eeiFdv)
    : (eeiMcap || eeiFdv);

  if (eeiBestMcFinal > 0 && eeiBestMcFinal < 50000 && ageMins <= 60) {
    const vol1h_eei  = token.volume?.h1  || 0;
    const vol24h_eei = token.volume?.h24 || 0;
    const volMcRatio = vol1h_eei > 0
      ? vol1h_eei  / eeiBestMcFinal
      : vol24h_eei / eeiBestMcFinal;

    let volMcBase = 0;
    if      (volMcRatio >= 5.0) volMcBase = 6;
    else if (volMcRatio >= 3.0) volMcBase = 5; // $LARRY benchmark ~3.6x
    else if (volMcRatio >= 2.0) volMcBase = 4;
    else if (volMcRatio >= 1.0) volMcBase = 2;
    else if (volMcRatio >= 0.5) volMcBase = 1;

    let ageTightnessBonus = 0;
    if      (ageMins <= 10) ageTightnessBonus = 2;
    else if (ageMins <= 20) ageTightnessBonus = 1;

    let eeiByPressBonus = 0;
    if      (buyRatio >= 0.70) eeiByPressBonus = 2;
    else if (buyRatio >= 0.60) eeiByPressBonus = 1;
    else if (buyRatio < 0.45)  eeiByPressBonus = -2;

    const txnsPerMin = ageMins > 0 ? totalTxns / ageMins : 0;
    let txVelocityBonus = 0;
    if      (txnsPerMin >= 20) txVelocityBonus = 2; // $LARRY ~18 txns/min
    else if (txnsPerMin >= 10) txVelocityBonus = 1;

    eeiScore = Math.max(0, Math.min(10, volMcBase + ageTightnessBonus + eeiByPressBonus + txVelocityBonus));
  }
  scores.earlyExplosionIndex = eeiScore;

  // Mcap modifier + freshness
  const rawTotal = Object.values(scores).reduce((a, b) => a + b, 0);
  let mcapModifier = 0;
  if      (mcap > 0 && mcap < 50000)        mcapModifier = 3;
  else if (mcap >= 50000 && mcap < 200000)   mcapModifier = 1;
  else if (mcap >= 500000 && mcap < 1500000) mcapModifier = -2;
  else if (mcap >= 1500000)                  mcapModifier = -5;
  const freshnessMultiplier = Math.max(0.4, 1 - (ageMins / 480));
  const total = Math.max(0, Math.min(100, Math.round((rawTotal + mcapModifier) * freshnessMultiplier)));

  let grade, recommendation;
  if      (total >= 78) { grade = 'S'; recommendation = 'STRONG FIT'; }
  else if (total >= 62) { grade = 'A'; recommendation = 'GOOD FIT'; }
  else if (total >= 46) { grade = 'B'; recommendation = 'MODERATE FIT'; }
  else if (total >= 30) { grade = 'C'; recommendation = 'WEAK FIT'; }
  else                  { grade = 'D'; recommendation = 'NO FIT'; }

  return { scores, total, grade, recommendation, mcapModifier, freshnessMultiplier };
}

module.exports = { isValidPair, scoreToken };
