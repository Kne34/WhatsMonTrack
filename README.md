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
- **Lending and debt (utang-piutang).** *"talangin makan Budi 150rb pakai BCA"* or *"Budi bayar utang 150rb ke BCA"* change the balance but are not counted as spending or income, so the totals show what you really spent and earned.
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
- **Transaksi (ledger):** calendar day filter, paginated list (10/15/50/100 per page), add, edit and delete.
- **Chat:** chat with the bot right on the web, with the same results as on WhatsApp (record transactions, `/rekap`). Works without a bot number or a linked phone; the history is saved and can be cleared.
- **Perlu ditinjau (review inbox):** confirm, edit or delete uncertain bot results, or delete them all.
- **Month switcher**, **Tambah** (add) menu for transactions, accounts and budgets, onboarding checklist for new users.
- **Light, dark or system theme**, without a flash on page load.
- Responsive: sidebar on desktop, bottom tabs on mobile. Refreshes automatically every 15 seconds and when you return to the tab.

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
| `GET /api/accounts`, `POST /api/accounts`, `PUT /api/accounts/:id` | Accounts; the list includes `transactionCount` (transactions that use each account) |
| `DELETE /api/accounts/:id?withTransactions=true` | Delete an account. Without the flag an account still in use gets `409` with `transactionCount`; with it, its transactions are deleted too and other accounts' balances are corrected |
| `GET /api/budgets`, `POST /api/budgets`, `DELETE /api/budgets/:id` | Budgets (POST creates or updates per category) |
| `GET /api/transactions?month&year&day&page&limit` | List transactions; month/day boundaries use the user's time zone |
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
2. Open **Bot WhatsApp** in the sidebar (on a phone: the account icon at the top right). A red dot means offline, green means online.
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
- **Delete:** in the same dialog. An unused account is deleted after a confirmation. If transactions still use the account, the dialog says how many and offers **Hapus rekening & N transaksi**: the account and all of its transactions are deleted. Transfers to or from other accounts are undone, so those accounts get their balance back, exactly as if you had deleted each transaction yourself.

Use the names you would type in chat. The bot matches them loosely (`Go-Pay`, `gopay` and `GO PAY` are the same account; `cash` also matches `Tunai`).

### 4. Link your WhatsApp number
1. Click **Hubungkan WhatsApp** (sidebar, account menu on phones, or the onboarding checklist).
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

