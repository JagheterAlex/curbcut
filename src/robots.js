// robots.txt parsing, kept free of any browser dependency.
//
// Split out of crawl.js so the Cloudflare Worker can obey robots.txt without
// dragging a whole browser automation library into the bundle.

/**
 * Minimal robots.txt parser. Handles the parts that actually appear in the
 * wild: User-agent grouping, Disallow, Allow, and the longest-match-wins rule
 * that the specification requires. Crawl-delay and wildcards beyond `*` and
 * `$` are deliberately out of scope, and we fail open rather than guess.
 */
export function parseRobots(text) {
  const groups = [];
  let current = null;
  let lastLineWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === 'user-agent') {
      if (!lastLineWasAgent || !current) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastLineWasAgent = true;
      continue;
    }
    lastLineWasAgent = false;
    if (!current) continue;
    if (field === 'disallow' || field === 'allow') {
      current.rules.push({ allow: field === 'allow', path: value });
    }
  }

  // Every group naming our agent applies, not just the first one. Real files
  // split rules across several blocks for the same agent — Cloudflare, for one,
  // prepends a managed `User-agent: *` block ahead of the site's own. Reading
  // only the first group silently ignored the site owner's actual rules.
  const named = groups.filter((g) => g.agents.includes('curbcut'));
  const matching = named.length > 0 ? named : groups.filter((g) => g.agents.includes('*'));

  const rules = matching.flatMap((g) => g.rules).filter((r) => r.path !== '');

  return {
    isAllowed(pathname) {
      let best = null;
      for (const rule of rules) {
        if (!matchesRobotsPath(rule.path, pathname)) continue;
        const weight = rule.path.replace(/[*$]/g, '').length;
        // Longest match wins; Allow beats Disallow at equal length.
        if (!best || weight > best.weight || (weight === best.weight && rule.allow)) {
          best = { weight, allow: rule.allow };
        }
      }
      return best ? best.allow : true;
    },
  };
}

function matchesRobotsPath(pattern, pathname) {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const parts = body.split('*');
  let cursor = 0;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === '') continue;
    const at = i === 0 ? (pathname.startsWith(part) ? 0 : -1) : pathname.indexOf(part, cursor);
    if (at === -1) return false;
    cursor = at + part.length;
  }
  if (anchored) return cursor === pathname.length;
  return true;
}
