#!/bin/bash
# Quick local preview only — for real deployment, drop this whole folder
# into Apache (or any web server) instead. This just avoids the
# file:// / fetch() browser restriction for local testing.
cd "$(dirname "$0")"
PORT=8080
echo "Starting local preview server on http://localhost:$PORT ..."
if command -v npx >/dev/null 2>&1; then
  ( sleep 1; command -v open >/dev/null 2>&1 && open "http://localhost:$PORT" || xdg-open "http://localhost:$PORT" 2>/dev/null ) &
  npx --yes http-server -p "$PORT"
elif command -v python3 >/dev/null 2>&1; then
  ( sleep 1; command -v open >/dev/null 2>&1 && open "http://localhost:$PORT" || xdg-open "http://localhost:$PORT" 2>/dev/null ) &
  python3 -m http.server "$PORT"
else
  echo "Need Node.js or Python 3 installed to run a local preview server."
  read -p "Press enter to close..."
fi
