import { defineConfig } from 'drizzle-kit';

// `pnpm db:generate` writes the SQL migrations to ./drizzle; they are committed and applied by `pnpm db:migrate`.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
