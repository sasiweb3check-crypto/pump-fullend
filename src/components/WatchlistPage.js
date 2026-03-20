import React, { useState, useCallback } from 'react';
import {
  Bookmark, BookmarkX, RefreshCw, Plus, Loader,
  AlertTriangle, Search, Trash2
} from 'lucide-react';
import TokenCard from './TokenCard';
import { useForecast } from '../agents/useForecast';
import { formatVolume } from '../utils/scoring';

function EmptyState({ onAddClick }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: '#3a6a8a', fontFamily: 'JetBrains Mono' }}>
      <Bookmark size={36} color="#1e3a52" style={{ margin: '0 auto 16px', display: 'block' }} />
      <div style={{ fontSize: '14px', color: '#5a7a94', marginBottom: '8px', fontWeight: '600' }}>
        Your watchlist is empty
      </div>
      <div style={{ fontSize: '11px', color: '#3a6a8a', marginBottom: '20px', lineHeight: '1.6' }}>
        Add tokens from Token Lookup or paste a contract address below.
        Watchlisted tokens auto-refresh every 30s — same tracking as the live scanner.
      </div>
      <button
        onClick={onAddClick}
        style={{
          padding: '8px 18px', borderRadius: '8px', cursor: 'pointer',
          background: '#ffd70018', border: '1px solid #ffd70044',
          color: '#ffd700', fontSize: '12px', fontFamily: 'JetBrains Mono', fontWeight: '600',
          display: 'inline-flex', alignItems: 'center', gap: '6px',
        }}
      >
        <Plus size={13} /> Add First Token
      </button>
    </div>
  );
}

