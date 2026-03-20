import React, { useState } from 'react';
import {
  Shield, RefreshCw, Loader, ExternalLink,
  Clock, ChevronDown, ChevronUp, Trash2, Settings, RotateCcw,
  Search, CheckCircle, XCircle, AlertTriangle, Minus
} from 'lucide-react';
import { formatVolume, formatPrice } from '../utils/scoring';

function timeAgoShort(ts) {
  if (!ts) return '—';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ago`;
}

function formatAge(mins) {
  if (mins < 60) return `${Math.floor(mins)}m`;
  return `${(mins / 60).toFixed(1)}h`;
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const LABEL_STYLE = { fontSize: '9px', color: '#5a7a94', fontFamily: 'JetBrains Mono' };
const VALUE_STYLE = { fontSize: '10px', color: '#00ff8c', fontFamily: 'JetBrains Mono', fontWeight: '700' };

// ── Risk score ring ───────────────────────────────────────────────────────────
function RiskRing({ score, decision }) {
  const color = decision === 'STRONG_BUY' ? '#00ff8c'
    : decision === 'WATCH' ? '#ffd700' : '#ff4444';
  const size = 56, r = 22;
  const circ = 2 * Math.PI * r;
  const fill = circ * (1 - Math.min(score, 100) / 100);
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1a2535" strokeWidth="4" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={circ} strokeDashoffset={fill} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: '13px', fontWeight: '800', color, fontFamily: 'JetBrains Mono', lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: '7px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>RISK</span>
      </div>
    </div>
  );
}

// ── Flag list ─────────────────────────────────────────────────────────────────
function FlagList({ flags, type }) {
  const items = flags[type] || [];
  if (!items.length) return null;
  const color = type === 'green' ? '#00ff8c' : type === 'red' ? '#ffd700' : '#ff4444';
  const textColor = type === 'green' ? '#5a9a7a' : type === 'red' ? '#a8924a' : '#b05050';
  const titles = { green: '✅ Green Flags', red: '⚠️ Yellow Flags', critical: '🔴 Critical' };
  return (
    <div style={{ marginBottom: '6px' }}>
      <div style={{ fontSize: '9px', color, fontFamily: 'JetBrains Mono', fontWeight: '700', marginBottom: '3px' }}>
        {titles[type]}
      </div>
      {items.map((f, i) => (
        <div key={i} style={{ fontSize: '10px', color: textColor, fontFamily: 'JetBrains Mono', lineHeight: '1.6', paddingLeft: '4px' }}>
          {f}
        </div>
      ))}
    </div>
  );
}

// ── Config panel ──────────────────────────────────────────────────────────────
function ConfigPanel({ config, updateConfig, resetConfig, scanning }) {
  const [open, setOpen] = useState(false);

  const mcapOptions = [
    { label: '$10K', value: 10_000 },
    { label: '$25K', value: 25_000 },
    { label: '$50K', value: 50_000 },
    { label: '$100K', value: 100_000 },
    { label: '$250K', value: 250_000 },
    { label: '$500K', value: 500_000 },
  ];
  const liqOptions = [
    { label: '$500', value: 500 },
    { label: '$1K', value: 1_000 },
    { label: '$3K', value: 3_000 },
    { label: '$5K', value: 5_000 },
    { label: '$10K', value: 10_000 },
  ];
  const ageOptions = [
    { label: '1h',  value: 60 },
    { label: '2h',  value: 120 },
    { label: '6h',  value: 360 },
    { label: '12h', value: 720 },
    { label: '24h', value: 1440 },
  ];
  const intervalOptions = [
    { label: '3 min',  value: 3 },
    { label: '5 min',  value: 5 },
    { label: '10 min', value: 10 },
    { label: '15 min', value: 15 },
    { label: '30 min', value: 30 },
  ];
  const candidateOptions = [
    { label: '3',  value: 3 },
    { label: '5',  value: 5 },
    { label: '10', value: 10 },
  ];

  // Generic chip selector
  const ChipSelect = ({ label, options, value, onChange, disabled }) => (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ ...LABEL_STYLE, marginBottom: '5px' }}>{label}</div>
      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
        {options.map(o => (
          <button key={o.value} onClick={() => !disabled && onChange(o.value)}
            disabled={disabled}
            style={{
              padding: '4px 10px', borderRadius: '5px', cursor: disabled ? 'not-allowed' : 'pointer',
              border: `1px solid ${value === o.value ? '#00ff8c' : '#1a2535'}`,
              background: value === o.value ? '#00ff8c18' : '#0a0f14',
              color: value === o.value ? '#00ff8c' : '#5a7a94',
              fontSize: '10px', fontFamily: 'JetBrains Mono',
              fontWeight: value === o.value ? '700' : '400',
              opacity: disabled ? 0.5 : 1,
            }}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );

  // Slider field
  const SliderField = ({ label, min, max, step, value, onChange, fmt, disabled }) => (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
        <span style={LABEL_STYLE}>{label}</span>
        <span style={VALUE_STYLE}>{fmt ? fmt(value) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => !disabled && onChange(parseFloat(e.target.value))}
        disabled={disabled}
        style={{ width: '100%', accentColor: '#00ff8c', opacity: disabled ? 0.5 : 1 }}
      />
    </div>
  );

  // Toggle
  const Toggle = ({ label, value, onChange, disabled }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
      <span style={LABEL_STYLE}>{label}</span>
      <button onClick={() => !disabled && onChange(!value)}
        disabled={disabled}
        style={{
          width: '38px', height: '20px', borderRadius: '10px', cursor: disabled ? 'not-allowed' : 'pointer',
          background: value ? '#00ff8c' : '#1a2535', border: 'none', position: 'relative',
          transition: 'background 0.2s', opacity: disabled ? 0.5 : 1,
        }}>
        <div style={{
          width: '14px', height: '14px', borderRadius: '50%', background: '#fff',
          position: 'absolute', top: '3px', transition: 'left 0.2s',
          left: value ? '21px' : '3px',
        }} />
      </button>
    </div>
  );

  return (
    <div style={{ background: '#0d1117', border: '1px solid #1a2535', borderRadius: '10px', overflow: 'hidden' }}>
      <button onClick={() => setOpen(v => !v)} style={{
        width: '100%', padding: '12px 16px', background: 'transparent',
        border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        <Settings size={13} color="#5a7a94" />
        <span style={{ fontSize: '11px', color: '#5a7a94', fontFamily: 'JetBrains Mono', fontWeight: '600' }}>
          SCAN CONFIGURATION
        </span>
        <span style={{ fontSize: '9px', color: '#3a6a8a', fontFamily: 'JetBrains Mono', marginLeft: '4px' }}>
          MC: ${(config.maxMcap / 1000).toFixed(0)}K · Liq: ${(config.minLiquidity / 1000).toFixed(0)}K · Age: {config.maxAgeMins >= 60 ? (config.maxAgeMins / 60).toFixed(0) + 'h' : config.maxAgeMins + 'm'} · Every {config.scanIntervalMins}min
        </span>
        {open
          ? <ChevronUp size={12} color="#3a6a8a" style={{ marginLeft: 'auto' }} />
          : <ChevronDown size={12} color="#3a6a8a" style={{ marginLeft: 'auto' }} />
        }
      </button>

      {open && (
        <div style={{ padding: '4px 16px 16px', borderTop: '1px solid #1a2535' }}>

          {/* FETCH FILTERS */}
          <div style={{ fontSize: '10px', color: '#3a6a8a', fontFamily: 'JetBrains Mono', fontWeight: '700', marginBottom: '10px', marginTop: '10px', letterSpacing: '0.08em' }}>
            ── FETCH FILTERS ──────────────────────
          </div>

          <ChipSelect label="Max Market Cap" options={mcapOptions} value={config.maxMcap}
            onChange={v => updateConfig({ maxMcap: v })} disabled={scanning} />

          <ChipSelect label="Min Liquidity" options={liqOptions} value={config.minLiquidity}
            onChange={v => updateConfig({ minLiquidity: v })} disabled={scanning} />

          <ChipSelect label="Max Token Age" options={ageOptions} value={config.maxAgeMins}
            onChange={v => updateConfig({ maxAgeMins: v })} disabled={scanning} />

          <ChipSelect label="Max Results" options={candidateOptions} value={config.maxCandidates}
            onChange={v => updateConfig({ maxCandidates: v })} disabled={scanning} />

          <ChipSelect label="Auto-Scan Interval" options={intervalOptions} value={config.scanIntervalMins}
            onChange={v => updateConfig({ scanIntervalMins: v })} disabled={scanning} />

          {/* SAFETY THRESHOLDS */}
          <div style={{ fontSize: '10px', color: '#3a6a8a', fontFamily: 'JetBrains Mono', fontWeight: '700', marginBottom: '10px', marginTop: '14px', letterSpacing: '0.08em' }}>
            ── SAFETY THRESHOLDS ──────────────────
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
            <SliderField label="Max Creator Holdings (%)" min={1} max={10} step={0.5}
              value={config.maxCreatorPct} onChange={v => updateConfig({ maxCreatorPct: v })}
              fmt={v => `${v}%`} disabled={scanning} />

            <SliderField label="Max Top 10 Holders (%)" min={10} max={50} step={5}
              value={config.maxTop10Pct} onChange={v => updateConfig({ maxTop10Pct: v })}
              fmt={v => `${v}%`} disabled={scanning} />

            <SliderField label="Min Holder Count" min={10} max={500} step={10}
              value={config.minHolderCount} onChange={v => updateConfig({ minHolderCount: v })}
              fmt={v => `${v}` } disabled={scanning} />

            <SliderField label="Max Buy/Sell Tax (%)" min={1} max={25} step={1}
              value={config.maxTaxPct} onChange={v => updateConfig({ maxTaxPct: v })}
              fmt={v => `${v}%`} disabled={scanning} />
          </div>

          <Toggle label="Require LP Burned/Locked (instant reject if not)"
            value={config.requireLpBurned} onChange={v => updateConfig({ requireLpBurned: v })}
            disabled={scanning} />

          {/* DECISION THRESHOLDS */}
          <div style={{ fontSize: '10px', color: '#3a6a8a', fontFamily: 'JetBrains Mono', fontWeight: '700', marginBottom: '10px', marginTop: '14px', letterSpacing: '0.08em' }}>
            ── DECISION THRESHOLDS ────────────────
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
            <SliderField label="STRONG BUY if risk ≤" min={10} max={40} step={5}
              value={config.strongBuyThreshold} onChange={v => updateConfig({ strongBuyThreshold: Math.min(v, config.watchThreshold - 5) })}
              fmt={v => `≤${v}`} disabled={scanning} />

            <SliderField label="WATCH if risk ≤" min={30} max={70} step={5}
              value={config.watchThreshold} onChange={v => updateConfig({ watchThreshold: Math.max(v, config.strongBuyThreshold + 5) })}
              fmt={v => `≤${v}`} disabled={scanning} />
          </div>

          {/* Reset */}
          <button onClick={resetConfig} disabled={scanning} style={{
            marginTop: '8px', padding: '6px 14px', borderRadius: '6px',
            cursor: scanning ? 'not-allowed' : 'pointer',
            background: '#1a2535', border: '1px solid #2a3545',
            color: '#5a7a94', fontSize: '10px', fontFamily: 'JetBrains Mono',
            display: 'flex', alignItems: 'center', gap: '5px', opacity: scanning ? 0.5 : 1,
          }}>
            <RotateCcw size={10} /> Reset to defaults
          </button>
        </div>
      )}
    </div>
  );
}

// ── Candidate card ────────────────────────────────────────────────────────────
function CandidateCard({ candidate }) {
  const [expanded, setExpanded] = useState(true);
  const { guardianResult, pair, symbol, name, mcap, liquidity, vol24h, ageMins, pairAddress, mint, scoreResult, configSnapshot } = candidate;
  const { riskScore, decision, status, flags, instantFail } = guardianResult;

  const decColor = decision === 'STRONG_BUY' ? '#00ff8c' : decision === 'WATCH' ? '#ffd700' : '#ff4444';
  const decBg    = decision === 'STRONG_BUY' ? '#00ff8c14' : decision === 'WATCH' ? '#ffd70012' : '#ff444412';

  return (
    <div style={{ background: '#0d1117', border: `1px solid ${decColor}44`, borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ display: 'flex' }}>
        <div style={{ width: '5px', background: decColor, flexShrink: 0 }} />
        <div style={{ flex: 1, padding: '14px 16px' }}>

          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' }}>
            <RiskRing score={riskScore} decision={decision} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '16px', fontWeight: '800', fontFamily: 'Syne', color: '#e8f4ff' }}>${symbol}</span>
                <span style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>{name}</span>
                <span style={{
                  fontSize: '10px', fontWeight: '800', padding: '2px 10px', borderRadius: '5px',
                  background: decBg, border: `1px solid ${decColor}44`, color: decColor,
                  fontFamily: 'JetBrains Mono', letterSpacing: '0.04em',
                }}>{status}</span>
                {configSnapshot && (
                  <span style={{ fontSize: '9px', color: '#3a6a8a', fontFamily: 'JetBrains Mono' }}>
                    scanned at MC&lt;${(configSnapshot.maxMcap / 1000).toFixed(0)}K
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {[
                  { l: 'MC',    v: `~$${(mcap / 1000).toFixed(1)}K`,        c: '#00ff8c' },
                  { l: 'Liq',  v: `$${(liquidity / 1000).toFixed(1)}K`,     c: '#00d4ff' },
                  { l: 'Vol',  v: formatVolume(vol24h),                      c: '#a78bfa' },
                  { l: 'Age',  v: formatAge(ageMins),                        c: '#ffd700' },
                  { l: 'Strat',v: `${scoreResult?.total || 0}/100`,          c: '#cde8ff' },
                ].map(({ l, v, c }) => (
                  <span key={l} style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>
                    {l}: <span style={{ color: c, fontWeight: '600' }}>{v}</span>
                  </span>
                ))}
              </div>
            </div>
            <button onClick={() => setExpanded(v => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3a6a8a', flexShrink: 0 }}>
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>

          {/* Critical fail banner */}
          {instantFail && (
            <div style={{ padding: '7px 10px', background: '#ff444412', border: '1px solid #ff444433', borderRadius: '6px', marginBottom: '8px', fontSize: '10px', color: '#ff4444', fontFamily: 'JetBrains Mono' }}>
              🔴 CRITICAL: {instantFail}
            </div>
          )}

          {expanded && (
            <>
              {/* Flags grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '10px' }}>
                <div>
                  <FlagList flags={flags} type="green" />
                  <FlagList flags={flags} type="red" />
                </div>
                <FlagList flags={flags} type="critical" />
              </div>

              {/* Momentum */}
              <div style={{ padding: '8px 10px', background: '#0a0f14', border: '1px solid #1a2535', borderRadius: '7px', marginBottom: '10px' }}>
                <div style={{ ...LABEL_STYLE, marginBottom: '4px' }}>MOMENTUM SNAPSHOT</div>
                <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                  {[
                    { l: '5m',  v: pair.priceChange?.m5  },
                    { l: '1h',  v: pair.priceChange?.h1  },
                    { l: '6h',  v: pair.priceChange?.h6  },
                    { l: '24h', v: pair.priceChange?.h24 },
                  ].filter(x => x.v !== undefined).map(({ l, v }) => (
                    <span key={l} style={{ fontSize: '10px', fontFamily: 'JetBrains Mono' }}>
                      <span style={{ color: '#5a7a94' }}>{l}: </span>
                      <span style={{ color: (v || 0) >= 0 ? '#00ff8c' : '#ff4444', fontWeight: '600' }}>
                        {(v || 0) >= 0 ? '+' : ''}{(v || 0).toFixed(1)}%
                      </span>
                    </span>
                  ))}
                  <span style={{ fontSize: '10px', fontFamily: 'JetBrains Mono', color: '#5a7a94' }}>
                    Price: <span style={{ color: '#cde8ff' }}>{formatPrice(parseFloat(pair.priceUsd || 0))}</span>
                  </span>
                </div>
              </div>

              {/* Recommendation */}
              {decision === 'STRONG_BUY' && (
                <div style={{ padding: '8px 12px', background: '#00ff8c0a', border: '1px solid #00ff8c22', borderRadius: '7px', marginBottom: '10px' }}>
                  <div style={{ fontSize: '9px', color: '#00ff8c', fontFamily: 'JetBrains Mono', fontWeight: '700', marginBottom: '3px' }}>💡 RECOMMENDATION</div>
                  <div style={{ fontSize: '10px', color: '#8b9eb0', fontFamily: 'JetBrains Mono', lineHeight: '1.6' }}>
                    Tiny entry only (0.1–0.5 SOL max) · TP1: 25% at 2–3x · TP2: 25% at 5–8x<br />
                    Exit on: whale dump · volume drop · sell pressure {'>'} 60%
                  </div>
                </div>
              )}
              {decision === 'WATCH' && (
                <div style={{ padding: '8px 12px', background: '#ffd7000a', border: '1px solid #ffd70022', borderRadius: '7px', marginBottom: '10px' }}>
                  <div style={{ fontSize: '9px', color: '#ffd700', fontFamily: 'JetBrains Mono', fontWeight: '700', marginBottom: '3px' }}>👁 WATCH — NOT YET</div>
                  <div style={{ fontSize: '10px', color: '#8b9eb0', fontFamily: 'JetBrains Mono', lineHeight: '1.6' }}>
                    Borderline. Monitor 30–60 min. Only enter if red flags resolve and volume stays organic.
                  </div>
                </div>
              )}

              {/* Links */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {pairAddress && (
                  <a href={`https://dexscreener.com/solana/${pairAddress}`} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: '10px', padding: '4px 10px', borderRadius: '5px', background: '#1a2535', border: '1px solid #2a3545', color: '#5a7a94', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}>
                    DexScreener <ExternalLink size={9} />
                  </a>
                )}
                {mint && (
                  <>
                    <a href={`https://rugcheck.xyz/tokens/${mint}`} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: '10px', padding: '4px 10px', borderRadius: '5px', background: '#00ff8c12', border: '1px solid #00ff8c33', color: '#00ff8c', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      RugCheck <ExternalLink size={9} />
                    </a>
                    <a href={`https://gmgn.ai/sol/token/${mint}`} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: '10px', padding: '4px 10px', borderRadius: '5px', background: '#7c3aed18', border: '1px solid #7c3aed44', color: '#a78bfa', textDecoration: 'none', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      GMGN <ExternalLink size={9} />
                    </a>
                    <a href={`https://birdeye.so/token/${mint}?chain=solana`} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: '10px', padding: '4px 10px', borderRadius: '5px', background: '#1a2535', border: '1px solid #2a3545', color: '#5a7a94', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      Birdeye <ExternalLink size={9} />
                    </a>
                    <a href={`https://solscan.io/token/${mint}`} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: '10px', padding: '4px 10px', borderRadius: '5px', background: '#1a2535', border: '1px solid #2a3545', color: '#5a7a94', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      Solscan <ExternalLink size={9} />
                    </a>
                  </>
                )}
              </div>

              {/* CA */}
              <div style={{ marginTop: '8px', padding: '5px 8px', background: '#0a0f14', borderRadius: '5px', fontSize: '9px', fontFamily: 'JetBrains Mono', color: '#3a7ab8', wordBreak: 'break-all' }}>
                CA: {mint}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TOKEN CHECKER — reverse-engineer any CA against the current config
