# PUMPSDK Scanner v3 — Full Architecture & Logic Reference

> Copy-ready technical review document. Covers every module, scoring formula, signal, hook, API, and data flow.

---

## 1. What This App Is

**PUMPSDK Scanner** is a real-time Solana memecoin scanner SPA that detects and scores newly graduated pump.fun / Raydium tokens using the **nichxbt strategy** (case study: `$pump-sdk` — 142x, $2.1M volume).

| Attribute | Detail |
|-----------|--------|
| Version | 3.0.0 |
| Stack | React 18 (CRA) + Vercel Serverless Functions + Vercel KV |
| Charts | Recharts |
| Icons | Lucide React |
| Fonts | JetBrains Mono + Syne |
| Deploy | Vercel (static SPA + `/api/*` serverless) |
| Cron | GitHub Actions every 1 min → `POST /api/scan` (2× per minute) |

**Core value proposition:** Find early micro-cap Solana memecoins that match the nichxbt graduation + volume-flywheel pattern, score them 0–100, surface buy/intra signals, and optionally run AI agents + paper trading on top.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  EXTERNAL DATA                                                          │
│  DexScreener · RugCheck · GoPlus · Helius (WS+RPC) · Together AI · TG  │
└────────────┬────────────────────────────────────────────────────────────┘
             │
┌────────────▼────────────────────────────────────────────────────────────┐
│  SERVERLESS LAYER (Vercel Functions)                                    │
│                                                                         │
│  GitHub Actions cron (*/1) ──► POST /api/scan                           │
│    ├── fetch DexScreener (pumpswap + raydium)                           │
│    ├── quality gate (isValidPair)                                       │
│    ├── scoreToken (9-signal nichxbt engine)                             │
│    ├── detection map (first price, ATH, Nx multipliers)                 │
│    ├── persist → Vercel KV                                              │
│    └── optional Telegram alerts (S/A + moonshots)                       │
│                                                                         │
│  GET /api/tokens ──► read KV ──► JSON to client                         │
└────────────┬────────────────────────────────────────────────────────────┘
             │ poll ~30s
