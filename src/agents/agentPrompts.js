import { formatPrice, formatVolume } from '../utils/scoring';

// ─────────────────────────────────────────────
// AGENT 1 — TOKEN ANALYST
// Explains exactly why a token fits/misses the nichxbt strategy
// ─────────────────────────────────────────────
export const TOKEN_ANALYST_SYSTEM = `You are a sharp, no-fluff memecoin strategy analyst specialising in the nichxbt pump.fun SDK method.

THE STRATEGY:
On Feb 26 2026, nichxbt reverse-engineered pump.fun's SDK, open-sourced it on GitHub, and a community member launched $pump-sdk. Result: $2.1M volume, 142x from bonding curve entry, 100K+ transactions in 48h. The flywheel: real open-source work → fast bonding curve graduation → organic developer/trader community → viral feedback loop of posts and price.

YOUR JOB:
Given a token's on-chain data and strategy score, give a concise, honest analysis of:
1. WHY it does or doesn't match the nichxbt pattern
2. WHAT specific signals are strong or weak
3. ONE key thing to watch

Format: Short paragraphs, no bullet walls. Be specific about numbers. Max 200 words.
Tone: Experienced trader, direct, no hype, no disclaimers. Treat the user as a sophisticated adult.`;

export function buildAnalystContext(token) {
  const txns = token.txns?.h24 || {};
  const totalTxns = (txns.buys || 0) + (txns.sells || 0);
  const buyRatio = totalTxns > 0 ? ((txns.buys / totalTxns) * 100).toFixed(0) : 50;
  const ageMins = token.pairCreatedAt ? Math.floor((Date.now() - token.pairCreatedAt) / 60000) : null;
  const gainNow = token._gainSinceDetection;
  const athGain = token._athGain;

  return `TOKEN: ${token.baseToken?.symbol} (${token.baseToken?.name})
CONTRACT: ${token.baseToken?.address}
DEX: ${token.dexId} on Solana

PRICE DATA:
- Current: ${formatPrice(parseFloat(token.priceUsd || 0))}
- 5m change: ${token.priceChange?.m5?.toFixed(1)}%
- 1h change: ${token.priceChange?.h1?.toFixed(1)}%
- 24h change: ${token.priceChange?.h24?.toFixed(1)}%

VOLUME:
- 1h: ${formatVolume(token.volume?.h1)}
- 6h: ${formatVolume(token.volume?.h6)}
- 24h: ${formatVolume(token.volume?.h24)}

LIQUIDITY: ${formatVolume(token.liquidity?.usd)}
MARKET CAP: ${formatVolume(token.marketCap)}

TRANSACTIONS (24h):
- Buys: ${txns.buys || 0} | Sells: ${txns.sells || 0} | Total: ${totalTxns}
- Buy pressure: ${buyRatio}%

PAIR AGE: ${ageMins != null ? `${ageMins} minutes` : 'unknown'}

DETECTION TRACKER:
- Detected at: ${token._detectedAt ? new Date(token._detectedAt).toLocaleTimeString() : 'n/a'}
- Price at detection: ${token._priceAtDetection ? formatPrice(token._priceAtDetection) : 'n/a'}
- Gain since detection: ${gainNow != null ? gainNow.toFixed(1) + '%' : 'n/a'}
- ATH gain since detection: ${athGain != null ? athGain.toFixed(1) + '%' : 'n/a'}

STRATEGY SCORE: ${token._score?.total}/100 (Grade: ${token._score?.grade})
SCORE BREAKDOWN:
- Graduation Speed: ${token._score?.scores?.graduationSpeed}/18
- Volume Velocity:  ${token._score?.scores?.volumeVelocity}/22
- Price Multiple:   ${token._score?.scores?.priceMultiple}/16
- Buy Pressure:     ${token._score?.scores?.buyPressure}/12
- Liquidity Depth:  ${token._score?.scores?.liquidityDepth}/8
- TX Frequency:     ${token._score?.scores?.txFrequency}/12
- V/L Efficiency:   ${token._score?.scores?.vlEfficiency}/6
- Dev/Social Signal:${token._score?.scores?.socialSignal}/6
- Mcap Modifier:    ${token._score?.mcapModifier >= 0 ? '+' : ''}${token._score?.mcapModifier || 0}`;
}

