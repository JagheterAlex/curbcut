// Rate limiting and caching for the public scanner.
//
// The browser budget on the free plan is ten minutes a day. One unattended bot
// can spend all of it before breakfast, so this exists to make sure the person
// who actually came to check their site is not the one who finds the tank
// empty.
//
// The privacy cost is stated plainly in the policy: to count requests we store
// a salted hash of the caller's address for one hour. The address itself is
// never written down, the salt rotates hourly, and the counter expires. That is
// enough to stop abuse and not enough to follow anybody around.

const HOUR = 60 * 60;
const DAY = 24 * 60 * 60;

const PER_CALLER_PER_HOUR = 10;
const PER_DAY_TOTAL = 120;      // guards the account-wide browser budget
const CACHE_TTL_SECONDS = 15 * 60;

async function hashCaller(request, saltWindow) {
  const ip =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for') ??
    'unknown';
  const data = new TextEncoder().encode(saltWindow + ':' + ip);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest).slice(0, 12)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Two counters: one per caller per hour, one for everybody per day.
 *
 * Returns { ok: true } or { ok: false, reason, retryAfter }.
 */
export async function checkRateLimit(env, request) {
  const now = new Date();
  const hourWindow = now.toISOString().slice(0, 13);   // 2026-08-21T13
  const dayWindow = now.toISOString().slice(0, 10);    // 2026-08-21

  const callerKey = 'rl:' + hourWindow + ':' + (await hashCaller(request, hourWindow));
  const dayKey = 'rl:day:' + dayWindow;

  const [callerRaw, dayRaw] = await Promise.all([
    env.CACHE.get(callerKey),
    env.CACHE.get(dayKey),
  ]);

  const caller = Number(callerRaw ?? 0);
  const day = Number(dayRaw ?? 0);

  if (day >= PER_DAY_TOTAL) {
    return {
      ok: false,
      reason:
        'The scanner has used up today’s browser budget. It resets at ' +
        'midnight UTC. The command line tool has no such limit and runs on ' +
        'your own machine.',
      retryAfter: 3600,
    };
  }

  if (caller >= PER_CALLER_PER_HOUR) {
    return {
      ok: false,
      reason:
        'That is ' + PER_CALLER_PER_HOUR + ' scans from here in an hour, which ' +
        'is as much as this free scanner will do. For anything larger, the ' +
        'command line tool crawls whole sites with no limit.',
      retryAfter: 900,
    };
  }

  await Promise.all([
    env.CACHE.put(callerKey, String(caller + 1), { expirationTtl: HOUR }),
    env.CACHE.put(dayKey, String(day + 1), { expirationTtl: 26 * HOUR }),
  ]);

  return { ok: true };
}

const cacheKey = (url) => 'scan:' + url;

export async function readCachedScan(env, url) {
  try {
    const raw = await env.CACHE.get(cacheKey(url), { type: 'json' });
    return raw ?? null;
  } catch {
    return null;
  }
}

export async function writeCachedScan(env, url, payload) {
  try {
    await env.CACHE.put(cacheKey(url), JSON.stringify(payload), {
      expirationTtl: CACHE_TTL_SECONDS,
    });
  } catch {
    // A cache that fails to write is not a reason to fail the request.
  }
}

export const CACHE_MINUTES = CACHE_TTL_SECONDS / 60;

// Submissions per caller per hour, and per day for everybody.
//
// Added after the enquiry form was given the ability to send email. Until then
// an abusive submitter could only write rows to a database nobody read; now
// each POST reaches a person's inbox, which turns an unlimited form into a
// convenient way to flood it and to get our own domain treated as a spam
// source. The endpoint that can wake somebody up needs a tighter limit than
// the one that cannot.
//
// Deliberately generous for a human. Nobody legitimately asks for five audits
// in an hour, and a person who mistypes their address twice is unaffected.
const FORMS_PER_CALLER_PER_HOUR = 5;
const FORMS_PER_DAY_TOTAL = 200;

export async function checkFormLimit(env, request) {
  const now = new Date();
  const hourWindow = now.toISOString().slice(0, 13);
  const dayWindow = now.toISOString().slice(0, 10);

  const callerKey = 'fl:' + hourWindow + ':' + (await hashCaller(request, hourWindow));
  const dayKey = 'fl:day:' + dayWindow;

  const [callerRaw, dayRaw] = await Promise.all([
    env.CACHE.get(callerKey),
    env.CACHE.get(dayKey),
  ]);
  const caller = Number(callerRaw ?? 0);
  const day = Number(dayRaw ?? 0);

  if (caller >= FORMS_PER_CALLER_PER_HOUR || day >= FORMS_PER_DAY_TOTAL) {
    return {
      ok: false,
      reason:
        'That is more form submissions than this page accepts in an hour. If ' +
        'you are trying to reach a person rather than a rate limiter, write to ' +
        'hello@curbcut.org and one will answer.',
    };
  }

  await Promise.all([
    env.CACHE.put(callerKey, String(caller + 1), { expirationTtl: HOUR }),
    env.CACHE.put(dayKey, String(day + 1), { expirationTtl: DAY }),
  ]);
  return { ok: true };
}
