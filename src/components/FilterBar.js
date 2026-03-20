import React from 'react';
import { getBuySignal, getIntraSignal } from '../utils/scoring';
// FilterBar component

export const FILTER_PRESETS = [
  { id: 'all',      label: 'ALL' },
  { id: 'top',      label: 'S+A GRADE' },
  { id: 'intra',    label: '⚡ INTRADAY' },
  { id: 'buy',      label: '🟢 READY TO BUY' },
  { id: 'watch',    label: '👁 WATCH CLOSELY' },
  { id: 'micro',    label: '🛡 SAFE <$50K' },
  { id: 'new',      label: 'NEW (<2H)' },
  { id: 'volume',   label: 'HIGH VOL' },
  { id: 'dev',      label: 'DEV TOKENS' },
  { id: 'gained',   label: '📈 GAINED 50%+' },
];

export const SORT_OPTIONS = [
  { id: 'score', label: 'Strategy Score' },
  { id: 'gain_now', label: '🟢 Gain Since Detection' },
  { id: 'ath_gain', label: '🏆 ATH Since Detection' },
  { id: 'volume', label: 'Volume 24H' },
  { id: 'price_change', label: 'Price Change 24H' },
  { id: 'newest', label: 'Newest First' },
  { id: 'oldest_detect', label: 'Oldest Detected' },
  { id: 'txns', label: 'Transaction Count' },
];

export default function FilterBar({ filter, setFilter, sort, setSort, minScore, setMinScore, count }) {
  return (
    <div style={{
      background: '#0d1117',
      border: '1px solid #1a2535',
      borderRadius: '12px',
      padding: '16px 20px',
      marginBottom: '20px',
    }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
        
        {/* Filter presets */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {FILTER_PRESETS.map(preset => {
            const isActive = filter === preset.id;
            const accentColor =
              preset.id === 'buy'   ? '#00ff8c' :
              preset.id === 'watch' ? '#ffd700' :
              preset.id === 'micro' ? '#00d4ff' :
              preset.id === 'intra' ? '#ff8300' :
              '#00ff8c';
            return (
              <button
                key={preset.id}
                onClick={() => setFilter(preset.id)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${isActive ? accentColor : '#1a2535'}`,
                  background: isActive ? accentColor + '18' : 'transparent',
                  color: isActive ? accentColor : '#5a7a94',
                  fontSize: '11px',
                  fontFamily: 'JetBrains Mono',
                  fontWeight: isActive ? '700' : '400',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        <div style={{ width: '1px', height: '24px', background: '#1a2535' }} />

        {/* Sort */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>SORT:</span>
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            style={{
              background: '#0a0f14',
              border: '1px solid #1a2535',
              borderRadius: '6px',
              color: '#cde8ff',
              fontSize: '11px',
              fontFamily: 'JetBrains Mono',
              padding: '4px 8px',
              cursor: 'pointer',
            }}
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Min score */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>MIN SCORE:</span>
          <input
            type="range"
            min="0"
            max="90"
            step="5"
            value={minScore}
            onChange={e => setMinScore(Number(e.target.value))}
            style={{ width: '80px', accentColor: '#00ff8c' }}
          />
          <span style={{ fontSize: '11px', color: '#00ff8c', fontFamily: 'JetBrains Mono', minWidth: '20px' }}>
            {minScore}
          </span>
        </div>

        {/* Count */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '11px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>
            {count} tokens
          </span>
        </div>
      </div>
    </div>
  );
}

export function applyFilters(tokens, filter, sort, minScore) {
  let filtered = tokens.filter(t => t._score.total >= minScore);

  switch (filter) {
    case 'intra':
      // INTRADAY — tokens firing INTRA_NOW or INTRA_SOON signal
      filtered = filtered.filter(t => {
        const sig = getIntraSignal(t, t._score);
        return sig !== null;
      });
      break;
    case 'top':
      filtered = filtered.filter(t => ['S', 'A'].includes(t._score.grade));
      break;
    case 'buy':
      // READY TO BUY — 5+ of 7 buy signal conditions firing
      filtered = filtered.filter(t => {
        const sig = getBuySignal(t, t._score);
        return sig && sig.level === 'STRONG_BUY';
      });
      break;
    case 'watch':
      // WATCH CLOSELY — exactly 4 of 7 conditions firing (one away from buy)
      filtered = filtered.filter(t => {
        const sig = getBuySignal(t, t._score);
        return sig && sig.level === 'WATCH';
      });
      break;
    case 'micro':
      // SAFE <$50K — tokens under $50K mcap with decent liquidity
      filtered = filtered.filter(t => {
        const mcap = t.marketCap || t.fdv || 0;
        return mcap > 0 && mcap < 50000 && (t.liquidity?.usd || 0) >= 3000;
      });
      break;
    case 'new': {
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      filtered = filtered.filter(t => t.pairCreatedAt > twoHoursAgo);
      break;
    }
    case 'volume':
      filtered = filtered.filter(t => (t.volume?.h24 || 0) >= 50000);
      break;
    case 'dev': {
      const devKeywords = ['sdk', 'dev', 'build', 'code', 'open', 'source', 'hack', 'fork', 'api', 'bot', 'agent', 'ai', 'mcp', 'tool', 'github'];
      filtered = filtered.filter(t => {
        const combined = ((t.baseToken?.name || '') + ' ' + (t.baseToken?.symbol || '')).toLowerCase();
        return devKeywords.some(kw => combined.includes(kw)) || t._score.scores.socialSignal >= 4;
      });
      break;
    }
    case 'gained':
      filtered = filtered.filter(t => (t._gainSinceDetection ?? 0) >= 50);
      break;
    default:
      break;
  }

  switch (sort) {
    case 'gain_now':
      filtered.sort((a, b) => (b._gainSinceDetection ?? 0) - (a._gainSinceDetection ?? 0));
      break;
    case 'ath_gain':
      filtered.sort((a, b) => (b._athGain ?? 0) - (a._athGain ?? 0));
      break;
    case 'volume':
      filtered.sort((a, b) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0));
      break;
    case 'price_change':
      filtered.sort((a, b) => (b.priceChange?.h24 || 0) - (a.priceChange?.h24 || 0));
      break;
    case 'newest':
      filtered.sort((a, b) => (b.pairCreatedAt || 0) - (a.pairCreatedAt || 0));
      break;
    case 'oldest_detect':
      filtered.sort((a, b) => (a._detectedAt || Infinity) - (b._detectedAt || Infinity));
      break;
    case 'txns':
      filtered.sort((a, b) => {
        const aTx = (a.txns?.h24?.buys || 0) + (a.txns?.h24?.sells || 0);
        const bTx = (b.txns?.h24?.buys || 0) + (b.txns?.h24?.sells || 0);
        return bTx - aTx;
      });
      break;
    case 'score':
    default:
      filtered.sort((a, b) => b._score.total - a._score.total);
      break;
  }

  return filtered;
}
