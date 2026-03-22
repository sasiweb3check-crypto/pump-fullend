import React, { useState } from 'react';
import { Info, ChevronDown, ChevronUp } from 'lucide-react';

const CRITERIA = [
  {
    key: 'graduationSpeed',
    label: 'Graduation Speed',
    max: 18,
    description: '$pump-sdk graduated bonding curve in 19 min. Fast graduation = organic urgency. Penalised if fast but <$500 vol (bot grad).',
    thresholds: [
      { label: '≤20 min', score: 18, color: '#00ff8c' },
      { label: '≤30 min', score: 15, color: '#00d4ff' },
      { label: '≤1 hr',   score: 11, color: '#ffd700' },
      { label: '≤2 hr',   score: 7,  color: '#ff8300' },
      { label: '>6 hr',   score: 0,  color: '#ff4444' },
    ],
  },
  {
    key: 'volumeVelocity',
    label: 'Volume Velocity',
    max: 22,
    description: '$pump-sdk: $787K day 1, $264K peak hour. Score = volume size + acceleration bonus. 3x hourly avg = +6pts. Fading vol = -3pts.',
    thresholds: [
      { label: '>$500K/day', score: 16, color: '#00ff8c' },
      { label: '>$200K/day', score: 13, color: '#00d4ff' },
      { label: '>$100K/day', score: 10, color: '#ffd700' },
      { label: '>$50K/day',  score: 7,  color: '#ff8300' },
      { label: '+accel bonus', score: '+6', color: '#a78bfa' },
    ],
  },
  {
    key: 'priceMultiple',
    label: 'Price Multiple',
    max: 16,
    description: '$pump-sdk: 10.1x BC, 142x ATH. Weights sustained moves (1h/6h/24h) over 5m spikes. Negative price = 0pts.',
    thresholds: [
      { label: '>500%', score: 16, color: '#00ff8c' },
      { label: '>200%', score: 13, color: '#00d4ff' },
      { label: '>100%', score: 10, color: '#ffd700' },
      { label: '>50%',  score: 7,  color: '#ff8300' },
      { label: '<0%',   score: 0,  color: '#ff4444' },
    ],
  },
  {
    key: 'buyPressure',
    label: 'Buy Pressure',
    max: 12,
    description: 'Real-time demand signal. pump-sdk had consistent buy dominance throughout. Buy ratio >75% = full score. Sell dominance = 0.',
    thresholds: [
      { label: '≥75% buys', score: 12, color: '#00ff8c' },
      { label: '≥65% buys', score: 10, color: '#00d4ff' },
      { label: '≥55% buys', score: 7,  color: '#ffd700' },
      { label: '≥45% buys', score: 4,  color: '#ff8300' },
      { label: '<35% buys', score: 0,  color: '#ff4444' },
    ],
  },
  {
    key: 'liquidityDepth',
    label: 'Liquidity Depth',
    max: 8,
    description: 'Deep liquidity after graduation = committed holders, not pure flippers.',
    thresholds: [
      { label: '>$200K', score: 8, color: '#00ff8c' },
      { label: '>$100K', score: 7, color: '#00d4ff' },
      { label: '>$50K',  score: 5, color: '#ffd700' },
      { label: '>$20K',  score: 3, color: '#ff8300' },
    ],
  },
  {
    key: 'txFrequency',
    label: 'TX Frequency',
    max: 12,
    description: '$pump-sdk: 100,371 txns/48h = ~2,091/hr. Scored per-hour to normalise for token age — a 1h old token with 500 txns ranks higher than 24h old.',
    thresholds: [
      { label: '≥2000/hr', score: 12, color: '#00ff8c' },
      { label: '≥800/hr',  score: 10, color: '#00d4ff' },
      { label: '≥300/hr',  score: 7,  color: '#ffd700' },
      { label: '≥100/hr',  score: 5,  color: '#ff8300' },
    ],
  },
  {
    key: 'vlEfficiency',
    label: 'V/L Efficiency',
    max: 6,
    description: 'Volume-to-Liquidity ratio. The nichxbt flywheel drives extreme V/L. >50x with solid liquidity = viral loop confirmed.',
    thresholds: [
      { label: '>50x V/L', score: 6, color: '#00ff8c' },
      { label: '>20x V/L', score: 5, color: '#00d4ff' },
      { label: '>10x V/L', score: 4, color: '#ffd700' },
      { label: '>5x V/L',  score: 2, color: '#ff8300' },
    ],
  },
  {
    key: 'socialSignal',
    label: 'Dev/Social Signal',
    max: 6,
    description: 'Tier-1: SDK, MCP, agent, API, GitHub = instant max. Tier-2: dev, build, code, hack. Tier-3: AI, bot, web3, DeFi. Developer narratives drive the strongest pump.fun flywheels.',
    thresholds: [
      { label: 'SDK/MCP/API', score: 6, color: '#00ff8c' },
      { label: '2x tier-2',   score: 5, color: '#00d4ff' },
      { label: '1x tier-2',   score: 3, color: '#ffd700' },
      { label: 'AI/bot/web3', score: 1, color: '#ff8300' },
    ],
  },
  {
    key: 'earlyExplosionIndex',
    label: '🦞 Early Explosion Index',
    max: 10,
    description: 'The $LARRY Signal. Fires ONLY for micro-MC (<$50K) tokens in the first 60 minutes. Catches coins where Vol/MC ratio is already 2x–5x+ of their market cap — the market pricing in a massive re-rating before CT picks it up. $LARRY at detection: $22.5K MC · $81.8K vol · +577% 1h → 10x from call.',
    thresholds: [
      { label: 'Vol/MC ≥5x',  score: 6, color: '#00ff8c' },
      { label: 'Vol/MC ≥3x',  score: 5, color: '#00d4ff' },
      { label: 'Vol/MC ≥2x',  score: 4, color: '#ffd700' },
      { label: '+age ≤10min', score: '+2', color: '#a78bfa' },
      { label: '+buy ≥70%',   score: '+2', color: '#00ff8c' },
      { label: '+18tx/min',   score: '+2', color: '#ff8300' },
    ],
  },
];

