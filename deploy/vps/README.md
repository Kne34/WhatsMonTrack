# Deploy WhatsMonTrack ke VPS (panduan belajar)

Panduan ini mengajak kamu men-deploy sendiri, langkah demi langkah, dengan penjelasan **kenapa** setiap langkah dilakukan. Target: VPS Ubuntu 24.04 dengan 1 GB RAM (contoh: Rumahweb VPS S, IP `80.43.0.155`).

Hasil akhirnya:
- Web dashboard dan REST API di `https://80-43-0-155.sslip.io` (HTTPS otomatis, tanpa beli domain).
- Bot WhatsApp menyala 24 jam.
- Database ter-backup setiap hari.

---

## 0. Gambaran besar

```
 Browser / aplikasi Android
          │  HTTPS (443)
          ▼
 ┌──────────────── VPS ─────────────────┐
 │  Caddy  ── /api/* ──►  api (NestJS)  │◄──► WhatsApp, Gemini, email
 │    │                     │           │
 │    └── lainnya ──► web   ▼           │
 │              (Next.js)  postgres     │
 └──────────────────────────────────────┘
```

Semua bagian berjalan sebagai **container Docker** yang diatur oleh satu file: `docker-compose.prod.yml`.

| Bagian | Fungsi | Kenapa begini |
|---|---|---|
| **Caddy** | Satu-satunya pintu masuk dari internet (port 80/443). Mengurus sertifikat HTTPS sendiri | HTTPS wajib supaya password dan token tidak bisa diintip. Caddy memperpanjang sertifikat otomatis |
| **api** | Backend NestJS + bot WhatsApp | Dijalankan dari hasil build (`node dist/main`), bukan mode dev, supaya hemat RAM dan stabil |
| **web** | Dashboard Next.js | Sama: hasil build production |
| **postgres** | Database | **Tidak** dibuka ke internet, hanya bisa diakses container lain |

> **Beda dengan `docker-compose.yml` (development):** di laptop ada master, replica dan Pgpool. Di satu VPS itu tidak menambah keamanan data (kalau VPS mati, semuanya ikut mati) tapi memakan RAM. Di produksi cukup satu PostgreSQL ditambah **backup harian**.

**Istilah singkat:** *SSH* = remote terminal ke server · *container* = aplikasi yang dibungkus beserta semua kebutuhannya · *image* = "cetakan" container · *volume* = penyimpanan yang tetap ada walau container dihapus · *reverse proxy* = server yang meneruskan request ke aplikasi di belakangnya.

---

## 1. Masuk ke VPS lewat SSH

Di Windows, buka **PowerShell** (SSH sudah bawaan Windows 10/11):

```powershell
ssh root@80.43.0.155
```

- Pertama kali akan muncul *"The authenticity of host … can't be established"*. Ketik `yes`. Ini menyimpan "sidik jari" server supaya lain kali kamu tahu kalau ada yang menyamar.
- Masukkan **password root** dari panel Rumahweb (ikon mata di *Password Root*). Saat mengetik password, layar memang tidak menampilkan apa-apa; itu normal.

Berhasil kalau prompt berubah menjadi seperti `root@whatsmon:~#`. Semua perintah selanjutnya dijalankan **di VPS**, kecuali disebut lain.

### Ganti password root (penting)
Password dari panel pernah tampil di layar/email. Ganti dengan yang hanya kamu tahu:

```bash
passwd
```

### (Disarankan) Login pakai SSH key, bukan password
Kunci SSH jauh lebih aman dari password. Di **PowerShell laptop** (bukan di VPS):

```powershell
ssh-keygen -t ed25519            # tekan Enter terus; boleh isi passphrase
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh root@80.43.0.155 "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
ssh root@80.43.0.155             # sekarang tidak menanyakan password VPS lagi
```

`id_ed25519` (tanpa `.pub`) adalah kunci rahasiamu: **jangan pernah dibagikan**. File `.pub` boleh ditaruh di server mana pun.

---

## 2. Siapkan server (sekali saja)

```bash
curl -fsSL https://raw.githubusercontent.com/Kne34/WhatsMonTrack/deploy/vps/deploy/vps/setup.sh -o setup.sh
less setup.sh        # baca dulu isinya (q untuk keluar) — biasakan membaca skrip sebelum menjalankannya sebagai root
bash setup.sh
```

