import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  BarChart2, BookOpen, FileText, Award, Star, CreditCard,
  CheckCircle, XCircle, Clock, Play, TrendingUp, Trophy,
  Calendar, Video, Target, Wallet, AlertCircle, ChevronDown, ChevronUp, Eye, Printer
} from 'lucide-react';
import api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

function printStatsPDF({ student, summary, examResults, courses, badges, payments }) {
  const escapeHtml = (str) => String(str ?? '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
  const fmtN = (n) => new Intl.NumberFormat('ar-EG').format(n ?? 0);
  const fmtD = (d) => d ? new Date(d).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
  const fmtM = (m) => m >= 60 ? `${Math.floor(m / 60)}س ${m % 60}د` : `${m ?? 0} دقيقة`;
  const passRate = summary.totalExams > 0 ? Math.round((summary.passCount / summary.totalExams) * 100) : 0;
  const now = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });

  const ring = (pct, color, label, sub) => {
    const r = 42, cx = 52, cy = 52, stroke = 8;
    const circ = 2 * Math.PI * r;
    const dash = Math.min(pct / 100, 1) * circ;
    return `
      <div class="ring-box">
        <svg width="104" height="104" style="transform:rotate(-90deg)">
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="${stroke}"/>
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}"
            stroke-width="${stroke}" stroke-dasharray="${dash} ${circ}" stroke-linecap="round"/>
        </svg>
        <div class="ring-label">
          <span class="ring-val" style="color:${color}">${label}</span>
          <span class="ring-sub">${sub}</span>
        </div>
      </div>`;
  };

  const bar = (pct, color) =>
    `<div style="background:#e5e7eb;border-radius:4px;height:6px;width:100%;overflow:hidden">
       <div style="width:${pct}%;height:6px;background:${color};border-radius:4px"></div>
     </div>`;

  const examRows = examResults.map((r, i) => {
    const passed = r.score >= r.pass_score;
    const pct = Math.round((r.score / r.total_score) * 100);
    return `
      <tr>
        <td>${i + 1}</td>
        <td style="text-align:right">${escapeHtml(r.exam_title)}</td>
        <td>${escapeHtml(r.course_name || '—')}</td>
        <td><b style="color:${passed ? '#16a34a' : '#dc2626'}">${r.score}/${r.total_score}</b></td>
        <td>${pct}%</td>
        <td style="color:${passed ? '#16a34a' : '#dc2626'};font-weight:700">${passed ? '✓ ناجح' : '✗ راسب'}</td>
        <td>${r.correct_count}</td>
        <td>${r.wrong_count}</td>
        <td>${r.points_earned > 0 ? '+' + r.points_earned + ' ⭐' : '—'}</td>
        <td>${fmtD(r.created_at)}</td>
      </tr>`;
  }).join('');

  const courseRows = courses.map((c, i) => {
    const prog = c.total_videos > 0 ? Math.round((c.watched_videos / c.total_videos) * 100) : 0;
    return `
      <tr>
        <td>${i + 1}</td>
        <td style="text-align:right">${escapeHtml(c.name)}</td>
        <td>${c.watched_videos}/${c.total_videos}</td>
        <td>${fmtM(c.total_watched_minutes)}</td>
        <td>${c.total_pdfs}</td>
        <td>
          ${bar(prog, '#6366f1')}
          <span style="font-size:11px;color:#6366f1;font-weight:700">${prog}%</span>
        </td>
      </tr>`;
  }).join('');

  const badgesHtml = badges.length > 0
    ? badges.map(b => `<span class="badge-chip" style="background:${b.badge_color||'#f97316'};color:#fff">🏅 ${escapeHtml(b.badge_name)} — ${escapeHtml(b.exam_title)}</span>`).join('')
    : '<p style="color:#9ca3af;font-size:13px">لا توجد شارات</p>';

  const payRows = payments.map((p, i) => {
    const methodLabel = { instapay: 'إنستاباي', vodafone_cash: 'فودافون كاش', cash: 'كاش', bank_transfer: 'تحويل بنكي' };
    const statusLabel = { completed: 'مدفوع', verified: 'موثّق', pending: 'في الانتظار', rejected: 'مرفوض' };
    return `<tr>
      <td>${i + 1}</td>
      <td style="text-align:right">${escapeHtml(p.course_name || '—')}</td>
      <td>${fmtN(p.amount)} ج.م</td>
      <td>${methodLabel[p.method] || p.method || '—'}</td>
      <td>${statusLabel[p.status] || p.status}</td>
      <td>${fmtD(p.payment_date)}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>تقرير إحصائيات — ${escapeHtml(student?.name)}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, Tahoma, sans-serif; direction:rtl; color:#1e293b; background:#fff; font-size:13px; }
  .page { max-width:960px; margin:0 auto; padding:28px 24px; }

  .header { display:flex; align-items:center; gap:16px; border-bottom:3px solid #1e3a5f; padding-bottom:16px; margin-bottom:20px; }
  .avatar { width:56px;height:56px;border-radius:14px;background:#f97316;display:flex;align-items:center;justify-content:center;color:#fff;font-size:26px;font-weight:900;flex-shrink:0; }
  .header-info h1 { font-size:20px;font-weight:900;color:#1e3a5f; }
  .header-info p { font-size:12px;color:#64748b;margin-top:3px; }
  .report-date { margin-right:auto; font-size:11px; color:#94a3b8; text-align:left; }

  .section { margin-bottom:24px; }
  .section-title { font-size:14px;font-weight:900;color:#1e3a5f;border-right:4px solid #f97316;padding-right:10px;margin-bottom:12px; }

  .stats-grid { display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px; }
  .stat-card { background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px;text-align:center; }
  .stat-val { font-size:22px;font-weight:900;color:#1e3a5f; }
  .stat-label { font-size:10px;color:#64748b;font-weight:700;margin-top:2px; }

  .rings { display:flex;gap:20px;justify-content:center;margin-bottom:20px; }
  .ring-box { position:relative;display:flex;flex-direction:column;align-items:center;gap:4px; }
  .ring-label { position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;display:flex;flex-direction:column;align-items:center; }
  .ring-val { font-size:16px;font-weight:900; }
  .ring-sub { font-size:9px;color:#64748b;font-weight:600;margin-top:1px; }
  .ring-caption { font-size:10px;color:#64748b;font-weight:700;margin-top:4px; }

  table { width:100%;border-collapse:collapse;font-size:12px; }
  th { background:#1e3a5f;color:#fff;padding:8px 10px;text-align:center;font-weight:700;font-size:11px; }
  td { padding:7px 10px;border-bottom:1px solid #e2e8f0;text-align:center;vertical-align:middle; }
  tr:nth-child(even) td { background:#f8fafc; }

  .badge-chip { display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;margin:4px; }

  .summary-bar { display:flex;gap:16px;background:#f1f5f9;border-radius:10px;padding:12px 16px;margin-bottom:16px; }
  .sum-item { display:flex;flex-direction:column;align-items:center;flex:1; }
  .sum-val { font-size:18px;font-weight:900;color:#1e3a5f; }
  .sum-label { font-size:10px;color:#64748b;font-weight:600; }

  .no-print { text-align:center;padding:20px; }
  .print-btn { padding:10px 28px;background:#f97316;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:15px;font-weight:700;margin-left:10px; }
  .close-btn  { padding:10px 28px;background:#64748b;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:15px;font-weight:700; }
  @media print {
    .no-print { display:none; }
    body { padding:0; }
    .page { padding:16px; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div class="avatar">${escapeHtml(student?.name)?.charAt(0) || 'ط'}</div>
    <div class="header-info">
      <h1>${escapeHtml(student?.name || '')}</h1>
      <p>${escapeHtml(student?.academic_stage || '')} &nbsp;·&nbsp; منضم منذ ${fmtD(student?.created_at)}</p>
    </div>
    <div class="report-date">
      <div style="font-size:14px;font-weight:900;color:#f97316">منصة وثبة</div>
      <div>تقرير إحصائيات شامل</div>
      <div>${now}</div>
    </div>
  </div>

  <!-- Summary Bar -->
  <div class="summary-bar">
    <div class="sum-item"><span class="sum-val">⭐ ${fmtN(student?.points)}</span><span class="sum-label">نقاط</span></div>
    <div class="sum-item"><span class="sum-val">${summary.totalCourses ?? 0}</span><span class="sum-label">كورسات</span></div>
    <div class="sum-item"><span class="sum-val">${summary.totalExams ?? 0}</span><span class="sum-label">امتحانات</span></div>
    <div class="sum-item"><span class="sum-val">${summary.passCount ?? 0}</span><span class="sum-label">ناجح</span></div>
    <div class="sum-item"><span class="sum-val">${summary.failCount ?? 0}</span><span class="sum-label">راسب</span></div>
    <div class="sum-item"><span class="sum-val">${summary.avgScore ?? 0}%</span><span class="sum-label">متوسط</span></div>
    <div class="sum-item"><span class="sum-val">#${summary.rank ?? '—'}</span><span class="sum-label">الترتيب</span></div>
    <div class="sum-item"><span class="sum-val">${fmtM(summary.totalWatchedMinutes)}</span><span class="sum-label">مشاهدة</span></div>
  </div>

  <!-- Performance Rings -->
  <div class="section">
    <div class="section-title">مؤشرات الأداء</div>
    <div class="rings">
      <div style="text-align:center">
        ${ring(passRate, passRate >= 50 ? '#22c55e' : '#ef4444', passRate + '%', 'نجاح')}
        <div class="ring-caption">نسبة النجاح</div>
      </div>
      <div style="text-align:center">
        ${ring(summary.avgScore ?? 0, '#6366f1', (summary.avgScore ?? 0) + '%', 'أداء')}
        <div class="ring-caption">متوسط الأداء</div>
      </div>
      <div style="text-align:center">
        ${ring(
          summary.totalStudents ? Math.round(((summary.totalStudents - (summary.rank ?? summary.totalStudents) + 1) / summary.totalStudents) * 100) : 0,
          '#f59e0b', '#' + (summary.rank ?? '—'), 'ترتيب'
        )}
        <div class="ring-caption">ترتيبي من ${summary.totalStudents ?? 0}</div>
      </div>
      <div style="text-align:center">
        ${ring(
          summary.totalBadges > 0 ? 100 : 0,
          '#f97316', summary.totalBadges ?? 0, 'شارة'
        )}
        <div class="ring-caption">الشارات</div>
      </div>
    </div>
  </div>

  <!-- Exam Results -->
  <div class="section">
    <div class="section-title">نتائج الامتحانات (${examResults.length})</div>
    ${examResults.length === 0 ? '<p style="color:#9ca3af;font-size:13px">لم تؤدِ أي امتحانات بعد</p>' : `
    <table>
      <thead>
        <tr>
          <th>#</th><th>الامتحان</th><th>الكورس</th><th>الدرجة</th><th>%</th>
          <th>النتيجة</th><th>صواب</th><th>خطأ</th><th>النقاط</th><th>التاريخ</th>
        </tr>
      </thead>
      <tbody>${examRows}</tbody>
    </table>`}
  </div>

  <!-- Courses Progress -->
  <div class="section">
    <div class="section-title">الكورسات والتقدم (${courses.length})</div>
    ${courses.length === 0 ? '<p style="color:#9ca3af;font-size:13px">لم تنضم لأي كورس بعد</p>' : `
    <table>
      <thead>
        <tr><th>#</th><th>الكورس</th><th>الفيديوهات</th><th>وقت المشاهدة</th><th>PDF</th><th>الإنجاز</th></tr>
      </thead>
      <tbody>${courseRows}</tbody>
    </table>`}
  </div>

  <!-- Badges -->
  <div class="section">
    <div class="section-title">الشارات المكتسبة (${badges.length})</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;padding:4px 0">${badgesHtml}</div>
  </div>

  <!-- Payments -->
  ${payments.length > 0 ? `
  <div class="section">
    <div class="section-title">سجل المدفوعات (${payments.length})</div>
    <table>
      <thead>
        <tr><th>#</th><th>الكورس</th><th>المبلغ</th><th>الطريقة</th><th>الحالة</th><th>التاريخ</th></tr>
      </thead>
      <tbody>${payRows}</tbody>
    </table>
    <div style="margin-top:10px;display:flex;gap:16px">
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 16px;text-align:center">
        <div style="font-size:18px;font-weight:900;color:#16a34a">${fmtN(summary.totalPaid)} ج.م</div>
        <div style="font-size:10px;color:#16a34a;font-weight:700">إجمالي المدفوع</div>
      </div>
      <div style="background:#fefce8;border:1px solid #fef08a;border-radius:8px;padding:10px 16px;text-align:center">
        <div style="font-size:18px;font-weight:900;color:#ca8a04">${fmtN(summary.totalPending)} ج.م</div>
        <div style="font-size:10px;color:#ca8a04;font-weight:700">في الانتظار</div>
      </div>
    </div>
  </div>` : ''}

  <!-- Footer -->
  <div style="text-align:center;margin-top:28px;padding-top:16px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11px">
    تقرير صادر من منصة وثبة التعليمية — ${now}
  </div>

  <div class="no-print" style="margin-top:24px">
    <button class="print-btn" onclick="window.print()">🖨️ طباعة / حفظ PDF</button>
    <button class="close-btn" onclick="window.close()">إغلاق</button>
  </div>
</div>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) { alert('يرجى السماح بالنوافذ المنبثقة لاستخدام ميزة الطباعة'); return; }
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.focus(), 300);
}

const fmt = (n) => new Intl.NumberFormat('ar-EG').format(n);
const fmtDate = (d) => new Date(d).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
const fmtMins = (m) => m >= 60 ? `${Math.floor(m / 60)}س ${m % 60}د` : `${m} دقيقة`;

const methodLabel = { instapay: 'إنستاباي', vodafone_cash: 'فودافون كاش', cash: 'كاش', bank: 'تحويل بنكي', bank_transfer: 'تحويل بنكي' };
const statusConfig = {
  completed: { label: 'مدفوع',    cls: 'bg-green-100 text-green-800' },
  verified:  { label: 'موثّق',    cls: 'bg-blue-100 text-blue-800' },
  pending:   { label: 'في الانتظار', cls: 'bg-yellow-100 text-yellow-800' },
  rejected:  { label: 'مرفوض',   cls: 'bg-red-100 text-red-800' },
};

function SummaryCard({ icon: Icon, label, value, sub, iconBg, iconColor, accent }) {
  return (
    <div className={`card !p-3 sm:!p-4 border-r-4 ${accent}`}>
      <div className="flex items-center gap-2 sm:gap-3">
        <div className={`w-9 h-9 sm:w-11 sm:h-11 ${iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
          <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-lg sm:text-2xl font-black text-navy-700 leading-tight truncate">{value}</p>
          <p className="text-[11px] sm:text-xs text-gray-600 font-semibold mt-0.5 leading-tight">{label}</p>
          {sub && <p className="text-[10px] sm:text-xs text-gray-400 font-medium mt-0.5 leading-tight">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card !p-0 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <h2 className="text-base font-black text-navy-700 flex items-center gap-2">
          <Icon className="w-5 h-5 text-orange-500" />
          {title}
        </h2>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

function ScoreBar({ score, total, passScore }) {
  const pct = Math.round((score / total) * 100);
  const passed = score >= passScore;
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-2 rounded-full transition-all ${passed ? 'bg-green-500' : 'bg-red-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-black w-8 text-right ${passed ? 'text-green-700' : 'text-red-600'}`}>{pct}%</span>
    </div>
  );
}

function ProgressRing({ value, max, size = 80, stroke = 8, color = '#f97316' }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(value / max, 1);
  const dash = pct * circ;
  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color}
        strokeWidth={stroke} strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
    </svg>
  );
}

const EXAMS_PAGE = 3;

export default function StudentMyStats() {
  const { user }  = useAuth();
  const navigate  = useNavigate();
  const [showAllExams, setShowAllExams] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['student-my-stats'],
    queryFn: () => api.get('/students/me/stats').then(r => r.data),
  });

  if (isLoading) {
    return (
      <div className="h-full overflow-y-auto p-4 lg:p-6 space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="card h-24 animate-pulse bg-gray-100" />
        ))}
      </div>
    );
  }

  const { student, courses = [], examResults = [], payments = [], badges = [], videoProgress = [], summary = {} } = data || {};

  const passRate = summary.totalExams > 0 ? Math.round((summary.passCount / summary.totalExams) * 100) : 0;

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-6">
      <div className="space-y-5 max-w-4xl mx-auto">

        {/* ── Hero ── */}
        <div className="card bg-gradient-to-l from-navy-700 to-navy-500 text-white !p-4 sm:!p-6">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-orange-500 rounded-2xl flex items-center justify-center text-xl sm:text-2xl font-black shadow-lg flex-shrink-0">
              {user?.name?.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h1 className="text-base sm:text-xl font-black text-white leading-tight truncate">{student?.name}</h1>
                  <p className="text-white/80 text-xs sm:text-sm font-medium mt-0.5">{student?.academic_stage}</p>
                </div>
                <button
                  onClick={() => printStatsPDF({ student, summary, examResults, courses, badges, payments })}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-xs sm:text-sm font-bold transition-colors shadow-md flex-shrink-0"
                  title="طباعة تقرير PDF"
                >
                  <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden xs:inline sm:inline">PDF</span>
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-2 sm:mt-3">
                <span className="flex items-center gap-1 bg-white/15 rounded-full px-2.5 py-0.5 text-xs sm:text-sm font-bold text-yellow-300">
                  <Star className="w-3.5 h-3.5 fill-yellow-300" /> {fmt(student?.points || 0)} نقطة
                </span>
                {summary.rank && (
                  <span className="flex items-center gap-1 bg-white/15 rounded-full px-2.5 py-0.5 text-xs sm:text-sm font-bold text-white">
                    <Trophy className="w-3.5 h-3.5 text-yellow-300" /> #{summary.rank} من {summary.totalStudents}
                  </span>
                )}
                <span className="flex items-center gap-1 bg-white/15 rounded-full px-2.5 py-0.5 text-xs font-bold text-white/70">
                  <Calendar className="w-3.5 h-3.5" /> {fmtDate(student?.created_at)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Summary Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <SummaryCard icon={BookOpen}    label="الكورسات"         value={summary.totalCourses || 0}  iconBg="bg-blue-100"   iconColor="text-blue-700"   accent="border-blue-500" />
          <SummaryCard icon={FileText}    label="الامتحانات"        value={summary.totalExams || 0}    iconBg="bg-purple-100" iconColor="text-purple-700" accent="border-purple-500" />
          <SummaryCard icon={CheckCircle} label="ناجح"             value={summary.passCount || 0}     sub={`من ${summary.totalExams || 0} امتحان`} iconBg="bg-green-100" iconColor="text-green-700" accent="border-green-500" />
          <SummaryCard icon={Award}       label="الشارات"           value={summary.totalBadges || 0}   iconBg="bg-orange-100" iconColor="text-orange-700" accent="border-orange-500" />
          <SummaryCard icon={Video}       label="دقائق مشاهدة"     value={fmtMins(summary.totalWatchedMinutes || 0)} iconBg="bg-teal-100"   iconColor="text-teal-700"   accent="border-teal-500" />
          <SummaryCard icon={TrendingUp}  label="متوسط الدرجات"    value={`${summary.avgScore || 0}%`} iconBg="bg-indigo-100" iconColor="text-indigo-700" accent="border-indigo-500" />
          <SummaryCard icon={Wallet}      label="مدفوع"            value={`${fmt(summary.totalPaid || 0)} ج`}    iconBg="bg-emerald-100" iconColor="text-emerald-700" accent="border-emerald-500" />
          <SummaryCard icon={AlertCircle} label="معلّق"            value={`${fmt(summary.totalPending || 0)} ج`} iconBg="bg-yellow-100"  iconColor="text-yellow-700"  accent="border-yellow-500" />
        </div>

        {/* ── Performance Overview ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Pass Rate Ring */}
          <div className="card text-center !py-6 flex flex-col items-center gap-2">
            <p className="text-xs font-bold text-gray-500 mb-1">نسبة النجاح</p>
            <div className="relative">
              <ProgressRing value={passRate} max={100} size={90} stroke={9} color={passRate >= 50 ? '#22c55e' : '#ef4444'} />
              <span className={`absolute inset-0 flex items-center justify-center text-xl font-black ${passRate >= 50 ? 'text-green-600' : 'text-red-500'}`}>
                {passRate}%
              </span>
            </div>
            <p className="text-xs text-gray-500 font-medium">{summary.passCount} نجاح / {summary.failCount} رسوب</p>
          </div>

          {/* Avg Score Ring */}
          <div className="card text-center !py-6 flex flex-col items-center gap-2">
            <p className="text-xs font-bold text-gray-500 mb-1">متوسط الأداء</p>
            <div className="relative">
              <ProgressRing value={summary.avgScore || 0} max={100} size={90} stroke={9} color="#6366f1" />
              <span className="absolute inset-0 flex items-center justify-center text-xl font-black text-indigo-600">
                {summary.avgScore || 0}%
              </span>
            </div>
            <p className="text-xs text-gray-500 font-medium">من {summary.totalExams} امتحان</p>
          </div>

          {/* Rank */}
          <div className="card text-center !py-6 flex flex-col items-center gap-2">
            <p className="text-xs font-bold text-gray-500 mb-1">ترتيبي</p>
            <div className="relative">
              <ProgressRing
                value={summary.totalStudents ? summary.totalStudents - summary.rank + 1 : 1}
                max={summary.totalStudents || 1}
                size={90} stroke={9} color="#f59e0b"
              />
              <span className="absolute inset-0 flex items-center justify-center text-xl font-black text-amber-600">
                #{summary.rank || '-'}
              </span>
            </div>
            <p className="text-xs text-gray-500 font-medium">من {summary.totalStudents} طالب</p>
          </div>
        </div>

        {/* ── Badges ── */}
        {badges.length > 0 && (
          <Section title="شاراتي" icon={Award}>
            <div className="flex flex-wrap gap-3 pt-1">
              {badges.map(b => (
                <div key={b.id}
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-white text-sm font-bold shadow-md"
                  style={{ backgroundColor: b.badge_color || '#f97316' }}>
                  🏅 {b.badge_name}
                  <span className="text-white/70 text-xs font-medium">· {b.exam_title}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── Exam Results ── */}
        <Section title={`نتائج الامتحانات (${examResults.length})`} icon={FileText}>
          {examResults.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-6">لم تؤدِ أي امتحانات بعد</p>
          ) : (
            <>
              <div className="space-y-3 pt-1">
                {(showAllExams ? examResults : examResults.slice(0, EXAMS_PAGE)).map(r => {
                  const passed = r.score >= r.pass_score;
                  return (
                    <div key={r.id} className={`rounded-xl border-2 p-4 ${passed ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/50'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-navy-700 text-sm leading-tight">{r.exam_title}</p>
                          {r.course_name && <p className="text-xs text-gray-500 font-medium mt-0.5">{r.course_name}</p>}
                          <div className="flex flex-wrap gap-3 mt-2 text-xs font-semibold text-gray-600">
                            <span className="flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5 text-green-600" /> {r.correct_count} صواب</span>
                            <span className="flex items-center gap-1"><XCircle className="w-3.5 h-3.5 text-red-500" /> {r.wrong_count} خطأ</span>
                            {r.unanswered_count > 0 && <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-gray-400" /> {r.unanswered_count} بدون إجابة</span>}
                            {r.points_earned > 0 && <span className="text-orange-600">+{r.points_earned} نقطة ⭐</span>}
                          </div>
                        </div>
                        <div className="text-center flex-shrink-0">
                          <p className={`text-2xl font-black ${passed ? 'text-green-700' : 'text-red-600'}`}>{r.score}<span className="text-sm font-semibold text-gray-400">/{r.total_score}</span></p>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${passed ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-700'}`}>
                            {passed ? '✓ ناجح' : '✗ راسب'}
                          </span>
                        </div>
                      </div>
                      <ScoreBar score={r.score} total={r.total_score} passScore={r.pass_score} />
                      <div className="flex items-center justify-between mt-3">
                        <p className="text-xs text-gray-400">{fmtDate(r.created_at)}</p>
                        <div className="flex items-center gap-2">
                          {r.badge_name && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                              style={{ backgroundColor: r.badge_color || '#f97316' }}>🏅 {r.badge_name}</span>
                          )}
                          <button
                            onClick={() => navigate(`/student/exam-review/${r.id}`)}
                            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-navy-50 hover:bg-navy-100 text-navy-700 text-xs font-bold transition-colors border border-navy-200">
                            <Eye className="w-3.5 h-3.5" /> مراجعة
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {examResults.length > EXAMS_PAGE && (
                <button
                  onClick={() => setShowAllExams(v => !v)}
                  className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-gray-200 text-gray-500 text-sm font-bold hover:border-orange-300 hover:text-orange-600 hover:bg-orange-50/50 transition-all">
                  {showAllExams
                    ? <><ChevronUp className="w-4 h-4" /> عرض أقل</>
                    : <><ChevronDown className="w-4 h-4" /> عرض المزيد ({examResults.length - EXAMS_PAGE} اختبار آخر)</>}
                </button>
              )}
            </>
          )}
        </Section>

        {/* ── Courses & Video Progress ── */}
        <Section title={`الكورسات والتقدم (${courses.length})`} icon={BookOpen}>
          {courses.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-6">لم تنضم لأي كورس بعد</p>
          ) : (
            <div className="space-y-4 pt-1">
              {courses.map(c => {
                const progress = c.total_videos > 0 ? Math.round((c.watched_videos / c.total_videos) * 100) : 0;
                return (
                  <div key={c.id} className="rounded-xl border border-gray-200 p-4 bg-gray-50/50">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-navy-700 text-sm">{c.name}</p>
                        {c.target_stage && <p className="text-xs text-gray-500 mt-0.5">{c.target_stage}</p>}
                      </div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${c.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {c.status === 'active' ? 'نشط' : c.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                      <div className="text-center bg-white rounded-lg p-2 border border-gray-100">
                        <p className="text-lg font-black text-navy-600">{c.watched_videos}<span className="text-xs text-gray-400">/{c.total_videos}</span></p>
                        <p className="text-xs text-gray-500 font-medium">فيديو شاهدته</p>
                      </div>
                      <div className="text-center bg-white rounded-lg p-2 border border-gray-100">
                        <p className="text-lg font-black text-orange-600">{fmtMins(c.total_watched_minutes)}</p>
                        <p className="text-xs text-gray-500 font-medium">وقت المشاهدة</p>
                      </div>
                      <div className="text-center bg-white rounded-lg p-2 border border-gray-100">
                        <p className="text-lg font-black text-indigo-600">{c.total_pdfs}</p>
                        <p className="text-xs text-gray-500 font-medium">ملفات PDF</p>
                      </div>
                      <div className="text-center bg-white rounded-lg p-2 border border-gray-100">
                        <p className="text-lg font-black text-teal-600">{progress}%</p>
                        <p className="text-xs text-gray-500 font-medium">الإنجاز</p>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-gray-500 font-medium mb-1">
                        <span>التقدم في الكورس</span>
                        <span>{progress}%</span>
                      </div>
                      <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-2.5 rounded-full transition-all bg-gradient-to-r from-navy-500 to-orange-500"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* ── Video Progress Detail ── */}
        {videoProgress.length > 0 && (
          <Section title={`سجل مشاهدة الفيديوهات (${videoProgress.length})`} icon={Play} defaultOpen={false}>
            <div className="space-y-2 pt-1">
              {videoProgress.map(vp => (
                <div key={vp.video_id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                  <div className="w-9 h-9 bg-navy-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Play className="w-4 h-4 text-navy-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-navy-700 truncate">{vp.video_title}</p>
                    <p className="text-xs text-gray-500 font-medium">{vp.course_name}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-1.5 bg-orange-400 rounded-full" style={{ width: `${vp.progress_percentage}%` }} />
                      </div>
                      <span className="text-xs font-bold text-gray-500 w-8">{Math.round(vp.progress_percentage)}%</span>
                    </div>
                  </div>
                  <div className="text-left flex-shrink-0">
                    <p className="text-xs font-bold text-gray-700">{fmtMins(vp.watched_minutes)}</p>
                    <p className="text-xs text-gray-400">شاهدت {vp.watch_count}× </p>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── Payments ── */}
        <Section title={`سجل المدفوعات (${payments.length})`} icon={CreditCard} defaultOpen={false}>
          {payments.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-6">لا توجد مدفوعات مسجّلة</p>
          ) : (
            <>
              {/* Totals */}
              <div className="grid grid-cols-2 gap-3 mb-4 pt-1">
                <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-center">
                  <p className="text-xl font-black text-green-700">{fmt(summary.totalPaid)} ج.م</p>
                  <p className="text-xs text-green-600 font-semibold mt-0.5">إجمالي المدفوع</p>
                </div>
                <div className="rounded-xl bg-yellow-50 border border-yellow-200 p-3 text-center">
                  <p className="text-xl font-black text-yellow-700">{fmt(summary.totalPending)} ج.م</p>
                  <p className="text-xs text-yellow-600 font-semibold mt-0.5">في الانتظار</p>
                </div>
              </div>

              <div className="space-y-2">
                {payments.map(p => {
                  const sc = statusConfig[p.status] || { label: p.status, cls: 'bg-gray-100 text-gray-600' };
                  return (
                    <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                      <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center flex-shrink-0 border border-gray-200">
                        <CreditCard className="w-4 h-4 text-gray-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-navy-700 truncate">{p.course_name || 'غير محدد'}</p>
                        <p className="text-xs text-gray-500 font-medium">
                          {methodLabel[p.method] || p.method} · {fmtDate(p.payment_date)}
                        </p>
                        {p.reference_number && (
                          <p className="text-xs text-gray-400 font-mono mt-0.5">{p.reference_number}</p>
                        )}
                      </div>
                      <div className="text-left flex-shrink-0">
                        <p className="text-base font-black text-navy-700">{fmt(p.amount)} ج</p>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${sc.cls}`}>{sc.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Section>

      </div>
    </div>
  );
}
