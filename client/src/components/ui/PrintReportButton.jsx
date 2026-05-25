import React from 'react';
import { Printer } from 'lucide-react';

const escapeHtml = (str) => {
  return String(str ?? '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const PrintReportButton = ({
  data,
  columns,
  title,
  fileName = 'report.pdf',
  className = ''
}) => {
  const handlePrintPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('يرجى السماح بالنوافذ المنبثقة لاستخدام ميزة الطباعة');
      return;
    }

    const tableData = data.map(row =>
      columns.map(col => {
        let value = col.accessor ? row[col.accessor] : col.render ? col.render(row) : '';
        if (col.accessor === 'created_at' || col.accessor === 'updated_at' || col.accessor?.includes('date')) {
          try { value = new Date(value).toLocaleDateString('ar-EG'); } catch (e) {}
        }
        if (typeof value === 'number' && !Number.isInteger(value)) value = value.toFixed(2);
        return value ?? '—';
      })
    );

    const headers = columns.map(col => col.header);
    const now = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });

    const htmlContent = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Cairo', Arial, Tahoma, sans-serif;
      padding: 24px;
      direction: rtl;
      color: #1e293b;
      background: #fff;
    }
    .report-header {
      display: flex; align-items: center; gap: 16px;
      border-bottom: 3px solid #1e3a5f;
      padding-bottom: 16px; margin-bottom: 22px;
    }
    .logo-box {
      width: 46px; height: 46px;
      background: linear-gradient(135deg, #1e3a5f, #2d5080);
      border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .logo-text { color: #f97316; font-size: 20px; font-weight: 900; }
    .report-title { font-size: 20px; font-weight: 900; color: #1e3a5f; }
    .report-meta { margin-right: auto; text-align: left; }
    .report-meta .platform { font-size: 14px; font-weight: 900; color: #f97316; }
    .report-meta .date { font-size: 11px; color: #94a3b8; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; border-radius: 12px; overflow: hidden; }
    thead tr { background: linear-gradient(135deg, #1e3a5f, #2d5080); }
    th {
      color: #fff; padding: 11px 12px;
      font-size: 12px; font-weight: 700; text-align: center;
      font-family: 'Cairo', sans-serif;
    }
    td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; font-size: 12px; }
    tr:nth-child(even) td { background: #f8fafc; }
    .report-footer {
      margin-top: 24px; padding-top: 12px;
      border-top: 1px solid #e2e8f0;
      text-align: center; color: #94a3b8; font-size: 11px;
    }
    .no-print { text-align: center; padding: 20px 0 8px; }
    .btn-print {
      padding: 10px 28px; background: #f97316; color: #fff;
      border: none; border-radius: 8px; cursor: pointer;
      font-size: 14px; font-weight: 700; margin-left: 10px;
      font-family: 'Cairo', sans-serif;
    }
    .btn-close {
      padding: 10px 28px; background: #64748b; color: #fff;
      border: none; border-radius: 8px; cursor: pointer;
      font-size: 14px; font-weight: 700;
      font-family: 'Cairo', sans-serif;
    }
    @media print {
      .no-print { display: none; }
      body { padding: 12px; }
    }
  </style>
</head>
<body>
  <div class="report-header">
    <div class="logo-box"><span class="logo-text">و</span></div>
    <div>
      <div class="report-title">${title}</div>
      <div style="font-size:12px;color:#64748b;margin-top:3px">تقرير شامل — منصة وثبة التعليمية</div>
    </div>
    <div class="report-meta">
      <div class="platform">منصة وثبة</div>
      <div class="date">${now}</div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        ${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${tableData.map((row, i) => `
        <tr>
          <td style="color:#94a3b8;font-size:11px;font-weight:700">${i + 1}</td>
          ${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}
        </tr>`).join('')}
    </tbody>
  </table>
  <div class="report-footer">تقرير صادر آلياً من منصة وثبة التعليمية — ${now}</div>
  <div class="no-print">
    <button class="btn-print" onclick="window.print()">🖨️ طباعة / حفظ PDF</button>
    <button class="btn-close" onclick="window.close()">إغلاق</button>
  </div>
</body>
</html>`;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    setTimeout(() => printWindow.focus(), 200);
  };

  return (
    <button
      onClick={handlePrintPDF}
      className={`flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors ${className}`}
    >
      <Printer className="w-4 h-4" />
      طباعة التقرير
    </button>
  );
};

export default PrintReportButton;
