/** Spanish labels and dates for the /runs page. The time zone is fixed so server and browser agree. */

const STATUS_LABELS: Record<string, string> = {
  RUNNING: 'En curso',
  SUCCESS: 'Completa',
  PARTIAL: 'Parcial',
  FAILED: 'Falló',
};

const MODE_LABELS: Record<string, string> = {
  TARGET_DAILY: 'Diaria',
  FULL_WEEKLY: 'Semanal',
  MANUAL: 'Manual',
  PROBE: 'Prueba',
};

export function runStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

const STATUS_TONES: Record<string, string> = {
  SUCCESS: 'bg-gain/15 text-gain',
  PARTIAL: 'bg-warn/15 text-warn',
  FAILED: 'bg-loss/15 text-loss',
  RUNNING: 'bg-primary/15 text-primary',
};

/** Badge colors from the dark theme tokens, so a status never shows as a pale block. */
export function runStatusTone(status: string): string {
  return STATUS_TONES[status] ?? '';
}

export function runModeLabel(mode: string): string {
  return MODE_LABELS[mode] ?? mode;
}

export function formatRunDate(iso: string): string {
  return new Date(iso).toLocaleString('es-PE', { timeZone: 'America/Lima', hour12: false });
}
