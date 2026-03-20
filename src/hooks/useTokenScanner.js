import { useState, useEffect, useCallback, useRef } from 'react';
import { getRefreshInterval } from '../utils/config';
import {
  loadCachedTokens, saveCachedTokens,
  loadLastUpdate,   saveLastUpdate,
  loadScanCount,    saveScanCount,
} from '../utils/storage';

// ─────────────────────────────────────────────────────────────────────────────
// useTokenScanner v2 — Server-side architecture
//
// Scanning now happens in /api/scan (Vercel cron, every 60s, 24/7).
// This hook just polls /api/tokens every 30s — fast KV read only.
// Falls back to client-side DexScreener scan if server unavailable.
// ─────────────────────────────────────────────────────────────────────────────

const DEX_BASE   = 'https://api.dexscreener.com';
const CUTOFF_48H = 48 * 60 * 60 * 1000;
const VALID_DEXES = new Set(['pumpswap', 'raydium', 'meteora', 'orca']);

// Compact client-side scorer for fallback mode
function scoreTokenFallback(token) {
  const ageMins   = token.pairCreatedAt ? (Date.now() - token.pairCreatedAt) / 60000 : 9999;
  const vol24h    = token.volume?.h24 || 0;
  const vol6h     = token.volume?.h6  || 0;
  const vol1h     = token.volume?.h1  || 0;
  const liquidity = token.liquidity?.usd || 0;
  const mcap      = token.marketCap || 0;
  const txns      = token.txns?.h24 || {};
  const txBuys    = txns.buys || 0; const txSells = txns.sells || 0;
  const totalTxns = txBuys + txSells;
  const buyRatio  = totalTxns > 0 ? txBuys / totalTxns : 0.5;
  const p1h = token.priceChange?.h1 || 0;
  const p6h = token.priceChange?.h6 || 0;
  const p24h= token.priceChange?.h24|| 0;
  const p5m = token.priceChange?.m5 || 0;

  let spd = ageMins<=20?18:ageMins<=30?15:ageMins<=60?11:ageMins<=120?7:ageMins<=360?3:0;
  if (spd>=11&&vol1h<500) spd=Math.max(0,spd-5);

  const avg6h = vol6h>0?vol6h/6:0, accel=avg6h>0?vol1h/avg6h:1;
  let vb = vol24h>=500000?16:vol24h>=200000?13:vol24h>=100000?10:vol24h>=50000?7:vol24h>=10000?4:vol24h>=2000?2:0;
  let ab = accel>=3?6:accel>=2?4:accel>=1.5?2:accel<0.4?-3:0;
  const volV = Math.max(0,Math.min(22,vb+ab));

  const sus=Math.max(p1h,p6h,p24h);
  let prs=sus>=500?16:sus>=200?13:sus>=100?10:sus>=50?7:sus>=20?4:sus>=0?2:0;
  if(p5m>5&&sus>0)prs=Math.min(16,prs+1);

  let bs=buyRatio>=0.75?12:buyRatio>=0.65?10:buyRatio>=0.55?7:buyRatio>=0.45?4:buyRatio>=0.35?2:0;
  if(totalTxns<50)bs=Math.min(bs,3);
  let ls=liquidity>=200000?8:liquidity>=100000?7:liquidity>=50000?5:liquidity>=20000?3:liquidity>=5000?1:0;
  const tph=totalTxns/Math.max(1,Math.min(ageMins/60,24));
  let txs=tph>=2000?12:tph>=800?10:tph>=300?7:tph>=100?5:tph>=30?3:1;
  const vl=liquidity>0?vol24h/liquidity:0;
  let vls=vl>=50&&liquidity>=20000?6:vl>=20&&liquidity>=10000?5:vl>=10?4:vl>=5?2:vl>=1?1:0;
  const nm=(token.baseToken?.name||'').toLowerCase()+' '+(token.baseToken?.symbol||'').toLowerCase();
  let soc=0;
  if(['sdk','mcp','agent','api'].some(k=>nm.includes(k)))soc=6;
  else if(['dev','build','code'].filter(k=>nm.includes(k)).length>=2)soc=5;
  else if(['dev','build','code'].some(k=>nm.includes(k)))soc=3;
  else if(['ai','bot','web3'].some(k=>nm.includes(k)))soc=1;

  const raw=spd+volV+prs+bs+ls+txs+vls+soc;
  let mc=mcap>0&&mcap<50000?3:mcap<200000?1:mcap>=500000&&mcap<1500000?-2:mcap>=1500000?-5:0;
  const fm=Math.max(0.4,1-(ageMins/480));
  const total=Math.max(0,Math.min(100,Math.round((raw+mc)*fm)));
  let grade='D',recommendation='NO FIT';
  if(total>=78){grade='S';recommendation='STRONG FIT';}
  else if(total>=62){grade='A';recommendation='GOOD FIT';}
  else if(total>=46){grade='B';recommendation='MODERATE FIT';}
  else if(total>=30){grade='C';recommendation='WEAK FIT';}
  return {scores:{graduationSpeed:spd,volumeVelocity:volV,priceMultiple:prs,buyPressure:bs,liquidityDepth:ls,txFrequency:txs,vlEfficiency:vls,socialSignal:soc},total,grade,recommendation,mcapModifier:mc,freshnessMultiplier:fm};
}

