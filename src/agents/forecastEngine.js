import { formatPrice, formatVolume } from '../utils/scoring';

// ─────────────────────────────────────────────────────────────────────────────
// AI FORECAST ENGINE — Pump/Dump Prediction Layer
// Uses multi-signal analysis + Groq LLM for probabilistic forecasts
// ─────────────────────────────────────────────────────────────────────────────

export const FORECAST_SYSTEM = `You are an elite memecoin price forecast engine specializing in Solana pump.fun tokens. 
You analyze on-chain data and provide STRUCTURED probabilistic forecasts. 

FORECAST FRAMEWORK:
1. PUMP signals: rising buy/sell ratio >65%, volume acceleration (h1 > h6/6), low mcap (<500K) with high momentum, fast graduation, strong narrative
2. DUMP signals: buy/sell ratio dropping <40%, volume deceleration, ATH achieved + momentum fading, mcap extended, sell walls forming
3. NEUTRAL/CONSOLIDATION: balanced buy/sell, stable volume, mid-cycle

MARKET CAP PUMP TARGETS (based on pump.fun graduation patterns):
- <$50K mcap: Early alpha zone — 5x-20x possible if narrative holds
- $50K-$200K: Momentum phase — 2x-5x targets, watch for 200K breakout
- $200K-$500K: Viral phase — can spike to $1M+ if volume stays
- $500K-$2M: Distribution risk — smart money may exit, 50% correction possible
- >$2M: Extended territory — high dump risk unless sustained volume

RESPONSE FORMAT (ALWAYS return valid JSON only, no markdown):
{
  "direction": "PUMP" | "DUMP" | "NEUTRAL",
  "confidence": 0-100,
  "timeframe": "15m" | "1h" | "4h" | "12h",
  "pumpTarget": { "mcap": number_usd, "priceMultiple": number, "probability": 0-100 } | null,
  "dumpTarget": { "drawdownPct": number, "triggerSignal": "string", "probability": 0-100 } | null,
  "keySignals": ["signal1", "signal2", "signal3"],
  "riskLevel": "LOW" | "MEDIUM" | "HIGH" | "EXTREME",
  "summary": "One punchy sentence, max 15 words",
  "nextCatalyst": "What to watch for next"
}

Return ONLY the JSON object. No text before or after.`;

