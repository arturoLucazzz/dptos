/**
 * The seed writes fake listings and its `--reset` deletes real ones, favorites and
 * notes included. It runs only on a database named for it, so pointing it at the
 * real database by mistake stops before the first query.
 */

const ALLOWED = /_(seed|dev)$/;

export function assertSeedDatabase(databaseUrl: string | undefined): string {
  let name = '';
  try {
    name = decodeURIComponent(new URL(databaseUrl ?? '').pathname.replace(/^\//, ''));
  } catch {
    name = '';
  }
  if (!ALLOWED.test(name)) {
    throw new Error(
      `El seed solo corre en una base que termina en _seed o _dev. Base actual: ${name || '(ninguna)'}`
    );
  }
  return name;
}
