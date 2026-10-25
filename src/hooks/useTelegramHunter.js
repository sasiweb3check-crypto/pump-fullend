import { useState, useCallback, useRef } from 'react';
import { scoreToken } from '../utils/scoring';
import { callGroq } from '../agents/groq';

// ─────────────────────────────────────────────────────────────────────────────
// TELEGRAM ALPHA HUNTER
//
// Flow:
//   1. User pastes raw Telegram message (or types a CA directly)
//   2. Regex extracts all valid Solana CAs from the text
//   3. Each CA is fetched from DexScreener for live on-chain data
//   4. Full 8-signal scoring runs on the fetched pair data
//   5. AI (Groq) provides a structured TRACK / SKIP / WATCH-ONLY verdict
//   6. TRACK results can be added to watchlist with one click
//
// Solana CA validation:
//   - Base58 characters only: 1-9 A-H J-N P-Z a-k m-z (no 0, O, I, l)
//   - Exactly 32–44 characters
// ─────────────────────────────────────────────────────────────────────────────

const DEXSCREENER_BASE  = 'https://api.dexscreener.com';
const HUNT_HISTORY_KEY  = 'pumpsdk_hunt_history';
const MAX_HISTORY       = 50;

// Solana CA regex — base58, 32-44 chars
const SOLANA_CA_REGEX = /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/g;

// Known non-token addresses to skip (common SOL addresses, program IDs etc.)
const KNOWN_NON_TOKENS = new Set([
  'So11111111111111111111111111111111111111112',  // Wrapped SOL
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  '11111111111111111111111111111111',              // System program
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Token program
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bRS', // ATA program
]);

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HUNT_HISTORY_KEY) || '[]'); } catch { return []; }
}
function saveHistory(items) {
  try { localStorage.setItem(HUNT_HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY))); } catch {}
}

// ── Extract CAs from raw text ─────────────────────────────────────────────────
function extractCAs(text) {
  const matches = [...text.matchAll(SOLANA_CA_REGEX)].map(m => m[1]);
  // Deduplicate + filter known non-tokens
  return [...new Set(matches)].filter(ca => !KNOWN_NON_TOKENS.has(ca));
}

// ── Extract group name from message context ────────────────────────────────────
function extractGroupName(text) {
  // Try to find @username or "From: GroupName" patterns
  const atMatch   = text.match(/@([A-Za-z0-9_]{3,32})/);
  const fromMatch = text.match(/(?:from|group|channel)[:\s]+([^\n\r,]+)/i);
  if (atMatch)   return '@' + atMatch[1];
  if (fromMatch) return fromMatch[1].trim().slice(0, 40);
  return 'Unknown';
}

