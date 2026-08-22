// A page broken on purpose, so the scanner can be seen before it is used.
//
// Six of every ten people who open /scan leave without typing anything. The
// most likely reason is the obvious one: the page asks for work — find a URL,
// paste it, wait — before showing what the work buys. This gives them the whole
// output first, on a page whose failures we control.
//
// The defects are not invented. They are the ones the August study actually
// found across 149 of the most-visited EU-domain sites, in roughly the
// proportions it found them: a link a screen reader announces as nothing (49%
// of the sites failing Name, Role, Value), an untitled iframe carrying an advert
// (30%), a button with no accessible name (28%), ARIA that does not resolve
// (16%), plus the contrast, target-size and missing-alt failures that made up
// the rest of the table. So the example is not a strawman built to make the
// tool look busy — it is a composite of the real European web.
//
// It keeps the address the first article, the README and the home page have
// been pointing at since 20 August — /demo/broken.html — because a published
// command that stops working is a worse cost than a tidier URL. What changed is
// what lives there: the original was eight lines of obviously fake markup, this
// is a page whose faults were chosen from measurements.
//
// It is served by the Worker rather than by Pages so this one path can allow
// frame-src, which the site-wide `default-src 'none'` forbids and the untitled
// advert frame needs. robots.txt disallows /demo/, which is also what keeps the
// release gate's crawl from failing on a page that exists to fail. The
// accessibility statement names it: a company selling accessibility reports
// while quietly hosting a broken page is the thing we sell against.

export const DEMO_PAGE_URL = 'https://curbcut.org/demo/broken.html';

export const DEMO_CSS = `
:root { --ink:#1c1c1c; --paper:#fff; --line:#e2e2e2; --brand:#7a5a2f; }
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--paper); color: var(--ink);
  font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.note {
  background: #10261c; color: #eafff5; padding: 1rem 1.25rem;
  font-size: .95rem; line-height: 1.5;
}
.note a { color: #9fe8c7; }
.wrap { max-width: 60rem; margin: 0 auto; padding: 1.5rem 1.25rem 4rem; }
header.bar {
  display: flex; align-items: center; gap: 1rem;
  border-bottom: 1px solid var(--line); padding: 1rem 0;
}
.logo { font-weight: 700; font-size: 1.15rem; letter-spacing: -.01em; }
.icons { margin-left: auto; display: flex; gap: .75rem; align-items: center; }
.icons a { display: inline-flex; }

/* Deliberate: the links in this row are 16px tall and 4px apart, so they miss
   both the 24px minimum of WCAG 2.2 success criterion 2.5.8 and the spacing
   exception that would otherwise excuse it. */
.utility { display: flex; gap: 4px; padding: .35rem 0; font-size: .78rem; }
.utility a { display: inline-block; height: 16px; line-height: 16px; color: var(--brand); }

h1 { font-size: 1.7rem; margin: 2rem 0 .5rem; }

/* Deliberate: 2.9:1 against white, under the 4.5:1 that 1.4.3 requires. */
.muted { color: #9a9a9a; }

.grid { display: grid; grid-template-columns: 1fr 18rem; gap: 2rem; margin-top: 2rem; }
@media (max-width: 48rem) { .grid { grid-template-columns: 1fr; } }
.card { border: 1px solid var(--line); border-radius: 6px; padding: 1.25rem; }
.thumb { width: 72px; height: 72px; border-radius: 4px; background: #f0ece6; }
.row { display: flex; gap: 1rem; align-items: center; padding: .75rem 0; }
.row + .row { border-top: 1px solid var(--line); }
input[type="text"], input[type="email"] {
  width: 100%; padding: .6rem .7rem; border: 1px solid #c8c8c8; border-radius: 4px;
  font: inherit;
}
.field { margin-bottom: 1rem; }
button, .btn {
  font: inherit; border: 0; border-radius: 4px; padding: .7rem 1.1rem;
  background: var(--brand); color: #fff; cursor: pointer;
}
.iconbtn { background: none; color: var(--ink); padding: .3rem .45rem; font-size: 1.1rem; }
.promo { margin-top: 2rem; border: 1px solid var(--line); border-radius: 6px; }
.promo iframe { display: block; width: 100%; height: 90px; border: 0; }
footer { border-top: 1px solid var(--line); margin-top: 3rem; padding-top: 1rem; }
body.ad {
  margin: 0; height: 90px; display: flex; align-items: center;
  justify-content: center; background: #f5f1ea; color: #6b5c45; font-size: .9rem;
}
.mt { margin-top: 1.5rem; }

/* Deliberate: 16px icons 4px apart. Too small for WCAG 2.2 success criterion
   2.5.8, and too close together for the spacing exception that would otherwise
   forgive them. The one criterion arriving in V4.1.1 that a scanner can see. */
.cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-top: 1.5rem; }
@media (max-width: 40rem) { .cards { grid-template-columns: 1fr; } }

/* Deliberate: 18px tall, 3px apart. Under 2.5.8 and under its spacing
   exception, the same way the footer icons are. */
.tiny { display: inline-block; height: 18px; line-height: 18px; padding: 0 6px;
        margin-top: .5rem; background: var(--brand); color: #fff;
        border-radius: 3px; font-size: 11px; }
.pager { display: flex; gap: 3px; margin-top: 2rem; }
.pager a { display: inline-flex; align-items: center; justify-content: center;
           width: 18px; height: 18px; font-size: 11px; color: var(--brand);
           border: 1px solid var(--line); border-radius: 3px; }

/* Deliberate: the only marker of a required field is its colour, and the
   colour itself is under 4.5:1 on white. */
.req { color: #e0a0a0; }
input.req { border-color: #e0a0a0; }

.social { display: flex; gap: 4px; margin-top: .75rem; }
.social a {
  display: inline-block; width: 16px; height: 16px; border-radius: 3px;
  background: var(--brand);
}
`;

