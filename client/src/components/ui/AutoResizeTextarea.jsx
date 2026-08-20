import React, { useLayoutEffect, useRef } from 'react';

// Textarea that grows automatically with its content so the teacher can see
// the full question/answer while typing instead of a small fixed box with an
// inner scrollbar. The forwarded ref points at the real <textarea> element,
// so callers that need selectionRange/focus (e.g. MathToolbar) keep working.
const AutoResizeTextarea = React.forwardRef(function AutoResizeTextarea(
  { value, minHeight = 56, maxHeight = 320, className, ...props },
  ref
) {
  const innerRef = useRef(null);

  const setRefs = (node) => {
    innerRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  };

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [value, minHeight, maxHeight]);

  return <textarea ref={setRefs} value={value} className={className} {...props} />;
});

export default AutoResizeTextarea;