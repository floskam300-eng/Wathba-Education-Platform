import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Bold, Italic, Underline, Strikethrough, Palette,
  Highlighter, Type, Sigma, X, ChevronDown, ChevronUp,
  Eye, RotateCcw, Subscript, Superscript, Check, Code
} from 'lucide-react';
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
  { label: '√', insert: '\\sqrt{}', title: 'جذر تربيعي' },
  { label: '∛', insert: '\\sqrt[3]{}', title: 'جذر تكعيبي' },
  { label: 'a/b', insert: '\\frac{}{}', title: 'كسر' },
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
  { label: 'sin', insert: '\\sin()', title: 'جيب' },
  { label: 'cos', insert: '\\cos()', title: 'جيب تمام' },
  { label: 'tan', insert: '\\tan()', title: 'ظل' },
  { label: 'log', insert: '\\log()', title: 'لوغاريتم' },
  { label: 'Σ', insert: '\\sum_{}^{}', title: 'مجموع' },
  { label: '∫', insert: '\\int_{}^{}', title: 'تكامل' },
  { label: '|x|', insert: '|{}|', title: 'قيمة مطلقة' },
  { label: '°', insert: '^{\\circ}', title: 'درجة' },
  { label: 'vec', insert: '\\vec{}', title: 'متجه' },
];

