import { useEffect, useRef, useCallback, useState } from 'react';
import { getHeliusKey } from '../utils/config';

const RAYDIUM_AMM_V4  = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
const RAYDIUM_CPMM    = 'CPMDWBwJDtYax9qW7AyRuVC19Cc4L4Vcy4n2BHAbHkCW';
const WS_RECONNECT_MS = 5000;
const MAX_QUEUE       = 50;

function getWsUrl() {
  const key = getHeliusKey();
  if (!key) return null;
  return `wss://mainnet.helius-rpc.com/?api-key=${key}`;
}

function parseMintFromLog(logs) {
  if (!Array.isArray(logs)) return null;
  for (const log of logs) {
    const m = log.match(/Program log: initialize2.*?mint.*?([1-9A-HJ-NP-Za-km-z]{32,44})/i);
    if (m) return m[1];
  }
  return null;
}

export function useHeliusWebSocket(onNewMigration) {
  const wsRef            = useRef(null);
  const reconnectRef     = useRef(null);
  const mountedRef       = useRef(true);
  const queueRef         = useRef([]);
  const [connected,  setConnected]  = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const [detectedCount, setDetectedCount] = useState(0);

  const connect = useCallback(() => {
    const url = getWsUrl();
    if (!url) { setIsAvailable(false); return; }
    setIsAvailable(true);
    if (wsRef.current) { try { wsRef.current.close(); } catch {} }

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setConnected(true);
      [RAYDIUM_AMM_V4, RAYDIUM_CPMM].forEach(prog => {
        ws.send(JSON.stringify({
          jsonrpc: '2.0', id: prog, method: 'logsSubscribe',
          params: [{ mentions: [prog] }, { commitment: 'confirmed' }],
        }));
      });
    };

    ws.onmessage = (e) => {
      if (!mountedRef.current) return;
      try {
        const msg = JSON.parse(e.data);
        const logs = msg?.params?.result?.value?.logs;
        if (!logs) return;
        const logStr = logs.join(' ');
        if (!logStr.includes('initialize2')) return;
        const mint = parseMintFromLog(logs);
        const event = { mint, logs, detectedAt: Date.now() };
        if (queueRef.current.length >= MAX_QUEUE) queueRef.current.shift();
        queueRef.current.push(event);
        setDetectedCount(c => c + 1);
        onNewMigration(event);
      } catch {}
    };

    ws.onerror = () => { setConnected(false); };
    ws.onclose = () => {
      setConnected(false);
      if (!mountedRef.current) return;
      reconnectRef.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, WS_RECONNECT_MS);
    };
  }, [onNewMigration]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectRef.current);
      if (wsRef.current) { try { wsRef.current.close(); } catch {} }
    };
  }, [connect]);

  return { connected, isAvailable, detectedCount };
}
