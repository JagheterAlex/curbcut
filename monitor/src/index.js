// Curbcut Monitor — the API behind curbcut.org.
//
// Two constraints shape every decision in this file.
//
// The site ships no JavaScript, so anything here has to work as a plain HTML
// form post with a full page response. No fetch, no JSON body, no client-side
// validation standing between a person and the ability to contact us.
//
// The privacy policy says we collect almost nothing, so this stores exactly what
// somebody typed into a form and nothing else. No IP, no user agent, no
// fingerprint, no analytics beacon. If that ever changes, the policy changes
// first.

import {
  page, thanks, errorPage, auditForm, notFound, reportExpired,
} from './pages.js';
import { scanForm, scanResult, scanBusy, exampleResult } from './scan-pages.js';
import {
  DEMO_PAGE, DEMO_CSS, DEMO_FRAME, DEMO_PRODUCTS, DEMO_CONTACT,
} from './demo.js';
import exampleScan from './example-scan.json';
import { validateTarget, robotsAllows, scanOnePage } from './scan.js';
import {
  checkRateLimit, checkFormLimit, checkPdfLimit, readCachedScan, writeCachedScan,
} from './limits.js';
import {
  countUsage,
  SCAN_VIEWED, SCAN_RAN, SCAN_CACHED, SCAN_REFUSED, SCAN_FAILED, SCAN_LIMITED,
  INTEREST_LEFT, AUDIT_ASKED, AUDIT_VIEWED, EXAMPLE_VIEWED, FORM_TRAPPED,
  PDF_PRINTED, PDF_EXPIRED,
} from './usage.js';
import { notifyInterest } from './notify.js';
import { renderPdf, reportFilename } from './pdf.js';

const MAX_FIELD = 400;

/** Rough shape check. Deliberately permissive: rejecting valid addresses is a
 *  worse failure than accepting one that bounces. */
function looksLikeEmail(value) {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (v.length < 6 || v.length > 254) return false;
  if (/\s/.test(v)) return false;
  const at = v.indexOf('@');
  if (at < 1 || at !== v.lastIndexOf('@')) return false;
  const domain = v.slice(at + 1);
  return domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.');
}

function clean(value) {
  if (typeof value !== 'string') return null;
  // Strip control characters only. Anything else a person typed is theirs to
  // have typed, including punctuation this file has no opinion about.
  const v = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!v) return null;
  return v.slice(0, MAX_FIELD);
}

// Which form this came from. The audit is the only thing on sale today, and a
// waiting-list signup for a product that does not exist is a different event
// entirely: one is a person who might pay this week, the other is a person who
// might pay next year. Counting them in one number would have hidden the first
// real customer inside a mailing list.
const KINDS = new Set(['monitor', 'audit']);

