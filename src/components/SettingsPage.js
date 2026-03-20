import React, { useState, useEffect, useCallback } from 'react';
import { loadConfig, saveConfig, hasGroqKey, hasHeliusKey } from '../utils/config';
import {
  Eye, EyeOff, CheckCircle, AlertCircle, Save, ExternalLink,
  Cpu, Zap, RefreshCw, Trash2, Database, Activity, Server,
} from 'lucide-react';
import { clearAllStorage } from '../utils/storage';

// ─── Reusable masked input ────────────────────────────────────────────────────
function ApiKeyInput({ label, value, onChange, placeholder, helpUrl, helpText, isValid }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ marginBottom: '18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <label style={{ fontSize: '10px', fontFamily: 'JetBrains Mono', color: '#7a9ab4', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</label>
        {helpUrl && (
          <a href={helpUrl} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: '10px', color: '#3a8abf', fontFamily: 'JetBrains Mono', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}>
            Get free key <ExternalLink size={10} />
          </a>
        )}
      </div>
      <div style={{ position: 'relative' }}>
        <input type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} autoComplete="off" spellCheck={false}
          style={{ width: '100%', padding: '10px 72px 10px 12px', background: '#0a0f14',
            border: `1px solid ${isValid ? '#00ff8c44' : value?.trim() ? '#ff444433' : '#1a2535'}`,
            borderRadius: '8px', color: '#cde8ff', fontFamily: 'JetBrains Mono', fontSize: '11px', outline: 'none' }} />
        <span style={{ position: 'absolute', right: '36px', top: '50%', transform: 'translateY(-50%)' }}>
          {isValid ? <CheckCircle size={13} color="#00ff8c" /> : value?.trim() ? <AlertCircle size={13} color="#ff4444" /> : null}
        </span>
        <button onClick={() => setShow(s => !s)}
          style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#3a5a74' }}>
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
      {helpText && <p style={{ fontSize: '10px', color: '#3a5a74', fontFamily: 'JetBrains Mono', marginTop: '5px', lineHeight: '1.5' }}>{helpText}</p>}
    </div>
  );
}

