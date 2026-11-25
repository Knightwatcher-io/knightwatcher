/* Knightwatcher's website: the response headers. One table, used twice: build.mjs writes it into
   dist/_headers for the static assets, and the Worker (src/index.mjs) sets the same headers on
   every response it passes on, so that they hold however Cloudflare serves the file. preview.mjs
   sets them on the local preview too. site/README.md describes them. */

/** The Web Analytics beacon's script, and where it sends its report when embedded by hand. */
export const BEACON_SCRIPT = 'https://static.cloudflareinsights.com/beacon.min.js';
export const BEACON_REPORT = 'https://cloudflareinsights.com';

/** Whether a path is the demo's: /demo and everything under it. */
export const isDemo = pathname => pathname === '/demo' || pathname.startsWith('/demo/');

/** The site's own pages: every page but the demo's, the docs and the legal pages among them.
 *  Only what is the site's own, the pictures and the brick and merlon drawings in the stylesheet
 *  (data: addresses), the demo in its frame, and with a token the beacon's script and its report.
 *  No page of the site may be framed. */
export function siteCsp(token) {
  return [
    "default-src 'none'",
    "script-src 'self'" + (token ? ' ' + BEACON_SCRIPT : ''),
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    ...(token ? ['connect-src ' + BEACON_REPORT] : []),
    "frame-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'"
  ].join('; ');
}

/** The demo: the display's own page, which loads and fetches only its own files and makes no
 *  outside request. Only the site's own pages may frame it. */
export const DEMO_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'"
].join('; ');

const COMMON = {
  'X-Content-Type-Options': 'nosniff',
  // Web Analytics needs the beacon's report to carry the page's origin, which this sends
  'Referrer-Policy': 'strict-origin-when-cross-origin'
};

/** The headers for a path, given the Web Analytics token ('' when there is none). */
export function headersFor(pathname, token = '') {
  return isDemo(pathname)
    ? { ...COMMON, 'Content-Security-Policy': DEMO_CSP, 'X-Frame-Options': 'SAMEORIGIN' }
    : { ...COMMON, 'Content-Security-Policy': siteCsp(token), 'X-Frame-Options': 'DENY' };
}

/** The same table as a _headers file: every path, then the demo's paths, which take off the
 *  site's policy and frame rule before setting their own. */
export function headersFile(token = '') {
  const block = (pattern, headers, detach = []) => [pattern, ...detach.map(h => '  ! ' + h), ...Object.entries(headers).map(([k, v]) => `  ${k}: ${v}`)].join('\n');
  const site = headersFor('/', token), demo = headersFor('/demo/', token);
  return [
    '# Written by site/build.mjs from site/headers.mjs. The Worker sets the same headers.',
    block('/*', site),
    block('/demo/*', { 'Content-Security-Policy': demo['Content-Security-Policy'], 'X-Frame-Options': demo['X-Frame-Options'] },
      ['Content-Security-Policy', 'X-Frame-Options'])
  ].join('\n\n') + '\n';
}
