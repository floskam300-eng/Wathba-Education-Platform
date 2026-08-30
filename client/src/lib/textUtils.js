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
// Anything that can legitimately appear inside a latin/math/physics expression
// (including Greek letters, superscripts/subscripts, math symbols, arrows, etc.)
const LTR_HINT_RE = /[0-9A-Za-z\u00B0\u00B1\u00D7\u00F7\u221A\u221E\u0370-\u03FF\u2260\u2264\u2265\u00B2\u00B3\u2070-\u209F\u2200-\u22FF\u2100-\u214F\u2190-\u21FF]/;
const WHITESPACE_RE = /^\s+$/;
// Pure punctuation / operator tokens without alphanumeric or variable characters
const PURE_PUNCT_RE = /^[^A-Za-z0-9\u0370-\u03FF\u00B2\u00B3\u2070-\u209F\u2100-\u214F]*$/;

/**
 * Wrap runs of non-Arabic tokens in LTR bidi isolates so numbers, comparisons
 * (`5 > 8`) and formulas keep their visual order inside RTL paragraphs.
 *
 * Edge trimming: operators/punctuation at the BOUNDARY between a run and
 * neighbouring Arabic text stay OUTSIDE the island. Example — typed
 * `60,000 = ..... الف`:
 *   - isolating `60,000 = .....` as one unit would flip the sentence into
 *     `...... = 60,000 الف` for readers;
 *   - isolating only `60,000` lets `=` and the dots flow in natural RTL
 *     order, exactly as the teacher typed it.
 * Whitespace and newlines are preserved verbatim (callers rely on
 * white-space: pre-wrap). Tokens mixing Arabic + latin are left untouched.
 */
export function isolateLtrRuns(str) {
  if (!str) return str;
  const s = String(str);
  if (!LTR_HINT_RE.test(s)) return s;

  const tokens = s.split(/(\s+)/);

  // Pass 1 — classify word/punct tokens (whitespace kept for pass 2).
  const kinds = tokens.map((tok) =>
    !tok || WHITESPACE_RE.test(tok)
      ? null
      : ARABIC_RE.test(tok)
        ? 'A'
        : PURE_PUNCT_RE.test(tok)
          ? 'P'
          : 'W'
  );

  // Pass 2 — mark which tokens fall INSIDE a non-Arabic run: everything
  // between the FIRST and LAST word-token of the stretch (whitespace and
  // inter-word punctuation included). Pure-punctuation tokens at the stretch
  // edges belong to the surrounding RTL sentence flow and stay unwrapped.
  const inIsland = new Array(tokens.length).fill(false);
  let start = -1;
  const markStretch = (from, to) => { // [from, to)
    let firstW = -1, lastW = -1;
    for (let i = from; i < to; i++) {
      if (kinds[i] === 'W') { if (firstW === -1) firstW = i; lastW = i; }
    }
    if (firstW === -1) return;
    for (let i = firstW; i <= lastW; i++) inIsland[i] = true;
  };
  for (let i = 0; i <= tokens.length; i++) {
    const isBoundary = i === tokens.length || kinds[i] === 'A';
    if (isBoundary) {
      if (start !== -1) { markStretch(start, i); start = -1; }
    } else if (start === -1 && kinds[i] === 'W') {
      start = i;
    }
  }

  // Pass 3 — emit, opening/closing the isolate on membership transitions.
  let out = '';
  let open = false;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (!tok) continue;
    const want = inIsland[i];
    if (want && !open) { out += '\u2066'; open = true; }
    else if (!want && open) { out += '\u2069'; open = false; }
    out += tok;
  }
  if (open) out += '\u2069';
  return out;
}