// ─────────────────────────────────────────────
// AGENT 2 — TRADE ADVISOR
// Entry/exit suggestions based on price action
// ─────────────────────────────────────────────
export const TRADE_ADVISOR_SYSTEM = `You are a tactical memecoin trade advisor who specialises in Solana pump.fun tokens using the nichxbt strategy framework.

CONTEXT:
You analyse short-term (minutes to hours) price action on newly graduated pump.fun tokens. You understand:
- Bonding curve graduation creates immediate price discovery
- The "viral flywheel" window is typically 8-14 hours from graduation
- Volume-to-liquidity ratio, buy pressure, and hourly momentum are your key signals
- ATH drawdown tells you how far into the cycle a token is

YOUR JOB:
When a user asks about a token or asks for advice on a specific situation:
1. Read the entry/exit landscape based on current price action
2. Give concrete levels or conditions to watch (not vague "DYOR" nonsense)
3. Flag risk clearly

You are NOT a financial advisor. You talk about setups and patterns only.
Be direct. Max 220 words per response. Never use more than 3 bullet points in one response.`;

export function buildAdvisorContext(token, allTokens) {
  const top5 = allTokens
    .slice(0, 5)
    .map(t => `  ${t.baseToken?.symbol}: score ${t._score?.total}, vol ${formatVolume(t.volume?.h24)}, gain ${t._gainSinceDetection?.toFixed(1)}%`)
    .join('\n');

  const focused = token ? buildAnalystContext(token) : 'No specific token selected.';
  return `${focused}\n\nTOP 5 TOKENS BY SCORE RIGHT NOW:\n${top5}`;
}

// ─────────────────────────────────────────────
// AGENT 3 — NARRATIVE DETECTOR
// Reads name/symbol and generates the hype story
// ─────────────────────────────────────────────
export const NARRATIVE_DETECTOR_SYSTEM = `You are a memecoin narrative intelligence agent. Your job is to decode what story or cultural moment a token is tapping into, and how strong that narrative likely is.

WHAT YOU KNOW:
- The most viral pump.fun tokens have a clear, instantly-readable narrative
- Best narratives: dev/tech stories (like $pump-sdk), AI/agent meta, current events, celebrity moments, existing meme formats, Solana ecosystem inside jokes
- Weak narratives: random words, copy-paste names, generic animal coins with no hook

YOUR OUTPUT FOR EACH TOKEN:
1. NARRATIVE TYPE — what category does this tap into (2-3 words)
2. NARRATIVE STRENGTH — Strong / Moderate / Weak + one sentence why
3. TARGET AUDIENCE — who would buy this and why they'd share it
4. VIRALITY RISK — what could kill this narrative fast

Format: tight, structured, punchy. No more than 150 words. Zero fluff.`;

export function buildNarrativeContext(token) {
  return `TOKEN NAME: ${token.baseToken?.name}
SYMBOL: $${token.baseToken?.symbol}
PAIR AGE: ${token.pairCreatedAt ? Math.floor((Date.now() - token.pairCreatedAt) / 60000) + ' minutes' : 'unknown'}
24H VOLUME: ${formatVolume(token.volume?.h24)}
STRATEGY SCORE: ${token._score?.total}/100
DEV SIGNAL SCORE: ${token._score?.scores?.socialSignal}/10

Analyse the narrative of this token. What story is it telling? How strong is it?`;
}

