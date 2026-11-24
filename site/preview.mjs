/* Knightwatcher's website: a local preview of the built site, on the loopback alone.

     node site/build.mjs && node site/preview.mjs [PORT]

   It serves site/dist/ at http://127.0.0.1:PORT/ (8788 by default) as the Worker does in the ways
   a page can tell: the headers of headers.mjs on every answer, a folder's index.html at its address
   with a slash, a folder's address without the slash redirected to it, and 404.html with the status
   404 for anything else. Ctrl-C stops it. site/README.md describes the site. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { headersFor } from './headers.mjs';
import { readToken } from './build.mjs';

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8' };

/** A request handler serving `dist` with the headers for `token`. */
export function handler(dist = DIST, token = readToken()) {
  return (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    let rel;
    try { rel = decodeURIComponent(url.pathname); } catch (e) { rel = '/'; }
    const file = path.join(dist, path.normalize(rel));
    const send = (status, body, type, extra = {}) => {
      res.writeHead(status, { ...headersFor(url.pathname, token), 'Content-Type': type, 'Cache-Control': 'no-store', ...extra });
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    const inside = file === dist || file.startsWith(dist + path.sep);
    let stat = null;
    try { stat = inside ? fs.statSync(file) : null; } catch (e) { stat = null; }
    if (stat && stat.isDirectory() && !url.pathname.endsWith('/')) return send(307, '', 'text/plain', { Location: url.pathname + '/' + url.search });
    const target = stat && stat.isDirectory() ? path.join(file, 'index.html') : file;
    if (inside && path.basename(target) !== '_headers' && fs.existsSync(target) && fs.statSync(target).isFile()) {
      return send(200, fs.readFileSync(target), TYPES[path.extname(target)] || 'application/octet-stream');
    }
    return send(404, fs.readFileSync(path.join(dist, '404.html')), TYPES['.html']);
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.error('preview: no site/dist/index.html; run node site/build.mjs first'); process.exit(1); }
  const port = Number(process.argv[2] || 8788);
  http.createServer(handler()).listen(port, '127.0.0.1', () => console.log(`preview: http://127.0.0.1:${port}/`));
}
