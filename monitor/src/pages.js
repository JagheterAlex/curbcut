// Full HTML responses for form posts.
//
// The site has no JavaScript, so a form submission is a real navigation and the
// answer has to be a real page. These reuse /style.css from the same origin, so
// the reply looks like the site rather than like a raw endpoint.

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function shell(title, bodyHtml) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — Curbcut</title>
<meta name="robots" content="noindex">
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

export function page(html, status = 200) {
  return new Response(html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'x-content-type-options': 'nosniff',
    },
  });
}

export function thanks() {
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
