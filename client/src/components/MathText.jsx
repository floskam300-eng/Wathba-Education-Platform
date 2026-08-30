import React, { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { decodeEntities, looksLikeRichHtml, isolateLtrRuns, escapeStrayAngleBrackets } from '../lib/textUtils';

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Keep in sync with RICH_TAG_RE in lib/textUtils.js
const ALLOWED_TAGS = new Set([
  'B', 'STRONG', 'I', 'EM', 'U', 'S', 'DEL', 'STRIKE',
  'MARK', 'SPAN', 'SUB', 'SUP', 'BR', 'CODE', 'PRE', 'P', 'DIV', 'SMALL'
]);

const ALLOWED_STYLES = [
  'color', 'background-color', 'font-size', 'font-weight',
  'font-style', 'text-decoration', 'text-decoration-line',
  'text-decoration-color', 'border-radius', 'padding'
];

export function renderLatex(latex, displayMode = false) {
  try {
    return katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      errorColor: '#e53e3e',
      trust: false,
    });
  } catch {
    return `<span style="color:#e53e3e">${escapeHtml(latex)}</span>`;
  }
}

export function parseMath(text) {
  if (!text) return [];
  const parts = [];
  let remaining = String(text);
  const blockRe = /\$\$([\s\S]+?)\$\$/;
  const inlineRe = /\$((?:[^$]|\\\$)+?)\$/;

  while (remaining.length > 0) {
    const blockMatch = blockRe.exec(remaining);
    const inlineMatch = inlineRe.exec(remaining);

    let nextMatch = null;
    let isBlock = false;

    if (blockMatch && inlineMatch) {
      if (blockMatch.index <= inlineMatch.index) {
        nextMatch = blockMatch;
        isBlock = true;
      } else {
        nextMatch = inlineMatch;
        isBlock = false;
      }
    } else if (blockMatch) {
      nextMatch = blockMatch;
      isBlock = true;
    } else if (inlineMatch) {
      nextMatch = inlineMatch;
      isBlock = false;
    }

    if (!nextMatch) {
      parts.push({ type: 'text', content: remaining });
      break;
    }

    if (nextMatch.index > 0) {
      parts.push({ type: 'text', content: remaining.slice(0, nextMatch.index) });
    }
    parts.push({ type: isBlock ? 'block' : 'inline', content: nextMatch[1] });
    remaining = remaining.slice(nextMatch.index + nextMatch[0].length);
  }

  return parts;
}

/**
 * Process all text nodes inside a DOM element to:
 * 1. Parse and render $...$ (inline) and $$...$$ (block) math via KaTeX.
 * 2. Apply Unicode LTR isolation to non-math text runs for proper Arabic/English/Math flow.
 */
function processTextNodesWithMathAndBidi(root, doc) {
  if (typeof root.createTreeWalker !== 'function') return;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  for (const node of textNodes) {
    const rawText = node.data;
    if (!rawText) continue;

    if (rawText.includes('$')) {
      const parts = parseMath(rawText);
      const hasRealMath = parts.some(p => p.type !== 'text');
      if (hasRealMath) {
        const frag = doc.createDocumentFragment();
        for (const part of parts) {
          if (part.type === 'text') {
            if (part.content) {
              frag.appendChild(doc.createTextNode(isolateLtrRuns(part.content)));
            }
          } else if (part.type === 'block') {
            const blockEl = doc.createElement('div');
            blockEl.setAttribute('dir', 'ltr');
            blockEl.setAttribute('style', 'direction: ltr; unicode-bidi: isolate; text-align: center; margin: 0.5rem 0; overflow-x: auto;');
            blockEl.innerHTML = renderLatex(part.content, true);
            frag.appendChild(blockEl);
          } else {
            const inlineEl = doc.createElement('span');
            inlineEl.setAttribute('dir', 'ltr');
            inlineEl.setAttribute('style', 'direction: ltr; unicode-bidi: isolate; display: inline-block; vertical-align: middle; margin: 0 0.15em;');
            inlineEl.innerHTML = renderLatex(part.content, false);
            frag.appendChild(inlineEl);
          }
        }
        if (node.parentNode) {
          node.parentNode.replaceChild(frag, node);
        }
        continue;
      }
    }

    const isolated = isolateLtrRuns(rawText);
    if (isolated !== rawText) {
      node.data = isolated;
    }
  }
}

/**
 * Universal renderer that sanitizes rich HTML and processes embedded math and BiDi isolation.
 */
export function renderRichMathHtml(input) {
  if (!input) return '';
  const decoded = decodeEntities(String(input));

  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    const parts = parseMath(decoded);
    return parts.map(p => {
      if (p.type === 'block') {
        return `<div dir="ltr" style="direction: ltr; unicode-bidi: isolate; text-align: center; margin: 0.5rem 0; overflow-x: auto;">${renderLatex(p.content, true)}</div>`;
      }
      if (p.type === 'inline') {
        return `<span dir="ltr" style="direction: ltr; unicode-bidi: isolate; display: inline-block; vertical-align: middle; margin: 0 0.15em;">${renderLatex(p.content, false)}</span>`;
      }
      return escapeHtml(isolateLtrRuns(p.content));
    }).join('');
  }

  try {
    const parser = new DOMParser();
    const hasHtml = looksLikeRichHtml(decoded);
    const rawContent = hasHtml ? escapeStrayAngleBrackets(decoded) : escapeHtml(decoded);
    const doc = parser.parseFromString(`<body>${rawContent}</body>`, 'text/html');

    const cleanNode = (node) => {
      const children = Array.from(node.childNodes);
      for (const child of children) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const tag = child.tagName.toUpperCase();
          if (!ALLOWED_TAGS.has(tag)) {
            const textNode = doc.createTextNode(child.textContent || '');
            node.replaceChild(textNode, child);
          } else {
            const attrs = Array.from(child.attributes);
            for (const attr of attrs) {
              const attrName = attr.name.toLowerCase();
              if (attrName === 'style') {
                const styleObj = child.style;
                const safeStyles = [];
                ALLOWED_STYLES.forEach((prop) => {
                  const val = styleObj.getPropertyValue(prop);
                  if (val && !val.includes('url(') && !val.includes('javascript:') && !val.includes('expression(')) {
                    safeStyles.push(`${prop}: ${val}`);
                  }
                });
                if (safeStyles.length > 0) {
                  child.setAttribute('style', safeStyles.join('; '));
                } else {
                  child.removeAttribute('style');
                }
              } else {
                child.removeAttribute(attr.name);
              }
            }
            cleanNode(child);
          }
        }
      }
    };

    cleanNode(doc.body);
    processTextNodesWithMathAndBidi(doc.body, doc);
    return doc.body.innerHTML;
  } catch {
    return escapeHtml(isolateLtrRuns(decoded));
  }
}

export function sanitizeRichHtml(html) {
  return renderRichMathHtml(html);
}

export default function MathText({ text, className = '' }) {
  const renderedHtml = useMemo(() => renderRichMathHtml(text), [text]);

  if (!text) return null;

  return (
    <span
      className={`math-text-wrapper ${className}`}
      dir="auto"
      style={{ whiteSpace: 'pre-wrap', unicodeBidi: 'isolate' }}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
}
