# WhatsMonTrack - WhatsApp Expense Tracker Bot

An LLM-powered WhatsApp bot and Multi-Tenant SaaS platform that allows multiple users to log expenses in natural Indonesian chat shorthand (e.g., *"50k makan siang bca"*) and receive structured tracking, corrections, and monthly summaries from their private dashboards.

## Architecture

The project is fully dockerized and uses a **modular monolith**: one NestJS app split into feature modules.

- **API (`/backend/api`)**: a single NestJS application that
  - connects to WhatsApp via WebSockets (`@whiskeysockets/baileys`),
  - parses natural-language messages with Gemini (regex fallback),
  - exposes the REST API used by the web dashboard (and later the mobile app).
- **Frontend Dashboard (`/frontend`)**: Next.js (App Router) SPA with JWT auth (Login/Register/OTP).
- **Database**: PostgreSQL (Master/Slave replication) behind Pgpool-II, accessed via Prisma.
- **Reverse Proxy**: NGINX (`/` → frontend, `/api` → API).

### Backend modules (`backend/api/src`)

| Module | Responsibility |
|---|---|
| `auth/` | Register, email OTP, login, JWT |
| `accounts/` | Bank/e-wallet accounts (CRUD, ownership checks) |
| `budgets/` | Monthly budget per category |
| `transactions/` | Transactions + `ledger.ts` (the only place that changes balances) |
| `parser/` | Gemini parsing with regex fallback |
| `whatsapp/` | `WhatsAppService` (Baileys socket) + `BotService` (conversation logic, `/rekap`) |
| `common/` | Auth/admin guards, `@CurrentUser()`, config |
| `database/` | `PrismaService` |

Every user-scoped query filters by the `userId` from the JWT, so users can never read or modify each other's data.

## Tech Stack
**Frontend:** Next.js 15, Tailwind CSS, Shadcn UI, Recharts

**Backend:** NestJS, Prisma (`@prisma/adapter-pg`), `@whiskeysockets/baileys`, Google Gemini (`@google/generative-ai`), class-validator, `@nestjs/throttler`

**Infrastructure:** PostgreSQL (master/slave), Pgpool-II, Docker Compose, Nginx

```mermaid
graph TD
    WA[WhatsApp Servers] <-->|WebSockets| API(NestJS API - modular monolith)
    Frontend[Next.js UI] -->|HTTP REST| Nginx(Reverse Proxy)
    Nginx -->|HTTP 3000| API
    API -.->|HTTP| Gemini(Google Gemini API)
    API -->|Prisma adapter-pg| PgPool(PgPool)
    PgPool -->|Write| Master(PostgreSQL Master)
    PgPool -->|Read| Slave(PostgreSQL Slave)
```

---

## Development

```bash
docker compose up --build -d          # start everything
docker logs whatsmon-api -f           # API logs + WhatsApp QR code
cd backend/api && npm test            # unit tests

# end-to-end tests (real HTTP + PostgreSQL; WhatsApp & email are faked).
# Uses a SEPARATE database — all tables are wiped. Example with a throwaway container:
docker run -d --name whatsmon-testdb -e POSTGRES_PASSWORD=test -p 54329:5432 postgres:17
DATABASE_URL=postgresql://postgres:test@localhost:54329/postgres npx prisma migrate deploy
TEST_DATABASE_URL=postgresql://postgres:test@localhost:54329/postgres npm run test:e2e
```

Registration sends **two** codes — one by email and one by the WhatsApp bot to the given number — and the account is only activated when both are entered. This proves the user owns the phone number the bot will serve. Phone numbers are stored everywhere in canonical `62xxxxxxxxxx` form (`src/common/phone.ts`).

Database migrations live in `backend/api/prisma/migrations` and are applied automatically (`prisma migrate deploy`) when the API container starts. To create a new migration after editing `schema.prisma`:

```bash
docker compose exec api npx prisma migrate dev --name <name>
```

*Note: `NODE_OPTIONS=--dns-result-order=ipv4first` is set in Docker Compose so Node's `fetch` resolves Google APIs without IPv6 hangs.*

---

## Getting Started: End-User Guide (How to Use)

If you are a user looking to use the app to track your finances to the fullest, follow this flow:

### 1. Environment Setup
Create a `.env` in the project root based on `.env.example` (and `frontend/.env.example` if present).
Crucially, set `GEMINI_API_KEY`, a long random `JWT_SECRET` (the API refuses to start without it), `ADMIN_EMAILS` (who may see the WhatsApp QR / reset the bot), and the `SMTP` variables (Ethereal email for sending OTPs).

### 2. Start the App & Link WhatsApp
To avoid startup race conditions, we have provided automated startup scripts.
- **Windows (cmd):** Double-click or run `start_app.bat`
- **PowerShell:** Run `./start_app.ps1`
- **Manual/Linux:** You can run `docker compose up -d` but ensure databases are initialized first.

The script will automatically fetch the API logs at the end. Look for the WhatsApp Web QR Code in the terminal and scan it with your WhatsApp app (Linked Devices) to authorize the bot.

