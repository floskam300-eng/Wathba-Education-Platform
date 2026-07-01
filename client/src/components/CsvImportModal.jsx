import React, { useState, useRef, useCallback } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle, Download } from 'lucide-react';
import Modal from './ui/Modal';
import api from '../lib/api';
import toast from 'react-hot-toast';

// ── CSV tokenizer: walks character-by-character over the FULL text ──
// Returns an array of rows, each row an array of field strings.
// Handles: quoted fields, embedded commas, escaped double-quotes (""),
// and quoted fields that span multiple lines (newlines inside quotes).
function tokenizeCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; } // escaped quote
        else { inQuotes = false; i++; }                     // closing quote
      } else {
        field += ch; i++;
      }
    } else {
      if (ch === '"') { inQuotes = true; i++; }
      else if (ch === ',') { row.push(field.trim()); field = ''; i++; }
      else if (ch === '\r' && text[i + 1] === '\n') { row.push(field.trim()); rows.push(row); row = []; field = ''; i += 2; }
      else if (ch === '\n') { row.push(field.trim()); rows.push(row); row = []; field = ''; i++; }
      else { field += ch; i++; }
    }
  }
  // flush last field / row
  if (field.trim() || row.length) { row.push(field.trim()); rows.push(row); }
  return rows;
}

const VALID_TYPES = ['mcq', 'true_false'];
const VALID_CORRECT = new Set(['A', 'B', 'C', 'D']);
const VALID_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);

function validateRow(row, mode) {
  const errors = [];
  const type = (row.type || '').toLowerCase().trim();
  if (!VALID_TYPES.includes(type)) errors.push(`النوع "${row.type || ''}" غير صالح — يجب أن يكون mcq أو true_false`);

  if (!(row.question_text || '').trim()) errors.push('نص السؤال مطلوب');

  if (type === 'mcq') {
    if (!(row.option_a || '').trim()) errors.push('الخيار A مطلوب');
    if (!(row.option_b || '').trim()) errors.push('الخيار B مطلوب');
    const correct = (row.correct || '').toUpperCase().trim();
    if (!VALID_CORRECT.has(correct)) errors.push('الإجابة الصحيحة يجب أن تكون A أو B أو C أو D');
    if (correct === 'C' && !(row.option_c || '').trim()) errors.push('الإجابة تشير للخيار C لكنه فارغ');
    if (correct === 'D' && !(row.option_d || '').trim()) errors.push('الإجابة تشير للخيار D لكنه فارغ');
  } else if (type === 'true_false') {
    const correct = (row.correct || '').toUpperCase().trim();
    if (!['A', 'B'].includes(correct)) errors.push('الإجابة الصحيحة لصح/خطأ يجب أن تكون A أو B');
  }

  const pts = parseInt(row.points, 10);
  if (isNaN(pts) || pts < 1 || pts > 1000) errors.push('النقاط يجب أن تكون بين 1 و 1000');

  if (mode === 'bank') {
    const diff = (row.difficulty || 'medium').toLowerCase().trim();
    if (!VALID_DIFFICULTIES.has(diff)) errors.push(`الصعوبة "${diff}" غير صالحة — easy أو medium أو hard`);
  }

  return errors;
}

function parseCsv(text, mode) {
  const allRows = tokenizeCsv(text).filter(r => r.some(c => c.trim()));
  if (allRows.length < 2) return { error: 'الملف فارغ أو لا يحتوي على أسئلة' };

  const headers = allRows[0].map(h => h.toLowerCase().replace(/\s+/g, '_').trim());
  const required = ['type', 'question_text', 'correct', 'points'];
  for (const req of required) {
    if (!headers.includes(req)) return { error: `العمود المطلوب "${req}" غير موجود في رأس الملف` };
  }

  const rows = [];
  for (let i = 1; i < allRows.length; i++) {
    const cols = allRows[i];
    if (!cols.some(c => c.trim())) continue;
    const row = {};
    headers.forEach((h, idx) => { row[h] = (cols[idx] || '').trim(); });
    rows.push({ ...row, _line: i + 1 });
  }

  // Propagate group_context to all rows in the same group (only first row needs it in CSV)
  const groupCtxMap = {};
  for (const row of rows) {
    const gid = (row.group_id || '').trim();
    if (gid && (row.group_context || '').trim()) {
      groupCtxMap[gid] = row.group_context.trim();
    }
  }
  for (const row of rows) {
    const gid = (row.group_id || '').trim();
    if (gid && !(row.group_context || '').trim() && groupCtxMap[gid]) {
      row.group_context = groupCtxMap[gid];
    }
  }

  const parsed = rows.map(row => {
    const errors = validateRow(row, mode);
    return { ...row, _errors: errors, _valid: errors.length === 0 };
  });

  return { rows: parsed };
}