// ─────────────────────────────────────────────────────────────────────────────
function CheckRow({ check }) {
  const [expanded, setExpanded] = useState(false);

  const icon = check.pass
    ? <CheckCircle size={13} color="#00ff8c" />
    : check.severity === 'critical'
    ? <XCircle size={13} color="#ff4444" />
    : check.severity === 'warning'
    ? <AlertTriangle size={13} color="#ffd700" />
    : <Minus size={13} color="#5a7a94" />;

  const rowBg   = check.pass ? 'transparent'
    : check.severity === 'critical' ? '#ff444408'
    : check.severity === 'warning'  ? '#ffd70006'
    : 'transparent';
  const borderL = check.pass ? '#00ff8c'
    : check.severity === 'critical' ? '#ff4444'
    : check.severity === 'warning'  ? '#ffd700'
    : '#2a3545';
  const actualColor = check.pass ? '#00ff8c'
    : check.severity === 'critical' ? '#ff4444'
    : check.severity === 'warning'  ? '#ffd700'
    : '#5a7a94';

  return (
    <div
      onClick={() => setExpanded(v => !v)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: '10px',
        padding: '7px 10px',
        background: rowBg,
        borderLeft: `3px solid ${borderL}`,
        borderRadius: '0 6px 6px 0',
        marginBottom: '3px',
        cursor: 'pointer',
      }}
    >
      <div style={{ flexShrink: 0, marginTop: '1px' }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', color: '#cde8ff', fontFamily: 'JetBrains Mono', fontWeight: check.pass ? '400' : '600' }}>
            {check.label}
          </span>
          <span style={{ fontSize: '10px', color: actualColor, fontFamily: 'JetBrains Mono', fontWeight: '700' }}>
            {check.actual}
          </span>
          <span style={{ fontSize: '9px', color: '#3a6a8a', fontFamily: 'JetBrains Mono', marginLeft: 'auto' }}>
            {check.threshold}
          </span>
        </div>
        {expanded && (
          <div style={{ fontSize: '10px', color: '#8b9eb0', fontFamily: 'JetBrains Mono', marginTop: '3px', lineHeight: '1.5' }}>
            {check.reason}
          </div>
        )}
      </div>
    </div>
  );
}

