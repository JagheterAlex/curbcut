// Serves the deliberately broken demo locally, so the CLI can be pointed at it.
//
// The public copy is behind robots.txt — which is what stops our own release
// gate from failing on a page that exists to fail — so producing a sample
// report from the live URL would mean either disobeying our own robots rule or
// passing --ignore-robots and printing that admission on the report. Serving it
// here avoids both and produces the same bytes.
//
//   node scripts/serve-demo.mjs [port]

import { createServer } from 'node:http';
import { DEMO_PAGE, DEMO_CSS, DEMO_FRAME, DEMO_PRODUCTS, DEMO_CONTACT } from '../monitor/src/demo.js';

const port = Number(process.argv[2] ?? 8795);
const routes = {
  '/demo/broken.html': ['text/html; charset=utf-8', DEMO_PAGE],
  '/demo/broken.css': ['text/css; charset=utf-8', DEMO_CSS],
  '/demo/frame.html': ['text/html; charset=utf-8', DEMO_FRAME],
  '/demo/products.html': ['text/html; charset=utf-8', DEMO_PRODUCTS],
  '/demo/contact.html': ['text/html; charset=utf-8', DEMO_CONTACT],
};

createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  const hit = routes[pathname];
  if (!hit) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': hit[0] }).end(hit[1]);
}).listen(port, '127.0.0.1', () => console.log('demo on http://127.0.0.1:' + port));
