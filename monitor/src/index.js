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

import { page, thanks, errorPage } from './pages.js';
import { scanForm, scanResult, scanBusy } from './scan-pages.js';
import { validateTarget, robotsAllows, scanOnePage } from './scan.js';
import { checkRateLimit, checkFormLimit, readCachedScan, writeCachedScan } from './limits.js';
import {
  countUsage,
  SCAN_VIEWED, SCAN_RAN, SCAN_CACHED, SCAN_REFUSED, SCAN_FAILED, SCAN_LIMITED,
  INTEREST_LEFT, AUDIT_ASKED,
} from './usage.js';
import { notifyInterest } from './notify.js';

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

    if (url.pathname === '/scan' || url.pathname === '/scan/') {
      // HEAD is a GET without a body, and answering 405 to it breaks link
      // checkers and monitoring for no reason. Not counted as a view: nothing
      // looked at the page.
      if (request.method === 'HEAD') {
        const res = page(scanForm(), 200);
        return new Response(null, { status: 200, headers: res.headers });
      }
      if (request.method === 'GET') {
        countUsage(env, ctx, SCAN_VIEWED);
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
        countUsage(env, ctx, SCAN_REFUSED);
        return page(scanForm(typeof raw === 'string' ? raw : '', checked.error), 400);
      }
      const target = checked.url;

      const cachedResult = await readCachedScan(env, target);
      if (cachedResult) {
        countUsage(env, ctx, SCAN_CACHED);
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
        countUsage(env, ctx, SCAN_LIMITED);
        return page(scanBusy(limit.reason, limit.retryAfter), 429);
      }

      if (!(await robotsAllows(target))) {
        countUsage(env, ctx, SCAN_REFUSED);
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
        countUsage(env, ctx, err && err.code === 'BUSY' ? SCAN_LIMITED : SCAN_FAILED);
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
      countUsage(env, ctx, SCAN_RAN);
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

      countUsage(env, ctx, kind === 'audit' ? AUDIT_ASKED : INTEREST_LEFT);
      // A row in a database nobody is watching is not a lead. The bot trap
      // returns ok without a row, so check before announcing anything.
      if (result.row) notifyInterest(env, ctx, result.row);
      return page(thanks(kind), 200);
    }

    return new Response('Not found', { status: 404 });
  },
};
