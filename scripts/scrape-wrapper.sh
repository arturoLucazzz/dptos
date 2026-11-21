#!/usr/bin/env bash
#
# Wrapper the launchd jobs call. Keeps the plists thin and the kill switches in one place.
#
# Order matters:
#   1. Kill switch from .env, so a paused scraper never touches the network.
#   2. Optional git pull, before the run starts, never mid-run.
#   3. Stale-run catch-up: if the last success was more than STALE_HOURS ago, run anyway
#      even when launchd fired late after a full shutdown.
#   4. caffeinate for the duration, so the laptop does not sleep mid-district.
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

exec >>"$LOG_FILE" 2>&1

echo ""
echo "======== $(date -Iseconds) wrapper start ========"

# Load .env without exporting comments or empty lines. launchd does not source it.
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

# Deploy is "merge to main"; the worker picks it up on the next run. Pulling mid-run
# would leave half a scrape under one SHA and half under another.
if [[ "${SCRAPER_GIT_PULL:-1}" == "1" ]]; then
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "git pull --ff-only"
    git pull --ff-only || echo "git pull failed; continuing with the current checkout"
  fi
fi

SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
echo "gitSha=$SHA mode=$MODE"

STALE_HOURS="${SCRAPER_STALE_HOURS:-20}"

# When the laptop was off overnight, StartCalendarInterval does not fire the missed
# job. The daily plist still runs on next login; this check makes a late fire useful
# instead of a no-op when nothing is "due".
needs_run() {
  node --import tsx --env-file-if-exists=.env -e "
    import { prisma } from './lib/db.ts';
    import { ScrapeStatus } from './lib/generated/prisma/enums.ts';
    const hours = Number(process.env.SCRAPER_STALE_HOURS || $STALE_HOURS);
    const latest = await prisma.scrapeRun.findFirst({
      // A manual /agregar entry records only 'manual' and is not a scrape.
      where: { status: { in: [ScrapeStatus.SUCCESS, ScrapeStatus.PARTIAL] }, NOT: { sources: { equals: ['manual'] } } },
      orderBy: { startedAt: 'desc' },
      select: { startedAt: true, status: true },
    });
    await prisma.\$disconnect();
    if (!latest) { console.log('no prior run'); process.exit(0); }
    const ageH = (Date.now() - latest.startedAt.getTime()) / 3_600_000;
    console.log('last ' + latest.status + ' ' + ageH.toFixed(1) + 'h ago (stale at ' + hours + 'h)');
    process.exit(ageH >= hours ? 0 : 10);
  "
}

case "$MODE" in
  daily)
    # Ten target districts, sale and rent. About an hour. Slugs must be the ones in
    # scraper/src/config/districts.ts; the scraper refuses any other.
    DISTRICTS="${SCRAPER_DAILY_DISTRICTS:-lince,jesus-maria,san-miguel,surquillo,magdalena,pueblo-libre,san-isidro,miraflores,barranco,santiago-de-surco}"
    ARGS=(--mode=TARGET_DAILY --districts="$DISTRICTS" --operations=sale,rent)
    # News first, so a failed scrape does not skip it. A news failure never stops the scrape.
    pnpm news:fetch || echo "news:fetch failed; continuing with the scrape"
    if ! needs_run; then
      echo "Last successful run is fresh; daily catch-up not needed."
      # Still run: the calendar interval is the source of truth for "daily". The
      # stale check only decides whether a *manual* catch-up is warranted. For the
      # scheduled daily job we always scrape.
    fi
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
