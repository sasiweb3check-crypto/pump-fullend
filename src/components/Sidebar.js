import React from 'react';
import {
  Search, Bell, ChevronLeft, ChevronRight,
  Activity, Github, Twitter, ExternalLink, Bookmark, Wallet, Zap, Bot, Target, Shield
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'scanner',  icon: <Activity size={18} />, label: 'Live Scanner',      sub: 'Auto-detected tokens' },
  { id: 'guardian', icon: <Shield size={18} />,   label: 'Guardian Scanner',  sub: 'Safe <$50K · rug-checked' },
  { id: 'lookup',   icon: <Search size={18} />,   label: 'Token Lookup',      sub: 'Analyze any CA' },
  { id: 'watchlist',icon: <Bookmark size={18} />, label: 'Watchlist',         sub: 'Track your tokens' },
  { id: 'hunter',   icon: <Target size={18} />,   label: 'Telegram Hunter',   sub: 'Paste message → score CA' },
  { id: 'wallets',  icon: <Wallet size={18} />,   label: 'Wallet Tracker',    sub: 'Copy-trade detection' },
  { id: 'bot',      icon: <Bot size={18} />,      label: 'Paper Bot',         sub: 'Auto-trade simulator' },
  { id: 'settings', icon: '⚙️', label: 'Settings', sub: 'API keys' },
    { id: 'alerts',   icon: <Bell size={18} />,     label: 'Alerts',            sub: 'AI signal alerts' },
];

