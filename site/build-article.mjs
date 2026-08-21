// Turns an article written in Markdown into a site page.
//
// Written after converting the third article by hand and realising the site copy
// and the syndicated copy were being maintained separately. Two copies of the
// same argument drift, and on a site whose whole claim is accuracy, they drift
// into a contradiction somebody else finds first.
//
//   node site/build-article.mjs ../business/launch/article-04.md
//
// Reads the frontmatter for the title, canonical URL and cover, converts the
// body, and writes into site/blog/ using the slug from canonical_url.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Sentinels from the Unicode private use area. An earlier version used " 0 ",
// " 1 " and so on, which happily matched "fewer than 10 people" in ordinary
// prose and then indexed past the end of the array.
const OPEN = String.fromCharCode(0xE000);
const CLOSE = String.fromCharCode(0xE001);

/**
 * Inline formatting.
 *
 * Order matters and is not obvious. Code spans come out first so nothing runs
 * inside them. Typography runs BEFORE links and emphasis, because curly quoting
 * a finished anchor turns its attribute delimiters into &ldquo; and the link
 * stops being a link. That is exactly what happened the first time.
 */
function inline(text) {
  const code = [];
  let s = text.replace(/`([^`]+)`/g, (_, c) => {
    code.push(c);
    return OPEN + (code.length - 1) + CLOSE;
  });

  s = esc(s);

  // Typography, while the string is still plain prose.
  s = s.replace(/—/g, '&mdash;');
  s = s.replace(/"([^"]+)"/g, '&ldquo;$1&rdquo;');
  s = s.replace(/(\w)'(\w)/g, '$1&rsquo;$2');

  // Then markup.
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => `<a href="${href}">${label}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(])\*([^*]+)\*/g, '$1<em>$2</em>');

  return s.replace(new RegExp(OPEN + '(\\d+)' + CLOSE, 'g'), (whole, i) => {
    const body = code[Number(i)];
    return body === undefined ? whole : `<code>${esc(body)}</code>`;
  });
}

function convertBody(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;

  const flushParagraph = (buf) => {
    if (buf.length) out.push(`<p>${inline(buf.join('\n'))}</p>`);
    buf.length = 0;
  };

  const para = [];

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      flushParagraph(para);
      const body = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++]);
      i++;
      out.push(`<pre class="cmd"><code>${esc(body.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{2,4})\s+(.*)$/);
    if (heading) {
      flushParagraph(para);
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      flushParagraph(para);
      out.push('<hr style="border:0;border-top:1px solid var(--line-soft);margin:2.5rem 0 1.5rem">');
      i++;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      flushParagraph(para);
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items = [];
      while (i < lines.length && (/^\s*[-*]\s+/.test(lines[i]) || /^\s*\d+\.\s+/.test(lines[i]))) {
        let item = lines[i].replace(/^\s*(?:[-*]|\d+\.)\s+/, '');
        i++;
        // continuation lines of the same bullet
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*(?:[-*]|\d+\.)\s+/.test(lines[i])) {
          item += '\n' + lines[i].trim();
          i++;
        }
        items.push(`<li>${inline(item)}</li>`);
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>\n  ${items.join('\n  ')}\n</${tag}>`);
      continue;
    }

    if (line.trim() === '') {
      flushParagraph(para);
      i++;
      continue;
    }

    para.push(line);
    i++;
  }

  flushParagraph(para);
  return out.join('\n\n');
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) throw new Error('No frontmatter found');
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].replace(/^"(.*)"$/, '$1');
  }
  return { meta, body: raw.slice(m[0].length) };
}

const NAV = `
    <nav aria-label="Primary">
      <ul>
        <li><a href="/">Home</a></li>
        <li><a href="/scan">Scan a page</a></li>
        <li><a href="/blog/">Writing</a></li>
      </ul>
    </nav>`;

function page(meta, bodyHtml, published) {
  const slug = meta.canonical_url.replace(/^.*\/blog\//, '');
  return { slug, html: `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.title)} — Curbcut</title>
<meta name="description" content="${esc(meta.description ?? meta.title)}">
<link rel="stylesheet" href="../style.css">
<link rel="canonical" href="${meta.canonical_url}">
<meta property="og:title" content="${esc(meta.title)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${meta.canonical_url}">${
  meta.cover_image ? `\n<meta property="og:image" content="${meta.cover_image}">` : ''
}
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
    </a>${NAV}
  </div>
</header>

<main id="main">
<section>
<div class="wrap prose">

<article>
<h1>${inline(meta.title)}</h1>
<p class="lede">Published ${published}.</p>

${bodyHtml}
</article>

</div>
</section>
</main>

<footer>
  <div class="wrap">
    <ul>
      <li><a href="/">Home</a></li>
      <li><a href="/scan">Scan a page</a></li>
      <li><a href="/blog/">Writing</a></li>
      <li><a href="/terms">Terms</a></li>
      <li><a href="/privacy">Privacy</a></li>
      <li><a href="/accessibility">Accessibility statement</a></li>
      <li><!--email_off--><a href="mailto:hello@curbcut.org">hello@curbcut.org</a><!--email_on--></li>
    </ul>
    <p>Nothing on this site is legal advice.</p>
  </div>
</footer>

</body>
</html>
` };
}

const input = process.argv[2];
if (!input) {
  console.error('usage: node site/build-article.mjs <article.md> [published date]');
  process.exit(2);
}
const published =
  process.argv[3] ??
  new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

// Normalise line endings: these files are edited on Windows and the
// frontmatter regex has no business caring about that.
const CR = String.fromCharCode(13);
const raw = readFileSync(input, 'utf8').split(CR).join('');
const { meta, body } = parseFrontmatter(raw);
const { slug, html } = page(meta, convertBody(body), published);
const outPath = join(here, 'blog', slug + '.html');
writeFileSync(outPath, html, 'utf8');
console.log('wrote ' + outPath + ' (' + Math.round(html.length / 1024) + ' KB) from ' + basename(input));
