# Memefish v3 — Serverless

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

- **Frontend**: Create React App (React 18) — pure client-side SPA
- **Data**: All external API calls made directly from the browser
  - DexScreener — token pairs, prices, volumes (free, no key)
  - RugCheck.xyz — contract safety analysis (free, no key)
  - GoPlus Labs — honeypot + tax checks (free, no key)
  - Groq AI — llama-3.3-70b agent completions (free key required)
  - Helius — WebSocket + wallet RPC (free key required)
- **Storage**: localStorage only — all scan history, watchlist, and settings stay in your browser
- **Serverless**: Zero backend. Vercel just serves the static build. Runs 24/7 for free.

## What's different from the original

- Removed all `process.env.REACT_APP_*` references
- API keys are now configured in-app via the Settings page
- Keys persist in localStorage — survive page reloads, work across tabs
- Added **Settings** page with key testing (Test connection button)
- Scanner refresh interval is user-adjustable (10s–120s)