// ─── Live KV status + controls ────────────────────────────────────────────────
function KvStatusWidget() {
  const [status,     setStatus]     = useState('idle');
  const [info,       setInfo]       = useState(null);
  const [triggering, setTriggering] = useState(false);
  const [trigResult, setTrigResult] = useState(null);

  const checkStatus = useCallback(async () => {
    setStatus('checking'); setInfo(null);
    try {
      const res = await fetch('/api/tokens');
      if (!res.ok) { setStatus('error'); return; }
      const data = await res.json();
      if (!data.kvReady) { setStatus('unconfigured'); return; }
      setStatus('ok'); setInfo(data);
    } catch { setStatus('error'); }
  }, []);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  async function triggerScan() {
    setTriggering(true); setTrigResult(null);
    try {
      const res = await fetch('/api/scan', { method: 'POST' });
      setTrigResult(res.ok ? 'success' : 'fail');
      if (res.ok) setTimeout(checkStatus, 2500);
    } catch { setTrigResult('fail'); }
    finally { setTriggering(false); }
  }

  const timeAgo = ts => {
    if (!ts) return 'never';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s/60)}m ago`;
    return `${Math.floor(s/3600)}h ago`;
  };

  const COLORS = { idle:'#3a5a74', checking:'#00d4ff', ok:'#00ff8c', error:'#ff4444', unconfigured:'#ff8c00' };
  const LABELS = {
    idle:         '— Not checked yet',
    checking:     'Checking connection…',
    ok:           '⚡ Connected — 24/7 scanning active',
    error:        '✕ Cannot reach /api/tokens — deploy on Vercel first',
    unconfigured: '⚠ KV store not connected — see setup steps below',
  };

  return (
    <div style={{ background: '#0a0f14', borderRadius: '10px', border: `1px solid ${COLORS[status]}33`, padding: '16px', marginBottom: '0' }}>
      {/* Status row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: status === 'idle' ? '0' : '14px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {status === 'checking'
            ? <RefreshCw size={13} color="#00d4ff" style={{ animation: 'spin 1s linear infinite' }} />
            : status === 'ok'
              ? <Activity size={13} color="#00ff8c" style={{ animation: 'pulse 2s infinite' }} />
              : <Database size={13} color={COLORS[status]} />}
          <span style={{ fontSize: '11px', fontFamily: 'JetBrains Mono', color: COLORS[status], fontWeight: '600' }}>
            {LABELS[status]}
          </span>
        </div>
        <button onClick={checkStatus} disabled={status === 'checking'}
          style={{ fontSize: '9px', padding: '4px 10px', borderRadius: '6px', border: '1px solid #1a2535', background: '#0d1520', color: '#5a7a94', cursor: 'pointer', fontFamily: 'JetBrains Mono', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <RefreshCw size={9} style={{ animation: status === 'checking' ? 'spin 1s linear infinite' : 'none' }} />
          Recheck
        </button>
      </div>

      {/* Stats — only when ok */}
      {status === 'ok' && info && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' }}>
            {[
              { label: 'CACHED TOKENS', value: info.tokens?.length ?? 0,  color: '#00ff8c' },
              { label: 'TOTAL SCANNED', value: info.scanCount ?? 0,        color: '#00d4ff' },
              { label: 'LAST SCAN',     value: timeAgo(info.lastUpdate),   color: '#a78bfa' },
            ].map(s => (
              <div key={s.label} style={{ background: '#0d1520', borderRadius: '8px', padding: '10px', border: '1px solid #1a2535', textAlign: 'center' }}>
                <div style={{ fontSize: '16px', fontFamily: 'JetBrains Mono', fontWeight: '700', color: s.color }}>{s.value}</div>
                <div style={{ fontSize: '8px', fontFamily: 'JetBrains Mono', color: '#3a5a74', marginTop: '3px', letterSpacing: '0.05em' }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={triggerScan} disabled={triggering}
              style={{ fontSize: '10px', padding: '7px 14px', borderRadius: '7px', border: '1px solid #00ff8c44', background: '#00ff8c11', color: '#00ff8c', cursor: triggering ? 'not-allowed' : 'pointer', fontFamily: 'JetBrains Mono', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '5px', opacity: triggering ? 0.6 : 1 }}>
              {triggering ? <><RefreshCw size={10} style={{ animation: 'spin 1s linear infinite' }} /> Scanning…</> : <><Server size={10} /> Trigger scan now</>}
            </button>
            {trigResult === 'success' && <span style={{ fontSize: '10px', color: '#00ff8c', fontFamily: 'JetBrains Mono' }}>✓ Scan triggered — refreshing in 2s…</span>}
            {trigResult === 'fail'    && <span style={{ fontSize: '10px', color: '#ff4444', fontFamily: 'JetBrains Mono' }}>✕ Trigger failed</span>}
            <span style={{ fontSize: '9px', color: '#3a5a74', fontFamily: 'JetBrains Mono', marginLeft: 'auto' }}>Cron auto-runs every 60s</span>
          </div>
        </>
      )}

      {/* Setup steps — unconfigured */}
      {status === 'unconfigured' && (
        <div>
          <div style={{ fontSize: '10px', color: '#5a7a94', fontFamily: 'JetBrains Mono', marginBottom: '12px', lineHeight: '1.5' }}>
            Vercel KV is not connected yet. Follow these steps to enable 24/7 background scanning:
          </div>
          {[
            { n:'1', t: 'Open Vercel Dashboard → your project → Storage tab' },
            { n:'2', t: 'Click Create → KV (Redis) → give it any name → Create & Connect' },
            { n:'3', t: 'Vercel automatically injects KV_REST_API_URL and KV_REST_API_TOKEN into your project env vars' },
            { n:'4', t: 'Redeploy your project (Deployments tab → Redeploy), then click Recheck above' },
          ].map(s => (
            <div key={s.n} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '10px' }}>
              <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#ff8c0018', border: '1px solid #ff8c0055', color: '#ff8c00', fontSize: '9px', fontFamily: 'JetBrains Mono', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{s.n}</span>
              <span style={{ fontSize: '11px', color: '#7a9ab4', fontFamily: 'JetBrains Mono', lineHeight: '1.6' }}>{s.t}</span>
            </div>
          ))}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '4px' }}>
            <a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer"
              style={{ fontSize: '10px', color: '#3a8abf', fontFamily: 'JetBrains Mono', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
              Open Vercel Dashboard <ExternalLink size={9} />
            </a>
            <a href="https://vercel.com/docs/storage/vercel-kv/quickstart" target="_blank" rel="noopener noreferrer"
              style={{ fontSize: '10px', color: '#3a5a74', fontFamily: 'JetBrains Mono', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
              KV quickstart docs <ExternalLink size={9} />
            </a>
          </div>
        </div>
      )}

      {/* Error state */}
      {status === 'error' && (
        <p style={{ fontSize: '10px', color: '#ff6644', fontFamily: 'JetBrains Mono', lineHeight: '1.6', marginTop: '0' }}>
          /api/tokens is unreachable. This usually means the app is running locally without a dev server, or hasn't been deployed to Vercel yet.
          Deploy first, then come back to this page.
        </p>
      )}

      {/* Note about no manual key entry */}
      {(status === 'ok' || status === 'unconfigured') && (
        <div style={{ marginTop: '14px', padding: '8px 12px', background: '#00d4ff06', borderRadius: '6px', border: '1px solid #00d4ff18', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <Database size={11} color="#00d4ff" style={{ flexShrink: 0, marginTop: '2px' }} />
          <span style={{ fontSize: '10px', color: '#3a5a74', fontFamily: 'JetBrains Mono', lineHeight: '1.6' }}>
            KV credentials are injected by Vercel automatically — there's nothing to paste here. Once KV is connected, the cron job runs every 60 seconds and new tokens appear instantly when you open the app.
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Main settings page ───────────────────────────────────────────────────────
export default function SettingsPage({ onSave }) {
  const [cfg, setCfg]         = useState(loadConfig);
  const [saved, setSaved]     = useState(false);
  const [testing, setTesting] = useState({ groq: false, helius: false });
  const [results, setResults] = useState({ groq: null, helius: null });
  const [clearConfirm, setClearConfirm] = useState(false);

  const isGroqValid   = cfg.groqApiKey?.trim().length > 20;
  const isHeliusValid = cfg.heliusApiKey?.trim().length > 20;

  function handleSave() {
    saveConfig(cfg); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    onSave?.();
  }

  async function testGroq() {
    if (!cfg.groqApiKey?.trim()) return;
    setTesting(t => ({ ...t, groq: true })); setResults(r => ({ ...r, groq: null }));
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.groqApiKey.trim()}` },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 5, messages: [{ role: 'user', content: 'Hi' }] }),
      });
      setResults(r => ({ ...r, groq: res.ok ? 'success' : 'fail' }));
    } catch { setResults(r => ({ ...r, groq: 'fail' })); }
    finally  { setTesting(t => ({ ...t, groq: false })); }
  }

  async function testHelius() {
    if (!cfg.heliusApiKey?.trim()) return;
    setTesting(t => ({ ...t, helius: true })); setResults(r => ({ ...r, helius: null }));
    try {
      const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${cfg.heliusApiKey.trim()}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: '1', method: 'getHealth' }),
      });
      setResults(r => ({ ...r, helius: res.ok ? 'success' : 'fail' }));
    } catch { setResults(r => ({ ...r, helius: 'fail' })); }
    finally  { setTesting(t => ({ ...t, helius: false })); }
  }

  function handleClearData() {
    if (!clearConfirm) { setClearConfirm(true); setTimeout(() => setClearConfirm(false), 4000); return; }
    clearAllStorage(); setClearConfirm(false);
  }

  const S = {
    page:  { maxWidth: '640px', margin: '0 auto', padding: '0 0 40px' },
    card:  { background: '#0d1520', border: '1px solid #1a2535', borderRadius: '12px', padding: '22px', marginBottom: '14px' },
    title: { fontSize: '13px', fontFamily: 'JetBrains Mono', color: '#cde8ff', fontWeight: '700', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' },
    sub:   { fontSize: '10px', fontFamily: 'JetBrains Mono', color: '#3a5a74', marginBottom: '18px', lineHeight: '1.6' },
    row:   { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px' },
    btn:   (c='#00ff8c') => ({ padding:'7px 14px', borderRadius:'7px', border:`1px solid ${c}44`, background:`${c}11`, color:c, cursor:'pointer', fontSize:'10px', fontFamily:'JetBrains Mono', fontWeight:'600', display:'flex', alignItems:'center', gap:'5px' }),
    saveBtn: { width:'100%', padding:'12px', borderRadius:'10px', background: saved?'#00ff8c22':'#00ff8c', border:`1px solid ${saved?'#00ff8c66':'#00ff8c'}`, color: saved?'#00ff8c':'#060a0f', cursor:'pointer', fontSize:'13px', fontFamily:'JetBrains Mono', fontWeight:'700', display:'flex', alignItems:'center', justifyContent:'center', gap:'8px', transition:'all 0.3s' },
    sectionLabel: { fontSize: '9px', fontFamily: 'JetBrains Mono', color: '#3a5a74', letterSpacing: '0.15em', textTransform: 'uppercase', margin: '24px 0 10px', display: 'flex', alignItems: 'center', gap: '8px' },
    tag: (c) => ({ fontSize:'8px', padding:'2px 7px', borderRadius:'4px', background:`${c}18`, border:`1px solid ${c}44`, color:c, fontFamily:'JetBrains Mono', fontWeight:'700', letterSpacing:'0.06em' }),
  };

  return (
    <div style={S.page}>

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '20px', fontFamily: 'Syne, sans-serif', fontWeight: '800', background: 'linear-gradient(90deg, #00ff8c, #00d4ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '4px' }}>
          Settings
        </h2>
        <p style={{ fontSize: '11px', color: '#3a5a74', fontFamily: 'JetBrains Mono' }}>
          API keys are stored in your browser only. Vercel KV is managed from the Vercel dashboard.
        </p>
      </div>

      {/* ── 24/7 SCANNING ─────────────────────────────────── */}
      <div style={S.sectionLabel}>
        <span>24 / 7 Background Scanning</span>
        <span style={S.tag('#00d4ff')}>SERVERLESS</span>
      </div>

      <div style={S.card}>
        <div style={S.title}><Database size={14} color="#00d4ff" /> Vercel KV — Persistent Cache</div>
        <p style={S.sub}>
          Stores scored token data between cron runs. The server scans DexScreener every 60 seconds
          — even when no browser tab is open. Open the app any time and instantly see fresh results.
        </p>
        <KvStatusWidget />
      </div>

      {/* ── API KEYS ────────────────────────────────────────── */}
      <div style={S.sectionLabel}>
        <span>API Keys</span>
        <span style={S.tag('#a78bfa')}>BROWSER ONLY</span>
      </div>

      {/* Groq */}
      <div style={S.card}>
        <div style={S.title}><Cpu size={14} color="#a78bfa" /> Together AI — 8 Agent Engine</div>
        <p style={S.sub}>Alerts, forecasts, AI chat, telegram hunter, guardian analysis. Free credit for Llama-3.3-70B.</p>
        <ApiKeyInput label="Together API Key" value={cfg.groqApiKey||''} onChange={v => setCfg(c=>({...c,groqApiKey:v}))} placeholder="..." helpUrl="https://api.together.xyz/settings/api-keys" helpText="Free at together.ai · Llama-3.3-70B · no credit card" isValid={isGroqValid} />
        <div style={S.row}>
          <button onClick={testGroq} disabled={!cfg.groqApiKey?.trim()||testing.groq} style={S.btn('#a78bfa')}>
            {testing.groq ? <><RefreshCw size={10} style={{animation:'spin 1s linear infinite'}}/> Testing…</> : '⚡ Test connection'}
          </button>
          {results.groq==='success' && <span style={{fontSize:'10px',color:'#00ff8c',fontFamily:'JetBrains Mono'}}>✓ Connected</span>}
          {results.groq==='fail'    && <span style={{fontSize:'10px',color:'#ff4444',fontFamily:'JetBrains Mono'}}>✕ Invalid key</span>}
        </div>
      </div>

      {/* Helius */}
      <div style={S.card}>
        <div style={S.title}><Zap size={14} color="#00ff8c" /> Helius — Real-time WebSocket</div>
        <p style={S.sub}>Live Raydium migration detection (sub-3s) and copy-trade wallet tracker. Free: 100k req/day.</p>
        <ApiKeyInput label="Helius API Key" value={cfg.heliusApiKey||''} onChange={v => setCfg(c=>({...c,heliusApiKey:v}))} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" helpUrl="https://dev.helius.xyz/dashboard/app" helpText="Free at helius.dev · UUID format · enables ⚡ WS live detection + wallet tracker" isValid={isHeliusValid} />
        <div style={S.row}>
          <button onClick={testHelius} disabled={!cfg.heliusApiKey?.trim()||testing.helius} style={S.btn('#00ff8c')}>
            {testing.helius ? <><RefreshCw size={10} style={{animation:'spin 1s linear infinite'}}/> Testing…</> : '⚡ Test connection'}
          </button>
          {results.helius==='success' && <span style={{fontSize:'10px',color:'#00ff8c',fontFamily:'JetBrains Mono'}}>✓ Connected</span>}
          {results.helius==='fail'    && <span style={{fontSize:'10px',color:'#ff4444',fontFamily:'JetBrains Mono'}}>✕ Invalid key</span>}
        </div>
      </div>

      {/* ── SCANNER ─────────────────────────────────────────── */}
      <div style={S.sectionLabel}><span>Scanner</span></div>

      <div style={S.card}>
        <div style={S.title}><RefreshCw size={14} color="#00d4ff" /> Client Refresh Interval</div>
        <p style={S.sub}>How often the browser polls /api/tokens (or DexScreener in client fallback mode). Min 10s.</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <input type="range" min={10000} max={120000} step={5000} value={cfg.refreshInterval||30000}
            onChange={e => setCfg(c=>({...c,refreshInterval:parseInt(e.target.value)}))}
            style={{ flex: 1, accentColor: '#00d4ff', cursor: 'pointer' }} />
          <span style={{ fontSize: '15px', fontFamily: 'JetBrains Mono', fontWeight: '700', color: '#00d4ff', minWidth: '44px', textAlign: 'right' }}>
            {Math.round((cfg.refreshInterval||30000)/1000)}s
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px' }}>
          <span style={{ fontSize: '9px', color: '#3a5a74', fontFamily: 'JetBrains Mono' }}>10s</span>
          <span style={{ fontSize: '9px', color: '#3a5a74', fontFamily: 'JetBrains Mono' }}>120s</span>
        </div>
      </div>

      {/* Save */}
      <button onClick={handleSave} style={S.saveBtn}>
        {saved ? <><CheckCircle size={14}/> Saved!</> : <><Save size={14}/> Save Settings</>}
      </button>

      {/* Status summary */}
      <div style={{...S.card, marginTop:'14px'}}>
        <div style={{fontSize:'10px',color:'#5a7a94',fontFamily:'JetBrains Mono',fontWeight:'700',marginBottom:'14px',letterSpacing:'0.05em'}}>CONNECTION STATUS</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          {[
            { label:'Together AI',       ok: hasGroqKey(),   detail:'AI agents',       badge: hasGroqKey()?'ACTIVE':'NOT SET',  bc: hasGroqKey()?'#a78bfa':'#3a5a74' },
            { label:'Helius WS',         ok: hasHeliusKey(), detail:'Live detection',   badge: hasHeliusKey()?'ACTIVE':'NOT SET', bc: hasHeliusKey()?'#00ff8c':'#3a5a74' },
            { label:'DexScreener',       ok: true,           detail:'Token pairs',      badge:'FREE', bc:'#00d4ff' },
            { label:'RugCheck + GoPlus', ok: true,           detail:'Safety checks',    badge:'FREE', bc:'#00d4ff' },
          ].map(item => (
            <div key={item.label} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px', background:'#0a0f14', borderRadius:'8px', border:'1px solid #1a2535' }}>
              {item.ok ? <CheckCircle size={13} color="#00ff8c" style={{flexShrink:0}} /> : <AlertCircle size={13} color="#ff8c00" style={{flexShrink:0}} />}
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:'5px',marginBottom:'2px'}}>
                  <span style={{fontSize:'10px',fontFamily:'JetBrains Mono',color:'#cde8ff',fontWeight:'600'}}>{item.label}</span>
                  <span style={{...S.tag(item.bc),fontSize:'7px'}}>{item.badge}</span>
                </div>
                <span style={{fontSize:'9px',fontFamily:'JetBrains Mono',color:'#3a5a74'}}>{item.detail}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Danger zone */}
      <div style={{...S.card, marginTop:'14px', borderColor:'#ff444422'}}>
        <div style={{...S.title, color:'#ff6644'}}><Trash2 size={14} color="#ff6644" /> Danger Zone</div>
        <p style={S.sub}>Clears all cached tokens, detection history, watchlist, and saved API keys from this browser.</p>
        <button onClick={handleClearData}
          style={{...S.btn('#ff4444'), border:`1px solid ${clearConfirm?'#ff4444':'#ff444433'}`, background: clearConfirm?'#ff444422':'#ff444411'}}>
          <Trash2 size={10}/>
          {clearConfirm ? 'Click again to confirm — irreversible' : 'Clear all local data'}
        </button>
      </div>
    </div>
  );
}
