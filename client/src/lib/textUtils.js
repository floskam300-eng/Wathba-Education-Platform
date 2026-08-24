/**
 * Pure text helpers shared by MathText and friends.
 *
 * Why this exists:
 *  1. The rich-text question editor (RichTextPalette) stores HTML, so typing
 *     `5 > 8` is serialized by the browser as `5 &gt; 8`. Every renderer must
 *     decode entities back before showing text to students.
 *  2. Detecting "does this string contain intentional formatting?" with a
 *     loose regex like /<[a-z][\s\S]*>/i misfires on math comparisons such
 *     as `x<y ... z>w`, which then get eaten by DOMParser. Detection must
 *     only match tags from the actual sanitizer allow-list.
 *  3. The whole app renders RTL (dir="rtl"). Bare comparisons like `5 > 8`
 *     or spaced arithmetic like `10 - 3` are visually mirrored/reordered by
 *     the Unicode Bidirectional Algorithm inside Arabic sentences (students
 *     see `8 < 5` / `3 - 10`). Wrapping Latin/math segments in LTR bidi
 *     isolates (U+2066 ... U+2069) freezes their visual order and disables
 *     mirroring of `<`/`>` without affecting the surrounding Arabic flow.
 */

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00A0',
};

// Single pass — `&amp;lt;` decodes to `&lt;` (exactly one level), never more.
const ENTITY_RE = /&(amp|lt|gt|quot|apos|nbsp|#x?[0-9a-f]+);/gi;

/**
 * Decode the small safe set of HTML entities that editors/browsers produce.
 * Numeric refs are decoded except for ASCII control characters (< 32),
 * which HTML parsers would ignore anyway.
 */
export function decodeEntities(str) {
  if (!str) return str;
  return String(str).replace(ENTITY_RE, (match, name) => {
    const lower = name.toLowerCase();
    if (lower[0] === '#') {
      const code = lower[1] === 'x'
        ? parseInt(lower.slice(2), 16)
        : parseInt(lower.slice(1), 10);
      if (!Number.isFinite(code) || code < 32 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    return NAMED_ENTITIES[lower];
  });
}

// Keep in sync with ALLOWED_TAGS in components/MathText.jsx — these are the
// tags sanitizeRichHtml actually preserves; nothing else counts as "HTML".
export const ALLOWED_TAG_SRC =
  'b|strong|i|em|u|s|del|strike|mark|span|sub|sup|br|code|pre|p|div|small';

// Matches one complete allowed tag (opening or closing).
// Sticky variant for scanning through a string position-by-position.
const ALLOWED_TAG_STICKY = new RegExp(`<\\s*/?\\s*(?:${ALLOWED_TAG_SRC})\\b[^<>]*>`, 'giy');

const RICH_TAG_RE = new RegExp(
  `<\\s*/?\\s*(?:${ALLOWED_TAG_SRC})\\b[^<>]*>`,
  'i'
);

/**
 * Escape every "<" that does NOT begin an allow-listed tag, so a browser's
 * HTML parser can never mistake typed math like `x<y ... y>x` (or an
 * unterminated `x<y`) for markup and silently swallow the text.
 * Real formatting tags pass through untouched; stray ">" needs no escaping.
 */
export function escapeStrayAngleBrackets(html) {
  if (!html) return html;
  const s = String(html);
  if (!s.includes('<')) return s;
  let out = '';
  let i = 0;
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt === -1) break;
    out += s.slice(i, lt);
    ALLOWED_TAG_STICKY.lastIndex = lt;
    const m = ALLOWED_TAG_STICKY.exec(s);
    if (m && m.index === lt) {
      out += m[0];
      i = lt + m[0].length;
    } else {
      out += '&lt;';
      i = lt + 1;
    }
  }
  out += s.slice(i);
  return out;
}

/**
 * True only when the string contains a tag the sanitizer would keep.
 * Unlike /<[a-z][\s\S]*>/i this never misclassifies math like `x<y>z`.
 */
export function looksLikeRichHtml(str) {
  if (!str) return false;
  return RICH_TAG_RE.test(String(str));
}

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
// Anything that can legitimately appear inside a latin/math expression.
const LTR_HINT_RE = /[0-9A-Za-z\u00B0\u00B1\u00D7\u00F7\u221A\u221E\u0391-\u03C9\u2260\u2264\u2265]/;
const WHITESPACE_RE = /^\s+$/;

/**
 * Wrap maximal runs of non-Arabic tokens in LTR bidi isolates so numbers,
 * comparisons (`5 > 8`), and formulas keep their visual order inside RTL
 * paragraphs. Whitespace between tokens of the same run is preserved
 * (including newlines — callers rely on white-space: pre-wrap).
 * Tokens mixing Arabic + latin are left untouched (default bidi applies).
 */
export function isolateLtrRuns(str) {
  if (!str) return str;
  const s = String(str);
  if (!LTR_HINT_RE.test(s)) return s;

  const tokens = s.split(/(\s+)/);
  let out = '';
  let run = '';
  const flush = () => {
    if (!run) return;
    // Keep trailing whitespace outside the isolate — cleaner output.
    const trimmed = run.replace(/\s+$/, '');
    const trail = run.slice(trimmed.length);
    out += '\u2066' + trimmed + '\u2069' + trail;
    run = '';
  };

  for (const tok of tokens) {
    if (!tok) continue;
    if (WHITESPACE_RE.test(tok)) {
      if (run) run += tok;
      else out += tok;
    } else if (ARABIC_RE.test(tok)) {
      flush();
      out += tok;
    } else {
      run += tok;
    }
  }
  flush();
  return out;
}
