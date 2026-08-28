/**
 * generateExcelReport — Professional Excel (.xlsx) export utility for Wathba LMS.
 * Features:
 * - RTL (Right-to-Left) sheet view for Arabic
 * - Multi-sheet workbook support via opts.sections
 * - Title, Subtitle, and Stats Summary metadata header blocks
 * - Auto column widths calculation based on content
 * - HTML tag stripping and cell value sanitization
 * - Dynamic import of 'xlsx' to keep bundle size lightweight
 *
 * Signature:
 *   generateExcelReport(title, headers, data, filename?, opts?)
 *
 * opts:
 *   - subtitle?: string
 *   - sheetName?: string (default: 'التقرير')
 *   - stats?: Array<{ label: string, value: string | number }>
 *   - note?: string
 *   - sections?: Array<{ title?: string, sheetName?: string, headers: string[], data: any[], stats?: any[], note?: string }>
 */

const stripHtml = (val) => {
  if (val === null || val === undefined) return '';
  const str = String(val);
  return str.replace(/<[^>]+>/g, '').trim();
};

const sanitizeValue = (val) => {
  if (val === null || val === undefined || val === '—' || val === 'null' || val === 'undefined') {
    return '';
  }
  const clean = stripHtml(val);
  // If it's a pure numeric string (and not a phone or ID with leading zeroes), convert to Number
  if (/^-?\d+(\.\d+)?$/.test(clean) && !clean.startsWith('0') && clean.length < 15) {
    const num = Number(clean);
    if (!isNaN(num)) return num;
  }
  return clean;
};

const buildSheetData = (title, headers, data, opts = {}) => {
  const rows = [];
  const now = new Date().toLocaleDateString('ar-EG', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  // 1. Report Title & Platform
  if (title) {
    rows.push([stripHtml(title), '', '', `منصة وثبة التعليمية — ${now}`]);
  }

  // 2. Subtitle
  if (opts.subtitle) {
    rows.push([stripHtml(opts.subtitle)]);
  }

  // 3. Stats summary line
  if (opts.stats && opts.stats.length > 0) {
    const statsSummary = opts.stats
      .map(s => `${stripHtml(s.label)}: ${stripHtml(s.value)}`)
      .join('  |  ');
    rows.push([`الإحصائيات: ${statsSummary}`]);
  }

  // Add blank row separator before data table if metadata exists
  if (title || opts.subtitle || (opts.stats && opts.stats.length > 0)) {
    rows.push([]);
  }

  // 4. Headers row
  const tableHeaders = ['#', ...headers.map(h => stripHtml(h))];
  rows.push(tableHeaders);

  // 5. Data rows
  data.forEach((rowItem, idx) => {
    const isObj = rowItem && typeof rowItem === 'object' && !Array.isArray(rowItem) && 'cells' in rowItem;
    const rawCells = isObj ? rowItem.cells : rowItem;
    const isFirstOfGroup = isObj ? (rowItem.isFirstOfGroup !== false) : true;
    const numCell = isObj
      ? (isFirstOfGroup ? (rowItem.groupIndex !== undefined ? rowItem.groupIndex + 1 : idx + 1) : '')
      : idx + 1;

    const cleanedCells = (rawCells || []).map(c => sanitizeValue(c));
    rows.push([numCell, ...cleanedCells]);
  });

  // 6. Note row at bottom
  if (opts.note) {
    rows.push([]);
    rows.push([`ملاحظة: ${stripHtml(opts.note)}`]);
  }

  return { rows, headers: tableHeaders };
};

const calculateColWidths = (headers, dataRows) => {
  const numCols = headers.length;
  const colWidths = [];

  for (let colIdx = 0; colIdx < numCols; colIdx++) {
    let maxLen = (headers[colIdx] || '').toString().length;

    // Check data rows (skip metadata rows before table header)
    const headerRowIndex = dataRows.findIndex(r => r.length === numCols && r[0] === headers[0]);
    const startIndex = headerRowIndex !== -1 ? headerRowIndex + 1 : 0;

    for (let r = startIndex; r < dataRows.length; r++) {
      const cellVal = dataRows[r] && dataRows[r][colIdx] !== undefined ? String(dataRows[r][colIdx]) : '';
      if (cellVal.length > maxLen) {
        maxLen = Math.min(cellVal.length, 60);
      }
    }

    // Give some padding and minimum column width
    const minWidth = colIdx === 0 ? 6 : 14;
    colWidths.push({ wch: Math.max(maxLen + 4, minWidth) });
  }

  return colWidths;
};

export const generateExcelReport = async (
  title,
  headers = [],
  data = [],
  filename = 'report.xlsx',
  opts = {}
) => {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  // Multi-section / Multi-sheet support
  if (opts.sections && opts.sections.length > 0) {
    opts.sections.forEach((sec, idx) => {
      const secTitle = sec.title || title;
      const secHeaders = sec.headers || headers;
      const secData = sec.data || [];
      const secOpts = {
        subtitle: sec.subtitle || (idx === 0 ? opts.subtitle : undefined),
        stats: sec.stats || (idx === 0 ? opts.stats : undefined),
        note: sec.note,
      };

      const { rows, headers: sheetHeaders } = buildSheetData(secTitle, secHeaders, secData, secOpts);
      const ws = XLSX.utils.aoa_to_sheet(rows);

      // RTL configuration
      ws['!views'] = [{ rightToLeft: true }];
      ws['!cols'] = calculateColWidths(sheetHeaders, rows);

      const rawSheetName = sec.sheetName || sec.title || `ورقة ${idx + 1}`;
      // Excel sheet names cannot exceed 31 chars and cannot contain certain special chars
      const safeSheetName = rawSheetName
        .replace(/[\\/*?:[\]]/g, '')
        .slice(0, 30)
        .trim() || `ورقة ${idx + 1}`;

      XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
    });
  } else {
    // Single sheet
    const { rows, headers: sheetHeaders } = buildSheetData(title, headers, data, opts);
    const ws = XLSX.utils.aoa_to_sheet(rows);

    // RTL configuration
    ws['!views'] = [{ rightToLeft: true }];
    ws['!cols'] = calculateColWidths(sheetHeaders, rows);

    const sheetName = (opts.sheetName || title || 'التقرير')
      .replace(/[\\/*?:[\]]/g, '')
      .slice(0, 30)
      .trim() || 'التقرير';

    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  // Ensure .xlsx extension
  const safeFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, safeFilename);
};

export default generateExcelReport;
