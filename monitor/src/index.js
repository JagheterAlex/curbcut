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

async function recordInterest(env, fields, sourceUrl) {
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
  };

  await env.DB.prepare(
    `INSERT INTO interest (id, email, site, use_case, source, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(email) DO UPDATE SET
       site       = COALESCE(excluded.site, interest.site),
       use_case   = COALESCE(excluded.use_case, interest.use_case),
       removed_at = NULL`
  )
    .bind(row.id, row.email, row.site, row.use_case, row.source, row.created_at)
    .run();

  return { ok: true };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return new Response('ok', {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }

    if (url.pathname === '/api/interest') {
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405, headers: { allow: 'POST' } });
      }

      // Same-origin only. The form lives on our page; nothing else should post here.
      const origin = request.headers.get('origin');
      if (origin && new URL(origin).hostname !== url.hostname) {
        return new Response('Cross-origin form posts are not accepted', { status: 403 });
      }

      let fields;
      try {
        fields = await request.formData();
      } catch {
        return page(errorPage('That form submission could not be read.'), 400);
      }

      let result;
      try {
        result = await recordInterest(env, fields, request.headers.get('referer') ?? '');
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

      return page(thanks(), 200);
    }

    return new Response('Not found', { status: 404 });
  },
};