// A 1x1 transparent PNG. Real enough for the rule that matters here — the
// missing alternative text — without shipping a photograph.
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4' +
  '2mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// No inline <style>: this is served under the same `style-src 'self'` policy as
// everything else, so the stylesheet is the shared one. The frame's only job is
// to exist without a title on the element that embeds it.
export const DEMO_FRAME = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Advertisement</title>
<link rel="stylesheet" href="/demo/broken.css">
</head><body class="ad">An advertisement would be here.</body></html>`;

// The three pages share a banner, a masthead and a footer. Everything that
// differs between them is a defect chosen on purpose; everything identical is
// there so a crawl of the demo looks like a crawl of a small shop, which is
// what the sample report is meant to show.
const banner = (self) => `
<div class="note">
  <strong>This page is broken on purpose.</strong> It is not a real shop and
  nothing here works. Curbcut hosts it so the scanner can be seen working on
  pages with known failures, without pointing at somebody else's website. The
  faults are the ones our
  <a href="/blog/european-web-readiness-2026">August study</a> found most often
  across 149 of the most-visited websites on EU domains.
  <a href="/scan/example">See what the scanner makes of it</a>, or
  <a href="/scan">check a page of your own</a>.
</div>`;

const chromeFoot = `
  <footer>
    <p class="muted">Example Store is not a company. These pages exist to
    demonstrate an accessibility scanner.</p>
    <div class="social">
      <a href="/demo/broken.html" aria-label="Example Store on Mastodon"></a>
      <a href="/demo/broken.html" aria-label="Example Store on Instagram"></a>
      <a href="/demo/broken.html" aria-label="Example Store on YouTube"></a>
      <a href="/demo/broken.html" aria-label="Example Store newsletter"></a>
    </div>
  </footer>`;

const shopNav = `
  <nav class="utility" aria-label="Utility">
    <a href="/demo/products.html">Shop</a>
    <a href="/demo/broken.html">Basket</a>
    <a href="/demo/contact.html">Contact</a>
    <a href="/demo/broken.html">Store finder</a>
  </nav>`;

export const DEMO_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Checkout — Example Store</title>
<link rel="stylesheet" href="/demo/broken.css">
</head>
<body>

<div class="note">
  <strong>This page is broken on purpose.</strong> It is not a real shop and
  nothing here works. Curbcut hosts it so the scanner can be seen working on a
  page with known failures, without pointing at somebody else's website. The
  faults are the ones our
  <a href="/blog/european-web-readiness-2026">August study</a> found most often
  across 149 of the most-visited websites on EU domains.
  <a href="/scan/example">See what the scanner makes of it</a>, or
  <a href="/scan">check a page of your own</a>.
</div>

<div class="wrap">

  <header class="bar">
    <span class="logo">Example Store</span>
    <div class="icons">
      <!-- A link a screen reader announces as nothing: an image with no
           alternative text, inside a link with no text of its own. The single
           most common failure in the study. -->
      <a href="/demo/broken.html"><img src="${PIXEL}" width="20" height="20"></a>
      <!-- A button whose only content is a decorative glyph. -->
      <button class="iconbtn" aria-hidden="false"><span aria-hidden="true">&#9776;</span></button>
      <!-- A control given an ARIA role without the state that role requires,
           so assistive technology is told what it is but never whether it is
           on. -->
      <span role="checkbox" tabindex="0">Gift wrap</span>
    </div>
  </header>

  <nav class="utility" aria-label="Utility">
    <a href="/demo/broken.html">Track order</a>
    <a href="/demo/broken.html">Returns</a>
    <a href="/demo/broken.html">Gift cards</a>
    <a href="/demo/broken.html">Store finder</a>
  </nav>

  <h1>Checkout</h1>
  <p class="muted">Free delivery on orders over &euro;40. Estimated arrival in
  two to four working days.</p>

  <div class="grid">
    <div>
      <div class="card">
        <div class="row">
          <div class="thumb"></div>
          <div>
            <div><strong>House Blend, 500&nbsp;g</strong></div>
            <div class="muted">Ground for filter</div>
          </div>
        </div>
        <div class="row">
          <div class="thumb"></div>
          <div>
            <div><strong>Ceramic mug</strong></div>
            <div class="muted">350&nbsp;ml, dishwasher safe</div>
          </div>
        </div>
      </div>

      <div class="card mt">
        <h2>Delivery details</h2>
        <div class="field">
          <label for="d-name">Full name</label>
          <input type="text" id="d-name" name="name">
        </div>
        <div class="field">
          <label for="d-email">Email</label>
          <input type="email" id="d-email" name="email">
        </div>
        <div class="field">
          <!-- No label, and a placeholder is not one. -->
          <input type="text" name="promo" placeholder="Promotional code">
        </div>
        <button type="button">Continue to payment</button>
      </div>

      <div class="promo">
        <!-- An advert in an untitled frame: the second most common failure in
             the study, and almost always an advert. -->
        <iframe src="/demo/frame.html"></iframe>
      </div>
    </div>

    <aside class="card">
      <h2>Order summary</h2>
      <p>Subtotal &euro;27.50<br>Delivery &euro;4.90<br><strong>Total &euro;32.40</strong></p>
      <p class="muted">Prices include VAT.</p>
    </aside>
  </div>

  <footer>
    <p class="muted">Example Store is not a company. This page exists to
    demonstrate an accessibility scanner.</p>
    <div class="social">
      <a href="/demo/broken.html" aria-label="Example Store on Mastodon"></a>
      <a href="/demo/broken.html" aria-label="Example Store on Instagram"></a>
      <a href="/demo/broken.html" aria-label="Example Store on YouTube"></a>
      <a href="/demo/broken.html" aria-label="Example Store newsletter"></a>
    </div>
  </footer>

</div>
</body>
</html>`;

