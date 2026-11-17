/**
 * The location refresh at the end of a scrape. It must never fail the scrape: a
 * refresh error is recorded on the run, and an error while recording it is only logged.
 */

type Counts = { scored: number; outsideLima: number; noCoordinates: number };

export async function runLocationRefresh(
  refresh: () => Promise<Counts>,
  recordError: (message: string) => Promise<void>,
): Promise<Counts | null> {
  try {
    return await refresh();
  } catch (error) {
    const message = `location refresh failed: ${error instanceof Error ? error.message : String(error)}`;
    console.error(message);
    try {
      await recordError(message);
    } catch (recordFailure) {
      console.error('could not record the location refresh failure on the run', recordFailure);
    }
    return null;
  }
}
