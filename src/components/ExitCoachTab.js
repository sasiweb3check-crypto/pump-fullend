import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  LogOut, DollarSign,
  CheckCircle, XCircle, MinusCircle, ChevronDown, ChevronUp,
  Loader
} from 'lucide-react';
import { callGroqStream } from '../agents/groq';
import { EXIT_COACH_SYSTEM, buildExitCoachContext } from '../agents/agentPrompts';
import { formatPrice, formatVolume } from '../utils/scoring';

// ── Local storage key for saved positions ────────────────────────────────────
const POSITIONS_KEY = 'pumpsdk_positions';

function loadPositions() {
  try {
    const raw = localStorage.getItem(POSITIONS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function savePositions(pos) {
  try { localStorage.setItem(POSITIONS_KEY, JSON.stringify(pos)); } catch {}
}

// ── Urgency config ────────────────────────────────────────────────────────────
const URGENCY = {
  HOLD:        { color: '#00ff8c', bg: '#00ff8c12', border: '#00ff8c44', icon: <CheckCircle size={14} />,  label: 'HOLD' },
  'SCALE OUT': { color: '#ffd700', bg: '#ffd70012', border: '#ffd70044', icon: <MinusCircle size={14} />,  label: 'SCALE OUT' },
  'EXIT NOW':  { color: '#ff4444', bg: '#ff444412', border: '#ff444444', icon: <XCircle size={14} />,      label: 'EXIT NOW' },
};

function detectUrgency(text) {
  if (!text) return null;
  const upper = text.toUpperCase();
  if (upper.includes('EXIT NOW')) return 'EXIT NOW';
  if (upper.includes('SCALE OUT')) return 'SCALE OUT';
  if (upper.includes('HOLD')) return 'HOLD';
  return null;
}

// ── Position P&L calculator ───────────────────────────────────────────────────
function calcPnl(entryPrice, currentPrice) {
  if (!entryPrice || !currentPrice || entryPrice <= 0) return null;
  return ((currentPrice - entryPrice) / entryPrice) * 100;
}

function formatPnl(pct) {
  if (pct === null || pct === undefined) return '—';
  const sign = pct >= 0 ? '+' : '';
  if (Math.abs(pct) >= 1000) return `${sign}${(pct / 1000).toFixed(1)}K%`;
  return `${sign}${pct.toFixed(1)}%`;
}

// ── Token selector pill ───────────────────────────────────────────────────────
function TokenPill({ token, selected, onClick, position, currentPrice }) {
  const pnl = calcPnl(position?.entryPrice, currentPrice);
  const pnlColor = pnl === null ? '#5a7a94' : pnl >= 0 ? '#00ff8c' : '#ff4444';

  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 10px', borderRadius: '7px', cursor: 'pointer', fontSize: '11px',
        fontFamily: 'JetBrains Mono', fontWeight: '600', textAlign: 'left',
        background: selected ? '#a78bfa18' : '#0a1520',
        border: `1px solid ${selected ? '#a78bfa66' : '#1a2535'}`,
        color: selected ? '#a78bfa' : '#8b9eb0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '8px', transition: 'all 0.15s ease',
      }}
    >
      <span>${token.baseToken?.symbol}</span>
      {pnl !== null && (
        <span style={{ fontSize: '10px', color: pnlColor, fontWeight: '700' }}>
          {formatPnl(pnl)}
        </span>
      )}
      {pnl === null && position?.entryPrice && (
        <span style={{ fontSize: '9px', color: '#3a6a8a' }}>no entry</span>
      )}
    </button>
  );
}

