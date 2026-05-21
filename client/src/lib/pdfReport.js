/**
 * generatePDFReport — Rich HTML print window (RTL/Arabic-safe, Cairo font).
 * Signature: generatePDFReport(title, headers, data, filename?, opts?)
 * opts: { subtitle, stats: [{label, value, color?}], note }
 */
export const generatePDFReport = (title, headers, data, filename = 'report.pdf', opts = {}) => {
  const now = new Date().toLocaleDateString('ar-EG', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  /* ── smart cell renderer ─────────────────────────────────────────── */
  const renderCell = (raw) => {
    const cell = String(raw ?? '—');

    const STATUS = [
      [/(ناجح|نجاح|مؤكدة|مؤكد|مفعّل|نشط|مقبول|مكتمل|منشور|مفتوح)/,  '#16a34a', '#f0fdf4', '#bbf7d0'],
      [/(راسب|رسوب|مرفوضة|مرفوض|محذوف|غير نشط)/,                      '#dc2626', '#fef2f2', '#fecaca'],
      [/(قيد الانتظار|في الانتظار|انتظار|معلّق|معلق)/,                 '#d97706', '#fffbeb', '#fde68a'],
      [/(مسودة|غير منشور|مغلق|منتهي)/,                                  '#64748b', '#f8fafc', '#e2e8f0'],
    ];
    for (const [rx, color, bg, border] of STATUS) {
      if (rx.test(cell)) {
        return `<span style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;background:${bg};color:${color};border:1px solid ${border}">${cell}</span>`;
      }
    }

    if (/^\d+(\.\d+)?%$/.test(cell.trim())) {
      const pct = parseFloat(cell);
      const color = pct >= 75 ? '#16a34a' : pct >= 50 ? '#f59e0b' : '#ef4444';
      return `<div style="display:flex;align-items:center;gap:6px;justify-content:center">
        <div style="width:64px;height:6px;background:#e5e7eb;border-radius:4px;overflow:hidden;flex-shrink:0">
          <div style="width:${pct}%;height:6px;background:${color};border-radius:4px"></div>
        </div>
        <span style="font-weight:700;color:${color};font-size:12px">${cell}</span>
      </div>`;
    }

    if (/[\d,\.]+\s*ج/.test(cell)) {
      return `<span style="font-weight:700;color:#1e3a5f;font-family:monospace">${cell}</span>`;
    }

    if (/⭐/.test(cell)) {
      return `<span style="color:#d97706;font-weight:700">${cell}</span>`;
    }

    if (cell === '—' || cell === '' || cell === 'null' || cell === 'undefined') {
      return `<span style="color:#cbd5e1">—</span>`;
    }

    return cell;
  };

  /* ── summary stats bar ───────────────────────────────────────────── */
  const statsHtml = opts.stats?.length
    ? `<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px">
        ${opts.stats.map(s => `
          <div style="flex:1;min-width:100px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px;text-align:center">
            <div style="font-size:20px;font-weight:900;color:${s.color || '#1e3a5f'}">${s.value}</div>
            <div style="font-size:10px;color:#64748b;font-weight:700;margin-top:2px">${s.label}</div>
          </div>`).join('')}
      </div>`
    : '';

  const rowCountLabel = data.length > 0
    ? `<span style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:20px;padding:3px 12px;font-size:12px;font-weight:700;color:#64748b">${data.length} سجل</span>`
    : '';

  const tableRows = data.map((row, ri) => `
    <tr style="background:${ri % 2 === 0 ? '#fff' : '#f8fafc'}">
      <td style="color:#94a3b8;font-size:11px;font-weight:700;padding:9px 10px;border-bottom:1px solid #f1f5f9;text-align:center">${ri + 1}</td>
      ${row.map(cell => `<td style="padding:9px 12px;border-bottom:1px solid #f1f5f9;text-align:center;font-size:12px;vertical-align:middle">${renderCell(cell)}</td>`).join('')}
    </tr>`).join('');

  /* ── full HTML document ──────────────────────────────────────────── */
  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: 'Cairo', Arial, Tahoma, sans-serif;
    direction: rtl;
    color: #1e293b;
    background: #fff;
    font-size: 13px;
  }
  .page { max-width: 1000px; margin: 0 auto; padding: 28px 24px; }

  .report-header {
    display: flex;
    align-items: center;
    gap: 16px;
    border-bottom: 3px solid #1e3a5f;
    padding-bottom: 16px;
    margin-bottom: 22px;
  }
  .logo-box {
    width: 50px; height: 50px;
    background: linear-gradient(135deg, #1e3a5f, #2d5080);
    border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .logo-text { color: #f97316; font-size: 22px; font-weight: 900; font-family: 'Cairo', sans-serif; }
  .report-title { font-size: 20px; font-weight: 900; color: #1e3a5f; font-family: 'Cairo', sans-serif; }
  .report-sub   { font-size: 12px; color: #64748b; margin-top: 3px; }
  .report-meta  { margin-right: auto; text-align: left; }
  .report-meta .platform { font-size: 14px; font-weight: 900; color: #f97316; font-family: 'Cairo', sans-serif; }
  .report-meta .date     { font-size: 11px; color: #94a3b8; margin-top: 2px; }

  .section-bar {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 12px;
  }
  .section-title {
    font-size: 13px; font-weight: 900; color: #1e3a5f;
    border-right: 4px solid #f97316; padding-right: 10px;
    font-family: 'Cairo', sans-serif;
  }

  table { width: 100%; border-collapse: collapse; border-radius: 12px; overflow: hidden; }
  thead tr { background: linear-gradient(135deg, #1e3a5f, #2d5080); }
  thead th {
    color: #fff;
    padding: 11px 12px;
    font-size: 12px;
    font-weight: 700;
    text-align: center;
    letter-spacing: 0.3px;
    font-family: 'Cairo', sans-serif;
  }
  thead th:first-child { color: rgba(255,255,255,0.6); font-size: 10px; }

  .note {
    margin-top: 14px;
    background: #fffbeb; border: 1px solid #fde68a;
    border-radius: 8px; padding: 10px 14px;
    font-size: 12px; color: #92400e; font-weight: 600;
  }

  .report-footer {
    margin-top: 28px; padding-top: 14px;
    border-top: 1px solid #e2e8f0;
    text-align: center; color: #94a3b8; font-size: 11px;
  }

  .no-print { text-align: center; padding: 24px 0 8px; }
  .btn-print {
    padding: 11px 32px; background: #f97316; color: #fff;
    border: none; border-radius: 8px; cursor: pointer;
    font-size: 14px; font-weight: 700; margin-left: 10px;
    font-family: 'Cairo', sans-serif;
  }
  .btn-close {
    padding: 11px 32px; background: #64748b; color: #fff;
    border: none; border-radius: 8px; cursor: pointer;
    font-size: 14px; font-weight: 700;
    font-family: 'Cairo', sans-serif;
  }

  @media print {
    .no-print { display: none; }
    body { background: #fff; }
    .page { padding: 12px; }
  }
</style>
</head>
<body>
<div class="page">

  <div class="report-header">
    <div class="logo-box"><span class="logo-text">و</span></div>
    <div>
      <div class="report-title">${title}</div>
      <div class="report-sub">${opts.subtitle || 'تقرير شامل — منصة وثبة التعليمية'}</div>
    </div>
    <div class="report-meta">
      <div class="platform">منصة وثبة</div>
      <div class="date">${now}</div>
    </div>
  </div>

  ${statsHtml}

  <div class="section-bar">
    <div class="section-title">بيانات التقرير</div>
    ${rowCountLabel}
  </div>

  ${data.length === 0
    ? `<div style="text-align:center;padding:40px;color:#94a3b8;font-size:14px;border:2px dashed #e2e8f0;border-radius:12px">
         لا توجد بيانات لعرضها
       </div>`
    : `<table>
        <thead>
          <tr>
            <th>#</th>
            ${headers.map(h => `<th>${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
       </table>`
  }

  ${opts.note ? `<div class="note">💡 ${opts.note}</div>` : ''}

  <div class="report-footer">
    تقرير صادر آلياً من منصة وثبة التعليمية — ${now}
  </div>

  <div class="no-print">
    <button class="btn-print" onclick="window.print()">🖨️ طباعة / حفظ PDF</button>
    <button class="btn-close" onclick="window.close()">إغلاق</button>
  </div>

</div>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) {
    alert('يرجى السماح بالنوافذ المنبثقة لاستخدام ميزة الطباعة');
    return;
  }
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.focus(), 200);
};
