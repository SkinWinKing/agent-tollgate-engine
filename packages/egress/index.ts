/**
 * Outbound relay for agent-tollgate-engine. Some origins outside Cloudflare answer 525 to subrequests made from the
 * skinwinking.com custom domain; the same fetch from a Worker without that zone context succeeds. Called over its
 * workers.dev URL with a shared secret, so it is not a public proxy.
 */
export default {
  async fetch(request: Request, env: { EGRESS_TOKEN?: string }): Promise<Response> {
    if (!env.EGRESS_TOKEN || request.headers.get('x-egress-token') !== env.EGRESS_TOKEN) return new Response('not found', { status: 404 });
    const target = request.headers.get('x-egress-url');
    if (!target || !/^https:\/\//.test(target)) return new Response('missing x-egress-url', { status: 400 });
    const headers = new Headers(request.headers);
    headers.delete('x-egress-url');
    headers.delete('host');
    headers.delete('x-egress-token');
    const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer();
    return fetch(target, { method: request.method, headers, body });
  },
};
