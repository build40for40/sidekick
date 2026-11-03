import { describe, expect, it } from 'vitest';
import { gzipSync, gunzipSync } from 'node:zlib';
import worker from '../hosting/worker';

describe('Cloudflare hosting', () => {
  it('redirects the bare mount path, retaining the query so relative assets resolve', async () => {
    const response = await worker.fetch(new Request('https://build40for40.com/sidekick?test=1'), {
      ASSETS: { fetch: async () => { throw new Error('Unexpected asset request'); } },
    });
    expect(response.status).toBe(308);
    expect(response.headers.get('Location')).toBe('https://build40for40.com/sidekick/?test=1');
  });

  it('serves compressed WASM bytes at their original URL with decoding headers', async () => {
    const original = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);
    let assetPath = '';
    const response = await worker.fetch(new Request('https://build40for40.com/sidekick/assets/runtime.wasm'), {
      ASSETS: { fetch: async request => {
        assetPath = new URL(request.url).pathname;
        return new Response(gzipSync(original), { headers: { 'Content-Type': 'application/gzip' } });
      } },
    });
    expect(assetPath).toBe('/assets/runtime.wasm.gz');
    expect(response.headers.get('Content-Type')).toBe('application/wasm');
    expect(response.headers.get('Content-Encoding')).toBe('gzip');
    expect(gunzipSync(Buffer.from(await response.arrayBuffer()))).toEqual(original);
  });

  it('keeps asset canonical redirects inside the mount path', async () => {
    const response = await worker.fetch(new Request('https://build40for40.com/sidekick/index.html'), {
      ASSETS: { fetch: async request => {
        expect(new URL(request.url).pathname).toBe('/index.html');
        return new Response(null, { status: 307, headers: { Location: '/' } });
      } },
    });
    expect(response.headers.get('Location')).toBe('https://build40for40.com/sidekick/');
  });

  it('preserves missing assets and supplies isolation and microphone headers', async () => {
    const response = await worker.fetch(new Request('https://build40for40.com/sidekick/assets/missing.wasm'), {
      ASSETS: { fetch: async () => new Response('Not found', { status: 404 }) },
    });
    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Encoding')).toBeNull();
    expect(response.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(response.headers.get('Cross-Origin-Embedder-Policy')).toBe('credentialless');
    expect(response.headers.get('Permissions-Policy')).toContain('microphone=(self)');
  });
});
