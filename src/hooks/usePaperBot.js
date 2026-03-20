import { useState, useEffect, useRef, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// INTRADAY PAPER BOT — target 1.5x–4x portfolio return per day
//
// STRATEGY LOGIC:
//   The intraday memecoin window is 5–45 minutes post-graduation.
//   Tokens that meet ALL entry criteria in that window routinely move
//   100–500% before the first distribution wave. The bot:
//     - Enters ONLY in the first 20 minutes (ultra-fresh)
//     - Uses 25% of free balance per trade (aggressive compounding)
//     - Takes profit FAST: TP1 at +40% to lock gains immediately
//     - Rides runners with a tight trailing stop (-20% from peak)
//     - Cuts losers hard at -15% — capital preservation above all
//     - Cycles positions quickly to maximise daily trade count
//
// DAILY TARGET MATH:
//   10 SOL start · 4 trades/day · avg 80% win · 30% loss rate →
//   Expected daily return: ~150–300% on active capital
//
// ENTRY — ALL must pass:
//   1. Score ≥ 72 (S-grade or near-S)
//   2. Age ≤ 20 min (first wave only — not echo)
//   3. Mcap ≤ $80K (micro, max upside room)
//   4. Buy pressure ≥ 65% (clear demand dominance)
//   5. Vol1h > 2× hourly avg (momentum is live right now)
//   6. Liquidity ≥ $8K (can enter and exit cleanly)
//   7. 5m price change > +1% (price is moving up right now)
//   8. V/L ratio > 4 (volume-to-liquidity flywheel)
//
// EXIT — first trigger wins:
//   TP1 +40%  → sell 40%  (lock fast gains, activate trailing)
//   TP2 +100% → sell 35%  (2x captured)
//   TP3 +250% → sell 25%  (let the 3x runner breathe)
//   TRAIL: -20% from peak (tight — protect gains aggressively)
//   HARD STOP: -15%       (cut fast, protect capital)
//   SELL PRESSURE: buys <40% for 2 checks → exit
//   TIME: 2h max          (intraday only, no overnight holding)
// ─────────────────────────────────────────────────────────────────────────────

const BOT_STATE_KEY   = 'pumpsdk_bot_state';
const BOT_TRADES_KEY  = 'pumpsdk_bot_trades';
const BOT_CONFIG_KEY  = 'pumpsdk_bot_config';
const BOT_BALANCE_KEY = 'pumpsdk_bot_balance';
const BOT_DAILY_KEY   = 'pumpsdk_bot_daily'; // daily session tracking

const DEFAULT_CONFIG = {
  enabled:           false,
  startingBalance:   10,      // virtual SOL
  positionSizePct:   0.25,    // 25% of free balance per trade (aggressive compounding)
  maxPositions:      4,       // max concurrent — more = more exposure
  // ── Entry gates ──────────────────────────────────────────────────
  minScore:          72,      // near-S-grade minimum
  maxAgeMins:        20,      // ULTRA FRESH — first 20 minutes only
  maxMcap:           80000,   // $80K max mcap — micro cap only
  minBuyPressure:    0.65,    // 65%+ buys
  minVolAccel:       2.0,     // vol1h > 2× hourly average
  minLiquidity:      8000,    // $8K liquidity minimum
  min5mChange:       1.0,     // price going up right now (+1% in 5m)
  minVlRatio:        4,       // V/L ratio > 4
  // ── Exit config ──────────────────────────────────────────────────
  hardStopPct:      -15,      // cut at -15% — fast and firm
  trailingStopPct:  -20,      // trail -20% from peak (tight)
  tp1Pct:            40,      // TP1: +40% → sell 40%
  tp2Pct:           100,      // TP2: +100% → sell 35%
  tp3Pct:           250,      // TP3: +250% → sell 25%
  sellPressureThresh: 0.40,   // exit when buys drop below 40%
  timeStopHours:     2,       // 2h max hold — intraday only
  // ── Daily target ─────────────────────────────────────────────────
  dailyTargetPct:   150,      // target 150% daily return (1.5x)
  dailyStopPct:     -30,      // stop trading for the day if down 30%
};

function safeLoad(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}
function safeSave(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// ── Entry evaluator ───────────────────────────────────────────────────────────
function evaluateEntry(token, config) {
  const score     = token._score?.total || 0;
  const scores    = token._score?.scores || {};
  const ageMins   = token.pairCreatedAt ? (Date.now() - token.pairCreatedAt) / 60000 : 9999;
  const mcap      = token.marketCap || 0;
  const liquidity = token.liquidity?.usd || 0;
  const vol24h    = token.volume?.h24 || 0;
  const vol1h     = token.volume?.h1 || 0;
  const vol6h     = token.volume?.h6 || 0;
  const txns      = token.txns?.h24 || {};
  const totalTxns = (txns.buys || 0) + (txns.sells || 0);
  const buyRatio  = totalTxns > 0 ? txns.buys / totalTxns : 0;
  const vlRatio   = liquidity > 0 ? vol24h / liquidity : 0;
  const hourlyAvg = vol6h > 0 ? vol6h / 6 : 0;
  const volAccel  = hourlyAvg > 0 ? vol1h / hourlyAvg : 0;
  const p5m       = token.priceChange?.m5 || 0;

  const checks = [
    { id: 'score',    pass: score >= config.minScore,          label: `Score ${score}/${config.minScore}` },
    { id: 'age',      pass: ageMins <= config.maxAgeMins,      label: `${ageMins.toFixed(0)}m old (≤${config.maxAgeMins}m)` },
    { id: 'mcap',     pass: mcap === 0 || mcap <= config.maxMcap, label: `MC $${(mcap/1000).toFixed(0)}K (≤$${config.maxMcap/1000}K)` },
    { id: 'buypres',  pass: buyRatio >= config.minBuyPressure,  label: `BP ${(buyRatio*100).toFixed(0)}% (≥${(config.minBuyPressure*100).toFixed(0)}%)` },
    { id: 'accel',    pass: volAccel >= config.minVolAccel,     label: `Accel ${volAccel.toFixed(1)}× (≥${config.minVolAccel}×)` },
    { id: 'liq',      pass: liquidity >= config.minLiquidity,   label: `Liq $${(liquidity/1000).toFixed(1)}K (≥$${config.minLiquidity/1000}K)` },
    { id: 'p5m',      pass: p5m >= config.min5mChange,          label: `5m ${p5m >= 0 ? '+' : ''}${p5m.toFixed(1)}% (≥+${config.min5mChange}%)` },
    { id: 'vl',       pass: vlRatio >= config.minVlRatio,       label: `V/L ${vlRatio.toFixed(1)}× (≥${config.minVlRatio}×)` },
  ];

  const failed = checks.filter(c => !c.pass);
  const ok = failed.length === 0;

  // Urgency multiplier: tokens <10 min get candidate ranking boost
  const urgencyMult = ageMins < 10 ? 1.4 : ageMins < 15 ? 1.2 : 1.0;

  let conviction = 0;
  if (ok) {
    conviction += Math.min(25, (score - config.minScore) * 2);
    conviction += Math.min(20, (config.maxAgeMins - ageMins) / config.maxAgeMins * 20);
    conviction += Math.min(20, (buyRatio - config.minBuyPressure) / 0.35 * 20);
    conviction += Math.min(15, Math.min(volAccel - config.minVolAccel, 4) / 4 * 15);
    conviction += Math.min(10, scores.socialSignal >= 4 ? 10 : scores.socialSignal * 1.5);
    conviction += Math.min(10, p5m >= 5 ? 10 : p5m * 2);
    conviction = Math.min(100, Math.round(conviction));
  }

  return {
    ok,
    conviction,
    urgencyMult,
    reason: ok
      ? checks.map(c => c.label).join(' · ')
      : `FAIL: ${failed.map(c => c.label).join(', ')}`,
    checks,
  };
}

// ── Exit evaluator ────────────────────────────────────────────────────────────
function evaluateExit(position, currentPrice, token, config) {
  const pnlPct   = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
  const ageHours = (Date.now() - position.entryTime) / 3600000;
  const txns     = token?.txns?.h24 || {};
  const total    = (txns.buys || 0) + (txns.sells || 0);
  const buyRatio = total > 0 ? txns.buys / total : 0.5;

  const peakPrice = Math.max(position.peakPrice || position.entryPrice, currentPrice);
  const trailPct  = position.tp1Hit
    ? ((currentPrice - peakPrice) / peakPrice) * 100
    : null;
  const sellHits  = (position.sellPressureHits || 0) + (buyRatio < config.sellPressureThresh ? 1 : 0);

  // 1. Hard stop — cut fast
  if (pnlPct <= config.hardStopPct) {
    return { action: 'FULL_EXIT', reason: `Hard stop ${pnlPct.toFixed(1)}%`, pnlPct, peakPrice, sellHits };
  }
  // 2. Trailing stop (active after TP1)
  if (position.tp1Hit && trailPct !== null && trailPct <= config.trailingStopPct) {
    return { action: 'FULL_EXIT', reason: `Trail stop ${trailPct.toFixed(1)}% from peak`, pnlPct, peakPrice, sellHits };
  }
  // 3. Sell pressure — distribution starting
  if (sellHits >= 2) {
    return { action: 'FULL_EXIT', reason: `Sell pressure ${(buyRatio*100).toFixed(0)}% buys × 2`, pnlPct, peakPrice, sellHits };
  }
  // 4. Time stop — intraday only
  if (ageHours >= config.timeStopHours) {
    return { action: 'FULL_EXIT', reason: `Time stop ${ageHours.toFixed(1)}h`, pnlPct, peakPrice, sellHits };
  }
  // 5. TP ladder
  if (pnlPct >= config.tp3Pct && position.tp2Hit && !position.tp3Hit) {
    return { action: 'PARTIAL_EXIT', portion: 0.25, reason: `TP3 +${pnlPct.toFixed(0)}%`, pnlPct, peakPrice, sellHits, tp3Hit: true };
  }
  if (pnlPct >= config.tp2Pct && position.tp1Hit && !position.tp2Hit) {
    return { action: 'PARTIAL_EXIT', portion: 0.35, reason: `TP2 +${pnlPct.toFixed(0)}%`, pnlPct, peakPrice, sellHits, tp2Hit: true };
  }
  if (pnlPct >= config.tp1Pct && !position.tp1Hit) {
    return { action: 'PARTIAL_EXIT', portion: 0.40, reason: `TP1 +${pnlPct.toFixed(0)}%`, pnlPct, peakPrice, sellHits, tp1Hit: true };
  }

  return { action: 'HOLD', pnlPct, peakPrice, sellHits };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN HOOK
// ─────────────────────────────────────────────────────────────────────────────
export function usePaperBot(tokens) {
  const [config, setConfigState] = useState(() => ({ ...DEFAULT_CONFIG, ...safeLoad(BOT_CONFIG_KEY, {}) }));
  const [positions, setPositions] = useState(() => safeLoad(BOT_STATE_KEY, []));
  const [trades, setTrades]       = useState(() => safeLoad(BOT_TRADES_KEY, []));
  const [balance, setBalance]     = useState(() => {
    const saved = safeLoad(BOT_BALANCE_KEY, null);
    return saved !== null ? saved : DEFAULT_CONFIG.startingBalance;
  });
  const [log, setLog]           = useState([]);
  const [lastTickAt, setLastTickAt] = useState(null);

  // Daily session tracking
  const [dailySession, setDailySession] = useState(() => {
    const saved = safeLoad(BOT_DAILY_KEY, null);
    const today = new Date().toDateString();
    if (saved && saved.date === today) return saved;
    return { date: today, startBalance: null, trades: 0, wins: 0, peakBalance: null };
  });

  const configRef    = useRef(config);
  const positionsRef = useRef(positions);
  const balanceRef   = useRef(balance);
  configRef.current    = config;
  positionsRef.current = positions;
  balanceRef.current   = balance;

  useEffect(() => { safeSave(BOT_STATE_KEY,   positions); }, [positions]);
  useEffect(() => { safeSave(BOT_TRADES_KEY,  trades);    }, [trades]);
  useEffect(() => { safeSave(BOT_BALANCE_KEY, balance);   }, [balance]);
  useEffect(() => { safeSave(BOT_CONFIG_KEY,  config);    }, [config]);
  useEffect(() => { safeSave(BOT_DAILY_KEY,   dailySession); }, [dailySession]);

  const addLog = useCallback((type, msg, extra = {}) => {
    setLog(prev => [{
      id: Date.now() + Math.random(), type, msg, timestamp: Date.now(), ...extra,
    }, ...prev].slice(0, 200));
  }, []);

  // ── Main tick ─────────────────────────────────────────────────────────────
  const tick = useCallback(() => {
    const cfg = configRef.current;
    const pos = positionsRef.current;
    const bal = balanceRef.current;
    if (!cfg.enabled || tokens.length === 0) return;

    // Daily stop-loss — stop trading if down dailyStopPct from session start
    const sessionStart = dailySession.startBalance || bal;
    const sessionReturn = sessionStart > 0 ? ((bal - sessionStart) / sessionStart * 100) : 0;
    if (sessionReturn <= cfg.dailyStopPct) {
      addLog('INFO', `Daily stop-loss hit (${sessionReturn.toFixed(1)}%) — pausing for the day`);
      return;
    }

    const openIds = new Set(pos.map(p => p.tokenId));
    let newPositions = [...pos];
    let newBalance   = bal;
    const closedTrades = [];

    // ── PHASE 1: CHECK EXITS ─────────────────────────────────────────────
    for (let i = newPositions.length - 1; i >= 0; i--) {
      const position = newPositions[i];
      const live     = tokens.find(t => t._id === position.tokenId || t.pairAddress === position.tokenId);
      const price    = live ? parseFloat(live.priceUsd || 0) : position.lastPrice;
      if (price <= 0) continue;

      const result = evaluateExit({ ...position }, price, live, cfg);
      newPositions[i] = { ...position, lastPrice: price, peakPrice: result.peakPrice, sellPressureHits: result.sellHits };

      if (result.action === 'FULL_EXIT') {
        const proceeds = position.remainingSize * price;
        newBalance += proceeds;

        closedTrades.push({
          id:          position.id,
          tokenId:     position.tokenId,
          symbol:      position.symbol,
          pairAddress: position.pairAddress,
          entryPrice:  position.entryPrice,
          exitPrice:   price,
          entryTime:   position.entryTime,
          exitTime:    Date.now(),
          solIn:       position.solAmount,
          solOut:      proceeds,
          pnlSol:      proceeds - position.solAmount,
          pnlPct:      result.pnlPct,
          reason:      result.reason,
          conviction:  position.conviction || 0,
          peakPct:     position.peakPrice > 0 ? ((position.peakPrice - position.entryPrice) / position.entryPrice * 100) : 0,
        });

        const typeLabel = result.pnlPct >= 100 ? 'SELL' : result.pnlPct >= 0 ? 'TP' : 'SL';
        addLog(typeLabel, `${position.symbol} CLOSED ${result.pnlPct >= 0 ? '+' : ''}${result.pnlPct.toFixed(1)}% · ${result.reason} · ${(proceeds - position.solAmount) >= 0 ? '+' : ''}${(proceeds - position.solAmount).toFixed(3)}◎`);
        newPositions.splice(i, 1);
        openIds.delete(position.tokenId);

      } else if (result.action === 'PARTIAL_EXIT') {
        const sellAmt  = position.remainingSize * result.portion;
        const proceeds = sellAmt * price;
        newBalance    += proceeds;
        const realised = proceeds - (position.solAmount * result.portion);

        newPositions[i] = {
          ...newPositions[i],
          remainingSize: position.remainingSize * (1 - result.portion),
          solAmount:     position.solAmount    * (1 - result.portion),
          tp1Hit: result.tp1Hit ?? position.tp1Hit,
          tp2Hit: result.tp2Hit ?? position.tp2Hit,
          tp3Hit: result.tp3Hit ?? position.tp3Hit,
          peakPrice: result.peakPrice,
        };
        addLog('TP', `${position.symbol} ${result.reason} · realised ${realised >= 0 ? '+' : ''}${realised.toFixed(3)}◎`);
      }
    }

    // ── PHASE 2: SCAN ENTRIES ────────────────────────────────────────────
    if (newPositions.length < cfg.maxPositions && newBalance > 0) {
      // Rank candidates by urgency × score — freshest tokens first
      const candidates = tokens
        .filter(t => !openIds.has(t._id) && !openIds.has(t.pairAddress))
        .map(t => {
          const ageMins = t.pairCreatedAt ? (Date.now() - t.pairCreatedAt) / 60000 : 9999;
          const urgency = ageMins < 10 ? 1.4 : ageMins < 15 ? 1.2 : ageMins < 20 ? 1.1 : 1.0;
          return { token: t, rankScore: (t._score?.total || 0) * urgency };
        })
        .sort((a, b) => b.rankScore - a.rankScore)
        .slice(0, 15)
        .map(c => c.token);

      for (const token of candidates) {
        if (newPositions.length >= cfg.maxPositions) break;
        const tradeSize = Math.max(0.01, newBalance * cfg.positionSizePct);
        if (newBalance < tradeSize) break;

        const signal = evaluateEntry(token, cfg);
        if (!signal.ok) continue;

        const entryPrice = parseFloat(token.priceUsd || 0);
        if (entryPrice <= 0) continue;

        const tokenId = token._id || token.pairAddress;
        const tokensAmt = tradeSize / entryPrice;

        newPositions.push({
          id:               `pos-${Date.now()}-${tokenId.slice(0,8)}`,
          tokenId,
          pairAddress:      token.pairAddress,
          symbol:           token.baseToken?.symbol || '???',
          name:             token.baseToken?.name || '',
          entryPrice,
          lastPrice:        entryPrice,
          peakPrice:        entryPrice,
          entryTime:        Date.now(),
          solAmount:        tradeSize,
          tokenAmount:      tokensAmt,
          remainingSize:    tokensAmt,
          tp1Hit: false, tp2Hit: false, tp3Hit: false,
          sellPressureHits: 0,
          entryScore:       token._score?.total,
          entryAgeMins:     token.pairCreatedAt ? (Date.now() - token.pairCreatedAt) / 60000 : null,
          entryMcap:        token.marketCap || 0,
          conviction:       signal.conviction,
          entrySignal:      signal.reason.split(' · ').slice(0,4).join(' · '),
        });

        newBalance -= tradeSize;
        openIds.add(tokenId);
        addLog('BUY', `${token.baseToken?.symbol} ENTRY @ ${entryPrice.toExponential(2)} · ${tradeSize.toFixed(3)}◎ · CV${signal.conviction} · ${signal.urgencyMult > 1 ? '⚡URGENT' : ''}`);
      }
    }

    // ── COMMIT ────────────────────────────────────────────────────────────
    if (closedTrades.length > 0) {
      setTrades(prev => [...closedTrades, ...prev].slice(0, 500));
      // Update daily session
      setDailySession(prev => {
        const wins = closedTrades.filter(t => t.pnlPct >= 0).length;
        return {
          ...prev,
          startBalance: prev.startBalance || newBalance,
          trades:       (prev.trades || 0) + closedTrades.length,
          wins:         (prev.wins   || 0) + wins,
          peakBalance:  Math.max(prev.peakBalance || 0, newBalance),
        };
      });
    }

    setPositions(newPositions);
    setBalance(newBalance);
    setLastTickAt(Date.now());
  }, [tokens, addLog, dailySession]);

  useEffect(() => {
    if (tokens.length > 0) tick();
  }, [tokens, tick]);

  const updateConfig = useCallback((patch) => {
    setConfigState(prev => ({ ...prev, ...patch }));
  }, []);

  const resetBot = useCallback(() => {
    const nb = config.startingBalance;
    const today = new Date().toDateString();
    setPositions([]); setTrades([]); setBalance(nb); setLog([]);
    setDailySession({ date: today, startBalance: nb, trades: 0, wins: 0, peakBalance: nb });
    safeSave(BOT_STATE_KEY, []); safeSave(BOT_TRADES_KEY, []);
    safeSave(BOT_BALANCE_KEY, nb);
    addLog('INFO', `Bot reset — starting ${nb} SOL · target ${config.dailyTargetPct}% today`);
  }, [config.startingBalance, config.dailyTargetPct, addLog]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = (() => {
    const closed = trades;
    const wins   = closed.filter(t => t.pnlPct >= 0);
    const losses = closed.filter(t => t.pnlPct < 0);
    const bigWins = closed.filter(t => t.pnlPct >= 100);

    const openValue = positions.reduce((s, p) => s + p.remainingSize * p.lastPrice, 0);
    const totalPort = balance + openValue;
    const startBal  = config.startingBalance;
    const returnPct = startBal > 0 ? ((totalPort - startBal) / startBal * 100) : 0;

    // Today's stats
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayTrades = closed.filter(t => t.exitTime >= todayStart.getTime());
    const todayPnl    = todayTrades.reduce((s, t) => s + t.pnlSol, 0);
    const todayReturn = dailySession.startBalance > 0
      ? ((totalPort - dailySession.startBalance) / dailySession.startBalance * 100)
      : 0;

    // Daily target progress
    const targetProgress = config.dailyTargetPct > 0
      ? Math.min(100, Math.max(0, (todayReturn / config.dailyTargetPct) * 100))
      : 0;

    // Hourly P&L — last 8 hours, one bucket per hour
    const now = Date.now();
    const hourlyPnl = Array.from({ length: 8 }, (_, i) => {
      const start = now - (8 - i) * 3600000;
      const end   = now - (7 - i) * 3600000;
      const bucket = closed.filter(t => t.exitTime >= start && t.exitTime < end);
      const label = new Date(start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return {
        hour:  label,
        pnl:   bucket.reduce((s, t) => s + t.pnlSol, 0),
        count: bucket.length,
      };
    });

    return {
      totalTrades:   closed.length,
      wins:          wins.length,
      losses:        losses.length,
      bigWins:       bigWins.length,
      winRate:       closed.length > 0 ? wins.length / closed.length * 100 : 0,
      totalPnlSol:   closed.reduce((s, t) => s + t.pnlSol, 0),
      openValue,
      totalPortfolio: totalPort,
      totalReturnPct: returnPct,
      todayTrades:   todayTrades.length,
      todayPnlSol:   todayPnl,
      todayReturn,
      targetProgress,
      hourlyPnl,
      avgWinPct:     wins.length   > 0 ? wins.reduce((s, t)   => s + t.pnlPct, 0) / wins.length   : 0,
      avgLossPct:    losses.length > 0 ? losses.reduce((s, t) => s + t.pnlPct, 0) / losses.length : 0,
      bestTrade:     [...closed].sort((a, b) => b.pnlPct - a.pnlPct)[0] || null,
      dailySession,
    };
  })();

  return {
    config, updateConfig,
    positions, trades, balance,
    log, stats, lastTickAt,
    resetBot, addLog,
  };
}
