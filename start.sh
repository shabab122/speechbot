#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20 or later is required. Install Node, then run ./start.sh again."
  exit 1
fi
exec node scripts/serve.cjs