async function recordInterest(env, fields, sourceUrl, kind = 'monitor') {
  const email = clean(fields.get('email'));
  if (!looksLikeEmail(email)) {
    return { ok: false, reason: 'email' };
  }

  // A hidden field no human fills in. Bots do. Answering 200 rather than an
  // error means they have nothing to tune against.
  if (clean(fields.get('company_website'))) {
    return { ok: true, spam: true };
  }

  const row = {
    id: crypto.randomUUID(),
    email: email.toLowerCase(),
    site: clean(fields.get('site')),
    use_case: clean(fields.get('use_case')),
    source: sourceUrl,
    created_at: new Date().toISOString(),
    kind: KINDS.has(kind) ? kind : 'monitor',
  };

  await env.DB.prepare(
    `INSERT INTO interest (id, email, site, use_case, source, created_at, kind)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
     ON CONFLICT(email, kind) DO UPDATE SET
       site       = COALESCE(excluded.site, interest.site),
       use_case   = COALESCE(excluded.use_case, interest.use_case),
       removed_at = NULL`
  )
    .bind(row.id, row.email, row.site, row.use_case, row.source, row.created_at, row.kind)
    .run();

  return { ok: true, row };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return new Response('ok', {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }

    if (url.pathname === '/audit' || url.pathname === '/audit/') {
      // A GET-only page. The form on it posts to /api/audit like every other.
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method not allowed', {
          status: 405,
          headers: { allow: 'GET, HEAD' },
        });
      }
      const clauses = Number(url.searchParams.get('clauses'));
      const html = auditForm({
        site: (url.searchParams.get('site') ?? '').slice(0, 200),
        clauses: Number.isFinite(clauses) ? clauses : null,
      });
      const res = page(html, 200);
      if (request.method === 'HEAD') {
        return new Response(null, { status: 200, headers: res.headers });
      }
      countUsage(env, ctx, AUDIT_VIEWED, request);
      return res;
    }

    // The page broken on purpose, and the example report of it. Six of every
    // ten visitors who open the scanner leave without entering a URL, and the
    // likeliest reason is that the page asks for work before showing what the
    // work buys. Both are GET-only and neither touches a browser.
    if (url.pathname.startsWith('/demo/') || url.pathname.startsWith('/scan/example')) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method not allowed', {
          status: 405, headers: { allow: 'GET, HEAD' },
        });
      }
      const body = (html, extra) => {
        const res = page(html, 200, extra);
        return request.method === 'HEAD'
          ? new Response(null, { status: 200, headers: res.headers })
          : res;
      };

      if (url.pathname === '/demo/broken.css') {
        const res = new Response(DEMO_CSS, {
          headers: {
            'content-type': 'text/css; charset=utf-8',
            'cache-control': 'public, max-age=3600',
            'x-content-type-options': 'nosniff',
          },
        });
        return request.method === 'HEAD'
          ? new Response(null, { status: 200, headers: res.headers })
          : res;
      }

      // Two headers relaxed, on these paths only. The demo embeds an untitled
      // advert frame, because an untitled advert frame is the second most
      // common failure on the real web — the site-wide `default-src 'none'`
      // would stop it loading, and DENY would stop it displaying. Same origin
      // in both cases.
      const demoHeaders = {
        'content-security-policy':
          "default-src 'none'; style-src 'self'; img-src 'self' data:; " +
          "frame-src 'self'; form-action 'none'; base-uri 'none'; " +
          "frame-ancestors 'self'",
        'x-frame-options': 'SAMEORIGIN',
      };

      if (url.pathname === '/demo/broken.html') return body(DEMO_PAGE, demoHeaders);
      if (url.pathname === '/demo/products.html') return body(DEMO_PRODUCTS, demoHeaders);
      if (url.pathname === '/demo/contact.html') return body(DEMO_CONTACT, demoHeaders);
      if (url.pathname === '/demo/frame.html') return body(DEMO_FRAME, demoHeaders);
      if (url.pathname === '/scan/example' || url.pathname === '/scan/example/') {
        if (request.method === 'GET') countUsage(env, ctx, EXAMPLE_VIEWED, request);
        return body(exampleResult(exampleScan));
      }
      return page(notFound(url.pathname), 404);
    }

    // The result as a PDF, for the reader who was previously told to install
    // Node to get one. Only ever prints what is already cached, so this route
    // cannot make us fetch anybody's page.
    if (url.pathname === '/scan/report.pdf') {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method not allowed', {
          status: 405, headers: { allow: 'GET, HEAD' },
        });
      }

      // Normalised through the same function the scan route uses, because the
      // cache is keyed on the normalised address. Without this, a request for
      // `example.com` cannot find the result stored under `https://example.com/`
      // and every report reads as expired the moment it is asked for.
      const asked = validateTarget(url.searchParams.get('u') ?? '');
      const wanted = asked.url ?? '';
      const cached = wanted ? await readCachedScan(env, wanted) : null;
      if (!cached) {
        // Deliberately not a re-scan. The result is fifteen minutes old at most
        // by design, and quietly running a fresh one would put a different set
        // of findings under the same date somebody thought they were saving.
        countUsage(env, ctx, PDF_EXPIRED, request);
        return page(reportExpired(wanted), 410);
      }

      const budget = await checkPdfLimit(env, request);
      if (!budget.ok) return page(errorPage(budget.reason), 429);

      let bytes;
      try {
        bytes = await renderPdf(env, cached.analysis, {
          target: wanted, scannedAt: cached.scannedAt,
        });
      } catch (err) {
        console.error('pdf render failed', err && err.message);
        return page(
          errorPage(
            'The report could not be printed. The result itself is fine — go ' +
              'back and read it in the browser, or use the command line tool, ' +
              'which writes the same PDF on your machine.'
          ),
          502
        );
      }

      countUsage(env, ctx, PDF_PRINTED, request);
      const headers = {
        'content-type': 'application/pdf',
        'content-disposition':
          'attachment; filename="' + reportFilename(wanted, cached.scannedAt) + '"',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      };
      return request.method === 'HEAD'
        ? new Response(null, { status: 200, headers })
        : new Response(bytes, { headers });
    }

    if (url.pathname === '/scan' || url.pathname === '/scan/') {
      // HEAD is a GET without a body, and answering 405 to it breaks link
      // checkers and monitoring for no reason. Not counted as a view: nothing
      // looked at the page.
      if (request.method === 'HEAD') {
        const res = page(scanForm(), 200);
        return new Response(null, { status: 200, headers: res.headers });
      }
      if (request.method === 'GET') {
        countUsage(env, ctx, SCAN_VIEWED, request);
        return page(scanForm(), 200);
      }
      if (request.method !== 'POST') {
        return new Response('Method not allowed', {
          status: 405, headers: { allow: 'GET, HEAD, POST' },
        });
      }

      let fields;
      try {
        fields = await request.formData();
      } catch {
        return page(scanForm('', 'That form submission could not be read.'), 400);
      }

      const raw = fields.get('url');
      const checked = validateTarget(typeof raw === 'string' ? raw : '');
      if (checked.error) {
        countUsage(env, ctx, SCAN_REFUSED, request);
        return page(scanForm(typeof raw === 'string' ? raw : '', checked.error), 400);
      }
      const target = checked.url;

      const cachedResult = await readCachedScan(env, target);
      if (cachedResult) {
        countUsage(env, ctx, SCAN_CACHED, request);
        return page(
          scanResult(cachedResult.analysis, {
            target,
            cached: true,
            scannedAt: cachedResult.scannedAt,
          }),
          200
        );
      }

      const limit = await checkRateLimit(env, request);
      if (!limit.ok) {
        countUsage(env, ctx, SCAN_LIMITED, request);
        return page(scanBusy(limit.reason, limit.retryAfter), 429);
      }

      if (!(await robotsAllows(target))) {
        countUsage(env, ctx, SCAN_REFUSED, request);
        return page(
          scanForm(
            target,
            'That site’s robots.txt asks crawlers to stay off this path, so we ' +
              'did not fetch it. The command line tool can scan it from your own ' +
              'machine, where you are not a stranger.'
          ),
          403
        );
      }

      let analysis;
      try {
        analysis = await scanOnePage(env, target);
      } catch (err) {
        countUsage(env, ctx, err && err.code === 'BUSY' ? SCAN_LIMITED : SCAN_FAILED, request);
        if (err && err.code === 'BUSY') {
          return page(
            scanBusy(
              'Every browser we are allowed to run at once is in use.',
              err.retryAfter
            ),
            429
          );
        }
        if (err && err.code === 'TARGET_STATUS') {
          return page(
            scanForm(target, 'That page answered with HTTP ' + err.status + ', so there was nothing to check.'),
            400
          );
        }
        console.error('scan failed', target, err && err.message);
        return page(
          scanForm(
            target,
            'The page could not be loaded in time. That usually means it is slow, ' +
              'behind a login, or blocking automated browsers.'
          ),
          502
        );
      }

      const scannedAt = new Date().toISOString();
      countUsage(env, ctx, SCAN_RAN, request);
      await writeCachedScan(env, target, { analysis, scannedAt });
      return page(scanResult(analysis, { target, cached: false, scannedAt }), 200);
    }

    if (url.pathname === '/api/interest' || url.pathname === '/api/audit') {
      const kind = url.pathname === '/api/audit' ? 'audit' : 'monitor';
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405, headers: { allow: 'POST' } });
      }

      // Same-origin only, and the header has to be there. The previous version
      // accepted a request with no Origin at all, which every browser sends on a
      // cross-origin POST but a script can simply omit. Absent is not the same
      // as matching.
      const origin = request.headers.get('origin');
      if (!origin || new URL(origin).hostname !== url.hostname) {
        return new Response('Cross-origin form posts are not accepted', { status: 403 });
      }

      // These endpoints send email to a person. Without a limit the form is a
      // convenient way to flood that inbox and to get our own domain treated as
      // a spam source.
      const formLimit = await checkFormLimit(env, request);
      if (!formLimit.ok) {
        return page(errorPage(formLimit.reason), 429);
      }

      let fields;
      try {
        fields = await request.formData();
      } catch {
        return page(errorPage('That form submission could not be read.'), 400);
      }

      let result;
      try {
        result = await recordInterest(
          env, fields, request.headers.get('referer') ?? '', kind
        );
      } catch (err) {
        console.error('interest insert failed', err);
        return page(
          errorPage(
            'Something broke on our side, and it was not your fault. ' +
              'Email hello@curbcut.org and it will be dealt with by a person.'
          ),
          500
        );
      }

      if (!result.ok) {
        return page(
          errorPage('That address did not look like an email address. Nothing was saved.'),
          400
        );
      }

      // The bot trap answers 200 with no row, so that a script has nothing to
      // tune against. That is right for the response and was wrong for the
      // counter: this line used to run before the check below, so anything
      // filling the hidden field raised interest_left — the single number the
      // September decision rests on. It happened on 26 August, from a headless
      // browser, and for a day the funnel showed an enquiry that never existed.
      if (result.spam) {
        countUsage(env, ctx, FORM_TRAPPED, request);
        return page(thanks(kind), 200);
      }

      countUsage(env, ctx, kind === 'audit' ? AUDIT_ASKED : INTEREST_LEFT, request);
      notifyInterest(env, ctx, result.row);
      return page(thanks(kind), 200);
    }

    // The Worker owns /scan* and /audit*, so a typo under either prefix never
    // reaches the static site and never sees site/404.html. A bare text 404 in
    // the middle of a styled site reads like an outage, so this is the same
    // answer in the site's own clothes.
    return page(notFound(url.pathname), 404);
  },
};