// ── Template download ──
function downloadTemplate(mode) {
  const base = 'type,group_id,group_context,question_text,option_a,option_b,option_c,option_d,correct,points';
  const header = mode === 'bank' ? base + ',difficulty' : base;
  const suffix = (d) => mode === 'bank' ? `,${d}` : '';
  const rows = [
    header,
    `mcq,,,ما عاصمة مصر؟,القاهرة,الإسكندرية,أسوان,الأقصر,A,1${suffix('easy')}`,
    `true_false,,,الشمس نجم؟,,,,,A,1${suffix('medium')}`,
    `mcq,G1,اقرأ الفقرة التالية وأجب على الأسئلة,ما اسم البطل؟,علي,أحمد,محمد,سعيد,B,2${suffix('hard')}`,
    `mcq,G1,,ما نهاية القصة؟,سعيدة,حزينة,مفتوحة,,A,1${suffix('medium')}`,
  ];
  const bom = '\uFEFF'; // BOM for correct Arabic display in Excel
  const blob = new Blob([bom + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'questions_template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ── Difficulty badge ──
const diffBadge = { easy: 'bg-green-100 text-green-700', medium: 'bg-yellow-100 text-yellow-700', hard: 'bg-red-100 text-red-700' };
const diffLabel = { easy: 'سهل', medium: 'متوسط', hard: 'صعب' };

export default function CsvImportModal({ open, onClose, mode, targetId, onSuccess }) {
  const [step, setStep] = useState('upload'); // 'upload' | 'preview'
  const [parsedRows, setParsedRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);

  const reset = () => {
    setStep('upload');
    setParsedRows([]);
    setFileName('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleClose = () => { reset(); onClose(); };

  const handleFile = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) { toast.error('يرجى رفع ملف CSV فقط'); return; }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = parseCsv(ev.target.result, mode);
      if (result.error) { toast.error(result.error); return; }
      setParsedRows(result.rows);
      setStep('preview');
    };
    reader.readAsText(file, 'UTF-8');
  }, [mode]);

  const validRows = parsedRows.filter(r => r._valid);
  const invalidRows = parsedRows.filter(r => !r._valid);

  const handleImport = async () => {
    if (validRows.length === 0) { toast.error('لا توجد أسئلة صالحة للاستيراد'); return; }
    setImporting(true);
    try {
      const endpoint = mode === 'exam'
        ? `/exams/${targetId}/questions/import`
        : `/question-banks/${targetId}/questions/import`;

      const questions = validRows.map(r => ({
        question_type: r.type.toLowerCase(),
        question_text: r.question_text,
        option_a: r.option_a || null,
        option_b: r.option_b || null,
        option_c: r.option_c || null,
        option_d: r.option_d || null,
        correct_answer_letter: (r.correct || 'A').toUpperCase(),
        points: parseInt(r.points, 10) || 1,
        difficulty: (r.difficulty || 'medium').toLowerCase(),
        group_id: r.group_id || null,
        group_context: r.group_context || null,
      }));

      await api.post(endpoint, { questions });
      toast.success(`تم استيراد ${validRows.length} سؤال بنجاح ✅`);
      onSuccess?.();
      handleClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'حدث خطأ أثناء الاستيراد');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="استيراد أسئلة من CSV" size="xl">
      {step === 'upload' ? (
        <div className="space-y-5" dir="rtl">
          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
            <p className="font-bold text-blue-800 text-sm">تعليمات الملف:</p>
            <ul className="list-disc list-inside space-y-1 text-xs text-blue-700">
              <li>الأعمدة المطلوبة: <code className="bg-blue-100 px-1 rounded font-mono">type, question_text, correct, points</code></li>
              <li><code className="bg-blue-100 px-1 rounded font-mono">type</code>: إما <strong>mcq</strong> (اختيار متعدد) أو <strong>true_false</strong> (صح/خطأ)</li>
              <li><code className="bg-blue-100 px-1 rounded font-mono">correct</code>: حرف A أو B أو C أو D</li>
              <li>الأعمدة الاختيارية: <code className="bg-blue-100 px-1 rounded font-mono">option_c, option_d, group_id, group_context</code>{mode === 'bank' && <>, <code className="bg-blue-100 px-1 rounded font-mono">difficulty</code></>}</li>
              {mode === 'bank' && <li><code className="bg-blue-100 px-1 rounded font-mono">difficulty</code>: <strong>easy</strong> أو <strong>medium</strong> أو <strong>hard</strong> (الافتراضي: medium)</li>}
              <li>لتجميع أسئلة تحت نص مشترك: استخدم <code className="bg-blue-100 px-1 rounded font-mono">group_id</code> (أي نص) و <code className="bg-blue-100 px-1 rounded font-mono">group_context</code> في أول سطر</li>
            </ul>
          </div>

          {/* Template download */}
          <button
            onClick={() => downloadTemplate(mode)}
            className="flex items-center gap-2 text-sm text-purple-700 font-bold hover:text-purple-900 transition-colors"
          >
            <Download className="w-4 h-4" />
            تحميل ملف نموذج (Template)
          </button>

          {/* Drop zone */}
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-2xl p-12 cursor-pointer hover:border-purple-400 hover:bg-purple-50 transition-all group">
            <Upload className="w-12 h-12 text-gray-300 group-hover:text-purple-400 mb-3 transition-colors" />
            <p className="font-bold text-gray-600 group-hover:text-purple-700 transition-colors">اضغط لاختيار ملف CSV</p>
            <p className="text-xs text-gray-400 mt-1">يفضل حفظ الملف بـ UTF-8 لدعم اللغة العربية</p>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
          </label>
        </div>
      ) : (
        <div className="space-y-4" dir="rtl">
          {/* Summary badges */}
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-xl px-3 py-1.5">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-sm font-bold text-green-700">{validRows.length} سؤال صالح</span>
            </div>
            {invalidRows.length > 0 && (
              <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-xl px-3 py-1.5">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <span className="text-sm font-bold text-red-700">{invalidRows.length} سطر بهم أخطاء (سيتم تجاهلهم)</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5">
              <FileText className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs text-gray-500 truncate max-w-[150px]">{fileName}</span>
            </div>
          </div>

          {/* Preview table */}
          <div className="overflow-auto max-h-[50vh] rounded-xl border border-gray-200">
            <table className="w-full text-xs min-w-[600px]">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-2 py-2 text-right font-bold text-gray-500 w-10">#</th>
                  <th className="px-2 py-2 text-right font-bold text-gray-500 w-10"></th>
                  <th className="px-2 py-2 text-right font-bold text-gray-500 w-20">النوع</th>
                  <th className="px-2 py-2 text-right font-bold text-gray-500">السؤال</th>
                  <th className="px-2 py-2 text-center font-bold text-gray-500 w-16">الإجابة</th>
                  <th className="px-2 py-2 text-center font-bold text-gray-500 w-14">النقاط</th>
                  {mode === 'bank' && <th className="px-2 py-2 text-center font-bold text-gray-500 w-16">الصعوبة</th>}
                  <th className="px-2 py-2 text-right font-bold text-gray-500 w-20">مجموعة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {parsedRows.map((row, i) => (
                  <tr key={i} className={row._valid ? 'bg-white hover:bg-gray-50' : 'bg-red-50'}>
                    <td className="px-2 py-2 text-gray-400 tabular-nums">{row._line}</td>
                    <td className="px-2 py-2">
                      {row._valid ? (
                        <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                      ) : (
                        <div className="relative group/err">
                          <AlertCircle className="w-3.5 h-3.5 text-red-500 cursor-help" />
                          <div className="absolute right-0 z-20 hidden group-hover/err:block bg-red-900 text-white text-xs rounded-lg p-2 w-52 shadow-xl whitespace-normal">
                            {row._errors.map((e, ei) => <p key={ei} className="mb-0.5">• {e}</p>)}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${
                        (row.type || '').toLowerCase() === 'mcq' ? 'bg-blue-100 text-blue-700'
                        : (row.type || '').toLowerCase() === 'true_false' ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                      }`}>
                        {(row.type || '').toLowerCase() === 'mcq' ? 'MCQ'
                          : (row.type || '').toLowerCase() === 'true_false' ? 'صح/خطأ'
                          : row.type || '—'}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-gray-800 max-w-[240px]">
                      <span className="line-clamp-2" title={row.question_text}>{row.question_text || '—'}</span>
                      {row.group_context && (
                        <span className="block text-[10px] text-blue-500 mt-0.5 truncate">📎 {row.group_context}</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-center font-bold text-gray-700">{(row.correct || '').toUpperCase() || '—'}</td>
                    <td className="px-2 py-2 text-center text-gray-600">{row.points || '—'}</td>
                    {mode === 'bank' && (
                      <td className="px-2 py-2 text-center">
                        {row.difficulty ? (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${diffBadge[(row.difficulty || 'medium').toLowerCase()] || diffBadge.medium}`}>
                            {diffLabel[(row.difficulty || 'medium').toLowerCase()] || row.difficulty}
                          </span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                    )}
                    <td className="px-2 py-2 text-gray-400 font-mono text-[10px]">{row.group_id || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <button onClick={reset} className="btn-secondary text-sm">اختر ملفاً آخر</button>
            <button
              onClick={handleImport}
              disabled={validRows.length === 0 || importing}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {importing ? 'جاري الاستيراد...' : `استيراد ${validRows.length} سؤال ✅`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
