import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { pdfHtml } from './src/pdf.js';
import { scanUrls } from './src/scan.js';
import { analyze } from './src/analyze.js';
import { DEMO_PAGE, DEMO_CSS, DEMO_FRAME, DEMO_PRODUCTS, DEMO_CONTACT } from './monitor/src/demo.js';
const routes = {
  '/demo/broken.html': ['text/html; charset=utf-8', DEMO_PAGE],
  '/demo/products.html': ['text/html; charset=utf-8', DEMO_PRODUCTS],
  '/demo/contact.html': ['text/html; charset=utf-8', DEMO_CONTACT],
  '/demo/broken.css': ['text/css; charset=utf-8', DEMO_CSS],
  '/demo/frame.html': ['text/html; charset=utf-8', DEMO_FRAME],
};
const srv = createServer((req,res)=>{const{pathname}=new URL(req.url,'http://x');const h=routes[pathname];if(!h){res.writeHead(404).end('x');return;}res.writeHead(200,{'content-type':h[0]}).end(h[1]);});
await new Promise(r=>srv.listen(8798,'127.0.0.1',r));
const pages = await scanUrls(['/demo/broken.html','/demo/products.html','/demo/contact.html'].map(p=>'http://127.0.0.1:8798'+p));
for (const p of pages) p.url = 'https://curbcut.org' + new URL(p.url).pathname;
const html = pdfHtml(analyze(pages), { target: 'https://curbcut.org/demo/', scannedUrls: pages.map(p=>p.url), orgName: 'Example Store (a demonstration, not a real company)' });
const b = await chromium.launch();
const pg = await (await b.newContext({ viewport: { width: 820, height: 1100 } })).newPage();
await pg.setContent(html, { waitUntil: 'load' });
const total = await pg.evaluate(() => document.body.scrollHeight);
console.log('total height', total);
const out = process.argv[2];
for (let i = 0, y = 0; y < total && i < 6; i++, y += 1050) {
  await pg.screenshot({ path: out + '/page-' + i + '.png', clip: { x: 0, y, width: 820, height: Math.min(1050, total - y) } });
}
await b.close(); srv.close();
