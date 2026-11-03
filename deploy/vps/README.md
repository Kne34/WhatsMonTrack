# Deploying WhatsMonTrack to a VPS (learning guide)

This guide walks you through deploying the app yourself, step by step, explaining **why** each step is done. Target: an Ubuntu 24.04 VPS with 1 GB of RAM (example: Rumahweb VPS S, IP `80.43.0.155`).

End result:
- Web dashboard and REST API at `https://80-43-0-155.sslip.io` (automatic HTTPS, no domain to buy).
- The WhatsApp bot running 24/7.
- A daily database backup.

---

## 0. The big picture

```
 Browser / Android app
          │  HTTPS (443)
          ▼
 ┌──────────────── VPS ─────────────────┐
 │  Caddy  ── /api/* ──►  api (NestJS)  │◄──► WhatsApp, Gemini, email
 │    │                     │           │
 │    └── everything else ► web         │
 │                (Next.js) ▼           │
 │                       postgres       │
 └──────────────────────────────────────┘
```

Every part runs as a **Docker container**, all described in one file: `docker-compose.prod.yml`.

| Part | What it does | Why it is set up this way |
|---|---|---|
| **Caddy** | The only entry point from the internet (ports 80/443). Gets and renews HTTPS certificates by itself | HTTPS keeps passwords and tokens from being read in transit; Caddy renews certificates automatically |
| **api** | NestJS backend + WhatsApp bot | Runs from a production build (`node dist/main`), not dev mode: less RAM, more stable |
| **web** | Next.js dashboard | Same: a production build |
| **postgres** | Database | **Not** reachable from the internet, only from the other containers |

> **Compared with `docker-compose.yml` (development):** the laptop setup has a primary, a replica and Pgpool. On a single VPS that adds no data safety (if the VPS goes down, all of it goes down) but costs RAM. In production, one PostgreSQL plus a **daily backup** is enough.

**Quick glossary:** *SSH* = remote terminal into the server · *container* = an app packaged with everything it needs · *image* = the template a container is created from · *volume* = storage that survives when a container is removed · *reverse proxy* = a server that forwards requests to the apps behind it.

---

## 1. Log in to the VPS over SSH

On Windows, open **PowerShell** (SSH is built into Windows 10/11):

```powershell
ssh root@80.43.0.155
```

- The first time you will see *"The authenticity of host … can't be established"*. Type `yes`. This stores the server's fingerprint, so you would be warned if someone ever impersonated it.
- Enter the **root password** from the Rumahweb panel (eye icon next to *Password Root*). Nothing appears on screen while you type a password; that is normal.

You are in when the prompt looks like `root@whatsmon:~#`. All following commands run **on the VPS** unless stated otherwise.

### Change the root password (important)
The panel password has been shown on screen and by email. Replace it with one only you know:

```bash
passwd
```

### (Recommended) Log in with an SSH key instead of a password
SSH keys are far safer than passwords. In **PowerShell on your laptop** (not on the VPS):

```powershell
ssh-keygen -t ed25519            # press Enter for the defaults; a passphrase is optional
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh root@80.43.0.155 "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
ssh root@80.43.0.155             # no VPS password prompt any more
```

`id_ed25519` (without `.pub`) is your private key: **never share it**. The `.pub` file is safe to put on any server.

---

## 2. Prepare the server (once)

```bash
curl -fsSL https://raw.githubusercontent.com/Kne34/WhatsMonTrack/deploy/vps/deploy/vps/setup.sh -o setup.sh
less setup.sh        # read it first (q to quit) — make a habit of reading scripts before running them as root
bash setup.sh
```

What `setup.sh` does (5–10 minutes):

| Step | Why |
|---|---|
| `apt upgrade` + *unattended-upgrades* | Patches security holes now, and installs security updates automatically from then on |
| Time zone Asia/Jakarta | Log timestamps and the backup schedule use WIB |
| **2 GB swap** | "Spare RAM" on disk: a safety margin so a short memory spike doesn't get a process killed on a 1 GB server |
| **Docker** | Runs all the containers |
| Docker log limits (10 MB × 3) | The disk is only 20 GB; unlimited logs can fill it up |
| Docker DNS `1.1.1.1` / `8.8.8.8` | Containers only have IPv4; without this they may inherit IPv6 DNS servers they cannot reach, and lookups fail now and then |
| **Firewall (ufw)**: only ports 22, 80, 443 | Every other port is closed to the internet |
| **fail2ban** | Blocks IPs that keep failing SSH logins (password-guessing bots are everywhere) |
| `git clone` into `/opt/whatsmontrack` | Fetches the code of the `deploy/vps` branch |
| Backup every day at 03:30 | See section 6 |

