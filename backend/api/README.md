# WhatsMonTrack API

NestJS 11 backend of [WhatsMonTrack](../../README.md): the REST API used by the web dashboard (and the upcoming Android app) plus the WhatsApp bot, in one modular-monolith app.

- Architecture, modules and the endpoint list: [main README → Architecture](../../README.md#architecture)
- Running everything with Docker: [main README → Installation and setup](../../README.md#installation-and-setup)
- Production deployment: [deploy/vps/README.md](../../deploy/vps/README.md)

## Layout

```
src/
  auth/          register, email OTP, login, password reset, JWT, OTP email (SMTP or Brevo)
  accounts/      bank / e-wallet / cash accounts
  budgets/       monthly budget per category
  debts/         utang-piutang notes (who owes whom; never touches balances)
  transactions/  transactions, monthly summary, ledger.ts (the only code that changes balances)
  parser/        Gemini parsing (rules in systemInstruction) with an offline regex fallback
  whatsapp/      Baileys socket (link / change / unlink the bot), bot conversation logic,
                 number linking, session store in PostgreSQL
  chat/          web chat with the bot (same BotService as WhatsApp), history in ChatMessage
  common/        guards, config, phone/time-zone helpers, BigInt JSON serialisation
  database/      PrismaService (pg driver adapter)
  health.controller.ts   GET /api/health
prisma/          schema.prisma and migrations
test/            end-to-end tests (node:test, real PostgreSQL)
```

## Scripts

| Script | What it does |
|---|---|
| `npm run start:dev` | Development server with watch mode (used by `docker-compose.yml`) |
| `npm run build` | Compile to `dist/` |
| `npm run start:prod` | Run the compiled app (`node dist/main`) |
| `npm test` | Unit tests (Jest) |
| `npm run test:auth-state` | WhatsApp session store against the real Baileys package (no database) |
| `npm run test:e2e` | End-to-end tests over HTTP with a real PostgreSQL; **wipes all tables**, so set `TEST_DATABASE_URL` to a throwaway database |
| `npm run lint` | ESLint |
| `npm run build:render` / `start:render` | Build/start for Render (alternative host, branch `deploy/render-neon-vercel`) |

Production images use [`Dockerfile.prod`](Dockerfile.prod) (migrations are applied on start); `Dockerfile` is the development image.

## Configuration

Environment variables are documented in the [main README](../../README.md#1-environment) and in [`.env.prod.example`](../../.env.prod.example) for production. Required: `DATABASE_URL`, `JWT_SECRET`.

## Migrations

After editing `prisma/schema.prisma`:

```bash
npx prisma migrate dev --name <name>     # creates prisma/migrations/<timestamp>_<name>
```

Migrations are applied automatically when the API starts (`prisma migrate deploy`).
