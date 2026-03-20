import React, { useState } from 'react';
import {
  Wallet, Plus, X, AlertTriangle,
  ExternalLink, Loader, Clock, Eye, Trash2
} from 'lucide-react';
import { formatVolume } from '../utils/scoring';

function timeAgoShort(ts) {
  if (!ts) return '—';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function WalletBuyAlert({ alert, onMarkRead }) {
  const t = alert.token;
  return (
    <div
      onClick={() => onMarkRead(alert.id)}
      style={{
        padding: '12px 16px',
        background: alert.read ? '#0a0f14' : '#00ff8c08',
        border: `1px solid ${alert.read ? '#1a2535' : '#00ff8c33'}`,
        borderRadius: '10px', cursor: 'pointer',
        opacity: alert.read ? 0.6 : 1,
        transition: 'all 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <div style={{
          width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0,
          background: '#00ff8c18', border: '1px solid #00ff8c33',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '14px',
        }}>🐋</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', color: '#cde8ff', fontFamily: 'JetBrains Mono', fontWeight: '700' }}>
              ${t.symbol}
            </span>
            {t.name && (
              <span style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>{t.name}</span>
            )}
            <span style={{
              fontSize: '9px', padding: '1px 7px', borderRadius: '10px',
              background: '#00ff8c18', border: '1px solid #00ff8c33',
              color: '#00ff8c', fontFamily: 'JetBrains Mono', fontWeight: '700',
            }}>
              WALLET BUY
            </span>
            {!alert.read && (
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00ff8c', flexShrink: 0 }} />
            )}
          </div>

          <div style={{ display: 'flex', gap: '12px', marginBottom: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>
              Wallet: <span style={{ color: '#7ab8d4' }}>{alert.wallet}</span>
            </span>
            {t.priceUsd && (
              <span style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>
                Price: <span style={{ color: '#cde8ff' }}>${parseFloat(t.priceUsd).toFixed(6)}</span>
              </span>
            )}
            {t.marketCap > 0 && (
              <span style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>
                MCap: <span style={{ color: '#ffd700' }}>{formatVolume(t.marketCap)}</span>
              </span>
            )}
            {t.volume24h > 0 && (
              <span style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>
                Vol: <span style={{ color: '#00d4ff' }}>{formatVolume(t.volume24h)}</span>
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {t.pairAddress && (
              <a href={`https://dexscreener.com/solana/${t.pairAddress}`}
                target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{
                  fontSize: '10px', padding: '3px 8px', borderRadius: '5px',
                  background: '#1a2535', border: '1px solid #2a3545',
                  color: '#5a7a94', textDecoration: 'none',
                  display: 'flex', alignItems: 'center', gap: '3px',
                }}>
                DexScreener <ExternalLink size={9} />
              </a>
            )}
            {(t.mint || t.pairAddress) && (
              <a href={`https://gmgn.ai/sol/token/${t.mint || t.pairAddress}`}
                target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{
                  fontSize: '10px', padding: '3px 8px', borderRadius: '5px',
                  background: '#7c3aed18', border: '1px solid #7c3aed44',
                  color: '#a78bfa', textDecoration: 'none', fontWeight: '700',
                  display: 'flex', alignItems: 'center', gap: '3px',
                }}>
                GMGN <ExternalLink size={9} />
              </a>
            )}
            <a href={`https://solscan.io/tx/${alert.signature}`}
              target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{
                fontSize: '10px', padding: '3px 8px', borderRadius: '5px',
                background: '#1a2535', border: '1px solid #2a3545',
                color: '#5a7a94', textDecoration: 'none',
                display: 'flex', alignItems: 'center', gap: '3px',
              }}>
              TX <ExternalLink size={9} />
            </a>
            <span style={{ fontSize: '9px', color: '#3a6a8a', fontFamily: 'JetBrains Mono', marginLeft: 'auto', alignSelf: 'center' }}>
              {timeAgoShort(alert.detectedAt)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WalletTrackerPage({
  wallets, addWallet, removeWallet,
  alerts, unreadCount, markRead, clearAlerts,
  checking, lastCheck,
  isAvailable,
  maxWallets,
}) {
  const [inputVal, setInputVal]   = useState('');
  const [addError, setAddError]   = useState('');
  const [adding, setAdding]       = useState(false);

  const handleAdd = async () => {
    const addr = inputVal.trim();
    if (!addr) return;
    if (addr.length < 32) { setAddError('Address too short — check the wallet address'); return; }
    if (wallets.length >= maxWallets) { setAddError(`Max ${maxWallets} wallets on free tier`); return; }
    setAdding(true);
    const ok = addWallet(addr);
    if (ok) { setInputVal(''); setAddError(''); }
    else setAddError('Already added or invalid address');
    setAdding(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div>
          <h2 style={{
            fontSize: '18px', fontWeight: '800', fontFamily: 'Syne, sans-serif',
            color: '#e8f4ff', letterSpacing: '-0.02em', marginBottom: '4px',
          }}>
            Wallet Tracker
          </h2>
          <p style={{ fontSize: '11px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>
            Track up to {maxWallets} wallets · detect Raydium buys within 60s · requires Helius API key
          </p>
        </div>
        {alerts.length > 0 && (
          <button onClick={clearAlerts} style={{
            padding: '6px 12px', borderRadius: '6px', cursor: 'pointer',
            background: '#ff444411', border: '1px solid #ff444433',
            color: '#ff4444', fontSize: '11px', fontFamily: 'JetBrains Mono',
            display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0,
          }}>
            <Trash2 size={11} /> Clear all
          </button>
        )}
      </div>

      {/* Helius key notice if not configured */}
      {!isAvailable && (
        <div style={{
          padding: '14px 18px', background: '#ffd70008',
          border: '1px solid #ffd70033', borderRadius: '10px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <AlertTriangle size={13} color="#ffd700" />
            <span style={{ fontSize: '11px', color: '#ffd700', fontFamily: 'JetBrains Mono', fontWeight: '700' }}>
              HELIUS API KEY REQUIRED
            </span>
          </div>
          <p style={{ fontSize: '11px', color: '#8b9eb0', fontFamily: 'JetBrains Mono', lineHeight: '1.6', margin: 0 }}>
            1. Get a free key at <span style={{ color: '#00d4ff' }}>helius.dev</span> (100k req/day free tier){'\n'}
            2. Add <span style={{ color: '#00ff8c' }}>REACT_APP_HELIUS_API_KEY</span> to Netlify env vars{'\n'}
            3. Redeploy — wallet tracking + real-time migration detection activates instantly
          </p>
        </div>
      )}

      {/* Add wallet */}
      <div style={{
        background: '#0d1117', border: '1px solid #1a2535',
        borderRadius: '10px', padding: '16px 18px',
      }}>
        <div style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono', marginBottom: '8px' }}>
          TRACK A WALLET ({wallets.length}/{maxWallets})
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={inputVal}
            placeholder="Paste Solana wallet address..."
            onChange={e => { setInputVal(e.target.value); setAddError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            disabled={wallets.length >= maxWallets}
            style={{
              flex: 1, padding: '8px 12px',
              background: '#0a0f14', border: `1px solid ${addError ? '#ff444466' : '#1e3a52'}`,
              borderRadius: '7px', color: '#cde8ff',
              fontFamily: 'JetBrains Mono', fontSize: '11px', outline: 'none',
            }}
          />
          <button
            onClick={handleAdd}
            disabled={adding || !inputVal.trim() || wallets.length >= maxWallets}
            style={{
              padding: '8px 16px', borderRadius: '7px',
              cursor: adding || wallets.length >= maxWallets ? 'not-allowed' : 'pointer',
              background: '#00ff8c18', border: '1px solid #00ff8c44',
              color: '#00ff8c', fontSize: '11px', fontFamily: 'JetBrains Mono', fontWeight: '700',
              display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap',
              opacity: wallets.length >= maxWallets ? 0.4 : 1,
            }}
          >
            {adding ? <Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={11} />}
            Track
          </button>
        </div>
        {addError && (
          <div style={{ fontSize: '10px', color: '#ff4444', fontFamily: 'JetBrains Mono', marginTop: '5px' }}>
            {addError}
          </div>
        )}

        {/* Tracked wallets list */}
        {wallets.length > 0 && (
          <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {wallets.map(addr => (
              <div key={addr} style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '8px 10px', background: '#0a1520',
                border: '1px solid #1e3a52', borderRadius: '7px',
              }}>
                <Wallet size={12} color="#00ff8c" />
                <span style={{ fontSize: '11px', color: '#7ab8d4', fontFamily: 'JetBrains Mono', flex: 1 }}>
                  {addr.slice(0, 8)}...{addr.slice(-8)}
                </span>
                <a href={`https://solscan.io/account/${addr}`} target="_blank" rel="noopener noreferrer"
                  style={{ color: '#3a6a8a', display: 'flex' }}>
                  <Eye size={11} />
                </a>
                <a href={`https://gmgn.ai/sol/address/${addr}`} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: '9px', color: '#a78bfa', fontFamily: 'JetBrains Mono', fontWeight: '700', textDecoration: 'none' }}>
                  GMGN
                </a>
                <button onClick={() => removeWallet(addr)} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#3a6a8a', display: 'flex', padding: '2px',
                }}>
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Status strip */}
      <div style={{
        padding: '8px 14px', background: '#0a0f14',
        border: '1px solid #1a2535', borderRadius: '8px',
        display: 'flex', alignItems: 'center', gap: '10px',
      }}>
        <div style={{
          width: '7px', height: '7px', borderRadius: '50%',
          background: checking ? '#ffd700' : isAvailable && wallets.length > 0 ? '#00ff8c' : '#3a6a8a',
          animation: checking || (isAvailable && wallets.length > 0) ? 'pulse 2s infinite' : 'none',
        }} />
        <span style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>
          {checking ? 'Checking wallets now...'
           : !isAvailable ? 'Helius key not configured'
           : wallets.length === 0 ? 'No wallets tracked'
           : `Monitoring ${wallets.length} wallet${wallets.length > 1 ? 's' : ''} · checks every 60s`}
        </span>
        {lastCheck && (
          <span style={{ fontSize: '10px', color: '#3a6a8a', fontFamily: 'JetBrains Mono', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Clock size={9} /> {timeAgoShort(lastCheck)}
          </span>
        )}
        {unreadCount > 0 && (
          <span style={{
            padding: '2px 8px', borderRadius: '10px',
            background: '#00ff8c22', border: '1px solid #00ff8c44',
            color: '#00ff8c', fontSize: '10px', fontFamily: 'JetBrains Mono', fontWeight: '700',
          }}>
            {unreadCount} new
          </span>
        )}
      </div>

      {/* Alerts */}
      {alerts.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '50px 20px',
          color: '#3a6a8a', fontFamily: 'JetBrains Mono',
        }}>
          <Wallet size={32} color="#1e3a52" style={{ margin: '0 auto 14px', display: 'block' }} />
          <div style={{ fontSize: '13px', color: '#5a7a94', marginBottom: '6px' }}>
            {wallets.length === 0 ? 'Add a wallet to start tracking' : 'No buys detected yet'}
          </div>
          <div style={{ fontSize: '11px' }}>
            {wallets.length > 0 ? 'Wallet buys on Raydium will appear here within 60s' : 'Paste a wallet address above'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {alerts.map(alert => (
            <WalletBuyAlert key={alert.id} alert={alert} onMarkRead={markRead} />
          ))}
        </div>
      )}
    </div>
  );
}
