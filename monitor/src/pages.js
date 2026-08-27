// Full HTML responses for form posts.
//
// The site has no JavaScript, so a form submission is a real navigation and the
// answer has to be a real page. These reuse /style.css from the same origin, so
// the reply looks like the site rather than like a raw endpoint.

export const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function shell(title, bodyHtml, opts = {}) {
  // Form responses and one-off results have no business in a search index.
  // The scanner's own landing page is the opposite: it is the page we most
  // want somebody searching for an EAA checker to find.
  const { index = false, description = '', canonical = '' } = opts;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — Curbcut</title>
${index ? '' : '<meta name="robots" content="noindex">'}
${description ? `<meta name="description" content="${esc(description)}">` : ''}
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
<link rel="stylesheet" href="/style.css">
</head>
<body>
<a class="skip" href="#main">Skip to main content</a>
<header class="masthead">
  <div class="wrap">
    <a class="wordmark" href="/">
      <svg width="22" height="16" viewBox="0 0 22 16" aria-hidden="true" focusable="false">
        <path d="M1 15h20" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".35"/>
        <path d="M1 11h6l4-9h10" fill="none" stroke="#f5c344" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      </svg>
      Curbcut
    </a>
    <nav aria-label="Primary">
      <ul>
        <li><a href="/">Home</a></li>
        <li><a href="/scan">Scan</a></li>
        <li><a href="/blog/">Writing</a></li>
      </ul>
    </nav>
  </div>
</header>
<main id="main">
<section>
<div class="wrap prose">
${bodyHtml}
</div>
</section>
</main>
<footer>
  <div class="wrap">
    <ul>
      <li><a href="/">Home</a></li>
      <li><a href="/terms">Terms</a></li>
      <li><a href="/privacy">Privacy</a></li>
      <li><a href="/accessibility">Accessibility statement</a></li>
      <li><!--email_off--><a href="mailto:hello@curbcut.org">hello@curbcut.org</a><!--email_on--></li>
    </ul>
    <p>Nothing on this site is legal advice.</p>
  </div>
</footer>
</body>
</html>`;
}

// The same policy the static site serves, kept here because a Worker response
// does not inherit the _headers file. These pages carry no script either, and
// the scanner result page renders markup taken from somebody else's website:
// everything is escaped on the way in, and this is the second line if that ever
// fails.
const SECURITY_HEADERS = {
  'content-security-policy':
    "default-src 'none'; style-src 'self'; img-src 'self' data:; " +
    "form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'permissions-policy':
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), ' +
    'magnetometer=(), microphone=(), payment=(), usb=()',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
};

export function page(html, status = 200, extra = {}) {
  return new Response(html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      ...SECURITY_HEADERS,
      ...extra,
    },
  });
}

export function thanks(kind = 'monitor') {
  if (kind === 'audit') {
    return shell(
      'Asked',
      `<h1>Asked. You will hear from a person.</h1>
       <p class="lede">Nothing is charged and nothing is started yet. The next
       message you get is a fixed price and a scope, and you decide from there.</p>

       <p>What happens now, in order:</p>
       <ol>
         <li>We confirm the address of the site and roughly how many pages it has.</li>
         <li>You get a <strong>fixed price</strong> before any work begins. If the
           site is much larger than 200 pages, the higher number is quoted then and
           not after.</li>
         <li>You pay, and the report arrives within <strong>two working days</strong>.</li>
       </ol>

       <p><strong>What the &euro;290 does not buy</strong>, in the same size type as
       the rest: nobody tests your site with a screen reader, tabs your checkout, or
       watches a person with a disability use it. Automated testing reaches roughly
       a third of accessibility barriers, and the report says so on its first page
       and lists the clauses that were never assessed. If you need the other
       two thirds, you need a manual audit, and it costs more than this from people
       who do it properly.</p>

       <p>We stored the address of the site, your email, and whatever you typed.
       Nothing else. Not your IP, not your browser, not a cookie.</p>

       <p><a href="/">Back to the home page</a>, or write to
       <!--email_off--><a href="mailto:hello@curbcut.org">hello@curbcut.org</a><!--email_on-->
       if you would rather add something.</p>`
    );
  }

  return shell(
    'Noted',
    `<h1>Noted.</h1>
     <p class="lede">Your address is on a list of people to tell when Monitor
     opens. That is the only thing it is on.</p>

     <p>To be explicit about what just happened, because a page that collects an
     email address owes you that:</p>
     <ul>
       <li>We stored your email address, and whatever you typed in the other two
         fields. Nothing else. Not your IP, not your browser, not a cookie —
         there was no script on that page to set one with.</li>
       <li>You will get <strong>one</strong> email, when Monitor is real enough to
         charge for. If it never becomes real, you will get an email saying that
         instead.</li>
       <li>There is no newsletter. Reply to any message, or write to
         <!--email_off--><a href="mailto:hello@curbcut.org">hello@curbcut.org</a><!--email_on-->,
         and the record is deleted the same day.</li>
     </ul>

     <p>If you said what you would use it for, that genuinely decides what gets
     built first. There is not much of a roadmap yet, which is the honest reason
     for asking.</p>

     <p>In the meantime the command line tool is finished, free and does not
     require any of this:</p>
     <pre class="cmd"><code>npx curbcut https://example.com --crawl --pdf</code></pre>

     <p><a href="/">Back to the site</a> · <a href="/blog/">Writing</a></p>`
  );
}

/**
 * The audit request form on a page of its own.
 *
 * It exists because the scan result page used to end in a `mailto:` link. That
 * is the exact failure we already watched happen in person: the button opens a
 * desktop mail client nobody has configured, and the enquiry evaporates. This
 * is the highest-intent moment in the whole funnel — somebody has just been
 * shown their own failing clauses — and it was the one place that asked them to
 * leave the browser.
 *
 * `site` is prefilled from the scan so they do not retype the address they just
 * typed, and `clauses` lets the page name what was found instead of pitching in
 * the abstract.
 */
export function auditForm({ site = '', clauses = null } = {}) {
  const found =
    Number.isFinite(clauses) && clauses > 0
      ? `<p class="lede">The scan you just ran found <strong>${clauses} failing
         clause${clauses === 1 ? '' : 's'}</strong> on one page. This covers the
         rest of the site.</p>`
      : `<p class="lede">One site, up to 200 pages, mapped onto EN&nbsp;301&nbsp;549
         clauses and delivered as a dated PDF. Two working days.</p>`;

  return shell(
    'Ask for a fixed price',
    `<h1>Have the audit done for you &mdash; &euro;290</h1>
     ${found}

     <p>What arrives: the whole site crawled, every finding mapped onto a clause
     of EN&nbsp;301&nbsp;549, ranked by regulatory exposure, as a dated PDF you can
     forward to whoever asked for it. With it, a draft accessibility statement and
     a fix list in the order a regulator would care about.</p>

     <div class="callout">
       <p><strong>Read one before you decide.</strong>
       <a href="/sample-report.pdf">The sample report</a> is a real run of three
       pages, produced by the same code a paid report comes out of &mdash; not a
       mock-up and not a redrawn version of one. It covers the shop we broke on
       purpose, so no customer of ours is being shown to you, and nothing in it
       has been tidied up.</p>
       <p class="micro">Every clause carries the elements that failed, the page
       each one is on, and the markup, so whoever fixes it does not have to
       guess what you meant.</p>
     </div>

     <div class="callout">
       <p><strong>What this is not: a manual audit.</strong> Nobody tests your site
       with a screen reader, tabs your checkout, or watches a person with a
       disability use it. Automated testing reaches roughly a third of accessibility
       barriers. The report says so on its first page and lists the clauses that
       were never assessed, rather than letting the silence read as a pass.</p>
       <p>Anyone selling a &euro;290 &ldquo;full accessibility audit&rdquo; is selling
       you something automation cannot deliver. This is the honest version of what it
       can, which is a real and useful thing to have and is not conformance.</p>
     </div>

     <form method="post" action="/api/audit" class="signup mt-15">
       <div class="fields">
         <div class="field">
           <label for="a-site">Site to audit <span class="hint">required</span></label>
           <input type="text" id="a-site" name="site" required autocomplete="url"
                  placeholder="example.com" value="${esc(site)}">
         </div>
         <div class="field">
           <label for="a-email">Where to send the price <span class="hint">required</span></label>
           <input type="email" id="a-email" name="email" required autocomplete="email"
                  placeholder="you@company.com">
         </div>
         <div class="field wide">
           <label for="a-notes">Roughly how many pages, and what you have been asked for
             <span class="hint">optional, and it changes the price</span></label>
           <textarea id="a-notes" name="use_case" rows="3"
                     placeholder="About 150 pages. Our largest customer asked for an accessibility statement before renewing."></textarea>
         </div>
       </div>

       <div class="trap" aria-hidden="true">
         <label for="a-cw">Leave this field empty</label>
         <input type="text" id="a-cw" name="company_website" tabindex="-1" autocomplete="off">
       </div>

       <p class="actions"><button class="btn btn-primary" type="submit">Ask for a fixed price</button></p>
     </form>

     <p class="small">Nothing is charged and nothing starts here. You get a fixed
     price back before anything is invoiced, and if the tool finds nothing worth
     reporting we will say so rather than pad a document. If the site is well over
     200 pages the higher number is quoted now, not afterwards.</p>

     <p class="mt-2"><a href="/scan">Check another page first</a> ·
     <a href="/">What this is</a></p>`,
    {
      index: true,
      canonical: 'https://curbcut.org/audit',
      description:
        'A dated EN 301 549 audit of one site up to 200 pages, delivered as a PDF ' +
        'with a statement draft and a fix list ordered by regulatory exposure. ' +
        '€290, two working days, automated testing only and it says so.',
    }
  );
}

export function notFound(pathname = '') {
  return shell(
    'Page not found',
    `<h1>There is nothing at this address.</h1>
     <p class="lede"><code>${esc(pathname)}</code> does not exist.</p>
     <ul>
       <li><a href="/scan">Check a page</a> against EN&nbsp;301&nbsp;549 in the browser.</li>
       <li><a href="/audit">Have the whole site audited</a> for &euro;290.</li>
       <li><a href="/">What this is</a> · <a href="/blog/">Writing</a></li>
     </ul>`
  );
}

export function errorPage(message) {
  return shell(
    'That did not work',
    `<h1>That did not work.</h1>
     <p class="lede">${esc(message)}</p>
     <p>Nothing was saved. Go <a href="/#pricing">back to the form</a> and try
     again, or write to
     <!--email_off--><a href="mailto:hello@curbcut.org">hello@curbcut.org</a><!--email_on-->
     and a person will sort it out.</p>`
  );
}

/**
 * The report was asked for after its result had expired.
 *
 * 410 rather than 404: the thing existed and is gone, which is the true answer
 * and the one that tells a link checker not to keep asking. Re-scanning quietly
 * would be worse than this page — it would put a different set of findings
 * under the date somebody thought they were saving.
 */
export function reportExpired(target = '') {
  const again = target
    ? `<form method="post" action="/scan" class="signup mt-15">
         <input type="hidden" name="url" value="${esc(target)}">
         <button type="submit" class="btn btn-primary">Check it again</button>
       </form>`
    : '<p class="actions"><a class="btn btn-primary" href="/scan">Check a page</a></p>';

  return shell(
    'That result has expired',
    `<h1>That result has expired.</h1>
     <p class="lede">Scan results are kept for fifteen minutes and then deleted,
     which is what the privacy policy promises and this is that promise being
     kept.</p>
     <p>We could have quietly run the scan again and handed you a PDF anyway. We
     did not, because the page may have changed in the meantime and you would
     have received a different set of findings under the date you thought you
     were saving. A dated report describes one moment or it is worth nothing.</p>
     ${again}
     <p class="micro">For reports you can keep, schedule and compare over time,
     the command line tool writes the same PDF on your own machine and keeps
     nothing on ours:</p>
     <pre class="cmd"><code>npx curbcut ${esc(target || 'https://example.com')} --pdf</code></pre>`
  );
}