// ── Entry price input ─────────────────────────────────────────────────────────
function EntryForm({ token, position, onSave }) {
  const [price, setPrice] = useState(position?.entryPrice?.toString() || '');
  const [mcap, setMcap]   = useState(position?.entryMcap?.toString() || '');

  const handleSave = () => {
    const p = parseFloat(price);
    const m = parseFloat(mcap);
    onSave({
      entryPrice: isNaN(p) || p <= 0 ? null : p,
      entryMcap:  isNaN(m) || m <= 0 ? null : m,
    });
  };

  const currentPrice = parseFloat(token.priceUsd || 0);
  const pnl = calcPnl(parseFloat(price), currentPrice);

  return (
    <div style={{
      background: '#060d14', border: '1px solid #1a2535',
      borderRadius: '10px', padding: '12px 14px',
    }}>
      <div style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono', marginBottom: '8px' }}>
        MY ENTRY FOR ${token.baseToken?.symbol}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
        <div>
          <div style={{ fontSize: '9px', color: '#3a6a8a', fontFamily: 'JetBrains Mono', marginBottom: '3px' }}>
            ENTRY PRICE
          </div>
          <input
            type="number"
            step="any"
            placeholder={`e.g. ${formatPrice(currentPrice * 0.8)}`}
            value={price}
            onChange={e => setPrice(e.target.value)}
            style={{
              width: '100%', padding: '6px 8px', borderRadius: '6px',
              background: '#0a1520', border: '1px solid #1e3a52',
              color: '#cde8ff', fontFamily: 'JetBrains Mono', fontSize: '11px',
              outline: 'none',
            }}
          />
        </div>
        <div>
          <div style={{ fontSize: '9px', color: '#3a6a8a', fontFamily: 'JetBrains Mono', marginBottom: '3px' }}>
            ENTRY MCAP (optional)
          </div>
          <input
            type="number"
            step="any"
            placeholder="e.g. 50000"
            value={mcap}
            onChange={e => setMcap(e.target.value)}
            style={{
              width: '100%', padding: '6px 8px', borderRadius: '6px',
              background: '#0a1520', border: '1px solid #1e3a52',
              color: '#cde8ff', fontFamily: 'JetBrains Mono', fontSize: '11px',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Live P&L preview */}
      {pnl !== null && (
        <div style={{
          padding: '6px 10px', borderRadius: '6px', marginBottom: '8px',
          background: pnl >= 0 ? '#00ff8c0a' : '#ff44440a',
          border: `1px solid ${pnl >= 0 ? '#00ff8c22' : '#ff444422'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>Current P&L</span>
          <span style={{
            fontSize: '13px', fontFamily: 'JetBrains Mono', fontWeight: '700',
            color: pnl >= 0 ? '#00ff8c' : '#ff4444',
          }}>
            {formatPnl(pnl)}
          </span>
        </div>
      )}

      <button
        onClick={handleSave}
        style={{
          width: '100%', padding: '7px', borderRadius: '6px', cursor: 'pointer',
          background: '#a78bfa18', border: '1px solid #a78bfa44',
          color: '#a78bfa', fontSize: '11px', fontFamily: 'JetBrains Mono', fontWeight: '600',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
        }}
      >
        <DollarSign size={11} /> Save Entry
      </button>
    </div>
  );
}

// ── Main ExitCoachTab ─────────────────────────────────────────────────────────
export default function ExitCoachTab({ tokens, focusedToken }) {
  const [positions, setPositions]         = useState(() => loadPositions());
  const [selectedToken, setSelectedToken] = useState(focusedToken || tokens[0]);
  const [analysis, setAnalysis]           = useState('');
  const [loading, setLoading]             = useState(false);
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [urgency, setUrgency]             = useState(null);
  const abortRef                          = useRef(false);

  // Sync focused token from outside
  useEffect(() => {
    if (focusedToken) setSelectedToken(focusedToken);
  }, [focusedToken]);

  // Persist positions on change
  useEffect(() => {
    savePositions(positions);
  }, [positions]);

  const handleSaveEntry = useCallback((data) => {
    if (!selectedToken) return;
    setPositions(prev => ({
      ...prev,
      [selectedToken._id]: { ...data, savedAt: Date.now() },
    }));
    setShowEntryForm(false);
    setAnalysis('');
    setUrgency(null);
  }, [selectedToken]);

  const runAnalysis = useCallback(async () => {
    if (!selectedToken) return;
    abortRef.current = false;
    setLoading(true);
    setAnalysis('');
    setUrgency(null);

    const pos = positions[selectedToken._id] || {};

    try {
      const ctx = buildExitCoachContext(selectedToken, pos.entryPrice, pos.entryMcap);
      let out = '';
      for await (const chunk of callGroqStream(EXIT_COACH_SYSTEM, ctx, {
        maxTokens: 350,
        temperature: 0.25,
      })) {
        if (abortRef.current) break;
        out += chunk;
        setAnalysis(out);
        // Detect urgency as text streams in
        const detected = detectUrgency(out);
        if (detected) setUrgency(detected);
      }
    } catch (e) {
      if (e.message === 'NO_API_KEY') {
        setAnalysis('⚠ No Groq API key detected.\n\nOpen the CHAT tab and paste your key there to activate all agents instantly — no redeploy needed.\n\nGet a free key at: console.groq.com/keys');
      } else {
        setAnalysis(`Error: ${e.message}`);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedToken, positions]);

  // Auto-run when token changes and has a saved position
  const selectedTokenId = selectedToken?._id;
  useEffect(() => {
    if (!selectedTokenId) return;
    const pos = positions[selectedTokenId];
    if (pos?.entryPrice) {
      setAnalysis('');
      setUrgency(null);
    }
  }, [selectedTokenId, positions]);

  const urgencyCfg = urgency ? URGENCY[urgency] : null;
  const currentPos = selectedToken ? positions[selectedToken._id] : null;
  const currentPrice = selectedToken ? parseFloat(selectedToken.priceUsd || 0) : 0;
  const pnl = calcPnl(currentPos?.entryPrice, currentPrice);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header strip */}
      <div style={{
        padding: '10px 14px 8px',
        borderBottom: '1px solid #1a2535',
        background: '#0a0f14',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <LogOut size={13} color="#ff8300" />
          <span style={{ fontSize: '11px', color: '#ff8300', fontFamily: 'JetBrains Mono', fontWeight: '700' }}>
            EXIT COACH
          </span>
          <span style={{ fontSize: '10px', color: '#3a6a8a', fontFamily: 'JetBrains Mono' }}>
            · track your positions · know when to exit
          </span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

        {/* Token selector */}
        <div>
          <div style={{ fontSize: '9px', color: '#3a6a8a', fontFamily: 'JetBrains Mono', marginBottom: '5px' }}>
            SELECT POSITION
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
            {tokens.slice(0, 12).map(t => (
              <TokenPill
                key={t._id}
                token={t}
                selected={selectedToken?._id === t._id}
                onClick={() => { setSelectedToken(t); setAnalysis(''); setUrgency(null); setShowEntryForm(false); }}
                position={positions[t._id]}
                currentPrice={parseFloat(t.priceUsd || 0)}
              />
            ))}
          </div>
        </div>

        {selectedToken && (
          <>
            {/* Current token summary */}
            <div style={{
              background: '#0a1520', border: '1px solid #1e3a52',
              borderRadius: '9px', padding: '10px 12px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '13px', color: '#cde8ff', fontFamily: 'JetBrains Mono', fontWeight: '700' }}>
                  ${selectedToken.baseToken?.symbol}
                </span>
                <span style={{ fontSize: '12px', color: '#cde8ff', fontFamily: 'JetBrains Mono' }}>
                  {formatPrice(currentPrice)}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                {[
                  { label: 'MCap', value: formatVolume(selectedToken.marketCap) },
                  { label: '1h chg', value: `${selectedToken.priceChange?.h1?.toFixed(1) || '0'}%`, color: (selectedToken.priceChange?.h1 || 0) >= 0 ? '#00ff8c' : '#ff4444' },
                  { label: 'Age', value: selectedToken.pairCreatedAt ? `${Math.floor((Date.now() - selectedToken.pairCreatedAt) / 60000)}m` : '—' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background: '#060d14', borderRadius: '6px', padding: '5px 7px' }}>
                    <div style={{ fontSize: '9px', color: '#3a6a8a', fontFamily: 'JetBrains Mono' }}>{label}</div>
                    <div style={{ fontSize: '11px', color: color || '#7ab8d4', fontFamily: 'JetBrains Mono', fontWeight: '600' }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* My position row */}
              {currentPos?.entryPrice ? (
                <div style={{
                  marginTop: '8px', padding: '6px 10px', borderRadius: '6px',
                  background: pnl !== null && pnl >= 0 ? '#00ff8c0a' : '#ff44440a',
                  border: `1px solid ${pnl !== null && pnl >= 0 ? '#00ff8c22' : '#ff444422'}`,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div>
                    <span style={{ fontSize: '9px', color: '#3a6a8a', fontFamily: 'JetBrains Mono' }}>MY ENTRY </span>
                    <span style={{ fontSize: '11px', color: '#7ab8d4', fontFamily: 'JetBrains Mono' }}>{formatPrice(currentPos.entryPrice)}</span>
                  </div>
                  <div style={{
                    fontSize: '14px', fontFamily: 'JetBrains Mono', fontWeight: '800',
                    color: pnl !== null && pnl >= 0 ? '#00ff8c' : '#ff4444',
                  }}>
                    {formatPnl(pnl)}
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: '8px', fontSize: '10px', color: '#3a6a8a', fontFamily: 'JetBrains Mono' }}>
                  No entry price set — add one below for P&L tracking
                </div>
              )}
            </div>

            {/* Entry form toggle */}
            <button
              onClick={() => setShowEntryForm(v => !v)}
              style={{
                padding: '7px 10px', borderRadius: '7px', cursor: 'pointer',
                background: '#0a1520', border: '1px solid #1e3a52',
                color: '#5a7a94', fontSize: '10px', fontFamily: 'JetBrains Mono',
                display: 'flex', alignItems: 'center', gap: '5px',
              }}
            >
              <DollarSign size={10} />
              {currentPos?.entryPrice ? 'Edit Entry Price' : 'Set Entry Price'}
              {showEntryForm ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </button>

            {showEntryForm && (
              <EntryForm
                token={selectedToken}
                position={currentPos}
                onSave={handleSaveEntry}
              />
            )}

            {/* Run analysis button */}
            <button
              onClick={runAnalysis}
              disabled={loading}
              style={{
                padding: '10px', borderRadius: '8px', cursor: loading ? 'not-allowed' : 'pointer',
                background: loading ? '#1a2535' : 'linear-gradient(90deg, #ff830018, #ff440018)',
                border: `1px solid ${loading ? '#2a3545' : '#ff830066'}`,
                color: loading ? '#5a7a94' : '#ff8300',
                fontSize: '11px', fontFamily: 'JetBrains Mono', fontWeight: '700',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}
            >
              {loading
                ? <><Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> ANALYSING EXIT...</>
                : <><LogOut size={12} /> ANALYSE EXIT NOW</>
              }
            </button>

            {/* Urgency banner — appears as soon as AI determines it */}
            {urgencyCfg && (
              <div style={{
                padding: '10px 14px', borderRadius: '8px',
                background: urgencyCfg.bg, border: `1px solid ${urgencyCfg.border}`,
                display: 'flex', alignItems: 'center', gap: '8px',
              }}>
                <span style={{ color: urgencyCfg.color }}>{urgencyCfg.icon}</span>
                <span style={{
                  fontSize: '13px', fontFamily: 'JetBrains Mono', fontWeight: '800',
                  color: urgencyCfg.color, letterSpacing: '0.06em',
                }}>
                  {urgencyCfg.label}
                </span>
              </div>
            )}

            {/* Streaming analysis text */}
            {analysis && (
              <div style={{
                background: '#060d14', border: '1px solid #1a2535',
                borderRadius: '9px', padding: '12px 14px',
                fontFamily: 'JetBrains Mono', fontSize: '11px',
                color: '#cde8ff', lineHeight: '1.65',
                whiteSpace: 'pre-wrap',
              }}>
                {analysis}
                {loading && (
                  <span style={{ animation: 'pulse 1s ease-in-out infinite', color: '#ff8300' }}>▋</span>
                )}
              </div>
            )}

            {/* All saved positions */}
            {Object.keys(positions).length > 0 && (
              <div>
                <div style={{ fontSize: '9px', color: '#3a6a8a', fontFamily: 'JetBrains Mono', marginBottom: '5px' }}>
                  ALL TRACKED POSITIONS ({Object.keys(positions).length})
                </div>
                {Object.entries(positions).map(([id, pos]) => {
                  const t = tokens.find(x => x._id === id);
                  if (!t) return null;
                  const cp = parseFloat(t.priceUsd || 0);
                  const p = calcPnl(pos.entryPrice, cp);
                  return (
                    <div key={id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '5px 8px', background: '#0a1520', borderRadius: '6px',
                      marginBottom: '4px', cursor: 'pointer',
                      border: selectedToken?._id === id ? '1px solid #a78bfa44' : '1px solid transparent',
                    }}
                      onClick={() => { setSelectedToken(t); setAnalysis(''); setUrgency(null); }}
                    >
                      <span style={{ fontSize: '10px', color: '#8b9eb0', fontFamily: 'JetBrains Mono' }}>${t.baseToken?.symbol}</span>
                      <span style={{
                        fontSize: '11px', fontFamily: 'JetBrains Mono', fontWeight: '700',
                        color: p === null ? '#5a7a94' : p >= 0 ? '#00ff8c' : '#ff4444',
                      }}>
                        {p !== null ? formatPnl(p) : 'no entry'}
                      </span>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setPositions(prev => { const n = { ...prev }; delete n[id]; return n; });
                        }}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: '#3a6a8a', fontSize: '10px', padding: '2px 4px',
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {!selectedToken && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#3a6a8a', fontFamily: 'JetBrains Mono', fontSize: '11px' }}>
            No tokens scanned yet. Scanner will populate shortly.
          </div>
        )}
      </div>
    </div>
  );
}
