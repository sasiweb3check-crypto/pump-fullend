import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useTokenScanner } from './hooks/useTokenScanner';
import { useAlertAgent } from './agents/useAlertAgent';
import { useForecast } from './agents/useForecast';
import { useWatchlist } from './hooks/useWatchlist';
import { useHeliusWebSocket } from './hooks/useHeliusWebSocket';
import { useWalletTracker } from './hooks/useWalletTracker';
import { usePaperBot } from './hooks/usePaperBot';
import { useTelegramHunter } from './hooks/useTelegramHunter';
import { useGuardian } from './hooks/useGuardian';
import Sidebar from './components/Sidebar';
import TokenCard from './components/TokenCard';
import TokenLookup from './components/TokenLookup';
import AlertsPage from './components/AlertsPage';
import WatchlistPage from './components/WatchlistPage';
import WalletTrackerPage from './components/WalletTrackerPage';
import PaperBotPage from './components/PaperBotPage';
import TelegramHunterPage from './components/TelegramHunterPage';
import GuardianPage from './components/GuardianPage';
import SettingsPage from './components/SettingsPage';
import FilterBar, { applyFilters } from './components/FilterBar';
import StatsHeader from './components/StatsHeader';
import StrategyLegend from './components/StrategyLegend';
import AgentPanel from './components/AgentPanel';
import { hasGroqKey, hasHeliusKey } from './utils/config';
import { Zap, Activity, Settings } from 'lucide-react';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

function MobileTabBar({ activePage, setActivePage, unreadCount, watchlistCount, walletAlertCount }) {
  const tabs = [
    { id: 'scanner',  icon: '📡', label: 'Scanner' },
    { id: 'guardian', icon: '🛡',  label: 'Guardian' },
    { id: 'lookup',   icon: '🔍', label: 'Lookup' },
    { id: 'watchlist',icon: '📌', label: 'Watch',   badge: watchlistCount },
    { id: 'bot',      icon: '🤖', label: 'Bot' },
    { id: 'alerts',   icon: '🔔', label: 'Alerts',  badge: unreadCount },
    { id: 'settings', icon: '⚙️', label: 'Keys' },
  ];
  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 200, background: '#0a0f14', borderTop: '1px solid #1a2535', display: 'flex', padding: '0 4px env(safe-area-inset-bottom, 0)' }}>
      {tabs.map(tab => (
        <button key={tab.id} onClick={() => setActivePage(tab.id)} style={{ flex: 1, padding: '8px 2px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', position: 'relative', borderTop: activePage === tab.id ? '2px solid #00ff8c' : '2px solid transparent' }}>
          <span style={{ fontSize: '14px', lineHeight: 1 }}>{tab.icon}</span>
          <span style={{ fontSize: '8px', fontFamily: 'JetBrains Mono', fontWeight: '600', color: activePage === tab.id ? '#00ff8c' : '#5a7a94' }}>{tab.label}</span>
          {tab.badge > 0 && <span style={{ position: 'absolute', top: '4px', right: '4px', minWidth: '14px', height: '14px', borderRadius: '7px', background: '#ff4444', color: '#fff', fontSize: '8px', fontFamily: 'JetBrains Mono', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>{tab.badge > 9 ? '9+' : tab.badge}</span>}
        </button>
      ))}
    </div>
  );
}

