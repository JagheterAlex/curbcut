// Counting how the site is used, without watching who uses it.
//
// The question this exists to answer is narrow and was, until now, unanswerable:
// people arrive, and nothing happens. Is that the wrong audience, or the right
// audience refusing the offer? Those need opposite responses, and page views
// cannot tell them apart. A tally of "looked at the scanner" against "actually
// ran it" against "left an address" can.
//
// What is deliberately NOT stored: the URL somebody scanned, their address,
// their user agent, any identifier at all. Scanned domains would be the single
// most commercially useful thing on this site to keep, which is exactly why the
// temptation is worth naming and refusing: the privacy policy says a scan is
// gone after fifteen minutes, and a business selling honest compliance reports
// cannot quietly keep what it told people it discards.
//
// Every row here is a day, an event name and an integer. It could be published
// in full without harming anybody.

export const SCAN_VIEWED = 'scan_viewed';
export const SCAN_RAN = 'scan_ran';
export const SCAN_CACHED = 'scan_cached';
export const SCAN_REFUSED = 'scan_refused';
export const SCAN_FAILED = 'scan_failed';
export const SCAN_LIMITED = 'scan_limited';
export const INTEREST_LEFT = 'interest_left';
// Counted apart from the waiting list on purpose: this one can turn into an
// invoice this week, and averaging it into a mailing list would hide it.
export const AUDIT_ASKED = 'audit_asked';
// The page between seeing your own failures and asking for a price. Counted
// separately so the gap between reaching the offer and taking it is visible,
// rather than showing up as one more visitor who did nothing.
export const AUDIT_VIEWED = 'audit_viewed';
// Reading the example report instead of running one. If this rises while
// scan_ran stays flat, the example is a destination rather than a doorway and
// should be changed or removed.
export const EXAMPLE_VIEWED = 'example_viewed';
// A form post that filled the hidden field no human can see. Counted apart from
// real submissions because it is the opposite of one: it tells us how much
// automated noise the forms take, and keeping it out of interest_left keeps the
// September decision from being made on a number bots can raise.
export const FORM_TRAPPED = 'form_trapped';
// The result printed to PDF, and the attempts that arrived after the fifteen
// minutes were up. The second number is the useful one: if people keep coming
// back for a report that has expired, the cache is too short for the way it is
// actually used.
export const PDF_PRINTED = 'pdf_printed';
export const PDF_EXPIRED = 'pdf_expired';

/**
 * The same events, counted once per caller per hour instead of once per hit.
 *
 * Between 21 and 31 August the number of real browsers reaching this site fell
 * roughly twenty-fold as the launch traffic faded, and the count of scanner
 * page views stayed flat or rose. Both cannot be true of people. Something
 * automated is loading /scan repeatedly, and a raw hit count cannot tell it
 * from an audience — which would make the September decision a coin toss
 * dressed up as a measurement.
 *
 * This counts distinct callers, using the same salted hourly hash the rate
 * limiter already computes: nothing new is stored, the salt rotates every hour,
 * the marker expires with it, and no address is written down at any point.
 */
const DISTINCT = new Set([SCAN_VIEWED, EXAMPLE_VIEWED, AUDIT_VIEWED]);
const distinctEvent = (event) => event + '_callers';

/**
 * Add one to today's tally for `event`.
 *
 * Never throws and never delays the response. A counter that can break the
 * scanner is worse than no counter, and measurement is not worth one failed
 * scan for one real visitor.
 */
export function countUsage(env, ctx, event, request = null) {
  if (!env || !env.DB) return;

  // Our own checks against production are the largest single source of traffic
  // to this site, and they were landing in the same counters as real people. On
  // 22 August eight of eight audit page views were mine. The number that decides
  // whether this business continues in September cannot be mostly me, so every
  // self-test sends this header and is not counted. It grants nothing: the worst
  // an outsider can do with it is fail to be counted.
  if (request && request.headers.get('x-curbcut-selftest') === '1') return;

  const day = new Date().toISOString().slice(0, 10);

  // Counted before the tally below, and never allowed to break it.
  if (DISTINCT.has(event) && env.CACHE && request) {
    ctx?.waitUntil?.(countDistinct(env, event, day, request).catch(() => {}));
  }

  const work = env.DB.prepare(
    `INSERT INTO usage_daily (day, event, hits) VALUES (?1, ?2, 1)
     ON CONFLICT(day, event) DO UPDATE SET hits = usage_daily.hits + 1`
  )
    .bind(day, event)
    .run()
    .catch((err) => {
      console.error('usage counter failed', event, err && err.message);
    });

  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(work);
}

/**
 * One tick per caller per hour, not one per request.
 *
 * The marker in KV is a salted hash that expires within the hour, so this adds
 * nothing to what is stored about anybody: the same value the rate limiter
 * makes and discards. If KV is unavailable the distinct count is simply short
 * for that hour, which is a better failure than a scanner that stops working.
 */
async function countDistinct(env, event, day, request) {
  const hourWindow = new Date().toISOString().slice(0, 13);
  const ip =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for') ??
    'unknown';
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(hourWindow + ':' + ip)
  );
  const hash = [...new Uint8Array(digest).slice(0, 12)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const key = 'seen:' + event + ':' + hourWindow + ':' + hash;
  if (await env.CACHE.get(key)) return;
  await env.CACHE.put(key, '1', { expirationTtl: 3600 });

  await env.DB.prepare(
    `INSERT INTO usage_daily (day, event, hits) VALUES (?1, ?2, 1)
     ON CONFLICT(day, event) DO UPDATE SET hits = usage_daily.hits + 1`
  )
    .bind(day, distinctEvent(event))
    .run();
}