┌────────────▼────────────────────────────────────────────────────────────┐
│  CLIENT (React SPA — App.js page router, no React Router)               │
│                                                                         │
│  useTokenScanner ──► tokens[] with _score, _gain*, _ath*                │
│       │                                                                 │
│       ├── Scanner page (FilterBar + TokenCards + signals)               │
│       ├── useAlertAgent (60s LLM alerts)                                │
│       ├── useForecast (per-token pump/dump forecast)                    │
│       ├── usePaperBot (intraday paper trader)                           │
│       ├── useWatchlist / useTelegramHunter / useGuardian                │
│       ├── useWalletTracker / useHeliusWebSocket                         │
│       └── AgentPanel (8 AI agents via Together AI / Llama-3.3-70B)      │
│                                                                         │
│  Storage: browser localStorage only for keys, watchlist, bot, etc.      │
└─────────────────────────────────────────────────────────────────────────┘
```

### Dual-mode scanning

1. **Server mode (preferred):** Cron scans → KV → client polls `/api/tokens`
2. **Client fallback:** If KV not configured, browser hits DexScreener directly and scores locally

---

## 3. Project File Map

```
/
├── api/                          # Vercel serverless (Node, CommonJS)
│   ├── _kv.js                    # Vercel KV REST helpers
│   ├── _scoring.js               # Server copy of scoring engine
│   ├── scan.js                   # POST/GET scan cron handler
│   └── tokens.js                 # GET read-only token feed
│
├── src/
│   ├── index.js                  # React 18 root
│   ├── App.js                    # Shell, pages, hook wiring
│   ├── utils/
│   │   ├── config.js             # API keys from localStorage
│   │   ├── scoring.js            # Full scoring + signals + formatters
│   │   └── storage.js            # Scanner cache / detection persistence
│   ├── agents/
│   │   ├── groq.js               # Together AI client (misnamed "groq")
│   │   ├── agentPrompts.js       # 8 agent system prompts + context builders
│   │   ├── forecastEngine.js     # Forecast prompt + heuristic fallback
│   │   ├── useForecast.js        # Per-token forecast hook
│   │   └── useAlertAgent.js      # Background LLM alert monitor
│   ├── hooks/
│   │   ├── useTokenScanner.js    # Poll /api/tokens (+ DexScreener fallback)
│   │   ├── useWatchlist.js       # Persisted CA watchlist
│   │   ├── useTelegramHunter.js  # Paste TG msg → extract CA → score
│   │   ├── useWalletTracker.js   # Helius copy-trade wallet buys
│   │   ├── usePaperBot.js        # Intraday paper trading simulator
│   │   ├── useHeliusWebSocket.js # Live Raydium migration WS
│   │   └── useGuardian.js        # Safety scanner (RugCheck + GoPlus)
│   └── components/               # All page + UI components (inline styles)
│
├── .github/workflows/scanner.yml # Cron trigger for /api/scan
├── public/index.html
├── vercel.json                   # CRA build + SPA rewrites + security headers
├── package.json
└── README.md
```

---

## 4. Pages & Navigation

No React Router. `App.js` holds `activePage` state.

| Page ID | Component | Purpose |
|---------|-----------|---------|
| `scanner` | TokenCards + FilterBar + StatsHeader | Main live feed |
| `guardian` | GuardianPage | Ultra-conservative safety scanner |
| `lookup` | TokenLookup | Analyze any Solana CA |
| `watchlist` | WatchlistPage | Tracked CAs, 30s refresh |
| `hunter` | TelegramHunterPage | Paste TG alpha → TRACK/SKIP |
| `wallets` | WalletTrackerPage | Copy-trade wallet buys |
| `bot` | PaperBotPage | Paper trading dashboard |
| `alerts` | AlertsPage | AI background alerts |
| `settings` | SettingsPage | Groq/Together + Helius keys |

Always mounted: `Sidebar` (desktop) / `MobileTabBar` (<768px), floating `AgentPanel` FAB.

---

## 5. Scoring Engine (nichxbt Strategy)

**Canonical client file:** `src/utils/scoring.js`  
**Server mirror:** `api/_scoring.js` (must stay in sync — Vercel `api/` cannot import `src/`)

### 5.1 Quality Gate (`isValidPair`)

| Rule | Threshold |
|------|-----------|
| Chain | `solana` only |
| DEX | `pumpswap`, `raydium`, `meteora`, `orca` |
| Price | `priceUsd > 0` |
| Age | `pairCreatedAt` within **48 hours** |
| Market cap | `$1,000` – `$5,000,000` (`marketCap \|\| fdv`) |
| Volume 24h | `≥ $500` |
| Liquidity | `≥ $1,000` USD |
| Base token | Must have `address` + `symbol` |

### 5.2 Signal Weights (raw max ≈ 110)

| Signal | Max Pts | What It Measures |
|--------|---------|------------------|
| Graduation Speed | 18 | How fast pair appeared (organic urgency) |
| Volume Velocity | 22 | 24h volume size + 1h vs 6h acceleration |
| Price Multiple | 16 | Sustained price appreciation (not flash spikes) |
| Buy Pressure | 12 | Buy/sell txn ratio |
| Liquidity Depth | 8 | Committed USD liquidity |
| TX Frequency | 12 | Txns per hour (community engagement) |
| V/L Efficiency | 6 | Volume/liquidity flywheel ratio |
| Social Signal | 6 | Dev/tech narrative keywords in name/symbol |
| Early Explosion Index (EEI) | 10 | Micro-MC Vol/MC explosion ($LARRY pattern) |

### 5.3 Per-Signal Formulas

#### Graduation Speed (0–18)
| Age | Score |
|-----|-------|
| ≤20 min | 18 |
| ≤30 min | 15 |
| ≤60 min | 11 |
| ≤120 min | 7 |
| ≤360 min | 3 |
| else | 0 |

Penalty: if score ≥ 11 and `vol1h < $500` → subtract 5 (bot graduation filter).

#### Volume Velocity (0–22)
Base from vol24h: ≥500k→16, ≥200k→13, ≥100k→10, ≥50k→7, ≥10k→4, ≥2k→2.

Acceleration: `accel = vol1h / (vol6h / 6)`
- ≥3.0 → +6, ≥2.0 → +4, ≥1.5 → +2, `<0.4` → −3
- Clamped to `[0, 22]`

#### Price Multiple (0–16)
`sustainedMove = max(p1h, p6h, p24h)`: ≥500%→16 … ≥0→2; negative→0.  
Bonus: `p5m > 5` and sustained > 0 → +1.

#### Buy Pressure (0–12)
`buyRatio = buys / (buys+sells)`: ≥0.75→12 … `<0.35`→0.  
If `totalTxns < 50` → cap at 3.

#### Liquidity Depth (0–8)
≥200k→8, ≥100k→7, ≥50k→5, ≥20k→3, ≥5k→1, else 0.

#### TX Frequency (0–12)
`txPerHour = totalTxns / max(1, min(ageHours, 24))`  
≥2000→12, ≥800→10, ≥300→7, ≥100→5, ≥30→3, else 1.

#### V/L Efficiency (0–6)
`vlRatio = vol24h / liquidity`  
≥50 & liq≥20k→6; ≥20 & liq≥10k→5; ≥10→4; ≥5→2; ≥1→1.

#### Social / Dev Narrative (0–6)
Keyword tiers on `name + symbol`:
- **Tier1** (`sdk, mcp, agent, api, github, open source, opensrc`): ≥1 → 6
- **Tier2** (`dev, build, code, hack, fork, deploy, protocol, tool`): 2+→5; 1+t3→4; 1→3
- **Tier3** (`ai, bot, web3, defi, solana, pump, smart, contract`): 2+→2; 1→1

#### Early Explosion Index / EEI (0–10) — "$LARRY Signal"
**Only fires when** `bestMc < $50K` AND `age ≤ 60 min`.

`bestMc = min(marketCap, fdv)` when both > 0.

| Component | Scoring |
|-----------|---------|
| Vol/MC ratio | ≥5→6, ≥3→5, ≥2→4, ≥1→2, ≥0.5→1 |
| Age tightness | ≤10m→+2, ≤20m→+1 |
| Buy confirm | ≥0.70→+2, ≥0.60→+1, `<0.45`→−2 |
| TX velocity | ≥20 tx/min→+2, ≥10→+1 |

### 5.4 Final Score Formula

```
rawTotal = sum(all signal scores)

