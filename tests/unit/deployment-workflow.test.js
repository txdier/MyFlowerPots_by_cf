import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('deployment workflow contract', () => {
  it('tracks the production Wrangler resource configuration', () => {
    expect(existsSync('wrangler.toml')).toBe(true);

    const gitignore = readFileSync('.gitignore', 'utf8');
    const wrangler = readFileSync('wrangler.toml', 'utf8');

    expect(gitignore).not.toMatch(/^wrangler\.toml$/m);
    expect(wrangler).toContain('name = "my-flower-pots-api"');
    expect(wrangler).toContain('database_id = "8c06be0c-af0c-43fc-99fb-b15c69fe6d2f"');
    expect(wrangler).toContain('binding = "STATIC_BUCKET"');
    expect(wrangler).not.toMatch(/^\[ai\]/m);
    expect(wrangler).not.toMatch(/^\[vars\]/m);
  });

  it('verifies every change and deploys production only after D1 migration', () => {
    const workflowPath = '.github/workflows/deploy.yml';
    expect(existsSync(workflowPath)).toBe(true);

    const workflow = readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain('pull_request:');
    expect(workflow).toContain('push:');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('npm run verify:full');
    expect(workflow).toContain('npx wrangler d1 time-travel info my-flower-pots');
    expect(workflow).toContain('npx wrangler d1 migrations apply my-flower-pots --remote');
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain('cancel-in-progress: false');
    expect(workflow).toContain('npm run deploy');
    expect(workflow.indexOf('d1 migrations apply')).toBeLessThan(workflow.indexOf('npm run deploy'));
  });

});
