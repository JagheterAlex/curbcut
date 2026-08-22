// A local stand-in for Cloudflare Pages, used by the release gate.
//
// The gate scans the site with our own scanner and refuses to publish if the
// site fails. It used to serve the files with a generic static server, which
// meant it tested a version of the site nobody visits: no `_headers`, and so no
// Content Security Policy.
//
// That gap shipped a real defect. The day the site got `default-src 'none'`,
// the scanner stopped being able to scan it — the rule engine was injected as a
// <script> element, which the policy correctly refused — and the gate went on
// passing, because locally there was no policy to refuse anything. The scanner
// was fixed. This exists so the next thing of that shape is caught by a build
// instead of by hand.
//
// Deliberately small: it serves files, it applies the `/*` block of `_headers`,
// and it resolves extensionless paths the way Pages does. It is not a Pages
// emulator and should not grow into one.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

/**
 * Read the `/*` block of a Cloudflare Pages `_headers` file.
 *
 * Only the catch-all block, because that is the only one the site uses. If a
 * path-specific block is ever added, this returns the wrong answer for it — so
 * it throws rather than quietly serving headers the real site would not.
 */
export function parseHeaders(text) {
  const out = {};
  let inCatchAll = false;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!line.startsWith(' ') && !line.startsWith('\t')) {
      if (line.trim() === '/*') {
        inCatchAll = true;
        continue;
      }
      throw new Error(
        'serve-site only understands the /* block of _headers, and found ' +
          line.trim() +
          '. Teach it the new block or the release gate will test headers the ' +
          'real site does not serve.'
      );
    }
    if (!inCatchAll) continue;
    const at = line.indexOf(':');
    if (at < 0) continue;
    out[line.slice(0, at).trim().toLowerCase()] = line.slice(at + 1).trim();
  }
  return out;
}

async function resolveFile(root, pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const candidates = clean.endsWith('/')
    ? [join(root, clean, 'index.html')]
    : [join(root, clean), join(root, clean + '.html'), join(root, clean, 'index.html')];

  for (const candidate of candidates) {
    try {
      const info = await stat(candidate);
      if (info.isFile()) return candidate;
    } catch {
      // next candidate
    }
  }
  return null;
}

export async function serveSite(root, port) {
  let headers = {};
  try {
    headers = parseHeaders(await readFile(join(root, '_headers'), 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    const file = await resolveFile(root, pathname);

    if (!file) {
      const notFound = await resolveFile(root, '/404.html');
      const body = notFound ? await readFile(notFound) : 'Not found';
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8', ...headers });
      res.end(body);
      return;
    }

    res.writeHead(200, {
      'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      ...headers,
    });
    res.end(await readFile(file));
  });

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  return server;
}

// pathToFileURL rather than string-building: on Windows the built string has
// two slashes where import.meta.url has three, the comparison silently fails,
// and the server exits 0 having served nothing.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.argv[3] ?? 8799);
  const root = process.argv[2] ?? 'site';
  await serveSite(root, port);
  console.log(`serving ${root} on http://127.0.0.1:${port} with _headers applied`);
}