mcapModifier:
  mcap < $50K              → +3
  $50K–$200K               → +1
  $500K–$1.5M              → −2
  ≥ $1.5M                  → −5

freshnessMultiplier = max(0.4, 1 - ageMins / 480)   // decays over 8h to floor 0.4×

total = clamp(0, 100, round((rawTotal + mcapModifier) * freshnessMultiplier))
```

### 5.5 Grades

| Total | Grade | Recommendation |
|-------|-------|----------------|
| ≥ 78 | **S** | STRONG FIT |
| ≥ 62 | **A** | GOOD FIT |
| ≥ 46 | **B** | MODERATE FIT |
| ≥ 30 | **C** | WEAK FIT |
| < 30 | **D** | NO FIT |

### 5.6 Mcap Phases (`getMcapPhase`)

| Phase | Range | Meaning |
|-------|-------|---------|
| MICRO | <$50K | Pre-viral — max upside |
| SMALL | $50–200K | Discovery — sweet spot |
| MID | $200–500K | Momentum — building |
| LARGE | $500K–1.5M | Peak retail — caution |
| MEGA | >$1.5M | Distribution risk — exit zone |

---

## 6. Trade Signals

### 6.1 Buy Signal (`getBuySignal`) — 8 conditions

| # | Condition | Pass Rule |
|---|-----------|-----------|
| 1 | Momentum Surge | `vol1h ≥ 2×` 6h hourly avg |
| 2 | Buy Wall | buy pressure ≥ 65% |
| 3 | Price Breakout | 5m > +2% AND 1h > 0% |
| 4 | Micro Entry | mcap < $150K |
| 5 | Fresh Token | age < 60 min |
| 6 | Liquid Enough | liquidity ≥ $8K |
| 7 | Score Gate | score ≥ 62 (A-grade) |
| 8 | Larry Signal | EEI ≥ 5 |

**Levels:** `STRONG_BUY` if ≥6 pass · `WATCH` if 4–5 · else null

### 6.2 Intraday Signal (`getIntraSignal`) — 6 conditions

Gate: score must be ≥ 55. Tuned for 1.5x–4x same-day moves in first 20 min.

| # | Condition | Pass Rule |
|---|-----------|-----------|
| 1 | Ultra Fresh | age ≤ 20 min |
| 2 | 5m Vol Burst | vol5m ≥ $500 |
| 3 | 5m Buy Surge | 5m buys > sells AND ≥3 txns |
| 4 | Price Pumping | 5m ≥ +3% |
| 5 | Micro Entry | mcap < $100K |
| 6 | Momentum Live | accel ≥ 1.8× (or building) |

**Levels:** `INTRA_NOW` if ≥5 · `INTRA_SOON` if 4 · else null  
Also returns `urgency` 0–100.

### 6.3 Signal Tags (`getSignalTags`)

Positive examples: Fast Grad, Vol Surge, Accelerating, Buy Dom, Larry Signal, EEI Active, Micro Cap, V/L Flywheel  
Warnings: Thin Liq, Extended, Vol Fading, Late Stage  
Negative: Sell Pressure, Dumping

---

## 7. Serverless API Layer

### 7.1 `POST /api/scan` (`api/scan.js`)

**Triggered by:** GitHub Actions cron (every 1 min, 2 calls with 30s gap) or manual UI refresh.

**Auth:** If `CRON_SECRET` set → require `x-cron-secret` header or `?secret=`

**Pipeline:**
1. Parallel DexScreener searches: `pumpswap` + `raydium solana pump`
2. Dedupe by `pairAddress`
3. Quality gate → score each token
4. Detection tracking:
   - **New:** store `detectedAt`, `priceAtDetection`, `mcAtDetection`, `ath`
   - **Existing:** update ATH; if floor(price/entry) > lastMultiplier → moon alert
5. Enrich tokens with `_score`, `_id`, `_detectedAt`, `_gainSinceDetection`, `_athGain`
6. Sort by score desc → persist to KV
7. Telegram (optional): new S/A (score≥62); Nx multiplier updates; scan errors

**Gain formulas:**
```
gainNow = (currentPrice - priceAtDetection) / priceAtDetection * 100
athGain = (ath - priceAtDetection) / priceAtDetection * 100
```

### 7.2 `GET /api/tokens` (`api/tokens.js`)

Read-only KV fetch for the React poller. Returns:
```json
{ "tokens": [...], "scanCount": N, "lastUpdate": ts, "kvReady": true|false }
```

### 7.3 Vercel KV (`api/_kv.js`)

| Key | TTL | Contents |
|-----|-----|----------|
| `pumpsdk:tokens` | 1h | Scored token array |
| `pumpsdk:detection_map` | 48h | First-seen / ATH map (max 500) |
| `pumpsdk:seen_ids` | 48h | Dedup IDs (max 500) |
| `pumpsdk:scan_count` | 30d | Cumulative count |
| `pumpsdk:last_update` | 1h | Last scan timestamp |

Env: `KV_REST_API_URL`, `KV_REST_API_TOKEN`  
All KV ops fail soft (never throw).

### 7.4 GitHub Actions Cron

`.github/workflows/scanner.yml`:
- Schedule: `*/1 * * * *`
- Secrets: `VERCEL_APP_URL`, `CRON_SECRET`
- Fires `/api/scan` twice per minute (0s and +30s)

---

## 8. Client Hooks

### 8.1 `useTokenScanner`
- Polls `GET /api/tokens` every `getRefreshInterval()` (default 30s, min 10s)
- Falls back to client DexScreener + compact scorer if KV unavailable
- Caches tokens in localStorage (5 min freshness)
- Returns: `{ tokens, loading, error, lastUpdate, scanCount, refresh, serverMode }`

### 8.2 `useWatchlist`
- Persists CAs; refreshes via DexScreener every 30s
- Tracks detection/ATH per watchlisted token
- Keys: `pumpsdk_watchlist_addresses`, `pumpsdk_watchlist_detection`

### 8.3 `useHeliusWebSocket`
- `wss://mainnet.helius-rpc.com` · `logsSubscribe` on Raydium AMM v4 + CPMM
- Filters for `initialize2` (migration events)
- On detect: show 8s banner, refresh scanner after 3s
- Reconnect every 5s; requires Helius key