Yang dilakukan `setup.sh` (5–10 menit):

| Langkah | Kenapa |
|---|---|
| `apt upgrade` + *unattended-upgrades* | Menambal celah keamanan, dan ke depannya update keamanan terpasang otomatis |
| Zona waktu Asia/Jakarta | Jam di log dan jadwal backup sesuai WIB |
| **Swap 2 GB** | "RAM cadangan" di disk. Build aplikasi butuh lebih dari 1 GB RAM sesaat; tanpa swap build bisa gagal karena kehabisan memori |
| **Docker** | Menjalankan semua container |
| Batas log Docker (10 MB × 3) | Disk hanya 20 GB; log yang tidak dibatasi bisa memenuhi disk |
| **Firewall (ufw)**: hanya port 22, 80, 443 | Port lain tertutup dari internet |
| **fail2ban** | Memblokir IP yang berkali-kali salah login SSH (bot penebak password sangat banyak di internet) |
| `git clone` ke `/opt/whatsmontrack` | Mengambil kode branch `deploy/vps` |
| Jadwal backup 03:30 setiap hari | Lihat bagian 6 |

Cek hasilnya:
```bash
docker --version        # Docker terpasang
ufw status              # 22, 80, 443 ALLOW
free -h                 # baris "Swap" berisi 2.0Gi
```

---

## 3. Isi konfigurasi rahasia

```bash
cd /opt/whatsmontrack
cp .env.prod.example .env.prod
openssl rand -hex 32     # salin hasilnya untuk POSTGRES_PASSWORD
openssl rand -hex 48     # salin hasilnya untuk JWT_SECRET
nano .env.prod
```

Di `nano`: pindah baris dengan panah, tempel dengan klik kanan, simpan dengan **Ctrl+O** lalu **Enter**, keluar dengan **Ctrl+X**.

| Variabel | Isi |
|---|---|
| `SITE_ADDRESS` | `80-43-0-155.sslip.io` (IP dengan tanda `-`). sslip.io adalah DNS gratis yang otomatis mengarah ke IP itu, sehingga Caddy bisa mendapat sertifikat HTTPS tanpa domain |
| `POSTGRES_PASSWORD` | Hasil `openssl rand -hex 32` |
| `JWT_SECRET` | Hasil `openssl rand -hex 48`. Dipakai menandatangani token login; kalau bocor, orang bisa memalsukan login |
| `GEMINI_API_KEY` | Dari Google AI Studio |
| `ADMIN_EMAILS` | Email yang boleh melihat QR bot |
| `BREVO_API_KEY` + `MAIL_FROM` **atau** `SMTP_*` | Pengirim email OTP. Gmail: `SMTP_USER` = alamat Gmail, `SMTP_PASS` = *App Password* 16 karakter |

Lindungi file ini supaya hanya root yang bisa membaca:
```bash
chmod 600 .env.prod
```

`.env.prod` sudah masuk `.gitignore`, jadi tidak akan pernah ter-upload ke GitHub.

---

## 4. Jalankan

Supaya perintahnya pendek, buat *alias* (singkatan) sekali saja:

```bash
echo "alias dc='docker compose -f /opt/whatsmontrack/docker-compose.prod.yml --env-file /opt/whatsmontrack/.env.prod'" >> ~/.bashrc
source ~/.bashrc
```

Lalu:

```bash
cd /opt/whatsmontrack
dc up -d --build
```

- `--build`: membuat image dari kode (pertama kali 5–15 menit di VPS 1 GB; wajar kalau terasa lama).
- `-d` (*detached*): berjalan di latar belakang, terminal bisa ditutup.
- Saat start, **api menerapkan migration database** secara otomatis.

Cek:
```bash
dc ps                       # semua service "Up", postgres "(healthy)"
dc logs -f api              # log API (Ctrl+C untuk berhenti melihat; aplikasinya tetap jalan)
dc logs caddy | grep -i certificate   # Caddy mendapatkan sertifikat HTTPS
```

