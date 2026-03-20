import React from 'react';
import { Bell, AlertTriangle, CheckCircle, Info, Trash2, BellOff, BellRing, Clock } from 'lucide-react';

const SEVERITY_CONFIG = {
  HIGH:   { color: '#ff4444', bg: '#ff444412', border: '#ff444433', icon: <AlertTriangle size={14} /> },
  MEDIUM: { color: '#ffd700', bg: '#ffd70012', border: '#ffd70033', icon: <Info size={14} /> },
  LOW:    { color: '#00d4ff', bg: '#00d4ff12', border: '#00d4ff33', icon: <CheckCircle size={14} /> },
};

const TYPE_ICONS = {
  ATH_BREAK:     '🏆',
  VOLUME_SPIKE:  '📈',
  SELL_PRESSURE: '🔴',
  FAST_GRAD:     '⚡',
  SCORE_CHANGE:  '📊',
  MOMENTUM_LOSS: '📉',
};

function timeAgoShort(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export default function AlertsPage({
  alerts, unreadCount, checking, lastCheck,
  markRead, markAllRead, clearAlerts,
  alertsEnabled, setAlertsEnabled,
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{
            fontSize: '18px', fontWeight: '800', fontFamily: 'Syne, sans-serif',
            color: '#e8f4ff', letterSpacing: '-0.02em', marginBottom: '4px',
          }}>
            AI Alerts
          </h2>
          <p style={{ fontSize: '11px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>
            Background agent monitors top tokens every 60s · Groq llama-3.3-70b
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {unreadCount > 0 && (
            <button onClick={markAllRead} style={{
              padding: '6px 12px', borderRadius: '6px', cursor: 'pointer',
              background: '#1a2535', border: '1px solid #2a3545',
              color: '#5a7a94', fontSize: '11px', fontFamily: 'JetBrains Mono',
            }}>
              Mark all read
            </button>
          )}
          {alerts.length > 0 && (
            <button onClick={clearAlerts} style={{
              padding: '6px 10px', borderRadius: '6px', cursor: 'pointer',
              background: '#ff444411', border: '1px solid #ff444433',
              color: '#ff4444', fontSize: '11px', fontFamily: 'JetBrains Mono',
              display: 'flex', alignItems: 'center', gap: '4px',
            }}>
              <Trash2 size={11} /> Clear
            </button>
          )}
          <button onClick={() => setAlertsEnabled(v => !v)} style={{
            padding: '6px 12px', borderRadius: '6px', cursor: 'pointer',
            background: alertsEnabled ? '#00ff8c11' : '#1a2535',
            border: `1px solid ${alertsEnabled ? '#00ff8c33' : '#2a3545'}`,
            color: alertsEnabled ? '#00ff8c' : '#5a7a94',
            fontSize: '11px', fontFamily: 'JetBrains Mono', fontWeight: '600',
            display: 'flex', alignItems: 'center', gap: '4px',
          }}>
            {alertsEnabled ? <BellRing size={11} /> : <BellOff size={11} />}
            {alertsEnabled ? 'Monitoring ON' : 'Monitoring OFF'}
          </button>
        </div>
      </div>

      {/* Status strip */}
      <div style={{
        padding: '10px 16px', background: '#0a0f14',
        border: '1px solid #1a2535', borderRadius: '8px',
        display: 'flex', alignItems: 'center', gap: '12px',
      }}>
        <div style={{
          width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
          background: alertsEnabled && checking ? '#ffd700' : alertsEnabled ? '#00ff8c' : '#3a6a8a',
          boxShadow: alertsEnabled ? '0 0 6px currentColor' : 'none',
          animation: checking ? 'pulse 1s ease-in-out infinite' : alertsEnabled ? 'pulse 3s ease-in-out infinite' : 'none',
        }} />
        <span style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>
          {checking ? 'Checking tokens now...' : alertsEnabled ? 'Active — checking every 60s' : 'Paused'}
        </span>
        {lastCheck && (
          <span style={{ fontSize: '10px', color: '#3a6a8a', fontFamily: 'JetBrains Mono', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Clock size={9} /> Last check: {timeAgoShort(lastCheck)}
          </span>
        )}
        {unreadCount > 0 && (
          <span style={{
            padding: '2px 8px', borderRadius: '10px',
            background: '#ff444422', border: '1px solid #ff444433',
            color: '#ff4444', fontSize: '10px', fontFamily: 'JetBrains Mono', fontWeight: '700',
          }}>
            {unreadCount} unread
          </span>
        )}
      </div>

      {/* Alerts list */}
      {alerts.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '60px 20px',
          color: '#3a6a8a', fontFamily: 'JetBrains Mono',
        }}>
          <Bell size={32} color="#1e3a52" style={{ margin: '0 auto 16px', display: 'block' }} />
          <div style={{ fontSize: '13px', color: '#5a7a94', marginBottom: '6px' }}>
            {alertsEnabled ? 'No alerts yet — monitoring in progress' : 'Alerts are paused'}
          </div>
          <div style={{ fontSize: '11px' }}>
            {alertsEnabled
              ? 'First check runs after 10s, then every 60s'
              : 'Enable monitoring to start receiving AI-powered alerts'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {alerts.map(alert => {
            const cfg = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.LOW;
            return (
              <div
                key={alert.id}
                onClick={() => markRead(alert.id)}
                style={{
                  padding: '14px 18px',
                  background: alert.read ? '#0a0f14' : cfg.bg,
                  border: `1px solid ${alert.read ? '#1a2535' : cfg.border}`,
                  borderRadius: '10px',
                  cursor: 'pointer',
                  opacity: alert.read ? 0.65 : 1,
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                onMouseLeave={e => e.currentTarget.style.opacity = alert.read ? '0.65' : '1'}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    <span style={{ color: cfg.color }}>{cfg.icon}</span>
                    <span style={{ fontSize: '16px' }}>{TYPE_ICONS[alert.type] || '📌'}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: '12px', fontFamily: 'JetBrains Mono', fontWeight: '700',
                        color: '#cde8ff',
                      }}>
                        ${alert.tokenSymbol}
                      </span>
                      <span style={{
                        fontSize: '9px', padding: '1px 6px', borderRadius: '3px',
                        background: cfg.bg, border: `1px solid ${cfg.border}`,
                        color: cfg.color, fontFamily: 'JetBrains Mono', fontWeight: '700',
                      }}>
                        {alert.severity}
                      </span>
                      <span style={{
                        fontSize: '9px', padding: '1px 6px', borderRadius: '3px',
                        background: '#1a2535', color: '#5a7a94',
                        fontFamily: 'JetBrains Mono',
                      }}>
                        {(alert.type || '').replace(/_/g, ' ')}
                      </span>
                      {!alert.read && (
                        <span style={{
                          width: '6px', height: '6px', borderRadius: '50%',
                          background: cfg.color, flexShrink: 0,
                          boxShadow: `0 0 6px ${cfg.color}`,
                        }} />
                      )}
                      <span style={{ fontSize: '9px', color: '#3a6a8a', fontFamily: 'JetBrains Mono', marginLeft: 'auto' }}>
                        {alert.timestamp ? timeAgoShort(alert.timestamp) : ''}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#cde8ff', fontFamily: 'JetBrains Mono', fontWeight: '600', marginBottom: '4px' }}>
                      {alert.title}
                    </div>
                    <div style={{ fontSize: '11px', color: '#8b9eb0', fontFamily: 'JetBrains Mono', lineHeight: '1.5', marginBottom: '6px' }}>
                      {alert.message}
                    </div>
                    {alert.action && (
                      <div style={{
                        fontSize: '10px', color: cfg.color, fontFamily: 'JetBrains Mono',
                        padding: '4px 8px', background: cfg.bg, borderRadius: '4px',
                        display: 'inline-block',
                      }}>
                        → {alert.action}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
