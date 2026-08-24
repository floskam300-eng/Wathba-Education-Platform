/**
 * WATHBA — Question symbol rendering regression tests (no DB required)
 * =====================================================================
 * Run: node tests/mathtext-entities.test.js
 *
 * Covers the student/teacher question display pipeline in
 * client/src/components/MathText.jsx + client/src/lib/textUtils.js:
 *
 *   Bug 1 — the rich-text editor saves HTML, so typed `5 > 8` reaches the DB
 *           as `5 &gt; 8`; students saw entity garbage instead of symbols.
 *   Bug 2 — loose HTML detection /<[a-z][\s\S]*>/i treated math like
 *           `x<y ... z>w` as a tag; DOMParser silently ate the text.
 *   Bug 3 — `$a<b$` typed visually became `$a&lt;b$` which KaTeX cannot parse.
 *   Bug 4 — RTL bidi: bare `5 > 8` inside Arabic text was visually mirrored
 *           to `8 < 5` on every exam/recitation/practice page.
 *
 * sanitizeRichHtml itself needs DOMParser (browser-only) and is covered by
 * the e2e/manual checklist; these tests exercise the pure decision logic.
 */

'use strict';

let passed = 0, failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅  ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ❌  ${name}\n       ${e.message}`);
    failed++;
  }
}

function eq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || 'values differ'}\n       expected: ${JSON.stringify(expected)}\n       actual:   ${JSON.stringify(actual)}`);
  }
}

const LRI = '\u2066';
const PDI = '\u2069';

