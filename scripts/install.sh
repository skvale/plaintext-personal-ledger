#!/bin/sh
# Build the app and install `ledger-web` on PATH so it can be run from any
# directory:  ledger-web /path/to/data
set -e

HERE="$(cd "$(dirname "$0")" && pwd)/.."

# Build once (matches the production run path in ./run).
cd "$HERE"
rm -rf .svelte-kit
pnpm build

# Install into the first writable directory on PATH, in priority order.
DIR=""
for d in /usr/local/bin "$HOME/.local/bin" "$HOME/bin"; do
  case ":$PATH:" in
    *":$d:"*)
      mkdir -p "$d" 2>/dev/null
      if ln -sf "$HERE/run" "$d/ledger-web" 2>/dev/null; then
        DIR="$d"
        break
      fi
      ;;
  esac
done

if [ -z "$DIR" ]; then
  echo "No writable directory on your PATH found. Install manually:" >&2
  echo "  ln -sf $HERE/run /usr/local/bin/ledger-web" >&2
  exit 1
fi
echo "Installed: $DIR/ledger-web"
echo ""
echo "Run it from anywhere with:"
echo "  ledger-web ~/my-data"
echo ""
echo "Your journal lives in the data dir you point it at."
echo "Press Ctrl-C to stop the server."
