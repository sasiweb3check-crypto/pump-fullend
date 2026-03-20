import React, { useState, useEffect } from 'react';
import {
  ExternalLink, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, Radio, Bot, Zap, Activity
} from 'lucide-react';
import { formatVolume, formatPrice, timeAgo, getSignalTags, getMcapPhase, getBuySignal, getIntraSignal } from '../utils/scoring';
import ScoreRadar from './ScoreRadar';
import ForecastBadge from './ForecastBadge';

function formatGain(pct) {
  if (pct === null || pct === undefined || isNaN(pct)) return '—';
  const sign = pct >= 0 ? '+' : '';
  if (Math.abs(pct) >= 1000) return `${sign}${(pct / 1000).toFixed(1)}K%`;
  return `${sign}${pct.toFixed(1)}%`;
}

// ── Grade config — used for left border + badge ───────────────────────────────
const GRADE_COLORS = {
  S: { border: '#00ff8c', text: '#00ff8c', glow: '0 0 16px #00ff8c33', bg: '#00ff8c0a' },
  A: { border: '#00d4ff', text: '#00d4ff', glow: '0 0 16px #00d4ff22', bg: '#00d4ff0a' },
  B: { border: '#ffd700', text: '#ffd700', glow: 'none',               bg: '#ffd7000a' },
  C: { border: '#ff8300', text: '#ff8300', glow: 'none',               bg: '#ff83000a' },
  D: { border: '#444',    text: '#555',    glow: 'none',               bg: 'transparent' },
};

// ── Freshness indicator ───────────────────────────────────────────────────────
function FreshnessBar({ freshnessMultiplier }) {
  const pct = Math.round((freshnessMultiplier || 1) * 100);
  const color = pct >= 80 ? '#00ff8c' : pct >= 60 ? '#ffd700' : pct >= 40 ? '#ff8300' : '#ff4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }} title={`Freshness: ${pct}% (decays over 8h)`}>
      <div style={{ width: '40px', height: '3px', background: '#1a2535', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '2px', transition: 'width 0.5s' }} />
      </div>
      <span style={{ fontSize: '9px', color, fontFamily: 'JetBrains Mono' }}>{pct}%</span>
    </div>
  );
}