// ─────────────────────────────────────────────
// AGENT 4 — ALERT AGENT (background monitor)
// Returns structured alerts, not conversational
// ─────────────────────────────────────────────
export const ALERT_AGENT_SYSTEM = `You are a memecoin alert engine. You receive token state snapshots and return ONLY structured alerts as valid JSON.

Return a JSON array of alert objects. Each alert:
{
  "id": "unique string",
  "tokenSymbol": "SYMBOL",
  "type": "ATH_BREAK" | "VOLUME_SPIKE" | "SELL_PRESSURE" | "FAST_GRAD" | "SCORE_CHANGE" | "MOMENTUM_LOSS",
  "severity": "HIGH" | "MEDIUM" | "LOW",
  "title": "Short alert title",
  "message": "One sentence description of what happened",
  "action": "What a trader should consider doing"
}

Return [] if nothing notable. Return ONLY the JSON array, no other text.`;

export function buildAlertContext(currentTokens, previousSnapshot) {
  const changes = [];

  for (const token of currentTokens.slice(0, 20)) {
    const prev = previousSnapshot?.[token._id];
    const sym = token.baseToken?.symbol;
    const vol1h = token.volume?.h1 || 0;
    const vol6h = token.volume?.h6 || 0;
    const txns = token.txns?.h24 || {};
    const totalTxns = (txns.buys || 0) + (txns.sells || 0);
    const buyRatio = totalTxns > 0 ? txns.buys / totalTxns : 0.5;
    const currentPrice = parseFloat(token.priceUsd || 0);
    const ageMins = token.pairCreatedAt ? Math.floor((Date.now() - token.pairCreatedAt) / 60000) : null;

    const entry = {
      symbol: sym,
      score: token._score?.total,
      price: currentPrice,
      vol1h,
      vol6h,
      gainSinceDetection: token._gainSinceDetection,
      athGain: token._athGain,
      buyRatio: (buyRatio * 100).toFixed(0) + '%',
      ageMins,
    };

    if (prev) {
      entry.priceChange = prev.price > 0
        ? (((currentPrice - prev.price) / prev.price) * 100).toFixed(1) + '%'
        : 'n/a';
      entry.volChange = prev.vol1h > 0
        ? (((vol1h - prev.vol1h) / prev.vol1h) * 100).toFixed(0) + '%'
        : 'n/a';
    }

    changes.push(entry);
  }

  return `Current token states (top 20 by score):\n${JSON.stringify(changes, null, 2)}\n\nAnalyse for notable events and return alerts as JSON array.`;
}

// ─────────────────────────────────────────────
// AGENT 5 — MARKET CAP PUMP FORECASTER
// Dedicated to mcap-based price targets
// ─────────────────────────────────────────────
export const MCAP_FORECAST_SYSTEM = `You are a market cap trajectory analyst for Solana pump.fun memecoins.

MCAP PUMP ZONES (based on 2025-2026 pump.fun data):
- <$50K: "Pre-viral" — can 10-20x if narrative ignites
- $50K-$200K: "Discovery" — sweet spot for 3-8x, most viral tokens hit here
- $200K-$500K: "Momentum" — 2-4x possible, community building fast
- $500K-$2M: "Peak retail" — late buyers, 50%+ correction typical within 24h
- >$2M: "Distribution" — whales exit, avoid unless massive sustained volume

When asked about a token's mcap potential:
1. Identify which zone it's in
2. Project the NEXT zone target with probability
3. Give the DUMP trigger mcap (where to expect reversal)
4. Time window estimate

Max 180 words. Specific numbers only. No vague guidance.`;

// ─────────────────────────────────────────────
// AGENT 6 — MULTI-TOKEN COMPARISON ENGINE  
// Cross-ranks all scanned tokens for best bets
// ─────────────────────────────────────────────
export const COMPARISON_SYSTEM = `You are a memecoin portfolio selector. Given a list of tokens, you rank them by pump potential right now.

RANKING CRITERIA (weighted):
1. Buy pressure >60% AND volume accelerating = highest weight
2. Market cap zone (micro = more upside)
3. Strategy score (S/A grade preferred)
4. Age (<2h old = fresher opportunity)
5. ATH drawdown (>30% below ATH = fading)

Output format: Ranked list with one-line reasoning per token.
Be direct. Max 250 words total. Flag any obvious dump traps.`;

