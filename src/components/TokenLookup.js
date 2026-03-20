import React, { useState, useCallback } from 'react';
import {
  Search, Loader, AlertTriangle, ExternalLink,
  RefreshCw, X, History, Bookmark, Check
} from 'lucide-react';
import { scoreToken, formatVolume, getMcapPhase, getSignalTags, timeAgo } from '../utils/scoring';
import { useForecast } from '../agents/useForecast';
import TokenCard from './TokenCard';

// ── Persist recent lookups ────────────────────────────────────────────────────
const HISTORY_KEY = 'pumpsdk_lookup_history';
const MAX_HISTORY = 10;

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}
function saveHistory(items) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY))); } catch {}
}

// ── Build a synthetic token object that matches scanner format ────────────────
function buildSyntheticToken(rawPair) {
  const id = rawPair.pairAddress || rawPair.baseToken?.address;
  const currentPrice = parseFloat(rawPair.priceUsd || 0);
  const scoreResult = scoreToken(rawPair);
  const now = Date.now();

  return {
    ...rawPair,
    _score: scoreResult,
    _id: id,
    _detectedAt: now,
    _priceAtDetection: currentPrice,
    _ath: currentPrice,
    _athAt: now,
    _gainSinceDetection: 0,
    _athGain: 0,
  };
}

// ── Recent history pill ───────────────────────────────────────────────────────
function HistoryPill({ item, onClick, onRemove }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      padding: '5px 10px', borderRadius: '6px',
      background: '#0a1520', border: '1px solid #1e3a52',
      cursor: 'pointer', transition: 'border-color 0.15s',
    }}
      onMouseEnter={e => e.currentTarget.style.borderColor = '#3a6a8a'}
      onMouseLeave={e => e.currentTarget.style.borderColor = '#1e3a52'}
    >
      <button onClick={onClick} style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '1px',
      }}>
        <span style={{ fontSize: '11px', color: '#cde8ff', fontFamily: 'JetBrains Mono', fontWeight: '700' }}>
          ${item.symbol}
        </span>
        <span style={{ fontSize: '9px', color: '#3a6a8a', fontFamily: 'JetBrains Mono' }}>
          {item.address.slice(0, 8)}...
        </span>
      </button>
      <button onClick={e => { e.stopPropagation(); onRemove(); }} style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
        color: '#3a6a8a', display: 'flex', alignItems: 'center',
      }}>
        <X size={10} />
      </button>
    </div>
  );
}

