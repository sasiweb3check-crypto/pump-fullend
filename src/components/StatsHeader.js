import React, { useState, useEffect } from 'react';

import { RefreshCw, Activity, Zap, Clock, TrendingUp, Crown, Database, Trash2 } from 'lucide-react';
import { timeAgo, formatVolume } from '../utils/scoring';
import { getStorageInfo, clearAllStorage } from '../utils/storage';

function formatGainShort(pct) {
  if (!pct || isNaN(pct)) return '—';
  if (Math.abs(pct) >= 1000) return `+${(pct / 1000).toFixed(1)}K%`;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

export default function StatsHeader({ tokens, lastUpdate, scanCount, loading, onRefresh, serverMode }) {
  const [storageInfo, setStorageInfo] = useState(null);
  const [showStorageMenu, setShowStorageMenu] = useState(false);

  // Refresh storage info whenever it might change
  useEffect(() => {
    const update = () => setStorageInfo(getStorageInfo());
    update();
    const id = setInterval(update, 10000);
    return () => clearInterval(id);
  }, [tokens]);

  const handleClearStorage = () => {
    if (window.confirm('Clear all persisted scanner data? Detection times, ATH records and cache will be reset.')) {
      clearAllStorage();
      setStorageInfo(getStorageInfo());
      setShowStorageMenu(false);
      window.location.reload();
    }
  };

  const sGrade = tokens.filter(t => t._score.grade === 'S').length;
  const aGrade = tokens.filter(t => t._score.grade === 'A').length;
  const totalVol = tokens.reduce((acc, t) => acc + (t.volume?.h24 || 0), 0);
  const newTokens = tokens.filter(t => t.pairCreatedAt > Date.now() - 2 * 60 * 60 * 1000).length;

  const bestGain = tokens.reduce((best, t) => {
    const g = t._gainSinceDetection ?? 0;
    return g > (best?.g ?? 0) ? { g, sym: t.baseToken?.symbol } : best;
  }, null);

  const bestAth = tokens.reduce((best, t) => {
    const g = t._athGain ?? 0;
    return g > (best?.g ?? 0) ? { g, sym: t.baseToken?.symbol } : best;
  }, null);

  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))',
        gap: '12px',
      }}>
        {[
          {
            icon: <Activity size={16} color="#00ff8c" />,
            label: 'TOKENS SCANNED',
            value: tokens.length.toLocaleString(),
            sub: `${scanCount} new this session`,
            accent: '#00ff8c',
          },
          {
            icon: <Zap size={16} color="#ffd700" />,
            label: 'S+A GRADE FITS',
            value: `${sGrade + aGrade}`,
            sub: `${sGrade} S-grade · ${aGrade} A-grade`,
            accent: '#ffd700',
          },
          {
            icon: <Clock size={16} color="#00d4ff" />,
            label: 'NEW (<2 HOURS)',
            value: newTokens.toLocaleString(),
            sub: 'recently graduated',
            accent: '#00d4ff',
          },
          {
            icon: <Activity size={16} color="#ff8300" />,
            label: 'TOTAL VOL 24H',
            value: formatVolume(totalVol),
            sub: 'across all scanned',
            accent: '#ff8300',
          },
          {
            icon: <TrendingUp size={16} color="#00ff8c" />,
            label: 'BEST GAIN NOW',
            value: bestGain?.g > 0 ? formatGainShort(bestGain.g) : '—',
            sub: bestGain?.sym ? `$${bestGain.sym}` : 'since detection',
            accent: '#00ff8c',
          },
          {
            icon: <Crown size={16} color="#ffd700" />,
            label: 'BEST ATH GAIN',
            value: bestAth?.g > 0 ? formatGainShort(bestAth.g) : '—',
            sub: bestAth?.sym ? `$${bestAth.sym}` : 'since detection',
            accent: '#ffd700',
          },
        ].map(stat => (
          <div key={stat.label} style={{
            background: '#0d1117',
            border: '1px solid #1a2535',
            borderRadius: '10px',
            padding: '14px 16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              {stat.icon}
              <span style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>
                {stat.label}
              </span>
            </div>
            <div style={{ fontSize: '22px', fontWeight: '700', fontFamily: 'Syne', color: stat.accent }}>
              {stat.value}
            </div>
            <div style={{ fontSize: '10px', color: '#3a5a74', fontFamily: 'JetBrains Mono', marginTop: '2px' }}>
              {stat.sub}
            </div>
          </div>
        ))}

        {/* Refresh + Storage panel */}
        <div style={{
          background: '#0d1117',
          border: '1px solid #1a2535',
          borderRadius: '10px',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'6px' }}>
            <div style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>LAST SCAN</div>
            {serverMode !== undefined && (
              <span style={{ fontSize:'8px', padding:'1px 5px', borderRadius:'3px', fontFamily:'JetBrains Mono', fontWeight:'700',
                background: serverMode ? '#00ff8c11' : '#ff8c0011',
                border: serverMode ? '1px solid #00ff8c44' : '1px solid #ff8c0044',
                color: serverMode ? '#00ff8c' : '#ff8c00' }}>
                {serverMode ? '⚡ SERVER' : '⚠ CLIENT'}
              </span>
            )}
          </div>
          <div style={{ fontSize: '13px', color: '#cde8ff', fontFamily: 'JetBrains Mono' }}>
            {lastUpdate ? timeAgo(lastUpdate) : 'Never'}
          </div>
          <button
            onClick={onRefresh}
            disabled={loading}
            style={{
              marginTop: '8px', padding: '6px 12px', borderRadius: '6px',
              border: '1px solid #00ff8c44', background: '#00ff8c11', color: '#00ff8c',
              fontSize: '11px', fontFamily: 'JetBrains Mono',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: '5px',
              opacity: loading ? 0.5 : 1,
            }}
          >
            <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {loading ? 'SCANNING...' : 'REFRESH NOW'}
          </button>
          <div style={{ fontSize: '9px', color: '#3a5a74', fontFamily: 'JetBrains Mono', marginTop: '4px' }}>
            {serverMode ? 'server scanning 24/7' : 'add KV → 24/7 mode'}
          </div>
        </div>
      </div>

      {/* Storage status bar */}
      <div style={{
        marginTop: '10px',
        padding: '8px 14px',
        background: '#0a0f14',
        border: '1px solid #1a2535',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        position: 'relative',
      }}>
        <Database size={11} color="#00d4ff" />
        <span style={{ fontSize: '10px', color: '#00d4ff', fontFamily: 'JetBrains Mono', fontWeight: '700' }}>
          PERSISTED
        </span>
        <span style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>
          Detection times · ATH records · Scan history · Token cache — all survive page refresh
        </span>
        {storageInfo && (
          <span style={{ fontSize: '10px', color: '#3a6a8a', fontFamily: 'JetBrains Mono', marginLeft: 'auto' }}>
            {formatBytes(storageInfo.totalBytes)} stored
          </span>
        )}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowStorageMenu(v => !v)}
            title="Storage options"
            style={{
              padding: '3px 8px', borderRadius: '4px', cursor: 'pointer',
              background: '#1a2535', border: '1px solid #2a3545',
              color: '#5a7a94', fontSize: '10px', fontFamily: 'JetBrains Mono',
              display: 'flex', alignItems: 'center', gap: '4px',
            }}
          >
            <Trash2 size={10} /> Clear
          </button>
          {showStorageMenu && (
            <div style={{
              position: 'absolute', right: 0, top: '28px', zIndex: 200,
              background: '#0d1117', border: '1px solid #2a3545',
              borderRadius: '8px', padding: '10px 14px', minWidth: '220px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            }}>
              <div style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono', marginBottom: '8px' }}>
                STORAGE CONTENTS:
              </div>
              {storageInfo && Object.entries(storageInfo.details).map(([key, bytes]) => (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '10px', color: '#8b9eb0', fontFamily: 'JetBrains Mono' }}>
                    {key.replace('pumpsdk_', '')}
                  </span>
                  <span style={{ fontSize: '10px', color: '#3a6a8a', fontFamily: 'JetBrains Mono' }}>
                    {formatBytes(bytes)}
                  </span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid #1a2535', marginTop: '8px', paddingTop: '8px' }}>
                <button
                  onClick={handleClearStorage}
                  style={{
                    width: '100%', padding: '6px', borderRadius: '5px', cursor: 'pointer',
                    background: '#ff444411', border: '1px solid #ff444444',
                    color: '#ff4444', fontSize: '11px', fontFamily: 'JetBrains Mono',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                  }}
                >
                  <Trash2 size={11} /> Reset All Data
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