// ── First-run prompt if no keys are set ──────────────────────────────────────
function SetupBanner({ onGoToSettings }) {
  return (
    <div style={{ margin: '0 0 16px', padding: '14px 16px', background: '#a78bfa11', border: '1px solid #a78bfa44', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: '200px' }}>
        <div style={{ fontSize: '11px', color: '#a78bfa', fontFamily: 'JetBrains Mono', fontWeight: '700', marginBottom: '2px' }}>⚙ API Keys not configured</div>
        <div style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>
          Scanner works without keys · Add Groq + Helius keys to unlock AI agents, live WebSocket detection, and wallet tracker.
        </div>
      </div>
      <button onClick={onGoToSettings} style={{ padding: '7px 14px', borderRadius: '7px', border: '1px solid #a78bfa55', background: '#a78bfa22', color: '#a78bfa', cursor: 'pointer', fontSize: '10px', fontFamily: 'JetBrains Mono', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
        <Settings size={11} /> Configure Keys
      </button>
    </div>
  );
}

export default function App() {
  const isMobile = useIsMobile();
  const [, forceUpdate] = useState(0); // re-render after config save

  const { tokens, loading, error, lastUpdate, scanCount, refresh, serverMode } = useTokenScanner();
  const [filter, setFilter]     = useState('all');
  const [sort, setSort]         = useState('score');
  const [minScore, setMinScore] = useState(0);
  const [autoForecast, setAutoForecast] = useState(false);
  const [activePage, setActivePage]     = useState('scanner');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [migrationBanner, setMigrationBanner]   = useState(null);

  const { forecasts, loading: forecastLoading, getForecast } = useForecast();

  const { tokens: watchlistTokens, addresses: watchlistAddresses, loading: watchlistLoading, refreshing: watchlistRefreshing, errors: watchlistErrors, addToWatchlist, removeFromWatchlist, refreshToken: refreshWatchlistToken, refreshAll: refreshWatchlist, isWatchlisted, count: watchlistCount } = useWatchlist();

  const { connected: wsConnected, isAvailable: wsAvailable, detectedCount } = useHeliusWebSocket(
    useCallback((event) => {
      setMigrationBanner({ ...event, shownAt: Date.now() });
      setTimeout(() => setMigrationBanner(null), 8000);
      setTimeout(() => refresh(), 3000);
    }, [refresh])
  );

  const walletTracker  = useWalletTracker();
  const paperBot       = usePaperBot(tokens);
  const telegramHunter = useTelegramHunter(addToWatchlist);
  const guardian       = useGuardian();

  useEffect(() => {
    if (!autoForecast || tokens.length === 0) return;
    tokens.slice(0, 5).forEach(t => {
      const id = t._id || t.pairAddress;
      if (!forecasts[id]) getForecast(t);
    });
  }, [autoForecast, tokens, forecasts, getForecast]);

  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [focusedToken, setFocusedToken]   = useState(null);
  const [agentInitialTab, setAgentInitialTab] = useState('chat');

  const { alerts, unreadCount, checking, lastCheck, markRead, markAllRead, clearAlerts } = useAlertAgent(tokens, alertsEnabled);
  const filtered = useMemo(() => applyFilters(tokens, filter, sort, minScore), [tokens, filter, sort, minScore]);

  const handleAskAI = useCallback((token, agentType) => { setFocusedToken(token); setAgentInitialTab(agentType); }, []);
  const handleClearFocus = useCallback(() => setFocusedToken(null), []);

  const keysConfigured = hasGroqKey() || hasHeliusKey();

  const pageSubtitle = {
    scanner:  'Real-time Solana memecoin scanner · nichxbt strategy · auto-refresh 30s',
    guardian: 'Guardian v4.0 · ultra-conservative · <$50K mcap · RugCheck + GoPlus safety gates',
    lookup:   'Analyze any Solana token by contract address',
    watchlist:`${watchlistCount} token${watchlistCount !== 1 ? 's' : ''} tracked · auto-refresh 30s`,
    hunter:   'Telegram alpha hunter · paste message → extract CA → 8-signal score → TRACK/SKIP',
    wallets:  'Copy-trade wallet tracker · Raydium buy detection',
    bot:      `Paper bot ${paperBot.config.enabled ? '● RUNNING' : '○ stopped'} · ${paperBot.positions.length} open · ${paperBot.stats.totalReturnPct.toFixed(1)}% return`,
    alerts:   'AI-powered background alerts · Groq llama-3.3-70b',
    settings: 'Configure API keys · stored in your browser only',
  }[activePage] || '';

  return (
    <div style={{ minHeight: '100vh', background: '#060a0f', color: '#e8f4ff', fontFamily: 'JetBrains Mono, monospace', display: 'flex' }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #060a0f; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes buyPulse { 0%, 100% { box-shadow: 0 0 0 0 #00ff8c33; } 50% { box-shadow: 0 0 0 6px #00ff8c00; } }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: #060a0f; }
        ::-webkit-scrollbar-thumb { background: #1a2535; border-radius: 3px; }
        select option { background: #0d1117; color: #cde8ff; }
        input[type=range] { accent-color: #00ff8c; }
      `}</style>

      {!isMobile && (
        <Sidebar activePage={activePage} setActivePage={setActivePage} unreadCount={unreadCount} watchlistCount={watchlistCount} collapsed={sidebarCollapsed} setCollapsed={setSidebarCollapsed} wsConnected={wsConnected} wsAvailable={wsAvailable} walletAlertCount={walletTracker.unreadCount} />
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflowX: 'hidden', paddingBottom: isMobile ? '60px' : '0' }}>
        {/* Header */}
        <div style={{ background: 'linear-gradient(180deg, #0d1520 0%, #060a0f 100%)', borderBottom: '1px solid #1a2535', padding: isMobile ? '12px 16px' : '14px 24px', position: 'sticky', top: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: isMobile ? '15px' : '18px', fontWeight: '800', fontFamily: 'Syne, sans-serif', letterSpacing: '-0.03em', background: 'linear-gradient(90deg, #00ff8c, #00d4ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>PUMPSDK</h1>
              {[
                { label: 'LIVE', bg: '#00ff8c11', border: '#00ff8c33', color: '#00ff8c' },
                { label: '8 AI', bg: '#00d4ff11', border: '#00d4ff33', color: '#00d4ff' },
                wsAvailable && wsConnected ? { label: '⚡ WS', bg: '#00ff8c11', border: '#00ff8c44', color: '#00ff8c' } : null,
              ].filter(Boolean).map(b => (
                <span key={b.label} style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', background: b.bg, border: `1px solid ${b.border}`, color: b.color }}>{b.label}</span>
              ))}
            </div>
            {!isMobile && <p style={{ fontSize: '10px', color: '#5a7a94', marginTop: '1px' }}>{pageSubtitle}</p>}
          </div>
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            <button onClick={() => setAutoForecast(v => !v)} style={{ fontSize: '9px', padding: '5px 9px', borderRadius: '6px', cursor: 'pointer', background: autoForecast ? '#a78bfa18' : '#1a2535', border: `1px solid ${autoForecast ? '#a78bfa66' : '#2a3545'}`, color: autoForecast ? '#a78bfa' : '#5a7a94', fontFamily: 'JetBrains Mono', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '3px' }}>
              <Zap size={9} /> {autoForecast ? 'FORECAST ON' : 'FORECAST'}
            </button>
            {!isMobile && (
              <button onClick={() => setActivePage('settings')} style={{ fontSize: '9px', padding: '5px 9px', borderRadius: '6px', cursor: 'pointer', background: activePage === 'settings' ? '#a78bfa18' : '#1a2535', border: `1px solid ${activePage === 'settings' ? '#a78bfa66' : '#2a3545'}`, color: activePage === 'settings' ? '#a78bfa' : '#5a7a94', fontFamily: 'JetBrains Mono', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '3px' }}>
                <Settings size={9} /> KEYS
              </button>
            )}
          </div>
        </div>

        {/* WS migration banner */}
        {migrationBanner && (
          <div style={{ padding: '10px 20px', background: '#00ff8c18', borderBottom: '1px solid #00ff8c44', display: 'flex', alignItems: 'center', gap: '10px', animation: 'slideDown 0.3s ease' }}>
            <Activity size={14} color="#00ff8c" style={{ animation: 'pulse 1s infinite', flexShrink: 0 }} />
            <span style={{ fontSize: '11px', color: '#00ff8c', fontFamily: 'JetBrains Mono', fontWeight: '700' }}>⚡ NEW RAYDIUM MIGRATION DETECTED</span>
            <span style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>{migrationBanner.mint ? `Mint: ${migrationBanner.mint.slice(0, 12)}...` : 'Fetching token data...'}{' · Refreshing scanner...'}</span>
            <span style={{ fontSize: '10px', color: '#3a6a8a', fontFamily: 'JetBrains Mono', marginLeft: 'auto' }}>Total detected: {detectedCount}</span>
          </div>
        )}

        {/* Page content */}
        <div style={{ flex: 1, padding: isMobile ? '14px 12px' : '20px 24px', overflowY: 'auto' }}>

          {/* SCANNER */}
          {activePage === 'scanner' && (
            <>
              {!keysConfigured && <SetupBanner onGoToSettings={() => setActivePage('settings')} />}
              <StatsHeader tokens={tokens} lastUpdate={lastUpdate} scanCount={scanCount} loading={loading} onRefresh={refresh} serverMode={serverMode} />
              {!isMobile && <StrategyLegend />}
              <FilterBar filter={filter} setFilter={setFilter} sort={sort} setSort={setSort} minScore={minScore} setMinScore={setMinScore} count={filtered.length} />
              {loading && tokens.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#5a7a94' }}>
                  <div style={{ width: '36px', height: '36px', border: '2px solid #00ff8c', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
                  <div style={{ fontSize: '12px', color: '#00ff8c', fontFamily: 'JetBrains Mono' }}>SCANNING SOLANA...</div>
                </div>
              ) : error ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#ff4444', fontFamily: 'JetBrains Mono', fontSize: '12px' }}>
                  ⚠ {error}
                  <button onClick={refresh} style={{ display: 'block', margin: '10px auto', padding: '7px 14px', borderRadius: '6px', background: '#ff444411', border: '1px solid #ff4444', color: '#ff4444', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontSize: '11px' }}>RETRY</button>
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#5a7a94', fontFamily: 'JetBrains Mono', fontSize: '12px' }}>
                  {tokens.length === 0 ? 'No tokens yet — scanner populating shortly.' : 'No tokens match filters.'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {filtered.map((token, idx) => (
                    <div key={token._id || idx} style={{ animation: 'slideIn 0.3s ease forwards', animationDelay: `${Math.min(idx * 20, 200)}ms` }}>
                      <TokenCard token={token} rank={idx + 1} onAskAI={handleAskAI} forecast={forecasts[token._id || token.pairAddress]} forecastLoading={forecastLoading[token._id || token.pairAddress]} onRequestForecast={getForecast} />
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: '30px', padding: '16px 0', borderTop: '1px solid #1a2535', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ fontSize: '10px', color: '#3a5a74', fontFamily: 'JetBrains Mono' }}>Strategy by <a href="https://x.com/nichxbt" target="_blank" rel="noopener noreferrer" style={{ color: '#5a7a94', textDecoration: 'none' }}>@nichxbt</a> · $pump-sdk · $2.1M vol</div>
                <div style={{ fontSize: '10px', color: '#3a5a74', fontFamily: 'JetBrains Mono' }}>NOT financial advice</div>
              </div>
            </>
          )}

          {activePage === 'guardian'  && <GuardianPage guardian={guardian} />}
          {activePage === 'lookup'    && <TokenLookup onAskAI={handleAskAI} addToWatchlist={addToWatchlist} isWatchlisted={isWatchlisted} />}
          {activePage === 'watchlist' && <WatchlistPage tokens={watchlistTokens} addresses={watchlistAddresses} loading={watchlistLoading} refreshing={watchlistRefreshing} errors={watchlistErrors} addToWatchlist={addToWatchlist} removeFromWatchlist={removeFromWatchlist} refreshToken={refreshWatchlistToken} refreshAll={refreshWatchlist} onAskAI={handleAskAI} />}
          {activePage === 'hunter'    && <TelegramHunterPage hunter={telegramHunter} />}
          {activePage === 'wallets'   && <WalletTrackerPage wallets={walletTracker.wallets} addWallet={walletTracker.addWallet} removeWallet={walletTracker.removeWallet} alerts={walletTracker.alerts} unreadCount={walletTracker.unreadCount} markRead={walletTracker.markRead} clearAlerts={walletTracker.clearAlerts} checking={walletTracker.checking} lastCheck={walletTracker.lastCheck} isAvailable={walletTracker.isAvailable} maxWallets={walletTracker.maxWallets} />}
          {activePage === 'bot'       && <PaperBotPage bot={paperBot} />}
          {activePage === 'alerts'    && <AlertsPage alerts={alerts} unreadCount={unreadCount} checking={checking} lastCheck={lastCheck} markRead={markRead} markAllRead={markAllRead} clearAlerts={clearAlerts} alertsEnabled={alertsEnabled} setAlertsEnabled={setAlertsEnabled} />}
          {activePage === 'settings'  && <SettingsPage onSave={() => forceUpdate(n => n + 1)} />}
        </div>
      </div>

      {isMobile && <MobileTabBar activePage={activePage} setActivePage={setActivePage} unreadCount={unreadCount} watchlistCount={watchlistCount} walletAlertCount={walletTracker.unreadCount} />}

      <AgentPanel tokens={tokens} focusedToken={focusedToken} onClearFocus={handleClearFocus} alerts={alerts} unreadCount={unreadCount} checking={checking} lastCheck={lastCheck} markRead={markRead} markAllRead={markAllRead} clearAlerts={clearAlerts} alertsEnabled={alertsEnabled} setAlertsEnabled={setAlertsEnabled} initialTab={agentInitialTab} />
    </div>
  );
}
