import { useState, useEffect, useRef, useCallback } from 'react';
import { scoreToken } from '../utils/scoring';

// ─────────────────────────────────────────────────────────────────────────────
// SOLANAMECOINGUARDIAN v4.0 — fully configurable
// All thresholds adjustable by user, persisted to localStorage.
// ─────────────────────────────────────────────────────────────────────────────

const DEXSCREENER_BASE     = 'https://api.dexscreener.com';
const RUGCHECK_BASE        = 'https://api.rugcheck.xyz/v1';
const GOPLUS_BASE          = 'https://api.gopluslabs.io/api/v1';

const GUARDIAN_SCAN_KEY    = 'pumpsdk_guardian_scan';
const GUARDIAN_HISTORY_KEY = 'pumpsdk_guardian_history';
const GUARDIAN_CONFIG_KEY  = 'pumpsdk_guardian_config';

// ── Default config — every field user-adjustable ─────────────────────────────
export const GUARDIAN_DEFAULT_CONFIG = {
  // Fetch filters
  maxMcap:            50_000,   // $ — only tokens below this mcap
  minLiquidity:        3_000,   // $ — must have at least this much liquidity
  maxAgeMins:           720,    // minutes — ignore tokens older than this (720 = 12h)
  maxCandidates:           3,   // max results to surface (1–10)
  scanIntervalMins:        5,   // minutes between auto-scans (3–30)

  // Safety thresholds — used in computeGuardianScore
  maxCreatorPct:           3,   // % — creator wallet max holdings
  maxTop10Pct:            20,   // % — top 10 wallets combined max
  minHolderCount:        100,   // minimum number of unique holders
  maxTaxPct:              10,   // % — max buy OR sell tax
  requireLpBurned:      true,   // if true: LP not burned/locked = critical fail

  // Decision thresholds (risk score 0–100, lower = safer)
  strongBuyThreshold:     25,   // risk score ≤ this → STRONG BUY
  watchThreshold:         50,   // risk score ≤ this → WATCH (else REJECT)
};