Categories: Makanan (`FOOD`), Transportasi (`TRANSPORT`), Belanja (`SHOPPING`), Tagihan (`BILLS`), Kesehatan (`HEALTH`), Hiburan (`ENTERTAINMENT`), Lainnya (`OTHER`), Pemasukan (`INCOME`) for income, and Utang-piutang (`DEBT`) for lending and debt (no budget, see [Lending and debt](#lending-and-debt-utang-piutang)).

### 6. Record transactions via WhatsApp
From your linked number, send a message to the bot. Just type naturally and mention the amount and the account:

| You send | Recorded as |
|---|---|
| *50k makan siang bca* | Expense Rp 50.000, Makanan, from BCA |
| *bayar gojek 20k pake ovo* | Expense Rp 20.000, Transportasi, from OVO |
| *beli bensin goceng cash* | Expense Rp 5.000 from Tunai |
| *gajian 5jt masuk ke bca* | Income Rp 5.000.000 to BCA |
| *transfer 100rb dari bca ke gopay* | Transfer Rp 100.000, BCA → GoPay |
| *talangin makan Budi 150rb pakai bca* | Utang-piutang out Rp 150.000 from BCA (not spending) |
| *Budi bayar utang 150rb ke bca* | Utang-piutang in Rp 150.000 to BCA (not income) |

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
Paying for a friend first, lending money, borrowing, and paying back are not real spending or income, but they do move money. Record them with category **Utang-piutang** (`DEBT`):

| Situation | Type | Example message |
|---|---|---|
| You pay for someone (talangin), lend, or repay your own debt | Out (expense type) | *talangin makan Budi 150rb pakai BCA*, *minjemin Andi 200rb dari gopay*, *bayar utang ke Sinta 100rb BCA* |
| Someone pays you back, or you borrow | In (income type) | *Budi bayar utang 150rb ke BCA*, *Andi transfer ganti uang 50rb ke gopay*, *pinjam dari Sinta 500rb masuk BCA* |

- The account balance changes as usual.
- **Pemasukan**, **Pengeluaran**, **Selisih**, the charts, the category breakdown and the budgets leave them out. The dashboard shows them in a separate **Utang-piutang** card (out, in, and what has not come back this month), and `/rekap` lists them separately.
- Paid for a group and your own share is part of it? Send two messages: your share as a normal expense, the rest as talangan (e.g. *makan 100rb BCA* and *talangin makan teman 200rb BCA*).
- On the web: **Tambah** → **Utang-piutang**, choose **Uang keluar** or **Uang masuk**, the amount, a description (e.g. *Talangin makan Budi*) and the account.
- Already recorded as an expense or income? Open it in **Transaksi** → **Ubah** and change the category to **Utang-piutang**.

Sending the same message twice by accident is fine to retry: a single WhatsApp message is never recorded twice.

### 7. WhatsApp recap
Send `/rekap` or `/recap` to the bot to get this month's summary (in your time zone) without opening the dashboard and without using AI credits:
- Total income and total expenses
- Net cash flow
- Lending and debt (out and in), when there was any, listed apart from the totals
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
- **Month switcher** at the top: go back to earlier months, **Bulan ini** jumps back to the current month. Future months are disabled.
- **Saldo total**: the sum of all accounts. The eye icon hides all balances (remembered in this browser), handy in public.
- **Pemasukan / Pengeluaran / Selisih**: income, expenses and their difference for the month. Each has its own eye icon to hide it, separate from the balance toggle and remembered in this browser.
- **Arus kas**: running total of income minus expenses through the month.
- **Pengeluaran harian**: spending per day. If you have budgets, a dashed line shows the average daily budget.
- **Per kategori**: top 5 categories plus "Lainnya", switchable between expenses and income, with amounts and percentages.
- **Rekening** and **Anggaran** cards: click an item to edit it. The Rekening card has the same eye icon as Saldo total, so balances can be hidden from either place.
- **Utang-piutang** card (only when there is any this month): money out (talangan, lending, repaying), money in (paid back, borrowing) and the difference. These are not part of Pemasukan/Pengeluaran.

Only confirmed transactions are counted; drafts waiting for review are not. Lending and debt (`DEBT`) is not counted as income or spending.

### 10. Dashboard: Transaksi (ledger)
- **Pilih tanggal**: a calendar of the selected month. Dots mark days with expenses (dark) and income (green). Click a day to show only that day; click again or **Semua tanggal** to show the whole month.
- **Daftar transaksi**: date and time, description, category, account and amount (income in green with +, expenses with −). Choose 10, 15, 50 or 100 per page.
- **Add manually:** **Tambah** → **Transaksi**. Choose Pengeluaran / Pemasukan / Transfer, amount, category, an optional description, account(s), and date & time (also for past dates).
- **Edit** (pencil) or **delete** (trash) a transaction. Balances are corrected automatically, e.g. deleting an expense gives the money back to the account.

### 11. Dashboard: Perlu ditinjau (review inbox)
Messages the bot was not sure about (confidence below 85%) appear here, with a counter on the menu. Each item shows the original WhatsApp message, the amount, the bot's confidence, the type, category and account.

- **Konfirmasi**: record it and update the balance.
- **Ubah**: correct it first (amount, category, accounts, date).
- **Hapus**: discard it, or **Hapus semua** to clear the whole list. Drafts never affected any balance.

### 12. Theme and account menu
- **Tema**: Sistem (follow the device), Terang (light) or Gelap (dark). In the sidebar on desktop, in the account menu on phones.
- **Keluar**: log out.

### 13. Troubleshooting the bot (admin)
Everything below is in the **Bot WhatsApp** dialog (sidebar; on a phone: the account icon). What it offers depends on the bot's state:

| Bot state | Sidebar | Actions |
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
cd frontend && npm run lint && npm run build
```

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
- **Eye icon on the Rekening card:** hides account balances without scrolling up to Saldo total (same setting).
- **Getting-started steps** are hidden once any transaction has been recorded, even when no WhatsApp number is linked.
- **"Ringkasan" is now "Dashboard"** in the menu and page title.
