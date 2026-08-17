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

## Phase 2: Category Intelligence (Completed)
- Configured NestJS `ClientsModule` for fast TCP communication between the Gateway and Parser Service.
- Implemented a Regex "Fast-Path" for strict standard templates (e.g. `50k makan siang bca`).
- Integrated the `@google/generative-ai` SDK using Gemini's **Structured Outputs (JSON Schema)** to seamlessly parse messy natural language slang into actionable transaction data.

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
- **Advanced Dashboard Analytics**: Upgraded the dashboard with 5 professional Recharts visualizations: 
  1. **Cumulative Net Flow** (Area Chart) showing intra-month balance growth.
  2. **Daily Cash Flow** (Grouped Bar Chart) comparing Income vs Expense per day.
  3. **Spending Velocity** (Bar Chart) with an automatic Daily Average Budget threshold line.
  4. **Expense Breakdown** (Donut Chart) with percentage calculations.
  5. **Budget vs Actual** (Progress Bars) measuring category expenses against defined limits.
- **Backend Budget Infrastructure**: Added a `Budget` Prisma model linked to users and categories, exposing robust CRUD and TCP/REST APIs to power the budget analytics.
- Implemented an **Interactive Calendar Filter**: Users can click specific days on the Ledger calendar to instantly filter the transaction table down to that date, backed by separated un-paginated and paginated API data streams.
- **Full Manual CRUD**: Empowered the dashboard with complete native control—users can Add, Edit, and Delete transactions manually with absolute atomic safety (e.g. deleting an expense securely restores the account balance).
- **Floating Action Menu (FAB)**: Centralized "Add" operations (Transactions, Accounts, Budgets) into a single sleek, animated pop-up menu for a cleaner UI.
- **Strict Data Consistency**: Fortified the Gemini LLM schema and frontend forms to strictly enforce `UPPERCASE` category parsing, ensuring flawless data alignment between AI-predicted categories and manual budgets.
- **Frontend Architecture Refactoring**: Splitted the monolithic `Dashboard.tsx` into modular components (`HomeView`, `LedgerView`, `InboxView`, `DashboardHeader`, `BottomNav`, Modals) for extreme maintainability.
- **SPA Routing**: Used Next.js `useRouter` and query parameters (`/?tab=ledger`) to maintain proper browser history and URL paths, avoiding expensive component unmounts and preserving React state.
- **Live Polling**: The frontend utilizes a seamless `setInterval` hook fetching data every 5 seconds, keeping the dashboard strictly in sync with incoming WhatsApp transactions without requiring a page refresh.

## Phase 6: Frontend Dockerization & Reverse Proxy (Completed)
- Built a multi-stage `Dockerfile` leveraging Next.js `standalone` output for minimal image size.
- Configured Nginx as the primary Reverse Proxy on Port 80, intelligently routing `/api/` traffic to the Gateway and `/` traffic to the Frontend container.