function safeLoad(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}
function safeSave(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// ── DexScreener: fresh pumpswap pairs filtered by user config ─────────────────
async function fetchGuardianCandidates(config) {
  try {
    const res = await fetch(
      `${DEXSCREENER_BASE}/latest/dex/search?q=pumpswap`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) throw new Error(`DexScreener HTTP ${res.status}`);
    const data = await res.json();
    const cutoff = Date.now() - config.maxAgeMins * 60 * 1000;

    return (data.pairs || [])
      .filter(p => {
        if (p.chainId !== 'solana') return false;
        if ((p.dexId || '').toLowerCase() !== 'pumpswap') return false;
        if (!p.pairCreatedAt || p.pairCreatedAt < cutoff) return false;
        if (!p.priceUsd || parseFloat(p.priceUsd) <= 0) return false;
        const mcap = p.marketCap || p.fdv || 0;
        if (mcap <= 0 || mcap > config.maxMcap) return false;
        if ((p.liquidity?.usd || 0) < config.minLiquidity) return false;
        if (!p.baseToken?.address) return false;
        return true;
      })
      .sort((a, b) => (b.volume?.h1 || 0) - (a.volume?.h1 || 0))
      .slice(0, 20); // evaluate up to 20 raw candidates
  } catch (e) {
    console.error('Guardian fetch error:', e);
    return [];
  }
}

// ── RugCheck API ──────────────────────────────────────────────────────────────
async function fetchRugCheck(mint) {
  try {
    const res = await fetch(
      `${RUGCHECK_BASE}/tokens/${mint}/report/summary`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      score:   data.score  ?? null,
      rating:  data.rating || 'unknown',
      risks:   data.risks  || [],
    };
  } catch { return null; }
}

// ── GoPlus Security API ───────────────────────────────────────────────────────
async function fetchGoPlus(mint) {
  try {
    const res = await fetch(
      `${GOPLUS_BASE}/token_security/solana?contract_addresses=${mint}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const info = data.result?.[mint.toLowerCase()] || data.result?.[mint] || null;
    if (!info) return null;
    return {
      mintAuthority:   info.mint_auth === '1' || info.mintable === '1',
      freezeAuthority: info.freeze_auth === '1' || info.freezeable === '1',
      isHoneypot:      info.is_honeypot === '1',
      buyTax:          parseFloat(info.buy_tax  || 0) * 100,
      sellTax:         parseFloat(info.sell_tax || 0) * 100,
      creatorPct:      parseFloat(info.creator_percent || 0) * 100,
      top10Pct:        parseFloat(info.holder_percent  || 0) * 100,
      holderCount:     parseInt(info.holder_count || 0),
      lpBurned:        info.lp_burned_percent ? parseFloat(info.lp_burned_percent) : null,
      lpLocked:        info.lp_locked_percent ? parseFloat(info.lp_locked_percent) : null,
    };
  } catch { return null; }
}

// ── Guardian Risk Scorer — all thresholds driven by config ───────────────────
function computeGuardianScore(pair, rugcheck, goplus, config) {
  let riskPoints  = 0;
  const flags     = { green: [], red: [], critical: [] };
  let instantFail = null;

  const mcap      = pair.marketCap || pair.fdv || 0;
  const liquidity = pair.liquidity?.usd || 0;
  const vol24h    = pair.volume?.h24 || 0;
  const ageMins   = pair.pairCreatedAt ? (Date.now() - pair.pairCreatedAt) / 60000 : 9999;

  if (goplus) {
    // 1. Mint authority
    if (goplus.mintAuthority === true) {
      instantFail = 'Mint authority NOT revoked — dev can print tokens';
      flags.critical.push('🔴 Mint authority active');
    } else if (goplus.mintAuthority === false) {
      flags.green.push('✅ Mint authority revoked');
    }

    // 2. Freeze authority
    if (goplus.freezeAuthority === true) {
      instantFail = instantFail || 'Freeze authority active';
      flags.critical.push('🔴 Freeze authority active');
    } else if (goplus.freezeAuthority === false) {
      flags.green.push('✅ Freeze authority revoked');
    }

    // 3. Honeypot
    if (goplus.isHoneypot === true) {
      instantFail = instantFail || 'Honeypot — cannot sell';
      flags.critical.push('🔴 HONEYPOT DETECTED');
    } else {
      flags.green.push('✅ Not a honeypot');
    }

    // 4. Tax (configurable threshold)
    if (goplus.buyTax > config.maxTaxPct || goplus.sellTax > config.maxTaxPct) {
      instantFail = instantFail || `High tax: buy ${goplus.buyTax.toFixed(0)}% / sell ${goplus.sellTax.toFixed(0)}%`;
      flags.critical.push(`🔴 Tax too high (${goplus.buyTax.toFixed(0)}% / ${goplus.sellTax.toFixed(0)}%)`);
    } else {
      flags.green.push(`✅ Tax OK (${goplus.buyTax.toFixed(0)}% / ${goplus.sellTax.toFixed(0)}%)`);
    }

    // 5. Creator holdings (configurable threshold)
    if (goplus.creatorPct > config.maxCreatorPct) {
      riskPoints += 20;
      flags.red.push(`⚠️ Creator ${goplus.creatorPct.toFixed(1)}% (>${config.maxCreatorPct}%)`);
    } else {
      flags.green.push(`✅ Creator ${goplus.creatorPct.toFixed(1)}% (≤${config.maxCreatorPct}%)`);
    }

    // 6. Top 10 holders (configurable threshold)
    if (goplus.top10Pct > config.maxTop10Pct) {
      riskPoints += 15;
      flags.red.push(`⚠️ Top 10 hold ${goplus.top10Pct.toFixed(0)}% (>${config.maxTop10Pct}%)`);
    } else {
      flags.green.push(`✅ Top 10 hold ${goplus.top10Pct.toFixed(0)}% (≤${config.maxTop10Pct}%)`);
    }

    // 7. Holder count (configurable threshold)
    if (goplus.holderCount < config.minHolderCount) {
      riskPoints += 15;
      flags.red.push(`⚠️ Only ${goplus.holderCount} holders (<${config.minHolderCount})`);
    } else if (goplus.holderCount >= 300) {
      flags.green.push(`✅ ${goplus.holderCount} holders (organic)`);
    } else {
      flags.green.push(`✅ ${goplus.holderCount} holders`);
    }

    // 8. LP burn / lock (configurable: require or just score)
    const lpBurnPct = goplus.lpBurned || 0;
    const lpLockPct = goplus.lpLocked || 0;
    const lpMax     = Math.max(lpBurnPct, lpLockPct);
    if (lpMax >= 80) {
      flags.green.push(`✅ LP burned/locked ${lpMax.toFixed(0)}%`);
    } else if (lpMax > 0) {
      riskPoints += 10;
      flags.red.push(`⚠️ LP only ${lpMax.toFixed(0)}% burned/locked`);
    } else {
      if (config.requireLpBurned) {
        instantFail = instantFail || 'LP not burned or locked';
        flags.critical.push('🔴 LP not burned or locked');
      } else {
        riskPoints += 25;
        flags.red.push('⚠️ LP not burned or locked (high risk)');
      }
    }
  } else {
    riskPoints += 20;
    flags.red.push('⚠️ GoPlus data unavailable — manual verify required');
  }

  // ── RugCheck score ────────────────────────────────────────────────────────
  if (rugcheck) {
    const rc = rugcheck.score || 50;
    const normalised = rc >= 200 ? Math.min(100, rc / 10) : rc;
    riskPoints += Math.round(normalised * 0.3);

    if (rugcheck.rating === 'good') {
      flags.green.push('✅ RugCheck: GOOD');
    } else if (rugcheck.rating === 'warn') {
      riskPoints += 10;
      flags.red.push('⚠️ RugCheck: WARNING');
    } else if (rugcheck.rating === 'danger') {
      riskPoints += 30;
      flags.critical.push('🔴 RugCheck: DANGER');
    }
    const dangerItems = (rugcheck.risks || []).filter(r => r.level === 'danger' || r.score > 500);
    if (dangerItems.length > 0) {
      riskPoints += dangerItems.length * 15;
      flags.critical.push(`🔴 RugCheck: ${dangerItems.length} danger risk(s)`);
    }
  } else {
    riskPoints += 15;
    flags.red.push('⚠️ RugCheck data unavailable');
  }

  // ── Market metrics ────────────────────────────────────────────────────────
  const liqMcapRatio = mcap > 0 ? liquidity / mcap : 0;
  if (liqMcapRatio >= 0.2) {
    flags.green.push(`✅ Liq/MC ${(liqMcapRatio * 100).toFixed(0)}% (healthy)`);
  } else if (liqMcapRatio >= 0.1) {
    riskPoints += 10;
    flags.red.push(`⚠️ Liq/MC only ${(liqMcapRatio * 100).toFixed(0)}%`);
  } else {
    riskPoints += 20;
    flags.red.push(`⚠️ Very low Liq/MC ${(liqMcapRatio * 100).toFixed(0)}%`);
  }

  const vol1h     = pair.volume?.h1 || 0;
  const vol6h     = pair.volume?.h6 || 0;
  const hourlyAvg = vol6h > 0 ? vol6h / 6 : 0;
  const volAccel  = hourlyAvg > 0 ? vol1h / hourlyAvg : 1;
  if (volAccel > 10) {
    riskPoints += 10;
    flags.red.push('⚠️ Volume spike — possible wash trading');
  } else if (vol24h > 1000) {
    flags.green.push(`✅ Steady volume $${(vol24h / 1000).toFixed(1)}K`);
  }

  // Age sanity
  if (ageMins < 10) {
    riskPoints += 15;
    flags.red.push(`⚠️ Very new (${ageMins.toFixed(0)}m) — sniper risk`);
  } else if (ageMins <= 120) {
    flags.green.push(`✅ Age ${ageMins.toFixed(0)}m — early stage`);
  } else {
    flags.green.push(`✅ Age ${(ageMins / 60).toFixed(1)}h`);
  }

  flags.green.push(`✅ MC $${(mcap / 1000).toFixed(1)}K (under $${(config.maxMcap / 1000).toFixed(0)}K limit)`);

  const finalScore = Math.min(100, Math.max(0, riskPoints));

  let decision, status;
  if (instantFail) {
    decision = 'REJECT'; status = 'CRITICAL FAIL';
  } else if (finalScore <= config.strongBuyThreshold) {
    decision = 'STRONG_BUY'; status = 'STRONG BUY';
  } else if (finalScore <= config.watchThreshold) {
    decision = 'WATCH'; status = 'WATCH';
  } else {
    decision = 'REJECT'; status = 'REJECT';
  }

  return { riskScore: finalScore, decision, status, flags, instantFail };
}

// ─────────────────────────────────────────────────────────────────────────────
// DETAILED CHECKLIST — builds a per-check pass/fail table for the token checker
// Each check has: id, category, label, threshold, actual value, pass/fail,
// severity (critical/warning/info), and a human-readable reason.
// ─────────────────────────────────────────────────────────────────────────────
function buildDetailedChecklist(pair, rc, gp, config) {
  const checks = [];
  const mcap      = pair?.marketCap || pair?.fdv || 0;
  const liquidity = pair?.liquidity?.usd || 0;
  const vol24h    = pair?.volume?.h24 || 0;
  const vol1h     = pair?.volume?.h1 || 0;
  const vol6h     = pair?.volume?.h6 || 0;
  const ageMins   = pair?.pairCreatedAt ? (Date.now() - pair.pairCreatedAt) / 60000 : null;
  const hourlyAvg = vol6h > 0 ? vol6h / 6 : 0;
  const volAccel  = hourlyAvg > 0 ? vol1h / hourlyAvg : 0;
  const liqMcap   = mcap > 0 ? (liquidity / mcap * 100) : 0;

  // ── ON-CHAIN DATA AVAILABILITY ────────────────────────────────────────────
  checks.push({
    id: 'pair_found', category: 'Data',
    label: 'Token found on DexScreener (Solana)',
    threshold: 'Must exist',
    actual: pair ? `Found on ${pair.dexId}` : 'NOT FOUND',
    pass: !!pair,
    severity: 'critical',
    reason: pair ? `Trading on ${pair.dexId}` : 'No Solana pair found — unverifiable token',
  });

  checks.push({
    id: 'goplus_data', category: 'Data',
    label: 'GoPlus security data available',
    threshold: 'API accessible',
    actual: gp ? 'Available' : 'Unavailable',
    pass: !!gp,
    severity: 'warning',
    reason: gp ? 'GoPlus security data retrieved' : 'GoPlus returned no data — manual verification required',
  });

  checks.push({
    id: 'rugcheck_data', category: 'Data',
    label: 'RugCheck.xyz data available',
    threshold: 'API accessible',
    actual: rc ? `Score ${rc.score ?? '?'} · ${rc.rating}` : 'Unavailable',
    pass: !!rc,
    severity: 'warning',
    reason: rc ? `RugCheck rating: ${rc.rating}` : 'RugCheck returned no data',
  });

  // ── CRITICAL SAFETY CHECKS ────────────────────────────────────────────────
  if (gp) {
    checks.push({
      id: 'mint_auth', category: 'Critical Safety',
      label: 'Mint authority revoked',
      threshold: 'Must be revoked',
      actual: gp.mintAuthority === false ? 'Revoked ✓' : gp.mintAuthority === true ? 'ACTIVE ✗' : 'Unknown',
      pass: gp.mintAuthority === false,
      severity: 'critical',
      reason: gp.mintAuthority === true ? 'Dev CAN PRINT unlimited tokens — instant rug vector' : gp.mintAuthority === false ? 'Cannot create new tokens' : 'Data unclear',
    });

    checks.push({
      id: 'freeze_auth', category: 'Critical Safety',
      label: 'Freeze authority revoked',
      threshold: 'Must be revoked',
      actual: gp.freezeAuthority === false ? 'Revoked ✓' : gp.freezeAuthority === true ? 'ACTIVE ✗' : 'Unknown',
      pass: gp.freezeAuthority === false,
      severity: 'critical',
      reason: gp.freezeAuthority === true ? 'Dev CAN FREEZE wallet balances — assets locked' : 'Cannot freeze token accounts',
    });

    checks.push({
      id: 'honeypot', category: 'Critical Safety',
      label: 'Not a honeypot',
      threshold: 'Cannot be honeypot',
      actual: gp.isHoneypot ? 'HONEYPOT ✗' : 'Clean ✓',
      pass: !gp.isHoneypot,
      severity: 'critical',
      reason: gp.isHoneypot ? 'HONEYPOT — you cannot sell this token' : 'Sell transactions verified',
    });

    const maxTax = Math.max(gp.buyTax, gp.sellTax);
    checks.push({
      id: 'tax', category: 'Critical Safety',
      label: 'Buy/Sell tax acceptable',
      threshold: `Both ≤${config.maxTaxPct}%`,
      actual: `Buy ${gp.buyTax.toFixed(1)}% / Sell ${gp.sellTax.toFixed(1)}%`,
      pass: maxTax <= config.maxTaxPct,
      severity: 'critical',
      reason: maxTax > config.maxTaxPct
        ? `Tax too high (${maxTax.toFixed(0)}%) — threshold is ${config.maxTaxPct}%`
        : 'Tax within acceptable range',
    });

    // ── LP BURN/LOCK ────────────────────────────────────────────────────────
    const lpMax = Math.max(gp.lpBurned || 0, gp.lpLocked || 0);
    const lpPass = lpMax >= 80;
    checks.push({
      id: 'lp_burn', category: 'Critical Safety',
      label: 'LP burned or locked ≥80%',
      threshold: config.requireLpBurned ? 'Required (≥80%)' : 'Preferred (≥80%)',
      actual: lpMax > 0 ? `${lpMax.toFixed(0)}% burned/locked` : 'NOT burned or locked',
      pass: lpPass,
      severity: config.requireLpBurned ? 'critical' : 'warning',
      reason: lpPass
        ? `${lpMax.toFixed(0)}% of LP removed — rug pull via liquidity removal blocked`
        : lpMax > 0
        ? `Only ${lpMax.toFixed(0)}% locked — remaining LP could be pulled`
        : 'LP not burned or locked — dev can drain liquidity at any time',
    });

    // ── HOLDER DISTRIBUTION ─────────────────────────────────────────────────
    checks.push({
      id: 'creator_pct', category: 'Holder Distribution',
      label: 'Creator/Dev wallet concentration',
      threshold: `≤${config.maxCreatorPct}%`,
      actual: `${gp.creatorPct.toFixed(2)}%`,
      pass: gp.creatorPct <= config.maxCreatorPct,
      severity: 'warning',
      reason: gp.creatorPct > config.maxCreatorPct
        ? `Creator holds ${gp.creatorPct.toFixed(1)}% — dump risk (limit is ${config.maxCreatorPct}%)`
        : `Creator only holds ${gp.creatorPct.toFixed(1)}%`,
    });

    checks.push({
      id: 'top10_pct', category: 'Holder Distribution',
      label: 'Top 10 wallets combined',
      threshold: `≤${config.maxTop10Pct}%`,
      actual: `${gp.top10Pct.toFixed(1)}%`,
      pass: gp.top10Pct <= config.maxTop10Pct,
      severity: 'warning',
      reason: gp.top10Pct > config.maxTop10Pct
        ? `Concentrated: top 10 hold ${gp.top10Pct.toFixed(0)}% — coordinated dump possible`
        : `Decentralised: top 10 hold ${gp.top10Pct.toFixed(0)}%`,
    });

    checks.push({
      id: 'holder_count', category: 'Holder Distribution',
      label: 'Unique holder count',
      threshold: `≥${config.minHolderCount}`,
      actual: `${gp.holderCount.toLocaleString()} holders`,
      pass: gp.holderCount >= config.minHolderCount,
      severity: 'warning',
      reason: gp.holderCount < config.minHolderCount
        ? `Only ${gp.holderCount} holders — too concentrated, ${config.minHolderCount} required`
        : `${gp.holderCount} holders — organic distribution`,
    });
  }

  // ── RUGCHECK ────────────────────────────────────────────────────────────────
  if (rc) {
    checks.push({
      id: 'rugcheck_rating', category: 'RugCheck',
      label: 'RugCheck overall rating',
      threshold: 'good / warn (not danger)',
      actual: `${rc.rating} (score ${rc.score ?? '?'})`,
      pass: rc.rating !== 'danger',
      severity: rc.rating === 'danger' ? 'critical' : 'warning',
      reason: rc.rating === 'good'
        ? 'RugCheck rates this token as safe'
        : rc.rating === 'warn'
        ? 'RugCheck flagged warnings — review carefully'
        : 'RugCheck rates this as DANGER — high rug probability',
    });

    const dangerRisks = (rc.risks || []).filter(r => r.level === 'danger' || r.score > 500);
    checks.push({
      id: 'rugcheck_risks', category: 'RugCheck',
      label: 'RugCheck danger risk items',
      threshold: '0 danger items',
      actual: dangerRisks.length === 0 ? 'None found ✓' : `${dangerRisks.length} danger item(s)`,
      pass: dangerRisks.length === 0,
      severity: 'critical',
      reason: dangerRisks.length > 0
        ? `Danger risks: ${dangerRisks.map(r => r.name || r.description || 'unknown').slice(0, 3).join(', ')}`
        : 'No critical risk items detected',
    });
  }

  // ── MARKET METRICS ─────────────────────────────────────────────────────────
  if (pair) {
    checks.push({
      id: 'mcap_range', category: 'Market Metrics',
      label: 'Market cap within target range',
      threshold: `≤$${(config.maxMcap / 1000).toFixed(0)}K`,
      actual: mcap > 0 ? `$${(mcap / 1000).toFixed(1)}K` : 'Unknown',
      pass: mcap > 0 && mcap <= config.maxMcap,
      severity: 'info',
      reason: mcap > config.maxMcap
        ? `MC $${(mcap/1000).toFixed(0)}K exceeds configured limit of $${(config.maxMcap/1000).toFixed(0)}K`
        : mcap === 0 ? 'Mcap unknown'
        : `MC $${(mcap/1000).toFixed(1)}K — within target range`,
    });

    checks.push({
      id: 'liquidity', category: 'Market Metrics',
      label: 'Liquidity depth',
      threshold: `≥$${(config.minLiquidity / 1000).toFixed(0)}K`,
      actual: `$${(liquidity / 1000).toFixed(1)}K`,
      pass: liquidity >= config.minLiquidity,
      severity: 'warning',
      reason: liquidity < config.minLiquidity
        ? `Only $${(liquidity/1000).toFixed(1)}K liquidity — hard to exit cleanly`
        : `$${(liquidity/1000).toFixed(1)}K — sufficient to trade`,
    });

    checks.push({
      id: 'liq_mcap_ratio', category: 'Market Metrics',
      label: 'Liquidity / Market Cap ratio',
      threshold: '≥10% (1:10)',
      actual: `${liqMcap.toFixed(1)}%`,
      pass: liqMcap >= 10,
      severity: 'warning',
      reason: liqMcap < 10
        ? `Only ${liqMcap.toFixed(0)}% Liq/MC — thin liquidity relative to mcap`
        : `${liqMcap.toFixed(0)}% Liq/MC — healthy ratio`,
    });

    const agePassed = ageMins !== null && ageMins <= config.maxAgeMins;
    checks.push({
      id: 'age', category: 'Market Metrics',
      label: 'Token age within fresh window',
      threshold: `≤${config.maxAgeMins >= 60 ? (config.maxAgeMins/60).toFixed(0)+'h' : config.maxAgeMins+'m'}`,
      actual: ageMins !== null ? (ageMins < 60 ? `${ageMins.toFixed(0)}m` : `${(ageMins/60).toFixed(1)}h`) : 'Unknown',
      pass: agePassed,
      severity: 'info',
      reason: !agePassed
        ? `Token is ${(ageMins/60).toFixed(1)}h old — beyond the ${(config.maxAgeMins/60).toFixed(0)}h fresh window`
        : ageMins < 10 ? 'Very new (<10m) — sniper bot risk'
        : 'Age within fresh window',
    });

    checks.push({
      id: 'volume', category: 'Market Metrics',
      label: 'Trading volume (24h)',
      threshold: '>$1K',
      actual: formatVolCheck(vol24h),
      pass: vol24h >= 1000,
      severity: 'info',
      reason: vol24h < 500 ? 'Negligible volume — no real trading'
        : vol24h < 1000 ? 'Low volume — minimal activity'
        : `$${(vol24h/1000).toFixed(1)}K daily volume`,
    });

    checks.push({
      id: 'vol_accel', category: 'Market Metrics',
      label: 'Volume acceleration (not spike)',
      threshold: '<10× hourly avg (no wash trade)',
      actual: hourlyAvg > 0 ? `${volAccel.toFixed(1)}× avg` : 'Insufficient data',
      pass: hourlyAvg === 0 || volAccel <= 10,
      severity: 'warning',
      reason: volAccel > 10
        ? `${volAccel.toFixed(0)}× spike vs 6h average — possible wash trading`
        : 'Volume profile looks organic',
    });
  }

  return checks;
}

function formatVolCheck(n) {
  if (!n || n === 0) return '$0';
  if (n >= 1000000) return `$${(n/1000000).toFixed(2)}M`;
  if (n >= 1000)    return `$${(n/1000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

// ── Fetch best Solana pair for any CA from DexScreener ───────────────────────
async function fetchPairForCA(ca) {
  try {
    const res = await fetch(
      `${DEXSCREENER_BASE}/latest/dex/tokens/${ca}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const pairs = (data.pairs || []).filter(p => p.chainId === 'solana');
    if (!pairs.length) return null;
    // Prefer raydium/pumpswap, then highest liquidity
    return [...pairs].sort((a, b) => {
      const prio = d => { const id = (d.dexId||'').toLowerCase(); return id==='raydium'?3:id==='pumpswap'?2:id==='meteora'?1:0; };
      const dp = prio(b) - prio(a);
      return dp !== 0 ? dp : (b.liquidity?.usd||0) - (a.liquidity?.usd||0);
    })[0];
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
export function useGuardian() {
  const [config, setConfigState] = useState(() => ({
    ...GUARDIAN_DEFAULT_CONFIG,
    ...safeLoad(GUARDIAN_CONFIG_KEY, {}),
  }));
  const [scanning, setScanning]     = useState(false);
  const [candidates, setCandidates] = useState(() => safeLoad(GUARDIAN_SCAN_KEY, []));
  const [lastScan, setLastScan]     = useState(null);
  const [scanLog, setScanLog]       = useState([]);
  const [history, setHistory]       = useState(() => safeLoad(GUARDIAN_HISTORY_KEY, []));
  const [checked, setChecked]       = useState(0);
  const [total, setTotal]           = useState(0);

  const scanningRef = useRef(false);
  const intervalRef = useRef(null);
  const configRef   = useRef(config);
  configRef.current = config;

  // ── Token Checker state ───────────────────────────────────────────────────
  const [checking, setChecking]       = useState(false);
  const [checkResult, setCheckResult] = useState(null);  // last analyzed token
  const [checkError, setCheckError]   = useState('');

  // ── Analyze a single CA against the current config ────────────────────────
  const analyzeToken = useCallback(async (ca) => {
    const mint = (ca || '').trim();
    if (!mint || mint.length < 32) {
      setCheckError('Invalid address — must be a valid Solana CA (32–44 chars)');
      return;
    }
    setChecking(true);
    setCheckResult(null);
    setCheckError('');

    const cfg = configRef.current;
    try {
      // 1. Fetch DexScreener pair data
      const pair = await fetchPairForCA(mint);

      // 2. Fetch safety APIs in parallel
      const [rugcheckRes, goplusRes] = await Promise.allSettled([
        fetchRugCheck(mint),
        fetchGoPlus(mint),
      ]);
      const rc = rugcheckRes.status === 'fulfilled' ? rugcheckRes.value : null;
      const gp = goplusRes.status  === 'fulfilled' ? goplusRes.value  : null;

      // 3. Build a detailed check list — every condition evaluated individually
      //    so the UI can show a full pass/fail table
      const checks = buildDetailedChecklist(pair, rc, gp, cfg);

      // 4. Run full scorer for the overall decision
      const scoreResult    = pair ? scoreToken(pair) : null;
      const guardianResult = computeGuardianScore(pair || {}, rc, gp, cfg);

      setCheckResult({
        mint,
        pair,
        rc,
        gp,
        checks,
        scoreResult,
        guardianResult,
        checkedAt:   Date.now(),
        configUsed:  { ...cfg },
        symbol:      pair?.baseToken?.symbol || mint.slice(0, 8) + '...',
        name:        pair?.baseToken?.name   || '',
        mcap:        pair?.marketCap || pair?.fdv || 0,
        liquidity:   pair?.liquidity?.usd || 0,
        vol24h:      pair?.volume?.h24 || 0,
        ageMins:     pair?.pairCreatedAt ? (Date.now() - pair.pairCreatedAt) / 60000 : null,
        pairAddress: pair?.pairAddress || null,
      });
    } catch (e) {
      setCheckError(`Analysis failed: ${e.message}`);
    } finally {
      setChecking(false);
    }
  }, []);

  // Persist config whenever it changes
  useEffect(() => { safeSave(GUARDIAN_CONFIG_KEY, config); }, [config]);

  const updateConfig = useCallback((patch) => {
    setConfigState(prev => ({ ...prev, ...patch }));
  }, []);

  const resetConfig = useCallback(() => {
    setConfigState(GUARDIAN_DEFAULT_CONFIG);
    safeSave(GUARDIAN_CONFIG_KEY, GUARDIAN_DEFAULT_CONFIG);
  }, []);

  const addLog = useCallback((msg) => {
    setScanLog(prev => [`${new Date().toLocaleTimeString()} ${msg}`, ...prev].slice(0, 50));
  }, []);

  // ── Full scan using current config ────────────────────────────────────────
  const scan = useCallback(async () => {
    if (scanningRef.current) return;
    scanningRef.current = true;
    setScanning(true);
    setChecked(0);

    const cfg = configRef.current;
    addLog(`🔍 Scanning — MC <$${(cfg.maxMcap / 1000).toFixed(0)}K · liq ≥$${(cfg.minLiquidity / 1000).toFixed(0)}K · age ≤${cfg.maxAgeMins}m`);

    try {
      const raw = await fetchGuardianCandidates(cfg);
      setTotal(raw.length);
      addLog(`📥 ${raw.length} candidates under $${(cfg.maxMcap / 1000).toFixed(0)}K mcap`);

      if (raw.length === 0) {
        addLog('⚠️ No fresh candidates matching filters — try relaxing thresholds');
        setCandidates([]);
        safeSave(GUARDIAN_SCAN_KEY, []);
        setLastScan(Date.now());
        setScanning(false);
        scanningRef.current = false;
        return;
      }

      const results = [];

      for (let i = 0; i < Math.min(raw.length, 20); i++) {
        const pair = raw[i];
        const mint = pair.baseToken?.address;
        const sym  = pair.baseToken?.symbol || '?';
        setChecked(i + 1);
        addLog(`🔬 ${sym} (${mint?.slice(0, 8)}...) — checking RugCheck + GoPlus...`);

        const [rugcheck, goplus] = await Promise.allSettled([
          fetchRugCheck(mint),
          fetchGoPlus(mint),
        ]);

        const rc = rugcheck.status === 'fulfilled' ? rugcheck.value : null;
        const gp = goplus.status  === 'fulfilled' ? goplus.value  : null;

        const scoreResult    = scoreToken(pair);
        const guardianResult = computeGuardianScore(pair, rc, gp, cfg);

        const emoji = guardianResult.decision === 'STRONG_BUY' ? '🟢'
          : guardianResult.decision === 'WATCH' ? '🟡' : '🔴';
        addLog(`${emoji} ${sym}: ${guardianResult.status} · risk ${guardianResult.riskScore}/100${guardianResult.instantFail ? ' · FAIL: ' + guardianResult.instantFail.slice(0, 40) : ''}`);

        if (guardianResult.decision !== 'REJECT') {
          results.push({
            pair, mint,
            symbol:        sym,
            name:          pair.baseToken?.name || sym,
            scoreResult,
            guardianResult,
            rugcheck:      rc,
            goplus:        gp,
            scannedAt:     Date.now(),
            mcap:          pair.marketCap || pair.fdv || 0,
            liquidity:     pair.liquidity?.usd || 0,
            vol24h:        pair.volume?.h24 || 0,
            ageMins:       pair.pairCreatedAt ? (Date.now() - pair.pairCreatedAt) / 60000 : 0,
            pairAddress:   pair.pairAddress,
            configSnapshot: { ...cfg }, // snapshot config used for this scan
          });
        }
      }

      // Sort: STRONG_BUY first, then lowest risk score
      const sorted = results
        .sort((a, b) => {
          if (a.guardianResult.decision === 'STRONG_BUY' && b.guardianResult.decision !== 'STRONG_BUY') return -1;
          if (b.guardianResult.decision === 'STRONG_BUY' && a.guardianResult.decision !== 'STRONG_BUY') return 1;
          return a.guardianResult.riskScore - b.guardianResult.riskScore;
        })
        .slice(0, cfg.maxCandidates);

      setCandidates(sorted);
      safeSave(GUARDIAN_SCAN_KEY, sorted);

      if (sorted.length > 0) {
        setHistory(prev => {
          const updated = [...sorted, ...prev].slice(0, 100);
          safeSave(GUARDIAN_HISTORY_KEY, updated);
          return updated;
        });
      }

      const sb = sorted.filter(c => c.guardianResult.decision === 'STRONG_BUY').length;
      const wa = sorted.filter(c => c.guardianResult.decision === 'WATCH').length;
      addLog(`✅ Done — ${sb} STRONG BUY · ${wa} WATCH · ${raw.length - results.length} rejected`);
      setLastScan(Date.now());

    } catch (e) {
      addLog(`❌ Scan error: ${e.message}`);
    } finally {
      setScanning(false);
      scanningRef.current = false;
    }
  }, [addLog]);

  // ── Auto-scan on mount + reschedule when interval config changes ──────────
  useEffect(() => {
    scan();
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(scan, config.scanIntervalMins * 60 * 1000);
    return () => clearInterval(intervalRef.current);
  }, [scan, config.scanIntervalMins]); // re-schedule when interval changes

  const clearHistory = useCallback(() => {
    setHistory([]);
    safeSave(GUARDIAN_HISTORY_KEY, []);
  }, []);

  return {
    config, updateConfig, resetConfig,
    scanning, candidates, lastScan,
    scanLog, history,
    checked, total,
    scan, clearHistory,
    // Token checker
    analyzeToken, checking, checkResult, checkError,
  };
}
