import { mkdirSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

mkdirSync('Temp/wrangler-logs', { recursive: true });
process.env.WRANGLER_LOG_PATH ??= 'Temp/wrangler-logs';

const { cloudflareTest } = await import('@cloudflare/vitest-pool-workers');

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: './wrangler.toml',
      },
    }),
  ],
  test: {
    include: ['tests/worker/**/*.test.ts'],
    globals: false,
  },
});
