import { describe, expect, it, vi } from 'vitest';
import worker from '../../src/index';

function createExecutionContext() {
  return {
    waitUntil: vi.fn(),
  };
}

function createAssetsResponse(html = '<!DOCTYPE html><html><head></head><body>ok</body></html>') {
  return {
    fetch: vi.fn(async () => new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=UTF-8' }
    }))
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

  it('serves robots.txt with the configured sitemap URL', async () => {
    const response = await worker.fetch(
      new Request('https://example.test/robots.txt'),
      { APP_BASE_URL: 'https://garden.example' },
      createExecutionContext()
    );

    const text = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/plain');
    expect(text).toContain('User-agent: *');
    expect(text).toContain('Disallow: /api/');
    expect(text).toContain('Sitemap: https://garden.example/sitemap.xml');
  });

  it('serves a sitemap containing only public canonical pages', async () => {
    const response = await worker.fetch(
      new Request('https://example.test/sitemap.xml'),
      { APP_BASE_URL: 'https://garden.example/' },
      createExecutionContext()
    );

    const text = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/xml');
    expect(text).toContain('<loc>https://garden.example/</loc>');
    expect(text).toContain('<loc>https://garden.example/about</loc>');
    expect(text).toContain('<loc>https://garden.example/help</loc>');
    expect(text).toContain('<loc>https://garden.example/privacy</loc>');
    expect(text).not.toContain('pot-detail');
    expect(text).not.toContain('profile');
  });

  it('injects canonical URLs for public indexable pages without noindex', async () => {
    const assets = createAssetsResponse(`<!DOCTYPE html>
      <html><head>
        <link rel="canonical" href="https://app.kaside365.com/about">
        <meta property="og:url" content="https://app.kaside365.com/about">
        <meta name="twitter:url" content="https://app.kaside365.com/about">
      </head><body>about</body></html>`);

    const response = await worker.fetch(
      new Request('https://example.test/about'),
      { APP_BASE_URL: 'https://garden.example', ASSETS: assets },
      createExecutionContext()
    );

    const text = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Robots-Tag')).toBeNull();
    expect(text).toContain('<link rel="canonical" href="https://garden.example/about">');
    expect(text).toContain('<meta property="og:url" content="https://garden.example/about">');
    expect(text).toContain('<meta name="twitter:url" content="https://garden.example/about">');
  });

  it('marks private static app pages as noindex', async () => {
    const assets = createAssetsResponse();
    const response = await worker.fetch(
      new Request('https://example.test/profile'),
      { ASSETS: assets },
      createExecutionContext()
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, follow');
  });

  it('marks pot detail token pages as noindex even when served as static HTML', async () => {
    const assets = createAssetsResponse();
    const response = await worker.fetch(
      new Request('https://example.test/pot-detail?token=share-token'),
      { ASSETS: assets },
      createExecutionContext()
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, follow');
  });
});
