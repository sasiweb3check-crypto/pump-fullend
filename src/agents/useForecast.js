import { useState, useCallback, useRef } from 'react';
import { callGroq } from './groq';
import { hasGroqKey } from '../utils/config';
import {
  FORECAST_SYSTEM,
  buildForecastContext,
  computeHeuristicForecast,
  parseForecastResponse,
} from './forecastEngine';

const CACHE_TTL = 90000; // 90 seconds cache per token
const forecastCache = {}; // module-level cache

export function useForecast() {
  const [forecasts, setForecasts] = useState({}); // tokenId -> forecast
  const [loading, setLoading] = useState({}); // tokenId -> bool
  const pendingRef = useRef(new Set());

  const getForecast = useCallback(async (token) => {
    const id = token._id || token.pairAddress;
    if (!id) return;

    // Check cache
    const cached = forecastCache[id];
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setForecasts(prev => ({ ...prev, [id]: cached.data }));
      return;
    }

    // Avoid duplicate requests
    if (pendingRef.current.has(id)) return;
    pendingRef.current.add(id);

    setLoading(prev => ({ ...prev, [id]: true }));

    try {
      // Try AI first — key comes from user Settings
      let forecast = null;

      if (hasGroqKey()) {
        const context = buildForecastContext(token);
        const raw = await callGroq(FORECAST_SYSTEM, context, {
          maxTokens: 400,
          temperature: 0.15,
        });
        forecast = parseForecastResponse(raw);
      }

      // Fallback to heuristic
      if (!forecast) {
        forecast = computeHeuristicForecast(token);
      }

      forecast._generatedAt = Date.now();
      forecast._tokenSymbol = token.baseToken?.symbol;

      // Cache it
      forecastCache[id] = { timestamp: Date.now(), data: forecast };

      setForecasts(prev => ({ ...prev, [id]: forecast }));
    } catch (e) {
      // Always provide heuristic fallback
      const heuristic = computeHeuristicForecast(token);
      heuristic._generatedAt = Date.now();
      heuristic._tokenSymbol = token.baseToken?.symbol;
      forecastCache[id] = { timestamp: Date.now(), data: heuristic };
      setForecasts(prev => ({ ...prev, [id]: heuristic }));
    } finally {
      setLoading(prev => ({ ...prev, [id]: false }));
      pendingRef.current.delete(id);
    }
  }, []);

  return { forecasts, loading, getForecast };
}