export default function Sidebar({ activePage, setActivePage, unreadCount, watchlistCount, walletAlertCount, collapsed, setCollapsed, wsConnected, wsAvailable }) {
  return (
    <div style={{
      width: collapsed ? '60px' : '220px',
      minHeight: '100vh',
      background: '#0a0f14',
      borderRight: '1px solid #1a2535',
      display: 'flex',
      flexDirection: 'column',
      transition: 'width 0.25s ease',
      flexShrink: 0,
      position: 'sticky',
      top: 0,
      overflow: 'hidden',
    }}>

      {/* Logo area */}
      <div style={{
        padding: collapsed ? '20px 0' : '20px 16px',
        borderBottom: '1px solid #1a2535',
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        gap: '8px',
        minHeight: '70px',
      }}>
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
            <div style={{
              width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
              background: '#00ff8c', boxShadow: '0 0 8px #00ff8c',
              animation: 'pulse 2s ease-in-out infinite',
            }} />
            <span style={{
              fontSize: '13px', fontWeight: '800', fontFamily: 'Syne, sans-serif',
              background: 'linear-gradient(90deg, #00ff8c, #00d4ff)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              whiteSpace: 'nowrap', letterSpacing: '-0.02em',
            }}>
              PUMPSDK
            </span>
          </div>
        )}
        {collapsed && (
          <div style={{
            width: '7px', height: '7px', borderRadius: '50%',
            background: '#00ff8c', boxShadow: '0 0 8px #00ff8c',
            animation: 'pulse 2s ease-in-out infinite',
          }} />
        )}
        <button
          onClick={() => setCollapsed(v => !v)}
          style={{
            background: 'none', border: '1px solid #1a2535', borderRadius: '5px',
            color: '#3a6a8a', cursor: 'pointer', padding: '3px',
            display: 'flex', alignItems: 'center', flexShrink: 0,
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#3a6a8a'; e.currentTarget.style.color = '#7ab8d4'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#1a2535'; e.currentTarget.style.color = '#3a6a8a'; }}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {NAV_ITEMS.map(item => {
          const isActive = activePage === item.id;
          const hasBadge = (item.id === 'alerts' && unreadCount > 0) || (item.id === 'watchlist' && watchlistCount > 0) || (item.id === 'wallets' && walletAlertCount > 0);
          const badgeNum = item.id === 'alerts' ? unreadCount : item.id === 'watchlist' ? watchlistCount : item.id === 'wallets' ? walletAlertCount : 0;
          const badgeColor = item.id === 'watchlist' ? '#ffd700' : item.id === 'wallets' ? '#00ff8c' : '#ff4444';

          return (
            <button
              key={item.id}
              onClick={() => setActivePage(item.id)}
              title={collapsed ? item.label : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: collapsed ? '10px 0' : '10px 12px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                borderRadius: '8px',
                border: 'none',
                background: isActive ? '#00ff8c12' : 'transparent',
                color: isActive ? '#00ff8c' : '#5a7a94',
                cursor: 'pointer',
                width: '100%',
                transition: 'all 0.15s ease',
                position: 'relative',
                textAlign: 'left',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#ffffff08'; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
            >
              {/* Active indicator bar */}
              {isActive && (
                <div style={{
                  position: 'absolute', left: 0, top: '20%', bottom: '20%',
                  width: '3px', borderRadius: '0 2px 2px 0',
                  background: '#00ff8c',
                }} />
              )}

              <span style={{ flexShrink: 0, position: 'relative' }}>
                {item.icon}
                {hasBadge && (
                  <span style={{
                    position: 'absolute', top: '-4px', right: '-4px',
                    width: '14px', height: '14px', borderRadius: '50%',
                    background: badgeColor, color: badgeColor === '#ffd700' ? '#000' : '#fff',
                    fontSize: '8px', fontFamily: 'JetBrains Mono', fontWeight: '700',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '1px solid #0a0f14',
                  }}>
                    {badgeNum > 9 ? '9+' : badgeNum}
                  </span>
                )}
              </span>

              {!collapsed && (
                <div style={{ overflow: 'hidden' }}>
                  <div style={{
                    fontSize: '12px', fontFamily: 'JetBrains Mono', fontWeight: '600',
                    color: isActive ? '#00ff8c' : '#cde8ff', whiteSpace: 'nowrap',
                  }}>
                    {item.label}
                  </div>
                  <div style={{
                    fontSize: '9px', color: '#3a6a8a', fontFamily: 'JetBrains Mono',
                    whiteSpace: 'nowrap', marginTop: '1px',
                  }}>
                    {item.sub}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom links */}
      {!collapsed && (
        <div style={{
          padding: '12px 16px', borderTop: '1px solid #1a2535',
          display: 'flex', flexDirection: 'column', gap: '8px',
        }}>
          <a
            href="https://gmgn.ai/sol"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '6px 10px', borderRadius: '6px',
              background: '#7c3aed18', border: '1px solid #7c3aed33',
              color: '#a78bfa', textDecoration: 'none',
              fontSize: '10px', fontFamily: 'JetBrains Mono', fontWeight: '700',
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#7c3aed66'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#7c3aed33'}
          >
            GMGN <ExternalLink size={9} />
          </a>
          <a
            href="https://dexscreener.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '6px 10px', borderRadius: '6px',
              background: '#1a2535', border: '1px solid #2a3545',
              color: '#5a7a94', textDecoration: 'none',
              fontSize: '10px', fontFamily: 'JetBrains Mono',
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#3a5a74'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#2a3545'}
          >
            DexScreener <ExternalLink size={9} />
          </a>
          <div style={{ display: 'flex', gap: '6px', paddingTop: '4px' }}>
            <a href="https://github.com/nichxbt" target="_blank" rel="noopener noreferrer"
              style={{ color: '#3a6a8a', display: 'flex', padding: '4px' }}>
              <Github size={13} />
            </a>
            <a href="https://x.com/nichxbt" target="_blank" rel="noopener noreferrer"
              style={{ color: '#3a6a8a', display: 'flex', padding: '4px' }}>
              <Twitter size={13} />
            </a>
          </div>
          <div style={{ fontSize: '9px', color: '#1e3a52', fontFamily: 'JetBrains Mono' }}>
            NOT financial advice
          </div>
          {wsAvailable && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '6px' }}>
              <div style={{
                width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
                background: wsConnected ? '#00ff8c' : '#ff4444',
                boxShadow: wsConnected ? '0 0 6px #00ff8c' : 'none',
                animation: wsConnected ? 'pulse 3s ease-in-out infinite' : 'none',
              }} />
              <span style={{ fontSize: '9px', color: wsConnected ? '#00ff8c' : '#ff4444', fontFamily: 'JetBrains Mono' }}>
                {wsConnected ? 'WS Live' : 'WS Disconnected'}
              </span>
              <Zap size={8} color={wsConnected ? '#00ff8c' : '#3a6a8a'} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
