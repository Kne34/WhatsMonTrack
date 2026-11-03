# Free deployment: Render + Neon + Vercel

Run WhatsMonTrack online for free, for personal use, without keeping a computer on.

| Part | Service (free plan) | Notes |
|---|---|---|
| API + WhatsApp bot | [Render](https://render.com) web service | Sleeps after ~15 minutes without web traffic; the first request then takes up to about a minute |
| Database | [Neon](https://neon.tech) Postgres | 0.5 GB, plenty for personal records; also sleeps when idle |
| Frontend | [Vercel](https://vercel.com) | Always on, HTTPS included |
| OTP email | [Brevo](https://www.brevo.com) | ~300 emails/day. Needed because Render's free plan blocks outbound SMTP |

Use the branch **`deploy/render-neon-vercel`**. The Docker Compose setup on the main development branch keeps working as before.

## How it behaves while asleep

- Send transactions to the bot at any time. While the API sleeps, WhatsApp keeps the messages.
- When you open the dashboard, the API wakes up. The page shows *"Menyalakan server…"* during the wait.
- The bot reconnects and records the queued messages, each one only once. Messages older than `WA_OFFLINE_MAX_AGE_HOURS` (168 hours = 7 days in `render.yaml`) are skipped.
- The bot only replies in WhatsApp while the API is awake, so replies to messages sent during sleep arrive after it wakes.
- The WhatsApp session is stored in the database, so you scan the bot QR only once, not after every restart.

Want instant replies? See [Keep it awake (optional)](#keep-it-awake-optional).

---

## 1. Database: Neon

1. Sign up at neon.tech and create a project, region **AWS Asia Pacific (Singapore)**, Postgres 17.
2. Open **Connect** and copy two connection strings:
   - **Pooled** (the host contains `-pooler`). This becomes `DATABASE_URL`.
   - **Direct** (switch "Connection pooling" off). This becomes `MIGRATE_DATABASE_URL`, used only for migrations.

   Both must end with `?sslmode=require`.

Tables are created automatically on the first start of the API.

## 2. Email: Brevo

1. Sign up at brevo.com (free plan).
2. **Senders, Domains & Dedicated IPs → Senders → Add a sender**: add the address the OTP emails come from (e.g. your Gmail) and confirm the email Brevo sends you.
3. **SMTP & API → API Keys → Generate a new API key**. Copy it; this becomes `BREVO_API_KEY`.

Tip: emails from a Gmail address sent through Brevo may land in spam; mark the first one as "not spam". A sender on your own domain (verified in Brevo) delivers better.

## 3. API and bot: Render

1. Push the branch to GitHub: `git push -u origin deploy/render-neon-vercel`.
2. Render dashboard → **New → Blueprint** → choose the repository. Render reads `render.yaml` from the `deploy/render-neon-vercel` branch and creates the `whatsmontrack-api` service on the free plan.
3. Fill in the values Render asks for:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Neon **pooled** connection string |
   | `MIGRATE_DATABASE_URL` | Neon **direct** connection string |
   | `GEMINI_API_KEY` | From Google AI Studio |
   | `ADMIN_EMAILS` | Your email (you will be the admin who connects the bot) |
   | `BREVO_API_KEY` | From step 2 |
   | `MAIL_FROM` | The verified sender, e.g. `WhatsMonTrack <you@gmail.com>` |
   | `FRONTEND_ORIGIN` | Leave empty for now; filled in at step 5 |

   `JWT_SECRET` is generated automatically. `WA_OFFLINE_MAX_AGE_HOURS`, `TRUST_PROXY_HOPS` and `NODE_VERSION` come from `render.yaml`.
4. Wait for the first deploy. The build runs `npm ci` and `nest build`; the start command applies migrations on Neon, then starts the API.
5. Copy the service URL, e.g. `https://whatsmontrack-api.onrender.com`, and check `https://…onrender.com/api/health` returns `{"ok":true}`.

## 4. Frontend: Vercel

1. Vercel → **Add New → Project** → import the repository.
2. Settings:
   - **Root Directory:** `frontend`
   - **Production Branch** (Settings → Git, after import): `deploy/render-neon-vercel`
   - **Environment Variable:** `NEXT_PUBLIC_API_URL` = the Render URL from step 3, without a trailing slash
3. Deploy. `NEXT_PUBLIC_API_URL` is built into the page, so **redeploy** whenever you change it.

## 5. Connect the two

1. Render → `whatsmontrack-api` → **Environment** → set `FRONTEND_ORIGIN` to your Vercel URL, e.g. `https://whatsmontrack.vercel.app` (no trailing slash). Several URLs can be separated by commas. Render redeploys automatically.
2. Open the Vercel URL, **Buat akun** with the email from `ADMIN_EMAILS`, and verify it with the emailed code.
3. **Bot WhatsApp** → scan the QR with the bot's WhatsApp (**Perangkat tertaut → Tautkan perangkat**).
4. **Hubungkan WhatsApp** → link your own number, then add your accounts. Done.

---

## Keep it awake (optional)

To get bot replies instantly instead of after the next dashboard visit, ping the health endpoint so Render never sleeps:

1. Sign up at [cron-job.org](https://cron-job.org) (free).
2. Create a job: URL `https://<your-service>.onrender.com/api/health`, every **10 minutes**.

`/api/health` does not touch the database, so Neon can still sleep. Render's free plan has a monthly allowance of free instance hours per workspace; one service running all month fits within it, but check the usage in the Render dashboard, especially if you run other free services.

## Updating

Push to `deploy/render-neon-vercel`. Render and Vercel deploy automatically; database migrations run on start.

## Troubleshooting

| Problem | Cause and fix |
|---|---|
| Login shows a network error | `FRONTEND_ORIGIN` on Render does not exactly match the Vercel URL (https, no trailing slash), or `NEXT_PUBLIC_API_URL` was changed without redeploying Vercel |
| First load takes ~1 minute | Normal on the free plan: the API was asleep |
| No OTP email | Check Render logs for `Brevo rejected the email`: usually `MAIL_FROM` is not a verified sender, or the API key is wrong. Check the spam folder |
| Bot asks for a new QR | The bot was logged out in WhatsApp (Linked devices), or it was offline for a very long time and WhatsApp unlinked it. Scan again via **Bot WhatsApp** |
| Old messages were not recorded | They were older than `WA_OFFLINE_MAX_AGE_HOURS` when the bot came back. Raise it in Render's environment if needed |
| Deploy fails at `prisma migrate deploy` | `MIGRATE_DATABASE_URL` must be Neon's **direct** connection string (without `-pooler`) |

## Limits to know

- **Unofficial WhatsApp client.** Baileys is not an official WhatsApp API; use a separate number for the bot.
- **No backups on Neon's free plan beyond its short restore window.** For important data, export occasionally: `pg_dump "<direct connection string>" > backup.sql`.
- Free plans and their limits change over time; check each provider's pricing page.