function sanitizeEditorOutput(html) {
  if (!html) return '';
  let cleaned = html
    .replace(/^<p><br><\/p>$/i, '')
    .replace(/^<div><br><\/div>$/i, '')
    .replace(/<br class="ProseMirror-trailingBreak">/gi, '')
    .replace(/&#8203;/g, '')
    .replace(/&nbsp;/g, ' ');

  const textOnly = cleaned.replace(/<[^>]*>/g, '').trim();
  if (!textOnly && !/<img|<svg/i.test(cleaned)) {
    return '';
  }
  return cleaned;
}

export default function RichTextPalette({
  value = '',
  onChange,
  placeholder = 'اكتب نص السؤال هنا...',
  minHeight = 90,
  maxHeight = 320,
  className = '',
  enableMath = true,
  showPreviewToggle = true,
  accentColor = 'purple',
}) {
  const editorRef = useRef(null);
  const containerRef = useRef(null);
  const savedRangeRef = useRef(null);
  const lastEmittedValue = useRef(value || '');

  const [isSourceMode, setIsSourceMode] = useState(false);
  const [bubbleVisible, setBubbleVisible] = useState(false);
  const [bubbleCoords, setBubbleCoords] = useState({ top: 0, left: 0 });
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [customColor, setCustomColor] = useState('#2563eb');
  const [customHighlight, setCustomHighlight] = useState('#fef08a');
  const [showLivePreview, setShowLivePreview] = useState(false);
  const [showMathToolbar, setShowMathToolbar] = useState(false);

  useEffect(() => {
    if (!editorRef.current) return;
    const currentHtml = editorRef.current.innerHTML;
    const targetHtml = value || '';
    if (targetHtml !== lastEmittedValue.current && targetHtml !== currentHtml) {
      editorRef.current.innerHTML = targetHtml;
      lastEmittedValue.current = targetHtml;
    }
  }, [value]);

  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (editorRef.current && editorRef.current.contains(range.commonAncestorContainer)) {
        savedRangeRef.current = range.cloneRange();
      }
    }
  }, []);

  const restoreSelection = useCallback(() => {
    if (savedRangeRef.current) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    }
  }, []);

  const emitChange = useCallback(() => {
    if (!editorRef.current) return;
    const raw = editorRef.current.innerHTML;
    const cleaned = sanitizeEditorOutput(raw);
    lastEmittedValue.current = cleaned;
    onChange(cleaned);
  }, [onChange]);

  const checkSelection = useCallback(() => {
    if (isSourceMode) {
      setBubbleVisible(false);
      return;
    }
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setBubbleVisible(false);
      setActiveDropdown(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const container = containerRef.current;
    const editor = editorRef.current;
    if (!editor || !container || !editor.contains(range.commonAncestorContainer)) {
      setBubbleVisible(false);
      return;
    }
    saveSelection();
    const rangeRect = range.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    if (rangeRect.width === 0 && rangeRect.height === 0) {
      setBubbleVisible(false);
      return;
    }
    const top = Math.max(8, rangeRect.top - containerRect.top - 46);
    const left = Math.min(Math.max(10, rangeRect.right - containerRect.left - 160), containerRect.width - 250);
    setBubbleCoords({ top, left });
    setBubbleVisible(true);
  }, [isSourceMode, saveSelection]);

  useEffect(() => {
    document.addEventListener('selectionchange', checkSelection);
    return () => document.removeEventListener('selectionchange', checkSelection);
  }, [checkSelection]);

  const execCmd = (cmd, val = null) => {
    restoreSelection();
    if (editorRef.current) editorRef.current.focus();
    document.execCommand(cmd, false, val);
    emitChange();
    checkSelection();
  };

  const applyInlineStyle = (styleProp, styleVal) => {
    restoreSelection();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!editorRef.current || !editorRef.current.contains(range.commonAncestorContainer)) return;
    if (range.collapsed) {
      const span = document.createElement('span');
      span.style[styleProp] = styleVal;
      span.textContent = 'نص';
      range.insertNode(span);
      const newRange = document.createRange();
      newRange.selectNodeContents(span);
      sel.removeAllRanges();
      sel.addRange(newRange);
      savedRangeRef.current = newRange.cloneRange();
    } else {
      const span = document.createElement('span');
      span.style[styleProp] = styleVal;
      if (styleProp === 'backgroundColor') {
        span.style.padding = '0.15em 0.35em';
        span.style.borderRadius = '0.3em';
      }
      const extracted = range.extractContents();
      span.appendChild(extracted);
      range.insertNode(span);
      const newRange = document.createRange();
      newRange.selectNodeContents(span);
      sel.removeAllRanges();
      sel.addRange(newRange);
      savedRangeRef.current = newRange.cloneRange();
    }
    emitChange();
    setActiveDropdown(null);
    setBubbleVisible(false);
  };

  const clearFormatting = () => {
    restoreSelection();
    if (editorRef.current) editorRef.current.focus();
    document.execCommand('removeFormat', false, null);
    emitChange();
    setBubbleVisible(false);
    setActiveDropdown(null);
  };

  const insertMath = (sym) => {
    restoreSelection();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const selectedText = sel.toString();
    const toInsert = selectedText ? `$${sym.insert.replace('{}', `{${selectedText}}`)}$` : `$${sym.insert}$`;
    const textNode = document.createTextNode(toInsert);
    range.deleteContents();
    range.insertNode(textNode);
    emitChange();
  };

  const insertMathBlock = () => {
    restoreSelection();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const selectedText = sel.toString();
    const toInsert = `\n$$\n${selectedText || 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}'}\n$$\n`;
    const textNode = document.createTextNode(toInsert);
    range.deleteContents();
    range.insertNode(textNode);
    emitChange();
  };

  const handleKeyDown = (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b' || e.key === 'B') { e.preventDefault(); execCmd('bold'); }
      else if (e.key === 'i' || e.key === 'I') { e.preventDefault(); execCmd('italic'); }
      else if (e.key === 'u' || e.key === 'U') { e.preventDefault(); execCmd('underline'); }
    }
  };

  const colorMap = {
    purple: { border: 'border-purple-200 dark:border-purple-900/40', bgToolbar: 'bg-purple-50/60 dark:bg-purple-950/20', ring: 'focus-within:ring-purple-400 dark:focus-within:ring-purple-600/50' },
    orange: { border: 'border-orange-200 dark:border-orange-900/40', bgToolbar: 'bg-orange-50/60 dark:bg-orange-950/20', ring: 'focus-within:ring-orange-400 dark:focus-within:ring-orange-600/50' },
    blue: { border: 'border-blue-200 dark:border-blue-900/40', bgToolbar: 'bg-blue-50/60 dark:bg-blue-950/20', ring: 'focus-within:ring-blue-400 dark:focus-within:ring-blue-600/50' },
  };
  const theme = colorMap[accentColor] || colorMap.purple;
  const hasContent = !!(value && value.trim());

  return (
    <div ref={containerRef} className="relative w-full" dir="auto">
      {/* ── Floating Bubble Toolbar on Selection ── */}
      {bubbleVisible && !isSourceMode && (
        <div
          style={{ top: `${bubbleCoords.top}px`, right: `${bubbleCoords.left}px` }}
          className="absolute z-50 flex items-center gap-1 p-1 bg-gray-900/95 text-white backdrop-blur-md rounded-2xl shadow-xl border border-gray-700/50 animate-in fade-in zoom-in-95 duration-150"
        >
          <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd('bold'); }} title="عريض" className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/20 text-xs"><Bold className="w-3.5 h-3.5" /></button>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd('italic'); }} title="مائل" className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/20 text-xs"><Italic className="w-3.5 h-3.5" /></button>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd('underline'); }} title="تسطير" className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/20 text-xs"><Underline className="w-3.5 h-3.5" /></button>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd('strikeThrough'); }} title="شطب" className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/20 text-xs"><Strikethrough className="w-3.5 h-3.5" /></button>
          <div className="w-px h-4 bg-gray-700 mx-0.5" />
          <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd('subscript'); }} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/20 text-xs"><Subscript className="w-3.5 h-3.5" /></button>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd('superscript'); }} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/20 text-xs"><Superscript className="w-3.5 h-3.5" /></button>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); clearFormatting(); }} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/30 text-red-300 text-xs"><RotateCcw className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* ── Main Editor Box ── */}
      <div className={`w-full rounded-2xl border transition-all ${theme.border} ${theme.ring} bg-white dark:bg-[var(--dk-surface)] shadow-xs overflow-visible`}>
        {/* Top Action Toolbar */}
        <div className={`flex items-center justify-between gap-1 p-1.5 border-b border-gray-200/80 dark:border-[var(--dk-border)] ${theme.bgToolbar} rounded-t-2xl flex-wrap`}>
          <div className="flex items-center gap-0.5 flex-wrap">
            <button type="button" onClick={() => execCmd('bold')} className="p-1.5 rounded-lg text-gray-700 dark:text-[var(--dk-text-1)] hover:bg-white dark:hover:bg-[var(--dk-surface)] transition-all font-bold text-xs" title="عريض (Ctrl+B)"><Bold className="w-4 h-4" /></button>
            <button type="button" onClick={() => execCmd('italic')} className="p-1.5 rounded-lg text-gray-700 dark:text-[var(--dk-text-1)] hover:bg-white dark:hover:bg-[var(--dk-surface)] transition-all text-xs" title="مائل (Ctrl+I)"><Italic className="w-4 h-4" /></button>
            <button type="button" onClick={() => execCmd('underline')} className="p-1.5 rounded-lg text-gray-700 dark:text-[var(--dk-text-1)] hover:bg-white dark:hover:bg-[var(--dk-surface)] transition-all text-xs" title="تسطير (Ctrl+U)"><Underline className="w-4 h-4" /></button>
            <button type="button" onClick={() => execCmd('strikeThrough')} className="p-1.5 rounded-lg text-gray-700 dark:text-[var(--dk-text-1)] hover:bg-white dark:hover:bg-[var(--dk-surface)] transition-all text-xs" title="يتوسطه خط"><Strikethrough className="w-4 h-4" /></button>

            <div className="w-px h-5 bg-gray-300 dark:bg-[var(--dk-border)] mx-1" />

            {/* Top Color Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => { saveSelection(); setActiveDropdown(d => d === 'top_color' ? null : 'top_color'); }}
                title="تلوين النص بلون مخصص"
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold transition-all ${
                  activeDropdown === 'top_color'
                    ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                    : 'text-gray-700 dark:text-[var(--dk-text-1)] hover:bg-white dark:hover:bg-[var(--dk-surface)]'
                }`}
              >
                <Palette className="w-3.5 h-3.5 text-red-500" />
                <span className="hidden sm:inline text-[11px]">اللون</span>
                <ChevronDown className="w-3 h-3 text-gray-400" />
              </button>

              {activeDropdown === 'top_color' && (
                <div className="absolute top-full right-0 mt-1 p-2 bg-white dark:bg-[var(--dk-surface)] border border-gray-200 dark:border-[var(--dk-border)] rounded-xl shadow-xl z-50 min-w-[190px]">
                  <p className="text-[10px] font-bold text-gray-500 mb-1.5 px-1">اختر لون النص:</p>
                  <div className="grid grid-cols-4 gap-1.5 mb-2">
                    {TEXT_COLORS.map(c => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => applyInlineStyle('color', c.value)}
                        title={c.label}
                        className="w-7 h-7 rounded-lg border border-black/10 hover:scale-110 transition-transform flex items-center justify-center"
                        style={{ backgroundColor: c.value }}
                      />
                    ))}
                  </div>
                  <div className="pt-2 border-t border-gray-100 dark:border-[var(--dk-border)] flex items-center gap-1.5">
                    <input
                      type="color"
                      value={customColor}
                      onChange={(e) => setCustomColor(e.target.value)}
                      className="w-7 h-7 rounded cursor-pointer border-0 p-0"
                    />
                    <button
                      type="button"
                      onClick={() => applyInlineStyle('color', customColor)}
                      className="flex-1 py-1 text-xs font-bold bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
                    >
                      تطبيق اللون
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Top Highlight Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => { saveSelection(); setActiveDropdown(d => d === 'top_highlight' ? null : 'top_highlight'); }}
                title="تظليل النص وتمييزه"
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold transition-all ${
                  activeDropdown === 'top_highlight'
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                    : 'text-gray-700 dark:text-[var(--dk-text-1)] hover:bg-white dark:hover:bg-[var(--dk-surface)]'
                }`}
              >
                <Highlighter className="w-3.5 h-3.5 text-amber-500" />
                <span className="hidden sm:inline text-[11px]">تظليل</span>
                <ChevronDown className="w-3 h-3 text-gray-400" />
              </button>

              {activeDropdown === 'top_highlight' && (
                <div className="absolute top-full right-0 mt-1 p-2 bg-white dark:bg-[var(--dk-surface)] border border-gray-200 dark:border-[var(--dk-border)] rounded-xl shadow-xl z-50 min-w-[190px]">
                  <p className="text-[10px] font-bold text-gray-500 mb-1.5 px-1">لون التظليل:</p>
                  <div className="grid grid-cols-3 gap-1.5 mb-2">
                    {HIGHLIGHT_COLORS.map(c => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => applyInlineStyle('backgroundColor', c.value)}
                        title={c.label}
                        className="h-7 rounded-lg text-[10px] font-bold text-gray-900 border border-black/10 hover:scale-105 transition-transform flex items-center justify-center"
                        style={{ backgroundColor: c.value }}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                  <div className="pt-2 border-t border-gray-100 dark:border-[var(--dk-border)] flex items-center gap-1.5">
                    <input
                      type="color"
                      value={customHighlight}
                      onChange={(e) => setCustomHighlight(e.target.value)}
                      className="w-7 h-7 rounded cursor-pointer border-0 p-0"
                    />
                    <button
                      type="button"
                      onClick={() => applyInlineStyle('backgroundColor', customHighlight)}
                      className="flex-1 py-1 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors"
                    >
                      تطبيق التظليل
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Top Font Size Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => { saveSelection(); setActiveDropdown(d => d === 'top_size' ? null : 'top_size'); }}
                title="تغيير حجم الخط"
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
                      onClick={() => applyInlineStyle('fontSize', s.value)}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-bold text-gray-700 dark:text-[var(--dk-text-1)] hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors text-right"
                    >
                      <span>{s.label}</span>
                      <span className="text-[10px] text-gray-400 font-normal">{s.desc}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button type="button" onClick={() => execCmd('subscript')} title="دليل سفلي (X₂)" className="p-1.5 rounded-lg text-gray-700 dark:text-[var(--dk-text-1)] hover:bg-white dark:hover:bg-[var(--dk-surface)] font-bold text-xs"><Subscript className="w-4 h-4" /></button>
            <button type="button" onClick={() => execCmd('superscript')} title="أس علوي (X²)" className="p-1.5 rounded-lg text-gray-700 dark:text-[var(--dk-text-1)] hover:bg-white dark:hover:bg-[var(--dk-surface)] font-bold text-xs"><Superscript className="w-4 h-4" /></button>
            <button type="button" onClick={clearFormatting} title="إزالة التنسيق" className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 text-xs"><RotateCcw className="w-3.5 h-3.5" /></button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setIsSourceMode(m => !m);
                setActiveDropdown(null);
                setBubbleVisible(false);
              }}
              title={isSourceMode ? 'العودة للمحرر المرئي (WYSIWYG)' : 'عرض كود HTML'}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                isSourceMode
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-white dark:bg-[var(--dk-surface)] border border-gray-200 dark:border-[var(--dk-border)] text-gray-600 dark:text-[var(--dk-text-2)] hover:border-amber-400'
              }`}
            >
              <Code className="w-3.5 h-3.5" />
              <span className="text-[11px] hidden sm:inline">{isSourceMode ? 'الوضع المرئي' : 'كود HTML'}</span>
            </button>

            {enableMath && (
              <button
                type="button"
                onClick={() => setShowMathToolbar(m => !m)}
                title="أدوات ومعادلات الرياضيات"
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

        {/* Math Toolbar (Collapsible) */}
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

        {/* Visual ContentEditable Body OR Raw Code Mode */}
        {isSourceMode ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            dir="auto"
            style={{ minHeight: `${minHeight}px`, maxHeight: `${maxHeight}px`, unicodeBidi: 'plaintext' }}
            className={`w-full px-3.5 py-3 bg-gray-50/50 dark:bg-gray-900/50 font-mono text-xs text-gray-800 dark:text-[var(--dk-text-1)] focus:outline-none placeholder:text-gray-400 leading-relaxed resize-y ${className}`}
          />
        ) : (
          <div className="relative">
            <div
              ref={editorRef}
              contentEditable
              dir="auto"
              onInput={emitChange}
              onKeyDown={handleKeyDown}
              onKeyUp={checkSelection}
              onMouseUp={checkSelection}
              onBlur={emitChange}
              style={{ minHeight: `${minHeight}px`, maxHeight: `${maxHeight}px`, unicodeBidi: 'plaintext' }}
              data-placeholder={placeholder}
              className={`w-full px-3.5 py-3 text-sm text-gray-900 dark:text-[var(--dk-text-1)] focus:outline-none leading-relaxed overflow-y-auto ${
                !value ? 'before:content-[attr(data-placeholder)] before:text-gray-400 dark:before:text-[var(--dk-text-3)] before:pointer-events-none before:block' : ''
              } ${className}`}
            />
          </div>
        )}

        {/* Live Preview Box */}
        {showLivePreview && (
          <div className="border-t border-dashed border-gray-200 dark:border-[var(--dk-border)] bg-gray-50/70 dark:bg-gray-900/30 px-3.5 py-2.5" dir="auto">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-gray-400 dark:text-[var(--dk-text-3)] flex items-center gap-1">
                <Eye className="w-3 h-3 text-green-500" /> معاينة العرض النهائي للطالب:
              </span>
            </div>
            <div className="text-sm text-gray-800 dark:text-[var(--dk-text-1)] font-semibold min-h-[1.5rem] leading-relaxed" dir="auto">
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
 * Compact visual formatting button and input for single-line options (e.g. Option A, B, C, D)
 */
export function CompactOptionFormatter({ value = '', onChange, placeholder = '', className = '' }) {
  const [showPalette, setShowPalette] = useState(false);
  const [customColor, setCustomColor] = useState('#ef4444');
  const [customHighlight, setCustomHighlight] = useState('#fef08a');
  const editableRef = useRef(null);
  const savedRangeRef = useRef(null);
  const lastEmittedValue = useRef(value || '');

  // Sync external value
  useEffect(() => {
    if (!editableRef.current) return;
    const currentHtml = editableRef.current.innerHTML;
    const targetHtml = value || '';

    if (targetHtml !== lastEmittedValue.current && targetHtml !== currentHtml) {
      editableRef.current.innerHTML = targetHtml;
      lastEmittedValue.current = targetHtml;
    }
  }, [value]);

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (editableRef.current && editableRef.current.contains(range.commonAncestorContainer)) {
        savedRangeRef.current = range.cloneRange();
      }
    }
  };

  const restoreSelection = () => {
    if (savedRangeRef.current) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    }
  };

  const emitChange = () => {
    if (!editableRef.current) return;
    const raw = editableRef.current.innerHTML;
    const cleaned = sanitizeEditorOutput(raw);
    lastEmittedValue.current = cleaned;
    onChange(cleaned);
  };

  const execCmd = (cmd, val = null) => {
    restoreSelection();
    if (editableRef.current) {
      editableRef.current.focus();
    }
    document.execCommand(cmd, false, val);
    emitChange();
  };

  const applyInlineStyle = (styleProp, styleVal) => {
    restoreSelection();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!editableRef.current || !editableRef.current.contains(range.commonAncestorContainer)) return;

    if (range.collapsed) {
      const span = document.createElement('span');
      span.style[styleProp] = styleVal;
      span.textContent = 'نص';
      range.insertNode(span);
      const newRange = document.createRange();
      newRange.selectNodeContents(span);
      sel.removeAllRanges();
      sel.addRange(newRange);
      savedRangeRef.current = newRange.cloneRange();
    } else {
      const span = document.createElement('span');
      span.style[styleProp] = styleVal;
      if (styleProp === 'backgroundColor') {
        span.style.padding = '0.15em 0.35em';
        span.style.borderRadius = '0.3em';
      }
      const extracted = range.extractContents();
      span.appendChild(extracted);
      range.insertNode(span);
      const newRange = document.createRange();
      newRange.selectNodeContents(span);
      sel.removeAllRanges();
      sel.addRange(newRange);
      savedRangeRef.current = newRange.cloneRange();
    }

    emitChange();
    setShowPalette(false);
  };

  const clearFormatting = () => {
    restoreSelection();
    if (editableRef.current) {
      editableRef.current.focus();
    }
    document.execCommand('removeFormat', false, null);
    emitChange();
    setShowPalette(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
    }
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        execCmd('bold');
      } else if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        execCmd('italic');
      } else if (e.key === 'u' || e.key === 'U') {
        e.preventDefault();
        execCmd('underline');
      }
    }
  };

  return (
    <div className="relative flex items-center flex-1 min-w-0" dir="auto">
      {/* Visual contenteditable single line input */}
      <div
        ref={editableRef}
        contentEditable
        dir="auto"
        onInput={emitChange}
        onKeyDown={handleKeyDown}
        onBlur={emitChange}
        onMouseUp={saveSelection}
        onKeyUp={saveSelection}
        style={{ unicodeBidi: 'plaintext' }}
        data-placeholder={placeholder}
        className={`flex-1 min-h-[38px] px-3.5 py-2 rounded-xl border border-gray-200 dark:border-[var(--dk-border)] bg-white dark:bg-[var(--dk-elevated)] text-gray-900 dark:text-[var(--dk-text-1)] text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-purple-400 dark:focus:ring-purple-600/50 transition-all overflow-x-auto whitespace-nowrap leading-relaxed ${
          !value ? 'before:content-[attr(data-placeholder)] before:text-gray-400 dark:before:text-[var(--dk-text-3)] before:pointer-events-none before:block' : ''
        } ${className}`}
      />

      {/* Trigger formatting popover */}
      <div className="relative mr-1.5 flex-shrink-0">
        <button
          type="button"
          onClick={() => {
            saveSelection();
            setShowPalette(p => !p);
          }}
          title="تنسيق وتلوين هذا الخيار"
          className={`p-2 rounded-xl border transition-all ${
            showPalette
              ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
              : 'bg-gray-50 dark:bg-[var(--dk-elevated)] border-gray-200 dark:border-[var(--dk-border)] text-gray-500 dark:text-[var(--dk-text-2)] hover:text-purple-600 hover:border-purple-300'
          }`}
        >
          <Palette className="w-3.5 h-3.5" />
        </button>

        {showPalette && (
          <div className="absolute top-full left-0 mt-1.5 p-2 bg-white dark:bg-[var(--dk-surface)] border border-gray-200 dark:border-[var(--dk-border)] rounded-2xl shadow-2xl z-50 min-w-[210px] animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-gray-100 dark:border-[var(--dk-border)]">
              <span className="text-[11px] font-black text-gray-700 dark:text-[var(--dk-text-1)]">تنسيق الخيار</span>
              <button type="button" onClick={() => setShowPalette(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-3 h-3" />
              </button>
            </div>

            {/* Basic Styles */}
            <div className="flex items-center gap-1 mb-2">
              <button
                type="button"
                onClick={() => execCmd('bold')}
                className="flex-1 py-1 rounded-lg bg-gray-100 dark:bg-gray-700/50 hover:bg-purple-100 hover:text-purple-700 font-black text-xs transition-colors text-center"
                title="عريض"
              >
                <b>B</b>
              </button>
              <button
                type="button"
                onClick={() => execCmd('italic')}
                className="flex-1 py-1 rounded-lg bg-gray-100 dark:bg-gray-700/50 hover:bg-purple-100 hover:text-purple-700 font-serif italic text-xs transition-colors text-center"
                title="مائل"
              >
                <i>I</i>
              </button>
              <button
                type="button"
                onClick={() => execCmd('underline')}
                className="flex-1 py-1 rounded-lg bg-gray-100 dark:bg-gray-700/50 hover:bg-purple-100 hover:text-purple-700 underline text-xs transition-colors text-center"
                title="تسطير"
              >
                <u>U</u>
              </button>
              <button
                type="button"
                onClick={clearFormatting}
                className="p-1 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 text-xs transition-colors"
                title="إزالة التنسيق"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Quick Text Colors */}
            <div className="mb-2">
              <p className="text-[10px] font-bold text-gray-400 mb-1">لون النص:</p>
              <div className="grid grid-cols-4 gap-1">
                {TEXT_COLORS.slice(0, 8).map(c => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => applyInlineStyle('color', c.value)}
                    title={c.label}
                    className="h-6 rounded-md border border-black/10 hover:scale-110 transition-transform"
                    style={{ backgroundColor: c.value }}
                  />
                ))}
              </div>
              <div className="mt-1.5 flex items-center gap-1.5">
                <input
                  type="color"
                  value={customColor}
                  onChange={e => setCustomColor(e.target.value)}
                  className="w-5 h-5 rounded cursor-pointer border-0 p-0"
                />
                <button
                  type="button"
                  onClick={() => applyInlineStyle('color', customColor)}
                  className="flex-1 py-0.5 text-[10px] font-bold bg-purple-600 text-white rounded transition-colors"
                >
                  لون مخصص
                </button>
              </div>
            </div>

            {/* Quick Highlights */}
            <div>
              <p className="text-[10px] font-bold text-gray-400 mb-1">تظليل:</p>
              <div className="grid grid-cols-3 gap-1">
                {HIGHLIGHT_COLORS.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => applyInlineStyle('backgroundColor', c.value)}
                    className="h-5 rounded text-[9px] font-bold text-gray-900 border border-black/10 hover:scale-105 transition-transform"
                    style={{ backgroundColor: c.value }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
