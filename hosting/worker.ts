import { handleModelCatalog, handleTutor, type TutorEnv } from './tutor';
interface Env extends TutorEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/sidekick/api/models') return handleModelCatalog(request, env);
    if (url.pathname === '/sidekick/api/tutor') return handleTutor(request, env);
    if (url.pathname === '/sidekick') {
      url.pathname = '/sidekick/';
      return Response.redirect(url.href, 308);
    }
    if (!url.pathname.startsWith('/sidekick/')) return new Response('Not found', { status: 404 });

    url.pathname = url.pathname.slice('/sidekick'.length);
    const wasm = url.pathname.endsWith('.wasm');
    if (wasm) url.pathname += '.gz';
    const asset = await env.ASSETS.fetch(new Request(url, request));
    const headers = new Headers(asset.headers);
    const location = headers.get('Location');
    if (location) {
      const redirect = new URL(location, url);
      if (redirect.origin === url.origin) {
        redirect.pathname = `/sidekick${redirect.pathname}`;
        headers.set('Location', redirect.href);
      }
    }
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
    headers.set('Permissions-Policy', 'microphone=(self), camera=(), geolocation=()');
    headers.set('X-Content-Type-Options', 'nosniff');
    if (wasm && asset.ok) {
      headers.set('Content-Type', 'application/wasm');
      headers.set('Content-Encoding', 'gzip');
    }
    // Workers must pass already-compressed WASM through without encoding it again.
    return new Response(asset.body, {
      status: asset.status,
      statusText: asset.statusText,
      headers,
      encodeBody: 'manual',
    } as ResponseInit & { encodeBody: 'manual' });
  },
};
