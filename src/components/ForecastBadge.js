import React, { useState } from 'react';
import { TrendingUp, TrendingDown, Minus, Zap, AlertTriangle, Target, Clock, Loader } from 'lucide-react';

function formatMcap(num) {
  if (!num) return 'N/A';
  if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`;
  if (num >= 1000) return `$${(num / 1000).toFixed(0)}K`;
  return `$${num}`;
}

const DIR_CONFIG = {
  PUMP: {
    color: '#00ff8c',
    bg: 'linear-gradient(135deg, #00ff8c0f 0%, #00d4ff08 100%)',
    border: '#00ff8c44',
    icon: <TrendingUp size={13} />,
    label: '🚀 PUMP SIGNAL',
    glow: '0 0 20px #00ff8c22',
  },
  DUMP: {
    color: '#ff4444',
    bg: 'linear-gradient(135deg, #ff44440f 0%, #ff22220a 100%)',
    border: '#ff444444',
    icon: <TrendingDown size={13} />,
    label: '📉 DUMP SIGNAL',
    glow: '0 0 20px #ff444422',
  },
  NEUTRAL: {
    color: '#ffd700',
    bg: 'linear-gradient(135deg, #ffd7000a 0%, #ff83000a 100%)',
    border: '#ffd70033',
    icon: <Minus size={13} />,
    label: '⏸ CONSOLIDATING',
    glow: 'none',
  },
};

const RISK_COLORS = {
  LOW: '#00ff8c',
  MEDIUM: '#ffd700',
  HIGH: '#ff8300',
  EXTREME: '#ff4444',
};

function ConfidenceBar({ confidence, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{
        flex: 1, height: '4px', background: '#0a1520',
        borderRadius: '2px', overflow: 'hidden',
      }}>
        <div style={{
          width: `${confidence}%`, height: '100%', borderRadius: '2px',
          background: `linear-gradient(90deg, ${color}, ${color}88)`,
          transition: 'width 1s ease',
        }} />
      </div>
      <span style={{ fontSize: '10px', color, fontFamily: 'JetBrains Mono', fontWeight: '700', minWidth: '32px' }}>
        {confidence}%
      </span>
    </div>
  );
}

export default function ForecastBadge({ token, forecast, isLoading, onRequestForecast }) {
  const [expanded, setExpanded] = useState(false);

  if (isLoading) {
    return (
      <div style={{
        marginTop: '10px',
        background: '#0a1520',
        border: '1px solid #1a2535',
        borderRadius: '10px',
        padding: '12px 14px',
        display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        <Loader size={12} color="#00d4ff" style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: '11px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>
          AI FORECAST COMPUTING...
        </span>
      </div>
    );
  }

  if (!forecast) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onRequestForecast(); }}
        style={{
          marginTop: '10px', width: '100%',
          padding: '10px 14px', borderRadius: '10px', cursor: 'pointer',
          border: '1px dashed #1e3a52',
          background: 'transparent',
          color: '#3a6a8a', fontSize: '11px', fontFamily: 'JetBrains Mono',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = '#00d4ff44'; e.currentTarget.style.color = '#00d4ff'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e3a52'; e.currentTarget.style.color = '#3a6a8a'; }}
      >
        <Zap size={11} /> GENERATE AI FORECAST
      </button>
    );
  }

  const cfg = DIR_CONFIG[forecast.direction] || DIR_CONFIG.NEUTRAL;
  const riskColor = RISK_COLORS[forecast.riskLevel] || '#ffd700';

  return (
    <div
      style={{
        marginTop: '10px',
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        borderRadius: '10px',
        padding: '12px 14px',
        boxShadow: cfg.glow,
        cursor: 'pointer',
      }}
      onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: cfg.color }}>{cfg.icon}</span>
          <span style={{
            fontSize: '10px', fontFamily: 'JetBrains Mono', fontWeight: '700',
            color: cfg.color, letterSpacing: '0.06em',
          }}>
            {cfg.label}
          </span>
          {forecast._isHeuristic && (
            <span style={{
              fontSize: '9px', padding: '1px 5px', borderRadius: '3px',
              background: '#1a2535', color: '#5a7a94', fontFamily: 'JetBrains Mono',
            }}>ALGO</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            fontSize: '9px', padding: '1px 6px', borderRadius: '3px',
            background: `${riskColor}18`, border: `1px solid ${riskColor}44`,
            color: riskColor, fontFamily: 'JetBrains Mono', fontWeight: '600',
          }}>
            {forecast.riskLevel} RISK
          </span>
          <span style={{
            fontSize: '9px', color: '#3a6a8a', fontFamily: 'JetBrains Mono',
            display: 'flex', alignItems: 'center', gap: '3px',
          }}>
            <Clock size={9} /> {forecast.timeframe}
          </span>
        </div>
      </div>

      {/* Confidence bar */}
      <ConfidenceBar confidence={forecast.confidence} color={cfg.color} />

      {/* Summary */}
      <div style={{
        marginTop: '8px', fontSize: '11px', color: '#cde8ff',
        fontFamily: 'JetBrains Mono', lineHeight: '1.4',
      }}>
        {forecast.summary}
      </div>

      {/* Targets row */}
      {(forecast.pumpTarget || forecast.dumpTarget) && (
        <div style={{ display: 'grid', gridTemplateColumns: forecast.pumpTarget && forecast.dumpTarget ? '1fr 1fr' : '1fr', gap: '6px', marginTop: '8px' }}>
          {forecast.pumpTarget && (
            <div style={{
              background: '#00ff8c0a', border: '1px solid #00ff8c22',
              borderRadius: '7px', padding: '7px 9px',
            }}>
              <div style={{ fontSize: '9px', color: '#00ff8c', fontFamily: 'JetBrains Mono', marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                <Target size={9} /> PUMP TARGET
              </div>
              <div style={{ fontSize: '12px', color: '#00ff8c', fontFamily: 'JetBrains Mono', fontWeight: '700' }}>
                {formatMcap(forecast.pumpTarget.mcap)}
              </div>
              <div style={{ fontSize: '9px', color: '#3a6a8a', fontFamily: 'JetBrains Mono', marginTop: '1px' }}>
                {forecast.pumpTarget.priceMultiple?.toFixed(1)}x · {forecast.pumpTarget.probability}% prob
              </div>
            </div>
          )}
          {forecast.dumpTarget && (
            <div style={{
              background: '#ff44440a', border: '1px solid #ff444422',
              borderRadius: '7px', padding: '7px 9px',
            }}>
              <div style={{ fontSize: '9px', color: '#ff4444', fontFamily: 'JetBrains Mono', marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                <AlertTriangle size={9} /> DUMP RISK
              </div>
              <div style={{ fontSize: '12px', color: '#ff4444', fontFamily: 'JetBrains Mono', fontWeight: '700' }}>
                -{forecast.dumpTarget.drawdownPct}%
              </div>
              <div style={{ fontSize: '9px', color: '#3a6a8a', fontFamily: 'JetBrains Mono', marginTop: '1px' }}>
                {forecast.dumpTarget.probability}% prob
              </div>
            </div>
          )}
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #1a2535' }}>
          {/* Key signals */}
          {forecast.keySignals?.length > 0 && (
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '9px', color: '#5a7a94', fontFamily: 'JetBrains Mono', marginBottom: '4px' }}>
                KEY SIGNALS:
              </div>
              {forecast.keySignals.map((sig, i) => (
                <div key={i} style={{
                  fontSize: '10px', color: '#8b9eb0', fontFamily: 'JetBrains Mono',
                  paddingLeft: '8px', marginBottom: '2px',
                  borderLeft: `2px solid ${cfg.color}44`,
                }}>
                  {sig}
                </div>
              ))}
            </div>
          )}

          {/* Dump trigger */}
          {forecast.dumpTarget?.triggerSignal && (
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '9px', color: '#ff4444', fontFamily: 'JetBrains Mono', marginBottom: '2px' }}>
                DUMP TRIGGER:
              </div>
              <div style={{ fontSize: '10px', color: '#8b9eb0', fontFamily: 'JetBrains Mono' }}>
                {forecast.dumpTarget.triggerSignal}
              </div>
            </div>
          )}

          {/* Next catalyst */}
          {forecast.nextCatalyst && (
            <div>
              <div style={{ fontSize: '9px', color: '#ffd700', fontFamily: 'JetBrains Mono', marginBottom: '2px' }}>
                NEXT CATALYST:
              </div>
              <div style={{ fontSize: '10px', color: '#8b9eb0', fontFamily: 'JetBrains Mono' }}>
                {forecast.nextCatalyst}
              </div>
            </div>
          )}

          {/* Refresh button */}
          <button
            onClick={(e) => { e.stopPropagation(); onRequestForecast(); }}
            style={{
              marginTop: '8px', padding: '5px 10px', borderRadius: '5px',
              background: '#1a2535', border: '1px solid #2a3545',
              color: '#5a7a94', fontSize: '10px', fontFamily: 'JetBrains Mono',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
            }}
          >
            <Zap size={9} /> Refresh Forecast
          </button>
        </div>
      )}
    </div>
  );
}
