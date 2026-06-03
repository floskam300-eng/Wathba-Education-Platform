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
  let remaining = text;
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

  const hasMath = parts.some(p => p.type !== 'text');

  if (!hasMath) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={`math-text ${className}`} dir="rtl">
      {parts.map((part, i) => {
        if (part.type === 'text') {
          return <span key={i}>{part.content}</span>;
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
