/**
 * Prisma 7 keeps the connection URL out of the schema file, so migrations and
 * introspection read it from here instead.
 */

import { defineConfig, env } from 'prisma/config';

// Prisma 7 no longer reads .env on its own.
try {
  process.loadEnvFile();
} catch {
  // No .env: the URL is expected to come from the real environment.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
});
