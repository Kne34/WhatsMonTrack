# WhatsMonTrack - WhatsApp Expense Tracker Bot

An LLM-powered WhatsApp bot that allows users to log expenses in natural Indonesian chat shorthand (e.g., *"50k makan siang bca"*) and receive structured tracking, corrections, and monthly summaries.

## Architecture

The project is fully dockerized and uses a robust **Microservices Architecture**:
- **Gateway Service (`/backend/gateway`)**: Serves a dual purpose. First, it connects directly to WhatsApp servers via WebSockets using `@whiskeysockets/baileys`. Second, it exposes REST APIs for the Frontend Dashboard. It routes business logic to internal microservices via TCP.
- **Parser Service (`/backend/parser-service`)**: A NestJS TCP microservice dedicated to category intelligence. It runs a fast-path Regex pipeline and falls back to a Gemini 1.5/2.5 LLM for parsing natural language expenses.
- **Transaction Service (`/backend/transaction-service`)**: A NestJS TCP microservice handling all database business logic (users, accounts, and transactions).
- **Frontend Dashboard (`/frontend`)**: A Next.js (App Router) web application for monitoring and confirming transactions (WIP).
- **Database**: PostgreSQL (Master/Slave Replication) managed via Docker Compose
- **Connection Pooling**: [Pgpool-II](https://www.pgpool.net/)
- **Reverse Proxy**: NGINX (Routing HTTP traffic to the backend gateway)
- **ORM**: [Prisma](https://www.prisma.io/)

## Tech Stack
**Frontend:**
- **Framework:** Next.js 15 (App Router, Client Components)
- **Styling:** Tailwind CSS, Shadcn UI, Lucide Icons
- **Data Visualization:** Recharts
- **State Management:** React Hooks (`useState`, `useEffect`) and URL Query Parameters

**Backend:**
- **Framework:** NestJS (Node.js)
- **Microservices:** TCP Transport
- **WhatsApp Integration:** `@whiskeysockets/baileys`
- **AI/LLM:** Google Gemini 1.5/2.5 via `@google/generative-ai`

**Infrastructure:**
- **Database:** PostgreSQL (with Master-Slave Replication)
- **ORM:** Prisma (with `@prisma/adapter-pg`)
- **Containerization:** Docker & Docker Compose
- **Proxy:** Nginx
- **Connection Pooler:** Pgpool-II

```mermaid
graph TD
    WA[WhatsApp Servers] <-->|WebSockets| Gateway(Gateway Service)
    Frontend[Next.js UI] -->|HTTP REST| Nginx(Reverse Proxy)
    Nginx -->|HTTP 3000| Gateway
    
    Gateway <-->|TCP 3001| Parser(Parser Service)
    Gateway <-->|TCP 3002| Transaction(Transaction Service)
    
    Parser -.->|HTTP| Gemini(Google Gemini API)
    
    Transaction -->|Prisma adapter-pg| PgPool(PgPool Load Balancer)
    PgPool -->|Write| Master(PostgreSQL Master)
    PgPool -->|Read| Slave(PostgreSQL Slave)
```

---

## Getting Started: Initialization Flow

Here is the step-by-step flow and the commands used to initialize this project architecture.

### 1. Database & Docker Architecture Setup
We created a `docker-compose.yml` that defines the following services:
- `postgres-master` & `postgres-slave`: Primary/Replica database nodes.
- `pgpool`: A connection pooler that routes read/write queries.
- `nginx`: A reverse proxy routing port 80 to the Gateway's port 3000.
- `gateway`: The entry-point API container.
- `parser-service`: The internal intelligence microservice container.

A `.env` file must be created in the root directory with the database credentials and `GEMINI_API_KEY`.

### 2. NestJS Microservices Initialization
We scaffolded two separate NestJS applications inside a centralized `backend/` folder:
```bash
# Initialize Gateway
npx -y @nestjs/cli new gateway --package-manager npm --skip-git
# Initialize Parser Service
npx -y @nestjs/cli new parser-service --package-manager npm --skip-git
```

### 3. Prisma ORM Installation
Inside the `backend/gateway` folder, we installed Prisma and defined our schema in `prisma/schema.prisma`:
```bash
cd backend/gateway
npm install prisma --save-dev
npm install @prisma/client
npx prisma init
```

### 4. Dockerizing the Services
We created `Dockerfile`s using `node:20-alpine` in both the `gateway` and `parser-service` folders. 
*Note: We apply `NODE_OPTIONS=--dns-result-order=ipv4first` in Docker Compose to ensure Node's `fetch` API correctly resolves Google APIs without IPv6 network hanging.*

### 5. Starting the Stack
With everything configured, build and start the entire architecture:
```bash
docker compose up --build -d
```
*Note: You must have Docker Desktop running.*

### 6. Running Database Migrations
To push the Prisma schema to the database, we bypassed Pgpool and connected directly to the `postgres-master` node just for the migration:
```bash
docker compose exec -e DATABASE_URL="postgresql://postgres:mysecretpassword@postgres-master:5432/postgres?schema=public" gateway npx prisma migrate dev --name init
```

---

## Getting Started: End-User Guide (How to Use)

If you are a user looking to use the app to track your finances to the fullest, follow this flow:

### 1. Environment Setup
Make sure you have created `.env` files based on the `.env.example` files provided in the root, `backend/gateway`, `backend/transaction-service`, and `frontend`. 
Crucially, ensure you have set your `DEFAULT_PHONE_NUMBER` (your WhatsApp number in international format, e.g., `62812...`) and your `GEMINI_API_KEY`.

### 2. Start the App & Link WhatsApp
To avoid startup race conditions, we have provided automated startup scripts.
- **Windows (cmd):** Double-click or run `start_app.bat`
- **PowerShell:** Run `./start_app.ps1`
- **Manual/Linux:** You can run `docker compose up -d` but ensure databases are initialized first.

The script will automatically fetch the Gateway logs at the end. Look for the WhatsApp Web QR Code in the terminal and scan it with your WhatsApp app (Linked Devices) to authorize the bot.

### 3. Initialize Dashboard (Accounts & Budgets)
Open your browser and navigate to `http://localhost`.
Before chatting, set up your baseline data:
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

### 6. Linking and Troubleshooting WhatsApp
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
- Upgraded the AI model to `gemini-2.5-flash` for optimal parsing speed and instruction following.
- **Resilient AI Parsing Service**:
  - Implemented an intelligent **Context-Aware RAG (Retrieval-Augmented Generation)** pattern: User's existing account names (e.g., 'BCA', 'OVO') are dynamically fetched and injected directly into the Gemini AI system prompt, eliminating false positives and enforcing 100% strict matching with the actual PostgreSQL database.
  - Hardened with a **Recursive Retry System**: If Gemini throws a temporary network failure (e.g. `fetch failed`), the parser service will automatically intercept the error, sleep, and gracefully retry the request up to 2 times before falling back, drastically improving reliability.
- **Conversational AI Fallback**: Upgraded the Gemini schema to natively detect casual chat or help requests (e.g., "Halo", "/rekap"), falling back to a friendly conversational assistant instead of throwing a parsing error.
- **Anti-Loop Zero-Width Space Architecture**: To absolutely guarantee the bot never replies to its own messages (which causes catastrophic infinite loops), a Zero-Width Space (`\u200B`) is injected as an invisible cryptographic marker at the end of every bot reply. The parser aborts instantly if this marker is detected.
- **Bulletproof WhatsApp Security**:
  - Strict Docker environment binding (`DEFAULT_PHONE_NUMBER`) ensures the bot only reads and processes messages from the authorized user's phone number. All messages from strangers, groups, or spoofed `@lid` JIDs are immediately dropped.
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
