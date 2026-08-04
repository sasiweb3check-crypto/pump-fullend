# PUMPSDK Scanner v3 — Serverless

Real-time Solana memecoin scanner. Runs 100% serverless on Vercel. No backend, no server costs.

## Deploy to Vercel in 60 seconds

### Option A — Drag & drop (fastest)
1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **"Import Third-Party Git Repository"** or just drag the project folder
3. Click **Deploy** — done. No env vars needed.

### Option B — GitHub + Vercel
```bash
git init
git add .
git commit -m "initial"
# Push to GitHub, then import in Vercel dashboard
```

### Option C — Vercel CLI
```bash
npm install -g vercel
vercel login
vercel --prod
```

## Configure API Keys (after deploy)

**No environment variables needed.** Open the app → click **⚙ KEYS** in the header or sidebar → enter your keys → Save.

Keys are stored in your browser's localStorage. They are never sent to any server.

| Key | Purpose | Free tier |
|-----|---------|-----------|
| **Groq** | 8 AI agents (alerts, forecasts, chat, guardian AI) | 14,400 req/day at [console.groq.com/keys](https://console.groq.com/keys) |
| **Helius** | Live WebSocket detection (<3s) + wallet tracker | 100k req/day at [helius.dev](https://helius.dev) |

**The scanner works without any keys** — DexScreener, RugCheck, and GoPlus are always free with no key required.

## Local development

```bash
npm install
npm start
# Opens at http://localhost:3000
```

## Architecture

> **Full deep-dive:** see [`ARCHITECTURE.md`](./ARCHITECTURE.md) — complete scoring formulas, signal logic, hooks, APIs, and data flows (copy-ready for review).

- **Frontend**: Create React App (React 18) — pure client-side SPA
- **Serverless**: Vercel Functions (`/api/scan`, `/api/tokens`) + Vercel KV; GitHub Actions cron scans every ~30s
- **Data**: DexScreener, RugCheck, GoPlus, Together AI (Llama-3.3-70B), Helius WS/RPC
- **Storage**: localStorage for keys, watchlist, bot, guardian; KV for server-side token cache
- **Scoring**: nichxbt 9-signal engine (graduation, volume velocity, EEI/$LARRY, etc.) → grade S–D

## What's different from the original

- Removed all `process.env.REACT_APP_*` references
- API keys are now configured in-app via the Settings page
- Keys persist in localStorage — survive page reloads, work across tabs
- Added **Settings** page with key testing (Test connection button)
- Scanner refresh interval is user-adjustable (10s–120s)
