// ─────────────────────────────────────────────────────────────────────────────
// RUNTIME CONFIG — reads API keys from localStorage (user-configured in Settings)
// This replaces all process.env.REACT_APP_* references so keys are never
// baked into the build and can be changed at any time without redeploying.
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG_KEY = 'pumpsdk_config';

const DEFAULTS = {
  groqApiKey:    '',
  heliusApiKey:  '',
  refreshInterval: 30000,
};

// ── Read ──────────────────────────────────────────────────────────────────────
export function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

// ── Write ─────────────────────────────────────────────────────────────────────
export function saveConfig(patch) {
  try {
    const current = loadConfig();
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ ...current, ...patch }));
    return true;
  } catch {
    return false;
  }
}

// ── Key getters (used throughout the app) ────────────────────────────────────

export function getGroqKey() {
  const cfg = loadConfig();
  const k = cfg.groqApiKey?.trim();
  if (k && k !== '' && k !== 'YOUR_GROQ_KEY_HERE') return k;
  return null;
}

export function getHeliusKey() {
  const cfg = loadConfig();
  const k = cfg.heliusApiKey?.trim();
  if (k && k !== '' && k !== 'YOUR_HELIUS_KEY_HERE') return k;
  return null;
}

export function getRefreshInterval() {
  const cfg = loadConfig();
  const v = parseInt(cfg.refreshInterval, 10);
  return isNaN(v) ? 30000 : Math.max(10000, v);
}

export function hasGroqKey()   { return !!getGroqKey(); }
export function hasHeliusKey() { return !!getHeliusKey(); }
