# WhatsMonTrack - WhatsApp Expense Tracker Bot

**Live app: https://bit.ly/WhatsMonTrack** — see [LIVE.md](LIVE.md) for what is deployed and how to get started.

An LLM-powered WhatsApp bot and multi-tenant SaaS platform that lets multiple users log expenses in natural Indonesian chat shorthand (e.g. *"50k makan siang bca"*) and get structured tracking, corrections and monthly summaries on their own private dashboard.

Every user has their own login, bank/e-wallet accounts, budgets and transactions. The REST API is shared by the web dashboard and (later) a Kotlin mobile app.

---

## Documentation

Quick access to every document in this repository.

| Document | What it covers | Jump to |
|---|---|---|
| **README.md** (this file) | Features, architecture, local setup, full user guide, development, history | [Features](#features) · [Architecture](#architecture) · [REST API](#rest-api) · [Setup](#installation-and-setup) · [User guide](#user-guide) · [Development](#development) · [History](#project-history) |
| [**LIVE.md**](LIVE.md) | The deployed app: link, what runs where, getting started, limitations, releasing updates | [What is running](LIVE.md#what-is-running) · [Getting started](LIVE.md#getting-started-users) · [Limitations](LIVE.md#limitations) · [Releasing an update](LIVE.md#releasing-an-update-build-on-the-laptop) · [Custom domain](LIVE.md#moving-to-a-custom-domain) |
| [**deploy/vps/README.md**](deploy/vps/README.md) | Step-by-step learning guide: deploying to an Ubuntu VPS | [Big picture](deploy/vps/README.md#0-the-big-picture) · [SSH](deploy/vps/README.md#1-log-in-to-the-vps-over-ssh) · [Server setup](deploy/vps/README.md#2-prepare-the-server-once) · [Secrets](deploy/vps/README.md#3-fill-in-the-secrets) · [Build & deploy](deploy/vps/README.md#4-build-on-the-laptop-run-on-the-server) · [First use](deploy/vps/README.md#5-first-use) · [Operations](deploy/vps/README.md#6-day-to-day-operations) · [Backups](deploy/vps/README.md#backups) · [Troubleshooting](deploy/vps/README.md#7-troubleshooting) · [DNS problems](deploy/vps/README.md#dns-problems-lessons-from-the-first-deployment) · [Security](deploy/vps/README.md#8-security-in-short) |
| [**backend/api/README.md**](backend/api/README.md) | The NestJS API and WhatsApp bot: code layout, scripts, migrations | [Layout](backend/api/README.md#layout) · [Scripts](backend/api/README.md#scripts) · [Configuration](backend/api/README.md#configuration) · [Migrations](backend/api/README.md#migrations) |
| [**frontend/README.md**](frontend/README.md) | The Next.js web dashboard: code layout and scripts | [Layout](frontend/README.md#layout) · [Scripts](frontend/README.md#scripts) |

---

## Table of contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Installation and setup](#installation-and-setup)
   - [Deploy to a VPS (step-by-step learning guide)](deploy/vps/README.md)
4. [User guide](#user-guide)
5. [Development](#development)
6. [Project history](#project-history)

---

## Features

### WhatsApp bot
- **Natural Indonesian input.** *"bayar gojek 20k pake ovo"*, *"gajian 5jt masuk ke bca"*, *"transfer 100rb dari bca ke gopay"*. Slang is understood (`k`/`rb` = ribu, `jt` = juta, `ceban` = 10.000, `goceng` = 5.000).
- **Expense, income and transfer.** The reply shows the remaining balance and the time it was recorded, in your own time zone.
- **AI with a safety net.** Google Gemini (structured JSON output) parses the message; if Gemini is unavailable (no key, quota, outage) an offline parser takes over and saves its results as drafts to review. Your own account names are given to the model so it picks real accounts. The message is always treated as data, never as instructions to the AI.
- **Unsure? Ask, don't guess.** When the AI is less than 85% confident, the transaction is saved as a draft in **Perlu ditinjau** (review inbox) and balances are not touched until you confirm it. Account names the bot cannot find are never created automatically; the bot replies with your list of accounts.
- **Loose account matching.** `Go-Pay` = `GO PAY` = `gopay`, `cash` = `tunai` = `uang tunai`, case and punctuation are ignored.
- **Lending and debt (utang-piutang).** *"talangin makan Budi 150rb pakai BCA"* creates a talangan on the Utang-piutang page (the money leaves BCA right away, but it is not spending yet); *"Budi bayar utang 50rb ke GoPay"* ticks Budi as paid. Only your own share reaches the expense reports, once the record is settled.
- **`/rekap` or `/recap`.** Monthly summary straight in WhatsApp without using AI credits.
- **Casual chat.** "Halo" or "cara pakainya gimana?" gets a friendly answer instead of an error.
- **Never double-counted.** Each WhatsApp message is recorded at most once (message id + database unique constraint), also when WhatsApp re-delivers messages after a reconnect. Messages sent while the bot was offline are still processed when it comes back (up to `WA_OFFLINE_MAX_AGE_HOURS`, default 72 hours).
- **Private.** Only numbers linked to a verified account are served. Groups, status updates and the bot's own replies are ignored. Unknown numbers get linking instructions at most once per 10 minutes.

### Accounts and security
- **Register with email only.** Email + password (minimum 8 characters), verified with a 6-digit OTP sent as an HTML email (light and dark mode).
- **Forgot password** with an emailed code.
- **WhatsApp number linking after login** with a QR code ([how it works](#how-number-linking-works)). Change or unlink any time.
- JWT sessions (7 days), bcrypt password hashing, rate-limited auth endpoints (5 requests per minute, login 10), OTP valid 15 minutes with 5 attempts, request validation on every endpoint, and every query scoped to the logged-in user.
- **Admin role** (`ADMIN_EMAILS`): only admins can see the bot's QR code and number, link the bot, **change the bot number** or **unlink it** (the bot logs out of WhatsApp and stays off until it is linked again).

### Web dashboard
- **Dashboard (overview):** total balance, income, expense and difference (each can be hidden with its eye icon), cash-flow chart, daily spending chart with the daily budget line, spending or income per category, accounts (with their own eye icon) and budget progress, plus a lending/debt card kept apart from the totals.
- **Utang-piutang page:** talangan (piutang) and debts (utang) with the people involved. Balances move the moment money moves (the talangan leaving, each person paying to whichever account); the real expense (your own share, or what you repaid) is recorded only when the record is settled, without touching a balance again.
- **Investasi page:** Indonesian stocks (IDX, in lots), US stocks and crypto on Stockbit, Pluang and other platforms, with live prices updated every 10 seconds (Yahoo Finance, Binance, CoinGecko) and the live USD/IDR rate. Portfolio value, cost and unrealized profit/loss in rupiah, an allocation donut by asset class or platform, a filterable holdings table, and buy/sell that recomputes the average price. Buying or selling never changes an account balance; the market value is added to **Saldo total** on the Dashboard.
- **Chart page** (its own item in the sidebar), laid out like TradingView: intervals from 5 minutes to 1 month, scroll to zoom, indicators, 23 drawing tools (lines, channels, Fibonacci, shapes, text, long/short positions, ranges) that can be selected, moved, recolored and deleted, a watchlist, key statistics and an automatic technical analysis. The drawing toolbar, the side panel and the watchlist resize by dragging their edges.
- **Transaksi (ledger):** calendar day filter, paginated list (10/15/50/100 per page), add, edit and delete.
- **Chat:** chat with the bot right on the web, with the same results as on WhatsApp (record transactions, `/rekap`). Works without a bot number or a linked phone; the history is saved and can be cleared.
- **Perlu ditinjau (review inbox):** confirm, edit or delete uncertain bot results, or delete them all.
- **Month switcher**, **Tambah** (add) menu for transactions, accounts and budgets, onboarding checklist for new users.
- **Light, dark or system theme**, without a flash on page load, in the style of Apple's apps: San Francisco (Inter where it isn't installed), Apple's system colors and grays, the system blue for actions, translucent sidebar and tab bar, pill buttons, iOS segmented controls and Mac-style pop-up menus.
- **Quick, purposeful motion:** smooth wheel scrolling, key figures that count up once, cards that rise into view, sliding indicators in the sidebar and segmented controls, progress bars that fill, a green/red flash when a live price moves, records that slide out when settled or deleted. All of it stops with the system's *Reduce motion* setting.
- **Bahasa Indonesia or English**, switched in Pengaturan (dates and words follow; amounts keep the Indonesian Rp 1.250.000).
- **Pengaturan (Settings)** page laid out like iOS Settings: theme, language, compact sidebar, WhatsApp number, WhatsApp bot (admin), hide all amounts, reset the chart layout, account and sign out.
- Responsive: a sidebar on tablet and desktop that collapses to icons or expands with names, bottom tabs on mobile. Refreshes automatically every 15 seconds and when you return to the tab.

### Data correctness
- **Money is stored as whole rupiah (`BIGINT`)**: no floating-point rounding errors and no ~Rp 2.1 billion `INT` limit. Fractional amounts are rejected by the API; amounts from the AI are rounded to whole rupiah.
- **Per-user time zone.** Timestamps are stored in UTC. The browser's time zone (e.g. `Asia/Jakarta`, `Asia/Makassar`, `Asia/Jayapura`) is saved on register and login, and "today" and "this month" are calculated in that zone. A transaction at 06:30 WIB on 1 November belongs to November.
- **One place changes balances** (`transactions/ledger.ts`), always inside a database transaction. Editing or deleting a transaction restores the old balance first.

---

## Architecture

The project is fully dockerized and uses a **modular monolith**: one NestJS app split into feature modules. There are two Docker Compose setups:

| | Development (`docker-compose.yml`) | Production (`docker-compose.prod.yml`) |
|---|---|---|
| Database | PostgreSQL master + replica behind Pgpool-II | One PostgreSQL + daily backups |
| API / web | Dev servers with source mounted | Production builds, built on a laptop and shipped (`deploy/vps/release.sh`) |
| Entry point | Nginx on `http://localhost` | Caddy with automatic HTTPS (Let's Encrypt) |
| Guide | [Installation and setup](#installation-and-setup) | [deploy/vps/README.md](deploy/vps/README.md) · live: [LIVE.md](LIVE.md) |

The diagram below shows the development setup.

- **API (`/backend/api`)**: a single NestJS application that
  - connects to WhatsApp over WebSockets (`@whiskeysockets/baileys`),
  - parses natural-language messages with Gemini (regex fallback),
  - sends OTP emails over SMTP or Brevo's HTTPS API,
  - stores the WhatsApp session in PostgreSQL, so the bot survives restarts and is included in backups,
  - exposes the REST API used by the web dashboard (and later the mobile app).
- **Frontend dashboard (`/frontend`)**: Next.js (App Router) single-page app with JWT auth.
- **Database**: PostgreSQL (master/replica streaming replication) behind Pgpool-II, accessed via Prisma.
- **Reverse proxy**: Nginx (`/` → frontend, `/api` → API).

```mermaid
graph TD
    WA[WhatsApp servers] <-->|WebSocket, Baileys| API(NestJS API - modular monolith)
    Browser[Browser] -->|HTTP :80| Nginx(Nginx reverse proxy)
    Nginx -->|/| Frontend(Next.js)
    Nginx -->|/api| API
    API -.->|HTTPS| Gemini(Google Gemini API)
    API -.->|SMTP| Mail(Email server)
    API -->|Prisma adapter-pg| PgPool(Pgpool-II)
    PgPool -->|write| Master(PostgreSQL master)
    PgPool -->|read| Slave(PostgreSQL replica)
```

### Backend modules (`backend/api/src`)

| Module | Responsibility |
|---|---|
| `auth/` | Register, email OTP, login, forgot/reset password, JWT, HTML OTP email |
| `accounts/` | Bank/e-wallet accounts (CRUD, ownership checks, loose name matching) |
| `budgets/` | Monthly budget per category |
| `debts/` | Utang-piutang: records with participants, real-time cash flow (transactions with `inReports: false`) and settling (an expense/income with `affectsBalance: false`) |
| `investments/` | Investasi: holdings, buy/sell history (`portfolio.ts` has the average-price math) and `market.service.ts`, the live prices, chart history and asset facts from Yahoo Finance, Binance and CoinGecko with a 10-second cache and a database fallback |
| `transactions/` | Transactions, monthly summary, `ledger.ts` (the only place that changes balances) |
| `parser/` | Gemini parsing with regex fallback |
| `whatsapp/` | `WhatsAppService` (Baileys socket), `BotService` (conversation logic, `/rekap`), `PhoneLinkService` (number linking), session store in PostgreSQL (`db-auth-state.ts`) |
| `chat/` | Web chat with the bot: saves the conversation (`ChatMessage`) and runs each message through `BotService`, so it behaves exactly like WhatsApp |
| `common/` | Auth/admin guards, `@CurrentUser()`, config, phone normalisation, time zone helpers, BigInt JSON serialisation |
| `database/` | `PrismaService` |
| `health.controller.ts` | `GET /api/health` liveness check (no auth, no database) |

Every user-scoped query filters by the `userId` from the JWT, so users can never read or modify each other's data.

### REST API

All endpoints except `/api/auth/register`, `verify-otp`, `login`, `forgot-password` and `reset-password` need `Authorization: Bearer <token>`. Money is sent and returned as whole rupiah (JSON numbers).

| Method and path | Purpose |
|---|---|
| `POST /api/auth/register` | Create account (or resend the OTP for an unverified one); optional `timeZone` |
| `POST /api/auth/verify-otp` | Verify the email OTP, returns a JWT |
| `POST /api/auth/login` | Login, returns a JWT; optional `timeZone` |
| `POST /api/auth/forgot-password`, `POST /api/auth/reset-password` | Password reset with an emailed code |
| `GET /api/auth/me` | Current user |
| `POST /api/auth/verify-password` | Checks the signed-in user's password (`{ valid }`), used to show hidden amounts. Max 10 tries per minute |
| `GET /api/accounts`, `POST /api/accounts`, `PUT /api/accounts/:id` | Accounts; the list includes `transactionCount` (transactions that use each account) |
| `DELETE /api/accounts/:id?withTransactions=true` | Delete an account. Without the flag an account still in use gets `409` with `transactionCount` and `debtCount`; with it, its transactions and Utang-piutang records are deleted too and other accounts' balances are corrected |
| `GET /api/budgets`, `POST /api/budgets`, `DELETE /api/budgets/:id` | Budgets (POST creates or updates per category) |
| `GET /api/debts?status=OPEN&type=RECEIVABLE&q=budi`, `GET /api/debts/summary`, `GET /api/debts/:id` | Utang-piutang records with `participants` and `progress` (`total`, `paid`, `expected`, `remaining`, `difference`); the list also returns the open `summary` (`receivable`, `payable`, `openCount`) |
| `POST /api/debts`, `PUT /api/debts/:id`, `DELETE /api/debts/:id` | `title`, `type` (RECEIVABLE / PAYABLE), `totalAmount`, `category` (a spending category), `accountId`, `addToBalance`, `recordExpense`, `date`, `notes`, `participants` [{ `id`?, `personName`, `expectedAmount` }]. Creating a talangan takes the total from the account; editing redoes that movement; deleting undoes every movement (a settled record's report entry goes too). Editing: open records only |
| `POST /api/debts/:id/participants/:pid/pay`, `DELETE` same path | Tick `{ amount, accountId, paidAt }`: the money enters (talangan) or leaves (utang) that account now. `DELETE` unticks and gives the balance back |
| `POST /api/debts/:id/settle`, `POST /api/debts/:id/reopen` | Settle: records total − paid (talangan) or what was paid (utang) as an expense with `affectsBalance: false`; `{ recordExcessAsIncome }`, `{ recordExpense }`. Reopen removes it |
| `GET /api/investments`, `POST /api/investments`, `PUT /api/investments/:id`, `DELETE /api/investments/:id` | Holdings: `assetType` (IDX_STOCK / US_STOCK / CRYPTO), `symbol` (BBCA, NVDA, BTC; no `.JK`), `platform`, `currency` (IDR / USD; IDX is always IDR), `quantity` (lots for IDX, decimals allowed otherwise), `avgPrice` (per share/unit), optional `name` and `coingeckoId` (found automatically). An unknown ticker is refused; the same ticker on the same platform is a 409. `PUT` is a direct correction and cannot change the type or ticker |
| `GET /api/investments/:id/trades`, `POST /api/investments/:id/trades` | Buy/sell history. `{ side: BUY or SELL, quantity, price, tradedAt?, note? }`: a buy recomputes the average price, a sell keeps it and stores the realized P&L. Selling more than you hold is a 400 |
| `GET /api/market/prices` | Live prices of your own holdings plus `fx` (USD/IDR): `{ prices: { "IDX:BBCA": { price, currency, priceIdr?, changePct, updatedAt, stale } }, fx, unreachable, fetchedAt }`. `changePct` is the change since the previous close (stocks) or over 24 hours (crypto). Shared 10-second cache. When a source fails, the last price saved in the database comes back with `stale: true` and the source is named in `unreachable` (e.g. `["Yahoo Finance"]`); a price never seen is `null` |
| `GET /api/investments/:id/chart?interval=1D` | Price history of one of your holdings for the chart: `{ currency, source, candles: [{ time, open, high, low, close, volume }] }`, `time` in Unix seconds. `interval`: `5m`, `15m`, `1h`, `4h`, `1D`, `1W`, `1M`. Crypto comes from Binance (USDT pairs, the last 1000 bars) or Yahoo; stocks from Yahoo (5/15 minutes: 1 month back, hourly: 6 months, 4 hours: 1 year built from hourly bars, daily: 10 years, weekly: 20 years, monthly: all). Cached 30 seconds for intraday intervals, 5 minutes for the rest |
| `GET /api/investments/:id/profile` | Facts for the chart page's side panel, in the asset's own currency: `{ name, exchange, currency, market: "OPEN" \| "CLOSED" \| "ALWAYS", session, previousClose, dayHigh, dayLow, volume, turnover, yearHigh, yearLow, marketCap, rank, circulatingSupply, maxSupply, allTimeHigh, allTimeHighDate, description, homepage, categories, sources }`. Stocks from Yahoo's chart metadata, crypto from Binance's 24-hour ticker plus CoinGecko (market cap, supply, all-time high, a short description; cached an hour). Missing fields are `null` |
| `GET /api/transactions?month&year&day&page&limit` | List transactions; month/day boundaries use the user's time zone. Optional filters: `type` (EXPENSE/INCOME/TRANSFER), `category` (code, case-insensitive), `accountId` (money out of or into that account), `q` (text in the description or original message), `status` (CONFIRMED/NEEDS_REVIEW) |
| `POST /api/transactions/manual` | Add a transaction manually |
| `PUT /api/transactions/:id`, `DELETE /api/transactions/:id` | Edit or delete (balances are corrected) |
| `PUT /api/transactions/:id/confirm` | Confirm a draft from the review inbox |
| `GET /api/phone`, `POST /api/phone/link`, `DELETE /api/phone` | WhatsApp number status, create a linking code, unlink |
| `GET /api/whatsapp/status` | Bot status: `state` (`connecting`, `waiting_qr`, `connected`, `stopped`); QR code and bot number for admins only |
| `POST /api/whatsapp/reset` | Change the bot number: log the current number out, show a new QR (admin) |
| `POST /api/whatsapp/stop`, `POST /api/whatsapp/start` | Unlink the bot number and keep the bot off, also after restarts / turn it back on (admin) |
| `GET /api/chat`, `POST /api/chat`, `DELETE /api/chat` | Web chat: latest 100 messages, send a message (`{ text }`, max 500 characters, 20 per minute) and get the bot's reply, clear the history (transactions stay) |
| `GET /api/health` | Liveness check for health checks and uptime monitors |
| `POST /parse` | Parse a text without saving it (testing) |

### Tech stack

**Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS, shadcn/ui, Recharts, qrcode.react

**Backend:** NestJS 11, Prisma 7 (`@prisma/adapter-pg`), `@whiskeysockets/baileys`, Google Gemini (`@google/generative-ai`), class-validator, `@nestjs/throttler`, Nodemailer, bcryptjs

**Infrastructure:** PostgreSQL, Docker Compose; development: replica + Pgpool-II + Nginx; production: Caddy (automatic HTTPS) on an Ubuntu VPS

---

## Installation and setup

### Requirements
- Docker Desktop (or Docker Engine + Compose)
- A Google Gemini API key
- An SMTP account for sending OTP emails (e.g. Gmail with an app password, or [Ethereal](https://ethereal.email) for testing)
- A WhatsApp number for the bot (preferably a separate number, not your personal one)

### 1. Environment
Create a `.env` file in the project root based on `.env.example`:

| Variable | What it is |
|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD` | Database user |
| `POSTGRES_REPL_USER`, `POSTGRES_REPL_PASSWORD` | Replication user (master → replica) |
| `PGPOOL_ADMIN_USER`, `PGPOOL_ADMIN_PASSWORD` | Pgpool admin |
| `GEMINI_API_KEY` | Google Gemini key for parsing messages |
| `JWT_SECRET` | Long random string. The API refuses to start without it |
| `ADMIN_EMAILS` | Comma-separated emails that may see the bot QR and reset the bot |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Email server for OTPs |
| `SMTP_SECURE` | `true` for TLS. Port 465 always uses TLS regardless of this value |
| `BREVO_API_KEY`, `MAIL_FROM` (optional) | Send OTP emails over Brevo's HTTPS API instead of SMTP (for hosts that block SMTP ports) |
| `WA_OFFLINE_MAX_AGE_HOURS` (optional) | Process WhatsApp messages sent while the bot was down, up to this many hours old (default `72`) |
| `FRONTEND_ORIGIN` (optional) | Frontend URL(s) on another domain allowed to call the API (CORS) |
| `TRUST_PROXY_HOPS` (optional) | Number of reverse proxies in front of the API (default `1`) |
| `API_HOST_PORT` (optional) | Local debug port of the API, default `3001` |

### 2. Start the app
To avoid startup race conditions, startup scripts are provided. They start the databases first, then the API and frontend, then Nginx.
- **Windows (cmd):** double-click or run `start_app.bat`
- **PowerShell:** `./start_app.ps1`
- **Manual / Linux / macOS:** `docker compose up --build -d`

Open `http://localhost`. Database migrations run automatically when the API container starts.

To stop: `docker compose stop` (data is kept). To start again: `docker compose up -d`.

### 3. Connect the bot (admin, once)
The bot is one shared WhatsApp number that all users chat with.

1. Register and log in with an email listed in `ADMIN_EMAILS`.
2. Open **Pengaturan** (Settings, at the foot of the sidebar; on a phone: the gear at the top right), then **Bot WhatsApp**. A red dot on Pengaturan means the bot is offline.
3. On the bot's phone open WhatsApp → **Perangkat tertaut** (Linked devices) → **Tautkan perangkat** and scan the QR. The QR refreshes automatically about every 20 seconds.
4. The status changes to **Online** and the dialog shows the bot's number.

The bot number should be a dedicated number (not your personal one). The phone only needs to be online now and then: open WhatsApp on it at least once a week (Wi-Fi is enough), otherwise WhatsApp unlinks the bot after about 14 days of phone inactivity. Keep a prepaid SIM active (top up before it expires), or the number can be recycled to someone else.

The QR is also printed in the API logs: `docker logs whatsmon-api -f`.

---

## User guide

### 1. Create an account
1. Open `http://localhost` and choose **Buat akun**.
2. Enter your email and a password (minimum 8 characters).
3. Enter the 6-digit code sent to your email. The code is valid for 15 minutes; after 5 wrong attempts request a new one. **Kirim ulang kode** becomes available after 60 seconds. Check the spam folder if it does not arrive.

If you log in with an account that is not verified yet, you are taken to the verification step again.

**Forgot your password?** On the login page choose **Lupa password?**, enter your email, then enter the emailed code together with a new password.

You stay logged in for 7 days. Your browser's time zone is saved on every login, so dates follow where you are.

### 2. First steps (onboarding)
On the **Dashboard** page a checklist shows what is left to do:
1. **Tambah rekening** (add an account)
2. **Hubungkan WhatsApp** (link your number). No bot number yet? Use the **Chat** tab instead ([section 8](#8-chat-on-the-web-no-bot-number-needed)).
3. **Catat transaksi pertama** (record your first transaction)

It disappears once you have an account and a linked number, or as soon as you have recorded any transaction.

### 3. Accounts (rekening)
An account is anywhere you keep money: a bank (BCA, Mandiri), an e-wallet (GoPay, OVO, DANA) or cash (Tunai).

- **Add:** **Tambah** → **Rekening**, enter a name and the starting balance (may be 0, or negative for e.g. a credit card).
- **Edit:** click the account in the **Rekening** card. Changing the balance here sets it directly and does not create a transaction.
- **Delete:** in the same dialog. An unused account is deleted after a confirmation. If transactions or Utang-piutang records still use the account, the dialog says how many and offers **Hapus rekening & N transaksi** (and/or **N catatan utang-piutang**): the account goes together with all of them. Transfers to or from other accounts are undone, so those accounts get their balance back, exactly as if you had deleted each transaction yourself. A record that used the account (as its main account, or because a payment went into it) is deleted whole, as with its own trash button: payments that went into other accounts are taken back out, and the expense recorded when it was settled leaves the reports.

Use the names you would type in chat. The bot matches them loosely (`Go-Pay`, `gopay` and `GO PAY` are the same account; `cash` also matches `Tunai`).

### 4. Link your WhatsApp number
1. Click **Nomor WhatsApp** in **Pengaturan**, or **Hubungkan** in the onboarding checklist.
2. Optionally enter your number (`0812...`, `62812...` or `+62 812...` all work). If you do, only that number can use the code.
3. Press **Buat QR**.
4. Scan the QR with your phone camera. WhatsApp opens a chat with the bot with `VERIFIKASI <code>` already typed. Press **Kirim** (Send).
   - On a phone you can press **Buka WhatsApp** instead of scanning.
   - You can also type the message shown under the QR to the bot's number yourself.
5. The dialog shows **Berhasil** as soon as the bot receives the message, and the bot replies in WhatsApp.

The code is valid for 10 minutes. Later you can open the same menu to **Ganti nomor** (change number) or **Putuskan** (unlink).

If the dialog says the bot is offline, ask the admin to connect the bot first.

#### How number linking works
It works like an OTP, but in the other direction: instead of the server sending you a code, **you send the code to the bot**. WhatsApp tells the bot the real sender number, which cannot be faked, so sending the code proves you own that number.

- The code is 6 random characters from a secure random generator (~1 billion combinations). Easily confused characters (0/O, 1/I) are not used.
- It is valid for 10 minutes and can be used once.
- A number that sends 5 wrong codes is blocked for 10 minutes.
- One number can belong to only one account.
- The bot never has to message an unknown number first, which avoids WhatsApp spam blocks and SMS costs.

Numbers are stored as `62xxxxxxxxxx`.

### 5. Budgets (anggaran)
A budget is a monthly spending limit for one category.

- **Add:** **Tambah** → **Anggaran**, choose a category and the limit per month. Setting a budget for a category that already has one updates it.
- **Edit or delete:** click the budget in the **Anggaran** card. Deleting a budget does not delete transactions.
- Progress bars show spent / limit for the selected month: **Hampir habis** (almost used up) from 80%, **Melebihi** (over) from 100%.

Categories: Makanan (`FOOD`), Transportasi (`TRANSPORT`), Belanja (`SHOPPING`), Tagihan (`BILLS`), Kesehatan (`HEALTH`), Hiburan (`ENTERTAINMENT`), Lainnya (`OTHER`), and Pemasukan (`INCOME`) for income. There is no lending/debt category: use the [Utang-piutang page](#11-utang-piutang-page).

### 6. Record transactions via WhatsApp
From your linked number, send a message to the bot. Just type naturally and mention the amount and the account:

| You send | Recorded as |
|---|---|
| *50k makan siang bca* | Expense Rp 50.000, Makanan, from BCA |
| *bayar gojek 20k pake ovo* | Expense Rp 20.000, Transportasi, from OVO |
| *beli bensin goceng cash* | Expense Rp 5.000 from Tunai |
| *gajian 5jt masuk ke bca* | Income Rp 5.000.000 to BCA |
| *transfer 100rb dari bca ke gopay* | Transfer Rp 100.000, BCA → GoPay |
| *talangin makan Budi 150rb pakai bca* | Talangan Rp 150.000 from BCA for Budi on the Utang-piutang page (not spending yet) |
| *Budi bayar utang 150rb ke gopay* | Budi ticked as paid on his open talangan, Rp 150.000 into GoPay |

The bot replies, for example:

```
Berhasil! Rp 50.000 untuk Makan siang telah dicatat dari rekening BCA.
Sisa saldo BCA: Rp 950.000
(Tercatat pada: 02 Nov 2026, 12.30)
```

Other replies you may get:

| Reply | Meaning and what to do |
|---|---|
| *Tercatat sebagai DRAFT ... ⚠️* | The bot was not sure. Check it in **Perlu ditinjau** on the web; the balance changes only after you confirm |
| *Rekening "X" tidak ditemukan. Rekening Anda: ...* | That account does not exist. Send again with one of the listed names, or add the account on the web |
| *Anda belum punya rekening ...* | Add at least one account on the web first |
| *Dibayar pakai rekening apa? / Masuk ke rekening mana? / Berapa nominalnya?* | Something is missing. Just answer briefly (e.g. *OVO* or *25rb*) within 10 minutes; the bot reads it together with your previous message |
| *Tolong sebutkan rekening sumber dan tujuan untuk transfer ini* | A transfer needs two different accounts; answer e.g. *dari BCA ke OVO* |
| *Halo! Nomor ini belum terhubung ...* | This number is not linked to an account yet; see step 4 |

#### Lending and debt (utang-piutang)
Talangan and debts are recorded on the [Utang-piutang page](#11-utang-piutang-page), also from WhatsApp:

| You send | What happens |
|---|---|
| *talangin makan malam Budi 150rb pakai BCA* | New talangan (Makanan) for Budi; Rp 150.000 leaves BCA now, not counted as spending |
| *ditalangin Sinta tiket 75rb* | New debt to Sinta; no balance changes |
| *pinjam dari Sinta 500rb masuk BCA* | New debt to Sinta; Rp 500.000 comes into BCA |
| *Budi bayar utang 50rb ke gopay* | Budi is ticked as paid (Rp 50.000 into GoPay) on his only open talangan |
| *bayar utang ke Sinta 75rb pakai BCA* | Sinta is ticked on your only open debt to her (Rp 75.000 out of BCA) |

- If the person is on several open records, or on none, the bot records nothing and asks you to tick it on the web.
- Nothing counts as spending until you settle the record on the web.

Sending the same message twice by accident is fine to retry: a single WhatsApp message is never recorded twice.

### 7. WhatsApp recap
Send `/rekap` or `/recap` to the bot to get this month's summary (in your time zone) without opening the dashboard and without using AI credits:
- Total income and total expenses
- Net cash flow
- Open Utang-piutang: what others still owe you and what you still owe, when there is any
- Current balance of every account
- Every budget with spent / limit and status (Aman ✅ / Over ⚠️)

### 8. Chat on the web (no bot number needed)
The **Chat** tab (sidebar; on a phone: the bottom bar) talks to the same bot as WhatsApp, straight from the dashboard. Use it when the WhatsApp bot has no number yet, is offline, or when you are on a laptop anyway.

- Type like on WhatsApp: *makan siang 25rb pakai BCA*, *gajian 5jt masuk ke bca*, *transfer 100rb dari bca ke gopay*, or `/rekap`. All examples and replies from [section 6](#6-record-transactions-via-whatsapp) and [section 7](#7-whatsapp-recap) apply.
- An empty chat offers a few example messages; tap one to send it.
- **Enter** sends, **Shift+Enter** starts a new line. Messages are up to 500 characters, 20 per minute.
- Recorded transactions show up right away in **Dashboard**, **Transaksi** and, when the bot was unsure, **Perlu ditinjau**.
- You do not need to link a WhatsApp number; you are already logged in, so the bot knows it is you.
- The conversation is saved (the latest 100 messages are shown). The trash icon clears it; recorded transactions stay.
- If sending fails, your text goes back into the input so you can try again.
- On a phone the chat fills the screen like a messaging app; while the keyboard is open, the bottom bar hides so the input stays right above the keyboard (it comes back when the keyboard closes).

### 9. Dashboard (overview)
- **Month switcher** at the top: go to earlier or later months (transactions can be dated ahead, e.g. December), **Bulan ini** jumps back to the current month.
- **Saldo total**: the sum of all accounts plus the market value of your investments (live, in rupiah). The Rekening card lists **Investasi** under the accounts; click it to open the Investasi page. Its eye icon hides only this number.
- **Pemasukan / Pengeluaran / Selisih**: income, expenses and their difference for the month. Each has its own eye icon to hide it, separate from the balance toggle and remembered in this browser.
- **Every section has its own eye**: Saldo total, Pemasukan, Pengeluaran, Selisih, the Rekening card, the Utang-piutang card, on the Utang-piutang page the totals and the list, and on the Investasi page the summary, the allocation and the holdings. Hiding or showing one never changes another; each choice is remembered in this browser.
- **Showing a hidden amount asks for your password** every time (checked by the server, at most 10 tries per minute). Hiding needs no password. This keeps the numbers from someone glancing at or picking up your screen; it is not encryption, since the data is still loaded in the page.
- **Arus kas**: running total of income minus expenses through the month.
- **Pengeluaran harian**: spending per day. If you have budgets, a dashed line shows the average daily budget.
- **Per kategori**: top 5 categories plus "Lainnya", switchable between expenses and income, with amounts and percentages.
- **Rekening** and **Anggaran** cards: click an item to edit it. The Rekening card has its own eye icon, separate from Saldo total.
- **Utang-piutang** card (only while a record is open): what others still owe you and what you still owe. **Detail** opens the page.

Only confirmed transactions are counted; drafts waiting for review are not. Talangan and debt payments are not counted as income or spending until their record is settled.

### 10. Dashboard: Transaksi (ledger)
- **Pilih tanggal**: a calendar of the selected month. Dots mark days with expenses (dark) and income (green). Click a day to show only that day; click again or **Semua tanggal** to show the whole month.
- **Daftar transaksi**: date and time, description, category, account and amount (income in green with +, expenses with −). Choose 10, 15, 50 or 100 per page.
- **Filter**: search the description or the original chat message, and pick a type (Pengeluaran / Pemasukan / Transfer), a category (e.g. Makanan) and an account. Filters combine with each other and with the selected day, and stay when you switch months. While a filter is on, a line shows how many transactions match and their total spending and income (e.g. "all Makanan this month"; talangan and debt payments are listed but not in these totals), and the calendar dots only show matching days. On phones the three dropdowns sit behind the **Filter** button. **Hapus filter** clears them.
- **Add manually:** **Tambah** → **Transaksi**. Choose Pengeluaran / Pemasukan / Transfer, amount, category, an optional description, account(s), and date & time (also for past dates).
- **Edit** (pencil) or **delete** (trash) a transaction. Balances are corrected automatically, e.g. deleting an expense gives the money back to the account.
- Rows from the Utang-piutang page have a label: **Talangan** / **Utang** (money moved, not counted yet) or **Utang-piutang selesai** (in the reports, the balance did not change again). They are changed from that page only (the handshake icon opens it).

### 11. Utang-piutang page
Menu **Utang-piutang** (phone: **Utang**). For money you paid for others (**Piutang / Talangan**) and money you owe (**Utang**). Balances are always real: money moves the moment it moves. Only the real expense reaches the reports, when you settle the record.

**Example: dinner Rp 400.000 paid with BCA for you and three friends.**
1. **Catat** → **Piutang / Talangan**: title *Makan malam*, total Rp 400.000, category Makanan, **Ditalangi pakai** BCA, and the people: Andi, Budi, Citra (Rp 100.000 each; **Bagi rata (termasuk aku)** fills that in). BCA goes down Rp 400.000 right away; nothing is counted as spending yet.
2. Andi transfers to GoPay: tick **Andi**, enter what he actually paid (Rp 100.000), choose **GoPay** and the date. GoPay goes up right away (not income). Unticking undoes it and the balance goes back.
3. Citra never pays: press **Selesaikan**. The confirmation shows *Total awal*, *Total dibayar* and the *Selisih*: here Rp 200.000 (your Rp 100.000 + Citra's Rp 100.000) becomes an expense on Makanan, dated on the record's date, without changing a balance again.
4. Made a mistake? **Buka kembali** removes that expense (balances stay as they are) and the record can be changed again.

**Utang** (you owe): choose **Utang**, the people you owe and the amount.
- Someone paid for you: leave **Uang pinjaman masuk ke rekening saya** off; no balance changes. When you pay them back, tick them and choose the account it left from.
- A cash loan into your account: turn it on and choose the account; it goes up right away. Repaying a loan is not spending, so **Catat yang kubayar sebagai pengeluaran** is off by default.
- Settling records what you paid as an expense (when that option is on).

**More:**
- When others paid more than the total, settling can record the excess as income (report only).
- Top cards: **Piutang aktif** (what others still owe you), **Utang aktif** (what you still owe), and how many records are open. Their expected shares count, or the total when no shares are set.
- **Belum selesai / Selesai** tabs, **Semua / Piutang / Utang**, and search by title or name.
- Pencil to edit an open record (total, account, date and people; the balance follows), trash to delete it, open or settled (every balance change is undone; for a settled record the expense or income recorded when settling leaves the reports too). A person who already paid can't be removed until unticked.
- An account used by a record can't be deleted until the record is changed or deleted.
- The totals and the list have their own eye icon.

### 12. Investasi page
Menu **Investasi**: your stocks and crypto across platforms, with live prices. Buying or selling here never changes an account balance (record the transfer to Stockbit or Pluang as a normal transaction if you want); the market value of what you hold is counted in **Saldo total**.

- **Tambah aset** (or **Tambah** → **Aset investasi**): choose **Saham Indonesia**, **Saham US** or **Crypto**, the ticker (**BBCA**, **NVDA**, **BTC**; for IDX stocks without `.JK`), the platform (Stockbit, Pluang, ... or any name), the quantity and the average buy price. The name is filled in automatically; an unknown ticker is refused.
  - **Saham Indonesia** is counted in **lots** (1 lot = 100 shares) and priced per share in rupiah. 10 lot at Rp 9.000 is a cost of Rp 9.000.000.
  - **Saham US and crypto** accept decimals (*0,025* BTC, *1,54* NVDA). Choose whether you bought in **USD** or in **Rupiah** (e.g. crypto on Indodax).
  - For crypto the CoinGecko id is found from the ticker (the biggest coin with that symbol). If a ticker is shared by several coins, type the id from the coin's coingecko.com address.
  - The same ticker on another platform is a separate row; on the same platform use **Beli** instead.
- **Chart** (the candles icon, or click the ticker; on a phone tap the row) opens that asset on the **Chart** page.

### Chart page

**Chart** in the sidebar (on a phone: open an asset from Investasi) shows one of your assets full screen, laid out like TradingView. Without a chosen asset it opens the one you viewed last. The sidebar starts as icons here to leave the chart the width; its button at the top expands it, and the chart page remembers that separately from the other pages.

- **Top bar**: the ticker (click it to switch to another asset), the interval (**5 menit**, **15 menit**, **1 jam**, **4 jam**, **Harian**, **Mingguan**, **Bulanan**; one pop-up when the window is narrow), the chart type (candles, hollow candles, Heikin Ashi, bars, line, area), **Indikator** (Volume, MA 20/50/200, EMA 20, Bollinger Bands, RSI and MACD in their own panes, and your average buy price), **Gambar** (the drawing tools, on phones and tablets), **USD/IDR** for dollar assets, a screenshot, full screen, the side panel, and **Ubah**.
- **Chart**: scroll the mouse wheel (or pinch) to zoom, drag to move back in time, drag the price or time axis to stretch it, double-click an axis to reset it. The legend at the top left shows **Buka**, **Tertinggi**, **Terendah** and **Tutup** of the bar under the mouse, the indicator values (the x removes one) and the **JUAL**/**BELI** buttons; the chevron folds it (folded by default on phones). The last bar follows the live price, with a countdown to the bar's close under the price label.
- **Drawing toolbar** (left, laptop and larger). Each button shows the last tool of its group; the small arrow next to it lists the others:
  - **Kursor**: cursor (select, move) and eraser (click a drawing to delete it).
  - **Garis**: trend line, arrow, ray, extended line, horizontal line, horizontal ray, vertical line, cross line.
  - **Kanal dan Fibonacci**: parallel channel (two points, then the width), Fibonacci retracement, trend-based Fibonacci extension.
  - **Bentuk**: rectangle, ellipse, triangle, brush (press and drag).
  - **Anotasi**: text, arrow marks up and down.
  - **Prediksi dan ukur**: long and short position (entry, then target; the stop is mirrored and can be dragged; shows target, stop and the reward/risk ratio), price range, date range, date and price range.
  - Then magnet (points snap to the bar's open/high/low/close), keep drawing (stay on the tool), lock and hide the drawings, zoom, reset the view (Alt+R) and delete all drawings.
  - Click a drawing to select it: drag it, or drag its round handles; the bar on top changes its color, edits a text, or deletes it (or press Delete). Escape cancels a drawing in progress.
  - Drawings are kept in this browser per asset, in the asset's own prices, so they show on every interval and in rupiah too.
- **Resizing**: drag the edge between the drawing toolbar and the chart (wider shows the tool names; drag it nearly closed to hide it), between the chart and the side panel, and between the watchlist and the details. The arrow keys move a focused edge, a double click goes back to the usual size. The sizes are remembered.
- **Bottom bar**: ranges **1 hari**, **5 hari**, **1 bulan**, **3 bulan**, **6 bulan**, **Tahun ini**, **1 tahun**, **5 tahun**, **Semua** (one pop-up when narrow), which pick a fitting interval and show that span; your clock; **Persen** and **Logaritmik** scales and **Otomatis**.
- **Right panel**: **Daftar pantau** with all your assets (name, platform, price and change; click one to switch), then the asset's details: price, change, market open/closed and session, volume against the 30-day average, **Ringkasan analisis** (what the numbers say, written out), **Posisi Anda**, **Statistik utama** (day and 52-week ranges, previous close, market cap, supply and all-time high for crypto, 30-day volatility), **Kinerja** (1 week to 1 year and year to date) and **Analisis teknikal** (TradingView-style gauges for the summary, oscillators and moving averages on 1 hour to 1 month, every indicator with its signal, and classic pivot points). The analysis is plain arithmetic on past prices, not investment advice; no AI service is involved.

- **Beli/jual** (JUAL/BELI on the chart, or Jual/Beli in the side panel): record a buy or a sell with its price and date. A buy recomputes the average price; a sell keeps it and shows the realized profit or loss. The dialog also shows the history. Sold-out assets stay in the list as *Terjual habis*.
- **Pencil**: correct the quantity, average price, platform or name directly (not recorded in the history), or delete the asset with its history.
- **Portofolio**: value, cost and profit/loss in rupiah and percent (green for profit, red for loss), and the USD/IDR rate used. USD assets are converted with the live rate.
- **Alokasi**: a donut by **Jenis aset** or by **Platform**, with the share and amount of each.
- **Aset** table: filter by type (IDX / US / Crypto), platform and ticker. Columns: ticker and name, platform, quantity, current and average price, value (in the asset's currency and in rupiah) and profit/loss. On phones and tablets it is a list.
- **Prices are live**: the page asks every 10 seconds while it is open (and on the Dashboard, for Saldo total), a price that moves flashes green or red, and each asset shows its change today (24 hours for crypto). There is no refresh button. Sources: Yahoo Finance for IDX (with `.JK`, delayed by the exchange) and US stocks and USD/IDR; Binance for crypto, CoinGecko and then Yahoo for coins Binance doesn't list. When a source is down the page says which one, the last saved price is used and marked with a yellow sign; an asset without any price yet is valued at its buy price.

### 13. Dashboard: Perlu ditinjau (review inbox)
Messages the bot was not sure about (confidence below 85%) appear here, with a counter on the menu. Each item shows the original WhatsApp message, the amount, the bot's confidence, the type, category and account.

- **Konfirmasi**: record it and update the balance.
- **Ubah**: correct it first (amount, category, accounts, date).
- **Hapus**: discard it, or **Hapus semua** to clear the whole list. Drafts never affected any balance.

### 14. Pengaturan (Settings) and the sidebar
**Pengaturan** sits at the foot of the sidebar (on a phone: the gear at the top right). It is grouped like the Settings app on an iPhone:
- **Tampilan**: **Tema** (Sistem follows the device, Terang, Gelap), **Bahasa** (Bahasa Indonesia or English, for the whole website; the WhatsApp bot and messages from the server stay Indonesian), and **Sidebar ringkas** (icons only).
- **WhatsApp**: **Nomor WhatsApp** (link, change or unlink your number) and, for admins, **Bot WhatsApp** with its status.
- **Privasi**: **Sembunyikan semua angka** hides every amount at once; each section's eye shows it again (with your password).
- **Chart**: **Kembalikan tata letak chart** resets interval, indicators, panels and sizes (drawings stay).
- **Akun**: your email and **Keluar** (sign out).

The **sidebar** (tablet and desktop) collapses to a rail of icons or expands with the names: the button at its top, or **Sidebar ringkas**. Names show as tooltips while it is narrow. The choice is remembered in the browser.

### 15. Troubleshooting the bot (admin)
Everything below is in the **Bot WhatsApp** dialog (**Pengaturan**, then **Bot WhatsApp**). What it offers depends on the bot's state:

| Bot state | Pengaturan | Actions |
|---|---|---|
| Linked | Online (green) | **Ganti nomor bot** (change number): logs the bot out of this number and shows a new QR for another number. **Cabut nomor bot** (unlink): logs out and turns the bot off |
| Waiting for a scan | Offline (red) | Scan the QR. **Reset sesi** if the QR doesn't appear; **Matikan bot** to turn the bot off instead |
| Unlinked | Dicabut (red) | **Hubungkan bot** (link the bot) turns it back on and shows a QR |

- **Unlinking** removes the bot from *Linked devices* on the bot's phone and keeps it off, also after server restarts and releases. While it is off, users cannot record anything through WhatsApp; no data is deleted.
- **Changing the number** also logs the old number out, so the bot disappears from that phone's *Linked devices*.
- If the bot is removed from *Linked devices* on the bot's phone, the API notices, clears the session and shows a new QR.
- **If the dashboard itself is not reachable**, delete the stored session (it lives in the `WhatsAppAuth` table) and restart the API:
  - Development, **Windows (cmd):** `reset_whatsapp.bat` · **PowerShell:** `./reset_whatsapp.ps1`
  - Production (on the VPS): `dc exec -T postgres psql -U whatsmon -d whatsmon -c 'DELETE FROM "WhatsAppAuth";' && dc restart api`, then scan the QR from `dc logs -f api`
- **OTP email not arriving:** check the `SMTP_*` (or `BREVO_API_KEY` / `MAIL_FROM`) values and the API logs (`docker logs whatsmon-api`). Port 465 needs TLS, port 587 uses STARTTLS.

---

## Development

```bash
docker compose up --build -d          # start everything
docker logs whatsmon-api -f           # API logs + WhatsApp QR code
docker compose stop                   # stop (data is kept)

cd backend/api && npm test            # unit tests
cd backend/api && npm run test:auth-state   # WhatsApp session store (real Baileys, no database)
cd frontend && npm run lint && npm run check:i18n && npm run build
```

**Animation layer** (`frontend/src/components/motion/`). Each element is animated by one library only:
- **Lenis** (`SmoothScrollProvider.tsx`): smooth wheel scrolling of the window (the sidebar is `fixed`, the page scrolls normally, so no wrapper/content is needed). Mouse and trackpad only; off on touch screens, on the chart and chat pages, and with *Reduce motion*. Driven by GSAP's ticker; stops while a dialog locks the page; resets to the top when the tab changes. Elements that scroll by themselves carry `data-lenis-prevent` (wide tables: `data-lenis-prevent-horizontal`).
- **GSAP + ScrollTrigger** (`gsap.ts`, `useGSAP` everywhere, so animations are reverted on unmount and safe under StrictMode): `AnimatedNumber` (count-up on first show, 0.6 s), `useReveal` (cards with `data-reveal` (every `Card` unless `reveal={false}`) rise in once with `ScrollTrigger.batch`), `AnimatedBar` (progress fills with `scaleX`), `PriceFlash`.
- **Motion** (`primitives.tsx`): `ActiveIndicator` (`layoutId` thumb of segmented controls and the sidebar's chosen row), `MotionListItem` with `AnimatePresence` (debt records, people in the debt form), the toast. `MotionConfig reducedMotion="user"`.
- Dialogs, pop-up menus and selects keep Base UI's own transitions (focus trap, Escape and screen readers stay as they are). Timing: 150-250 ms for small things, about 300 ms for entrances, 600 ms for numbers; only `transform` and `opacity` are animated.

**Translations:** every text in the web app is written in Indonesian and passed through `tr()` from `frontend/src/lib/i18n.tsx`; the English text lives in `frontend/src/lib/i18n-en.ts`, keyed by the Indonesian one (`{name}` placeholders stay as they are). A text without an English entry simply shows in Indonesian. `npm run check:i18n` lists texts that have none, so add one with every new text.

The API is reachable directly on `http://127.0.0.1:3001` for debugging (`API_HOST_PORT`; 3000 is often taken by other tools such as Grafana). Normal traffic goes through Nginx on port 80. The API container has no hot reload; rebuild or restart it after backend changes.

**End-to-end tests** use real HTTP and a real PostgreSQL; WhatsApp, email and Gemini are faked. They wipe all tables, so always use a **separate** database:

```bash
docker run -d --name whatsmon-testdb -e POSTGRES_PASSWORD=test -p 54329:5432 postgres:17
DATABASE_URL=postgresql://postgres:test@localhost:54329/postgres npx prisma migrate deploy
TEST_DATABASE_URL=postgresql://postgres:test@localhost:54329/postgres npm run test:e2e
```

**Migrations** live in `backend/api/prisma/migrations` and are applied automatically (`prisma migrate deploy`) when the API container starts, directly on `postgres-master` (`MIGRATE_DATABASE_URL`) because Prisma Migrate does not work through Pgpool. The Prisma client is regenerated on start too. To create a new migration after editing `schema.prisma`:

```bash
docker compose exec api npx prisma migrate dev --name <name>
```

*Note: `NODE_OPTIONS=--dns-result-order=ipv4first` is set in Docker Compose so Node's `fetch` resolves Google APIs without IPv6 hangs.*

---

## Project history

### Phase 2: Category intelligence
- Regex fast path for strict templates (e.g. `50k makan siang bca`).
- `@google/generative-ai` with Gemini **structured output (JSON schema)** to turn messy slang into transaction data. Model: `gemini-3.6-flash`.
- **Context-aware prompting:** the user's own account names (e.g. BCA, OVO) are injected into the prompt so the model matches real accounts.
- **Retry:** a failed Gemini call (e.g. `fetch failed`) is retried once after 1 second, then the regex parser takes over. *(Phase 12: a quota error (429) is no longer retried.)*
- **Conversational fallback:** casual chat or help requests ("Halo", "cara pakai") get a friendly reply instead of a parsing error.
- **Anti-loop:** the bot never answers its own messages. Ids of sent messages are remembered, and every reply also ends with an invisible zero-width space (`​`) marker as a fallback.
- **Access control:** messages are processed only for numbers linked to a verified account; groups, status broadcasts and strangers are ignored.
- The WhatsApp connection survives forced resets without crashing the server (no more 502 Bad Gateway), and the QR dialog polls every 2 seconds for a near-instant QR.

### Phase 3: Transaction service
- Prisma schema for users, accounts and transactions, with ACID balance updates.
- Prisma 7 with the `@prisma/adapter-pg` driver.
- *(Originally a separate `transaction-service`; merged into the modular monolith in phase 7.)*

### Phase 4: WhatsApp integration
- `@whiskeysockets/baileys` turns the server into a WhatsApp Web client, without Meta Cloud API or Twilio.
- QR login from the dashboard and the Docker logs.
- Support for WhatsApp's Local Identifier (`@lid`) sender addresses.

### Phase 5: Next.js dashboard and inbox
- Mobile-first UI with Next.js App Router, Tailwind CSS, shadcn/ui and Recharts.
- `confidenceScore` and `TransactionStatus`: AI results with confidence below 0.85 become `NEEDS_REVIEW`.
- **Review inbox** with confirm, edit, delete and delete all; confirming applies the balance change atomically.
- **Analytics:** cash flow, daily spending with the daily budget line, category breakdown and budget progress.
- **Privacy mode:** an eye icon on each key figure (total balance, income, expense, difference) hides it with one click; each choice is remembered in this browser.
- **Budget** model per user and category with CRUD API.
- **Calendar filter** in the ledger, backed by separate monthly and paginated queries.
- **Full manual CRUD** with balance safety (deleting an expense restores the balance), including date and time for backdating.
- **Add menu** for transactions, accounts and budgets.
- Uppercase category codes everywhere so AI categories and budgets always match.
- Split into `HomeView`, `LedgerView`, `InboxView`, navigation and dialogs; tabs kept in the URL (`/?tab=transactions`).
- Live refresh so WhatsApp transactions appear without reloading.

### Phase 6: Dockerization and reverse proxy
- Multi-stage `Dockerfile` using Next.js `standalone` output.
- Nginx on port 80 routes `/api/` to the API and `/` to the frontend.

### Phase 7: Modular monolith and security hardening
- `gateway`, `parser-service` and `transaction-service` merged into one NestJS app (`backend/api`) organised by feature modules; internal TCP transport removed.
- Ownership checks on every account, budget and transaction change (fixes cross-user access by id).
- `/api/whatsapp/status` requires login (QR only for admins); reset and `/parse` require auth.
- DTO validation (`class-validator`), rate limits on auth endpoints, secure random OTPs with an attempt limit, no hardcoded JWT secret.
- Balance logic consolidated in `transactions/ledger.ts` with unit tests; migrations run automatically on startup; end-to-end tests against a real database.

### Phase 8: Accounts, number linking and UI redesign
- Registration with email only; forgot/reset password.
- WhatsApp numbers linked after login with a `wa.me` QR code and `VERIFIKASI <code>`; numbers normalised to `62...`.
- Redesigned minimalist black-and-white UI: sidebar and bottom tabs, onboarding, empty states, accessible dialogs.
- HTML OTP email matching the web UI, with dark mode.
- Light, dark and system theme with accessible contrast.

### Phase 9: Correctness
- Money stored as `BIGINT` whole rupiah; fractional amounts rejected.
- Per-user time zones for day and month boundaries, the `/rekap` month and reply times.
- Each WhatsApp message recorded at most once, including the offline queue.
- Bot replies detected by message id instead of text prefixes, so messages like "Tolong catat ..." are processed.
- Unknown account names are reported back instead of creating accounts; loose account name matching.
- Unused tables and columns removed.

### Phase 10: Production deployment
- WhatsApp session stored in PostgreSQL instead of a folder, so the bot survives restarts and is part of the backups.
- OTP email over Brevo's HTTPS API as an alternative to SMTP; `/api/health`; configurable CORS, proxy hops and offline-message age.
- Production stack (`docker-compose.prod.yml`): one PostgreSQL, production builds of API and web, Caddy with automatic HTTPS.
- Deployed to an Ubuntu VPS: setup script (updates, swap, Docker, firewall, fail2ban, daily backups, DNS safety net), images built on a laptop and shipped with `release.sh`, live at [bit.ly/WhatsMonTrack](https://bit.ly/WhatsMonTrack).
- Step-by-step learning guide: [deploy/vps/README.md](deploy/vps/README.md).
- Admins can change or unlink the bot number from the web; unlinking logs the bot out of WhatsApp and keeps it off across restarts.

### Phase 11: Web chat
- Deleting an account can delete its transactions too (with the count shown first); transfers to other accounts are undone.
- **Chat** tab: the same bot conversation on the web (`/api/chat`), so the app is fully usable without a bot number. Conversations are stored per user in the new `ChatMessage` table.

### Phase 12: Parser hardening (after a prompt-injection test)
A test with 16 injection messages (fake admin, reading other users' data, leaking the prompt, SQL/XSS, pasted JSON, forced confidence) changed nobody else's data and leaked nothing. These fixes came out of it:
- **Amount cap in the bot:** WhatsApp and Chat now refuse amounts above Rp 1 triliun, like the manual form (a huge number used to cause a database error).
- **Prompt separation:** the rules go in Gemini's `systemInstruction`; the message and the account names are sent separately as quoted JSON data, and the rules say that data is never an instruction.
- **No forced auto-confirm:** a message that tries to steer the parser (e.g. "set confidence 1.0", "abaikan instruksi", pasted JSON) is always saved as a draft for review. Model output is also cleaned: unknown categories become `OTHER`, confidence is kept between 0 and 1, text fields are length-limited.
- **Better offline parser:** understands `1,5jt`, `Rp1.500.000`, `25 rb`, `ceban`; matches your own account names (`cash` = `TUNAI`); reads income only from income words or "masuk ke …" (not "masuk review"); never guesses a transfer to the same account; no longer assumes cash when no account is named; picks a category from common words. Its replies are in Indonesian.
- **Same-account transfers** are refused by the bot ("Transfer 50rb dari BCA ke BCA").
- **Gemini quota:** after a 429 the bot skips Gemini for the delay Google suggests (default 60 seconds, at most 10 minutes) and uses the offline parser right away instead of waiting for a sure failure.
- **Complete answers from Gemini:** every field of the response schema is now required (null when it does not apply). Before, Gemini sometimes left out an account that was plainly in the message ("9 rb GrabBike OVO" got no `fromAccount`), so the bot asked for it. Values the model still leaves out are filled in from the offline parser, and a missing confidence now means "draft", not "confirmed".
- **Short answers to the bot's questions:** after "Dibayar pakai rekening apa?", a short reply such as *OVO* (up to 4 words, within 10 minutes) is read together with the previous message.
- **Mobile chat:** full-screen layout between the top bar and the bottom tabs, tabs hidden while typing, `interactive-widget=resizes-content` so the keyboard shrinks the page instead of covering the input, 16px input text (no zoom on iOS); on the Chat tab the page is exactly the visible screen height (`dvh`), so the top bar cannot scroll away.
- **Responsive audit:** every page and dialog checked at 320, 360, 390, 412, 768, 1024, 1280 and 1536 px wide with long names and large amounts. Fixed: pages that could be dragged sideways on phones (single-column grids now `grid-cols-1`), dialogs too wide on a 320 px phone, the add menu opening off-screen, the transaction table on tablets (list below 1024 px, calendar beside the table from 1280 px), pagination on small phones (icon buttons), stat figures that scale with their tile, 16 px form fields on phones (iOS no longer zooms in), and the bottom bar staying hidden after closing the keyboard with Android's back button.

### Phase 13: Feedback after a few weeks of use
- **Lending and debt (`DEBT`, "Utang-piutang"):** paying for a friend first and being paid back used to show up as a large expense and an income. Now they get their own category, recognised by Gemini and by the offline parser (talangin, bayarin, minjemin, bayar utang, ganti uang, dibalikin, pinjam dari …). Balances still change, but the totals, charts, category breakdown, budgets, the ledger calendar and `/rekap` leave them out; the dashboard and `/rekap` show them separately. A transfer between two of your own accounts stays a transfer.
- **Tambah → Utang-piutang** on the web: the transaction form with the category already set, and only *Uang keluar* / *Uang masuk* to choose from.
- **Eye icon on the Rekening card**, later made independent: every section (Saldo total, Rekening, Pemasukan, Pengeluaran, Selisih, Utang-piutang) has its own eye and asks for the password when shown.
- **Utang-piutang page:** a to-do style list of who owes whom (`DebtNote`, migration `20261112010000_debt_notes`, `/api/debts`): person, direction, amount, paid so far, description, a checkbox for lunas; notes only, never balances. Transactions with category Utang-piutang also get a **Nama orang** (`counterparty`, migration `20261112000000_debt_counterparty`), filled by Gemini, the offline parser or the form.
- **Getting-started steps** are hidden once any transaction has been recorded, even when no WhatsApp number is linked.
- **"Ringkasan" is now "Dashboard"** in the menu and page title.
- **Filters on the Transaksi page:** search, type, category and account, done on the server so paging stays right, with the matching total out/in and calendar dots that follow the filter.
- **Password to show hidden amounts:** every eye icon asks for the account password before showing a hidden amount again (`POST /api/auth/verify-password`, rate-limited). Hiding stays one tap.
- **Months ahead:** the month switcher goes forward too, for transactions dated in a later month.

### Phase 14: Investasi page
- **Holdings and history:** `Investment` and `InvestmentTrade` (migration `20261123000000_investments`), `/api/investments`. IDX stocks in lots, US stocks and crypto with decimals, USD or IDR. Buys recompute the weighted average price; sells store the realized P&L.
- **Live prices without extra dependencies:** the API calls the Yahoo Finance chart endpoint and the CoinGecko simple-price endpoint with `fetch` (one CoinGecko request for all coins, at most 4 Yahoo requests at a time, 8-second timeout). Prices are shared by all users: memory cache for 3 minutes, the last good price stored in `MarketPrice` and served with `stale: true` when a source fails, and a failed source left alone for a minute.
- **Page:** summary, an allocation donut (categorical palette checked for color-vision deficiency, with a labeled legend), the holdings table with filters, and buy/sell and edit dialogs. Its own eye per section. The phone tab bar now has six tabs; the add button stays next to the title on pages without a month switcher.

### Phase 15: Utang-piutang with real-time cash flow
- **The `DEBT` category is gone.** Its transactions, the `counterparty` column and the old to-do style notes (`DebtNote`) are removed (migration `20261124000000_debt_records`; balances were left as they were, that money really moved). The parser no longer has the category; the server refuses it.
- **`DebtRecord` and `DebtParticipant`:** a talangan (RECEIVABLE) or a debt (PAYABLE) with the people involved, their expected share, what they actually paid, into or out of which account, and when.
- **Two flags on `Transaction` keep balances and reports apart:** cash movements of a record have `inReports: false` (the balance changes, the totals, charts, budgets and `/rekap` ignore them); the expense/income made when settling has `affectsBalance: false` (in the reports, no balance change). `applyToBalances` skips `affectsBalance: false`, the single place balances change, so editing, deleting or reopening can never count money twice. These rows are managed from the Utang-piutang page only (409 elsewhere).
- **Settling** records total − paid for a talangan (your share plus what nobody paid), or what you paid on a debt, on the record's category and date; **reopen** removes it.
- **Bot:** Gemini and the offline parser mark lending/debt as LEND / BORROW / REPAID / REPAY with the person, and the bot creates the record or ticks the person on their only open record. `/rekap` shows the open totals.
- **Page:** open totals, Belum selesai / Selesai, type filter and search, a form with a list of people (and an equal split), a checklist with a progress bar, a payment dialog (amount, account, date), and the settle confirmation with the difference.
- **`deploy/vps/reset-data.sh`:** empties the whole database after a backup and a typed confirmation (used once to start over).

### Phase 16: Live prices, charts, investments in Saldo total
- **Live prices:** the page polls every 10 seconds (only while the tab is visible) and the server shares one 10-second cache. Yahoo's spark endpoint prices up to 20 stocks per request with the previous close; crypto comes from Binance (`ticker/24hr`, the list of USDT pairs refreshed every 6 hours), then CoinGecko, then Yahoo `XYZ-USD`. The "Perbarui harga" button is gone.
- **Why a price was missing:** the response names the sources the server could not reach (`unreachable`), and the page says so, so a server that is blocked by a provider is visible instead of a silent "Harga belum tersedia".
- **Chart:** `GET /api/investments/:id/chart` (Binance klines or Yahoo chart, cached 30 seconds for intraday ranges and 5 minutes for the rest), drawn with TradingView's open-source `lightweight-charts`, loaded only when a chart is opened.
- **Saldo total** on the Dashboard includes the live market value of the investments.
- The middle dot separator (·) is gone from the interface; commas instead.

### Phase 17: TradingView-style chart page
- **A page instead of a dialog:** `/?tab=investments&chart=<id>` shows one holding full screen, with the same layout as TradingView: top toolbar, drawing tools, the chart with its legend, the range bar with a clock, and a watchlist plus details panel. Trade and edit dialogs open on top of it.
- **Intervals instead of ranges:** `GET /api/investments/:id/chart?interval=` takes `5m` to `1M` and loads a long history (Binance 1000 bars; Yahoo up to its limits, 4-hour bars built from hourly ones) so the chart scrolls back; the range buttons only move the view.
- **Asset facts:** `GET /api/investments/:id/profile` (Yahoo chart metadata, Binance 24-hour ticker, CoinGecko coin data cached for an hour).
- **Analysis in the browser** (`frontend/src/lib/technicals.ts`): SMA, EMA, Hull, VWMA, Bollinger, RSI, Stochastic, CCI, ADX, Awesome Oscillator, Momentum, MACD, Williams %R, Bull Bear Power, Ultimate Oscillator, Heikin Ashi, pivots, performance and volatility, and the rating rules TradingView documents for its technical ratings.
- **Chart engine fixes:** the library ignores a second click within half a second (it waits for a double click), so drawing clicks are read from pointer events; the trend line preview is updated outside the crosshair event, which would otherwise call itself.

### Phase 18: Chart in the sidebar, pro drawing tools, Apple-style interface
- **Chart page in the sidebar:** `/?tab=chart&id=<holding>` (no id: the asset viewed last). The old `/?tab=investments&chart=<id>` addresses redirect there. On this page the sidebar shrinks to a 64 px rail of icons.
- **Drawings on an SVG layer** (`frontend/src/components/dashboard/chart/drawings.tsx`) instead of chart series: 23 tools in TradingView's groups, selection with handles, moving, recoloring, an eraser, lock and hide, and labels for prices, percentages, bars and durations. Kept per asset in the asset's own currency (`wmt-drawings:<id>` in localStorage); the drawings of the first chart page are moved over once.
- **Resizable layout:** drag (or use the arrow keys on) the edges of the drawing toolbar, the side panel and the watchlist; sizes are remembered in the browser.
- **No abbreviations:** intervals, ranges, scales, the OHLC legend, pivot levels and the watchlist are written out; where a row of buttons doesn't fit, it becomes one pop-up menu (container queries).
- **No TradingView logo on the chart:** the library's license asks for a link to TradingView, which is now in the data sources at the foot of the side panel.
- **Apple-style interface** across the app: San Francisco with Inter as the fallback, Apple's system colors (accessible shades for text), the system blue for actions and focus rings, translucent sidebar and phone bars, pill buttons that dim when pressed, iOS segmented controls, sheets with a blurred backdrop, and pop-up buttons (`frontend/src/components/common/select.tsx`, on Base UI's Select) that open with the chosen item over the button and a checkmark beside it, replacing the browser's own `<select>` everywhere.
- **Fixes:** the profit/loss row no longer squeezes the percentage beside the amount, and percentages of 1000% or more drop the decimals.
- **Deleting Utang-piutang:** settled records have the trash button too and are deleted directly (no reopening first).
- **Deleting an account deletes its Utang-piutang records:** `DELETE /api/accounts/:id` answers 409 with `transactionCount` and `debtCount`; with `?withTransactions=true` the records go too, every movement undone on whichever account it touched. `GET /api/accounts` reports `debtCount` per account.

### Phase 19: Settings page, English, collapsible sidebar
- **Pengaturan (Settings) page** (`/?tab=settings`, `frontend/src/components/dashboard/views/SettingsView.tsx`) in the style of iOS Settings: grouped rows with colored icon tiles, an iOS switch, chevrons where a row opens something. Theme, WhatsApp number, the bot (admin) and signing out moved here from the sidebar and the phone's account menu; new are the language, compact sidebar, hide all amounts and reset the chart layout.
- **Bahasa Indonesia / English** for the whole web app: `tr()` (`frontend/src/lib/i18n.tsx`) with an English dictionary of about 850 texts (`i18n-en.ts`). Tables built when a module loads (labels of intervals, tools, categories) translate through getters, so they follow a change of language. English uses the `en-ID` locale, like an iPhone in English with the region Indonesia: English month names and 4,2K, but Rp 1.250.000 and a 24-hour clock. The server and hydration render Indonesian; the saved language applies right after. `npm run check:i18n` (`frontend/scripts/check-i18n.mjs`) fails when a text has no English entry or the placeholders differ.
- **Collapsible sidebar** on every page: icons only (64 px) or with names (240 px), from the button at its top; the chart page starts narrow and remembers its own choice. The W logo is gone. A red dot on Pengaturan when the WhatsApp bot is offline (admin); the review count is an iOS-style red badge.
- **Apple colors** for the remaining tokens: the chart series tokens are Apple's system green, red, orange, blue and purple (light and dark variants), and the browser bar matches the background (#F2F2F7 / #000000). The unused Geist fonts are no longer loaded.
- **Following Apple's Human Interface Guidelines** for the controls: segmented controls have equal-width segments with words or icons, not both (the theme control shows words, its compact form on the sign-in page icons); every segmented control shares one style. Pengaturan uses inset separators that start where the text starts, one width for the controls beside a row, a value that shortens before its label wraps, and **Keluar** as a red row of the Akun group. The phone tab bar uses short single words in English (Home, Activity, Debts, Invest, Chat, Review) so six tabs fit a 320 px screen.
- **Font:** the app uses San Francisco through the system font stack (`-apple-system`), so Apple devices show SF Pro. Apple's SF fonts from developer.apple.com/fonts are licensed only for mock-ups of interfaces for Apple platforms, which rules out hosting them on a website; other systems therefore get Inter, the closest open font.

### Phase 20: Motion
- Lenis, GSAP with ScrollTrigger and Motion, in `frontend/src/components/motion/` (see Development, *Animation layer*). Smooth wheel scrolling, counting key figures (Dashboard, Investasi, Utang-piutang), cards revealed once as they scroll in, a sliding thumb in every segmented control and a sliding row in the sidebar, progress bars of budgets, categories and payments that fill, live prices that flash green or red, debt records and people that slide in and out, a toast that rises. Dialogs open in 250 ms and close in 150 ms.
- **Switching the language** re-renders in place instead of re-mounting the app: data, scroll position and what is open stay, and the page cross-fades (View Transitions, where the browser has them). Texts are computed while rendering, never memoized; the chart is rebuilt for its localized axes.
- **Pengaturan** is centered as one narrow column (title and groups together); a long email shortens with an ellipsis.
- Checked with the browser: no script errors, numbers count up once and then stay calm through the 10-second price refreshes, smooth scrolling stops under an open dialog and is off on touch screens, the chart and chat pages and with *Reduce motion* (where nothing waits hidden either).