(async () => {
  const { decodeEntities, looksLikeRichHtml, isolateLtrRuns, escapeStrayAngleBrackets } = await import('../client/src/lib/textUtils.js');

  console.log('\n── decodeEntities ──');

  await test('D1 · encoded greater-than decodes back to symbol', () => {
    eq(decodeEntities('5 &gt; 8'), '5 > 8');
  });
  await test('D2 · encoded less-than decodes back to symbol', () => {
    eq(decodeEntities('5 &lt; 8'), '5 < 8');
  });
  await test('D3 · amp, quotes, apostrophe, nbsp decode', () => {
    eq(decodeEntities('A &amp; B &quot;C&quot; &#39;D&#39;'), 'A & B "C" \'D\'');
    eq(decodeEntities('x&nbsp;y'), 'x\u00A0y');
    eq(decodeEntities('&apos;x&apos;'), "'x'");
  });
  await test('D4 · numeric refs (decimal + hex) decode', () => {
    eq(decodeEntities('&#62;&#60;'), '<>'.split('').reverse().join(''));
    eq(decodeEntities('&#60;&#62;'), '<>');
    eq(decodeEntities('&#x3C;&#x3E;'), '<>');
  });
  await test('D5 · exactly one decode pass (&amp;lt; → &lt;, never <)', () => {
    eq(decodeEntities('&amp;lt;'), '&lt;');
  });
  await test('D6 · ASCII control char refs left untouched', () => {
    eq(decodeEntities('a&#8;b'), 'a&#8;b');
  });
  await test('D7 · raw text passes through unchanged', () => {
    eq(decodeEntities('إذا كان 5 < 10 و 20 > 15'), 'إذا كان 5 < 10 و 20 > 15');
    eq(decodeEntities(null), null);
    eq(decodeEntities(''), '');
  });

  console.log('\n── looksLikeRichHtml ──');

  await test('H1 · real formatting tags detected', () => {
    eq(looksLikeRichHtml('<b>عريض</b>'), true);
    eq(looksLikeRichHtml('<span style="color:#ef4444">نص</span>'), true);
    eq(looksLikeRichHtml('سطر<br>جديد'), true);
    eq(looksLikeRichHtml('</b>'), true);
  });
  await test('H2 · REGRESSION: math pseudo-tags are NOT html (x<y>z)', () => {
    eq(looksLikeRichHtml('x<y>z'), false);
    eq(looksLikeRichHtml('إذا كان x<y فإن y>x صحيح'), false);
  });
  await test('H3 · plain comparisons and entities are not html', () => {
    eq(looksLikeRichHtml('5 < 7'), false);
    eq(looksLikeRichHtml('5 > 8'), false);
    eq(looksLikeRichHtml('5 &gt; 8'), false);
  });
  await test('H4 · disallowed tags (script/img) are not "rich html"', () => {
    eq(looksLikeRichHtml('<script>alert(1)</script>'), false);
    eq(looksLikeRichHtml('<img src=x>'), false);
  });

  console.log('\n── isolateLtrRuns ──');

  await test('I1 · bare comparison gets LTR-isolated (no mirroring in RTL)', () => {
    eq(isolateLtrRuns('5 > 8'), `${LRI}5 > 8${PDI}`);
    eq(isolateLtrRuns('10 - 3 + 2'), `${LRI}10 - 3 + 2${PDI}`);
  });
  await test('I2 · comparison embedded in Arabic sentence isolates only the math run', () => {
    const out = isolateLtrRuns('إذا كان 5 > 8 فإن الناتج خاطئ');
    eq(out.includes(`${LRI}5 > 8${PDI}`), true, 'comparison must be isolated');
    eq(out.startsWith('إذا كان '), true, 'leading Arabic preserved outside isolate');
    eq((out.match(/\u2066/g) || []).length, 1, 'exactly one isolate');
  });
  await test('I3 · multiple math runs isolate independently', () => {
    const out = isolateLtrRuns('قارن 3 < 5 مع 7 > 9 الآن');
    eq((out.match(/\u2066/g) || []).length, 2);
    eq(out.includes(`${LRI}3 < 5${PDI}`), true);
    eq(out.includes(`${LRI}7 > 9${PDI}`), true);
  });
  await test('I4 · newlines and whitespace structure preserved (pre-wrap)', () => {
    const out = isolateLtrRuns('السؤال:\n5 > 3 ؟');
    eq(out.includes('\n'), true);
    eq(out.includes(`${LRI}5 > 3${PDI}`), true);
  });
  await test('I5 · Arabic-only text untouched', () => {
    eq(isolateLtrRuns('هذا نص عربي فقط بلا رموز'), 'هذا نص عربي فقط بلا رموز');
  });
  await test('I6 · null/empty passthrough', () => {
    eq(isolateLtrRuns(null), null);
    eq(isolateLtrRuns(''), '');
  });
  await test('N1 · REGRESSION: "60,000 = ..... الف" isolates ONLY the number', () => {
    // The = and the dots belong to the RTL sentence flow; wrapping them with
    // the number flipped the sentence into "...... = 60,000 الف".
    const out = isolateLtrRuns('60,000 = ..... الف.');
    eq(out, `${LRI}60,000${PDI} = ..... الف.`);
  });
  await test('N2 · operator BEFORE a number also stays in RTL flow', () => {
    eq(isolateLtrRuns('س = 60'), `س = ${LRI}60${PDI}`);
  });
  await test('N3 · operators between two numbers stay inside the island', () => {
    eq(isolateLtrRuns('10 - 3 + 2'), `${LRI}10 - 3 + 2${PDI}`);
    // Trailing dangling operator stays in the RTL flow (edge rule).
    eq(isolateLtrRuns('احسب 5 × 3 ÷'), `احسب ${LRI}5 × 3${PDI} ÷`);
  });
  await test('N4 · pure-punctuation stretch between Arabic words never wraps', () => {
    const out = isolateLtrRuns('اكتب الإجابة : ، . في الفراغ');
    eq(out.includes(LRI), false);
    eq(out, 'اكتب الإجابة : ، . في الفراغ');
  });

  console.log('\n── escapeStrayAngleBrackets ──');

  await test('E1 · REGRESSION: comparisons next to real formatting are escaped, tags kept', () => {
    const stored = '<span style="color:#ef4444">مهم:</span> إذا كان x<y فإن y>x دائماً';
    const out = escapeStrayAngleBrackets(stored);
    eq(out.includes('<span style="color:#ef4444">'), true, 'real span tag untouched');
    eq(out.includes('</span>'), true, 'closing tag untouched');
    const decoded = out.replace(/&lt;/g, '<');
    eq(decoded.includes('x<y') && decoded.includes('y>x'), true, 'comparisons preserved as text');
  });
  await test('E2 · unterminated pseudo-tag cannot swallow the rest of the text', () => {
    const out = escapeStrayAngleBrackets('إذا كان x<y فقط بدون إغلاق');
    eq(out.includes('<y فقط'.replace('<', '&lt;')), true, 'stray < escaped');
    eq(out.endsWith('بدون إغلاق'), true, 'trailing Arabic survives');
  });
  await test('E3 · closing tags and self-contained br pass through', () => {
    eq(escapeStrayAngleBrackets('سطر<br>جديد</b>نهاية'), 'سطر<br>جديد</b>نهاية');
  });
  await test('E4 · strings without < are returned unchanged', () => {
    eq(escapeStrayAngleBrackets('5 > 8 و π ≤ 9'), '5 > 8 و π ≤ 9');
    eq(escapeStrayAngleBrackets(null), null);
  });

  console.log('\n── pipeline decisions (what MathText will render) ──');

  await test('P1 · REGRESSION: WYSIWYG-typed comparison renders symbol, not entity garbage', () => {
    // What the editor actually stores when a teacher types "5 > 8":
    const stored = '5 &gt; 8';
    const decoded = decodeEntities(stored);
    eq(decoded.includes('>'), true, 'symbol restored');
    eq(decoded.includes('&'), false, 'no entity residue');
    eq(looksLikeRichHtml(decoded), false, 'plain-text path');
    const shown = isolateLtrRuns(decoded);
    eq(shown, `${LRI}5 > 8${PDI}`, 'displayed with stable LTR order');
  });
  await test('P2 · formatted question keeps rich path while comparison still decodes', () => {
    const stored = '<span style="color:#ef4444">قارن</span>: 5 &lt; 7';
    const decoded = decodeEntities(stored);
    eq(looksLikeRichHtml(decoded), true, 'goes through sanitizer');
    eq(decoded.includes('5 < 7'), true, 'comparison decoded for KaTeX/text path');
  });
  await test('P3 · math mode content arrives at KaTeX entity-free', () => {
    // Teacher types $a<b$ in the visual editor → stored as $a&lt;b$
    const stored = '$a&lt;b$';
    const decoded = decodeEntities(stored);
    eq(decoded, '$a<b$', 'KaTeX receives valid latex, not &lt;');
  });
  await test('P4 · CSV/source-mode raw comparisons stay intact end-to-end', () => {
    const stored = 'إذا كان x<y و z>w';
    const decoded = decodeEntities(stored);
    eq(looksLikeRichHtml(decoded), false, 'never enters DOMParser path');
    const shown = isolateLtrRuns(decoded);
    eq(shown.includes('<') && shown.includes('>'), true, 'both symbols survive');
  });

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  Passed: ${passed}  Failed: ${failed}`);
  console.log(`${'═'.repeat(50)}\n`);

  if (failed > 0) process.exitCode = 1;
})().catch((e) => {
  console.error('Fatal:', e);
  process.exitCode = 1;
});