export function buildForecastContext(token) {
  const txns = token.txns?.h24 || {};
  const totalTxns = (txns.buys || 0) + (txns.sells || 0);
  const buyRatio = totalTxns > 0 ? ((txns.buys / totalTxns) * 100).toFixed(1) : '50.0';
  const ageMins = token.pairCreatedAt ? Math.floor((Date.now() - token.pairCreatedAt) / 60000) : null;
  const vol1h = token.volume?.h1 || 0;
  const vol6h = token.volume?.h6 || 0;
  const volAcceleration = vol6h > 0 ? ((vol1h / (vol6h / 6)) * 100).toFixed(0) : '0';
  const mcap = token.marketCap || 0;
  const athGain = token._athGain || 0;
  const gainNow = token._gainSinceDetection || 0;
  const drawdownFromAth = athGain > 0 && gainNow < athGain
    ? (((gainNow - athGain) / (athGain + 100)) * 100).toFixed(1)
    : '0';

  return `FORECAST REQUEST for ${token.baseToken?.symbol}:

MARKET DATA:
- Current Price: ${formatPrice(parseFloat(token.priceUsd || 0))}
- Market Cap: ${formatVolume(mcap)} (${mcap < 50000 ? 'MICRO' : mcap < 200000 ? 'SMALL' : mcap < 500000 ? 'MID' : mcap < 2000000 ? 'LARGE' : 'MEGA'})
- Pair Age: ${ageMins != null ? ageMins + ' min' : 'unknown'}

PRICE ACTION:
- 5m: ${token.priceChange?.m5?.toFixed(1) || '0'}%
- 1h: ${token.priceChange?.h1?.toFixed(1) || '0'}%
- 6h: ${token.priceChange?.h6?.toFixed(1) || '0'}%
- 24h: ${token.priceChange?.h24?.toFixed(1) || '0'}%

VOLUME ANALYSIS:
- 1h Vol: ${formatVolume(vol1h)}
- 6h Vol: ${formatVolume(vol6h)}
- 24h Vol: ${formatVolume(token.volume?.h24)}
- Vol Acceleration vs avg: ${volAcceleration}% (100=normal, >150=accelerating)

TRANSACTION FLOW:
- Buys: ${txns.buys || 0} | Sells: ${txns.sells || 0}
- Buy Pressure: ${buyRatio}%
- Buy/Sell Trend: ${parseFloat(buyRatio) > 60 ? 'BULLISH' : parseFloat(buyRatio) < 40 ? 'BEARISH' : 'NEUTRAL'}

DETECTION TRACKER:
- ATH Gain from detect: +${athGain.toFixed(1)}%
- Current Gain from detect: +${gainNow.toFixed(1)}%
- Drawdown from ATH: ${drawdownFromAth}%

LIQUIDITY: ${formatVolume(token.liquidity?.usd)}
STRATEGY SCORE: ${token._score?.total}/100 (Grade: ${token._score?.grade})
SOCIAL SIGNAL: ${token._score?.scores?.socialSignal}/10

Provide pump/dump forecast as JSON.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// LOCAL HEURISTIC FORECAST (fallback when no API key)
// Pure algorithmic, no LLM needed
// ─────────────────────────────────────────────────────────────────────────────
export function computeHeuristicForecast(token) {
  const txns = token.txns?.h24 || {};
  const totalTxns = (txns.buys || 0) + (txns.sells || 0);
  const buyRatio = totalTxns > 0 ? (txns.buys / totalTxns) : 0.5;
  const vol1h = token.volume?.h1 || 0;
  const vol6h = token.volume?.h6 || 0;
  const volAccel = vol6h > 0 ? vol1h / (vol6h / 6) : 1;
  const mcap = token.marketCap || 0;
  const priceChange1h = token.priceChange?.h1 || 0;
  const priceChange5m = token.priceChange?.m5 || 0;
  const athGain = token._athGain || 0;
  const gainNow = token._gainSinceDetection || 0;
  const score = token._score?.total || 0;
  const drawdownFromAth = athGain > 0 ? (gainNow - athGain) / (athGain + 100) : 0;
  const ageMins = token.pairCreatedAt ? (Date.now() - token.pairCreatedAt) / 60000 : 9999;

  let pumpScore = 0;
  let dumpScore = 0;

  // Buy pressure signals
  if (buyRatio > 0.65) pumpScore += 25;
  else if (buyRatio > 0.55) pumpScore += 10;
  else if (buyRatio < 0.40) dumpScore += 30;
  else if (buyRatio < 0.45) dumpScore += 15;

  // Volume acceleration
  if (volAccel > 2.0) pumpScore += 20;
  else if (volAccel > 1.5) pumpScore += 10;
  else if (volAccel < 0.5) dumpScore += 20;
  else if (volAccel < 0.7) dumpScore += 10;

  // Price momentum
  if (priceChange5m > 5 && priceChange1h > 10) pumpScore += 15;
  else if (priceChange5m < -5 && priceChange1h < -10) dumpScore += 15;

  // Market cap stage
  if (mcap < 100000 && score > 50) pumpScore += 15; // micro cap with good score
  else if (mcap > 1500000) dumpScore += 20; // extended mcap
  else if (mcap > 800000) dumpScore += 10;

  // ATH drawdown risk
  if (drawdownFromAth < -0.20) dumpScore += 20;
  else if (drawdownFromAth < -0.10) dumpScore += 10;

  // Strategy score
  if (score >= 70) pumpScore += 15;
  else if (score >= 50) pumpScore += 8;
  else if (score < 30) dumpScore += 10;

  // Age consideration
  if (ageMins < 60) pumpScore += 10; // very fresh
  else if (ageMins > 720) dumpScore += 10; // 12h+ old

  const total = pumpScore + dumpScore;
  const pumpProb = total > 0 ? (pumpScore / total) : 0.5;

  let direction, confidence, timeframe;

  if (pumpScore > dumpScore * 1.5) {
    direction = 'PUMP';
    confidence = Math.min(85, 45 + pumpScore);
    timeframe = ageMins < 30 ? '1h' : ageMins < 120 ? '4h' : '12h';
  } else if (dumpScore > pumpScore * 1.5) {
    direction = 'DUMP';
    confidence = Math.min(85, 45 + dumpScore);
    timeframe = '1h';
  } else {
    direction = 'NEUTRAL';
    confidence = 40;
    timeframe = '4h';
  }

  // Pump target mcap
  let pumpTarget = null;
  if (direction === 'PUMP' || pumpScore > 20) {
    const multiplier = mcap < 50000 ? 8 : mcap < 200000 ? 4 : mcap < 500000 ? 2.5 : 1.5;
    pumpTarget = {
      mcap: Math.round(mcap * multiplier),
      priceMultiple: multiplier,
      probability: Math.round(pumpProb * confidence),
    };
  }

  // Dump target
  let dumpTarget = null;
  if (direction === 'DUMP' || dumpScore > 20) {
    const drawdown = buyRatio < 0.4 ? 45 : drawdownFromAth < -0.15 ? 35 : 25;
    dumpTarget = {
      drawdownPct: drawdown,
      triggerSignal: buyRatio < 0.4 ? 'Heavy sell pressure' : drawdownFromAth < -0.15 ? 'ATH rejection + fading momentum' : 'Volume deceleration',
      probability: Math.round((1 - pumpProb) * confidence),
    };
  }

  const signals = [];
  if (buyRatio > 0.6) signals.push(`Buy pressure ${(buyRatio * 100).toFixed(0)}% bullish`);
  if (buyRatio < 0.45) signals.push(`Sell dominance ${((1 - buyRatio) * 100).toFixed(0)}% bearish`);
  if (volAccel > 1.5) signals.push(`Volume +${((volAccel - 1) * 100).toFixed(0)}% above avg`);
  if (volAccel < 0.7) signals.push(`Volume fading ${((1 - volAccel) * 100).toFixed(0)}% below avg`);
  if (mcap < 100000) signals.push(`Micro cap — high upside potential`);
  if (mcap > 1000000) signals.push(`Extended mcap — distribution risk`);
  if (drawdownFromAth < -0.2) signals.push(`${Math.abs(drawdownFromAth * 100).toFixed(0)}% below ATH`);
  if (score >= 70) signals.push(`S-grade strategy fit`);
  if (ageMins < 30) signals.push(`Fresh graduation — early entry window`);

  const riskLevel = mcap > 1500000 ? 'EXTREME' : mcap > 800000 ? 'HIGH' : score < 40 ? 'HIGH' : score > 60 ? 'MEDIUM' : 'HIGH';

  const summaryMap = {
    PUMP: mcap < 100000 ? 'Micro cap momentum — early pump window open' : 'Buy pressure building, volume accelerating',
    DUMP: drawdownFromAth < -0.2 ? 'Fading from ATH — exit pressure mounting' : 'Sell domination — avoid or exit',
    NEUTRAL: 'Mixed signals — wait for clearer direction',
  };

  return {
    direction,
    confidence,
    timeframe,
    pumpTarget,
    dumpTarget,
    keySignals: signals.slice(0, 3),
    riskLevel,
    summary: summaryMap[direction],
    nextCatalyst: direction === 'PUMP'
      ? `Watch for vol1h > ${formatVolume(vol1h * 1.5)} to confirm`
      : direction === 'DUMP'
      ? `Monitor buy ratio — recovery above 55% = reversal`
      : `Vol spike or buy ratio >60% = entry signal`,
    _isHeuristic: true,
  };
}

export function parseForecastResponse(raw) {
  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return parsed;
  } catch {
    return null;
  }
}
