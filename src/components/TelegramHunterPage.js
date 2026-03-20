import React, { useState } from 'react';
import {
  Send, Search, Loader, X, CheckCircle,
  ExternalLink, AlertTriangle, Clock, Bookmark,
  ChevronDown, ChevronUp, Trash2, Radio
} from 'lucide-react';
import { formatVolume, formatPrice, getMcapPhase } from '../utils/scoring';

function timeAgoShort(ts) {
  if (!ts) return '—';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  return `${Math.floor(s/3600)}h ago`;
}

// ── Grade color map ───────────────────────────────────────────────────────────
const GRADE_COLOR = {
  S: '#00ff8c', A: '#00d4ff', B: '#ffd700', C: '#ff8300', D: '#ff4444',
};
const DECISION_COLOR = {
  TRACK: '#00ff8c', 'WATCH-ONLY': '#ffd700', SKIP: '#ff4444',
};
const DECISION_BG = {
  TRACK: '#00ff8c18', 'WATCH-ONLY': '#ffd70018', SKIP: '#ff444418',
};

// ── Score bar ─────────────────────────────────────────────────────────────────
function ScoreBar({ label, val, max }) {
  const pct = Math.min(100, Math.round((val / max) * 100));
  const color = pct >= 70 ? '#00ff8c' : pct >= 40 ? '#ffd700' : '#ff4444';
  return (
    <div style={{ marginBottom: '5px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
        <span style={{ fontSize: '9px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>{label}</span>
        <span style={{ fontSize: '9px', color: '#cde8ff', fontFamily: 'JetBrains Mono' }}>{val}/{max}</span>
      </div>
      <div style={{ height: '3px', background: '#1a2535', borderRadius: '2px' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '2px', transition: 'width 0.4s' }} />
      </div>
    </div>
  );
}

// ── Single hunt result card ───────────────────────────────────────────────────
function HuntResultCard({ result, onTrack, isHistoryItem }) {
  const [expanded, setExpanded] = useState(!isHistoryItem && result.decision === 'TRACK');
  if (result.error && !result.ca) {
    return (
      <div style={{ padding: '14px 16px', background: '#ff444408', border: '1px solid #ff444422', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <AlertTriangle size={13} color="#ff4444" />
        <span style={{ fontSize: '11px', color: '#ff4444', fontFamily: 'JetBrains Mono' }}>{result.error}</span>
      </div>
    );
  }

  const gc    = GRADE_COLOR[result.grade]  || '#5a7a94';
  const dc    = DECISION_COLOR[result.decision] || '#5a7a94';
  const dbg   = DECISION_BG[result.decision]    || '#1a2535';
  const pair  = result.pair;
  const sc    = result.scoreResult;
  const mcap  = pair?.marketCap || 0;
  const phase = getMcapPhase(mcap);

  return (
    <div style={{ background: '#0d1117', border: `1px solid ${gc}44`, borderRadius: '12px', overflow: 'hidden' }}>
      {/* Left grade bar */}
      <div style={{ display: 'flex' }}>
        <div style={{ width: '5px', background: gc, flexShrink: 0 }} />
        <div style={{ flex: 1, padding: '12px 14px' }}>

          {/* Row 1: CA + decision badge + time */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', color: '#3a7ab8', fontFamily: 'JetBrains Mono' }}>
              {result.ca.slice(0, 8)}...{result.ca.slice(-6)}
            </span>
            {result.groupName && result.groupName !== 'Unknown' && (
              <span style={{ fontSize: '9px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>{result.groupName}</span>
            )}
            <span style={{ fontSize: '9px', color: '#3a6a8a', fontFamily: 'JetBrains Mono', display: 'flex', alignItems: 'center', gap: '3px' }}>
              <Clock size={9} /> {timeAgoShort(result.detectedAt)}
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span style={{
                fontSize: '10px', fontWeight: '800', padding: '2px 10px', borderRadius: '5px',
                background: dbg, border: `1px solid ${dc}44`, color: dc, fontFamily: 'JetBrains Mono',
              }}>{result.decision}</span>
            </div>
          </div>

          {/* Row 2: Token + grade + score */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
            {pair?.baseToken && (
              <span style={{ fontSize: '15px', fontWeight: '800', fontFamily: 'Syne', color: '#e8f4ff' }}>
                ${pair.baseToken.symbol}
              </span>
            )}
            {pair?.baseToken?.name && (
              <span style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>{pair.baseToken.name}</span>
            )}
            <span style={{ fontSize: '11px', fontWeight: '800', padding: '1px 8px', borderRadius: '5px', background: gc + '18', border: `1px solid ${gc}44`, color: gc, fontFamily: 'JetBrains Mono' }}>
              {result.grade} {result.score}/100
            </span>
            {mcap > 0 && (
              <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: phase.color + '15', border: `1px solid ${phase.color}33`, color: phase.color, fontFamily: 'JetBrains Mono' }}>
                {phase.emoji} {formatVolume(mcap)}
              </span>
            )}
          </div>

          {/* Row 3: Key stats */}
          {pair && (
            <div style={{ display: 'flex', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
              {[
                { l: 'Price', v: formatPrice(parseFloat(pair.priceUsd || 0)) },
                { l: 'Vol 1h', v: formatVolume(pair.volume?.h1) },
                { l: 'Vol 24h', v: formatVolume(pair.volume?.h24) },
                { l: 'Liq', v: formatVolume(pair.liquidity?.usd) },
                { l: '1h', v: `${pair.priceChange?.h1 >= 0 ? '+' : ''}${(pair.priceChange?.h1 || 0).toFixed(1)}%`, c: (pair.priceChange?.h1 || 0) >= 0 ? '#00ff8c' : '#ff4444' },
              ].map(({ l, v, c }) => (
                <span key={l} style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>
                  {l}: <span style={{ color: c || '#cde8ff' }}>{v}</span>
                </span>
              ))}
            </div>
          )}

          {/* Row 4: AI reason (always visible if present) */}
          {result.reason && (
            <div style={{ marginBottom: '8px', padding: '8px 10px', background: '#0a0f14', border: '1px solid #1a2535', borderRadius: '7px' }}>
              {result.reason.split('\n').filter(l => l.trim().startsWith('•')).map((line, i) => (
                <div key={i} style={{ fontSize: '10px', color: '#8b9eb0', fontFamily: 'JetBrains Mono', lineHeight: '1.6' }}>{line.trim()}</div>
              ))}
            </div>
          )}

          {/* Action row */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {result.decision === 'TRACK' && !result.tracked && onTrack && (
              <button onClick={() => onTrack(result)} style={{
                padding: '6px 14px', borderRadius: '7px', cursor: 'pointer',
                background: '#ffd70018', border: '1px solid #ffd70066',
                color: '#ffd700', fontSize: '10px', fontFamily: 'JetBrains Mono', fontWeight: '700',
                display: 'flex', alignItems: 'center', gap: '5px',
              }}>
                <Bookmark size={10} /> Add to Watchlist
              </button>
            )}
            {result.tracked && (
              <span style={{ fontSize: '10px', color: '#00ff8c', fontFamily: 'JetBrains Mono', display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 10px' }}>
                <CheckCircle size={10} /> Watchlisted
              </span>
            )}
            {pair?.pairAddress && (
              <a href={`https://dexscreener.com/solana/${pair.pairAddress}`} target="_blank" rel="noopener noreferrer" style={{ padding: '6px 10px', borderRadius: '6px', background: '#1a2535', border: '1px solid #2a3545', color: '#5a7a94', fontSize: '10px', fontFamily: 'JetBrains Mono', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}>
                DexScreener <ExternalLink size={9} />
              </a>
            )}
            {pair?.baseToken?.address && (
              <a href={`https://gmgn.ai/sol/token/${pair.baseToken.address}`} target="_blank" rel="noopener noreferrer" style={{ padding: '6px 10px', borderRadius: '6px', background: '#7c3aed18', border: '1px solid #7c3aed44', color: '#a78bfa', fontSize: '10px', fontFamily: 'JetBrains Mono', fontWeight: '700', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}>
                GMGN <ExternalLink size={9} />
              </a>
            )}
            <button onClick={() => setExpanded(v => !v)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#3a6a8a', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', fontFamily: 'JetBrains Mono', padding: '4px 8px' }}>
              {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              {expanded ? 'Less' : 'More'}
            </button>
          </div>

          {/* Expanded: score breakdown + next action */}
          {expanded && sc && (
            <div style={{ marginTop: '12px', borderTop: '1px solid #1a2535', paddingTop: '12px' }}>
              <div style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono', marginBottom: '8px' }}>8-SIGNAL BREAKDOWN</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px' }}>
                {[
                  { l: 'Graduation Speed', v: sc.scores?.graduationSpeed || 0, m: 18 },
                  { l: 'Volume Velocity',  v: sc.scores?.volumeVelocity  || 0, m: 22 },
                  { l: 'Price Multiple',   v: sc.scores?.priceMultiple   || 0, m: 16 },
                  { l: 'Buy Pressure',     v: sc.scores?.buyPressure     || 0, m: 12 },
                  { l: 'Liquidity Depth',  v: sc.scores?.liquidityDepth  || 0, m: 8  },
                  { l: 'TX Frequency',     v: sc.scores?.txFrequency     || 0, m: 12 },
                  { l: 'V/L Efficiency',   v: sc.scores?.vlEfficiency    || 0, m: 6  },
                  { l: 'Dev/Social',       v: sc.scores?.socialSignal    || 0, m: 6  },
                ].map(({ l, v, m }) => (
                  <ScoreBar key={l} label={l} val={v} max={m} />
                ))}
              </div>
              {result.nextAction && (
                <div style={{ marginTop: '10px', padding: '8px 10px', background: gc + '0a', border: `1px solid ${gc}22`, borderRadius: '6px' }}>
                  <div style={{ fontSize: '9px', color: gc, fontFamily: 'JetBrains Mono', fontWeight: '700', marginBottom: '3px' }}>NEXT ACTION</div>
                  <div style={{ fontSize: '10px', color: '#cde8ff', fontFamily: 'JetBrains Mono', lineHeight: '1.5' }}>{result.nextAction}</div>
                </div>
              )}
              {/* CA copy */}
              <div style={{ marginTop: '8px', padding: '6px 10px', background: '#0a0f14', borderRadius: '5px', fontSize: '10px', fontFamily: 'JetBrains Mono', color: '#3a7ab8', wordBreak: 'break-all' }}>
                {result.ca}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function TelegramHunterPage({ hunter }) {
  const {
    hunt, abort, results, history,
    hunting, huntingCA,
    trackResult, clearResults, clearHistory,
  } = hunter;

  const [input, setInput]     = useState('');
  const [tab, setTab]         = useState('results'); // results | history

  const handleHunt = () => {
    if (!input.trim() || hunting) return;
    hunt(input.trim());
  };

  const trackCount   = results.filter(r => r.decision === 'TRACK').length;
  const hasResults   = results.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

      {/* Header */}
      <div>
        <h2 style={{ fontSize: '18px', fontWeight: '800', fontFamily: 'Syne, sans-serif', color: '#e8f4ff', letterSpacing: '-0.02em', marginBottom: '4px' }}>
          Telegram Alpha Hunter
        </h2>
        <p style={{ fontSize: '11px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>
          Paste any Telegram message · CAs extracted automatically · full 8-signal score + AI TRACK/SKIP verdict
        </p>
      </div>

      {/* Input area */}
      <div style={{ background: '#0d1117', border: '1px solid #1a2535', borderRadius: '12px', padding: '16px' }}>
        <div style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono', marginBottom: '8px' }}>
          PASTE TELEGRAM MESSAGE OR CONTRACT ADDRESS
        </div>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleHunt(); }}
          placeholder={`Paste raw Telegram message here...\n\nExamples:\n• "Check this gem: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgGs"\n• "🚀 NEW LAUNCH — CA: AbcDef123... 📈 buy pressure insane"\n• Any message containing a Solana contract address`}
          disabled={hunting}
          style={{
            width: '100%', minHeight: '120px', padding: '10px 12px',
            background: '#0a0f14', border: '1px solid #1e3a52', borderRadius: '8px',
            color: '#cde8ff', fontFamily: 'JetBrains Mono', fontSize: '11px',
            outline: 'none', resize: 'vertical', lineHeight: '1.6',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
          <span style={{ fontSize: '9px', color: '#3a6a8a', fontFamily: 'JetBrains Mono' }}>
            Ctrl+Enter to analyze · extracts all Solana CAs · max 5 per message
          </span>
          <div style={{ display: 'flex', gap: '6px' }}>
            {input && (
              <button onClick={() => setInput('')} style={{ padding: '7px 10px', borderRadius: '6px', cursor: 'pointer', background: '#1a2535', border: '1px solid #2a3545', color: '#5a7a94', fontSize: '10px', fontFamily: 'JetBrains Mono', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <X size={10} /> Clear
              </button>
            )}
            {hunting ? (
              <button onClick={abort} style={{ padding: '7px 14px', borderRadius: '7px', cursor: 'pointer', background: '#ff444418', border: '1px solid #ff444466', color: '#ff4444', fontSize: '10px', fontFamily: 'JetBrains Mono', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <X size={10} /> Stop
              </button>
            ) : (
              <button onClick={handleHunt} disabled={!input.trim()} style={{ padding: '7px 18px', borderRadius: '7px', cursor: input.trim() ? 'pointer' : 'not-allowed', background: input.trim() ? '#00ff8c18' : '#1a2535', border: `1px solid ${input.trim() ? '#00ff8c44' : '#2a3545'}`, color: input.trim() ? '#00ff8c' : '#5a7a94', fontSize: '10px', fontFamily: 'JetBrains Mono', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Search size={11} /> Hunt Alpha
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Status bar when hunting */}
      {hunting && (
        <div style={{ padding: '10px 16px', background: '#00ff8c08', border: '1px solid #00ff8c22', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Radio size={13} color="#00ff8c" style={{ animation: 'pulse 1s infinite', flexShrink: 0 }} />
          <span style={{ fontSize: '11px', color: '#00ff8c', fontFamily: 'JetBrains Mono', fontWeight: '700' }}>HUNTING...</span>
          {huntingCA && (
            <span style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>
              Fetching + scoring {huntingCA.slice(0, 12)}...
            </span>
          )}
          <Loader size={12} color="#5a7a94" style={{ animation: 'spin 1s linear infinite', marginLeft: 'auto' }} />
        </div>
      )}

      {/* Summary strip when results ready */}
      {hasResults && !hunting && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { label: `${results.length} CA${results.length > 1 ? 's' : ''} analyzed`, color: '#cde8ff' },
            { label: `${trackCount} TRACK`, color: '#00ff8c' },
            { label: `${results.filter(r => r.decision === 'WATCH-ONLY').length} WATCH`, color: '#ffd700' },
            { label: `${results.filter(r => r.decision === 'SKIP').length} SKIP`, color: '#ff4444' },
          ].map(({ label, color }) => (
            <span key={label} style={{ fontSize: '10px', padding: '3px 10px', borderRadius: '5px', background: color + '12', border: `1px solid ${color}33`, color, fontFamily: 'JetBrains Mono', fontWeight: '700' }}>
              {label}
            </span>
          ))}
          <button onClick={clearResults} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#3a6a8a', fontSize: '10px', fontFamily: 'JetBrains Mono', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <X size={10} /> Clear
          </button>
        </div>
      )}

      {/* Tab switcher */}
      {(hasResults || history.length > 0) && (
        <div style={{ display: 'flex', gap: '3px', background: '#0a0f14', padding: '3px', borderRadius: '8px' }}>
          {[
            { id: 'results', label: `Results (${results.length})` },
            { id: 'history', label: `History (${history.length})` },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: '6px', borderRadius: '5px', cursor: 'pointer',
              background: tab === t.id ? '#1a2535' : 'transparent',
              border: `1px solid ${tab === t.id ? '#2a3545' : 'transparent'}`,
              color: tab === t.id ? '#cde8ff' : '#5a7a94',
              fontSize: '10px', fontFamily: 'JetBrains Mono', fontWeight: tab === t.id ? '700' : '400',
            }}>{t.label}</button>
          ))}
        </div>
      )}

      {/* Results */}
      {tab === 'results' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {results.map((result, i) => (
            <HuntResultCard key={result.ca || i} result={result} onTrack={trackResult} isHistoryItem={false} />
          ))}
          {!hasResults && !hunting && (
            <div style={{ textAlign: 'center', padding: '50px 20px', color: '#3a6a8a', fontFamily: 'JetBrains Mono' }}>
              <Send size={32} color="#1e3a52" style={{ margin: '0 auto 14px', display: 'block' }} />
              <div style={{ fontSize: '12px', color: '#5a7a94', marginBottom: '6px' }}>Paste a Telegram message above</div>
              <div style={{ fontSize: '10px', lineHeight: '1.7' }}>
                The hunter will extract any Solana CAs,<br />
                score them live, and give a TRACK/SKIP verdict.
              </div>
            </div>
          )}
        </div>
      )}

      {/* History */}
      {tab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            {history.length > 0 && (
              <button onClick={clearHistory} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3a6a8a', fontSize: '10px', fontFamily: 'JetBrains Mono', display: 'flex', alignItems: 'center', gap: '3px' }}>
                <Trash2 size={10} /> Clear history
              </button>
            )}
          </div>
          {history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', color: '#3a6a8a', fontFamily: 'JetBrains Mono', fontSize: '11px' }}>
              No hunt history yet
            </div>
          ) : (
            history.map((result, i) => (
              <HuntResultCard key={result.ca + i} result={result} onTrack={trackResult} isHistoryItem={true} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