// ── Detection panel (inside expanded section) ─────────────────────────────────
function DetectionPanel({ token }) {
  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
    function tick() {
      if (!token._detectedAt) return;
      const ms = Date.now() - token._detectedAt;
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      const h = Math.floor(m / 60);
      if (h > 0) setElapsed(`${h}h ${m % 60}m ago`);
      else if (m > 0) setElapsed(`${m}m ${s % 60}s ago`);
      else setElapsed(`${s}s ago`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [token._detectedAt]);

  const gainNow  = token._gainSinceDetection ?? 0;
  const athGain  = token._athGain ?? 0;
  return (
    <div style={{
      background: 'linear-gradient(135deg, #0a1520 0%, #0d1a28 100%)',
      border: '1px solid #1e3a52', borderRadius: '10px', padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
        <Radio size={11} color="#00d4ff" style={{ animation: 'pulse 2s ease-in-out infinite' }} />
        <span style={{ fontSize: '10px', color: '#00d4ff', fontFamily: 'JetBrains Mono', fontWeight: '700' }}>
          DETECTION TRACKER
        </span>
        <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#3a6a8a', fontFamily: 'JetBrains Mono' }}>
          {elapsed}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
        {[
          { label: 'DETECTED', value: token._detectedAt ? new Date(token._detectedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—', sub: token._detectedAt ? new Date(token._detectedAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '' },
          { label: 'PRICE @ DETECT', value: token._priceAtDetection ? formatPrice(token._priceAtDetection) : '—', sub: 'entry price' },
          { label: 'GAIN NOW', value: formatGain(gainNow), color: gainNow >= 0 ? '#00ff8c' : '#ff4444', icon: gainNow >= 0 ? <TrendingUp size={10}/> : <TrendingDown size={10}/> },
          { label: 'ATH SINCE DETECT', value: formatGain(athGain), color: '#ffd700', sub: token._ath ? formatPrice(token._ath) + ' peak' : '' },
        ].map(({ label, value, sub, color, icon }) => (
          <div key={label} style={{ background: '#060d14', borderRadius: '7px', padding: '7px 9px', border: color ? `1px solid ${color}22` : 'none' }}>
            <div style={{ fontSize: '9px', color: '#3a6a8a', fontFamily: 'JetBrains Mono', marginBottom: '2px' }}>{label}</div>
            <div style={{ fontSize: '11px', color: color || '#7ab8d4', fontFamily: 'JetBrains Mono', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '3px' }}>
              {icon}{value}
            </div>
            {sub && <div style={{ fontSize: '9px', color: '#2a4a62', fontFamily: 'JetBrains Mono', marginTop: '1px' }}>{sub}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN TOKEN CARD — restructured with left-border grade + 3-line summary
// ─────────────────────────────────────────────────────────────────────────────
export default function TokenCard({ token, rank, onAskAI, forecast, forecastLoading, onRequestForecast }) {
  const [expanded, setExpanded] = useState(false);
  const { _score: scoreResult }  = token;
  const { total, grade, scores, freshnessMultiplier } = scoreResult;
  const colors  = GRADE_COLORS[grade] || GRADE_COLORS.D;
  const tags    = getSignalTags(token, scoreResult);
  const mcapPhase = getMcapPhase(token.marketCap);

  const priceChange1h  = token.priceChange?.h1  || 0;
  const txns     = token.txns?.h24 || {};
  const totalTxns = (txns.buys || 0) + (txns.sells || 0);
  const buyPct   = totalTxns > 0 ? Math.round((txns.buys / totalTxns) * 100) : 50;
  const gainNow  = token._gainSinceDetection ?? 0;
  const ageMins  = token.pairCreatedAt ? Math.floor((Date.now() - token.pairCreatedAt) / 60000) : null;

  // Action signals
  const buySignal   = getBuySignal(token, scoreResult);
  const intraSignal = getIntraSignal(token, scoreResult);

  // Top 2 positive signals + worst 1 for 3-line summary
  const positiveSignals = tags.filter(t => t.type === 'positive').slice(0, 2);
  const warnSignal      = tags.find(t => t.type === 'negative' || t.type === 'warning');

  return (
    <div
      style={{
        display: 'flex',
        background: '#0d1117',
        border: '1px solid #1a2535',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: colors.glow,
        transition: 'box-shadow 0.2s ease',
        cursor: 'pointer',
      }}
      onClick={() => setExpanded(!expanded)}
    >
      {/* ── LEFT GRADE BORDER ── */}
      <div style={{
        width: '6px',
        background: colors.border,
        flexShrink: 0,
        borderRadius: '0',
        opacity: 0.9,
      }} />

      {/* ── CARD BODY ── */}
      <div style={{ flex: 1, padding: '14px 16px', minWidth: 0 }}>

        {/* ── LINE 1: Symbol + Grade + Price + Gain ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>

          {/* Rank (compact) */}
          {rank && (
            <span style={{
              fontSize: '10px', color: colors.text, fontFamily: 'JetBrains Mono',
              fontWeight: '700', opacity: 0.7, minWidth: '22px',
            }}>#{rank}</span>
          )}

          {/* Symbol */}
          <span style={{
            fontSize: '16px', fontWeight: '800', fontFamily: 'Syne',
            color: '#e8f4ff', letterSpacing: '-0.02em',
          }}>
            {token.baseToken?.symbol || '???'}
          </span>

          {/* Grade badge */}
          <span style={{
            fontSize: '11px', fontWeight: '800', fontFamily: 'JetBrains Mono',
            color: colors.text, background: colors.bg,
            border: `1px solid ${colors.border}66`,
            padding: '1px 7px', borderRadius: '5px',
          }}>
            {grade} {total}
          </span>

          {/* Freshness bar */}
          <FreshnessBar freshnessMultiplier={freshnessMultiplier} />

          {/* Price */}
          <span style={{ fontSize: '13px', color: '#cde8ff', fontFamily: 'JetBrains Mono', fontWeight: '600', marginLeft: 'auto' }}>
            {formatPrice(parseFloat(token.priceUsd || 0))}
          </span>

          {/* 1h change */}
          <span style={{
            display: 'flex', alignItems: 'center', gap: '2px',
            color: priceChange1h >= 0 ? '#00ff8c' : '#ff4444',
            fontFamily: 'JetBrains Mono', fontSize: '12px', fontWeight: '600',
          }}>
            {priceChange1h >= 0 ? <TrendingUp size={11}/> : <TrendingDown size={11}/>}
            {priceChange1h >= 0 ? '+' : ''}{priceChange1h.toFixed(1)}%
          </span>

          {/* GMGN quick link */}
          <a href={`https://gmgn.ai/sol/token/${token.baseToken?.address}`}
            target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{
              fontSize: '9px', padding: '2px 6px', borderRadius: '4px',
              background: '#7c3aed18', border: '1px solid #7c3aed44',
              color: '#a78bfa', textDecoration: 'none', fontFamily: 'JetBrains Mono', fontWeight: '700',
            }}>
            GMGN↗
          </a>
          <a href={`https://dexscreener.com/solana/${token.pairAddress}`}
            target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ color: '#3a6a8a', display: 'flex' }}>
            <ExternalLink size={12} />
          </a>
        </div>

        {/* ── LINE 2: Key stats (compact, scannable) ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>
            Vol <span style={{ color: '#00d4ff' }}>{formatVolume(token.volume?.h24)}</span>
          </span>
          <span style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>
            MCap <span style={{ color: mcapPhase.color }}>{formatVolume(token.marketCap)} {mcapPhase.emoji}</span>
          </span>
          <span style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>
            Liq <span style={{ color: '#7ab8d4' }}>{formatVolume(token.liquidity?.usd)}</span>
          </span>
          <span style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>
            Buys <span style={{ color: buyPct > 55 ? '#00ff8c' : buyPct < 45 ? '#ff4444' : '#ffd700' }}>{buyPct}%</span>
          </span>
          {ageMins !== null && (
            <span style={{ fontSize: '10px', color: '#3a6a8a', fontFamily: 'JetBrains Mono' }}>
              {ageMins < 60 ? `${ageMins}m old` : `${Math.floor(ageMins / 60)}h old`}
            </span>
          )}
          {gainNow !== 0 && (
            <span style={{ fontSize: '10px', fontFamily: 'JetBrains Mono', marginLeft: 'auto', color: gainNow >= 0 ? '#00ff8c' : '#ff4444', fontWeight: '700' }}>
              {gainNow >= 0 ? '+' : ''}{gainNow.toFixed(1)}% since detect
            </span>
          )}
        </div>

        {/* ── SIGNAL BADGES — intraday + buy signals ── */}
        {(intraSignal || buySignal) && (
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '4px' }}>
            {intraSignal && (
              <span style={{
                fontSize: '10px', fontWeight: '800', padding: '2px 9px', borderRadius: '5px',
                fontFamily: 'JetBrains Mono', letterSpacing: '0.03em',
                background: intraSignal.level === 'INTRA_NOW' ? '#ff830022' : '#ff830010',
                border: `1px solid ${intraSignal.level === 'INTRA_NOW' ? '#ff830066' : '#ff830033'}`,
                color: '#ff8300',
                animation: intraSignal.level === 'INTRA_NOW' ? 'pulse 1.5s ease-in-out infinite' : 'none',
              }}>
                ⚡ {intraSignal.level === 'INTRA_NOW' ? 'INTRA NOW' : 'INTRA SOON'} · {intraSignal.passCount}/6 · U{intraSignal.urgency}
              </span>
            )}
            {buySignal && (
              <span style={{
                fontSize: '10px', fontWeight: '800', padding: '2px 9px', borderRadius: '5px',
                fontFamily: 'JetBrains Mono', letterSpacing: '0.03em',
                background: buySignal.level === 'STRONG_BUY' ? '#00ff8c18' : '#ffd70010',
                border: `1px solid ${buySignal.level === 'STRONG_BUY' ? '#00ff8c44' : '#ffd70033'}`,
                color: buySignal.level === 'STRONG_BUY' ? '#00ff8c' : '#ffd700',
              }}>
                {buySignal.level === 'STRONG_BUY' ? '🟢 READY TO BUY' : '👁 WATCH'} · {buySignal.passCount}/7
              </span>
            )}
          </div>
        )}

        {/* ── LINE 3: Top signals + worst warning (scannable summary) ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
          {positiveSignals.map((tag, i) => (
            <span key={i} style={{
              fontSize: '10px', padding: '2px 7px', borderRadius: '4px',
              background: '#00ff8c11', border: '1px solid #00ff8c33',
              color: '#00ff8c', fontFamily: 'JetBrains Mono',
            }}>{tag.label}</span>
          ))}
          {warnSignal && (
            <span style={{
              fontSize: '10px', padding: '2px 7px', borderRadius: '4px',
              background: warnSignal.type === 'negative' ? '#ff444411' : '#ffd70011',
              border: `1px solid ${warnSignal.type === 'negative' ? '#ff444433' : '#ffd70033'}`,
              color: warnSignal.type === 'negative' ? '#ff4444' : '#ffd700',
              fontFamily: 'JetBrains Mono',
            }}>{warnSignal.label}</span>
          )}

          {/* Buy/sell bar (compact) */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '9px', color: '#00ff8c', fontFamily: 'JetBrains Mono' }}>B{txns.buys || 0}</span>
            <div style={{ width: '50px', height: '3px', background: '#1a2535', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ width: `${buyPct}%`, height: '100%', background: 'linear-gradient(90deg, #00ff8c, #00d4ff)', borderRadius: '2px' }} />
            </div>
            <span style={{ fontSize: '9px', color: '#ff4444', fontFamily: 'JetBrains Mono' }}>S{txns.sells || 0}</span>
          </div>

          {/* Expand chevron */}
          <div style={{ display: 'flex', alignItems: 'center', color: '#3a5a74', marginLeft: '6px' }}>
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </div>
        </div>

        {/* ── EXPANDED DETAIL SECTION ── */}
        {expanded && (
          <div style={{ marginTop: '14px', borderTop: '1px solid #1a2535', paddingTop: '14px' }}
            onClick={e => e.stopPropagation()}>

            {/* Full stats grid */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
              gap: '7px', marginBottom: '14px',
            }}>
              {[
                { label: 'VOL 24H',    value: formatVolume(token.volume?.h24) },
                { label: 'VOL 1H',     value: formatVolume(token.volume?.h1) },
                { label: 'MCAP',       value: formatVolume(token.marketCap), color: mcapPhase.color },
                { label: 'LIQUIDITY',  value: formatVolume(token.liquidity?.usd) },
                { label: 'TXNS 24H',   value: totalTxns.toLocaleString() },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: '#0a0f14', borderRadius: '7px', padding: '7px 9px', border: color ? `1px solid ${color}22` : 'none' }}>
                  <div style={{ fontSize: '9px', color: '#5a7a94', fontFamily: 'JetBrains Mono', marginBottom: '2px' }}>{label}</div>
                  <div style={{ fontSize: '11px', color: color || '#cde8ff', fontFamily: 'JetBrains Mono', fontWeight: '600' }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Detection tracker */}
            <DetectionPanel token={token} />

            {/* AI Forecast */}
            <div style={{ marginTop: '10px' }}>
              <ForecastBadge
                token={token}
                forecast={forecast}
                isLoading={forecastLoading}
                onRequestForecast={() => onRequestForecast && onRequestForecast(token)}
              />
            </div>

            {/* All signal tags */}
            {tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '10px' }}>
                {tags.map((tag, i) => (
                  <span key={i} style={{
                    fontSize: '10px', padding: '2px 7px', borderRadius: '4px',
                    fontFamily: 'JetBrains Mono',
                    background: tag.type === 'positive' ? '#00ff8c11' : tag.type === 'warning' ? '#ffd70011' : '#ff444411',
                    border: `1px solid ${tag.type === 'positive' ? '#00ff8c33' : tag.type === 'warning' ? '#ffd70033' : '#ff444433'}`,
                    color: tag.type === 'positive' ? '#00ff8c' : tag.type === 'warning' ? '#ffd700' : '#ff4444',
                  }}>{tag.label}</span>
                ))}
                <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', fontFamily: 'JetBrains Mono', background: '#1a2535', color: '#5a7a94' }}>
                  {token.pairCreatedAt ? timeAgo(token.pairCreatedAt) : 'n/a'}
                </span>
              </div>
            )}

            {/* AI quick actions */}
            {onAskAI && (
              <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                {[
                  { agent: 'techanalyst', icon: <Activity size={11} />, label: 'Tech Analysis', color: '#00d4ff' },
                  { agent: 'forecast',    icon: <Zap size={11} />,      label: 'AI Forecast',   color: '#a78bfa' },
                  { agent: 'exit',        icon: <TrendingDown size={11} />, label: 'Exit Coach', color: '#ff8300' },
                  { agent: 'chat',        icon: <Bot size={11} />,      label: 'Ask AI',        color: '#00ff8c' },
                ].map(({ agent, icon, label, color }) => (
                  <button key={agent} onClick={() => onAskAI(token, agent)} style={{
                    flex: 1, padding: '6px 6px', borderRadius: '7px', cursor: 'pointer',
                    border: `1px solid ${color}33`, background: `${color}0d`, color,
                    fontSize: '10px', fontFamily: 'JetBrains Mono', fontWeight: '600',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px',
                    transition: 'all 0.15s ease',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.background = `${color}22`; }}
                    onMouseLeave={e => { e.currentTarget.style.background = `${color}0d`; }}
                  >
                    {icon} {label}
                  </button>
                ))}
              </div>
            )}

            {/* Score breakdown + radar */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '14px' }}>
              <div>
                <div style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono', marginBottom: '7px' }}>STRATEGY FIT RADAR</div>
                <ScoreRadar scores={scores} />
              </div>
              <div>
                <div style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono', marginBottom: '7px' }}>SCORE BREAKDOWN</div>
                {Object.entries(scores).map(([key, val]) => {
                  const max = { graduationSpeed: 18, volumeVelocity: 22, priceMultiple: 16, buyPressure: 12, liquidityDepth: 8, txFrequency: 12, vlEfficiency: 6, socialSignal: 6 }[key] || 10;
                  const pct = Math.round((val / max) * 100);
                  const lbl = { graduationSpeed: 'Grad Speed', volumeVelocity: 'Vol Velocity', priceMultiple: 'Price ×', buyPressure: 'Buy Pressure', liquidityDepth: 'Liquidity', txFrequency: 'TX/hr', vlEfficiency: 'V/L Ratio', socialSignal: 'Dev Signal' }[key] || key;
                  return (
                    <div key={key} style={{ marginBottom: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span style={{ fontSize: '10px', color: '#8b9eb0', fontFamily: 'JetBrains Mono' }}>{lbl}</span>
                        <span style={{ fontSize: '10px', color: '#cde8ff', fontFamily: 'JetBrains Mono' }}>{val}/{max}</span>
                      </div>
                      <div style={{ height: '3px', background: '#1a2535', borderRadius: '2px' }}>
                        <div style={{ width: `${pct}%`, height: '100%', borderRadius: '2px', background: pct >= 70 ? '#00ff8c' : pct >= 40 ? '#ffd700' : '#ff4444', transition: 'width 0.5s' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Links */}
            <div style={{ display: 'flex', gap: '6px', marginTop: '12px', flexWrap: 'wrap' }}>
              {[
                { label: 'DexScreener', url: `https://dexscreener.com/solana/${token.pairAddress}` },
                { label: 'Pump.fun',    url: `https://pump.fun/${token.baseToken?.address}` },
                { label: 'Birdeye',     url: `https://birdeye.so/token/${token.baseToken?.address}` },
                { label: 'Solscan',     url: `https://solscan.io/token/${token.baseToken?.address}` },
              ].map(({ label, url }) => (
                <a key={label} href={url} target="_blank" rel="noopener noreferrer" style={{
                  fontSize: '10px', padding: '3px 9px', borderRadius: '5px',
                  background: '#0a0f14', border: '1px solid #1a2535',
                  color: '#5a7a94', fontFamily: 'JetBrains Mono', textDecoration: 'none',
                  display: 'flex', alignItems: 'center', gap: '3px',
                }}>
                  {label} <ExternalLink size={9} />
                </a>
              ))}
              <a href={`https://gmgn.ai/sol/token/${token.baseToken?.address}`}
                target="_blank" rel="noopener noreferrer" style={{
                  fontSize: '10px', padding: '3px 10px', borderRadius: '5px',
                  background: '#7c3aed18', border: '1px solid #7c3aed66',
                  color: '#a78bfa', fontFamily: 'JetBrains Mono', fontWeight: '700',
                  textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px',
                }}>
                GMGN <ExternalLink size={9} />
              </a>
            </div>

            {/* CA */}
            <div style={{ marginTop: '8px', padding: '6px 10px', background: '#0a0f14', borderRadius: '5px', fontFamily: 'JetBrains Mono', fontSize: '10px', color: '#5a7a94' }}>
              CA: <span style={{ color: '#3a7ab8' }}>{token.baseToken?.address || 'N/A'}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