Check the result:
```bash
docker --version        # Docker is installed
ufw status              # 22, 80, 443 ALLOW
free -h                 # the "Swap" row shows 2.0Gi
```

---

## 3. Fill in the secrets

```bash
cd /opt/whatsmontrack
cp .env.prod.example .env.prod
openssl rand -hex 32     # copy the output for POSTGRES_PASSWORD
openssl rand -hex 48     # copy the output for JWT_SECRET
nano .env.prod
```

In `nano`: move with the arrow keys, paste with a right click, save with **Ctrl+O** then **Enter**, quit with **Ctrl+X**.

| Variable | Value |
|---|---|
| `SITE_ADDRESS` | `80-43-0-155.sslip.io` (the IP with dashes). sslip.io is a free DNS service that resolves to that IP, so Caddy can get an HTTPS certificate without a domain |
| `POSTGRES_PASSWORD` | Output of `openssl rand -hex 32` |
| `JWT_SECRET` | Output of `openssl rand -hex 48`. It signs login tokens; if it leaks, anyone can forge a login |
| `GEMINI_API_KEY` | From Google AI Studio |
| `ADMIN_EMAILS` | Emails allowed to see the bot QR |
| `BREVO_API_KEY` + `MAIL_FROM` **or** `SMTP_*` | Sender of the OTP emails. Gmail: `SMTP_USER` = your Gmail address, `SMTP_PASS` = a 16-character *App Password* |

Make the file readable by root only:
```bash
chmod 600 .env.prod
```

`.env.prod` is in `.gitignore`, so it can never be uploaded to GitHub.

---

## 4. Build on the laptop, run on the server

**Why not build on the server?** Building the images (`npm ci`, `next build`) needs a lot of CPU and RAM. On 1 vCPU / 1 GB it takes ages and can freeze the server (we saw a load average of ~40). So the work is split, as is common in production:

```
Laptop:  code ──docker build──► images ──docker save──► whatsmontrack-images.tar.gz
                                                              │ scp (upload over SSH)
Server:              containers ◄── dc up --no-build ◄── docker load
```

| Command | What it does |
|---|---|
| `docker build` | Turns the code into an image (the heavy part, done on the laptop) |
| `docker save` + `gzip` | Packs the images into one compressed file |
| `scp` | Copies the file to the server over SSH |
| `docker load` | Unpacks the images into Docker on the server |
| `dc up -d --no-build` | Starts containers from those images; never builds on the server |

The laptop and the server are both x86_64 (`linux/amd64`), so images built on one run on the other. The image names (`whatsmontrack-prod-api`, `whatsmontrack-prod-web`) are fixed in `docker-compose.prod.yml`, so the server finds them.

### 4a. On the server: a short alias (once)

To keep commands short, create an *alias* once:

```bash
echo "alias dc='docker compose -f /opt/whatsmontrack/docker-compose.prod.yml --env-file /opt/whatsmontrack/.env.prod'" >> ~/.bashrc
source ~/.bashrc
```

### 4b. On the laptop: build and deploy with one command

Open **Git Bash** (not PowerShell: PowerShell can corrupt binary data piped through `|`), start Docker Desktop, then:

```bash
cd "/d/Tugas Keane Kuliah/KO26-1/PROJECT PRIBADI/WhatsMonTrack"   # your project folder
git switch deploy/vps
git pull
deploy/vps/release.sh
```

`release.sh` does, in order:
1. Checks your branch matches GitHub (the server pulls the same code, so they must agree).
2. `docker build` both images for `linux/amd64`.
3. `docker save | gzip` into `whatsmontrack-images.tar.gz` (~250 MB).
4. `scp` it to the server.
5. Runs `update.sh` **on the server** over SSH: `git pull` → backup (if the database already runs) → `docker load` → `dc up -d --no-build` → waits until the API answers its health check → removes the file and old images.

The first build on the laptop takes a few minutes; later ones are faster thanks to Docker's cache. The upload time depends on your internet upload speed.

- `-d` (*detached*, used by `dc up`): containers run in the background, so you can close the terminal.
- On start, **the api applies the database migrations** automatically.

<details>
<summary>The same steps by hand (to see what <code>release.sh</code> does)</summary>

On the laptop (Git Bash):
```bash
docker build --platform linux/amd64 -t whatsmontrack-prod-api:latest -f backend/api/Dockerfile.prod backend/api
docker build --platform linux/amd64 -t whatsmontrack-prod-web:latest frontend
docker save whatsmontrack-prod-api:latest whatsmontrack-prod-web:latest | gzip > whatsmontrack-images.tar.gz
scp whatsmontrack-images.tar.gz root@80.43.0.155:/root/
```
On the server:
```bash
cd /opt/whatsmontrack
gunzip -c /root/whatsmontrack-images.tar.gz | docker load
dc up -d --no-build
rm /root/whatsmontrack-images.tar.gz
```
</details>

