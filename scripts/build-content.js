/**
 * build-content.js
 * Reads html_chapters/*.html + html_chapters/toc.json
 * and writes public/book_data.json
 *
 * Works with the minimal HTML files produced by json_to_html.js.
 * Also still works with the original vinaya_karma_en source files
 * (falls back gracefully when toc.json is absent or meta tags are missing).
 *
 * Usage:
 *   node build-content.js
 *
 * Environment variables:
 *   SOURCE_DIR   Directory containing the chapter HTML files
 *                Default: ./html_chapters  (relative to this script)
 *   TOC_FILE     Path to toc.json
 *                Default: <SOURCE_DIR>/toc.json
 *   OUT_FILE     Output path
 *                Default: ./public/book_data.json
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';

const __dir = dirname(dirname(fileURLToPath(import.meta.url)));

const SOURCE_DIR = process.env.SOURCE_DIR
  ? resolve(process.env.SOURCE_DIR)
  : resolve(__dir, 'html_chapters');

const TOC_FILE = process.env.TOC_FILE
  ? resolve(process.env.TOC_FILE)
  : join(SOURCE_DIR, 'toc.json');

const OUT_FILE = process.env.OUT_FILE
  ? resolve(process.env.OUT_FILE)
  : resolve(__dir, 'public', 'book_data.json');

// ── Validate inputs ───────────────────────────────────────────────────────────

console.log(`\nSource : ${SOURCE_DIR}`);
console.log(`TOC    : ${TOC_FILE}`);
console.log(`Output : ${OUT_FILE}\n`);

if (!existsSync(SOURCE_DIR)) {
  console.error(`ERROR: source directory not found: ${SOURCE_DIR}`);
  process.exit(1);
}
if (!existsSync(TOC_FILE)) {
  console.error(`ERROR: toc.json not found: ${TOC_FILE}`);
  process.exit(1);
}

// ── Load TOC ──────────────────────────────────────────────────────────────────

const toc = JSON.parse(readFileSync(TOC_FILE, 'utf8'));
console.log(`TOC loaded: ${countToc(toc)} entries`);

// ── Parse chapter files ───────────────────────────────────────────────────────

/**
 * Reads a single chapter HTML file and extracts all fields for book_data.json.
 *
 * Supports two HTML shapes:
 *
 * A) Minimal (produced by json_to_html.js) — body is extracted verbatim via
 *    regex so whitespace and inner tags are byte-for-byte identical to the
 *    original:
 *      <meta name="prev" content="...">
 *      <meta name="prev-label" content="...">
 *      <meta name="next" content="...">
 *      <meta name="next-label" content="...">
 *      <div class="heading-bar"><h2>Title</h2></div>
 *      <div class="content">...body...</div>
 *
 * B) Original vinaya_karma_en source — body extracted + cleaned via cheerio.
 */
function parseChapter(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const $   = cheerio.load(raw);

  // ── Title ──────────────────────────────────────────────────────────────────
  const title = $('.heading-bar h1, .heading-bar h2').first().text().trim()
    || $('title').text().split(' - ')[0].trim()
    || '';

  // ── Detect format ──────────────────────────────────────────────────────────
  const isMinimal = !!$('meta[name="prev"]').attr('content') !== undefined
                 && raw.includes('<meta name="prev"');

  // ── Prev / Next ────────────────────────────────────────────────────────────
  let prev, prevLabel, next, nextLabel;

  if (isMinimal) {
    prev      = $('meta[name="prev"]').attr('content')       ?? '';
    prevLabel = $('meta[name="prev-label"]').attr('content') ?? '';
    next      = $('meta[name="next"]').attr('content')       ?? '';
    nextLabel = $('meta[name="next-label"]').attr('content') ?? '';
  } else {
    // Original source format — nav.bottom links
    const prevA = $('nav.bottom a.button.prev');
    const nextA = $('nav.bottom a.button.next');
    prev = prevA.attr('href') ?? '';
    next = nextA.attr('href') ?? '';
    prevA.find('i.material-icons').remove();
    nextA.find('i.material-icons').remove();
    prevLabel = prevA.text().trim();
    nextLabel = nextA.text().trim();
  }

  // ── Body ───────────────────────────────────────────────────────────────────
  let body;

  if (isMinimal) {
    // Verbatim extraction — preserves exact whitespace from json_to_html.js
    // so the round-trip is byte-perfect.
    const m = raw.match(/<div class="content">\n([\s\S]*)\n  <\/div>\n<\/body>/);
    body = m ? m[1] : '';
  } else {
    // Original source — clean with cheerio
    const content = $('.content').clone();
    content.find('nav, .heading-bar, .star-icon, .share-icon, script').remove();
    content.find('i.material-icons').remove();

    // Convert .TOC-container.subheadings → clean list
    content.find('.TOC-container.subheadings').each((_, el) => {
      const items = [];
      $(el).find('a.TOC').each((_, a) => {
        items.push({ href: $(a).attr('href') || '', label: $(a).text().trim() });
      });
      const listHtml = `<div class="subtopics"><h3>Sub-topics</h3><ul>${
        items.map(i => `<li><a href="${i.href}">${i.label}</a></li>`).join('')
      }</ul></div>`;
      $(el).replaceWith(listHtml);
    });

    body = content.html()?.trim() || '';
  }

  return { title, body, prev, prevLabel, next, nextLabel };
}

// ── Collect chapter files ─────────────────────────────────────────────────────

// Accept both "3-1.html" (minimal) and "3-1_en.html" (original source).
const allFiles = readdirSync(SOURCE_DIR)
  .filter(f =>
    f.endsWith('.html') &&
    f !== 'toc.html' &&
    !f.startsWith('index')
  )
  .sort();

console.log(`Processing ${allFiles.length} chapter files…`);

const chapters = {};

for (const filename of allFiles) {
  const chapter = parseChapter(join(SOURCE_DIR, filename));
  // Normalise key: "3-1_en.html" → "3-1.html", "3-1.html" → "3-1.html"
  const key = filename.replace('_en.html', '.html');
  chapters[key] = chapter;
  const short = chapter.title.substring(0, 55);
  console.log(`  ✓  ${filename.padEnd(22)} → "${short}"`);
}

// ── Derive book title from first chapter's meta tag ───────────────────────────

let bookTitle = 'Monastic Procedures';
if (allFiles.length > 0) {
  const html = readFileSync(join(SOURCE_DIR, allFiles[0]), 'utf8');
  const $t   = cheerio.load(html);
  const fromMeta = $t('meta[name="book"]').attr('content');
  if (fromMeta) bookTitle = fromMeta;
}

// ── Write output ──────────────────────────────────────────────────────────────

const bookData = { title: bookTitle, toc, chapters };

mkdirSync(dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify(bookData, null, 2), 'utf8');

const sizeKB = (readFileSync(OUT_FILE).length / 1024).toFixed(1);
console.log(`\nDone → ${OUT_FILE}`);
console.log(`  TOC entries : ${countToc(toc)}`);
console.log(`  Chapters    : ${Object.keys(chapters).length}`);
console.log(`  File size   : ${sizeKB} KB\n`);

// ── Helpers ───────────────────────────────────────────────────────────────────

function countToc(nodes) {
  let n = 0;
  for (const node of nodes) {
    n++;
    if (node.children?.length) n += countToc(node.children);
  }
  return n;
}