### 8.4 `useWalletTracker`
- Max 3 wallets; polls Helius RPC every 60s
- Detects Raydium buys (AMM v4, CPMM, CLMM)
- Enriches with DexScreener; alerts type `WALLET_BUY`

### 8.5 `useTelegramHunter(addToWatchlist)`
- Regex-extract Solana CAs from pasted TG text (max 5)
- Score via DexScreener + `scoreToken`
- Optional Groq decision: TRACK / SKIP / WATCH-ONLY
- Defaults without AI: S/A→TRACK, B→WATCH-ONLY, C/D→SKIP

### 8.6 `useGuardian` (v4.0)
Ultra-conservative safety scanner.

**Default config:**
| Setting | Default |
|---------|---------|
| maxMcap | $50K |
| minLiquidity | $3K |
| maxAgeMins | 720 (12h) |
| maxCandidates | 3 |
| scanIntervalMins | 5 |
| maxCreatorPct | 3% |
| maxTop10Pct | 20% |
| minHolderCount | 100 |
| maxTaxPct | 10% |
| requireLpBurned | true |
| strongBuyThreshold | risk ≤ 25 |
| watchThreshold | risk ≤ 50 |

**APIs:** DexScreener (pumpswap) → RugCheck summary → GoPlus Solana security  
**Instant fails:** mint/freeze authority, honeypot, high tax, LP not burned (if required)

