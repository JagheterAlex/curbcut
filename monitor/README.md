# Curbcut Monitor

The API behind curbcut.org. Currently one endpoint: the interest form.

## Why it exists in this shape

The site ships no JavaScript, so this has to work as a plain HTML form post
returning a full page. No fetch, no JSON, no client-side validation between a
person and the ability to reach us.

The privacy policy says we collect almost nothing, so this stores exactly what
somebody typed and nothing else — no IP, no user agent, no cookie, no beacon.
If that changes, the policy changes first.

## Deploying

Needs a Cloudflare login once. From this directory:

```bash
npx wrangler login
npx wrangler d1 create curbcut
```

Put the returned `database_id` into `wrangler.toml`, then:

```bash
npx wrangler d1 execute curbcut --remote --file=schema.sql
npx wrangler deploy
```

The route in `wrangler.toml` binds `curbcut.org/api/*` to this worker, so the
form posts same-origin and needs no CORS.

## Reading what came in

```bash
npx wrangler d1 execute curbcut --remote \
  --command "SELECT created_at, email, site, use_case FROM interest ORDER BY created_at DESC LIMIT 50"
```

## Erasure

Someone asks, the row goes. Same day, no reason required.

```bash
npx wrangler d1 execute curbcut --remote \
  --command "DELETE FROM interest WHERE email = 'them@example.com'"
```

## What is not here yet

Scheduled crawls, baselines, regression alerts and dated report URLs — the
things Monitor is actually sold as. This is the seed: capture demand honestly
while the rest gets built, and let what people write in the form decide the
order it gets built in.
