/* Knightwatcher's website: the Worker in front of the static files in dist/. It runs before every
   request (run_worker_first in wrangler.jsonc) for two things the static files cannot do alone: it
   answers www.knightwatcher.io with a 301 to the same path and query on knightwatcher.io, and it
   sets the headers of site/headers.mjs on every response it passes on. Everything else, the 404
   page included, is the static files' own. It logs nothing. site/README.md describes it. */
import { headersFor } from '../headers.mjs';
import site from '../site.json' with { type: 'json' };

const APEX = 'knightwatcher.io';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === 'www.' + APEX) {
      url.hostname = APEX;
      url.protocol = 'https:';
      url.port = '';
      url.hash = '';
      return new Response(null, { status: 301, headers: { Location: url.href } });
    }
    const res = await env.ASSETS.fetch(request);
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(headersFor(url.pathname, site.analyticsToken || ''))) out.headers.set(k, v);
    return out;
  }
};
