#!/usr/bin/env bash
#
# Manual runner for the daily and weekly scrapes (`pnpm scrape:daily`, `pnpm scrape:weekly`).
# Nothing schedules it: you run it yourself. Scheduling is out of scope for now.
#
# Order:
#   1. Kill switch from .env, so a paused scraper never touches the network.
#   2. News first (daily and weekly): `pnpm news:fetch` runs before the scrape, and a news
#      failure never stops the scrape.
#   3. caffeinate for the duration, so the laptop does not sleep mid-district.
#
# Output goes to the terminal and to ~/Library/Logs/dptos/scrape-<date>.log.
#
# Usage:
#   scripts/scrape-wrapper.sh daily
#   scripts/scrape-wrapper.sh weekly
#   scripts/scrape-wrapper.sh manual --districts=lince --operations=sale

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOG_DIR="${DPTOS_LOG_DIR:-$HOME/Library/Logs/dptos}"
mkdir -p "$LOG_DIR"
STAMP="$(date +%Y-%m-%d)"
LOG_FILE="$LOG_DIR/scrape-$STAMP.log"

exec > >(tee -a "$LOG_FILE") 2>&1

echo ""
echo "======== $(date -Iseconds) wrapper start ========"

# Load .env without exporting comments or empty lines.
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

if [[ "${SCRAPER_ENABLED:-true}" == "false" ]]; then
  echo "SCRAPER_ENABLED=false — exiting without scraping."
  exit 0
fi

MODE="${1:-daily}"
shift || true

SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
echo "gitSha=$SHA mode=$MODE"

case "$MODE" in
  daily)
    # Eleven target districts (every district dptos tracks), sale and rent. About an hour. Slugs must be the ones in
    # scraper/src/config/districts.ts; the scraper refuses any other.
    DISTRICTS="${SCRAPER_DAILY_DISTRICTS:-lince,jesus-maria,san-miguel,surquillo,magdalena,pueblo-libre,san-isidro,miraflores,barranco,santiago-de-surco,san-borja}"
    ARGS=(--mode=TARGET_DAILY --districts="$DISTRICTS" --operations=sale,rent)
    # News first, so a failed scrape does not skip it. A news failure never stops the scrape.
    pnpm news:fetch || echo "news:fetch failed; continuing with the scrape"
    ;;
  weekly)
    ARGS=(--mode=FULL_WEEKLY --operations=sale,rent)
    # News first, so a failed scrape does not skip it. A news failure never stops the scrape.
    pnpm news:fetch || echo "news:fetch failed; continuing with the scrape"
    ;;
  manual|*)
    ARGS=("$@")
    if [[ ${#ARGS[@]} -eq 0 ]]; then
      ARGS=(--mode=MANUAL)
    fi
    ;;
esac

echo "pnpm scrape ${ARGS[*]}"
# Prevent sleep for the duration. Without this a mid-scrape sleep leaves districts
# half-written and trips the sanity gate on the next run.
caffeinate -i pnpm scrape "${ARGS[@]}"
echo "======== $(date -Iseconds) wrapper done ========"
