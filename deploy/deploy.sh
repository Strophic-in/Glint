#!/usr/bin/env bash
# Ship the API to the Oracle VM and restart it. Run from the repo root (Git Bash / WSL / macOS / Linux):
#   ./deploy/deploy.sh                       # default host below
#   GLINT_HOST=ubuntu@1.2.3.4 ./deploy/deploy.sh
# Uploads server/ (without node_modules, dist or .env) and deploy/, rebuilds the image on the VM
# (native arm64), restarts the container and waits for /health. The VM's server/.env is never touched.
set -euo pipefail

HOST="${GLINT_HOST:-ubuntu@140.245.196.3}"
KEY="${GLINT_SSH_KEY:-$HOME/.ssh/oracle.key}"
DIR="/opt/glint"
SSH=(ssh -i "$KEY" -o BatchMode=yes "$HOST")

cd "$(dirname "$0")/.."
echo "▸ Uploading to $HOST:$DIR"
tar -czf - --exclude=node_modules --exclude=dist --exclude=data --exclude=.env --exclude='*.log' server deploy \
  | "${SSH[@]}" "sudo mkdir -p $DIR && sudo chown \$(whoami) $DIR && tar -xzf - -C $DIR"

echo "▸ Building and restarting"
"${SSH[@]}" bash -s <<EOF
set -euo pipefail
cd $DIR/deploy
test -f ../server/.env || { echo "Missing $DIR/server/.env (see docs/DEPLOY.md)"; exit 1; }
sudo docker compose up -d --build --remove-orphans
for i in \$(seq 1 30); do
  if curl -fsS http://127.0.0.1:18400/health >/dev/null; then echo "✓ healthy: \$(curl -s http://127.0.0.1:18400/health)"; exit 0; fi
  sleep 2
done
echo "✗ API did not become healthy. Logs:"; sudo docker logs --tail 60 glint-api; exit 1
EOF
