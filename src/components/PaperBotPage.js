import React, { useState } from 'react';
import {
  Bot, Play, Square, RotateCcw, TrendingUp,
  Settings, DollarSign, Target, Zap, ChevronDown, ChevronUp,
  Activity, ExternalLink, Flame, Clock
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { formatPrice } from '../utils/scoring';

function timeAgoShort(ts) {
  if (!ts) return '—';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m ago`;
}
function fmt(n, dec = 3) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(dec)}◎`;
}
function pct(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function SC({ label, value, sub, color, icon }) {
  return (
    <div style={{ background: '#0d1117', border: '1px solid #1a2535', borderRadius: '10px', padding: '11px 13px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
        {icon && <span style={{ color: color || '#5a7a94' }}>{icon}</span>}
        <span style={{ fontSize: '9px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>{label}</span>
      </div>
      <div style={{ fontSize: '16px', fontWeight: '800', fontFamily: 'Syne', color: color || '#cde8ff', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '9px', color: '#3a6a8a', fontFamily: 'JetBrains Mono', marginTop: '2px' }}>{sub}</div>}
    </div>
  );
}

// ── Daily target progress bar ─────────────────────────────────────────────────
function TargetBar({ progress, todayReturn, dailyTarget }) {
  const color = todayReturn >= dailyTarget ? '#00ff8c'
    : todayReturn >= dailyTarget * 0.5 ? '#ffd700'
    : todayReturn < 0 ? '#ff4444' : '#00d4ff';
  return (
    <div style={{ padding: '12px 16px', background: '#0d1117', border: `1px solid ${color}33`, borderRadius: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span style={{ fontSize: '10px', color, fontFamily: 'JetBrains Mono', fontWeight: '700' }}>
          {todayReturn >= dailyTarget ? '🎯 DAILY TARGET HIT' : `📈 TODAY: ${pct(todayReturn)}`}
        </span>
        <span style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>
          Target: +{dailyTarget}%
        </span>
      </div>
      <div style={{ height: '6px', background: '#1a2535', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{
          width: `${Math.min(100, Math.max(0, progress))}%`, height: '100%',
          background: `linear-gradient(90deg, ${color}, ${color}aa)`,
          borderRadius: '3px', transition: 'width 0.5s ease',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
        <span style={{ fontSize: '9px', color: '#3a6a8a', fontFamily: 'JetBrains Mono' }}>0%</span>
        <span style={{ fontSize: '9px', color: '#3a6a8a', fontFamily: 'JetBrains Mono' }}>
          {Math.round(progress)}% of target
        </span>
        <span style={{ fontSize: '9px', color: '#3a6a8a', fontFamily: 'JetBrains Mono' }}>+{dailyTarget}%</span>
      </div>
    </div>
  );
}

// ── Hourly P&L chart ──────────────────────────────────────────────────────────
function HourlyChart({ data }) {
  const hasData = data.some(d => d.pnl !== 0);
  if (!hasData) return (
    <div style={{ height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3a6a8a', fontFamily: 'JetBrains Mono', fontSize: '10px' }}>
      Hourly P&L appears here as trades close
    </div>
  );
  return (
    <ResponsiveContainer width="100%" height={80}>
      <BarChart data={data} margin={{ top: 2, right: 2, left: -20, bottom: 0 }}>
        <XAxis dataKey="hour" tick={{ fill: '#3a6a8a', fontSize: 8, fontFamily: 'JetBrains Mono' }} />
        <YAxis tick={{ fill: '#3a6a8a', fontSize: 8, fontFamily: 'JetBrains Mono' }} />
        <Tooltip
          contentStyle={{ background: '#0d1117', border: '1px solid #1a2535', borderRadius: '6px', fontFamily: 'JetBrains Mono', fontSize: '10px' }}
          formatter={(val) => [`${val >= 0 ? '+' : ''}${val.toFixed(3)}◎`, 'P&L']}
        />
        <Bar dataKey="pnl" radius={[2,2,0,0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.pnl >= 0 ? '#00ff8c' : '#ff4444'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Open position card ────────────────────────────────────────────────────────
function PositionCard({ position }) {
  const pnlPct   = ((position.lastPrice - position.entryPrice) / position.entryPrice) * 100;
  const pnlSol   = (position.lastPrice - position.entryPrice) / position.entryPrice * position.solAmount;
  const peakPct  = position.peakPrice > 0 ? ((position.peakPrice - position.entryPrice) / position.entryPrice * 100) : 0;
  const ageMin   = ((Date.now() - position.entryTime) / 60000).toFixed(0);
  const isProfit = pnlPct >= 0;
  const trailPct = position.tp1Hit && position.peakPrice > 0
    ? ((position.lastPrice - position.peakPrice) / position.peakPrice * 100)
    : null;

  return (
    <div style={{ display: 'flex', background: '#0d1117', border: `1px solid ${isProfit ? '#00ff8c33' : '#ff444433'}`, borderRadius: '10px', overflow: 'hidden' }}>
      <div style={{ width: '5px', background: isProfit ? '#00ff8c' : '#ff4444', flexShrink: 0 }} />
      <div style={{ flex: 1, padding: '10px 13px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: '800', fontFamily: 'Syne', color: '#e8f4ff' }}>${position.symbol}</span>
            <span style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>S{position.entryScore}</span>
            <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '4px', background: position.conviction >= 60 ? '#00ff8c18' : '#ffd70018', border: `1px solid ${position.conviction >= 60 ? '#00ff8c33' : '#ffd70033'}`, color: position.conviction >= 60 ? '#00ff8c' : '#ffd700', fontFamily: 'JetBrains Mono' }}>
              CV{position.conviction}
            </span>
            {['tp1Hit','tp2Hit','tp3Hit'].map((tp, i) => (
              <div key={tp} style={{ width: '7px', height: '7px', borderRadius: '2px', background: position[tp] ? '#00ff8c' : '#1a2535', border: `1px solid ${position[tp] ? '#00ff8c44' : '#2a3545'}` }} title={`TP${i+1}`} />
            ))}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '15px', fontWeight: '800', fontFamily: 'Syne', color: isProfit ? '#00ff8c' : '#ff4444' }}>{pct(pnlPct)}</div>
            <div style={{ fontSize: '9px', color: '#3a6a8a', fontFamily: 'JetBrains Mono' }}>peak {pct(peakPct)}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '5px', marginBottom: '5px' }}>
          {[
            { l: 'ENTRY', v: formatPrice(position.entryPrice) },
            { l: 'NOW',   v: formatPrice(position.lastPrice) },
            { l: 'P&L',   v: fmt(pnlSol), c: isProfit ? '#00ff8c' : '#ff4444' },
            { l: 'SIZE',  v: `${position.solAmount.toFixed(2)}◎` },
            { l: 'AGE',   v: `${ageMin}m` },
          ].map(({ l, v, c }) => (
            <div key={l} style={{ background: '#0a0f14', borderRadius: '5px', padding: '4px 6px' }}>
              <div style={{ fontSize: '8px', color: '#3a6a8a', fontFamily: 'JetBrains Mono' }}>{l}</div>
              <div style={{ fontSize: '10px', color: c || '#cde8ff', fontFamily: 'JetBrains Mono', fontWeight: '600' }}>{v}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {position.tp1Hit && trailPct !== null && (
            <span style={{ fontSize: '9px', color: trailPct < -10 ? '#ff8300' : '#5a7a94', fontFamily: 'JetBrains Mono' }}>
              Trail: {pct(trailPct)} from peak
            </span>
          )}
          {position.pairAddress && (
            <a href={`https://dexscreener.com/solana/${position.pairAddress}`} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 'auto', color: '#3a6a8a' }}>
              <ExternalLink size={10} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Trade history row ────────────────────────────────────────────────────────
function TradeRow({ trade }) {
  const win = trade.pnlPct >= 0;
  const big = trade.pnlPct >= 100;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 11px', borderRadius: '6px', background: big ? '#00ff8c08' : win ? '#00d4ff06' : '#ff444406', border: `1px solid ${big ? '#00ff8c22' : win ? '#00d4ff18' : '#ff444418'}` }}>
      {big && <span>🔥</span>}
      <span style={{ fontSize: '11px', fontWeight: '800', color: big ? '#00ff8c' : win ? '#00d4ff' : '#ff4444', fontFamily: 'JetBrains Mono', minWidth: '60px' }}>{pct(trade.pnlPct)}</span>
      <span style={{ fontSize: '11px', color: '#cde8ff', fontFamily: 'JetBrains Mono', fontWeight: '700', minWidth: '55px' }}>${trade.symbol}</span>
      <span style={{ fontSize: '10px', color: win ? '#00ff8c' : '#ff4444', fontFamily: 'JetBrains Mono', minWidth: '70px' }}>{fmt(trade.pnlSol)}</span>
      <span style={{ fontSize: '9px', color: '#5a7a94', fontFamily: 'JetBrains Mono', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trade.reason}</span>
      <span style={{ fontSize: '9px', color: '#3a6a8a', fontFamily: 'JetBrains Mono', whiteSpace: 'nowrap' }}>{timeAgoShort(trade.exitTime)}</span>
    </div>
  );
}

// ── Log item ─────────────────────────────────────────────────────────────────
function LogItem({ item }) {
  const c = { BUY:'#00ff8c', SELL:'#00d4ff', TP:'#a78bfa', SL:'#ff4444', INFO:'#5a7a94' }[item.type] || '#5a7a94';
  return (
    <div style={{ display: 'flex', gap: '7px', padding: '4px 0', borderBottom: '1px solid #0a1520' }}>
      <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', background: c+'18', color: c, fontFamily: 'JetBrains Mono', fontWeight: '700', flexShrink: 0, marginTop: '1px' }}>{item.type}</span>
      <span style={{ fontSize: '10px', color: '#8b9eb0', fontFamily: 'JetBrains Mono', flex: 1, lineHeight: '1.5' }}>{item.msg}</span>
      <span style={{ fontSize: '9px', color: '#3a6a8a', fontFamily: 'JetBrains Mono', flexShrink: 0 }}>{timeAgoShort(item.timestamp)}</span>
    </div>
  );
}

// ── Config panel ──────────────────────────────────────────────────────────────
function ConfigPanel({ config, updateConfig }) {
  const [open, setOpen] = useState(false);
  const rows = [
    { key: 'startingBalance', label: 'Starting Balance (◎)',       min: 1,    max: 1000, step: 1,    fmt: v => `${v}◎` },
    { key: 'positionSizePct', label: 'Position Size % of free bal', min: 0.10, max: 0.50, step: 0.05, fmt: v => `${(v*100).toFixed(0)}%` },
    { key: 'maxPositions',    label: 'Max Concurrent Positions',    min: 1,    max: 8,    step: 1,    fmt: v => v },
    { key: 'dailyTargetPct',  label: 'Daily Target %',             min: 50,   max: 400,  step: 25,   fmt: v => `+${v}%` },
    { key: 'dailyStopPct',    label: 'Daily Stop-Loss %',          min: -80,  max: -10,  step: 5,    fmt: v => `${v}%` },
    { key: 'minScore',        label: 'Min Entry Score',            min: 55,   max: 92,   step: 1,    fmt: v => v },
    { key: 'maxAgeMins',      label: 'Max Token Age (min)',        min: 5,    max: 60,   step: 5,    fmt: v => `${v}m` },
    { key: 'maxMcap',         label: 'Max Mcap ($)',               min: 20000,max: 300000,step: 10000,fmt: v => `$${(v/1000).toFixed(0)}K` },
    { key: 'minBuyPressure',  label: 'Min Buy Pressure',          min: 0.50, max: 0.85, step: 0.05, fmt: v => `${(v*100).toFixed(0)}%` },
    { key: 'minVolAccel',     label: 'Min Vol Acceleration',      min: 1.0,  max: 6.0,  step: 0.5,  fmt: v => `${v}×` },
    { key: 'min5mChange',     label: 'Min 5m Price Change %',     min: 0,    max: 10,   step: 0.5,  fmt: v => `+${v}%` },
    { key: 'hardStopPct',     label: 'Hard Stop %',               min: -30,  max: -5,   step: 1,    fmt: v => `${v}%` },
    { key: 'trailingStopPct', label: 'Trailing Stop % from peak', min: -50,  max: -5,   step: 5,    fmt: v => `${v}%` },
    { key: 'tp1Pct',          label: 'TP1 % → sell 40%',          min: 20,   max: 150,  step: 5,    fmt: v => `+${v}%` },
    { key: 'tp2Pct',          label: 'TP2 % → sell 35%',          min: 50,   max: 500,  step: 25,   fmt: v => `+${v}%` },
    { key: 'tp3Pct',          label: 'TP3 % → sell 25%',          min: 100,  max: 1000, step: 50,   fmt: v => `+${v}%` },
    { key: 'timeStopHours',   label: 'Time Stop (hours)',         min: 0.5,  max: 8,    step: 0.5,  fmt: v => `${v}h` },
  ];
  return (
    <div style={{ background: '#0d1117', border: '1px solid #1a2535', borderRadius: '10px', overflow: 'hidden' }}>
      <button onClick={() => setOpen(v => !v)} style={{ width: '100%', padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Settings size={12} color="#5a7a94" />
        <span style={{ fontSize: '11px', color: '#5a7a94', fontFamily: 'JetBrains Mono', fontWeight: '600' }}>BOT CONFIGURATION</span>
        {open ? <ChevronUp size={11} color="#3a6a8a" style={{ marginLeft: 'auto' }} /> : <ChevronDown size={11} color="#3a6a8a" style={{ marginLeft: 'auto' }} />}
      </button>
      {open && (
        <div style={{ padding: '4px 16px 16px', borderTop: '1px solid #1a2535', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          {rows.map(({ key, label, min, max, step, fmt: fmtFn }) => (
            <div key={key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                <span style={{ fontSize: '9px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>{label}</span>
                <span style={{ fontSize: '10px', color: '#00ff8c', fontFamily: 'JetBrains Mono', fontWeight: '700' }}>{fmtFn(config[key])}</span>
              </div>
              <input type="range" min={min} max={max} step={step} value={config[key]}
                onChange={e => updateConfig({ [key]: parseFloat(e.target.value) })}
                style={{ width: '100%', accentColor: '#00ff8c' }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function PaperBotPage({ bot }) {
  const { config, updateConfig, positions, trades, balance, log, stats, resetBot, lastTickAt } = bot;
  const [tab, setTab] = useState('positions');

  const retColor  = stats.totalReturnPct >= config.dailyTargetPct ? '#00ff8c' : stats.totalReturnPct >= 0 ? '#ffd700' : '#ff4444';
  const todayColor = stats.todayReturn >= 0 ? '#00ff8c' : '#ff4444';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: '800', fontFamily: 'Syne, sans-serif', color: '#e8f4ff', letterSpacing: '-0.02em', marginBottom: '3px' }}>
            Intraday Paper Bot
          </h2>
          <p style={{ fontSize: '11px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>
            Target {config.dailyTargetPct}%/day · ultra-fresh ≤{config.maxAgeMins}m · MC≤${(config.maxMcap/1000).toFixed(0)}K · TP1@+{config.tp1Pct}% trail-{Math.abs(config.trailingStopPct)}%
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <button onClick={() => updateConfig({ enabled: !config.enabled })} style={{
            padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: '700',
            background: config.enabled ? '#00ff8c22' : '#ff444418',
            border: `1px solid ${config.enabled ? '#00ff8c66' : '#ff444466'}`,
            color: config.enabled ? '#00ff8c' : '#ff4444',
            fontFamily: 'JetBrains Mono', fontSize: '11px',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            {config.enabled ? <><Square size={11} /> STOP</> : <><Play size={11} /> START</>}
          </button>
          <button onClick={resetBot} style={{ padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', background: '#1a2535', border: '1px solid #2a3545', color: '#5a7a94', fontFamily: 'JetBrains Mono', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <RotateCcw size={11} /> Reset
          </button>
        </div>
      </div>

      {/* Status bar */}
      <div style={{ padding: '8px 14px', borderRadius: '8px', background: config.enabled ? '#00ff8c06' : '#1a2535', border: `1px solid ${config.enabled ? '#00ff8c22' : '#2a3545'}`, display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: config.enabled ? '#00ff8c' : '#3a6a8a', boxShadow: config.enabled ? '0 0 7px #00ff8c' : 'none', animation: config.enabled ? 'pulse 2s infinite' : 'none', flexShrink: 0 }} />
        <span style={{ fontSize: '11px', color: config.enabled ? '#00ff8c' : '#5a7a94', fontFamily: 'JetBrains Mono', fontWeight: '700' }}>
          {config.enabled ? '● RUNNING' : '○ STOPPED'}
        </span>
        {config.enabled && (
          <span style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>
            S≥{config.minScore} · age≤{config.maxAgeMins}m · MC≤${(config.maxMcap/1000).toFixed(0)}K · BP≥{(config.minBuyPressure*100).toFixed(0)}% · {(config.positionSizePct*100).toFixed(0)}%/trade
          </span>
        )}
        {lastTickAt && (
          <span style={{ fontSize: '9px', color: '#3a6a8a', fontFamily: 'JetBrains Mono', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <Clock size={9} /> {timeAgoShort(lastTickAt)}
          </span>
        )}
      </div>

      {/* Daily target progress */}
      <TargetBar
        progress={stats.targetProgress}
        todayReturn={stats.todayReturn}
        dailyTarget={config.dailyTargetPct}
      />

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
        <SC label="PORTFOLIO" value={`${stats.totalPortfolio.toFixed(2)}◎`} sub={`started ${config.startingBalance}◎`} color={retColor} icon={<DollarSign size={12}/>} />
        <SC label="TOTAL RETURN" value={pct(stats.totalReturnPct)} sub={fmt(stats.totalPnlSol)} color={retColor} icon={<TrendingUp size={12}/>} />
        <SC label="TODAY" value={pct(stats.todayReturn)} sub={`${stats.todayTrades} trades today`} color={todayColor} icon={<Flame size={12}/>} />
        <SC label="WIN RATE" value={`${stats.winRate.toFixed(0)}%`} sub={`${stats.wins}W ${stats.losses}L · ${stats.bigWins} 100%+`} color={stats.winRate >= 55 ? '#00ff8c' : '#ff4444'} icon={<Target size={12}/>} />
        <SC label="FREE BAL" value={`${balance.toFixed(2)}◎`} sub={`${config.maxPositions - positions.length} slots`} color="#00d4ff" icon={<Zap size={12}/>} />
        <SC label="AVG WIN" value={pct(stats.avgWinPct)} sub={`avg loss ${pct(stats.avgLossPct)}`} color="#ffd700" icon={<Activity size={12}/>} />
      </div>

      {/* Hourly P&L chart */}
      <div style={{ background: '#0d1117', border: '1px solid #1a2535', borderRadius: '10px', padding: '12px 14px' }}>
        <div style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono', marginBottom: '8px' }}>HOURLY P&L (last 8h)</div>
        <HourlyChart data={stats.hourlyPnl} />
      </div>

      {/* Best trade */}
      {stats.bestTrade && (
        <div style={{ padding: '8px 14px', background: '#00ff8c06', border: '1px solid #00ff8c18', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>🏆</span>
          <span style={{ fontSize: '11px', color: '#00ff8c', fontFamily: 'JetBrains Mono', fontWeight: '700' }}>BEST TRADE:</span>
          <span style={{ fontSize: '11px', color: '#cde8ff', fontFamily: 'JetBrains Mono' }}>
            ${stats.bestTrade.symbol} {pct(stats.bestTrade.pnlPct)} · {fmt(stats.bestTrade.pnlSol)} · {stats.bestTrade.reason}
          </span>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '3px', background: '#0a0f14', padding: '3px', borderRadius: '8px' }}>
        {[
          { id: 'positions', label: `Open (${positions.length})` },
          { id: 'history',   label: `History (${trades.length})` },
          { id: 'log',       label: `Log (${log.length})` },
          { id: 'config',    label: 'Config' },
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

      {/* POSITIONS */}
      {tab === 'positions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {positions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#3a6a8a', fontFamily: 'JetBrains Mono' }}>
              <Bot size={30} color="#1e3a52" style={{ margin: '0 auto 12px', display: 'block' }} />
              <div style={{ fontSize: '12px', color: '#5a7a94', marginBottom: '5px' }}>
                {config.enabled ? 'Scanning for ultra-fresh micro-cap entries...' : 'Start bot to begin trading'}
              </div>
              {config.enabled && (
                <div style={{ fontSize: '10px', lineHeight: '1.6' }}>
                  Needs: Score≥{config.minScore} · age≤{config.maxAgeMins}m · MC≤${(config.maxMcap/1000).toFixed(0)}K<br />
                  BP≥{(config.minBuyPressure*100).toFixed(0)}% · Accel≥{config.minVolAccel}× · 5m≥+{config.min5mChange}%
                </div>
              )}
            </div>
          ) : (
            positions.map(p => <PositionCard key={p.id} position={p} />)
          )}
        </div>
      )}

      {/* HISTORY */}
      {tab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {trades.length === 0
            ? <div style={{ textAlign: 'center', padding: '30px', color: '#3a6a8a', fontFamily: 'JetBrains Mono', fontSize: '11px' }}>No closed trades yet</div>
            : trades.map(t => <TradeRow key={t.id + t.exitTime} trade={t} />)
          }
        </div>
      )}

      {/* LOG */}
      {tab === 'log' && (
        <div style={{ background: '#0a0f14', border: '1px solid #1a2535', borderRadius: '10px', padding: '10px 12px', maxHeight: '400px', overflowY: 'auto' }}>
          {log.length === 0
            ? <div style={{ textAlign: 'center', padding: '20px', color: '#3a6a8a', fontFamily: 'JetBrains Mono', fontSize: '10px' }}>Bot activity here</div>
            : log.map(item => <LogItem key={item.id} item={item} />)
          }
        </div>
      )}

      {/* CONFIG */}
      {tab === 'config' && (
        <>
          <ConfigPanel config={config} updateConfig={updateConfig} />
          <div style={{ padding: '12px 16px', background: '#00ff8c06', border: '1px solid #00ff8c18', borderRadius: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Flame size={12} color="#00ff8c" />
              <span style={{ fontSize: '10px', color: '#00ff8c', fontFamily: 'JetBrains Mono', fontWeight: '700' }}>INTRADAY 1.5×–4× STRATEGY</span>
            </div>
            <div style={{ fontSize: '10px', color: '#8b9eb0', fontFamily: 'JetBrains Mono', lineHeight: '1.8' }}>
              <span style={{ color: '#00ff8c' }}>ENTRY (all 8 must pass):</span> S≥{config.minScore} · age≤{config.maxAgeMins}m · MC≤${(config.maxMcap/1000).toFixed(0)}K · BP≥{(config.minBuyPressure*100).toFixed(0)}% · Accel≥{config.minVolAccel}× · Liq≥${(config.minLiquidity/1000).toFixed(0)}K · 5m≥+{config.min5mChange}% · V/L≥{config.minVlRatio}×{'\n'}
              <span style={{ color: '#a78bfa' }}>SIZE:</span> {(config.positionSizePct*100).toFixed(0)}% of free balance — compounds on every win{'\n'}
              <span style={{ color: '#ffd700' }}>EXITS:</span> TP1 +{config.tp1Pct}% (40%) → TP2 +{config.tp2Pct}% (35%) → TP3 +{config.tp3Pct}% (25%){'\n'}
              <span style={{ color: '#00d4ff' }}>TRAIL:</span> {config.trailingStopPct}% from peak after TP1 · Hard stop {config.hardStopPct}% · Time {config.timeStopHours}h{'\n'}
              <span style={{ color: '#ff4444' }}>DAILY:</span> Target +{config.dailyTargetPct}% · Stop trading if down {Math.abs(config.dailyStopPct)}% on the day
            </div>
          </div>
        </>
      )}
    </div>
  );
}
