import React from 'react';
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer } from 'recharts';
import { STRATEGY_WEIGHTS } from '../utils/scoring';

const LABELS = {
  graduationSpeed: 'Grad Speed',
  volumeVelocity: 'Vol Velocity',
  priceMultiple: 'Price ×',
  liquidityDepth: 'Liquidity',
  txFrequency: 'TX Freq',
  socialSignal: 'Dev Signal',
};

export default function ScoreRadar({ scores }) {
  const data = Object.entries(scores).map(([key, value]) => ({
    subject: LABELS[key] || key,
    score: value,
    max: STRATEGY_WEIGHTS[key] || 10,
    pct: Math.round((value / (STRATEGY_WEIGHTS[key] || 10)) * 100),
  }));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <RadarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
        <PolarGrid stroke="rgba(0,255,140,0.15)" />
        <PolarAngleAxis 
          dataKey="subject" 
          tick={{ fill: '#8b9eb0', fontSize: 10, fontFamily: 'JetBrains Mono' }}
        />
        <Radar
          name="Score"
          dataKey="pct"
          stroke="#00ff8c"
          fill="#00ff8c"
          fillOpacity={0.2}
          strokeWidth={2}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
