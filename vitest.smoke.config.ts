import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

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
