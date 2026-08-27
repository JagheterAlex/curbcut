// What the downloaded report is called.
//
// Its own module, with no imports, for the same reason pdf-html.js is: the file
// next to it needs @cloudflare/puppeteer, which exists only inside a Worker.
// A test that wanted to check this one pure function pulled the browser library
// in behind it and took CI down — the second time this week that something
// passed here and failed there.

/** A filename somebody can still recognise in a downloads folder six weeks on. */
export function reportFilename(target, scannedAt) {
  let host = 'report';
  try {
    host = new URL(target).hostname.replace(/^www\./, '').replace(/[^a-z0-9.-]/gi, '');
  } catch {
    // Keep the fallback: a name is not worth failing a download over.
  }
  return `curbcut-${host}-${scannedAt.slice(0, 10)}.pdf`;
}
