# WhatsMonTrack — Live App

**Open the app: https://bit.ly/WhatsMonTrack**
(redirects to `https://80-43-0-155.sslip.io`)

WhatsMonTrack is a personal finance tracker you feed by chatting on WhatsApp. Send *"kopi 25rb bca"* to the bot and it is recorded, the balance is updated, and everything appears on your private dashboard.

> This is a personal project running on a small server. It is provided as-is, without uptime guarantees. See [Limitations](#limitations).

---

## What is running

| | |
|---|---|
| **Web dashboard** | `https://80-43-0-155.sslip.io` |
| **REST API** (web + upcoming Android app) | `https://80-43-0-155.sslip.io/api` |
| **Health check** | `https://80-43-0-155.sslip.io/api/health` → `{"ok":true}` |
| **WhatsApp bot** | Online 24/7; its number is shown in the app when you link your WhatsApp |
| **Hosting** | VPS in Indonesia (Ubuntu 24.04, 1 vCPU, 1 GB RAM) |
| **HTTPS** | Automatic Let's Encrypt certificate (Caddy) |
| **Backups** | Database backed up daily, kept for 14 days |

Stack: Next.js (web) · NestJS (API + bot) · PostgreSQL · Caddy · Docker Compose. Branch: [`deploy/vps`](https://github.com/Kne34/WhatsMonTrack/tree/deploy/vps).

---

## Getting started (users)

1. **Create an account.** Open the link, choose **Buat akun**, enter your email and a password (at least 8 characters), then type the 6-digit code sent to your email. Check your spam folder if it doesn't arrive.
2. **Link your WhatsApp number.** Click **Hubungkan WhatsApp**, press **Buat QR**, scan the QR with your phone camera, and press **Send** in WhatsApp. The prefilled message `VERIFIKASI <code>` proves the number is yours. The code is valid for 10 minutes.
3. **Add your accounts.** **Tambah → Rekening**: your bank, e-wallet or cash (e.g. BCA, GoPay, Tunai) with their current balances. Optionally add monthly **budgets** per category.
4. **Chat with the bot** from your linked number:

| You send | Recorded as |
|---|---|
| *50k makan siang bca* | Expense Rp 50.000 from BCA |
| *bayar gojek 20k pake gopay* | Expense Rp 20.000 from GoPay |
| *gajian 5jt masuk ke bca* | Income Rp 5.000.000 to BCA |
| *transfer 100rb dari bca ke gopay* | Transfer Rp 100.000 |
| `/rekap` | This month's summary: income, expenses, balances, budgets |

Messages the bot isn't sure about go to **Perlu ditinjau** (review) on the dashboard; confirm or fix them there. The full user guide is in the [main README](README.md#user-guide).

**Android app:** in development. It will use the same account and the API above.

---

## Limitations

- **Unofficial WhatsApp connection.** The bot uses a WhatsApp Web client (Baileys), not Meta's official API. It can stop working if WhatsApp changes or blocks the bot number.
- **Small server.** 1 vCPU and 1 GB RAM; fine for personal use, not for heavy traffic.
- **No uptime guarantee.** During maintenance or updates the app may be briefly unavailable. Messages sent to the bot while it is down are still recorded when it comes back (up to 3 days old).
- **Temporary address.** The site currently uses a free `sslip.io` address tied to the server's IP. The short link `bit.ly/WhatsMonTrack` will keep working if this moves to a custom domain.
- **Your data** (email, accounts, transactions) is stored on this server in Indonesia and is only visible to your own account. Passwords are hashed with bcrypt.

---

## For the maintainer

| Task | How |
|---|---|
| First-time server setup | [deploy/vps/README.md](deploy/vps/README.md) |
| Status / logs | `dc ps` · `dc logs -f api` (alias from the deploy guide) |
| Backups | `/opt/whatsmontrack/backups` (daily, 14 days) · restore steps in the deploy guide |

### Releasing an update (build on the laptop)

The 1 vCPU server is too slow to build the images, so they are built locally and shipped:

```bash
# On the laptop (Git Bash, Docker Desktop running), branch deploy/vps
docker build --platform linux/amd64 -t whatsmontrack-prod-api:latest -f backend/api/Dockerfile.prod backend/api
docker build --platform linux/amd64 -t whatsmontrack-prod-web:latest frontend
docker save whatsmontrack-prod-api:latest whatsmontrack-prod-web:latest | gzip > whatsmontrack-images.tar.gz
scp whatsmontrack-images.tar.gz root@80.43.0.155:/root/

# On the server
cd /opt/whatsmontrack && git pull
./deploy/vps/backup.sh                                   # backup before migrations run
gunzip -c /root/whatsmontrack-images.tar.gz | docker load
dc up -d --no-build                                      # api applies database migrations on start
rm /root/whatsmontrack-images.tar.gz
docker image prune -f
```

Then check `https://80-43-0-155.sslip.io/api/health` and `dc logs api | tail`.

### Moving to a custom domain
Point an `A` record (and optionally `AAAA`) at the server, set `SITE_ADDRESS=yourdomain, 80-43-0-155.sslip.io` in `.env.prod`, run `dc up -d --no-build`, then update the bit.ly link to the new domain.