// ── Main TokenLookup component ────────────────────────────────────────────────
export default function TokenLookup({ onAskAI, addToWatchlist, isWatchlisted }) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [token, setToken] = useState(null);
  const [allPairs, setAllPairs] = useState([]);
  const [selectedPairIdx, setSelectedPairIdx] = useState(0);
  const [history, setHistory] = useState(loadHistory);
  const [watchlistAdding, setWatchlistAdding] = useState(false);
  const [watchlistAdded, setWatchlistAdded] = useState(false);

  const { forecasts, loading: forecastLoading, getForecast } = useForecast();

  const lookup = useCallback(async (addressInput) => {
    const addr = (addressInput || input).trim().replace(/\s/g, '');
    if (!addr) return;

    setLoading(true);
    setError('');
    setToken(null);
    setAllPairs([]);
    setSelectedPairIdx(0);

    try {
      // DexScreener /tokens/:address returns ALL pairs for a token
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addr}`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();

      const pairs = data.pairs || [];
      if (pairs.length === 0) {
        setError("No trading pairs found for this address. Check it's a valid Solana token CA.");
        setLoading(false);
        return;
      }

      // Sort pairs: prefer solana + pumpswap/raydium, highest liquidity first
      const sorted = [...pairs].sort((a, b) => {
        const aScore = (a.chainId === 'solana' ? 100 : 0) + (a.liquidity?.usd || 0) / 1000;
        const bScore = (b.chainId === 'solana' ? 100 : 0) + (b.liquidity?.usd || 0) / 1000;
        return bScore - aScore;
      });

      const syntheticTokens = sorted.map(buildSyntheticToken);
      setAllPairs(syntheticTokens);
      setToken(syntheticTokens[0]);
      setWatchlistAdded(false); // reset watchlist state for new token

      // Save to history
      const sym = sorted[0].baseToken?.symbol || '???';
      const newEntry = { address: addr, symbol: sym, name: sorted[0].baseToken?.name || '', lookedAt: Date.now() };
      const updated = [newEntry, ...history.filter(h => h.address !== addr)];
      setHistory(updated);
      saveHistory(updated);

      setInput(addr);
    } catch (e) {
      setError(e.message || 'Failed to fetch token data.');
    } finally {
      setLoading(false);
    }
  }, [input, history]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') lookup();
  };

  const handlePairSelect = (idx) => {
    setSelectedPairIdx(idx);
    setToken(allPairs[idx]);
  };

  const removeHistory = (addr) => {
    const updated = history.filter(h => h.address !== addr);
    setHistory(updated);
    saveHistory(updated);
  };

  const currentToken = token;
  const mcapPhase = currentToken ? getMcapPhase(currentToken.marketCap) : null;
  const tags = currentToken ? getSignalTags(currentToken, currentToken._score) : [];

  const handleAddToWatchlist = useCallback(async () => {
    if (!currentToken || !addToWatchlist) return;
    setWatchlistAdding(true);
    const addr = currentToken.baseToken?.address || currentToken.pairAddress;
    await addToWatchlist(addr, currentToken);
    setWatchlistAdded(true);
    setWatchlistAdding(false);
  }, [currentToken, addToWatchlist]);

  const alreadyWatchlisted = currentToken
    ? (watchlistAdded || isWatchlisted?.(currentToken.baseToken?.address || currentToken.pairAddress))
    : false;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Page header */}
      <div>
        <h2 style={{
          fontSize: '18px', fontWeight: '800', fontFamily: 'Syne, sans-serif',
          color: '#e8f4ff', letterSpacing: '-0.02em', marginBottom: '4px',
        }}>
          Token Lookup
        </h2>
        <p style={{ fontSize: '11px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>
          Paste any Solana token contract address — get full strategy score, AI forecast, signals & links
        </p>
      </div>

      {/* Search bar */}
      <div style={{
        background: '#0d1117', border: '1px solid #1a2535',
        borderRadius: '12px', padding: '16px 20px',
      }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={14} color="#3a6a8a" style={{
              position: 'absolute', left: '12px', top: '50%',
              transform: 'translateY(-50%)', pointerEvents: 'none',
            }} />
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Paste contract address (e.g. EPjFWdd5AufqSSqeM2q...)"
              style={{
                width: '100%', padding: '10px 12px 10px 36px',
                background: '#0a0f14', border: '1px solid #1e3a52',
                borderRadius: '8px', color: '#cde8ff',
                fontFamily: 'JetBrains Mono', fontSize: '12px', outline: 'none',
              }}
              onFocus={e => e.target.style.borderColor = '#3a6a8a'}
              onBlur={e => e.target.style.borderColor = '#1e3a52'}
            />
          </div>
          <button
            onClick={() => lookup()}
            disabled={loading || !input.trim()}
            style={{
              padding: '10px 20px', borderRadius: '8px', cursor: loading ? 'not-allowed' : 'pointer',
              background: loading ? '#1a2535' : 'linear-gradient(90deg, #00ff8c22, #00d4ff22)',
              border: `1px solid ${loading ? '#2a3545' : '#00ff8c44'}`,
              color: loading ? '#5a7a94' : '#00ff8c',
              fontFamily: 'JetBrains Mono', fontSize: '12px', fontWeight: '700',
              display: 'flex', alignItems: 'center', gap: '6px',
              transition: 'all 0.2s ease', whiteSpace: 'nowrap',
            }}
          >
            {loading
              ? <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Fetching...</>
              : <><Search size={13} /> Analyze Token</>
            }
          </button>
          {currentToken && (
            <button
              onClick={() => lookup(input)}
              title="Refresh data"
              style={{
                padding: '10px', borderRadius: '8px', cursor: 'pointer',
                background: '#1a2535', border: '1px solid #2a3545',
                color: '#5a7a94', display: 'flex', alignItems: 'center',
              }}
            >
              <RefreshCw size={13} />
            </button>
          )}
        </div>

        {/* Recent history */}
        {history.length > 0 && (
          <div style={{ marginTop: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <History size={10} color="#3a6a8a" />
              <span style={{ fontSize: '9px', color: '#3a6a8a', fontFamily: 'JetBrains Mono' }}>RECENT</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {history.map(item => (
                <HistoryPill
                  key={item.address}
                  item={item}
                  onClick={() => { setInput(item.address); lookup(item.address); }}
                  onRemove={() => removeHistory(item.address)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div style={{
          padding: '14px 18px', background: '#ff444410', border: '1px solid #ff444433',
          borderRadius: '10px', display: 'flex', alignItems: 'flex-start', gap: '10px',
        }}>
          <AlertTriangle size={14} color="#ff4444" style={{ flexShrink: 0, marginTop: '1px' }} />
          <div>
            <div style={{ fontSize: '12px', color: '#ff4444', fontFamily: 'JetBrains Mono', fontWeight: '700', marginBottom: '3px' }}>
              Lookup Failed
            </div>
            <div style={{ fontSize: '11px', color: '#8b9eb0', fontFamily: 'JetBrains Mono' }}>{error}</div>
          </div>
        </div>
      )}

      {/* Multiple pairs selector */}
      {allPairs.length > 1 && (
        <div style={{
          background: '#0d1117', border: '1px solid #1a2535',
          borderRadius: '10px', padding: '14px 18px',
        }}>
          <div style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono', marginBottom: '8px' }}>
            {allPairs.length} TRADING PAIRS FOUND — select one:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {allPairs.map((p, idx) => (
              <button
                key={p.pairAddress || idx}
                onClick={() => handlePairSelect(idx)}
                style={{
                  padding: '5px 12px', borderRadius: '6px', cursor: 'pointer',
                  background: idx === selectedPairIdx ? '#00ff8c15' : '#0a1520',
                  border: `1px solid ${idx === selectedPairIdx ? '#00ff8c66' : '#1e3a52'}`,
                  color: idx === selectedPairIdx ? '#00ff8c' : '#8b9eb0',
                  fontSize: '10px', fontFamily: 'JetBrains Mono', fontWeight: '600',
                }}
              >
                {p.dexId || 'DEX'} · {formatVolume(p.liquidity?.usd)} liq
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Token result */}
      {currentToken && !loading && (
        <div style={{ animation: 'slideIn 0.3s ease forwards' }}>

          {/* Quick stats banner above the card */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '8px', marginBottom: '12px',
          }}>
            {[
              { label: 'CHAIN', value: currentToken.chainId?.toUpperCase() || '—', color: '#00d4ff' },
              { label: 'DEX', value: currentToken.dexId || '—', color: '#a78bfa' },
              { label: 'STRATEGY GRADE', value: `${currentToken._score?.grade} (${currentToken._score?.total}/100)`, color: { S: '#00ff8c', A: '#00d4ff', B: '#ffd700', C: '#ff8300', D: '#ff4444' }[currentToken._score?.grade] || '#cde8ff' },
              { label: 'MCAP ZONE', value: mcapPhase ? `${mcapPhase.emoji} ${mcapPhase.phase}` : '—', color: mcapPhase?.color || '#5a7a94' },
              { label: 'PAIR AGE', value: currentToken.pairCreatedAt ? timeAgo(currentToken.pairCreatedAt) : '—', color: '#ffd700' },
              { label: 'RECOMMENDATION', value: currentToken._score?.recommendation || '—', color: '#00ff8c' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                background: '#0d1117', border: '1px solid #1a2535',
                borderRadius: '8px', padding: '10px 14px',
              }}>
                <div style={{ fontSize: '9px', color: '#3a6a8a', fontFamily: 'JetBrains Mono', marginBottom: '3px' }}>{label}</div>
                <div style={{ fontSize: '12px', color, fontFamily: 'JetBrains Mono', fontWeight: '700' }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Full TokenCard — same component used in the scanner */}
          <div style={{ position: 'relative' }}>
            {/* Watchlist action bar */}
            {addToWatchlist && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 14px',
                background: alreadyWatchlisted ? '#ffd70008' : '#0d1117',
                border: `1px solid ${alreadyWatchlisted ? '#ffd70033' : '#1a2535'}`,
                borderBottom: 'none',
                borderRadius: '10px 10px 0 0',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {alreadyWatchlisted
                    ? <><Bookmark size={11} color="#ffd700" /><span style={{ fontSize: '10px', color: '#ffd700', fontFamily: 'JetBrains Mono', fontWeight: '700' }}>IN WATCHLIST — tracking live</span></>
                    : <span style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>Add this token to your watchlist for live tracking</span>
                  }
                </div>
                <button
                  onClick={handleAddToWatchlist}
                  disabled={alreadyWatchlisted || watchlistAdding}
                  style={{
                    padding: '6px 14px', borderRadius: '6px',
                    cursor: alreadyWatchlisted ? 'default' : 'pointer',
                    background: alreadyWatchlisted ? '#ffd70018' : watchlistAdding ? '#1a2535' : '#ffd70018',
                    border: `1px solid ${alreadyWatchlisted ? '#ffd70066' : watchlistAdding ? '#2a3545' : '#ffd70044'}`,
                    color: alreadyWatchlisted ? '#ffd700' : watchlistAdding ? '#5a7a94' : '#ffd700',
                    fontSize: '11px', fontFamily: 'JetBrains Mono', fontWeight: '700',
                    display: 'flex', alignItems: 'center', gap: '5px',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {alreadyWatchlisted
                    ? <><Check size={11} /> Watchlisted</>
                    : watchlistAdding
                    ? <><Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> Adding...</>
                    : <><Bookmark size={11} /> Add to Watchlist</>
                  }
                </button>
              </div>
            )}
            <div style={{ borderRadius: addToWatchlist ? '0 0 12px 12px' : '12px', overflow: 'hidden' }}>
              <TokenCard
                token={currentToken}
                rank={null}
                onAskAI={onAskAI}
                forecast={forecasts[currentToken._id]}
                forecastLoading={forecastLoading[currentToken._id]}
                onRequestForecast={getForecast}
              />
            </div>
          </div>

          {/* Extra links row */}
          <div style={{
            marginTop: '12px', padding: '14px 18px',
            background: '#0d1117', border: '1px solid #1a2535',
            borderRadius: '10px',
          }}>
            <div style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono', marginBottom: '10px' }}>
              EXPLORE ON
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {[
                { label: 'DexScreener', url: `https://dexscreener.com/solana/${currentToken.pairAddress}`, color: '#5a7a94' },
                { label: 'GMGN', url: `https://gmgn.ai/sol/token/${currentToken.baseToken?.address}`, color: '#a78bfa' },
                { label: 'Pump.fun', url: `https://pump.fun/${currentToken.baseToken?.address}`, color: '#5a7a94' },
                { label: 'Birdeye', url: `https://birdeye.so/token/${currentToken.baseToken?.address}`, color: '#5a7a94' },
                { label: 'Solscan', url: `https://solscan.io/token/${currentToken.baseToken?.address}`, color: '#5a7a94' },
                { label: 'Jupiter', url: `https://jup.ag/swap/SOL-${currentToken.baseToken?.address}`, color: '#00d4ff' },
              ].map(({ label, url, color }) => (
                <a key={label} href={url} target="_blank" rel="noopener noreferrer"
                  style={{
                    padding: '6px 14px', borderRadius: '6px',
                    background: label === 'GMGN' ? '#7c3aed18' : '#0a1520',
                    border: `1px solid ${label === 'GMGN' ? '#7c3aed44' : '#1e3a52'}`,
                    color, fontFamily: 'JetBrains Mono', fontSize: '11px', fontWeight: label === 'GMGN' ? '700' : '400',
                    textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '5px',
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = color + '66'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = label === 'GMGN' ? '#7c3aed44' : '#1e3a52'}
                >
                  {label} <ExternalLink size={10} />
                </a>
              ))}
            </div>

            {/* Full CA */}
            <div style={{
              marginTop: '10px', padding: '8px 12px', background: '#0a0f14',
              borderRadius: '6px', fontFamily: 'JetBrains Mono', fontSize: '11px',
              display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              <span style={{ color: '#3a6a8a' }}>CA:</span>
              <span style={{ color: '#3a7ab8', wordBreak: 'break-all' }}>
                {currentToken.baseToken?.address || 'N/A'}
              </span>
            </div>
          </div>

          {/* Signal tags */}
          {tags.length > 0 && (
            <div style={{
              marginTop: '10px', padding: '12px 16px',
              background: '#0d1117', border: '1px solid #1a2535',
              borderRadius: '10px',
            }}>
              <div style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono', marginBottom: '8px' }}>
                SIGNAL TAGS
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {tags.map((tag, i) => (
                  <span key={i} style={{
                    fontSize: '11px', padding: '3px 10px', borderRadius: '4px',
                    fontFamily: 'JetBrains Mono',
                    background: tag.type === 'positive' ? '#00ff8c11' : tag.type === 'warning' ? '#ffd70011' : '#ff444411',
                    border: `1px solid ${tag.type === 'positive' ? '#00ff8c33' : tag.type === 'warning' ? '#ffd70033' : '#ff444433'}`,
                    color: tag.type === 'positive' ? '#00ff8c' : tag.type === 'warning' ? '#ffd700' : '#ff4444',
                  }}>
                    {tag.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!currentToken && !loading && !error && (
        <div style={{
          textAlign: 'center', padding: '60px 20px',
          color: '#3a6a8a', fontFamily: 'JetBrains Mono',
        }}>
          <Search size={32} color="#1e3a52" style={{ margin: '0 auto 16px', display: 'block' }} />
          <div style={{ fontSize: '13px', color: '#5a7a94', marginBottom: '6px' }}>
            Paste any Solana token contract address above
          </div>
          <div style={{ fontSize: '11px', color: '#3a6a8a' }}>
            Works for any token — not just pump.fun. Memecoins, DeFi, anything on Solana.
          </div>
        </div>
      )}
    </div>
  );
}
