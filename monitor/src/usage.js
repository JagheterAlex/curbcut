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
