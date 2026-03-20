import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Bot, MessageSquare, Bell, TrendingUp, X,
  Send, Loader, AlertTriangle, CheckCircle, Info, Zap,
  BarChart2, Shield, Trash2, BellOff, BellRing,
  Minimize2, Maximize2, LogOut, Activity
} from 'lucide-react';
import { callGroqStream, hasApiKey } from '../agents/groq';
import {
  TOKEN_ANALYST_SYSTEM, buildAnalystContext,
  COMPARISON_SYSTEM, buildComparisonContext,
  TECHNICAL_ANALYST_SYSTEM, buildTechnicalAnalystContext,
} from '../agents/agentPrompts';
import { FORECAST_SYSTEM, buildForecastContext, computeHeuristicForecast } from '../agents/forecastEngine';
import { formatVolume } from '../utils/scoring';
import ExitCoachTab from './ExitCoachTab';

// ─── Strategy Explainer system prompt ───────────────────────────────────────
const STRATEGY_EXPLAINER_SYSTEM = `You are an expert at the nichxbt pump.fun SDK strategy v2 — the method that generated $2.1M volume from a single open-source GitHub post.

THE 8 SCORING SIGNALS (max 100pts):
1. Graduation Speed (18pts) — $pump-sdk graduated BC in 19 min. Penalised if fast but no volume (bot grad).
2. Volume Velocity (22pts) — Base score (volume size) + acceleration bonus up to +6pts if vol1h > 3x hourly avg. Fading = -3pts.
3. Price Multiple (16pts) — Sustained moves (1h/6h/24h) weighted over 5m spikes. Negative price = 0pts.
4. Buy Pressure (12pts) — NEW: Real-time buy/sell ratio. >75% buys = 12pts. Sell dominance = 0pts.
5. Liquidity Depth (8pts) — Committed liquidity post-graduation signals real holders.
6. TX Frequency (12pts) — Scored per-hour to normalise for age. >2000 txns/hr = pump-sdk tier.
7. V/L Efficiency (6pts) — NEW: Volume-to-Liquidity ratio. The viral flywheel shows in extreme V/L (>20x).
8. Dev/Social Signal (6pts) — Tier-1 (SDK/MCP/API/GitHub) = instant max. Tier-2 (dev/build/code). Tier-3 (AI/bot/web3).
MCAP MODIFIER: Micro (<$50K) +3pts, Extended ($500K-$1.5M) -2pts, Mega (>$1.5M) -5pts.

GRADES: S(78+)=near-perfect, A(62-77)=strong, B(46-61)=moderate, C(30-45)=weak, D(<30)=no fit.

When explaining a score, be specific about WHICH numbers drove it and WHAT would need to change for a higher grade.
Max 250 words. Direct, no fluff. Treat the user as a sophisticated trader.`;

// ─── Chat Assistant system prompt ────────────────────────────────────────────
const CHAT_ASSISTANT_SYSTEM = `You are an AI assistant embedded in a real-time Solana memecoin scanner called PumpSDK Scanner.

THE SCANNER:
- Monitors newly graduated pump.fun/PumpSwap tokens on Solana in real-time
- Scores each token against the "nichxbt strategy" — a framework derived from the $pump-sdk case study (Feb 2026, $2.1M volume, 142x)
- 6 scoring criteria: graduation speed, volume velocity, price multiple, liquidity depth, TX frequency, dev/social signal
- Tracks detection time, price at detection, gain since detection, and ATH since detection

YOU CAN HELP WITH:
- Explaining what any score means and why
- General questions about memecoin strategy and pump.fun mechanics
- How to use the scanner effectively
- What to look for in S-grade tokens
- General market context about Solana memecoins
- How the nichxbt strategy works

BE:
- Direct and specific
- Concise (under 200 words unless detailed explanation is needed)
- Honest about risks
- Treat users as intelligent adults who understand crypto risk

NEVER:
- Give specific financial advice or price targets
- Pretend you have real-time data beyond what's described to you
- Be vague or say "it depends" without explaining the factors`;

