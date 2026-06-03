import React, { useState } from 'react';

const SYMBOLS = [
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

export default function MathToolbar({ textareaRef, value, onChange }) {
  const [showHelp, setShowHelp] = useState(false);

  const insertAt = (sym) => {
    const el = textareaRef?.current;
    if (!el) {
      onChange(value + `$${sym.insert}$`);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end);

    let toInsert;
    if (selected) {
      toInsert = `$${sym.insert.replace('{}', `{${selected}`)}$`;
    } else {
      toInsert = `$${sym.insert}$`;
    }

    const newVal = value.slice(0, start) + toInsert + value.slice(end);
    onChange(newVal);

    setTimeout(() => {
      el.focus();
      const cursorPos = sym.cursor != null
        ? start + toInsert.length + sym.cursor
        : start + toInsert.length - 1;
      el.setSelectionRange(cursorPos, cursorPos);
    }, 0);
  };

  const wrapBlock = () => {
    const el = textareaRef?.current;
    if (!el) {
      onChange(value + '\n$$\n\n$$\n');
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end);
    const toInsert = `\n$$\n${selected || ''}\n$$\n`;
    const newVal = value.slice(0, start) + toInsert + value.slice(end);
    onChange(newVal);
    setTimeout(() => {
      el.focus();
      const pos = start + 4 + (selected ? selected.length : 0);
      el.setSelectionRange(pos, pos);
    }, 0);
  };

  return (
    <div className="rounded-xl border border-purple-200 bg-purple-50 p-2 mb-1" dir="rtl">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-black text-purple-700 uppercase tracking-wide">∑ أدوات الرياضيات</span>
          <span className="text-[9px] text-purple-500 font-medium">استخدم $...$ للمعادلة في السطر</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={wrapBlock}
            title="معادلة في سطر منفصل (display mode)"
            className="px-2 py-1 text-[10px] font-bold rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors">
            $$...$$
          </button>
          <button
            type="button"
            onClick={() => setShowHelp(h => !h)}
            className="px-2 py-1 text-[10px] font-bold rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors">
            {showHelp ? 'إخفاء' : '?'}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {SYMBOLS.map((sym) => (
          <button
            key={sym.label}
            type="button"
            title={sym.title}
            onClick={() => insertAt(sym)}
            className="px-2 py-1 text-xs font-bold rounded-lg bg-white border border-purple-200 text-purple-800 hover:bg-purple-100 hover:border-purple-400 transition-all shadow-sm min-w-[2rem]">
            {sym.label}
          </button>
        ))}
      </div>

      {showHelp && (
        <div className="mt-2 p-2.5 bg-white rounded-xl border border-purple-100 text-[11px] text-gray-600 space-y-1">
          <p className="font-bold text-purple-700 mb-1">طريقة الاستخدام:</p>
          <p>• <code className="bg-purple-50 px-1 rounded font-mono">$x^2 + y^2 = r^2$</code> — معادلة في نفس السطر</p>
          <p>• <code className="bg-purple-50 px-1 rounded font-mono">$$\frac{"{-b \\pm \\sqrt{b^2-4ac}}{2a}"}$$</code> — معادلة وسط الصفحة</p>
          <p>• <code className="bg-purple-50 px-1 rounded font-mono">$\sqrt{"{16}"}$</code> ← يعطي: √16</p>
          <p>• <code className="bg-purple-50 px-1 rounded font-mono">$\frac{"{3}{4}"}$</code> ← يعطي: ¾</p>
        </div>
      )}
    </div>
  );
}
