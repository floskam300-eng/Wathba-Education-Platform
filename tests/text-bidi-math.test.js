/**
 * Bidirectional Text, Math & LaTeX Processing Test
 */
'use strict';
const assert = require('assert');
const katex = require('../client/node_modules/katex');
const { isolateLtrRuns, decodeEntities, looksLikeRichHtml } = require('../client/src/lib/textUtils.js');

console.log('══════════════════════════════════════════════════════════');
console.log('  Testing Bidirectional Text, Math & LaTeX Processing');
console.log('══════════════════════════════════════════════════════════\n');

// 1. Pure Arabic Text
const arText = 'ما هي عاصمة جمهورية مصر العربية؟';
const arIsolated = isolateLtrRuns(arText);
assert.strictEqual(arIsolated, arText, 'Pure Arabic text should remain untouched');
console.log('✅ Test 1 Passed: Pure Arabic text unchanged');

// 2. Pure English Question
const enText = 'What is the SI unit of electric current?';
const enIsolated = isolateLtrRuns(enText);
assert.strictEqual(enIsolated, '\u2066What is the SI unit of electric current?\u2069');
console.log('✅ Test 2 Passed: Pure English text isolated with LTR marks');

// 3. Mixed Arabic + English Variables
const mixedVar = 'إذا كان x + y = 10 و x = 4 فإن y =';
const mixedIsolated = isolateLtrRuns(mixedVar);
assert.ok(mixedIsolated.includes('\u2066x + y = 10\u2069'), 'Equation x + y = 10 must be isolated as a single LTR unit');
assert.ok(mixedIsolated.includes('\u2066x = 4\u2069'), 'x = 4 must be isolated as an LTR unit');
console.log('✅ Test 3 Passed: Mixed Arabic + equations isolated correctly');

// 4. Physics formulas with units
const physText = 'إذا كانت السرعة v = 20 m/s والزمن t = 5 s احسب المسافة';
const physIsolated = isolateLtrRuns(physText);
assert.ok(physIsolated.includes('\u2066v = 20 m/s\u2069'));
assert.ok(physIsolated.includes('\u2066t = 5 s\u2069'));
console.log('✅ Test 4 Passed: Physics formulas with units preserved LTR');

// 5. Greek letters, superscripts, and subscripts
const mathGreek = 'احسب قيمة الزاوية θ إذا كانت λ = 500 nm و 10⁻³ و x² + y²';
const greekIsolated = isolateLtrRuns(mathGreek);
assert.ok(greekIsolated.includes('\u2066λ = 500 nm\u2069'));
assert.ok(greekIsolated.includes('\u206610⁻³\u2069'));
assert.ok(greekIsolated.includes('\u2066x² + y²\u2069'));
console.log('✅ Test 5 Passed: Greek letters and superscripts/subscripts isolated LTR');

// 6. Inequalities, comparisons, parentheses, brackets
const ineqText = 'إذا كان 5 > 3 و (x + 1)(x - 2) = 0 و [OH-] = 10^-7';
const ineqIsolated = isolateLtrRuns(ineqText);
assert.ok(ineqIsolated.includes('\u20665 > 3\u2069'));
assert.ok(ineqIsolated.includes('\u2066(x + 1)(x - 2) = 0\u2069'));
assert.ok(ineqIsolated.includes('\u2066[OH-] = 10^-7\u2069'));
console.log('✅ Test 6 Passed: Inequalities, parentheses, and brackets isolated LTR');

// 7. KaTeX rendering
const renderedInline = katex.renderToString('\\int_0^1 x^2 dx', { displayMode: false });
assert.ok(renderedInline.includes('katex'), 'KaTeX should render inline integral');
const renderedBlock = katex.renderToString('x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}', { displayMode: true });
assert.ok(renderedBlock.includes('katex-display'), 'KaTeX should render display equation');
console.log('✅ Test 7 Passed: KaTeX rendering for math symbols and formulas');

// 8. Entity decoding
assert.strictEqual(decodeEntities('5 &gt; 3 &amp; x &lt; y'), '5 > 3 & x < y');
console.log('✅ Test 8 Passed: HTML entity decoding for math comparisons');

console.log('\n══════════════════════════════════════════════════════════');
console.log('🎉 ALL BIDIRECTIONAL & MATH RENDERING TESTS PASSED!');
console.log('══════════════════════════════════════════════════════════');
