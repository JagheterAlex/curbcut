// Printing a scan result to PDF inside the Worker.
//
// The reason this exists: the result page used to end by telling the reader to
// run `npx curbcut --pdf`. The person that page is written for has just been
// asked by a customer whether their site meets EN 301 549. They are not going
// to install Node to answer it. We were handing a compliance manager a
// developer's instruction and calling it a deliverable.
//
// The document is `pdfHtml` from src/pdf-html.js — the same one the command
// line writes, imported rather than reimplemented, so the two cannot drift into
// producing different reports for the same site.
//
// Nothing here can cause a page fetch. It prints what is already in the cache
// and nothing else, so the worst anybody can do with this route is re-print a
// result that already exists.

import puppeteer from '@cloudflare/puppeteer';
import { pdfHtml } from '../../src/pdf-html.js';
export { reportFilename } from './report-name.js';

export async function renderPdf(env, analysis, meta) {
  const html = pdfHtml(analysis, {
    target: meta.target,
    generatedAt: meta.scannedAt,
    scannedUrls: [meta.target],
  });

  const browser = await puppeteer.launch(env.BROWSER);
  try {
    const page = await browser.newPage();
    // setContent, not goto: the document is already in hand, and a navigation
    // would be a second chance for this route to fetch something.
    await page.setContent(html, { waitUntil: 'load' });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate:
        '<div style="width:100%;font:8pt -apple-system,Arial,sans-serif;' +
        'color:#666;padding:0 16mm;display:flex;justify-content:space-between">' +
        '<span>EN 301 549 findings · ' +
        String(meta.target).replace(/[<>&]/g, '') +
        '</span><span class="pageNumber"></span></div>',
      margin: { top: '16mm', bottom: '18mm', left: '16mm', right: '16mm' },
    });
  } finally {
    await browser.close();
  }
}