// A product listing. Different defects from the checkout on purpose: a sample
// report that shows the same three rules on every page teaches nobody what a
// crawl adds over a single scan.
export const DEMO_PRODUCTS = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Coffee — Example Store</title>
<link rel="stylesheet" href="/demo/broken.css">
</head>
<body>
${banner('products')}
<div class="wrap">
  <header class="bar">
    <span class="logo">Example Store</span>
  </header>
  ${shopNav}

  <h1>Coffee</h1>
  <!-- Heading levels jump from 1 to 4, so anybody navigating by heading finds
       the page has no visible structure between the title and the products. -->
  <h4>Filter</h4>
  <p class="muted">Twelve roasts, ground or whole bean.</p>

  <div class="cards">
    <div class="card">
      <img src="${PIXEL}" width="120" height="120">
      <p><strong>House Blend</strong></p>
      <p class="muted">&euro;9.50</p>
      <a class="tiny" href="/demo/broken.html">Add</a>
    </div>
    <div class="card">
      <img src="${PIXEL}" width="120" height="120" alt="">
      <p><strong>Single Origin, Kenya</strong></p>
      <p class="muted">&euro;13.00</p>
      <a class="tiny" href="/demo/broken.html">Add</a>
    </div>
    <div class="card">
      <img src="${PIXEL}" width="120" height="120">
      <p><strong>Decaf</strong></p>
      <p class="muted">&euro;9.50</p>
      <a class="tiny" href="/demo/broken.html">Add</a>
    </div>
  </div>

  <!-- Pagination as bare numbers: each link says nothing on its own, and the
       targets are well under the size WCAG 2.2 will ask for. -->
  <nav class="pager" aria-label="Pages">
    <a href="/demo/products.html">1</a>
    <a href="/demo/products.html">2</a>
    <a href="/demo/products.html">3</a>
    <a href="/demo/products.html">&rsaquo;</a>
  </nav>
${chromeFoot}
</div>
</body>
</html>`;

// A contact form. The failures here are the ones that stop somebody completing
// a task rather than merely reading: a field with no label at all, a select
// with no accessible name, and a required field marked only by colour.
export const DEMO_CONTACT = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Contact us — Example Store</title>
<link rel="stylesheet" href="/demo/broken.css">
</head>
<body>
${banner('contact')}
<div class="wrap">
  <header class="bar">
    <span class="logo">Example Store</span>
  </header>
  ${shopNav}

  <h1>Contact us</h1>
  <p class="muted">We answer within two working days. Fields marked in
  <span class="req">red</span> are required.</p>

  <div class="card mt">
    <div class="field">
      <label for="c-name">Your name</label>
      <input type="text" id="c-name" name="name">
    </div>
    <div class="field">
      <!-- No label element and no accessible name of any kind. A screen reader
           announces an edit field and nothing else. -->
      <input type="email" name="email" class="req">
    </div>
    <div class="field">
      <!-- A select with no label: the options are readable, the question is not. -->
      <select name="topic">
        <option>An order</option>
        <option>A delivery</option>
        <option>Something else</option>
      </select>
    </div>
    <div class="field">
      <label for="c-msg">Message</label>
      <textarea id="c-msg" name="message" rows="4"></textarea>
    </div>
    <button type="button">Send</button>
  </div>
${chromeFoot}
</div>
</body>
</html>`;
