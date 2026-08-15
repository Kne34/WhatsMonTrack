# WhatsMonTrack - WhatsApp Expense Tracker Bot

An LLM-powered WhatsApp bot that allows users to log expenses in natural Indonesian chat shorthand (e.g., *"50k makan siang bca"*) and receive structured tracking, corrections, and monthly summaries.

## Architecture

The project is fully dockerized and uses a modern, robust architecture:
- **Backend**: [NestJS](https://nestjs.com/) (TypeScript)
- **Database**: PostgreSQL (Master/Slave Replication) managed via Docker Compose
- **Connection Pooling/Load Balancing**: [Pgpool-II](https://www.pgpool.net/)
- **Reverse Proxy**: NGINX (Routing HTTP traffic to the backend)
- **ORM**: [Prisma](https://www.prisma.io/)

---

## Getting Started: Phase 1 Setup Flow

Here is the exact step-by-step flow and the commands used to initialize this project architecture from scratch.

### 1. Database & Docker Architecture Setup
We created a `docker-compose.yml` that defines the following services:
- `postgres-master`: The primary writable database node.
- `postgres-slave`: A read-only replica database node.
- `pgpool`: A connection pooler that routes read/write queries to the correct Postgres node.
- `nginx`: A reverse proxy routing port 80 to the backend's port 3000.
- `backend`: The NestJS API container.

A `.env` file was created in the root directory to store database credentials securely.

### 2. NestJS Backend Initialization
We used the NestJS CLI to scaffold the backend repository:
```bash
npx -y @nestjs/cli new backend --package-manager npm --skip-git
```

### 3. Prisma ORM Installation
Inside the `backend` folder, we installed Prisma and initialized it:
```bash
cd backend
npm install prisma --save-dev
npm install @prisma/client
npx prisma init
```

### 4. Database Schema Definition
We defined the database tables in `backend/prisma/schema.prisma`. 
*(Note: Because we are using Prisma v7.9+, we removed the `url` parameter from the schema file. The connection URL is supplied via environment variables in docker-compose).*

### 5. Dockerizing the Backend
We created a `backend/Dockerfile` using `node:20-alpine` to run the NestJS server in development mode (`npm run start:dev`).

We also created `.gitignore` and `backend/.dockerignore` to ensure `node_modules` and raw database volumes (`postgres_master_data/`, `postgres_slave_data/`) are not committed to source control or copied into the Docker container during the build.

### 6. Starting the Stack
With everything configured, we built and started the entire architecture:
```bash
docker compose up --build -d
```
*Note: You must have Docker Desktop running.*

### 7. Running Database Migrations
Once the containers were up, we needed to push our Prisma schema to the Postgres database. 

Because Pgpool can sometimes block Prisma's administrative migration commands, we bypassed Pgpool and connected directly to the `postgres-master` node just for the migration:
```bash
docker compose exec -e DATABASE_URL="postgresql://postgres:mysecretpassword@postgres-master:5432/postgres?schema=public" backend npx prisma migrate dev --name init
```

*For standard application queries, the backend uses Pgpool via the `DATABASE_URL` environment variable defined in `docker-compose.yml`.*

---

## Phase 2 (Coming Soon)
- Category Intelligence & LLM Pipeline integration using the Gemini API.
