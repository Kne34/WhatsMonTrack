#!/usr/bin/env bash
# Builds the production images on THIS machine (laptop) and deploys them to the VPS.
# A 1 vCPU / 1 GB server is too slow to build them itself, so it only runs what is built here.
#
# Usage (Git Bash on Windows, or Linux/macOS terminal; Docker running):
#   deploy/vps/release.sh                 # deploys to root@80.43.0.155
#   deploy/vps/release.sh root@1.2.3.4    # or another server
set -euo pipefail

VPS="${1:-${VPS:-root@80.43.0.155}}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TARBALL="whatsmontrack-images.tar.gz"
cd "$ROOT"
step() { echo; echo "==> $*"; }

# The server runs `git pull`, so the images must be built from exactly what is on GitHub
branch="$(git rev-parse --abbrev-ref HEAD)"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "You have uncommitted changes. Commit and push them first."; exit 1
fi
git fetch -q origin "$branch"
if [ "$(git rev-parse HEAD)" != "$(git rev-parse "origin/$branch")" ]; then
  echo "Branch $branch differs from GitHub. Push (or pull) first."; exit 1
fi
[ "$branch" = "deploy/vps" ] || echo "Note: releasing branch '$branch' (the server tracks deploy/vps)."

step "Building the images (linux/amd64, same as the server)"
docker build --platform linux/amd64 -t whatsmontrack-prod-api:latest -f backend/api/Dockerfile.prod backend/api
docker build --platform linux/amd64 -t whatsmontrack-prod-web:latest frontend

step "Packing them into $TARBALL"
docker save whatsmontrack-prod-api:latest whatsmontrack-prod-web:latest | gzip > "$TARBALL"
ls -lh "$TARBALL"

step "Uploading to $VPS"
scp "$TARBALL" "$VPS:/root/$TARBALL"

step "Applying the release on the server"
# Pull first, so the server runs the update.sh of this release (not the one it had before)
# (retried: a DNS hiccup on the server should not abort the release)
ssh "$VPS" "cd /opt/whatsmontrack && for i in 1 2 3 4 5; do git pull -q --ff-only && break; [ \$i = 5 ] && exit 1; echo '  git pull failed, retrying in 5 s...'; sleep 5; done && chmod +x deploy/vps/*.sh && ./deploy/vps/update.sh /root/$TARBALL"

rm -f "$TARBALL"
echo
echo "Release done."