// ─── Helpers ─────────────────────────────────────────────────────────────────
const SEVERITY_CONFIG = {
  HIGH:   { color: '#ff4444', bg: '#ff444418', icon: <AlertTriangle size={13} />, label: 'HIGH' },
  MEDIUM: { color: '#ffd700', bg: '#ffd70018', icon: <Info size={13} />,          label: 'MED' },
  LOW:    { color: '#00d4ff', bg: '#00d4ff18', icon: <CheckCircle size={13} />,   label: 'LOW' },
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
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

// ─── Chat message component ───────────────────────────────────────────────────
function ChatMsg({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div style={{
      display: 'flex', flexDirection: isUser ? 'row-reverse' : 'row',
      gap: '8px', marginBottom: '12px', alignItems: 'flex-start',
    }}>
      {!isUser && (
        <div style={{
          width: '26px', height: '26px', borderRadius: '6px', flexShrink: 0,
          background: 'linear-gradient(135deg, #00ff8c22, #00d4ff22)',
          border: '1px solid #00ff8c44',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Bot size={13} color="#00ff8c" />
        </div>
      )}
      <div style={{
        maxWidth: '85%',
        background: isUser ? '#00d4ff18' : '#0a1520',
        border: `1px solid ${isUser ? '#00d4ff33' : '#1a2535'}`,
        borderRadius: isUser ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
        padding: '8px 12px',
        fontSize: '12px', color: '#cde8ff',
        fontFamily: 'JetBrains Mono',
        lineHeight: '1.6',
        whiteSpace: 'pre-wrap',
      }}>
        {msg.content}
        {msg.streaming && (
          <span style={{
            display: 'inline-block', width: '6px', height: '13px',
            background: '#00ff8c', marginLeft: '2px',
            animation: 'pulse 0.8s ease-in-out infinite', verticalAlign: 'text-bottom',
          }} />
        )}
      </div>
    </div>
  );
}

// ─── No API Key warning ───────────────────────────────────────────────────────
function NoKeyWarning() {
  const [keyInput, setKeyInput] = React.useState('');
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleSave = () => {
    const k = keyInput.trim();
    if (!k.startsWith('gsk_')) {
      setError('Key should start with gsk_ — check console.groq.com/keys');
      return;
    }
    window.__GROQ_KEY__ = k;
    setSaved(true);
    setError('');
    // Force re-render across all tabs by dispatching a storage event
    try { localStorage.setItem('pumpsdk_groq_key', k); } catch {}
    window.dispatchEvent(new Event('groq-key-set'));
  };

  React.useEffect(() => {
    // Restore key from localStorage if previously saved
    try {
      const stored = localStorage.getItem('pumpsdk_groq_key');
      if (stored) {
        window.__GROQ_KEY__ = stored;
        setSaved(true);
      }
    } catch {}
  }, []);

  if (saved) {
    return (
      <div style={{
        margin: '12px 14px', padding: '10px 14px',
        background: '#00ff8c0d', border: '1px solid #00ff8c33',
        borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        <CheckCircle size={13} color="#00ff8c" />
        <span style={{ fontSize: '11px', color: '#00ff8c', fontFamily: 'JetBrains Mono', fontWeight: '700' }}>
          API KEY ACTIVE — agents ready
        </span>
        <button
          onClick={() => {
            window.__GROQ_KEY__ = null;
            try { localStorage.removeItem('pumpsdk_groq_key'); } catch {}
            setSaved(false);
            setKeyInput('');
          }}
          style={{
            marginLeft: 'auto', background: 'none', border: 'none',
            color: '#3a6a8a', cursor: 'pointer', fontSize: '10px',
            fontFamily: 'JetBrains Mono',
          }}
        >
          change
        </button>
      </div>
    );
  }

  return (
    <div style={{
      margin: '12px 14px', padding: '12px 14px',
      background: '#ffd70008', border: '1px solid #ffd70033',
      borderRadius: '10px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
        <AlertTriangle size={13} color="#ffd700" />
        <span style={{ fontSize: '11px', color: '#ffd700', fontFamily: 'JetBrains Mono', fontWeight: '700' }}>
          GROQ API KEY NEEDED
        </span>
      </div>

      {/* Inline key entry — works without redeploying */}
      <div style={{ marginBottom: '8px' }}>
        <div style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono', marginBottom: '5px' }}>
          Paste your key below (free at console.groq.com/keys):
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <input
            type="password"
            placeholder="gsk_..."
            value={keyInput}
            onChange={e => { setKeyInput(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            style={{
              flex: 1, padding: '7px 10px', borderRadius: '6px',
              background: '#0a1520', border: '1px solid #1e3a52',
              color: '#cde8ff', fontFamily: 'JetBrains Mono', fontSize: '11px',
              outline: 'none',
            }}
          />
          <button
            onClick={handleSave}
            style={{
              padding: '7px 12px', borderRadius: '6px', cursor: 'pointer',
              background: '#ffd70018', border: '1px solid #ffd70044',
              color: '#ffd700', fontSize: '11px', fontFamily: 'JetBrains Mono', fontWeight: '700',
            }}
          >
            Activate
          </button>
        </div>
        {error && (
          <div style={{ fontSize: '10px', color: '#ff4444', fontFamily: 'JetBrains Mono', marginTop: '4px' }}>
            {error}
          </div>
        )}
      </div>

      <div style={{ fontSize: '10px', color: '#3a6a8a', fontFamily: 'JetBrains Mono', lineHeight: '1.6' }}>
        Or set permanently: Netlify → Site Settings → Environment Variables
        → <span style={{ color: '#00ff8c' }}>REACT_APP_GROQ_API_KEY</span> → Redeploy
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT TAB: CHAT ASSISTANT
// ═══════════════════════════════════════════════════════════════════════════════
function ChatTab({ tokens, focusedToken }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `Hey! I'm your PumpSDK scanner assistant.\n\nAsk me anything — about token scores, the nichxbt strategy, what S-grade signals look like, or how to use this scanner effectively.\n\nIf you've clicked "Ask AI" on a specific token, I already have its data loaded.`,
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [noKey, setNoKey] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // Clear the no-key warning when user activates a key via the inline form
  useEffect(() => {
    const handler = () => setNoKey(false);
    window.addEventListener('groq-key-set', handler);
    return () => window.removeEventListener('groq-key-set', handler);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // When a token is focused (from per-card button), inject context message
  useEffect(() => {
    if (focusedToken) {
      const contextMsg = `I've loaded $${focusedToken.baseToken?.symbol} for you. Score: ${focusedToken._score?.total}/100 (${focusedToken._score?.grade}-grade). What would you like to know?`;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.content?.includes(focusedToken.baseToken?.symbol)) return prev;
        return [...prev, { role: 'assistant', content: contextMsg }];
      });
    }
  }, [focusedToken]);

  const buildHistory = useCallback(() =>
    messages.slice(-8).map(m => ({ role: m.role, content: m.content })),
  [messages]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setLoading(true);
    setNoKey(false);

    const userMsg = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);

    // Build system context
    const topTokens = tokens.slice(0, 10).map(t =>
      `$${t.baseToken?.symbol}: score ${t._score?.total}(${t._score?.grade}), vol ${formatVolume(t.volume?.h24)}, gain ${t._gainSinceDetection?.toFixed(1) ?? '?'}%`
    ).join('\n');

    const focusedCtx = focusedToken
      ? `\n\nCURRENTLY FOCUSED TOKEN:\n${buildAnalystContext(focusedToken)}`
      : '';

    const systemWithContext = `${CHAT_ASSISTANT_SYSTEM}\n\nTOP TOKENS RIGHT NOW:\n${topTokens}${focusedCtx}`;

    // Streaming reply
    const assistantMsg = { role: 'assistant', content: '', streaming: true };
    setMessages(prev => [...prev, assistantMsg]);

    const history = buildHistory();

    try {
      let full = '';
      for await (const chunk of callGroqStream(systemWithContext, text, {
        history,
        maxTokens: 500,
        temperature: 0.7,
      })) {
        full += chunk;
        const current = full;
        setMessages(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: 'assistant', content: current, streaming: true };
          return copy;
        });
      }
      const final = full;
      setMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: 'assistant', content: final, streaming: false };
        return copy;
      });
    } catch (e) {
      if (e.message === 'NO_API_KEY') {
        setNoKey(true);
        setMessages(prev => prev.slice(0, -1));
      } else {
        setMessages(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: 'assistant', content: `Error: ${e.message}`, streaming: false };
          return copy;
        });
      }
    } finally {
      setLoading(false);
    }
  }, [input, loading, tokens, focusedToken, buildHistory]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {noKey && <NoKeyWarning />}

      {/* Focused token badge */}
      {focusedToken && (
        <div style={{
          margin: '8px 12px 0', padding: '6px 10px',
          background: '#00d4ff10', border: '1px solid #00d4ff30',
          borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <span style={{ fontSize: '10px', color: '#00d4ff', fontFamily: 'JetBrains Mono' }}>
            🎯 Context: ${focusedToken.baseToken?.symbol} · {focusedToken._score?.grade}-grade · {focusedToken._score?.total}/100
          </span>
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px', minHeight: 0 }}>
        {messages.map((m, i) => <ChatMsg key={i} msg={m} />)}
        <div ref={bottomRef} />
      </div>

      {/* Quick prompts */}
      {messages.length <= 1 && (
        <div style={{ padding: '0 12px', display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
          {[
            'What makes an S-grade token?',
            'Explain the nichxbt strategy',
            'What signals should I watch?',
            focusedToken ? `Why did $${focusedToken.baseToken?.symbol} score ${focusedToken._score?.total}?` : 'How do I filter top picks?',
          ].map(q => (
            <button key={q} onClick={() => { setInput(q); inputRef.current?.focus(); }}
              style={{
                fontSize: '10px', padding: '4px 8px', borderRadius: '5px', cursor: 'pointer',
                background: '#0a1520', border: '1px solid #1e3a52', color: '#5a8aaa',
                fontFamily: 'JetBrains Mono', transition: 'all 0.15s',
              }}>
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ padding: '10px 12px', borderTop: '1px solid #1a2535', display: 'flex', gap: '6px' }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          placeholder="Ask about tokens, strategy, scores..."
          style={{
            flex: 1, background: '#0a1520', border: '1px solid #1e3a52',
            borderRadius: '7px', padding: '8px 10px', color: '#cde8ff',
            fontSize: '12px', fontFamily: 'JetBrains Mono', outline: 'none',
          }}
        />
        <button onClick={sendMessage} disabled={loading || !input.trim()}
          style={{
            width: '34px', height: '34px', borderRadius: '7px', border: 'none',
            background: loading || !input.trim() ? '#1a2535' : 'linear-gradient(135deg, #00ff8c, #00d4ff)',
            cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
          {loading ? <Loader size={14} color="#5a7a94" style={{ animation: 'spin 1s linear infinite' }} />
                   : <Send size={14} color={input.trim() ? '#060a0f' : '#5a7a94'} />}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT TAB: STRATEGY EXPLAINER (global — picks top S/A token or user-selected)
// ═══════════════════════════════════════════════════════════════════════════════
function StrategyExplainerTab({ tokens, focusedToken }) {
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [noKey, setNoKey] = useState(false);
  const [selectedToken, setSelectedToken] = useState(null);
  const target = focusedToken || selectedToken || tokens[0];

  useEffect(() => {
    const handler = () => setNoKey(false);
    window.addEventListener('groq-key-set', handler);
    return () => window.removeEventListener('groq-key-set', handler);
  }, []);

  const explain = useCallback(async (tok) => {
    if (!tok || loading) return;
    setLoading(true);
    setResult('');
    setNoKey(false);

    try {
      let full = '';
      const prompt = `Explain this token's strategy score in detail. Tell me exactly why it scored what it did, what's working, what's weak, and what signal to watch next.\n\n${buildAnalystContext(tok)}`;
      for await (const chunk of callGroqStream(STRATEGY_EXPLAINER_SYSTEM, prompt, {
        maxTokens: 400, temperature: 0.5,
      })) {
        full += chunk;
        setResult(full);
      }
    } catch (e) {
      if (e.message === 'NO_API_KEY') setNoKey(true);
      else setResult(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  const topCandidates = tokens.filter(t => ['S', 'A'].includes(t._score?.grade)).slice(0, 8);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '12px', gap: '10px', overflowY: 'auto' }}>
      {noKey && <NoKeyWarning />}

      <div style={{ fontSize: '11px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>
        Select a token to get a detailed strategy score explanation:
      </div>

      {/* Token selector */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
        {(focusedToken ? [focusedToken, ...topCandidates.filter(t => t._id !== focusedToken?._id)] : topCandidates)
          .slice(0, 8)
          .map(t => {
            const isActive = (selectedToken?._id || focusedToken?._id) === t._id;
            const gradeColor = { S: '#00ff8c', A: '#00d4ff', B: '#ffd700' }[t._score?.grade] || '#ff8300';
            return (
              <button key={t._id} onClick={() => { setSelectedToken(t); explain(t); }}
                style={{
                  padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', border: `1px solid ${isActive ? gradeColor : '#1e3a52'}`,
                  background: isActive ? gradeColor + '18' : '#0a1520', color: isActive ? gradeColor : '#5a8aaa',
                  fontSize: '11px', fontFamily: 'JetBrains Mono', fontWeight: isActive ? '700' : '400',
                  display: 'flex', alignItems: 'center', gap: '4px',
                }}>
                <span style={{ color: gradeColor }}>{t._score?.grade}</span> ${t.baseToken?.symbol}
              </button>
            );
          })}
        {topCandidates.length === 0 && (
          <span style={{ fontSize: '11px', color: '#3a5a74', fontFamily: 'JetBrains Mono' }}>
            No S/A grade tokens yet — waiting for scanner data...
          </span>
        )}
      </div>

      {/* Explanation result */}
      {(loading || result) && (
        <div style={{
          background: '#0a1520', border: '1px solid #1e3a52', borderRadius: '10px',
          padding: '14px', fontSize: '12px', color: '#cde8ff',
          fontFamily: 'JetBrains Mono', lineHeight: '1.7', whiteSpace: 'pre-wrap',
          flex: 1,
        }}>
          {loading && !result && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#5a7a94' }}>
              <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} />
              Analysing strategy fit...
            </div>
          )}
          {result}
          {loading && result && (
            <span style={{
              display: 'inline-block', width: '6px', height: '13px',
              background: '#00ff8c', marginLeft: '2px',
              animation: 'pulse 0.8s ease-in-out infinite', verticalAlign: 'text-bottom',
            }} />
          )}
        </div>
      )}

      {/* Token quick stats when selected */}
      {target && !loading && !result && (
        <div style={{
          background: '#0a1520', border: '1px solid #1e3a52', borderRadius: '10px', padding: '14px',
          fontSize: '11px', color: '#5a7a94', fontFamily: 'JetBrains Mono',
        }}>
          Click a token above to explain its score ↑
          <div style={{ marginTop: '8px', color: '#3a5a74' }}>
            {focusedToken && `Focused: $${focusedToken.baseToken?.symbol} — ${focusedToken._score?.grade}-grade`}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT TAB: ALERT AGENT
// ═══════════════════════════════════════════════════════════════════════════════
function AlertTab({ alerts, unreadCount, checking, lastCheck, markRead, markAllRead, clearAlerts, alertsEnabled, setAlertsEnabled }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Controls */}
      <div style={{
        padding: '10px 12px', borderBottom: '1px solid #1a2535',
        display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        <button onClick={() => setAlertsEnabled(p => !p)}
          style={{
            display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px',
            borderRadius: '6px', border: `1px solid ${alertsEnabled ? '#00ff8c44' : '#1e3a52'}`,
            background: alertsEnabled ? '#00ff8c11' : 'transparent',
            color: alertsEnabled ? '#00ff8c' : '#5a7a94',
            cursor: 'pointer', fontSize: '11px', fontFamily: 'JetBrains Mono',
          }}>
          {alertsEnabled ? <BellRing size={12} /> : <BellOff size={12} />}
          {alertsEnabled ? 'ACTIVE' : 'PAUSED'}
        </button>

        {checking && (
          <span style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Loader size={10} style={{ animation: 'spin 1s linear infinite' }} /> scanning...
          </span>
        )}
        {lastCheck && !checking && (
          <span style={{ fontSize: '10px', color: '#3a5a74', fontFamily: 'JetBrains Mono' }}>
            checked {timeAgoShort(lastCheck)} ago
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          {unreadCount > 0 && (
            <button onClick={markAllRead} style={{
              fontSize: '10px', padding: '3px 8px', borderRadius: '5px', cursor: 'pointer',
              background: 'transparent', border: '1px solid #1e3a52', color: '#5a7a94',
              fontFamily: 'JetBrains Mono',
            }}>
              mark all read
            </button>
          )}
          {alerts.length > 0 && (
            <button onClick={clearAlerts} style={{
              fontSize: '10px', padding: '3px 8px', borderRadius: '5px', cursor: 'pointer',
              background: 'transparent', border: '1px solid #1e3a52', color: '#5a7a94',
              fontFamily: 'JetBrains Mono', display: 'flex', alignItems: 'center', gap: '3px',
            }}>
              <Trash2 size={10} /> clear
            </button>
          )}
        </div>
      </div>

      {/* Alert list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
        {!alertsEnabled && (
          <div style={{
            padding: '14px', background: '#0a1520', border: '1px solid #1e3a52',
            borderRadius: '8px', fontSize: '11px', color: '#5a7a94', fontFamily: 'JetBrains Mono', textAlign: 'center',
          }}>
            Alert agent is paused. Click PAUSED to activate.
            <div style={{ marginTop: '6px', fontSize: '10px', color: '#3a5a74' }}>
              Checks every 60s · requires REACT_APP_GROQ_API_KEY
            </div>
          </div>
        )}

        {alertsEnabled && alerts.length === 0 && (
          <div style={{
            padding: '20px', textAlign: 'center',
            fontSize: '11px', color: '#3a5a74', fontFamily: 'JetBrains Mono',
          }}>
            <Bell size={20} color="#1e3a52" style={{ display: 'block', margin: '0 auto 8px' }} />
            No alerts yet — monitoring top 20 tokens...
            <div style={{ marginTop: '4px', fontSize: '10px' }}>First check runs 10s after tokens load</div>
          </div>
        )}

        {alerts.map(alert => {
          const sev = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.LOW;
          return (
            <div key={alert.id}
              onClick={() => markRead(alert.id)}
              style={{
                background: alert.read ? '#0a0f14' : sev.bg,
                border: `1px solid ${alert.read ? '#1a2535' : sev.color + '44'}`,
                borderRadius: '8px', padding: '10px 12px', cursor: 'pointer',
                opacity: alert.read ? 0.6 : 1, transition: 'all 0.2s',
                position: 'relative',
              }}>
              {!alert.read && (
                <div style={{
                  position: 'absolute', top: '8px', right: '8px',
                  width: '6px', height: '6px', borderRadius: '50%', background: sev.color,
                }} />
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <span style={{ fontSize: '13px' }}>{TYPE_ICONS[alert.type] || '🔔'}</span>
                <span style={{ fontSize: '12px', color: sev.color, fontFamily: 'JetBrains Mono', fontWeight: '700' }}>
                  ${alert.tokenSymbol}
                </span>
                <span style={{
                  fontSize: '9px', padding: '1px 5px', borderRadius: '3px',
                  background: sev.color + '22', color: sev.color, fontFamily: 'JetBrains Mono',
                }}>
                  {sev.label}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#3a5a74', fontFamily: 'JetBrains Mono' }}>
                  {timeAgoShort(alert.timestamp)}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#cde8ff', fontFamily: 'JetBrains Mono', fontWeight: '600', marginBottom: '3px' }}>
                {alert.title}
              </div>
              <div style={{ fontSize: '11px', color: '#8b9eb0', fontFamily: 'JetBrains Mono', lineHeight: '1.4' }}>
                {alert.message}
              </div>
              {alert.action && (
                <div style={{
                  marginTop: '6px', fontSize: '10px', color: '#ffd700',
                  fontFamily: 'JetBrains Mono', display: 'flex', alignItems: 'center', gap: '4px',
                }}>
                  <Zap size={10} /> {alert.action}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{
        padding: '8px 12px', borderTop: '1px solid #1a2535',
        fontSize: '10px', color: '#3a5a74', fontFamily: 'JetBrains Mono',
        display: 'flex', justifyContent: 'space-between',
      }}>
        <span>{alerts.length} total alerts</span>
        <span>{unreadCount} unread</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT TAB: TOKEN ANALYST
// ═══════════════════════════════════════════════════════════════════════════════
function TokenAnalystTab({ tokens, focusedToken }) {
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [noKey, setNoKey] = useState(false);
  const [selectedToken, setSelectedToken] = useState(null);
  const [mode, setMode] = useState('analyst'); // 'analyst' | 'narrative'

  const target = focusedToken || selectedToken;

  useEffect(() => {
    const handler = () => setNoKey(false);
    window.addEventListener('groq-key-set', handler);
    return () => window.removeEventListener('groq-key-set', handler);
  }, []);

  const analyse = useCallback(async (tok, analysisMode) => {
    if (!tok || loading) return;
    setLoading(true);
    setResult('');
    setNoKey(false);
    const m = analysisMode || mode;

    try {
      let full = '';
      let systemPrompt, userPrompt;

      if (m === 'narrative') {
        systemPrompt = `You are a memecoin narrative intelligence agent. Decode what story a token is tapping into and how strong that narrative is.

Output exactly:
NARRATIVE TYPE: [2-3 word category]
NARRATIVE STRENGTH: [Strong/Moderate/Weak] — [one sentence why]
TARGET AUDIENCE: [who buys this and why they share it]
PEAK WINDOW: [when this narrative is most likely to run]
KILL RISK: [what could kill this narrative fast]

Max 150 words. Zero fluff. Be brutally honest.`;
        userPrompt = `Analyse the narrative of: ${tok.baseToken?.name} ($${tok.baseToken?.symbol})
Age: ${tok.pairCreatedAt ? Math.floor((Date.now() - tok.pairCreatedAt) / 60000) + ' min' : 'unknown'}
Vol 24h: ${formatVolume(tok.volume?.h24)}
Score: ${tok._score?.total}/100
Dev signal: ${tok._score?.scores?.socialSignal}/10`;
      } else {
        systemPrompt = TOKEN_ANALYST_SYSTEM;
        userPrompt = `Give me a full deep-dive analysis on this token. Cover: narrative strength, on-chain signal quality, where it is in its lifecycle, and one specific thing to watch.\n\n${buildAnalystContext(tok)}`;
      }

      for await (const chunk of callGroqStream(systemPrompt, userPrompt, {
        maxTokens: 450, temperature: 0.5,
      })) {
        full += chunk;
        setResult(full);
      }
    } catch (e) {
      if (e.message === 'NO_API_KEY') setNoKey(true);
      else setResult(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [loading, mode]);

  const topTokens = tokens.slice(0, 10);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '10px 12px', gap: '10px', overflowY: 'auto' }}>
      {noKey && <NoKeyWarning />}

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: '6px' }}>
        {[
          { id: 'analyst', label: '🔍 Deep Dive', desc: 'Full on-chain analysis' },
          { id: 'narrative', label: '📖 Narrative', desc: 'Story & cultural momentum' },
        ].map(m => (
          <button key={m.id} onClick={() => { setMode(m.id); if (target) analyse(target, m.id); }}
            style={{
              flex: 1, padding: '7px 10px', borderRadius: '7px', cursor: 'pointer',
              border: `1px solid ${mode === m.id ? '#00d4ff' : '#1e3a52'}`,
              background: mode === m.id ? '#00d4ff15' : '#0a1520',
              color: mode === m.id ? '#00d4ff' : '#5a7a94',
              fontSize: '11px', fontFamily: 'JetBrains Mono', fontWeight: mode === m.id ? '700' : '400',
            }}>
            {m.label}
          </button>
        ))}
      </div>

      {/* Token selector */}
      <div>
        <div style={{ fontSize: '10px', color: '#3a5a74', fontFamily: 'JetBrains Mono', marginBottom: '6px' }}>
          {focusedToken ? `FOCUSED: $${focusedToken.baseToken?.symbol}` : 'SELECT TOKEN TO ANALYSE:'}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
          {(focusedToken ? [focusedToken, ...topTokens.filter(t => t._id !== focusedToken?._id)] : topTokens)
            .slice(0, 9)
            .map(t => {
              const isActive = target?._id === t._id;
              const gradeColor = { S: '#00ff8c', A: '#00d4ff', B: '#ffd700', C: '#ff8300', D: '#ff4444' }[t._score?.grade] || '#5a7a94';
              return (
                <button key={t._id}
                  onClick={() => { setSelectedToken(t); analyse(t, mode); }}
                  style={{
                    padding: '4px 8px', borderRadius: '5px', cursor: 'pointer',
                    border: `1px solid ${isActive ? gradeColor : '#1e3a52'}`,
                    background: isActive ? gradeColor + '18' : '#0a1520',
                    color: isActive ? gradeColor : '#5a8aaa',
                    fontSize: '11px', fontFamily: 'JetBrains Mono',
                  }}>
                  {t._score?.grade} ${t.baseToken?.symbol}
                </button>
              );
            })}
        </div>
      </div>

      {/* Result */}
      <div style={{
        background: '#0a1520', border: '1px solid #1e3a52', borderRadius: '10px',
        padding: '14px', fontSize: '12px', color: '#cde8ff',
        fontFamily: 'JetBrains Mono', lineHeight: '1.7', whiteSpace: 'pre-wrap',
        flex: 1, minHeight: '100px',
      }}>
        {loading && !result && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#5a7a94' }}>
            <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} />
            {mode === 'narrative' ? 'Reading the narrative...' : 'Deep-diving on-chain signals...'}
          </div>
        )}
        {!loading && !result && (
          <span style={{ color: '#3a5a74' }}>
            {target ? `Click a token above to ${mode === 'narrative' ? 'decode narrative' : 'deep-dive'}` : 'Select a token to analyse'}
          </span>
        )}
        {result}
        {loading && result && (
          <span style={{
            display: 'inline-block', width: '6px', height: '13px',
            background: '#00ff8c', marginLeft: '2px',
            animation: 'pulse 0.8s ease-in-out infinite', verticalAlign: 'text-bottom',
          }} />
        )}
      </div>

      {/* Re-run */}
      {result && !loading && target && (
        <button onClick={() => analyse(target, mode)}
          style={{
            padding: '7px', borderRadius: '6px', border: '1px solid #1e3a52',
            background: '#0a1520', color: '#5a7a94', cursor: 'pointer',
            fontSize: '11px', fontFamily: 'JetBrains Mono', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
          }}>
          ↻ Re-run analysis
        </button>
      )}
    </div>
  );
}

// ─── Forecast Tab ─────────────────────────────────────────────────────────────
function ForecastTab({ tokens, focusedToken }) {
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('token'); // 'token' | 'compare'
  const [selectedToken, setSelectedToken] = useState(focusedToken || tokens[0]);

  useEffect(() => {
    if (focusedToken) setSelectedToken(focusedToken);
  }, [focusedToken]);

  const runForecast = useCallback(async () => {
    if (!selectedToken && mode === 'token') return;
    setLoading(true);
    setResult('');
    try {
      if (mode === 'token') {
        if (hasApiKey()) {
          const ctx = buildForecastContext(selectedToken);
          let out = '';
          for await (const chunk of callGroqStream(FORECAST_SYSTEM, ctx, { maxTokens: 400, temperature: 0.15 })) {
            out += chunk;
            setResult(out);
          }
        } else {
          const h = computeHeuristicForecast(selectedToken);
          setResult(JSON.stringify(h, null, 2));
        }
      } else {
        const ctx = buildComparisonContext(tokens);
        if (hasApiKey()) {
          let out = '';
          for await (const chunk of callGroqStream(COMPARISON_SYSTEM, ctx, { maxTokens: 500, temperature: 0.3 })) {
            out += chunk;
            setResult(out);
          }
        } else {
          setResult('⚠ No Groq API key — paste your key in the CHAT tab to activate. Get one free at console.groq.com/keys');
        }
      }
    } catch (e) {
      if (e.message === 'NO_API_KEY') {
        const h = computeHeuristicForecast(selectedToken);
        setResult('── Algorithmic Forecast (no API key) ──\n\n' + JSON.stringify(h, null, 2));
      } else {
        setResult(`Error: ${e.message}`);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedToken, mode, tokens]);

  const DIR_COLORS = { PUMP: '#00ff8c', DUMP: '#ff4444', NEUTRAL: '#ffd700' };

  // Try to parse JSON result for nice rendering
  let parsedForecast = null;
  try {
    const clean = result.replace(/```json|```/g, '').trim();
    if (clean.startsWith('{')) parsedForecast = JSON.parse(clean);
  } catch {}

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '12px', gap: '10px', overflowY: 'auto' }}>
      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: '6px' }}>
        {[['token', '🔮 Token Forecast'], ['compare', '📊 Compare All']].map(([id, label]) => (
          <button key={id} onClick={() => { setMode(id); setResult(''); }}
            style={{
              flex: 1, padding: '7px', borderRadius: '7px', cursor: 'pointer', fontSize: '11px',
              fontFamily: 'JetBrains Mono', fontWeight: '600',
              background: mode === id ? '#a78bfa22' : '#0a1520',
              border: `1px solid ${mode === id ? '#a78bfa66' : '#1a2535'}`,
              color: mode === id ? '#a78bfa' : '#5a7a94',
            }}>{label}</button>
        ))}
      </div>

      {/* Token selector for token mode */}
      {mode === 'token' && (
        <select
          value={selectedToken?._id || ''}
          onChange={e => setSelectedToken(tokens.find(t => t._id === e.target.value))}
          style={{
            background: '#0a1520', border: '1px solid #1a2535', borderRadius: '7px',
            color: '#cde8ff', fontFamily: 'JetBrains Mono', fontSize: '11px', padding: '7px 10px',
          }}
        >
          {tokens.slice(0, 20).map(t => (
            <option key={t._id} value={t._id}>
              ${t.baseToken?.symbol} — Score {t._score?.total} — {formatVolume(t.marketCap)} mcap
            </option>
          ))}
        </select>
      )}

      {/* Run button */}
      <button onClick={runForecast} disabled={loading}
        style={{
          padding: '9px', borderRadius: '7px', cursor: loading ? 'not-allowed' : 'pointer',
          background: loading ? '#1a2535' : 'linear-gradient(90deg, #a78bfa22, #7c3aed22)',
          border: `1px solid ${loading ? '#2a3545' : '#a78bfa66'}`,
          color: loading ? '#5a7a94' : '#a78bfa',
          fontFamily: 'JetBrains Mono', fontSize: '11px', fontWeight: '700',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
        }}>
        {loading ? <><Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> COMPUTING FORECAST...</> : <><Zap size={11} /> RUN AI FORECAST</>}
      </button>

      {/* Parsed forecast card */}
      {parsedForecast && !loading && (
        <div style={{
          background: '#0a1520', border: `1px solid ${DIR_COLORS[parsedForecast.direction] || '#1a2535'}44`,
          borderRadius: '10px', padding: '14px',
          boxShadow: `0 0 20px ${DIR_COLORS[parsedForecast.direction] || '#00d4ff'}11`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{
              fontSize: '14px', fontFamily: 'JetBrains Mono', fontWeight: '800',
              color: DIR_COLORS[parsedForecast.direction] || '#cde8ff',
            }}>
              {parsedForecast.direction === 'PUMP' ? '🚀' : parsedForecast.direction === 'DUMP' ? '📉' : '⏸'} {parsedForecast.direction}
            </span>
            <span style={{ fontSize: '11px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>
              {parsedForecast.confidence}% confidence · {parsedForecast.timeframe}
            </span>
          </div>

          <div style={{ fontSize: '11px', color: '#cde8ff', fontFamily: 'JetBrains Mono', marginBottom: '10px', lineHeight: '1.5' }}>
            {parsedForecast.summary}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
            {parsedForecast.pumpTarget && (
              <div style={{ background: '#00ff8c0a', border: '1px solid #00ff8c22', borderRadius: '7px', padding: '8px' }}>
                <div style={{ fontSize: '9px', color: '#00ff8c', fontFamily: 'JetBrains Mono', marginBottom: '3px' }}>🎯 PUMP TARGET</div>
                <div style={{ fontSize: '13px', color: '#00ff8c', fontFamily: 'JetBrains Mono', fontWeight: '700' }}>{formatVolume(parsedForecast.pumpTarget.mcap)}</div>
                <div style={{ fontSize: '9px', color: '#3a6a8a', fontFamily: 'JetBrains Mono' }}>{parsedForecast.pumpTarget.priceMultiple?.toFixed(1)}x · {parsedForecast.pumpTarget.probability}% prob</div>
              </div>
            )}
            {parsedForecast.dumpTarget && (
              <div style={{ background: '#ff44440a', border: '1px solid #ff444422', borderRadius: '7px', padding: '8px' }}>
                <div style={{ fontSize: '9px', color: '#ff4444', fontFamily: 'JetBrains Mono', marginBottom: '3px' }}>⚠️ DUMP RISK</div>
                <div style={{ fontSize: '13px', color: '#ff4444', fontFamily: 'JetBrains Mono', fontWeight: '700' }}>-{parsedForecast.dumpTarget.drawdownPct}%</div>
                <div style={{ fontSize: '9px', color: '#3a6a8a', fontFamily: 'JetBrains Mono' }}>{parsedForecast.dumpTarget.triggerSignal}</div>
              </div>
            )}
          </div>

          {parsedForecast.keySignals?.length > 0 && (
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '9px', color: '#5a7a94', fontFamily: 'JetBrains Mono', marginBottom: '4px' }}>KEY SIGNALS:</div>
              {parsedForecast.keySignals.map((s, i) => (
                <div key={i} style={{ fontSize: '10px', color: '#8b9eb0', fontFamily: 'JetBrains Mono', paddingLeft: '8px', borderLeft: '2px solid #a78bfa44', marginBottom: '2px' }}>{s}</div>
              ))}
            </div>
          )}

          {parsedForecast.nextCatalyst && (
            <div style={{ fontSize: '10px', color: '#ffd700', fontFamily: 'JetBrains Mono' }}>
              ⚡ {parsedForecast.nextCatalyst}
            </div>
          )}
        </div>
      )}

      {/* Raw text result (for compare mode or failed parse) */}
      {result && !parsedForecast && (
        <div style={{
          background: '#060d14', borderRadius: '8px', padding: '12px',
          border: '1px solid #1a2535', fontFamily: 'JetBrains Mono',
          fontSize: '11px', color: '#cde8ff', lineHeight: '1.6',
          whiteSpace: 'pre-wrap', overflowY: 'auto', maxHeight: '400px',
        }}>
          {result}
          {loading && <span style={{ animation: 'pulse 1s ease-in-out infinite', color: '#a78bfa' }}>▋</span>}
        </div>
      )}
    </div>
  );
}

// ─── Technical Analyst Tab ────────────────────────────────────────────────────
function TechnicalAnalystTab({ tokens, focusedToken }) {
  const [result, setResult]           = useState('');
  const [loading, setLoading]         = useState(false);
  const [noKey, setNoKey]             = useState(false);
  const [selectedToken, setSelectedToken] = useState(null);
  const [parsed, setParsed]           = useState(null);

  const target = focusedToken || selectedToken;

  useEffect(() => {
    const handler = () => setNoKey(false);
    window.addEventListener('groq-key-set', handler);
    return () => window.removeEventListener('groq-key-set', handler);
  }, []);

  // Parse the structured output into an object
  const parseResult = (text) => {
    if (!text) return null;
    const get = (key) => {
      const re = new RegExp(`^${key}:\\s*(.+)`, 'm');
      const m  = text.match(re);
      return m ? m[1].trim() : null;
    };
    const scoreRaw = get('SCORE');
    const scoreNum = scoreRaw ? parseFloat(scoreRaw.split('/')[0]) : null;
    return {
      score:            scoreNum,
      scoreRaw:         scoreRaw,
      pattern:          get('PATTERN'),
      momentum:         get('MOMENTUM'),
      buyPressure:      get('BUY PRESSURE'),
      riskLevel:        get('RISK LEVEL'),
      alphaIntelligence:get('ALPHA INTELLIGENCE'),
      watchNext:        get('WATCH NEXT'),
    };
  };

  const analyse = useCallback(async (tok) => {
    if (!tok || loading) return;
    setLoading(true);
    setResult('');
    setParsed(null);
    setNoKey(false);
    try {
      let full = '';
      for await (const chunk of callGroqStream(
        TECHNICAL_ANALYST_SYSTEM,
        buildTechnicalAnalystContext(tok),
        { maxTokens: 500, temperature: 0.3 }
      )) {
        full += chunk;
        setResult(full);
      }
      setParsed(parseResult(full));
    } catch (e) {
      if (e.message === 'NO_API_KEY') setNoKey(true);
      else setResult(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  // Colour helpers
  const scoreColor = (s) => {
    if (s === null) return '#5a7a94';
    if (s >= 7.5) return '#00ff8c';
    if (s >= 6.0) return '#00d4ff';
    if (s >= 4.5) return '#ffd700';
    if (s >= 3.0) return '#ff8300';
    return '#ff4444';
  };
  const levelColor = (txt, positives, neutrals) => {
    if (!txt) return '#5a7a94';
    const lo = txt.toLowerCase();
    if (positives.some(p => lo.startsWith(p))) return '#00ff8c';
    if (neutrals.some(n => lo.startsWith(n))) return '#ffd700';
    return '#ff4444';
  };
  const momentumColor  = (t) => levelColor(t, ['strong'], ['medium']);
  const pressureColor  = (t) => levelColor(t, ['high'],   ['balanced']);
  const riskColor      = (t) => {
    if (!t) return '#5a7a94';
    const lo = t.toLowerCase();
    if (lo.startsWith('low'))    return '#00ff8c';
    if (lo.startsWith('medium')) return '#ffd700';
    return '#ff4444';
  };

  const topTokens = tokens.slice(0, 10);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      {noKey && <NoKeyWarning />}

      {/* Header strip */}
      <div style={{
        padding: '10px 13px 8px',
        borderBottom: '1px solid #1a2535',
        background: '#0a0f14', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: '7px',
      }}>
        <Activity size={13} color="#00d4ff" />
        <span style={{ fontSize: '11px', color: '#00d4ff', fontFamily: 'JetBrains Mono', fontWeight: '700' }}>
          ELITE TECH ANALYST
        </span>
        <span style={{ fontSize: '10px', color: '#3a6a8a', fontFamily: 'JetBrains Mono' }}>
          · Raydium migration pattern recognition
        </span>
      </div>

      <div style={{ flex: 1, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto' }}>

        {/* Token selector */}
        <div>
          <div style={{ fontSize: '10px', color: '#3a5a74', fontFamily: 'JetBrains Mono', marginBottom: '6px' }}>
            {focusedToken ? `FOCUSED: $${focusedToken.baseToken?.symbol}` : 'SELECT TOKEN:'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
            {(focusedToken
              ? [focusedToken, ...topTokens.filter(t => t._id !== focusedToken._id)]
              : topTokens
            ).slice(0, 9).map(t => {
              const isActive = target?._id === t._id;
              const gc = { S: '#00ff8c', A: '#00d4ff', B: '#ffd700', C: '#ff8300', D: '#ff4444' }[t._score?.grade] || '#5a7a94';
              return (
                <button key={t._id}
                  onClick={() => { setSelectedToken(t); analyse(t); }}
                  style={{
                    padding: '4px 9px', borderRadius: '5px', cursor: 'pointer',
                    border: `1px solid ${isActive ? gc : '#1e3a52'}`,
                    background: isActive ? gc + '18' : '#0a1520',
                    color: isActive ? gc : '#5a8aaa',
                    fontSize: '11px', fontFamily: 'JetBrains Mono',
                    transition: 'all 0.15s',
                  }}>
                  {t._score?.grade} ${t.baseToken?.symbol}
                </button>
              );
            })}
          </div>
        </div>

        {/* Structured result cards */}
        {parsed && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>

            {/* Score banner */}
            <div style={{
              padding: '12px 14px', borderRadius: '10px',
              background: scoreColor(parsed.score) + '12',
              border: `1px solid ${scoreColor(parsed.score)}44`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: '11px', color: '#5a7a94', fontFamily: 'JetBrains Mono' }}>TECHNICAL SCORE</span>
              <span style={{
                fontSize: '24px', fontWeight: '800', fontFamily: 'Syne',
                color: scoreColor(parsed.score),
              }}>
                {parsed.scoreRaw || '—'}
              </span>
            </div>

            {/* Pattern */}
            {parsed.pattern && (
              <div style={{
                padding: '10px 12px', borderRadius: '8px',
                background: '#0a1520', border: '1px solid #1e3a52',
              }}>
                <div style={{ fontSize: '9px', color: '#3a6a8a', fontFamily: 'JetBrains Mono', marginBottom: '4px' }}>CHART PATTERN</div>
                <div style={{ fontSize: '12px', color: '#cde8ff', fontFamily: 'JetBrains Mono', fontWeight: '600' }}>{parsed.pattern}</div>
              </div>
            )}

            {/* Row: Momentum + Buy Pressure + Risk */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
              {[
                { label: 'MOMENTUM',     value: parsed.momentum,    colorFn: momentumColor },
                { label: 'BUY PRESSURE', value: parsed.buyPressure, colorFn: pressureColor },
                { label: 'RISK LEVEL',   value: parsed.riskLevel,   colorFn: riskColor },
              ].map(({ label, value, colorFn }) => {
                const col = colorFn(value);
                const firstWord = value ? value.split(/[\s+]/)[0] : '—';
                const rest = value ? value.slice(firstWord.length).trim() : '';
                return (
                  <div key={label} style={{
                    padding: '9px 10px', borderRadius: '8px',
                    background: col + '0d', border: `1px solid ${col}33`,
                  }}>
                    <div style={{ fontSize: '8px', color: '#3a6a8a', fontFamily: 'JetBrains Mono', marginBottom: '3px' }}>{label}</div>
                    <div style={{ fontSize: '12px', color: col, fontFamily: 'JetBrains Mono', fontWeight: '700', textTransform: 'uppercase' }}>{firstWord}</div>
                    {rest && <div style={{ fontSize: '9px', color: '#5a7a94', fontFamily: 'JetBrains Mono', marginTop: '2px', lineHeight: '1.4' }}>{rest}</div>}
                  </div>
                );
              })}
            </div>

            {/* Alpha Intelligence */}
            {parsed.alphaIntelligence && (
              <div style={{
                padding: '10px 12px', borderRadius: '8px',
                background: '#a78bfa0a', border: '1px solid #a78bfa33',
              }}>
                <div style={{ fontSize: '9px', color: '#a78bfa', fontFamily: 'JetBrains Mono', fontWeight: '700', marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Zap size={9} /> ALPHA INTELLIGENCE
                </div>
                <div style={{ fontSize: '11px', color: '#cde8ff', fontFamily: 'JetBrains Mono', lineHeight: '1.6' }}>
                  {parsed.alphaIntelligence}
                </div>
              </div>
            )}

            {/* Watch Next */}
            {parsed.watchNext && (
              <div style={{
                padding: '10px 12px', borderRadius: '8px',
                background: '#ffd7000a', border: '1px solid #ffd70033',
              }}>
                <div style={{ fontSize: '9px', color: '#ffd700', fontFamily: 'JetBrains Mono', fontWeight: '700', marginBottom: '5px' }}>
                  👁 WATCH NEXT 15–60 MIN
                </div>
                <div style={{ fontSize: '11px', color: '#cde8ff', fontFamily: 'JetBrains Mono', lineHeight: '1.6' }}>
                  {parsed.watchNext}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Raw streaming text (while loading, before parse) */}
        {loading && (
          <div style={{
            background: '#0a1520', border: '1px solid #1e3a52', borderRadius: '10px',
            padding: '12px 14px', fontSize: '11px', color: '#cde8ff',
            fontFamily: 'JetBrains Mono', lineHeight: '1.7', whiteSpace: 'pre-wrap',
            flex: 1, minHeight: '80px',
          }}>
            {result || (
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', color: '#5a7a94' }}>
                <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} />
                Analysing chart patterns...
              </div>
            )}
            {result && (
              <span style={{
                display: 'inline-block', width: '6px', height: '13px',
                background: '#00d4ff', marginLeft: '2px',
                animation: 'pulse 0.8s ease-in-out infinite', verticalAlign: 'text-bottom',
              }} />
            )}
          </div>
        )}

        {/* Empty state */}
        {!loading && !result && !noKey && (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#3a5a74', fontFamily: 'JetBrains Mono', fontSize: '11px', textAlign: 'center',
            padding: '20px',
          }}>
            Select a token above to run elite technical analysis
          </div>
        )}

        {/* Re-run button */}
        {result && !loading && target && (
          <button onClick={() => analyse(target)} style={{
            padding: '7px', borderRadius: '6px', border: '1px solid #1e3a52',
            background: '#0a1520', color: '#5a7a94', cursor: 'pointer',
            fontSize: '11px', fontFamily: 'JetBrains Mono',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
          }}>
            <Activity size={11} /> Re-run analysis
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN AGENT PANEL
// ═══════════════════════════════════════════════════════════════════════════════

const TABS = [
  { id: 'chat',        label: 'Chat',       icon: <MessageSquare size={14} />, short: 'CHAT' },
  { id: 'explainer',   label: 'Explain',    icon: <BarChart2 size={14} />,     short: 'EXPLAIN' },
  { id: 'alerts',      label: 'Alerts',     icon: <Bell size={14} />,          short: 'ALERTS' },
  { id: 'analyst',     label: 'Analyst',    icon: <Shield size={14} />,        short: 'ANALYST' },
  { id: 'techanalyst', label: 'Tech',       icon: <Activity size={14} />,      short: 'TECH' },
  { id: 'forecast',    label: 'Forecast',   icon: <TrendingUp size={14} />,    short: 'FORECAST' },
  { id: 'exit',        label: 'Exit',       icon: <LogOut size={14} />,        short: 'EXIT' },
];

export default function AgentPanel({
  tokens,
  focusedToken,
  onClearFocus,
  alerts,
  unreadCount,
  checking,
  lastCheck,
  markRead,
  markAllRead,
  clearAlerts,
  alertsEnabled,
  setAlertsEnabled,
  initialTab,
}) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(initialTab || 'chat');
  const [minimized, setMinimized] = useState(false);

  // Auto-open when focused token is set
  useEffect(() => {
    if (focusedToken) {
      setOpen(true);
      setMinimized(false);
    }
  }, [focusedToken]);

  // Switch to alerts tab when there are new alerts
  useEffect(() => {
    if (unreadCount > 0 && !open) {
      // Just update the badge, don't auto-open
    }
  }, [unreadCount, open]);

  const totalBadge = unreadCount;

  return (
    <>
      {/* FAB trigger button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', bottom: '24px', right: '24px', zIndex: 1000,
            width: '54px', height: '54px', borderRadius: '16px',
            background: 'linear-gradient(135deg, #00ff8c22, #00d4ff22)',
            border: '1px solid #00ff8c66',
            boxShadow: '0 0 24px #00ff8c33, 0 4px 20px rgba(0,0,0,0.5)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s ease',
          }}
        >
          <Bot size={22} color="#00ff8c" />
          {totalBadge > 0 && (
            <div style={{
              position: 'absolute', top: '-5px', right: '-5px',
              width: '18px', height: '18px', borderRadius: '50%',
              background: '#ff4444', color: '#fff',
              fontSize: '10px', fontFamily: 'JetBrains Mono', fontWeight: '700',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid #060a0f',
            }}>
              {totalBadge > 9 ? '9+' : totalBadge}
            </div>
          )}
        </button>
      )}

      {/* Panel */}
      {open && (
        <div style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 1000,
          width: '380px',
          height: minimized ? 'auto' : '580px',
          background: '#0d1117',
          border: '1px solid #1e3a52',
          borderRadius: '16px',
          boxShadow: '0 0 40px #00ff8c1a, 0 8px 40px rgba(0,0,0,0.7)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          transition: 'height 0.3s ease',
        }}>
          {/* Panel header */}
          <div style={{
            padding: '12px 14px',
            background: 'linear-gradient(135deg, #0d1a28, #0a1520)',
            borderBottom: '1px solid #1e3a52',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '8px',
              background: 'linear-gradient(135deg, #00ff8c22, #00d4ff22)',
              border: '1px solid #00ff8c44',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Bot size={15} color="#00ff8c" />
            </div>
            <div>
              <div style={{ fontSize: '13px', fontFamily: 'Syne', fontWeight: '700', color: '#cde8ff' }}>
                AI Agents
              </div>
              <div style={{ fontSize: '9px', color: '#3a6a8a', fontFamily: 'JetBrains Mono' }}>
                4 agents · Groq llama-3.3-70b
              </div>
            </div>

            {focusedToken && (
              <div style={{
                marginLeft: '6px', padding: '3px 8px', borderRadius: '5px',
                background: '#00d4ff15', border: '1px solid #00d4ff33',
                display: 'flex', alignItems: 'center', gap: '4px',
              }}>
                <span style={{ fontSize: '10px', color: '#00d4ff', fontFamily: 'JetBrains Mono' }}>
                  🎯 ${focusedToken.baseToken?.symbol}
                </span>
                <button onClick={onClearFocus} style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '0',
                  color: '#3a6a8a', display: 'flex',
                }}>
                  <X size={10} />
                </button>
              </div>
            )}

            <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
              <button onClick={() => setMinimized(p => !p)} style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#3a6a8a',
                display: 'flex', alignItems: 'center',
              }}>
                {minimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
              </button>
              <button onClick={() => { setOpen(false); onClearFocus?.(); }} style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#3a6a8a',
                display: 'flex', alignItems: 'center',
              }}>
                <X size={14} />
              </button>
            </div>
          </div>

          {!minimized && (
            <>
              {/* Tab bar */}
              <div style={{
                display: 'flex', borderBottom: '1px solid #1a2535',
                background: '#0a0f14',
              }}>
                {TABS.map(tab => {
                  const isActive = activeTab === tab.id;
                  const badge = tab.id === 'alerts' && unreadCount > 0 ? unreadCount : null;
                  return (
                    <button key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      style={{
                        flex: 1, padding: '10px 4px', border: 'none', cursor: 'pointer',
                        background: isActive ? '#0d1117' : 'transparent',
                        borderBottom: isActive ? '2px solid #00ff8c' : '2px solid transparent',
                        color: isActive ? '#00ff8c' : '#5a7a94',
                        fontSize: '10px', fontFamily: 'JetBrains Mono', fontWeight: isActive ? '700' : '400',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
                        position: 'relative', transition: 'all 0.15s',
                      }}>
                      {tab.icon}
                      {tab.short}
                      {badge && (
                        <div style={{
                          position: 'absolute', top: '4px', right: '50%',
                          transform: 'translateX(8px)',
                          width: '14px', height: '14px', borderRadius: '50%',
                          background: '#ff4444', color: '#fff',
                          fontSize: '9px', fontFamily: 'JetBrains Mono',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {badge > 9 ? '9+' : badge}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Tab content */}
              <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
                {activeTab === 'chat' && (
                  <ChatTab tokens={tokens} focusedToken={focusedToken} />
                )}
                {activeTab === 'explainer' && (
                  <StrategyExplainerTab tokens={tokens} focusedToken={focusedToken} />
                )}
                {activeTab === 'alerts' && (
                  <AlertTab
                    alerts={alerts} unreadCount={unreadCount}
                    checking={checking} lastCheck={lastCheck}
                    markRead={markRead} markAllRead={markAllRead}
                    clearAlerts={clearAlerts}
                    alertsEnabled={alertsEnabled}
                    setAlertsEnabled={setAlertsEnabled}
                  />
                )}
                {activeTab === 'analyst' && (
                  <TokenAnalystTab tokens={tokens} focusedToken={focusedToken} />
                )}
                {activeTab === 'techanalyst' && (
                  <TechnicalAnalystTab tokens={tokens} focusedToken={focusedToken} />
                )}
                {activeTab === 'forecast' && (
                  <ForecastTab tokens={tokens} focusedToken={focusedToken} />
                )}
                {activeTab === 'exit' && (
                  <ExitCoachTab tokens={tokens} focusedToken={focusedToken} />
                )}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