function TokenCheckerSection({ guardian }) {
  const { analyzeToken, checking, checkResult, checkError, config } = guardian;
  const [input, setInput] = useState('');
  const [showAll, setShowAll] = useState(false);

  const handleAnalyze = () => {
    const ca = input.trim();
    if (!ca) return;
    analyzeToken(ca);
  };

  // Group checks by category
  const grouped = checkResult?.checks
    ? checkResult.checks.reduce((acc, c) => {
        if (!acc[c.category]) acc[c.category] = [];
        acc[c.category].push(c);
        return acc;
      }, {})
    : null;

  const totalChecks  = checkResult?.checks?.length || 0;
  const passedChecks = checkResult?.checks?.filter(c => c.pass).length || 0;
  const criticalFails = checkResult?.checks?.filter(c => !c.pass && c.severity === 'critical').length || 0;
  const warningFails  = checkResult?.checks?.filter(c => !c.pass && c.severity === 'warning').length || 0;

  const decision    = checkResult?.guardianResult?.decision;
  const riskScore   = checkResult?.guardianResult?.riskScore;
  const decColor    = decision === 'STRONG_BUY' ? '#00ff8c' : decision === 'WATCH' ? '#ffd700' : '#ff4444';
  const decLabel    = decision === 'STRONG_BUY' ? '🟢 STRONG BUY' : decision === 'WATCH' ? '🟡 WATCH' : decision ? '🔴 REJECT' : '';

  return (
    <div style={{ background: '#0d1117', border: '1px solid #1a2535', borderRadius: '12px', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #1a2535', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Search size={14} color="#00d4ff" />
        <span style={{ fontSize: '12px', fontWeight: '700', color: '#00d4ff', fontFamily: 'JetBrains Mono' }}>
          TOKEN CHECKER
        </span>
        <span style={{ fontSize: '10px', color: '#3a6a8a', fontFamily: 'JetBrains Mono' }}>
          — reverse-engineer any CA against your current config
        </span>
      </div>

      <div style={{ padding: '14px 16px' }}>

        {/* Input */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
            placeholder="Paste any Solana token contract address..."
            style={{
              flex: 1, padding: '9px 12px',
              background: '#0a0f14', border: '1px solid #1e3a52',
              borderRadius: '7px', color: '#cde8ff',
              fontFamily: 'JetBrains Mono', fontSize: '11px', outline: 'none',
            }}
            onFocus={e => e.target.style.borderColor = '#3a6a8a'}
            onBlur={e  => e.target.style.borderColor = '#1e3a52'}
          />
          <button
            onClick={handleAnalyze}
            disabled={checking || !input.trim()}
            style={{
              padding: '9px 18px', borderRadius: '7px',
              cursor: checking || !input.trim() ? 'not-allowed' : 'pointer',
              background: checking ? '#1a2535' : '#00d4ff18',
              border: `1px solid ${checking ? '#2a3545' : '#00d4ff44'}`,
              color: checking ? '#5a7a94' : '#00d4ff',
              fontFamily: 'JetBrains Mono', fontSize: '11px', fontWeight: '700',
              display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap',
            }}
          >
            {checking
              ? <><Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> Checking...</>
              : <><Search size={11} /> Analyze</>
            }
          </button>
        </div>

        {/* Config context strip */}
        <div style={{ fontSize: '9px', color: '#3a6a8a', fontFamily: 'JetBrains Mono', marginBottom: '12px' }}>
          Checking against: MC≤${(config.maxMcap/1000).toFixed(0)}K · Liq≥${(config.minLiquidity/1000).toFixed(0)}K · Creator≤{config.maxCreatorPct}% · Top10≤{config.maxTop10Pct}% · Holders≥{config.minHolderCount} · Tax≤{config.maxTaxPct}% · SB≤{config.strongBuyThreshold} · Watch≤{config.watchThreshold}
        </div>

        {/* Error */}
        {checkError && (
          <div style={{ padding: '10px 12px', background: '#ff444410', border: '1px solid #ff444430', borderRadius: '7px', marginBottom: '12px', fontSize: '10px', color: '#ff4444', fontFamily: 'JetBrains Mono' }}>
            ❌ {checkError}
          </div>
        )}

        {/* Result */}
        {checkResult && !checking && (
          <div style={{ animation: 'slideIn 0.3s ease forwards' }}>

            {/* Summary bar */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
              padding: '10px 14px', marginBottom: '12px',
              background: decColor + '0d', border: `1px solid ${decColor}33`,
              borderRadius: '8px',
            }}>
              <RiskRing score={riskScore || 0} decision={decision || 'REJECT'} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '15px', fontWeight: '800', fontFamily: 'Syne', color: '#e8f4ff' }}>
                    ${checkResult.symbol}
                  </span>
                  {checkResult.name && <span style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>{checkResult.name}</span>}
                  <span style={{ fontSize: '11px', fontWeight: '800', color: decColor, fontFamily: 'JetBrains Mono' }}>{decLabel}</span>
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {[
                    { l: 'Checks',   v: `${passedChecks}/${totalChecks} passed`,  c: passedChecks === totalChecks ? '#00ff8c' : '#ffd700' },
                    { l: 'Critical', v: `${criticalFails} fail`, c: criticalFails > 0 ? '#ff4444' : '#00ff8c' },
                    { l: 'Warnings', v: `${warningFails}`,       c: warningFails  > 0 ? '#ffd700' : '#00ff8c' },
                    checkResult.mcap > 0 && { l: 'MC',  v: `$${(checkResult.mcap/1000).toFixed(1)}K`, c: '#cde8ff' },
                    checkResult.liquidity > 0 && { l: 'Liq', v: formatVolume(checkResult.liquidity), c: '#7ab8d4' },
                  ].filter(Boolean).map(({ l, v, c }) => (
                    <span key={l} style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>
                      {l}: <span style={{ color: c, fontWeight: '600' }}>{v}</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Links */}
              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                {checkResult.pairAddress && (
                  <a href={`https://dexscreener.com/solana/${checkResult.pairAddress}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: '9px', padding: '3px 8px', borderRadius: '4px', background: '#1a2535', border: '1px solid #2a3545', color: '#5a7a94', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '2px' }}>
                    DEX <ExternalLink size={8} />
                  </a>
                )}
                <a href={`https://rugcheck.xyz/tokens/${checkResult.mint}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: '9px', padding: '3px 8px', borderRadius: '4px', background: '#00ff8c12', border: '1px solid #00ff8c33', color: '#00ff8c', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '2px' }}>
                  RugCheck <ExternalLink size={8} />
                </a>
                <a href={`https://gmgn.ai/sol/token/${checkResult.mint}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: '9px', padding: '3px 8px', borderRadius: '4px', background: '#7c3aed18', border: '1px solid #7c3aed44', color: '#a78bfa', textDecoration: 'none', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '2px' }}>
                  GMGN <ExternalLink size={8} />
                </a>
              </div>
            </div>

            {/* Critical fails first — always visible */}
            {criticalFails > 0 && (
              <div style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '10px', color: '#ff4444', fontFamily: 'JetBrains Mono', fontWeight: '700', marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <XCircle size={11} /> {criticalFails} CRITICAL FAIL{criticalFails > 1 ? 'S' : ''}
                </div>
                {checkResult.checks.filter(c => !c.pass && c.severity === 'critical').map(c => (
                  <CheckRow key={c.id} check={c} />
                ))}
              </div>
            )}

            {/* Full checklist by category */}
            <div>
              <button
                onClick={() => setShowAll(v => !v)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5a7a94', fontSize: '10px', fontFamily: 'JetBrains Mono', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px', padding: '0' }}>
                {showAll ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                {showAll ? 'Hide full checklist' : `Show full checklist (${totalChecks} checks)`}
              </button>

              {showAll && grouped && Object.entries(grouped).map(([category, items]) => (
                <div key={category} style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '9px', color: '#3a6a8a', fontFamily: 'JetBrains Mono', fontWeight: '700', letterSpacing: '0.08em', marginBottom: '5px', paddingLeft: '3px' }}>
                    {category.toUpperCase()}
                  </div>
                  {items.map(c => <CheckRow key={c.id} check={c} />)}
                </div>
              ))}
            </div>

            {/* Instant fail reason */}
            {checkResult.guardianResult?.instantFail && (
              <div style={{ padding: '8px 12px', background: '#ff444410', border: '1px solid #ff444433', borderRadius: '6px', marginTop: '8px', fontSize: '10px', color: '#ff4444', fontFamily: 'JetBrains Mono' }}>
                🔴 INSTANT FAIL: {checkResult.guardianResult.instantFail}
              </div>
            )}

            {/* CA */}
            <div style={{ marginTop: '8px', padding: '5px 8px', background: '#0a0f14', borderRadius: '5px', fontSize: '9px', fontFamily: 'JetBrains Mono', color: '#3a7ab8', wordBreak: 'break-all' }}>
              CA: {checkResult.mint}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function GuardianPage({ guardian }) {
  const {
    config, updateConfig, resetConfig,
    scanning, candidates, lastScan,
    scanLog, history, checked, total,
    scan, clearHistory,
  } = guardian;

  const [tab, setTab] = useState('scan');

  const strongBuys = candidates.filter(c => c.guardianResult.decision === 'STRONG_BUY');
  const watches    = candidates.filter(c => c.guardianResult.decision === 'WATCH');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <Shield size={20} color="#00ff8c" />
            <h2 style={{ fontSize: '18px', fontWeight: '800', fontFamily: 'Syne, sans-serif', color: '#e8f4ff', letterSpacing: '-0.02em' }}>
              Guardian Scanner
            </h2>
            <span style={{ fontSize: '9px', padding: '2px 7px', borderRadius: '4px', background: '#00ff8c12', border: '1px solid #00ff8c33', color: '#00ff8c', fontFamily: 'JetBrains Mono' }}>v4.0</span>
          </div>
          <p style={{ fontSize: '11px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>
            Auto-scan MC&lt;${(config.maxMcap/1000).toFixed(0)}K · liq≥${(config.minLiquidity/1000).toFixed(0)}K · age≤{config.maxAgeMins>=60?(config.maxAgeMins/60).toFixed(0)+'h':config.maxAgeMins+'m'} · every {config.scanIntervalMins}min · RugCheck + GoPlus
          </p>
        </div>
        <button onClick={scan} disabled={scanning} style={{
          padding: '8px 16px', borderRadius: '8px', cursor: scanning ? 'not-allowed' : 'pointer',
          background: scanning ? '#1a2535' : '#00ff8c18',
          border: `1px solid ${scanning ? '#2a3545' : '#00ff8c44'}`,
          color: scanning ? '#5a7a94' : '#00ff8c',
          fontFamily: 'JetBrains Mono', fontSize: '11px', fontWeight: '700',
          display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0,
        }}>
          {scanning
            ? <><Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> Scanning...</>
            : <><RefreshCw size={11} /> Scan Now</>
          }
        </button>
      </div>

      {/* Token Checker — paste any CA, see every check pass/fail */}
      <TokenCheckerSection guardian={guardian} />

      {/* Config panel */}
      <ConfigPanel config={config} updateConfig={updateConfig} resetConfig={resetConfig} scanning={scanning} />

      {/* Scanning progress */}
      {scanning && total > 0 && (
        <div style={{ padding: '10px 14px', background: '#00ff8c08', border: '1px solid #00ff8c22', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
            <span style={{ fontSize: '10px', color: '#00ff8c', fontFamily: 'JetBrains Mono', fontWeight: '700' }}>
              Running RugCheck + GoPlus safety checks...
            </span>
            <span style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>{checked}/{total}</span>
          </div>
          <div style={{ height: '3px', background: '#1a2535', borderRadius: '2px' }}>
            <div style={{ width: `${total > 0 ? (checked / total) * 100 : 0}%`, height: '100%', background: '#00ff8c', borderRadius: '2px', transition: 'width 0.4s' }} />
          </div>
        </div>
      )}

      {/* Summary strip */}
      {lastScan && !scanning && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '10px', color: '#3a6a8a', fontFamily: 'JetBrains Mono', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Clock size={9} /> {timeAgoShort(lastScan)}
          </span>
          {strongBuys.length > 0 && (
            <span style={{ fontSize: '10px', padding: '2px 9px', borderRadius: '4px', background: '#00ff8c12', border: '1px solid #00ff8c33', color: '#00ff8c', fontFamily: 'JetBrains Mono', fontWeight: '700' }}>
              {strongBuys.length} STRONG BUY
            </span>
          )}
          {watches.length > 0 && (
            <span style={{ fontSize: '10px', padding: '2px 9px', borderRadius: '4px', background: '#ffd70012', border: '1px solid #ffd70033', color: '#ffd700', fontFamily: 'JetBrains Mono', fontWeight: '700' }}>
              {watches.length} WATCH
            </span>
          )}
          {candidates.length === 0 && !scanning && (
            <span style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>
              No candidates passed safety checks
            </span>
          )}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '3px', background: '#0a0f14', padding: '3px', borderRadius: '8px' }}>
        {[
          { id: 'scan',    label: `Candidates (${candidates.length})` },
          { id: 'log',     label: `Log (${scanLog.length})` },
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

      {/* SCAN TAB */}
      {tab === 'scan' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {scanning && candidates.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>
              <Shield size={32} color="#1e3a52" style={{ margin: '0 auto 12px', display: 'block' }} />
              <div style={{ fontSize: '11px' }}>Running safety checks on fresh candidates...</div>
            </div>
          )}

          {!scanning && candidates.length === 0 && (
            <div style={{ padding: '24px', background: '#0d1117', border: '1px solid #1a2535', borderRadius: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: '32px', marginBottom: '10px' }}>🛡</div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#cde8ff', fontFamily: 'JetBrains Mono', marginBottom: '8px' }}>
                NO SAFE CANDIDATES RIGHT NOW
              </div>
              <div style={{ fontSize: '11px', color: '#5a7a94', fontFamily: 'JetBrains Mono', lineHeight: '1.8' }}>
                → Most launches failing rug checks (normal — 95%+ rug)<br />
                → Try relaxing thresholds in config above<br />
                → Next auto-scan in ~{config.scanIntervalMins} min
              </div>
            </div>
          )}

          {candidates.map((c, i) => (
            <CandidateCard key={c.mint + i} candidate={c} />
          ))}

          <div style={{ padding: '10px 14px', background: '#0a0f1408', border: '1px solid #1a2535', borderRadius: '8px' }}>
            <div style={{ fontSize: '10px', color: '#3a6a8a', fontFamily: 'JetBrains Mono', lineHeight: '1.7' }}>
              ⚠️ <strong style={{ color: '#5a7a94' }}>DYOR. NFA. Only risk what you can lose 100%.</strong> Verify live data — on-chain changes fast. Use fast bot (Photon/BullX/BonkBot) with MEV + anti-rug if entering. 95%+ of under-${(config.maxMcap/1000).toFixed(0)}K memecoins rug, dump, or die.
            </div>
          </div>
        </div>
      )}

      {/* LOG TAB */}
      {tab === 'log' && (
        <div style={{ background: '#0a0f14', border: '1px solid #1a2535', borderRadius: '10px', padding: '12px 14px', maxHeight: '420px', overflowY: 'auto' }}>
          {scanLog.length === 0
            ? <div style={{ textAlign: 'center', padding: '20px', color: '#3a6a8a', fontFamily: 'JetBrains Mono', fontSize: '10px' }}>Scan log appears here</div>
            : scanLog.map((line, i) => (
              <div key={i} style={{ fontSize: '10px', color: '#8b9eb0', fontFamily: 'JetBrains Mono', padding: '3px 0', borderBottom: '1px solid #0d1117', lineHeight: '1.5' }}>
                {line}
              </div>
            ))
          }
        </div>
      )}

      {/* HISTORY TAB */}
      {tab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {history.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={clearHistory} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3a6a8a', fontSize: '10px', fontFamily: 'JetBrains Mono', display: 'flex', alignItems: 'center', gap: '3px' }}>
                <Trash2 size={10} /> Clear history
              </button>
            </div>
          )}
          {history.length === 0
            ? <div style={{ textAlign: 'center', padding: '30px', color: '#3a6a8a', fontFamily: 'JetBrains Mono', fontSize: '11px' }}>No scan history yet</div>
            : history.map((c, i) => <CandidateCard key={c.mint + i} candidate={c} />)
          }
        </div>
      )}
    </div>
  );
}
