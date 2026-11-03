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
# Retries a command a few times: DNS on fresh servers can fail now and then
retry() { for i in 1 2 3 4 5; do "$@" && return 0; echo "  retry $i/5 in 5 s..."; sleep 5; done; return 1; }

step "System updates and base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get -y -q upgrade
apt-get -y -q install ca-certificates curl git ufw fail2ban unattended-upgrades
# Security updates install automatically
dpkg-reconfigure -f noninteractive unattended-upgrades
timedatectl set-timezone Asia/Jakarta || true

step "Swap (2 GB): safety margin for 1 GB of RAM"
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
echo 'vm.swappiness=10' > /etc/sysctl.d/99-whatsmontrack.conf
sysctl -q -p /etc/sysctl.d/99-whatsmontrack.conf

step "Docker"
if ! command -v docker >/dev/null; then
  retry curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sh /tmp/get-docker.sh
  rm -f /tmp/get-docker.sh
fi
# - small container logs (the disk is only 20 GB)
# - fixed IPv4 DNS for containers: Docker's default network has no IPv6, so IPv6 DNS servers
#   copied from the host make lookups inside containers fail intermittently
mkdir -p /etc/docker
if [ ! -f /etc/docker/daemon.json ]; then
  cat > /etc/docker/daemon.json <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" },
  "dns": ["1.1.1.1", "8.8.8.8"]
}
JSON
fi
systemctl enable --now docker
systemctl restart docker

step "DNS safety net (fix-dns.service)"
# Some VPS panels rewrite /etc/resolv.conf with their own (sometimes dead) DNS servers and disable
# systemd-resolved when the server is (re)started from the panel. This unit undoes that on every boot.
IFACE="$(ip route show default | awk '{print $5; exit}')"
cat > /etc/systemd/system/fix-dns.service <<UNIT
[Unit]
Description=Keep DNS on systemd-resolved with working servers (undo panel overrides)
After=systemd-networkd.service
Before=docker.service
[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/bin/systemctl start systemd-resolved.service
ExecStart=/usr/bin/ln -sf ../run/systemd/resolve/stub-resolv.conf /etc/resolv.conf
ExecStart=/usr/bin/resolvectl dns ${IFACE:-eth0} 1.1.1.1 8.8.8.8
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable systemd-resolved >/dev/null 2>&1 || true
systemctl enable --now fix-dns.service

step "Firewall: only SSH, HTTP and HTTPS"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null
systemctl enable --now fail2ban

step "Application code in $APP_DIR (branch $BRANCH)"
if [ -d "$APP_DIR/.git" ]; then
  retry git -C "$APP_DIR" fetch -q origin "$BRANCH"
  git -C "$APP_DIR" checkout -q "$BRANCH"
  git -C "$APP_DIR" pull -q --ff-only origin "$BRANCH"
else
  # A failed attempt can leave a partial folder behind; start clean on every try
  retry sh -c "rm -rf '$APP_DIR' && git clone -q --branch '$BRANCH' '$REPO_URL' '$APP_DIR'"
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
echo "  2. On your laptop: deploy/vps/release.sh   (builds the images and deploys them here)"
