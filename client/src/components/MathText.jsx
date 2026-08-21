import React, { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ALLOWED_TAGS = new Set([
  'B', 'STRONG', 'I', 'EM', 'U', 'S', 'DEL', 'STRIKE',
  'MARK', 'SPAN', 'SUB', 'SUP', 'BR', 'CODE', 'PRE', 'P', 'DIV', 'SMALL'
]);

const ALLOWED_STYLES = [
  'color', 'background-color', 'font-size', 'font-weight',
  'font-style', 'text-decoration', 'text-decoration-line',
  'text-decoration-color', 'border-radius', 'padding'
];

/**
 * Sanitizes an HTML string to only allow safe formatting tags and style attributes.
 * Prevents XSS while allowing rich styling (colors, bold, highlight, font-size, etc.)
 */
export function sanitizeRichHtml(html) {
  if (!html) return '';
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return escapeHtml(html);
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<body>${html}</body>`, 'text/html');

    const cleanNode = (node) => {
      const children = Array.from(node.childNodes);
      for (const child of children) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const tag = child.tagName.toUpperCase();
          if (!ALLOWED_TAGS.has(tag)) {
            // Unwrap disallowed element into a text node
            const textNode = doc.createTextNode(child.textContent || '');
            node.replaceChild(textNode, child);
          } else {
            // Clean attributes — only allow safe style attribute
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
    return doc.body.innerHTML;
  } catch {
    return escapeHtml(html);
  }
}

function renderLatex(latex, displayMode = false) {
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

function parseMath(text) {
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

export default function MathText({ text, className = '' }) {
  const parts = useMemo(() => parseMath(text), [text]);

  if (!text) return null;

  const hasMath = parts.some((p) => p.type !== 'text');
  const strText = String(text);
  const hasHtml = /<[a-z][\s\S]*>/i.test(strText);

  // Plain text optimization (no math, no html)
  if (!hasMath && !hasHtml) {
    return <span className={className} style={{ whiteSpace: 'pre-wrap' }}>{strText}</span>;
  }

  // Pure HTML rich text with no math
  if (!hasMath && hasHtml) {
    return (
      <span
        className={`rich-text ${className}`}
        dir="rtl"
        style={{ whiteSpace: 'pre-wrap' }}
        dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(strText) }}
      />
    );
  }

  // Combined Math + Rich Text
  return (
    <span className={`math-text rich-text ${className}`} dir="rtl" style={{ whiteSpace: 'pre-wrap' }}>
      {parts.map((part, i) => {
        if (part.type === 'text') {
          return (
            <span
              key={i}
              style={{ whiteSpace: 'pre-wrap' }}
              dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(part.content) }}
            />
          );
        }
        if (part.type === 'block') {
          return (
            <span
              key={i}
              className="block my-2 overflow-x-auto text-center"
              dangerouslySetInnerHTML={{ __html: renderLatex(part.content, true) }}
            />
          );
        }
        return (
          <span
            key={i}
            className="inline-block align-middle mx-0.5"
            dangerouslySetInnerHTML={{ __html: renderLatex(part.content, false) }}
          />
        );
      })}
    </span>
  );
}