### 8.7 `usePaperBot(tokens)` — Intraday Simulator

**Entry (ALL 8 must pass):**
1. Score ≥ 72
2. Age ≤ 20 min
3. Mcap ≤ $80K
4. Buy pressure ≥ 65%
5. Vol accel ≥ 2×
6. Liquidity ≥ $8K
7. 5m change ≥ +1%
8. V/L ≥ 4

**Exits (first trigger wins):**
| Rule | Action |
|------|--------|
| TP1 +40% | Sell 40%, activate trail |
| TP2 +100% | Sell 35% |
| TP3 +250% | Sell 25% |
| Trail −20% from peak | Exit remainder (after TP1) |
| Hard stop −15% | Full exit |
| Buy ratio <40% × 2 checks | Exit |
| Time stop 2h | Exit |
| Daily stop −30% | Stop trading for day |

**Defaults:** 10◎ start · 25%/trade · max 4 positions · daily target +150%

### 8.8 `useAlertAgent(tokens, enabled)`
- Every 60s (first check after 10s)
- Diffs top tokens via LLM → structured alerts
- Max 50 alerts kept
- Alert types: `ATH_BREAK | VOLUME_SPIKE | SELL_PRESSURE | FAST_GRAD | SCORE_CHANGE | MOMENTUM_LOSS`

### 8.9 `useForecast`
- Per-token forecast with 90s cache
- AI first → heuristic fallback on fail/no key
- Directions: `PUMP | DUMP | NEUTRAL` with confidence, timeframe, risk

---

## 9. AI Agents Layer

### 9.1 LLM Client (`src/agents/groq.js`)
Despite the name, calls **Together AI**:
- Endpoint: `https://api.together.xyz/v1/chat/completions`
- Model: `meta-llama/Llama-3.3-70B-Instruct-Turbo`
- Key from localStorage Settings (`getGroqKey`)
- Exports: `callGroq()`, `callGroqStream()`, `hasApiKey()`

### 9.2 Eight Agents (`agentPrompts.js`)

| # | Agent | Role |
|---|-------|------|
| 1 | Token Analyst | Why score fits nichxbt pattern |
| 2 | Trade Advisor | Entry/exit advice vs top-5 |
| 3 | Narrative Detector | Narrative type/strength/audience |
| 4 | Alert Agent | JSON-only background alerts |
| 5 | Mcap Forecaster | Zone-based mcap targets |
| 6 | Comparison | Rank top 10 pump potential |
| 7 | Exit Coach | HOLD / SCALE OUT / EXIT NOW |
| 8 | Technical Analyst | Structured SCORE/PATTERN/MOMENTUM |