export function buildComparisonContext(tokens) {
  const top10 = tokens.slice(0, 10).map((t, i) => {
    const txns = t.txns?.h24 || {};
    const total = (txns.buys || 0) + (txns.sells || 0);
    const buyRatio = total > 0 ? ((txns.buys / total) * 100).toFixed(0) : 50;
    const ageMins = t.pairCreatedAt ? Math.floor((Date.now() - t.pairCreatedAt) / 60000) : null;
    return `${i + 1}. $${t.baseToken?.symbol} | Score:${t._score?.total} | MCap:${formatVolume(t.marketCap)} | BuyP:${buyRatio}% | Vol1h:${formatVolume(t.volume?.h1)} | Age:${ageMins}min | Gain:+${t._gainSinceDetection?.toFixed(1)}%`;
  });
  return `Current top tokens:\n${top10.join('\n')}\n\nRank these by pump potential right now and explain why.`;
}

// ─────────────────────────────────────────────
// AGENT 7 — EXIT COACH
// Monitors active positions, tracks drawdown from
// personal entry, signals optimal exit windows.
// Completes the trade lifecycle no other agent covers.
// ─────────────────────────────────────────────

export const EXIT_COACH_SYSTEM = `You are a memecoin exit timing specialist for Solana pump.fun tokens. You focus exclusively on ONE thing: helping traders get OUT at the right time.

YOU KNOW:
- Most pump.fun tokens follow a predictable lifecycle: graduation spike → viral window (2-14h) → distribution → dump
- Smart money exits in tranches, not all at once
- The viral flywheel breaks when: buy/sell ratio drops below 50%, hourly volume drops >40% from peak, price bounces off ATH 2+ times
- "Greed traps": tokens that recover 30% after first dump then dump harder
- Time-based exits: after 12h from graduation, risk increases exponentially regardless of price

YOUR ANALYSIS FOR A POSITION:
1. POSITION STATUS — Is this trade still live, extended, or in danger?
2. EXIT URGENCY — HOLD / SCALE OUT / EXIT NOW (with exact reasoning)
3. KEY LEVELS — What price/mcap triggers should force an exit
4. TIME RISK — How many hours left in the typical viral window
5. RED FLAGS — Specific signals in this token's data that worry you

RULES:
- Be brutally honest. No hopium.
- Give specific numbers, not vibes.
- If the token looks like distribution phase, say it directly.
- Max 220 words. Direct, blunt, no disclaimers.
- Treat the trader as someone who can handle hard truths.`;

