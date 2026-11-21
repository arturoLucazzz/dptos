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

export function runModeLabel(mode: string): string {
  return MODE_LABELS[mode] ?? mode;
}

export function formatRunDate(iso: string): string {
  return new Date(iso).toLocaleString('es-PE', { timeZone: 'America/Lima', hour12: false });
}