### 3. Register and Initialize Dashboard (Accounts & Budgets)
Open your browser and navigate to `http://localhost`.
Since this is a multi-tenant platform, you must first register your account using your email and WhatsApp number. 
An OTP will be sent to your email (check your Ethereal Mail console or configured SMTP service).

After verifying and logging in, set up your baseline data:
- Click the **+** button (Floating Action Menu) on the bottom right.
- **Add Accounts**: Create the accounts you frequently use (e.g., BCA, OVO, Cash) and their current balances.
- **Set Budgets**: Define monthly limits for your categories (e.g., `FOOD`, `TRANSPORT`, `SHOPPING`).

### 4. Log Expenses via WhatsApp
Open WhatsApp and send a message to the bot (or use the "Message Yourself" feature). Just type naturally:
- *"50k makan siang bca"*
- *"bayar gojek 20k pake ovo"*
- *"gajian 5jt masuk ke bca"*

The AI (Gemini) will instantly parse your slang, deduct the balance from the correct account, and record the transaction!

### 5. Monitor and Review
Open the `http://localhost` dashboard to see your financial health update in real-time. 
- **Analytics**: Watch your daily cash flow, cumulative net flow, and budget progress bars.
- **Inbox**: If you type something ambiguous and the AI isn't confident, the transaction will be routed to the **Inbox** tab as `NEEDS_REVIEW`. You can manually correct and confirm it there!

### 6. WhatsApp Recap Feature
You don't need to open the web dashboard to check your budget! Just send `/recap` or `/rekap` to the bot on WhatsApp. 
The gateway will intercept this command instantly (without using LLM credits) and reply with a complete summary of your month:
- Total Income and Expenses
- Net Cash Flow
- Current Balances for all accounts
- Status of all Budgets (Safe/Over)

### 7. Linking and Troubleshooting WhatsApp
The easiest way to link WhatsApp or fix connection issues is directly through the Web Dashboard!

1. Open the dashboard (`http://localhost`).
2. Click the WhatsApp connection badge in the top-left corner (under the app title).
3. If it says **Disconnected**, a QR Code will appear. Scan it using the **Linked Devices** feature in your WhatsApp app.
4. **Stuck or Invalid Session?** If you accidentally log out from your phone or the bot gets stuck, open the same modal and click the red **"Force Disconnect & Reset"** button. This will wipe the backend authentication state automatically and generate a fresh QR Code.

*(Fallback for Terminal users)*: You can also use the automated reset utility if the frontend is completely inaccessible:
- **Windows (cmd):** Double-click or run `reset_whatsapp.bat`
- **PowerShell:** Run `./reset_whatsapp.ps1`

---

## Phase 2: Category Intelligence (Completed)
- Configured NestJS `ClientsModule` for fast TCP communication between the Gateway and Parser Service.
- Implemented a Regex "Fast-Path" for strict standard templates (e.g. `50k makan siang bca`).
- Integrated the `@google/generative-ai` SDK using Gemini's **Structured Outputs (JSON Schema)** to seamlessly parse messy natural language slang into actionable transaction data.
- Upgraded the AI model to `gemini-3.6-flash` for optimal parsing speed and instruction following.
- **Resilient AI Parsing Service**:
  - Implemented an intelligent **Context-Aware RAG (Retrieval-Augmented Generation)** pattern: User's existing account names (e.g., 'BCA', 'OVO') are dynamically fetched and injected directly into the Gemini AI system prompt, eliminating false positives and enforcing 100% strict matching with the actual PostgreSQL database.
  - Hardened with a **Recursive Retry System**: If Gemini throws a temporary network failure (e.g. `fetch failed`), the parser service will automatically intercept the error, sleep, and gracefully retry the request up to 2 times before falling back, drastically improving reliability.
- **Conversational AI Fallback**: Upgraded the Gemini schema to natively detect casual chat or help requests (e.g., "Halo", "/rekap"), falling back to a friendly conversational assistant instead of throwing a parsing error.
- **Anti-Loop Zero-Width Space Architecture**: To absolutely guarantee the bot never replies to its own messages (which causes catastrophic infinite loops), a Zero-Width Space (`\u200B`) is injected as an invisible cryptographic marker at the end of every bot reply. The parser aborts instantly if this marker is detected.
- **Bulletproof WhatsApp SaaS Security**:
  - The Gateway performs a real-time `checkUser` via the Transaction Service before processing any message. It strictly ignores strangers and enforces that users must first register and verify their emails on the Web Dashboard before the bot will serve them. All messages from unregistered numbers, groups, or spoofed `@lid` JIDs are immediately dropped with an elegant rejection message.
  - The WhatsApp connection lifecycle handles forced manual resets gracefully using localized socket termination, preventing unhandled `Connection Closed` Baileys exceptions from crashing the Gateway container (fixing 502 Bad Gateway errors).
  - Implemented aggressive UI polling (1.5s interval) during WhatsApp linking, providing a near-instant, seamless QR code rendering experience.

