import { useState, useEffect, useRef, useCallback } from 'react';
import { getHeliusKey } from '../utils/config';

// ─────────────────────────────────────────────────────────────────────────────
// COPY-TRADE WALLET TRACKER
// Polls Helius getSignaturesForAddress every 60s for up to 3 tracked wallets.
// Detects Raydium swap buy transactions and fires alerts.
//
// No custodial risk — only reads public on-chain data.
// Uses DexScreener to enrich the token data after detection.
// ─────────────────────────────────────────────────────────────────────────────

const WALLETS_KEY     = 'pumpsdk_tracked_wallets';   // persisted wallet list
const SEEN_SIGS_KEY   = 'pumpsdk_wallet_seen_sigs';  // seen tx signatures
const MAX_WALLETS     = 3;
const POLL_INTERVAL   = 60000; // 60s
const MAX_SEEN_SIGS   = 300;

// Raydium program IDs to detect swap transactions
const RAYDIUM_PROGRAMS = new Set([
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // AMM v4
  'CPMDWBwJDtYax9qW7AyRuVC19Cc4L4Vcy4n2BHAbHkCW', // CPMM
  'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK', // CLMM
]);

function getHeliusRestUrl() {
  const key = getHeliusKey();
  if (!key) return null;
  return `https://mainnet.helius-rpc.com/?api-key=${key}`;
}

function loadWallets() {
  try { return JSON.parse(localStorage.getItem(WALLETS_KEY) || '[]'); } catch { return []; }
}
function saveWallets(arr) {
  try { localStorage.setItem(WALLETS_KEY, JSON.stringify(arr.slice(0, MAX_WALLETS))); } catch {}
}
function loadSeenSigs() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_SIGS_KEY) || '[]')); } catch { return new Set(); }
}
function saveSeenSigs(set) {
  try { localStorage.setItem(SEEN_SIGS_KEY, JSON.stringify([...set].slice(-MAX_SEEN_SIGS))); } catch {}
}