function isValidPairFallback(p) {
  if (p.chainId !== 'solana') return false;
  if (!VALID_DEXES.has((p.dexId||'').toLowerCase())) return false;
  if (!p.priceUsd || parseFloat(p.priceUsd)<=0) return false;
  if (!p.pairCreatedAt || p.pairCreatedAt < Date.now()-CUTOFF_48H) return false;
  const mc=p.marketCap||p.fdv||0;
  if (mc>0&&mc<1000) return false;
  if (mc>5000000) return false;
  if ((p.volume?.h24||0)<500) return false;
  if ((p.liquidity?.usd||0)<1000) return false;
  return !!(p.baseToken?.address && p.baseToken?.symbol);
}

// ── Exports ────────────────────────────────────────────────────────────────────

export function useTokenScanner() {
  const [tokens,     setTokens]     = useState(() => loadCachedTokens() || []);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [lastUpdate, setLastUpdate] = useState(() => loadLastUpdate());
  const [scanCount,  setScanCount]  = useState(() => loadScanCount());
  const [serverMode, setServerMode] = useState(true);

  const intervalRef = useRef(null);
  const scanningRef = useRef(false);
  const mountedRef  = useRef(true);
  const detMapRef   = useRef({});

  const fetchFromServer = useCallback(async () => {
    const res = await fetch('/api/tokens', { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Server HTTP ${res.status}`);
    const data = await res.json();
    if (!data.kvReady) throw new Error('KV_NOT_CONFIGURED');
    return data; // { tokens, scanCount, lastUpdate }
  }, []);

  const fetchFromClient = useCallback(async () => {
    const [r1, r2] = await Promise.allSettled([
      fetch(`${DEX_BASE}/latest/dex/search?q=pumpswap`, { headers: { Accept: 'application/json' } }),
      fetch(`${DEX_BASE}/latest/dex/search?q=raydium+solana+pump`, { headers: { Accept: 'application/json' } }),
    ]);
    const pairs = [];
    for (const r of [r1,r2]) {
      if (r.status==='fulfilled'&&r.value.ok) {
        const d=await r.value.json();
        pairs.push(...(d.pairs||[]).filter(p=>p.chainId==='solana'&&p.pairCreatedAt>Date.now()-CUTOFF_48H));
      }
    }
    const seen=new Set();
    const now=Date.now();
    const processed = pairs
      .filter(p=>{ if(!p.pairAddress||seen.has(p.pairAddress))return false; seen.add(p.pairAddress); return true; })
      .filter(isValidPairFallback)
      .map(token=>{
        const id=token.pairAddress||token.baseToken?.address;
        const pr=parseFloat(token.priceUsd||0);
        const sc=scoreTokenFallback(token);
        let det=detMapRef.current[id];
        if(!det){det={detectedAt:now,priceAtDetection:pr,ath:pr,athAt:now};detMapRef.current[id]=det;}
        else if(pr>det.ath){det={...det,ath:pr,athAt:now};detMapRef.current[id]=det;}
        return{...token,_score:sc,_id:id,_detectedAt:det.detectedAt,_priceAtDetection:det.priceAtDetection,_ath:det.ath,_athAt:det.athAt,_gainSinceDetection:det.priceAtDetection>0?((pr-det.priceAtDetection)/det.priceAtDetection)*100:0,_athGain:det.priceAtDetection>0?((det.ath-det.priceAtDetection)/det.priceAtDetection)*100:0};
      })
      .sort((a,b)=>b._score.total-a._score.total);
    return { tokens: processed, scanCount: processed.length, lastUpdate: now, kvReady: false };
  }, []);

  const scan = useCallback(async () => {
    if (scanningRef.current || !mountedRef.current) return;
    scanningRef.current = true;
    try {
      let data;
      try {
        data = await fetchFromServer();
        if (mountedRef.current) setServerMode(true);
      } catch (serverErr) {
        const isConfig = serverErr.message === 'KV_NOT_CONFIGURED';
        if (!isConfig) console.warn('[scanner] server unavailable, falling back to client scan:', serverErr.message);
        data = await fetchFromClient();
        if (mountedRef.current) setServerMode(false);
      }
      if (!mountedRef.current) return;
      const { tokens: t, scanCount: sc, lastUpdate: lu } = data;
      setTokens(t);
      setLastUpdate(lu);
      setScanCount(sc);
      setError(null);
      saveCachedTokens(t);
      saveLastUpdate(lu);
      saveScanCount(sc);
    } catch (e) {
      if (mountedRef.current) { setError(e.message); setLastUpdate(Date.now()); }
    } finally {
      if (mountedRef.current) setLoading(false);
      scanningRef.current = false;
    }
  }, [fetchFromServer, fetchFromClient]);

  useEffect(() => {
    mountedRef.current = true;
    const cached = loadCachedTokens();
    if (cached && cached.length > 0) { setTokens(cached); setLoading(false); }
    scan();
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(scan, getRefreshInterval());
    return () => {
      mountedRef.current = false;
      clearInterval(intervalRef.current);
    };
  }, [scan]);

  const refresh = useCallback(() => { setLoading(true); scan(); }, [scan]);

  return { tokens, loading, error, lastUpdate, scanCount, refresh, serverMode };
}

export async function triggerServerScan() {
  try {
    const res = await fetch('/api/scan', { method: 'POST', headers: { Accept: 'application/json' } });
    return res.ok;
  } catch { return false; }
}

export async function fetchTokenDetails(address) {
  try {
    const res = await fetch(`${DEX_BASE}/latest/dex/tokens/${address}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    return data.pairs?.[0] || null;
  } catch { return null; }
}