## Phase 3: Transaction microservice (Completed)
- Separated database functionality from the Gateway into a dedicated `transaction-service`.
- Created Prisma schemas for User, Account, and Transaction.
- Achieved ACID-compliant transaction balance deductions.
- Migrated Prisma to use `@prisma/adapter-pg` driver for Prisma 7 support.

## Phase 4: WhatsApp Integration (Completed)
- Integrated `@whiskeysockets/baileys` to turn the Gateway into a WhatsApp Web client.
- Bypassed Meta Cloud API and Twilio restrictions using the unofficial socket approach.
- Handled QR Code generation inside the Docker logs.
- Prevented infinite loops during self-replies and accommodated WhatsApp's Local Identifier (`@lid`) for "Message Yourself" chats.

## Phase 5: Next.js Frontend Dashboard & Inbox (Completed)
- Designed a mobile-first UI using Next.js App Router, Tailwind CSS, Shadcn UI, and Recharts.
- Expanded the Prisma schema with `confidenceScore` and `TransactionStatus`. Ambiguous AI parsing (confidence < 0.85) defaults to `NEEDS_REVIEW`.
- Implemented an interactive **Inbox** where users can manually confirm transactions with a single click, triggering atomic balance updates.
- **Advanced Inbox Management**: The Inbox now includes inline Edit and Delete controls, allowing users to rapidly correct or dismiss inaccurate AI parsings before they hit the general ledger.
- **Advanced Dashboard Analytics**: Upgraded the dashboard with 5 professional Recharts visualizations: 
  1. **Cumulative Net Flow** (Area Chart) showing intra-month balance growth.
  2. **Daily Cash Flow** (Grouped Bar Chart) comparing Income vs Expense per day.
  3. **Spending Velocity** (Bar Chart) with an automatic Daily Average Budget threshold line.
  4. **Expense Breakdown** (Donut Chart) with exact percentage and decimal calculations (preventing aggressive rounding errors on totals).
  5. **Budget vs Actual** (Progress Bars) measuring category expenses against defined limits.
- **Privacy Mode (Shutter)**: Added a dynamic, global privacy toggle (Eye/Shutter icon) to censor sensitive financial data (Total Net Worth and Individual Account Balances) with a single click. Accounts can also be individually revealed in privacy mode.
- **Batch Inbox Management**: Added a one-click "Delete All" function in the Dashboard Inbox to rapidly clear the entire "Needs Review" queue.
- **Backend Budget Infrastructure**: Added a `Budget` Prisma model linked to users and categories, exposing robust CRUD and TCP/REST APIs to power the budget analytics.
- Implemented an **Interactive Calendar Filter**: Users can click specific days on the Ledger calendar to instantly filter the transaction table down to that date, backed by separated un-paginated and paginated API data streams.
- **Full Manual CRUD**: Empowered the dashboard with complete native control—users can Add, Edit, and Delete transactions manually with absolute atomic safety (e.g. deleting an expense securely restores the account balance).
- **Precision Date/Time Controls**: Users can now precisely backdate or schedule transactions by manually specifying Date & Time in the Add and Edit Transaction Modals.
- **Floating Action Menu (FAB)**: Centralized "Add" operations (Transactions, Accounts, Budgets) into a single sleek, animated pop-up menu for a cleaner UI.
- **Strict Data Consistency**: Fortified the Gemini LLM schema and frontend forms to strictly enforce `UPPERCASE` category parsing, ensuring flawless data alignment between AI-predicted categories and manual budgets.
- **Frontend Architecture Refactoring**: Splitted the monolithic `Dashboard.tsx` into modular components (`HomeView`, `LedgerView`, `InboxView`, `DashboardHeader`, `BottomNav`, Modals) for extreme maintainability.
- **SPA Routing**: Used Next.js `useRouter` and query parameters (`/?tab=ledger`) to maintain proper browser history and URL paths, avoiding expensive component unmounts and preserving React state.
- **Live Polling**: The frontend utilizes a seamless `setInterval` hook fetching data every 5 seconds, keeping the dashboard strictly in sync with incoming WhatsApp transactions without requiring a page refresh.

## Phase 6: Frontend Dockerization & Reverse Proxy (Completed)
- Built a multi-stage `Dockerfile` leveraging Next.js `standalone` output for minimal image size.
- Configured Nginx as the primary Reverse Proxy on Port 80, intelligently routing `/api/` traffic to the Gateway and `/` traffic to the Frontend container.

## Phase 7: Modular Monolith & Security Hardening (Completed)
- Merged `gateway`, `parser-service` and `transaction-service` into a single NestJS app (`backend/api`) organised by feature modules; removed the internal TCP transport.
- Ownership checks on every account/budget/transaction mutation (fixes cross-user access by ID).
- `/api/whatsapp/status` requires login (QR only for admins), `/api/whatsapp/reset` and `/parse` require auth.
- Request validation via DTOs (`class-validator`), rate limiting on auth endpoints, CSPRNG OTP with a 5-attempt limit, no hardcoded JWT secret fallback.
- Balance logic consolidated into `transactions/ledger.ts` with unit tests; migrations run automatically on API startup.
