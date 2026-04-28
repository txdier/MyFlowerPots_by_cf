import { describe, expect, it, vi } from 'vitest';
import worker from '../../src/index';

function createExecutionContext() {
  return {
    waitUntil: vi.fn(),
  };
}

describe('worker entrypoint', () => {
  it('responds to CORS preflight requests', async () => {
    const response = await worker.fetch(
      new Request('https://example.test/api/pots', { method: 'OPTIONS' }),
      {},
      createExecutionContext()
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
  });

  it('returns JSON 404 for unknown API routes', async () => {
    const response = await worker.fetch(
      new Request('https://example.test/api/unknown'),
      {},
      createExecutionContext()
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual({ error: 'API Not Found' });
  });
});