### 4c. Check
```bash
dc ps                       # every service "Up", postgres "(healthy)"
dc logs -f api              # API logs (Ctrl+C stops watching; the app keeps running)
dc logs caddy | grep -i certificate   # Caddy obtained the HTTPS certificate
```

Open in a browser: **https://80-43-0-155.sslip.io/api/health** → must show `{"ok":true}`, then **https://80-43-0-155.sslip.io** → the login page.

---

## 5. First use
1. **Create an account** (*Buat akun*) with an email listed in `ADMIN_EMAILS`, then enter the emailed OTP.
2. **Bot WhatsApp** (bottom-left menu) → scan the QR with the **bot number's** WhatsApp: *Linked devices* (*Perangkat tertaut*) → *Link a device* (*Tautkan perangkat*). The QR is also printed in `dc logs -f api`.
3. **Hubungkan WhatsApp** (link WhatsApp) → link your own number, then add your accounts.

For the Android app later, the API address is `https://80-43-0-155.sslip.io/api`.

---

## 6. Day-to-day operations

| Task | Command |
|---|---|
| Show status | `dc ps` |
| Show logs | `dc logs -f api` (or `web`, `caddy`, `postgres`) |
| Restart one service | `dc restart api` |
| RAM/CPU usage | `docker stats` |
| Free disk / RAM | `df -h` · `free -h` |
| **Update the app** after new commits | Commit and push, then **on the laptop**: `deploy/vps/release.sh` |
| Back up now | `/opt/whatsmontrack/deploy/vps/backup.sh` |
| List backups | `ls -lh /opt/whatsmontrack/backups` |

`release.sh` (laptop) builds and uploads the images, then runs `update.sh` on the server: `git pull` → **backup first** → `docker load` → restart what changed (`--no-build`) → health check → delete the upload and old images so the disk doesn't fill up.

### Backups
Every day at 03:30 the database (including the WhatsApp session) is saved to `/opt/whatsmontrack/backups`; the last 14 days are kept.

A backup on the same disk does **not** protect you if the VPS itself is lost. Copy them to your laptop now and then (in **PowerShell on your laptop**):
```powershell
scp root@80.43.0.155:/opt/whatsmontrack/backups/*.sql.gz .
```

### Restoring a backup
```bash
cd /opt/whatsmontrack
dc stop api web
dc exec -T postgres psql -U whatsmon -d postgres -c "DROP DATABASE whatsmon WITH (FORCE);" -c "CREATE DATABASE whatsmon OWNER whatsmon;"
gunzip -c backups/whatsmon-YYYY-MM-DD-HHMM.sql.gz | dc exec -T postgres psql -U whatsmon -d whatsmon
dc start api web
```

---

## 7. Troubleshooting

| Symptom | Check / fix |
|---|---|
| `release.sh`: *"Branch … differs from GitHub"* / *"uncommitted changes"* | Commit and `git push` first, so the server pulls the same code the images were built from |
| `release.sh`: `docker build` fails | Is Docker Desktop running? Run it from Git Bash in the project folder |
| `update.sh`: *"API did not become healthy"* | `dc logs api`: usually a wrong or empty variable in `.env.prod`, or a failed migration (restore the backup taken just before, see section 6) |
| Server froze while building | Never build on the server (`dc up --build`); use `release.sh`. If it froze: reboot from the panel, then `docker builder prune -af` |
| Browser: invalid certificate / site doesn't open | `dc logs caddy`. Make sure ports 80 and 443 are open (`ufw status`) and `SITE_ADDRESS` is right. Let's Encrypt needs port 80 to verify the server |
| `502 Bad Gateway` | The api/web isn't ready or crashed: `dc ps`, `dc logs api` |
| The api keeps restarting | `dc logs api`: usually a wrong or empty variable in `.env.prod` |
| No OTP email | `dc logs api \| grep -i mail`. Check the Gmail App Password / Brevo sender. Look in the spam folder |
| The bot asks for a QR again | The bot was removed from *Linked devices* on the bot's phone. Scan again via **Bot WhatsApp** |
| Disk full | `docker system df`, then `docker image prune -f` and `docker builder prune -f` |
| Forgot a command | Every `dc` command = `docker compose -f docker-compose.prod.yml --env-file .env.prod` |

## 8. Security in short
- Only Caddy (80/443) and SSH (22) are open; the database and the API cannot be reached directly from the internet.
- Secrets live only in `.env.prod` (chmod 600), never in Git.
- Use an SSH key, and never share the root password or the contents of `.env.prod` (screenshots included).
- Ubuntu security updates install automatically; update the app with `release.sh` from the laptop.
