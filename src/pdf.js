import { chromium } from 'playwright';
import { browserMissingError } from './scan.js';
import { pdfHtml } from './pdf-html.js';

// Printing the report to PDF with Playwright's Chromium — the same browser that
// does the scanning, so this adds no dependency.
//
// The document itself lives in pdf-html.js, which imports nothing, so the
// Worker behind curbcut.org/scan can render the identical report without
// Playwright. Two code paths producing two slightly different reports for the
// same site is exactly the kind of quiet inconsistency this tool exists to
// argue against.

export { pdfHtml };

export async function writePdf(analysis, meta, outPath) {
  const html = pdfHtml(analysis, meta);
  const date = (meta.generatedAt ?? new Date().toISOString()).slice(0, 10);

  let browser;
  try {
    browser = await chromium.launch();
  } catch (err) {
    throw browserMissingError(err) ?? err;
  }

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.pdf({
      path: outPath,
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `
        <div style="width:100%;font:8pt -apple-system,Arial,sans-serif;color:#666;
                    padding:0 16mm;display:flex;justify-content:space-between">
          <span>EN 301 549 findings · ${esc(meta.target ?? '')} · ${date}</span>
          <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
        </div>`,
      margin: { top: '18mm', bottom: '20mm', left: '16mm', right: '16mm' },
    });
    return outPath;
  } finally {
    await browser.close();
  }
}
