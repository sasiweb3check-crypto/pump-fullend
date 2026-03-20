import { useState, useEffect, useRef, useCallback } from 'react';
import { callGroq } from './groq';
import { ALERT_AGENT_SYSTEM, buildAlertContext } from './agentPrompts';

const ALERT_CHECK_INTERVAL = 60000; // 1 minute
const MAX_ALERTS = 50;

export function useAlertAgent(tokens, enabled) {
  const [alerts, setAlerts] = useState([]);
  const [lastCheck, setLastCheck] = useState(null);
  const [checking, setChecking] = useState(false);
  const prevSnapshotRef = useRef({});
  const intervalRef = useRef(null);

  const runCheck = useCallback(async () => {
    if (!tokens.length || checking) return;
    setChecking(true);
    try {
      const context = buildAlertContext(tokens, prevSnapshotRef.current);
      const raw = await callGroq(ALERT_AGENT_SYSTEM, context, {
        maxTokens: 800,
        temperature: 0.2,
      });

      // Parse JSON response
      let newAlerts = [];
      try {
        const clean = raw.replace(/```json|```/g, '').trim();
        newAlerts = JSON.parse(clean);
        if (!Array.isArray(newAlerts)) newAlerts = [];
      } catch {
        // If parsing fails, ignore silently
      }

      if (newAlerts.length > 0) {
        const stamped = newAlerts.map(a => ({
          ...a,
          id: `${a.tokenSymbol}-${a.type}-${Date.now()}`,
          timestamp: Date.now(),
          read: false,
        }));
        setAlerts(prev => [...stamped, ...prev].slice(0, MAX_ALERTS));
      }

      // Update snapshot for next diff
      const snapshot = {};
      for (const t of tokens) {
        snapshot[t._id] = {
          price: parseFloat(t.priceUsd || 0),
          vol1h: t.volume?.h1 || 0,
          score: t._score?.total,
          athGain: t._athGain,
        };
      }
      prevSnapshotRef.current = snapshot;
      setLastCheck(Date.now());
    } catch (e) {
      if (e.message !== 'NO_API_KEY') {
        console.warn('Alert agent error:', e.message);
      }
    } finally {
      setChecking(false);
    }
  }, [tokens, checking]);

  useEffect(() => {
    if (!enabled) return;
    // Initial check after 10s (let tokens populate first)
    const t = setTimeout(runCheck, 10000);
    intervalRef.current = setInterval(runCheck, ALERT_CHECK_INTERVAL);
    return () => {
      clearTimeout(t);
      clearInterval(intervalRef.current);
    };
  }, [enabled, runCheck]);

  const markRead = useCallback((id) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, read: true } : a));
  }, []);

  const markAllRead = useCallback(() => {
    setAlerts(prev => prev.map(a => ({ ...a, read: true })));
  }, []);

  const clearAlerts = useCallback(() => setAlerts([]), []);

  const unreadCount = alerts.filter(a => !a.read).length;

  return { alerts, unreadCount, lastCheck, checking, markRead, markAllRead, clearAlerts };
}
