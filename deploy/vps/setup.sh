#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 VPS for WhatsMonTrack. Run as root:
#   curl -fsSL https://raw.githubusercontent.com/Kne34/WhatsMonTrack/deploy/vps/deploy/vps/setup.sh | bash
# Safe to run again: every step checks whether it was already done.
set -euo pipefail

REPO_URL="https://github.com/Kne34/WhatsMonTrack.git"
BRANCH="deploy/vps"
APP_DIR="/opt/whatsmontrack"

[ "$(id -u)" -eq 0 ] || { echo "Run as root (sudo -i)"; exit 1; }
step() { echo; echo "==> $*"; }

step "System updates and base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get -y -q upgrade
apt-get -y -q install ca-certificates curl git ufw fail2ban unattended-upgrades
# Security updates install automatically
dpkg-reconfigure -f noninteractive unattended-upgrades
timedatectl set-timezone Asia/Jakarta || true

step "Swap (2 GB) so building the images fits in 1 GB of RAM"
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
echo 'vm.swappiness=10' > /etc/sysctl.d/99-whatsmontrack.conf
sysctl -q --system

step "Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
# Keep container logs small (the disk is only 20 GB)
mkdir -p /etc/docker
if [ ! -f /etc/docker/daemon.json ]; then
  cat > /etc/docker/daemon.json <<'JSON'
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }
JSON
fi
systemctl enable --now docker
systemctl restart docker

step "Firewall: only SSH, HTTP and HTTPS"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null
systemctl enable --now fail2ban

step "Application code in $APP_DIR (branch $BRANCH)"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch -q origin "$BRANCH"
  git -C "$APP_DIR" checkout -q "$BRANCH"
  git -C "$APP_DIR" pull -q --ff-only origin "$BRANCH"
else
  git clone -q --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
chmod +x "$APP_DIR"/deploy/vps/*.sh

step "Daily database backup at 03:30 (kept 14 days in $APP_DIR/backups)"
cat > /etc/cron.d/whatsmontrack-backup <<CRON
30 3 * * * root $APP_DIR/deploy/vps/backup.sh >> /var/log/whatsmontrack-backup.log 2>&1
CRON
chmod 644 /etc/cron.d/whatsmontrack-backup

echo
echo "Done. Next:"
echo "  1. cd $APP_DIR && cp .env.prod.example .env.prod && nano .env.prod"
echo "  2. docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build"