Buka di browser: **https://80-43-0-155.sslip.io/api/health** → harus `{"ok":true}`, lalu **https://80-43-0-155.sslip.io** → halaman login.

---

## 5. Pemakaian pertama
1. **Buat akun** dengan email yang ada di `ADMIN_EMAILS`, lalu masukkan kode OTP dari email.
2. **Bot WhatsApp** (menu kiri bawah) → scan QR dengan WhatsApp **nomor bot**: *Perangkat tertaut → Tautkan perangkat*. QR juga muncul di `dc logs -f api`.
3. **Hubungkan WhatsApp** → hubungkan nomormu sendiri, lalu tambahkan rekening.

Untuk aplikasi Android nanti, alamat API-nya: `https://80-43-0-155.sslip.io/api`.

---

## 6. Perawatan sehari-hari

| Kebutuhan | Perintah |
|---|---|
| Lihat status | `dc ps` |
| Lihat log | `dc logs -f api` (atau `web`, `caddy`, `postgres`) |
| Restart satu service | `dc restart api` |
| Pemakaian RAM/CPU | `docker stats` |
| Sisa disk / RAM | `df -h` · `free -h` |
| **Update aplikasi** setelah ada commit baru | `/opt/whatsmontrack/deploy/vps/update.sh` |
| Backup sekarang | `/opt/whatsmontrack/deploy/vps/backup.sh` |
| Lihat daftar backup | `ls -lh /opt/whatsmontrack/backups` |

`update.sh` melakukan: `git pull` → **backup dulu** → build ulang yang berubah → hapus image lama supaya disk tidak penuh.

### Backup
Setiap hari pukul 03:30 database (termasuk sesi WhatsApp) disimpan ke `/opt/whatsmontrack/backups`, 14 hari terakhir dipertahankan.

Backup di disk yang sama **tidak** melindungi kalau VPS-nya hilang. Sesekali salin ke laptop (di **PowerShell laptop**):
```powershell
scp root@80.43.0.155:/opt/whatsmontrack/backups/*.sql.gz .
```

### Restore (mengembalikan backup)
```bash
cd /opt/whatsmontrack
dc stop api web
dc exec -T postgres psql -U whatsmon -d postgres -c "DROP DATABASE whatsmon WITH (FORCE);" -c "CREATE DATABASE whatsmon OWNER whatsmon;"
gunzip -c backups/whatsmon-YYYY-MM-DD-HHMM.sql.gz | dc exec -T postgres psql -U whatsmon -d whatsmon
dc start api web
```

---

## 7. Kalau ada masalah

| Gejala | Cek / solusi |
|---|---|
| Build berhenti dengan `Killed` / `exit code 137` | Kehabisan RAM: pastikan swap aktif (`free -h`), lalu `dc up -d --build` lagi |
| Browser: sertifikat tidak valid / tidak bisa dibuka | `dc logs caddy`. Pastikan port 80 dan 443 terbuka (`ufw status`) dan `SITE_ADDRESS` benar. Let's Encrypt butuh port 80 untuk verifikasi |
| `502 Bad Gateway` | API/web belum siap atau crash: `dc ps`, `dc logs api` |
| API restart terus | `dc logs api`: biasanya ada variabel `.env.prod` yang salah atau kosong |
| OTP tidak masuk | `dc logs api \| grep -i mail`. Cek App Password Gmail / sender Brevo. Lihat folder spam |
| Bot minta QR lagi | Bot dikeluarkan dari *Perangkat tertaut* di HP bot. Scan ulang lewat menu **Bot WhatsApp** |
| Disk penuh | `docker system df`, lalu `docker image prune -f` dan `docker builder prune -f` |
| Lupa perintah | Semua perintah `dc` = `docker compose -f docker-compose.prod.yml --env-file .env.prod` |

## 8. Keamanan, ringkas
- Hanya Caddy (80/443) dan SSH (22) yang terbuka; database dan API tidak bisa diakses langsung dari internet.
- Rahasia hanya ada di `.env.prod` (chmod 600), tidak pernah di Git.
- Pakai SSH key, dan jangan bagikan password root atau isi `.env.prod` (termasuk lewat screenshot).
- Update keamanan Ubuntu berjalan otomatis; update aplikasi lewat `update.sh`.