**Mcap zones used by agents:**
- <$50K pre-viral (10–20x potential)
- $50–200K discovery (3–8x)
- $200–500K momentum (2–4x)
- $500K–$2M peak retail (50%+ correction risk)
- >$2M distribution

### 9.3 Forecast Heuristic Fallback
If no API key or LLM fails, `computeHeuristicForecast` scores pump vs dump from buy ratio, vol accel, price, mcap, score, age, ATH drawdown. Sets `_isHeuristic: true`.

---

## 10. Config & Storage

### 10.1 Runtime Config (`utils/config.js`)
Key: `pumpsdk_config`  
Fields: `groqApiKey`, `heliusApiKey`, `refreshInterval` (default 30000, min 10000)  
Keys never baked into build — user configures in Settings.

### 10.2 LocalStorage Key Map

| Key | Owner |
|-----|-------|
| `pumpsdk_config` | Settings / API keys |
| `pumpsdk_cached_tokens` | Scanner (5 min TTL) |
| `pumpsdk_last_update` | Scanner |
| `pumpsdk_scan_count` | Scanner |
| `pumpsdk_detection_map` | Scanner (client fallback) |
| `pumpsdk_seen_ids` | Scanner (client fallback) |
| `pumpsdk_watchlist_addresses` | Watchlist |
| `pumpsdk_watchlist_detection` | Watchlist |
| `pumpsdk_hunt_history` | Telegram hunter |
| `pumpsdk_tracked_wallets` | Wallet tracker |
| `pumpsdk_wallet_seen_sigs` | Wallet tracker |
| `pumpsdk_bot_state/trades/config/balance/daily` | Paper bot |
| `pumpsdk_guardian_config/scan/history` | Guardian |
| `pumpsdk_lookup_history` | Token lookup |
| `pumpsdk_positions` | Exit Coach entries |

---

## 11. External Services

| Service | Auth | Used For |
|---------|------|----------|
| **DexScreener** | None | Pair discovery, prices, volumes |
| **Vercel KV** | Env token | Server-side token cache |
| **Together AI** | User key (Settings) | All 8 AI agents |
| **Helius** | User key (Settings) | WebSocket migrations + wallet RPC |
| **RugCheck.xyz** | None | Contract safety (Guardian) |
| **GoPlus Labs** | None | Honeypot + tax (Guardian) |
| **Telegram Bot API** | Server env | Optional S/A + Nx alerts |

