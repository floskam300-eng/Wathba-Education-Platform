import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Bold, Italic, Underline, Strikethrough, Palette,
  Highlighter, Type, Sigma, X, ChevronDown, ChevronUp,
  Eye, RotateCcw, Subscript, Superscript, Check
} from 'lucide-react';
import AutoResizeTextarea from './ui/AutoResizeTextarea';
import MathText from './MathText';

const TEXT_COLORS = [
  { label: 'أحمر', value: '#ef4444', bg: 'bg-red-500' },
  { label: 'برتقالي', value: '#ea580c', bg: 'bg-orange-600' },
  { label: 'أخضر', value: '#16a34a', bg: 'bg-green-600' },
  { label: 'أزرق', value: '#2563eb', bg: 'bg-blue-600' },
  { label: 'بنفسجي', value: '#7c3aed', bg: 'bg-purple-600' },
  { label: 'وردي', value: '#db2777', bg: 'bg-pink-600' },
  { label: 'سماوي', value: '#0891b2', bg: 'bg-cyan-600' },
  { label: 'داكن', value: '#1e293b', bg: 'bg-slate-800' },
];

const HIGHLIGHT_COLORS = [
  { label: 'أصفر', value: '#fef08a', bg: 'bg-yellow-200' },
  { label: 'أخضر', value: '#bbf7d0', bg: 'bg-green-200' },
  { label: 'سماوي', value: '#bae6fd', bg: 'bg-sky-200' },
  { label: 'وردي', value: '#fbcfe8', bg: 'bg-pink-200' },
  { label: 'برتقالي', value: '#fed7aa', bg: 'bg-orange-200' },
  { label: 'بنفسجي', value: '#e9d5ff', bg: 'bg-purple-200' },
];

const FONT_SIZES = [
  { label: 'صغير', value: '0.85em', desc: '85%' },
  { label: 'عادي', value: '1em', desc: '100%' },
  { label: 'كبير', value: '1.2em', desc: '120%' },
  { label: 'كبير جداً', value: '1.4em', desc: '140%' },
];

const MATH_SYMBOLS = [
  { label: 'x²', insert: '^{2}', title: 'تربيع' },
  { label: 'x³', insert: '^{3}', title: 'تكعيب' },
  { label: 'xⁿ', insert: '^{n}', title: 'أس' },
  { label: '√', insert: '\\sqrt{}', title: 'جذر تربيعي', cursor: -1 },
  { label: '∛', insert: '\\sqrt[3]{}', title: 'جذر تكعيبي', cursor: -1 },
  { label: 'a/b', insert: '\\frac{}{}', title: 'كسر', cursor: -3 },
  { label: 'π', insert: '\\pi', title: 'باي' },
  { label: 'θ', insert: '\\theta', title: 'ثيتا' },
  { label: 'α', insert: '\\alpha', title: 'ألفا' },
  { label: 'β', insert: '\\beta', title: 'بيتا' },
  { label: '×', insert: '\\times', title: 'ضرب' },
  { label: '÷', insert: '\\div', title: 'قسمة' },
  { label: '±', insert: '\\pm', title: 'زائد أو ناقص' },
  { label: '≠', insert: '\\neq', title: 'لا يساوي' },
  { label: '≤', insert: '\\leq', title: 'أصغر من أو يساوي' },
  { label: '≥', insert: '\\geq', title: 'أكبر من أو يساوي' },
  { label: '∞', insert: '\\infty', title: 'ما لانهاية' },
  { label: 'sin', insert: '\\sin()', title: 'جيب', cursor: -1 },
  { label: 'cos', insert: '\\cos()', title: 'جيب تمام', cursor: -1 },
  { label: 'tan', insert: '\\tan()', title: 'ظل', cursor: -1 },
  { label: 'log', insert: '\\log()', title: 'لوغاريتم', cursor: -1 },
  { label: 'Σ', insert: '\\sum_{}^{}', title: 'مجموع', cursor: -3 },
  { label: '∫', insert: '\\int_{}^{}', title: 'تكامل', cursor: -3 },
  { label: '|x|', insert: '|{}|', title: 'قيمة مطلقة', cursor: -2 },
  { label: '°', insert: '^{\\circ}', title: 'درجة' },
  { label: 'vec', insert: '\\vec{}', title: 'متجه', cursor: -1 },
];

