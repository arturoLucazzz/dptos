#!/usr/bin/env bash
# Install or refresh the launchd jobs for this checkout.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEST="$HOME/Library/LaunchAgents"
LOG_DIR="$HOME/Library/Logs/dptos"
mkdir -p "$DEST" "$LOG_DIR"

for job in daily weekly; do
  label="com.dptos.scrape.$job"
  src="$ROOT/ops/launchd/$label.plist"
  dst="$DEST/$label.plist"

  # Rewrite WorkingDirectory and script paths to this checkout, so cloning to a
  # different folder does not leave the plist pointing at a dead path.
  sed \
    -e "s|/Users/arturoLucazzz/Code/dptos|$ROOT|g" \
    -e "s|/Users/arturoLucazzz|$HOME|g" \
    "$src" > "$dst"

  launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$dst"
  echo "installed $label -> $dst"
done

echo ""
echo "Pause:     SCRAPER_ENABLED=false in $ROOT/.env"
echo "Unload:    launchctl bootout gui/\$(id -u)/com.dptos.scrape.daily"
echo "Run now:   launchctl kickstart -k gui/\$(id -u)/com.dptos.scrape.daily"
echo "Logs:      $LOG_DIR/"