// Fetch recent signatures for a wallet via Helius RPC
async function fetchRecentSignatures(wallet, heliusUrl) {
  const body = {
    jsonrpc: '2.0', id: 1,
    method: 'getSignaturesForAddress',
    params: [wallet, { limit: 20, commitment: 'confirmed' }],
  };
  const res = await fetch(heliusUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.result || [];
}

// Parse a transaction to find bought token mint
async function fetchTransactionMint(sig, heliusUrl) {
  const body = {
    jsonrpc: '2.0', id: 1,
    method: 'getTransaction',
    params: [sig, { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }],
  };
  const res = await fetch(heliusUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const tx   = data.result;
  if (!tx) return null;

  // Check if any account key is a Raydium program
  const accountKeys = tx.transaction?.message?.accountKeys || [];
  const isRaydium   = accountKeys.some(k => {
    const pubkey = typeof k === 'string' ? k : k.pubkey;
    return RAYDIUM_PROGRAMS.has(pubkey);
  });
  if (!isRaydium) return null;

  // Find the token mint from post token balances
  const postBalances = tx.meta?.postTokenBalances || [];
  const preBalances  = tx.meta?.preTokenBalances  || [];

  // The "bought" token has increased balance
  for (const post of postBalances) {
    const pre = preBalances.find(p => p.accountIndex === post.accountIndex);
    const preAmt  = parseFloat(pre?.uiTokenAmount?.uiAmount || 0);
    const postAmt = parseFloat(post.uiTokenAmount?.uiAmount || 0);
    if (postAmt > preAmt && post.mint && post.mint !== 'So11111111111111111111111111111111111111112') {
      return post.mint; // This is the token they bought
    }
  }
  return null;
}

// Enrich with DexScreener data
async function enrichMint(mint) {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const pairs = (data.pairs || []).filter(p => p.chainId === 'solana');
    if (!pairs.length) return null;
    pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
    return pairs[0];
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
export function useWalletTracker() {
  const [wallets, setWallets]       = useState(loadWallets);
  const [alerts, setAlerts]         = useState([]);
  const [checking, setChecking]     = useState(false);
  const [lastCheck, setLastCheck]   = useState(null);

  const seenSigsRef  = useRef(loadSeenSigs());
  const intervalRef  = useRef(null);
  const mountedRef   = useRef(true);

  const addWallet = useCallback((address) => {
    const addr = address.trim();
    if (!addr || addr.length < 32) return false;
    const current = loadWallets();
    if (current.includes(addr) || current.length >= MAX_WALLETS) return false;
    const updated = [...current, addr];
    saveWallets(updated);
    setWallets(updated);
    return true;
  }, []);

  const removeWallet = useCallback((address) => {
    const updated = loadWallets().filter(a => a !== address);
    saveWallets(updated);
    setWallets(updated);
  }, []);

  const checkWallets = useCallback(async () => {
    const heliusUrl = getHeliusRestUrl();
    if (!heliusUrl) return;
    const currentWallets = loadWallets();
    if (!currentWallets.length || checking) return;

    setChecking(true);
    const newAlerts = [];

    for (const wallet of currentWallets) {
      try {
        const sigs = await fetchRecentSignatures(wallet, heliusUrl);
        for (const sigInfo of sigs.slice(0, 10)) {
          const sig = sigInfo.signature;
          if (seenSigsRef.current.has(sig)) continue;
          seenSigsRef.current.add(sig);

          // Skip failed transactions
          if (sigInfo.err) continue;

          const mint = await fetchTransactionMint(sig, heliusUrl);
          if (!mint || !mountedRef.current) continue;

          // Enrich with market data
          const pair = await enrichMint(mint);
          if (!mountedRef.current) break;

          newAlerts.push({
            id:        `wallet-${sig.slice(0, 12)}-${Date.now()}`,
            type:      'WALLET_BUY',
            wallet:    wallet.slice(0, 6) + '...' + wallet.slice(-4),
            walletFull: wallet,
            signature: sig,
            mint,
            token:     pair ? {
              symbol:   pair.baseToken?.symbol || mint.slice(0, 6),
              name:     pair.baseToken?.name || '',
              priceUsd: pair.priceUsd,
              volume24h: pair.volume?.h24 || 0,
              liquidity: pair.liquidity?.usd || 0,
              pairAddress: pair.pairAddress,
              marketCap: pair.marketCap || 0,
            } : { symbol: mint.slice(0, 8) + '...', mint },
            detectedAt: Date.now(),
            read: false,
          });
        }
      } catch {
        // Silently skip failed wallet checks
      }
    }

    saveSeenSigs(seenSigsRef.current);

    if (newAlerts.length > 0 && mountedRef.current) {
      setAlerts(prev => [...newAlerts, ...prev].slice(0, 100));
    }

    if (mountedRef.current) {
      setChecking(false);
      setLastCheck(Date.now());
    }
  }, [checking]);

  useEffect(() => {
    mountedRef.current = true;
    if (wallets.length > 0) {
      setTimeout(() => checkWallets(), 5000); // initial check after 5s
    }
    intervalRef.current = setInterval(checkWallets, POLL_INTERVAL);
    return () => {
      mountedRef.current = false;
      clearInterval(intervalRef.current);
    };
  }, [wallets.length, checkWallets]);

  const markRead = useCallback((id) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, read: true } : a));
  }, []);

  const clearAlerts = useCallback(() => setAlerts([]), []);

  const unreadCount = alerts.filter(a => !a.read).length;
  const isAvailable = !!getHeliusRestUrl();

  return {
    wallets, addWallet, removeWallet,
    alerts, unreadCount, markRead, clearAlerts,
    checking, lastCheck,
    isAvailable,
    maxWallets: MAX_WALLETS,
  };
}