export default function StrategyLegend() {
  const [open, setOpen] = useState(false);

  return (
    <div style={{
      background: '#0d1117',
      border: '1px solid #1a2535',
      borderRadius: '12px',
      marginBottom: '20px',
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', padding: '14px 20px',
          background: 'transparent', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Info size={14} color="#00d4ff" />
          <span style={{ fontSize: '12px', fontFamily: 'JetBrains Mono', color: '#00d4ff', fontWeight: '600' }}>
            STRATEGY: NICHXBT PUMP.FUN SDK METHOD
          </span>
          <span style={{
            fontSize: '10px', padding: '1px 8px', borderRadius: '4px',
            background: '#00d4ff11', border: '1px solid #00d4ff33', color: '#00d4ff',
            fontFamily: 'JetBrains Mono',
          }}>
            $2.1M vol · 9 signals · v3
          </span>
        </div>
        {open ? <ChevronUp size={14} color="#5a7a94" /> : <ChevronDown size={14} color="#5a7a94" />}
      </button>

      {open && (
        <div style={{ padding: '0 20px 20px', borderTop: '1px solid #1a2535' }}>
          <p style={{
            fontSize: '12px', color: '#8b9eb0', fontFamily: 'JetBrains Mono',
            lineHeight: '1.6', margin: '12px 0',
          }}>
            On Feb 26, 2026, nichxbt reverse-engineered pump.fun's SDK and open-sourced it.
            A community member launched $pump-sdk. Within 48 hours: $2.1M volume, 100K+ txns, 142x from entry.
            Strategy 9 — the <strong style={{color:'#a78bfa'}}>Early Explosion Index</strong> — models the $LARRY pattern:
            micro-MC coins (&lt;$50K) whose Vol/MC ratio explodes in the first 60 minutes signal a massive re-rating
            before aggregators catch up. This scanner identifies tokens exhibiting all 9 signals. Max score: 100pts.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: '10px' }}>
            {CRITERIA.map(c => (
              <div key={c.key} style={{
                background: '#0a0f14', borderRadius: '8px', padding: '12px',
                border: '1px solid #1a2535',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', color: '#cde8ff', fontFamily: 'JetBrains Mono', fontWeight: '600' }}>
                    {c.label}
                  </span>
                  <span style={{ fontSize: '11px', color: '#00ff8c', fontFamily: 'JetBrains Mono' }}>
                    max {c.max}pts
                  </span>
                </div>
                <p style={{ fontSize: '11px', color: '#5a7a94', fontFamily: 'JetBrains Mono', margin: '0 0 8px', lineHeight: '1.5' }}>
                  {c.description}
                </p>
                {c.thresholds && (
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {c.thresholds.map((t, i) => (
                      <span key={i} style={{
                        fontSize: '10px', padding: '2px 6px', borderRadius: '3px',
                        background: t.color + '11', border: `1px solid ${t.color}33`,
                        color: t.color, fontFamily: 'JetBrains Mono',
                      }}>
                        {t.label}→{t.score}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Mcap modifier note */}
          <div style={{
            marginTop: '10px', padding: '10px 14px',
            background: '#a78bfa08', border: '1px solid #a78bfa22', borderRadius: '8px',
          }}>
            <span style={{ fontSize: '11px', color: '#a78bfa', fontFamily: 'JetBrains Mono' }}>
              📊 MCAP MODIFIER: Micro (&lt;$50K) +3pts · Extended ($500K-$1.5M) -2pts · Mega (&gt;$1.5M) -5pts
            </span>
          </div>

          {/* Grade system */}
          <div style={{
            marginTop: '8px', padding: '10px 14px',
            background: '#00ff8c08', border: '1px solid #00ff8c22', borderRadius: '8px',
          }}>
            <span style={{ fontSize: '11px', color: '#00ff8c', fontFamily: 'JetBrains Mono' }}>
              ⚡ GRADE SYSTEM: S (78+) → STRONG FIT · A (62-77) → GOOD FIT · B (46-61) → MODERATE · C (30-45) → WEAK · D (&lt;30) → NO FIT
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