export default function RichTextPalette({
  value = '',
  onChange,
  placeholder = 'اكتب النص هنا...',
  minHeight = 80,
  maxHeight = 320,
  className = '',
  textareaRef: externalRef,
  enableMath = true,
  showPreviewToggle = true,
  accentColor = 'purple', // 'purple' | 'orange' | 'blue'
}) {
  const innerRef = useRef(null);
  const textareaRef = externalRef || innerRef;
  const containerRef = useRef(null);

  const [bubbleVisible, setBubbleVisible] = useState(false);
  const [bubbleCoords, setBubbleCoords] = useState({ top: 0, left: 0 });
  const [activeDropdown, setActiveDropdown] = useState(null); // 'color' | 'highlight' | 'size' | 'math'
  const [customColor, setCustomColor] = useState('#2563eb');
  const [customHighlight, setCustomHighlight] = useState('#fef08a');
  const [showLivePreview, setShowLivePreview] = useState(false);
  const [showMathToolbar, setShowMathToolbar] = useState(false);

  // Focus and Selection Handling
  const getSelection = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return { start: 0, end: 0, text: '' };
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    return {
      start,
      end,
      text: (value || '').slice(start, end),
    };
  }, [value, textareaRef]);

  // Floating Bubble Positioning on Text Selection
  const checkSelection = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;

    if (end > start && el === document.activeElement) {
      const rect = el.getBoundingClientRect();
      const contRect = containerRef.current?.getBoundingClientRect() || rect;
      
      // Calculate relative position within container
      const top = Math.max(10, rect.top - contRect.top - 42);
      const left = Math.min(Math.max(20, (rect.width / 2) - 100), rect.width - 220);

      setBubbleCoords({ top, left });
      setBubbleVisible(true);
    } else {
      setBubbleVisible(false);
      setActiveDropdown(null);
    }
  }, [textareaRef]);

  useEffect(() => {
    const handleMouseUp = () => {
      setTimeout(checkSelection, 30);
    };
    const handleKeyUp = (e) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Shift'].includes(e.key)) {
        setTimeout(checkSelection, 30);
      }
    };

    const el = textareaRef.current;
    if (el) {
      el.addEventListener('mouseup', handleMouseUp);
      el.addEventListener('keyup', handleKeyUp);
      el.addEventListener('select', checkSelection);
    }
    return () => {
      if (el) {
        el.removeEventListener('mouseup', handleMouseUp);
        el.removeEventListener('keyup', handleKeyUp);
        el.removeEventListener('select', checkSelection);
      }
    };
  }, [checkSelection, textareaRef]);

  // Apply HTML Tag or Style to Selection
  const applyWrap = (tag, styleString = '') => {
    const el = textareaRef.current;
    const { start, end, text } = getSelection();
    const styleAttr = styleString ? ` style="${styleString}"` : '';
    const openTag = `<${tag}${styleAttr}>`;
    const closeTag = `</${tag}>`;

    const val = value || '';
    let newVal;
    let newCursorPos;

    if (text) {
      // If already wrapped with same tag, remove it
      newVal = val.slice(0, start) + openTag + text + closeTag + val.slice(end);
      newCursorPos = start + openTag.length + text.length + closeTag.length;
    } else {
      // No text selected: insert wrapper with placeholder or cursor inside
      const placeholderText = 'نص';
      newVal = val.slice(0, start) + openTag + placeholderText + closeTag + val.slice(end);
      newCursorPos = start + openTag.length + placeholderText.length;
    }

    onChange(newVal);
    setActiveDropdown(null);
    setBubbleVisible(false);

    setTimeout(() => {
      if (el) {
        el.focus();
        el.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  // Clear Formatting from selected text
  const clearFormatting = () => {
    const el = textareaRef.current;
    const { start, end, text } = getSelection();
    if (!text) return;

    // Strip HTML tags from selection
    const cleanText = text.replace(/<[^>]*>/g, '');
    const val = value || '';
    const newVal = val.slice(0, start) + cleanText + val.slice(end);

    onChange(newVal);
    setBubbleVisible(false);
    setActiveDropdown(null);

    setTimeout(() => {
      if (el) {
        el.focus();
        el.setSelectionRange(start, start + cleanText.length);
      }
    }, 0);
  };

  // Math insertion
  const insertMath = (sym) => {
    const el = textareaRef.current;
    const { start, end, text } = getSelection();
    const val = value || '';

    let toInsert;
    if (text) {
      toInsert = `$${sym.insert.replace('{}', `{${text}}`)}$`;
    } else {
      toInsert = `$${sym.insert}$`;
    }

    const newVal = val.slice(0, start) + toInsert + val.slice(end);
    onChange(newVal);

    setTimeout(() => {
      if (el) {
        el.focus();
        const cursorPos = sym.cursor != null
          ? start + toInsert.length + sym.cursor
          : start + toInsert.length;
        el.setSelectionRange(cursorPos, cursorPos);
      }
    }, 0);
  };

  const insertMathBlock = () => {
    const el = textareaRef.current;
    const { start, end, text } = getSelection();
    const val = value || '';
    const toInsert = `\n$$\n${text || ''}\n$$\n`;
    const newVal = val.slice(0, start) + toInsert + val.slice(end);
    onChange(newVal);

    setTimeout(() => {
      if (el) {
        el.focus();
        const pos = start + 4 + (text ? text.length : 0);
        el.setSelectionRange(pos, pos);
      }
    }, 0);
  };

  // Accent color themes
  const colorMap = {
    purple: {
      btnActive: 'bg-purple-600 text-white',
      btnHover: 'hover:bg-purple-50 dark:hover:bg-purple-900/30 text-purple-700 dark:text-purple-300',
      border: 'border-purple-200 dark:border-purple-900/40',
      bgToolbar: 'bg-purple-50/60 dark:bg-purple-950/20',
      ring: 'focus-within:ring-purple-400 dark:focus-within:ring-purple-600/50',
    },
    orange: {
      btnActive: 'bg-orange-600 text-white',
      btnHover: 'hover:bg-orange-50 dark:hover:bg-orange-900/30 text-orange-700 dark:text-orange-300',
      border: 'border-orange-200 dark:border-orange-900/40',
      bgToolbar: 'bg-orange-50/60 dark:bg-orange-950/20',
      ring: 'focus-within:ring-orange-400 dark:focus-within:ring-orange-600/50',
    },
    blue: {
      btnActive: 'bg-blue-600 text-white',
      btnHover: 'hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-300',
      border: 'border-blue-200 dark:border-blue-900/40',
      bgToolbar: 'bg-blue-50/60 dark:bg-blue-950/20',
      ring: 'focus-within:ring-blue-400 dark:focus-within:ring-blue-600/50',
    },
  };
  const theme = colorMap[accentColor] || colorMap.purple;

  const hasContent = !!(value && value.trim());
  const hasFormatting = /<[a-z][\s\S]*>/i.test(value || '') || /\$[^$]+\$/.test(value || '');

  return (
    <div ref={containerRef} className="relative w-full text-right" dir="rtl">
      
      {/* ── Floating Bubble Toolbar (appears on text selection) ── */}
      {bubbleVisible && (
        <div
          style={{ top: `${bubbleCoords.top}px`, right: `${bubbleCoords.left}px` }}
          className="absolute z-50 flex items-center gap-1 p-1 bg-gray-900/95 dark:bg-gray-800/95 text-white backdrop-blur-md rounded-2xl shadow-xl border border-gray-700/50 animate-in fade-in zoom-in-95 duration-150"
        >
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); applyWrap('b'); }}
            title="عريض (Bold)"
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/20 transition-colors font-bold text-xs"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); applyWrap('i'); }}
            title="مائل (Italic)"
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/20 transition-colors text-xs"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); applyWrap('u'); }}
            title="تسطير (Underline)"
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/20 transition-colors text-xs"
          >
            <Underline className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); applyWrap('s'); }}
            title="شطب (Strikethrough)"
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/20 transition-colors text-xs"
          >
            <Strikethrough className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-4 bg-gray-700 mx-0.5" />

          {/* Floating Color Trigger */}
          <div className="relative">
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setActiveDropdown(activeDropdown === 'bubble_color' ? null : 'bubble_color');
              }}
              title="لون الخط"
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/20 transition-colors"
            >
              <Palette className="w-3.5 h-3.5 text-blue-400" />
            </button>

            {activeDropdown === 'bubble_color' && (
              <div className="absolute bottom-full right-0 mb-2 p-2 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 min-w-[190px]">
                <div className="text-[10px] font-bold text-gray-400 mb-1.5 px-1">اختر لون النص:</div>
                <div className="grid grid-cols-4 gap-1.5 mb-2">
                  {TEXT_COLORS.map(c => (
                    <button
                      key={c.value}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); applyWrap('span', `color: ${c.value}`); }}
                      title={c.label}
                      className="w-7 h-7 rounded-lg flex items-center justify-center border border-white/10 hover:scale-110 transition-transform"
                      style={{ backgroundColor: c.value }}
                    />
                  ))}
                </div>
                <div className="pt-1.5 border-t border-gray-800 flex items-center justify-between gap-1 text-[10px]">
                  <span className="text-gray-400">لون حر:</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="color"
                      value={customColor}
                      onChange={(e) => setCustomColor(e.target.value)}
                      className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                    />
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); applyWrap('span', `color: ${customColor}`); }}
                      className="px-2 py-0.5 rounded bg-blue-600 text-white font-bold text-[10px]"
                    >
                      تطبيق
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Floating Highlight Trigger */}
          <div className="relative">
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setActiveDropdown(activeDropdown === 'bubble_highlight' ? null : 'bubble_highlight');
              }}
              title="تظليل النص"
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/20 transition-colors"
            >
              <Highlighter className="w-3.5 h-3.5 text-yellow-300" />
            </button>

            {activeDropdown === 'bubble_highlight' && (
              <div className="absolute bottom-full right-0 mb-2 p-2 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 min-w-[190px]">
                <div className="text-[10px] font-bold text-gray-400 mb-1.5 px-1">اختر لون التظليل:</div>
                <div className="grid grid-cols-3 gap-1.5 mb-2">
                  {HIGHLIGHT_COLORS.map(c => (
                    <button
                      key={c.value}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); applyWrap('mark', `background-color: ${c.value}; padding: 0 4px; border-radius: 4px;`); }}
                      title={c.label}
                      className="h-6 rounded-md flex items-center justify-center text-[10px] font-bold text-gray-900 hover:scale-105 transition-transform"
                      style={{ backgroundColor: c.value }}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                <div className="pt-1.5 border-t border-gray-800 flex items-center justify-between gap-1 text-[10px]">
                  <span className="text-gray-400">تظليل مخصص:</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="color"
                      value={customHighlight}
                      onChange={(e) => setCustomHighlight(e.target.value)}
                      className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                    />
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); applyWrap('mark', `background-color: ${customHighlight}; padding: 0 4px; border-radius: 4px;`); }}
                      className="px-2 py-0.5 rounded bg-yellow-600 text-white font-bold text-[10px]"
                    >
                      تطبيق
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); clearFormatting(); }}
            title="إزالة التنسيق"
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/30 text-red-400 transition-colors text-xs"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Main Container & Top Toolbar ── */}
      <div className={`rounded-2xl border ${theme.border} bg-white dark:bg-[var(--dk-elevated)] overflow-hidden shadow-sm transition-all ${theme.ring}`}>
        
        {/* Top Toolbar */}
        <div className={`flex flex-wrap items-center justify-between gap-1.5 px-3 py-2 border-b ${theme.border} ${theme.bgToolbar}`}>
          
          {/* Main Formatting Group */}
          <div className="flex items-center gap-1 flex-wrap">
            <button
              type="button"
              onClick={() => applyWrap('b')}
              title="عريض (Bold)"
              className="p-1.5 rounded-lg text-gray-700 dark:text-[var(--dk-text-1)] hover:bg-white dark:hover:bg-[var(--dk-surface)] transition-all font-black text-xs"
            >
              <Bold className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => applyWrap('i')}
              title="مائل (Italic)"
              className="p-1.5 rounded-lg text-gray-700 dark:text-[var(--dk-text-1)] hover:bg-white dark:hover:bg-[var(--dk-surface)] transition-all text-xs"
            >
              <Italic className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => applyWrap('u')}
              title="تسطير (Underline)"
              className="p-1.5 rounded-lg text-gray-700 dark:text-[var(--dk-text-1)] hover:bg-white dark:hover:bg-[var(--dk-surface)] transition-all text-xs"
            >
              <Underline className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => applyWrap('s')}
              title="شطب (Strikethrough)"
              className="p-1.5 rounded-lg text-gray-700 dark:text-[var(--dk-text-1)] hover:bg-white dark:hover:bg-[var(--dk-surface)] transition-all text-xs"
            >
              <Strikethrough className="w-4 h-4" />
            </button>

            <div className="h-4 w-px bg-gray-300 dark:bg-[var(--dk-border)] mx-1" />

            {/* Text Color Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setActiveDropdown(activeDropdown === 'top_color' ? null : 'top_color')}
                title="لون النص"
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold transition-all ${
                  activeDropdown === 'top_color'
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                    : 'text-gray-700 dark:text-[var(--dk-text-1)] hover:bg-white dark:hover:bg-[var(--dk-surface)]'
                }`}
              >
                <Palette className="w-3.5 h-3.5 text-blue-500" />
                <span className="hidden sm:inline text-[11px]">لون الخط</span>
                <ChevronDown className="w-3 h-3 text-gray-400" />
              </button>

              {activeDropdown === 'top_color' && (
                <div className="absolute top-full right-0 mt-1 p-2.5 bg-white dark:bg-[var(--dk-surface)] border border-gray-200 dark:border-[var(--dk-border)] rounded-2xl shadow-xl z-50 min-w-[210px]">
                  <div className="text-[11px] font-bold text-gray-500 dark:text-[var(--dk-text-2)] mb-2">ألوان شائعة:</div>
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {TEXT_COLORS.map(c => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => applyWrap('span', `color: ${c.value}`)}
                        title={c.label}
                        className="w-8 h-8 rounded-xl flex items-center justify-center border border-gray-200 dark:border-gray-700 shadow-sm hover:scale-110 transition-transform"
                        style={{ backgroundColor: c.value }}
                      />
                    ))}
                  </div>
                  <div className="pt-2 border-t border-gray-150 dark:border-[var(--dk-border)] flex items-center justify-between gap-1 text-xs">
                    <span className="text-[11px] font-bold text-gray-600 dark:text-[var(--dk-text-2)]">درجة مخصصة:</span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={customColor}
                        onChange={(e) => setCustomColor(e.target.value)}
                        className="w-7 h-7 rounded-lg cursor-pointer border-0 bg-transparent"
                      />
                      <button
                        type="button"
                        onClick={() => applyWrap('span', `color: ${customColor}`)}
                        className="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 transition-colors"
                      >
                        تطبيق
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Highlight Background Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setActiveDropdown(activeDropdown === 'top_highlight' ? null : 'top_highlight')}
                title="تظليل النص"
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold transition-all ${
                  activeDropdown === 'top_highlight'
                    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300'
                    : 'text-gray-700 dark:text-[var(--dk-text-1)] hover:bg-white dark:hover:bg-[var(--dk-surface)]'
                }`}
              >
                <Highlighter className="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-400" />
                <span className="hidden sm:inline text-[11px]">تظليل</span>
                <ChevronDown className="w-3 h-3 text-gray-400" />
              </button>

              {activeDropdown === 'top_highlight' && (
                <div className="absolute top-full right-0 mt-1 p-2.5 bg-white dark:bg-[var(--dk-surface)] border border-gray-200 dark:border-[var(--dk-border)] rounded-2xl shadow-xl z-50 min-w-[210px]">
                  <div className="text-[11px] font-bold text-gray-500 dark:text-[var(--dk-text-2)] mb-2">ألوان التظليل:</div>
                  <div className="grid grid-cols-3 gap-1.5 mb-3">
                    {HIGHLIGHT_COLORS.map(c => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => applyWrap('mark', `background-color: ${c.value}; padding: 0 4px; border-radius: 4px;`)}
                        title={c.label}
                        className="py-1 px-2 rounded-lg text-xs font-bold text-gray-900 border border-gray-200 shadow-sm hover:scale-105 transition-transform text-center"
                        style={{ backgroundColor: c.value }}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                  <div className="pt-2 border-t border-gray-150 dark:border-[var(--dk-border)] flex items-center justify-between gap-1 text-xs">
                    <span className="text-[11px] font-bold text-gray-600 dark:text-[var(--dk-text-2)]">تظليل حر:</span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={customHighlight}
                        onChange={(e) => setCustomHighlight(e.target.value)}
                        className="w-7 h-7 rounded-lg cursor-pointer border-0 bg-transparent"
                      />
                      <button
                        type="button"
                        onClick={() => applyWrap('mark', `background-color: ${customHighlight}; padding: 0 4px; border-radius: 4px;`)}
                        className="px-2.5 py-1 rounded-lg bg-yellow-600 text-white font-bold text-xs hover:bg-yellow-700 transition-colors"
                      >
                        تطبيق
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Font Size Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setActiveDropdown(activeDropdown === 'top_size' ? null : 'top_size')}
                title="حجم الخط"
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold transition-all ${
                  activeDropdown === 'top_size'
                    ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300'
                    : 'text-gray-700 dark:text-[var(--dk-text-1)] hover:bg-white dark:hover:bg-[var(--dk-surface)]'
                }`}
              >
                <Type className="w-3.5 h-3.5 text-purple-600" />
                <span className="hidden sm:inline text-[11px]">الحجم</span>
                <ChevronDown className="w-3 h-3 text-gray-400" />
              </button>

              {activeDropdown === 'top_size' && (
                <div className="absolute top-full right-0 mt-1 p-1.5 bg-white dark:bg-[var(--dk-surface)] border border-gray-200 dark:border-[var(--dk-border)] rounded-xl shadow-xl z-50 min-w-[130px] space-y-1">
                  {FONT_SIZES.map(s => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => applyWrap('span', `font-size: ${s.value}`)}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-bold text-gray-700 dark:text-[var(--dk-text-1)] hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors text-right"
                    >
                      <span>{s.label}</span>
                      <span className="text-[10px] text-gray-400 font-normal">{s.desc}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Subscript / Superscript */}
            <button
              type="button"
              onClick={() => applyWrap('sub')}
              title="دليل سفلي (Subscript: X₂)"
              className="p-1.5 rounded-lg text-gray-700 dark:text-[var(--dk-text-1)] hover:bg-white dark:hover:bg-[var(--dk-surface)] transition-all font-bold text-xs"
            >
              <Subscript className="w-4 h-4 text-gray-600 dark:text-[var(--dk-text-2)]" />
            </button>
            <button
              type="button"
              onClick={() => applyWrap('sup')}
              title="أس علوي (Superscript: X²)"
              className="p-1.5 rounded-lg text-gray-700 dark:text-[var(--dk-text-1)] hover:bg-white dark:hover:bg-[var(--dk-surface)] transition-all font-bold text-xs"
            >
              <Superscript className="w-4 h-4 text-gray-600 dark:text-[var(--dk-text-2)]" />
            </button>

            {/* Clear Formatting */}
            <button
              type="button"
              onClick={clearFormatting}
              title="إزالة التنسيق من النص المحدد"
              className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all text-xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Right Group: Math Toolbar & Live Preview Toggles */}
          <div className="flex items-center gap-1.5">
            {enableMath && (
              <button
                type="button"
                onClick={() => setShowMathToolbar(m => !m)}
                title="أدوات ومعادلات الرياضيات (KaTeX)"
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  showMathToolbar
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-white dark:bg-[var(--dk-surface)] border border-gray-200 dark:border-[var(--dk-border)] text-purple-700 dark:text-purple-300 hover:border-purple-300'
                }`}
              >
                <Sigma className="w-3.5 h-3.5" />
                <span className="text-[11px]">معادلات ∑</span>
              </button>
            )}

            {showPreviewToggle && (
              <button
                type="button"
                onClick={() => setShowLivePreview(p => !p)}
                title="معاينة حية لشكل السؤال كما سيظهر للطالب"
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  showLivePreview
                    ? 'bg-green-600 text-white shadow-sm'
                    : 'bg-white dark:bg-[var(--dk-surface)] border border-gray-200 dark:border-[var(--dk-border)] text-gray-600 dark:text-[var(--dk-text-2)] hover:border-green-300'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span className="text-[11px] hidden sm:inline">معاينة</span>
              </button>
            )}
          </div>

        </div>

        {/* ── Sub Math Toolbar (Collapsible) ── */}
        {enableMath && showMathToolbar && (
          <div className="p-2 bg-purple-50/80 dark:bg-purple-950/30 border-b border-purple-100 dark:border-purple-900/30">
            <div className="flex items-center justify-between mb-1.5 text-[11px]">
              <span className="font-black text-purple-700 dark:text-purple-300">أدوات الرياضيات ($...$ في السطر)</span>
              <button
                type="button"
                onClick={insertMathBlock}
                className="px-2 py-0.5 bg-purple-600 text-white text-[10px] font-bold rounded-md hover:bg-purple-700"
                title="معادلة في سطر منفصل"
              >
                $$...$$ سطر منفصل
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {MATH_SYMBOLS.map(sym => (
                <button
                  key={sym.label}
                  type="button"
                  title={sym.title}
                  onClick={() => insertMath(sym)}
                  className="px-2 py-0.5 text-xs font-bold rounded-md bg-white dark:bg-[var(--dk-surface)] border border-purple-200 dark:border-purple-800 text-purple-800 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-all min-w-[1.8rem] text-center"
                >
                  {sym.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Textarea Input ── */}
        <AutoResizeTextarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          minHeight={minHeight}
          maxHeight={maxHeight}
          className={`w-full px-3.5 py-3 bg-transparent text-gray-900 dark:text-[var(--dk-text-1)] text-sm focus:outline-none placeholder:text-gray-400 dark:placeholder:text-[var(--dk-text-3)] leading-relaxed resize-none ${className}`}
        />

        {/* ── Live Preview Box (Appears when toggled or when text has rich tags) ── */}
        {(showLivePreview || (hasFormatting && showLivePreview !== false)) && (
          <div className="border-t border-dashed border-gray-200 dark:border-[var(--dk-border)] bg-gray-50/70 dark:bg-gray-900/30 px-3.5 py-2.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-gray-400 dark:text-[var(--dk-text-3)] flex items-center gap-1">
                <Eye className="w-3 h-3 text-green-500" /> معاينة العرض للطالب:
              </span>
            </div>
            <div className="text-sm text-gray-800 dark:text-[var(--dk-text-1)] font-semibold min-h-[1.5rem] leading-relaxed">
              {hasContent ? (
                <MathText text={value} />
              ) : (
                <span className="text-gray-400 italic text-xs">لا يوجد نص بعد للمعاينة...</span>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

/**
 * Compact formatting button for single-line inputs (e.g. Option A, B, C, D)
 */
export function CompactOptionFormatter({ inputRef, value, onChange, placeholder, className = '' }) {
  const [showPalette, setShowPalette] = useState(false);
  const [customColor, setCustomColor] = useState('#ef4444');

  const applyWrap = (tag, styleString = '') => {
    const el = inputRef?.current;
    if (!el) return;
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    const selected = (value || '').slice(start, end);
    const styleAttr = styleString ? ` style="${styleString}"` : '';
    const openTag = `<${tag}${styleAttr}>`;
    const closeTag = `</${tag}>`;

    const val = value || '';
    let newVal;
    let newCursorPos;

    if (selected) {
      newVal = val.slice(0, start) + openTag + selected + closeTag + val.slice(end);
      newCursorPos = start + openTag.length + selected.length + closeTag.length;
    } else {
      newVal = val.slice(0, start) + openTag + 'نص' + closeTag + val.slice(end);
      newCursorPos = start + openTag.length + 2;
    }

    onChange(newVal);
    setShowPalette(false);

    setTimeout(() => {
      el.focus();
      el.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const clearFormatting = () => {
    const el = inputRef?.current;
    if (!el) return;
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    const selected = (value || '').slice(start, end);
    if (!selected) return;

    const cleanText = selected.replace(/<[^>]*>/g, '');
    const val = value || '';
    const newVal = val.slice(0, start) + cleanText + val.slice(end);

    onChange(newVal);
    setShowPalette(false);
  };

  return (
    <div className="relative flex-1 flex items-center">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-xl pl-9 pr-3 py-2 border border-gray-200 dark:border-[var(--dk-border)] bg-white dark:bg-[var(--dk-elevated)] text-gray-900 dark:text-[var(--dk-text-1)] text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 dark:focus:ring-purple-600/50 placeholder:text-gray-400 dark:placeholder:text-[var(--dk-text-3)] ${className}`}
      />
      <button
        type="button"
        onClick={() => setShowPalette(p => !p)}
        title="تنسيق وتلوين الخيار"
        className={`absolute left-2 p-1 rounded-lg text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30 transition-all ${
          showPalette ? 'text-purple-600 bg-purple-50 dark:bg-purple-900/40' : ''
        }`}
      >
        <Palette className="w-4 h-4" />
      </button>

      {showPalette && (
        <div className="absolute top-full left-0 mt-1 p-2 bg-white dark:bg-[var(--dk-surface)] border border-gray-200 dark:border-[var(--dk-border)] rounded-2xl shadow-xl z-50 min-w-[220px]">
          <div className="flex items-center justify-between mb-1.5 pb-1.5 border-b border-gray-150 dark:border-[var(--dk-border)]">
            <span className="text-[10px] font-bold text-gray-500 dark:text-[var(--dk-text-2)]">تنسيق الخيار</span>
            <button type="button" onClick={() => setShowPalette(false)} className="text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1 mb-2">
            <button type="button" onClick={() => applyWrap('b')} title="عريض" className="p-1 rounded hover:bg-gray-100 dark:hover:bg-[var(--dk-elevated)]">
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => applyWrap('i')} title="مائل" className="p-1 rounded hover:bg-gray-100 dark:hover:bg-[var(--dk-elevated)]">
              <Italic className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => applyWrap('u')} title="تسطير" className="p-1 rounded hover:bg-gray-100 dark:hover:bg-[var(--dk-elevated)]">
              <Underline className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => applyWrap('s')} title="شطب" className="p-1 rounded hover:bg-gray-100 dark:hover:bg-[var(--dk-elevated)]">
              <Strikethrough className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => applyWrap('sub')} title="دليل سفلي" className="p-1 rounded hover:bg-gray-100 dark:hover:bg-[var(--dk-elevated)]">
              <Subscript className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => applyWrap('sup')} title="أس علوي" className="p-1 rounded hover:bg-gray-100 dark:hover:bg-[var(--dk-elevated)]">
              <Superscript className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={clearFormatting} title="إزالة التنسيق" className="p-1 rounded text-red-500 hover:bg-red-50">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="text-[10px] font-bold text-gray-400 mb-1">لون الخط:</div>
          <div className="grid grid-cols-4 gap-1.5 mb-2">
            {TEXT_COLORS.map(c => (
              <button
                key={c.value}
                type="button"
                onClick={() => applyWrap('span', `color: ${c.value}`)}
                className="w-6 h-6 rounded-lg border border-gray-200 dark:border-gray-700 hover:scale-110 transition-transform"
                style={{ backgroundColor: c.value }}
              />
            ))}
          </div>

          <div className="pt-1.5 border-t border-gray-150 dark:border-[var(--dk-border)] flex items-center justify-between gap-1 text-[10px]">
            <span className="text-gray-500">لون مخصص:</span>
            <div className="flex items-center gap-1">
              <input
                type="color"
                value={customColor}
                onChange={(e) => setCustomColor(e.target.value)}
                className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
              />
              <button
                type="button"
                onClick={() => applyWrap('span', `color: ${customColor}`)}
                className="px-2 py-0.5 rounded bg-purple-600 text-white font-bold text-[10px]"
              >
                تطبيق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