// ── Fetch best pair for a CA from DexScreener ────────────────────────────────
async function fetchPairForCA(ca) {
  try {
    const res  = await fetch(`${DEXSCREENER_BASE}/latest/dex/tokens/${ca}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const pairs = (data.pairs || []).filter(p => p.chainId === 'solana');
    if (!pairs.length) return null;

    // Prefer raydium/pumpswap, then highest liquidity
    const sorted = [...pairs].sort((a, b) => {
      const dexPriority = (d) => {
        const id = (d.dexId || '').toLowerCase();
        if (id === 'raydium')   return 3;
        if (id === 'pumpswap')  return 2;
        if (id === 'meteora')   return 1;
        return 0;
      };
      const dp = dexPriority(b) - dexPriority(a);
      if (dp !== 0) return dp;
      return (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0);
    });
    return sorted[0];
  } catch { return null; }
}

// ── Build Groq prompt context from scored token ───────────────────────────────
function buildHunterPromptContext(ca, pair, scoreResult, rawMessage, groupName) {
  const s       = scoreResult;
  const scores  = s.scores || {};
  const ageMins = pair?.pairCreatedAt ? Math.floor((Date.now() - pair.pairCreatedAt) / 60000) : null;
  const txns    = pair?.txns?.h24 || {};
  const total   = (txns.buys || 0) + (txns.sells || 0);
  const bp      = total > 0 ? ((txns.buys / total) * 100).toFixed(0) : '?';

  return `TELEGRAM ALPHA HUNT REQUEST

CA: ${ca}
GROUP: ${groupName}
DETECTED AT: ${new Date().toISOString()}

RAW MESSAGE EXCERPT:
${rawMessage.slice(0, 400)}

LIVE ON-CHAIN DATA:
- Token: ${pair?.baseToken?.name || 'Unknown'} ($${pair?.baseToken?.symbol || '?'})
- DEX: ${pair?.dexId || 'unknown'} on Solana
- Price: $${parseFloat(pair?.priceUsd || 0).toFixed(8)}
- Market Cap: $${(pair?.marketCap || 0).toLocaleString()}
- Liquidity: $${(pair?.liquidity?.usd || 0).toLocaleString()}
- Vol 1h: $${(pair?.volume?.h1 || 0).toLocaleString()}
- Vol 24h: $${(pair?.volume?.h24 || 0).toLocaleString()}
- Buy Pressure 24h: ${bp}%
- Price 5m: ${pair?.priceChange?.m5 || 0}%
- Price 1h: ${pair?.priceChange?.h1 || 0}%
- Pair age: ${ageMins !== null ? ageMins + ' min' : 'unknown'}
- Buys/Sells 24h: ${txns.buys || 0} / ${txns.sells || 0}

NICHKT 8-SIGNAL SCORE: ${s.total}/100 (Grade: ${s.grade})
- Graduation Speed: ${scores.graduationSpeed || 0}/18
- Volume Velocity:  ${scores.volumeVelocity  || 0}/22
- Price Multiple:   ${scores.priceMultiple   || 0}/16
- Buy Pressure:     ${scores.buyPressure     || 0}/12
- Liquidity Depth:  ${scores.liquidityDepth  || 0}/8
- TX Frequency:     ${scores.txFrequency     || 0}/12
- V/L Efficiency:   ${scores.vlEfficiency    || 0}/6
- Dev/Social Signal:${scores.socialSignal    || 0}/6
- Mcap Modifier:    ${s.mcapModifier >= 0 ? '+' : ''}${s.mcapModifier || 0}
- Freshness:        ${((s.freshnessMultiplier || 1) * 100).toFixed(0)}%`;
}

// ── AI hunter system prompt ────────────────────────────────────────────────────
const HUNTER_SYSTEM = `You are an elite Solana memecoin alpha hunter running the NICHKT PUMP.FUN SDK METHOD inside Memefish.

A Telegram message has arrived containing a contract address. You have the live on-chain data and the full 8-signal NICHKT score. Make a fast, decisive call.

RULES:
- Only S-grade (78+) and A-grade (62-77) get TRACK
- B-grade gets WATCH-ONLY only if strong whale/dev signal present
- C/D always SKIP
- If token is >6h old with fading volume, downgrade the decision
- If buy pressure <40% despite good score, flag as distribution risk

Reply in EXACTLY this format — nothing else:

CA: [exact address]
GROUP: [group name]
DETECTED AT: [timestamp]

NICHKT SCORE: [score]/100
GRADE: [S/A/B/C/D]

TRACKING DECISION: TRACK / SKIP / WATCH-ONLY

REASON:
• [Momentum & pattern — 1 sentence]
• [Buy pressure & volume profile — 1 sentence]
• [Risk level vs alpha potential — 1 sentence]

NEXT ACTION: [one specific thing the trader should do right now]`;

// ─────────────────────────────────────────────────────────────────────────────
// MAIN HOOK
// ─────────────────────────────────────────────────────────────────────────────
export function useTelegramHunter(addToWatchlist) {
  const [results, setResults]   = useState([]);    // current session hunt results
  const [history, setHistory]   = useState(loadHistory);
  const [hunting, setHunting]   = useState(false);
  const [huntingCA, setHuntingCA] = useState('');   // which CA is being processed
  const abortRef = useRef(false);

  // ── Hunt a single CA ─────────────────────────────────────────────────────────
  const huntCA = useCallback(async (ca, rawMessage, groupName) => {
    // 1. Fetch DexScreener data
    const pair = await fetchPairForCA(ca);

    if (!pair) {
      return {
        ca, groupName,
        detectedAt:  Date.now(),
        error:       'No Solana pair found on DexScreener',
        decision:    'SKIP',
        grade:       'D',
        score:       0,
        pair:        null,
        aiAnalysis:  null,
      };
    }

    // 2. Score the token
    const scoreResult = scoreToken(pair);

    // 3. AI analysis via Groq
    let aiAnalysis  = null;
    let decision    = scoreResult.grade === 'S' ? 'TRACK' : scoreResult.grade === 'A' ? 'TRACK' : scoreResult.grade === 'B' ? 'WATCH-ONLY' : 'SKIP';
    let parsedResult = null;

    try {
      const context = buildHunterPromptContext(ca, pair, scoreResult, rawMessage, groupName);
      const raw = await callGroq(HUNTER_SYSTEM, context, { maxTokens: 400, temperature: 0.2 });
      aiAnalysis = raw;

      // Parse decision from AI output
      const decisionMatch = raw.match(/TRACKING DECISION:\s*(TRACK|SKIP|WATCH-ONLY)/i);
      if (decisionMatch) decision = decisionMatch[1].toUpperCase();

      // Parse structured fields
      const scoreMatch  = raw.match(/NICHKT SCORE:\s*(\d+)\/100/i);
      const gradeMatch  = raw.match(/GRADE:\s*([SABCD])/i);
      const reasonMatch = raw.match(/REASON:([\s\S]*?)(?=NEXT ACTION:|$)/i);
      const nextMatch   = raw.match(/NEXT ACTION:\s*(.+)/i);

      parsedResult = {
        score:      scoreMatch  ? parseInt(scoreMatch[1])  : scoreResult.total,
        grade:      gradeMatch  ? gradeMatch[1]            : scoreResult.grade,
        reason:     reasonMatch ? reasonMatch[1].trim()    : '',
        nextAction: nextMatch   ? nextMatch[1].trim()      : '',
      };
    } catch (e) {
      // Groq unavailable — use algorithmic decision only
      aiAnalysis = null;
    }

    return {
      ca,
      groupName,
      detectedAt:   Date.now(),
      pair,
      scoreResult,
      score:        parsedResult?.score  ?? scoreResult.total,
      grade:        parsedResult?.grade  ?? scoreResult.grade,
      decision,
      reason:       parsedResult?.reason ?? '',
      nextAction:   parsedResult?.nextAction ?? '',
      aiAnalysis,
      error:        null,
      tracked:      false,
    };
  }, []);

  // ── Main hunt function — parses message, hunts all CAs ────────────────────
  const hunt = useCallback(async (rawMessage) => {
    if (!rawMessage.trim() || hunting) return;

    abortRef.current = false;
    setHunting(true);
    setResults([]);

    const cas      = extractCAs(rawMessage);
    const group    = extractGroupName(rawMessage);
    const newResults = [];

    if (cas.length === 0) {
      setResults([{ error: 'No valid Solana contract addresses found in this message', decision: 'SKIP', detectedAt: Date.now() }]);
      setHunting(false);
      return;
    }

    // Process CAs — strongest score first (sort after first fetch)
    for (const ca of cas.slice(0, 5)) { // max 5 CAs per message
      if (abortRef.current) break;
      setHuntingCA(ca);
      const result = await huntCA(ca, rawMessage, group);
      newResults.push(result);
      // Sort by score descending as we go
      setResults([...newResults].sort((a, b) => (b.score || 0) - (a.score || 0)));
    }

    setHuntingCA('');
    setHunting(false);

    // Save to history
    const toSave = newResults.filter(r => !r.error && r.score > 0);
    if (toSave.length > 0) {
      const updated = [...toSave, ...history].slice(0, MAX_HISTORY);
      setHistory(updated);
      saveHistory(updated);
    }
  }, [hunting, huntCA, history]);

  // ── Track a result — add to watchlist ────────────────────────────────────
  const trackResult = useCallback(async (result) => {
    if (!result.ca || !addToWatchlist) return;
    await addToWatchlist(result.ca, result.pair || null);
    // Mark as tracked in results
    setResults(prev => prev.map(r => r.ca === result.ca ? { ...r, tracked: true } : r));
    setHistory(prev => {
      const updated = prev.map(r => r.ca === result.ca ? { ...r, tracked: true } : r);
      saveHistory(updated);
      return updated;
    });
  }, [addToWatchlist]);

  const clearResults = useCallback(() => setResults([]), []);
  const clearHistory = useCallback(() => {
    setHistory([]);
    saveHistory([]);
  }, []);

  const abort = useCallback(() => {
    abortRef.current = true;
    setHunting(false);
    setHuntingCA('');
  }, []);

  return {
    hunt, abort,
    results, history,
    hunting, huntingCA,
    trackResult,
    clearResults, clearHistory,
    extractCAs, // expose for direct CA input
  };
}