function AddTokenBar({ onAdd }) {
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState('');

  const handleAdd = useCallback(async () => {
    const addr = input.trim();
    if (!addr) return;
    if (addr.length < 32) { setErr('Address looks too short — check the CA'); return; }
    setAdding(true);
    setErr('');
    const ok = await onAdd(addr);
    if (ok) { setInput(''); }
    else { setErr('Failed to add token — check address'); }
    setAdding(false);
  }, [input, onAdd]);

  return (
    <div style={{
      background: '#0d1117', border: '1px solid #1a2535',
      borderRadius: '10px', padding: '14px 18px',
    }}>
      <div style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono', marginBottom: '8px' }}>
        ADD TOKEN BY CONTRACT ADDRESS
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={13} color="#3a6a8a" style={{
            position: 'absolute', left: '11px', top: '50%',
            transform: 'translateY(-50%)', pointerEvents: 'none',
          }} />
          <input
            type="text"
            value={input}
            placeholder="Paste Solana token contract address..."
            onChange={e => { setInput(e.target.value); setErr(''); }}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            style={{
              width: '100%', padding: '8px 12px 8px 32px',
              background: '#0a0f14', border: `1px solid ${err ? '#ff444466' : '#1e3a52'}`,
              borderRadius: '7px', color: '#cde8ff',
              fontFamily: 'JetBrains Mono', fontSize: '11px', outline: 'none',
            }}
            onFocus={e => e.target.style.borderColor = '#3a6a8a'}
            onBlur={e => e.target.style.borderColor = err ? '#ff444466' : '#1e3a52'}
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={adding || !input.trim()}
          style={{
            padding: '8px 16px', borderRadius: '7px', cursor: adding ? 'not-allowed' : 'pointer',
            background: adding ? '#1a2535' : '#ffd70018',
            border: `1px solid ${adding ? '#2a3545' : '#ffd70044'}`,
            color: adding ? '#5a7a94' : '#ffd700',
            fontFamily: 'JetBrains Mono', fontSize: '11px', fontWeight: '700',
            display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap',
          }}
        >
          {adding
            ? <><Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> Adding...</>
            : <><Plus size={11} /> Add to Watchlist</>
          }
        </button>
      </div>
      {err && (
        <div style={{ fontSize: '10px', color: '#ff4444', fontFamily: 'JetBrains Mono', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <AlertTriangle size={10} /> {err}
        </div>
      )}
    </div>
  );
}

export default function WatchlistPage({
  tokens, addresses, loading, refreshing, errors,
  addToWatchlist, removeFromWatchlist, refreshToken, refreshAll,
  onAskAI,
}) {
  const [showAdd, setShowAdd] = useState(false);
  const { forecasts, loading: forecastLoading, getForecast } = useForecast();

  const totalVol = tokens.reduce((s, t) => s + (t.volume?.h24 || 0), 0);
  const bestGain = tokens.reduce((best, t) => {
    const g = t._gainSinceDetection ?? 0;
    return g > (best?.g ?? -Infinity) ? { g, sym: t.baseToken?.symbol } : best;
  }, null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div>
          <h2 style={{
            fontSize: '18px', fontWeight: '800', fontFamily: 'Syne, sans-serif',
            color: '#e8f4ff', letterSpacing: '-0.02em', marginBottom: '4px',
          }}>
            Watchlist
          </h2>
          <p style={{ fontSize: '11px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>
            {addresses.length} token{addresses.length !== 1 ? 's' : ''} tracked · auto-refresh every 30s · full detection tracking
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <button
            onClick={() => refreshAll(false)}
            title="Refresh all"
            style={{
              padding: '7px 10px', borderRadius: '7px', cursor: 'pointer',
              background: '#1a2535', border: '1px solid #2a3545',
              color: '#5a7a94', display: 'flex', alignItems: 'center', gap: '5px',
              fontSize: '11px', fontFamily: 'JetBrains Mono',
            }}
          >
            <RefreshCw size={12} /> Refresh All
          </button>
          <button
            onClick={() => setShowAdd(v => !v)}
            style={{
              padding: '7px 14px', borderRadius: '7px', cursor: 'pointer',
              background: showAdd ? '#ffd70022' : '#ffd70012',
              border: `1px solid ${showAdd ? '#ffd70066' : '#ffd70033'}`,
              color: '#ffd700', fontSize: '11px', fontFamily: 'JetBrains Mono', fontWeight: '700',
              display: 'flex', alignItems: 'center', gap: '5px',
            }}
          >
            <Plus size={12} /> Add Token
          </button>
        </div>
      </div>

      {/* Add bar */}
      {showAdd && <AddTokenBar onAdd={async (addr) => { const ok = await addToWatchlist(addr); if (ok) setShowAdd(false); return ok; }} />}

      {/* Stats strip */}
      {tokens.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '8px',
        }}>
          {[
            { label: 'TRACKING', value: `${tokens.length} tokens`, color: '#ffd700' },
            { label: 'TOTAL VOL 24H', value: formatVolume(totalVol), color: '#00d4ff' },
            { label: 'BEST GAIN', value: bestGain?.g > 0 ? `+${bestGain.g.toFixed(1)}% $${bestGain.sym}` : '—', color: '#00ff8c' },
            { label: 'AUTO-REFRESH', value: 'Every 30s', color: '#a78bfa' },
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
      )}

      {/* Loading state */}
      {loading && tokens.length === 0 && (
        <div style={{ textAlign: 'center', padding: '50px 20px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>
          <div style={{
            width: '36px', height: '36px', border: '2px solid #ffd700',
            borderTopColor: 'transparent', borderRadius: '50%',
            animation: 'spin 1s linear infinite', margin: '0 auto 14px',
          }} />
          <div style={{ fontSize: '12px', color: '#ffd700' }}>Loading watchlist...</div>
        </div>
      )}

      {/* Empty state */}
      {!loading && addresses.length === 0 && (
        <EmptyState onAddClick={() => setShowAdd(true)} />
      )}

      {/* Token cards */}
      {tokens.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {tokens.map((token, idx) => {
            const addr = token.baseToken?.address || token.pairAddress;
            const isRefreshing = refreshing[addr];
            const hasError = errors[addr];

            return (
              <div key={token._id || idx} style={{ position: 'relative', animation: 'slideIn 0.3s ease forwards', animationDelay: `${Math.min(idx * 30, 300)}ms` }}>

                {/* Watchlist action bar above card */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 12px 6px 14px',
                  background: '#0d1117', border: '1px solid #1a2535',
                  borderBottom: 'none',
                  borderRadius: '10px 10px 0 0',
                  gap: '8px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Bookmark size={11} color="#ffd700" />
                    <span style={{ fontSize: '10px', color: '#ffd700', fontFamily: 'JetBrains Mono', fontWeight: '700' }}>
                      WATCHLISTED
                    </span>
                    {isRefreshing && (
                      <Loader size={10} color="#5a7a94" style={{ animation: 'spin 1s linear infinite' }} />
                    )}
                    {hasError && (
                      <span style={{ fontSize: '9px', color: '#ff4444', fontFamily: 'JetBrains Mono' }}>
                        ⚠ {hasError}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => refreshToken(addr)}
                      title="Refresh this token"
                      disabled={isRefreshing}
                      style={{
                        background: 'none', border: '1px solid #1a2535', borderRadius: '5px',
                        color: '#3a6a8a', cursor: isRefreshing ? 'not-allowed' : 'pointer',
                        padding: '3px 7px', display: 'flex', alignItems: 'center', gap: '3px',
                        fontSize: '10px', fontFamily: 'JetBrains Mono',
                      }}
                    >
                      <RefreshCw size={9} /> Refresh
                    </button>
                    <button
                      onClick={() => removeFromWatchlist(addr)}
                      title="Remove from watchlist"
                      style={{
                        background: 'none', border: '1px solid #ff444433', borderRadius: '5px',
                        color: '#ff4444', cursor: 'pointer',
                        padding: '3px 7px', display: 'flex', alignItems: 'center', gap: '3px',
                        fontSize: '10px', fontFamily: 'JetBrains Mono',
                      }}
                    >
                      <BookmarkX size={9} /> Remove
                    </button>
                  </div>
                </div>

                {/* The actual TokenCard — identical to live scanner */}
                <div style={{ borderRadius: '0 0 12px 12px', overflow: 'hidden' }}>
                  <TokenCard
                    token={token}
                    rank={null}
                    onAskAI={onAskAI}
                    forecast={forecasts[token._id]}
                    forecastLoading={forecastLoading[token._id]}
                    onRequestForecast={getForecast}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Addresses with no data yet */}
      {addresses.filter(addr => !tokens.some(t => t.baseToken?.address === addr || t.pairAddress === addr)).map(addr => (
        <div key={addr} style={{
          padding: '14px 18px', background: '#0a0f14',
          border: '1px solid #1a2535', borderRadius: '10px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
        }}>
          <div>
            <div style={{ fontSize: '11px', color: '#5a7a94', fontFamily: 'JetBrains Mono', marginBottom: '2px' }}>
              {refreshing[addr] ? 'Fetching...' : (errors[addr] || 'No data')}
            </div>
            <div style={{ fontSize: '10px', color: '#3a6a8a', fontFamily: 'JetBrains Mono' }}>
              {addr.slice(0, 16)}...{addr.slice(-8)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {refreshing[addr]
              ? <Loader size={13} color="#5a7a94" style={{ animation: 'spin 1s linear infinite' }} />
              : (
                <button onClick={() => refreshToken(addr)} style={{
                  background: '#1a2535', border: '1px solid #2a3545', borderRadius: '5px',
                  color: '#5a7a94', cursor: 'pointer', padding: '4px 8px',
                  fontSize: '10px', fontFamily: 'JetBrains Mono', display: 'flex', alignItems: 'center', gap: '4px',
                }}>
                  <RefreshCw size={9} /> Retry
                </button>
              )
            }
            <button onClick={() => removeFromWatchlist(addr)} style={{
              background: '#ff444410', border: '1px solid #ff444433', borderRadius: '5px',
              color: '#ff4444', cursor: 'pointer', padding: '4px 8px',
              fontSize: '10px', fontFamily: 'JetBrains Mono', display: 'flex', alignItems: 'center', gap: '4px',
            }}>
              <Trash2 size={9} /> Remove
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
