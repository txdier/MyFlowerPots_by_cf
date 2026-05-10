import { mkdirSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

mkdirSync('Temp/wrangler-logs', { recursive: true });
process.env.WRANGLER_LOG_PATH ??= 'Temp/wrangler-logs';

const { cloudflareTest, readD1Migrations } = await import('@cloudflare/vitest-pool-workers');
const d1Migrations = await readD1Migrations('./migrations');

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: './wrangler.toml',
      },
      miniflare: {
        bindings: {
          JWT_SECRET: 'smoke-test-secret-with-enough-length',
          APP_BASE_URL: 'https://example.test',
          RESEND_API_KEY: '',
          EMAIL_FROM: 'noreply@example.test',
          TURNSTILE_TEST_BYPASS: 'true',
        },
      },
    }),
  ],
  test: {
    include: ['tests/smoke/**/*.test.ts'],
    globals: false,
    testTimeout: 30000,
    provide: {
      d1Migrations,
    },
  },
});