**Server env vars:** `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `CRON_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`  
**Client keys:** Together AI + Helius via Settings UI (localStorage)

**Outbound deep links:** GMGN, DexScreener, Pump.fun, Birdeye, Solscan, Jupiter

---

## 12. Filter & Sort (Scanner UI)

### Filters (`FilterBar` / `applyFilters`)
| ID | Logic |
|----|-------|
| `all` | No filter |
| `top` | Grade S or A |
| `intra` | Has INTRA_NOW or INTRA_SOON |
| `buy` | STRONG_BUY signal |
| `watch` | WATCH buy signal |
| `micro` | mcap <$50K, liq ≥$3K |
| `new` | Age < 2h |
| `volume` | vol24h ≥ $50K |
| `dev` | Social signal keywords |
| `gained` | Gain since detection ≥ 50% |

Plus min-score slider 0–90 (step 5).

### Sorts
`score` · `gain_now` · `ath_gain` · `volume` · `price_change` · `newest` · `oldest_detect` · `txns`

---

## 13. Token Object Shape (Enriched)

After scoring/detection, each token carries:

```
{
  // DexScreener fields
  pairAddress, chainId, dexId, pairCreatedAt,
  baseToken: { address, name, symbol },
  quoteToken, priceUsd, priceChange, volume, liquidity, txns,
  marketCap, fdv,

  // App enrichments
  _id,                    // pairAddress || baseToken.address
  _score: {
    scores: { graduationSpeed, volumeVelocity, priceMultiple,
              buyPressure, liquidityDepth, txFrequency,
              vlEfficiency, socialSignal, earlyExplosionIndex },
    total, grade, recommendation, mcapModifier, freshnessMultiplier
  },
  _detectedAt,
  _priceAtDetection,
  _detectedMc,            // server only
  _ath, _athAt,
  _gainSinceDetection,    // %
  _athGain                // %
}
```

---

## 14. Polling / Timing Cheat Sheet

| System | Interval |
|--------|----------|
| Server scan (GitHub Actions) | Every 60s (2× per minute) |
| Client token poll | 30s (configurable 10–120s) |
| Watchlist refresh | 30s |
| Wallet tracker | 60s |
| Alert agent | 60s (+10s initial delay) |
| Guardian auto-scan | 5 min (configurable 3–30) |
| Forecast cache TTL | 90s |
| Helius WS reconnect | 5s |
| Token cache freshness | 5 min |
| Migration banner display | 8s |

---

## 15. Error Handling Patterns

| Layer | Pattern |
|-------|---------|
| KV | Fail soft → null / false / [] |
| DexScreener fetch | Catch → log → [] |
| `/api/scan` | Catch → optional TG → 500 JSON |
| `/api/tokens` | Missing KV → 200 empty + `kvReady:false` |
| Together AI | Throw `NO_API_KEY` or HTTP error |
| useForecast | Always fall back to heuristic |
| useAlertAgent | Silent on no key / bad JSON |
| localStorage | Never throw; QuotaExceeded clears cache & retries |

---

## 16. UI / Design Notes

- Dark theme: `#060a0f` bg, `#00ff8c` / `#00d4ff` accents
- Inline styles throughout (no CSS modules / Tailwind)
- Grade-colored borders on TokenCards
- Animations: slideIn, pulse, buyPulse, spin
- Responsive: sidebar desktop / bottom tab bar mobile
- Strategy attribution: @nichxbt · disclaimer "NOT financial advice"

---

## 17. Key Logic Differences: Server vs Client Scoring

| Aspect | Server (`api/_scoring.js`) | Client (`src/utils/scoring.js`) |
|--------|---------------------------|--------------------------------|
| EEI | Full 0–10 with all bonuses | Full (canonical) |
| Signal tags / buy / intra | Not on server | Client-only |
| Fallback scorer in scanner | N/A | Compact version (no EEI) when offline |
| Must stay in sync | Primary for production scans | Primary for UI signals + Guardian/Hunter |

---

## 18. End-to-End Data Flow (Happy Path)

```
1. GitHub Actions fires POST /api/scan every ~30s
2. scan.js fetches DexScreener → filters → scores → updates detection/ATH
3. Results written to Vercel KV
4. Optional: Telegram notifies for score≥62 or new Nx multiplier
5. React useTokenScanner polls GET /api/tokens every 30s
6. App applies FilterBar → renders TokenCards with grades/tags/signals
7. Optional auto-forecast on top 5 tokens
8. useAlertAgent diffs tokens every 60s via LLM
9. usePaperBot evaluates entry/exit on each token update tick
10. Helius WS may interrupt with live Raydium migration → banner + refresh
11. User can open AgentPanel for streaming AI chat on any token
```

---

## 19. Quick Constants Reference

```
QUALITY GATE:     age≤48h · mcap $1K–$5M · vol≥$500 · liq≥$1K
GRADES:           S≥78 · A≥62 · B≥46 · C≥30 · D<30
BUY SIGNAL:       ≥6/8 → STRONG_BUY · ≥4/8 → WATCH
INTRA SIGNAL:     ≥5/6 → INTRA_NOW · ≥4/6 → INTRA_SOON (score≥55)
EEI WINDOW:       mcap<$50K · age≤60m
PAPER ENTRY:      score≥72 · age≤20m · mcap≤$80K · BP≥65% · accel≥2×
PAPER EXITS:      TP 40/100/250 · trail−20% · stop−15% · time 2h
GUARDIAN:         mcap≤$50K · risk≤25 SB · ≤50 Watch
LLM:              Llama-3.3-70B via Together AI
```

---

*Generated from full codebase review of PUMPSDK Scanner v3.0.0. Strategy based on @nichxbt pump.fun SDK method. Not financial advice.*