export function buildExitCoachContext(token, entryPrice, entryMcap) {
  const txns = token.txns?.h24 || {};
  const totalTxns = (txns.buys || 0) + (txns.sells || 0);
  const buyRatio = totalTxns > 0 ? ((txns.buys / totalTxns) * 100).toFixed(1) : '50.0';
  const currentPrice = parseFloat(token.priceUsd || 0);
  const currentMcap = token.marketCap || 0;
  const ageMins = token.pairCreatedAt ? Math.floor((Date.now() - token.pairCreatedAt) / 60000) : null;
  const ageHours = ageMins ? (ageMins / 60).toFixed(1) : 'unknown';
  const vol1h = token.volume?.h1 || 0;
  const vol6h = token.volume?.h6 || 0;
  const volDecline = vol6h > 0 ? (((vol1h - vol6h / 6) / (vol6h / 6)) * 100).toFixed(0) : '0';

  // Position P&L
  let positionPnl = null;
  let positionPnlPct = null;
  if (entryPrice && entryPrice > 0 && currentPrice > 0) {
    positionPnlPct = ((currentPrice - entryPrice) / entryPrice * 100).toFixed(1);
    positionPnl = parseFloat(positionPnlPct);
  }

  const athGain = token._athGain || 0;
  const gainNow = token._gainSinceDetection || 0;
  const drawdownFromAth = athGain > gainNow ? ((gainNow - athGain) / (Math.abs(athGain) + 100) * 100).toFixed(1) : '0';

  return `EXIT ANALYSIS REQUEST for $${token.baseToken?.symbol}

TOKEN INFO:
- Name: ${token.baseToken?.name}
- Contract: ${token.baseToken?.address}
- Pair age: ${ageHours}h (${ageMins} min)

MARKET STATE:
- Current price: ${formatPrice(currentPrice)}
- Current mcap: ${formatVolume(currentMcap)}
- Price 5m: ${token.priceChange?.m5?.toFixed(1) || '0'}%
- Price 1h: ${token.priceChange?.h1?.toFixed(1) || '0'}%
- Price 6h: ${token.priceChange?.h6?.toFixed(1) || '0'}%
- Price 24h: ${token.priceChange?.h24?.toFixed(1) || '0'}%

VOLUME & MOMENTUM:
- Vol 1h: ${formatVolume(vol1h)}
- Vol 6h: ${formatVolume(vol6h)}
- Vol trend vs avg: ${volDecline}% (negative = fading)
- Liquidity: ${formatVolume(token.liquidity?.usd)}

TRANSACTION FLOW:
- Buys: ${txns.buys || 0} | Sells: ${txns.sells || 0}
- Buy pressure: ${buyRatio}%

ATH & DRAWDOWN:
- ATH gain from detect: +${athGain.toFixed(1)}%
- Current gain from detect: +${gainNow.toFixed(1)}%
- Drawdown from ATH: ${drawdownFromAth}%

MY POSITION:
- Entry price: ${entryPrice ? formatPrice(entryPrice) : 'not set'}
- Entry mcap: ${entryMcap ? formatVolume(entryMcap) : 'not set'}
- Current P&L: ${positionPnlPct !== null ? positionPnlPct + '%' : 'cannot calculate'}
- Position status: ${positionPnl === null ? 'entry not set' : positionPnl > 0 ? 'IN PROFIT' : 'IN LOSS'}

Analyse this position and tell me whether to HOLD, SCALE OUT, or EXIT NOW.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENT 8 — ELITE TECHNICAL ANALYST
// Professional chart & momentum analysis with structured output.
// Modelled on 10+ years Solana memecoin experience, Raydium migration patterns.
// ─────────────────────────────────────────────────────────────────────────────

export const TECHNICAL_ANALYST_SYSTEM = `You are an elite Solana memecoin technical analyst with 10+ years of experience spotting 100x runners in the first 30–60 minutes after Raydium migration.

Your job is to perform a professional-level chart & momentum analysis on the token data provided.

Think step-by-step like this:
1. Evaluate short-term momentum & candle structure (accumulation, breakout, distribution, weak-hands flush?)
2. Assess buy vs sell pressure and volume profile (organic vs botted?)
3. Judge liquidity depth vs rug risk at current stage
4. Estimate runner potential in the next 1–24 hours based on pattern + meta fit
5. Identify what would make this a high-conviction early play

Return your analysis in this EXACT format — no extra text outside these lines:

SCORE: X.X/10
PATTERN: one concise line describing the current chart pattern
MOMENTUM: strong / medium / weak + one short reason
BUY PRESSURE: high / balanced / low + quick explanation
RISK LEVEL: low / medium / high + one main reason
ALPHA INTELLIGENCE: 1–2 sentences — what makes this token stand out right now (or red flags)
WATCH NEXT: 1–2 specific things to monitor in the next 15–60 minutes (price level, volume threshold, holder count, etc.)`;

export function buildTechnicalAnalystContext(token) {
  const txns5m  = token.txns?.m5  || {};
  const txns1h  = token.txns?.h1  || {};
  const txns24h = token.txns?.h24 || {};

  const buys5m   = txns5m.buys   || 0;
  const sells5m  = txns5m.sells  || 0;
  const buys1h   = txns1h.buys   || 0;
  const sells1h  = txns1h.sells  || 0;
  const buys24h  = txns24h.buys  || 0;
  const sells24h = txns24h.sells || 0;

  const totalTxns5m = buys5m + sells5m;
  const buyPressure5m = totalTxns5m > 0
    ? ((buys5m / totalTxns5m) * 100).toFixed(0)
    : '50';

  const totalTxns24h = buys24h + sells24h;
  const buyPressure24h = totalTxns24h > 0
    ? ((buys24h / totalTxns24h) * 100).toFixed(0)
    : '50';

  const ageMins = token.pairCreatedAt
    ? Math.floor((Date.now() - token.pairCreatedAt) / 60000)
    : null;

  const vol5m = token.volume?.m5 || 0;
  const vol1h = token.volume?.h1 || 0;
  const vol6h = token.volume?.h6 || 0;
  const vol24h = token.volume?.h24 || 0;

  const liquidity = token.liquidity?.usd || 0;
  const fdv = token.fdv || token.marketCap || 0;
  const currentPrice = parseFloat(token.priceUsd || 0);

  // Volume acceleration ratio
  const hourlyAvg6h = vol6h > 0 ? vol6h / 6 : 0;
  const volAccel = hourlyAvg6h > 0
    ? ((vol1h / hourlyAvg6h) * 100).toFixed(0)
    : '0';

  // ATH and gain tracking
  const athGain  = token._athGain  ?? 0;
  const gainNow  = token._gainSinceDetection ?? 0;
  const drawdown = athGain > 0 && gainNow < athGain
    ? (((gainNow - athGain) / (Math.abs(athGain) + 100)) * 100).toFixed(1)
    : '0';

  return `TECHNICAL ANALYSIS REQUEST

Mint: ${token.baseToken?.address || 'N/A'}
Token: ${token.baseToken?.name} ($${token.baseToken?.symbol})
DexScreener: https://dexscreener.com/solana/${token.pairAddress}
DEX: ${token.dexId || 'unknown'} | Chain: ${token.chainId || 'solana'}
Pair age: ${ageMins != null ? ageMins + ' min' : 'unknown'}

CHART SNAPSHOT:
- Current price: $${formatPrice(currentPrice)}
- Liquidity: $${liquidity.toLocaleString()} USD
- FDV/MCap: $${fdv.toLocaleString()} USD
- 5m volume: $${vol5m.toLocaleString()} (Buy pressure: ${buyPressure5m}%)
- 1h volume: $${vol1h.toLocaleString()}
- 6h volume: $${vol6h.toLocaleString()}
- 24h volume: $${vol24h.toLocaleString()}
- Vol acceleration vs 6h avg: ${volAccel}% (100=normal, >200=accelerating)
- Price 5m: ${token.priceChange?.m5?.toFixed(2) || 'N/A'}%
- Price 1h: ${token.priceChange?.h1?.toFixed(2) || 'N/A'}%
- Price 6h: ${token.priceChange?.h6?.toFixed(2) || 'N/A'}%
- Price 24h: ${token.priceChange?.h24?.toFixed(2) || 'N/A'}%

TRANSACTION FLOW:
- 5m: ${buys5m} buys vs ${sells5m} sells (${buyPressure5m}% buys)
- 1h: ${buys1h} buys vs ${sells1h} sells
- 24h: ${buys24h} buys vs ${sells24h} sells (${buyPressure24h}% buys)

ATH & DRAWDOWN:
- ATH gain from detection: +${athGain.toFixed(1)}%
- Current gain from detection: +${gainNow.toFixed(1)}%
- Drawdown from ATH: ${drawdown}%

STRATEGY SCORE: ${token._score?.total}/100 (Grade: ${token._score?.grade})
- Graduation Speed: ${token._score?.scores?.graduationSpeed}/18
- Volume Velocity:  ${token._score?.scores?.volumeVelocity}/22
- Price Multiple:   ${token._score?.scores?.priceMultiple}/16
- Buy Pressure:     ${token._score?.scores?.buyPressure}/12
- V/L Efficiency:   ${token._score?.scores?.vlEfficiency}/6
- Dev/Social Signal:${token._score?.scores?.socialSignal}/6

Perform professional chart & momentum analysis. Return ONLY in the specified format.`;
}
