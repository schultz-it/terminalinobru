import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';

// Le migrazioni vengono lette da Node e passate al Worker come binding, così i test girano su un
// D1 in memoria con lo schema reale invece che su uno schema ricopiato a mano.
const migrazioni = await readD1Migrations('./migrations');

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: { bindings: { MIGRAZIONI: migrazioni } },
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/preparazione.ts'],
  },
});
