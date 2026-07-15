import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen, FileText, Award, Star, Eye,
  CheckCircle, XCircle, Play, Compass,
} from 'lucide-react';
import api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

/* ─── tiny circular progress ring ─────────────────────────────────────────── */
function ProgressRing({ pct = 0, size = 44, stroke = 4, color = '#a855f7' }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * Math.min(pct, 100) / 100;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(168,85,247,0.2)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
    </svg>
  );
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const { dark } = useTheme();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['student-dashboard'],
    queryFn: () => api.get('/students/me/dashboard').then(r => r.data),
    staleTime: 60_000,
  });

  const lastVideo = data?.videoProgress?.[0] || null;
  const videoPct  = Math.round(lastVideo?.progress_percentage || 0);

  /* palette shortcut */
  const s = dark
    ? { card: '#1c1a2e', border: 'rgba(255,255,255,0.07)', text: '#e2e8f0', sub: '#94a3b8' }
    : { card: '#ffffff',  border: 'rgba(0,0,0,0.07)',       text: '#1e293b', sub: '#64748b' };

  return (
    <div style={{ direction: 'rtl', padding: '1rem', overflowY: 'auto', height: '100%' }}>
      <style>{`
        @keyframes db-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        .db-tile { transition: transform .2s, box-shadow .2s; }
        .db-tile:hover { transform: translateY(-3px); }
        .db-stat { transition: transform .18s; }
        .db-stat:hover { transform: translateY(-2px); }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem', maxWidth: 700, margin: '0 auto' }}>

        {/* ══ HERO ══════════════════════════════════════════════════════════ */}
        <div style={{
          borderRadius: 22,
          background: 'linear-gradient(135deg, #1e3a5f 0%, #0f2744 60%, #1a1035 100%)',
          padding: '1.25rem 1.4rem',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* decorative orbs */}
          <div style={{ position:'absolute', top:-40, left:-40, width:160, height:160, borderRadius:'50%', background:'radial-gradient(circle,rgba(249,115,22,.18),transparent 70%)', pointerEvents:'none' }} />
          <div style={{ position:'absolute', bottom:-30, right:60, width:120, height:120, borderRadius:'50%', background:'radial-gradient(circle,rgba(99,102,241,.15),transparent 70%)', pointerEvents:'none' }} />

          <div style={{ display:'flex', alignItems:'center', gap:'1rem', position:'relative' }}>
            <div style={{
              width:58, height:58, borderRadius:18,
              background: 'linear-gradient(135deg,#f97316,#ea580c)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:24, fontWeight:900, color:'#fff',
              flexShrink:0,
            }}>
              {user?.name?.charAt(0)}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ color:'rgba(255,255,255,.65)', fontSize:'.78rem', marginBottom:2 }}>
                {data?.student?.academic_stage || 'طالب'}
              </p>
              <h1 style={{ color:'#fff', fontWeight:900, fontSize:'1.15rem', lineHeight:1.25, margin:0 }}>
                مرحباً، {user?.name}!
              </h1>
              <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:6 }}>
                <Star style={{ width:15, height:15, color:'#fbbf24', fill:'#fbbf24', flexShrink:0 }} />
                <span style={{ color:'#fde68a', fontWeight:800, fontSize:'.88rem' }}>
                  {data?.student?.points || 0} نقطة
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ══ STATS ROW ═════════════════════════════════════════════════════ */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'.75rem' }}>
          {[
            {
              icon: BookOpen, label: 'كورساتي',
              value: data?.enrollments?.length || 0,
              iconBg: 'linear-gradient(135deg,#3b82f6,#2563eb)',
              glow: dark ? 'rgba(59,130,246,.25)' : 'rgba(59,130,246,.12)',
              numColor: dark ? '#93c5fd' : '#1d4ed8',
            },
            {
              icon: FileText, label: 'اختباراتي',
              value: data?.totalExams ?? data?.recentResults?.length ?? 0,
              iconBg: 'linear-gradient(135deg,#10b981,#059669)',
              glow: dark ? 'rgba(16,185,129,.25)' : 'rgba(16,185,129,.12)',
              numColor: dark ? '#6ee7b7' : '#065f46',
            },
            {
              icon: Award, label: 'شاراتي',
              value: data?.badges?.length || 0,
              iconBg: 'linear-gradient(135deg,#f97316,#ea580c)',
              glow: dark ? 'rgba(249,115,22,.25)' : 'rgba(249,115,22,.12)',
              numColor: dark ? '#fdba74' : '#9a3412',
            },
          ].map(({ icon: Icon, label, value, iconBg, glow, numColor }) => (
            <div key={label} className="db-stat" style={{
              borderRadius:18,
              background: s.card,
              border: `1.5px solid ${s.border}`,
              padding: '1rem .75rem',
              textAlign: 'center',
              cursor: 'default',
            }}>
              <div style={{
                width:42, height:42,
                borderRadius:13,
                background: iconBg,
                display:'flex', alignItems:'center', justifyContent:'center',
                margin:'0 auto .65rem',
              }}>
                <Icon style={{ width:20, height:20, color:'#fff' }} />
              </div>
              <p style={{ fontSize:'1.6rem', fontWeight:900, color: numColor, lineHeight:1, margin:0 }}>{value}</p>
              <p style={{ fontSize:'.7rem', fontWeight:700, color: s.sub, marginTop:4 }}>{label}</p>
            </div>
          ))}
        </div>

        {/* ══ QUICK ACCESS TILES ════════════════════════════════════════════ */}
        <div style={{ display:'grid', gridTemplateColumns: lastVideo ? '1fr 1fr' : '1fr', gap:'.85rem' }}>

          {/* My Courses tile */}
          <button className="db-tile" onClick={() => navigate('/student/courses')} style={{
            borderRadius:20,
            background: dark
              ? 'linear-gradient(145deg,#1e3a5f,#162c4a)'
              : 'linear-gradient(145deg,#eff6ff,#dbeafe)',
            border: `1.5px solid ${dark ? 'rgba(59,130,246,.25)' : 'rgba(59,130,246,.3)'}`,
            padding: '1.25rem',
            textAlign: 'right',
            cursor: 'pointer',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* bg decoration */}
            <div style={{ position:'absolute', bottom:-20, left:-20, width:90, height:90, borderRadius:'50%', background:'rgba(59,130,246,.08)', pointerEvents:'none' }} />

            <div style={{
              width:48, height:48, borderRadius:15,
              background:'linear-gradient(135deg,#3b82f6,#2563eb)',
              display:'flex', alignItems:'center', justifyContent:'center',
              marginBottom:'.85rem',
            }}>
              <BookOpen style={{ width:22, height:22, color:'#fff' }} />
            </div>

            <p style={{ fontWeight:900, fontSize:'.95rem', color: dark ? '#93c5fd' : '#1e40af', margin:0, lineHeight:1.3 }}>كورساتي</p>
            <p style={{ fontSize:'.72rem', color: dark ? '#64748b' : '#3b82f6', marginTop:5, fontWeight:600 }}>
              {data?.enrollments?.length
                ? `${data.enrollments.length} كورس مسجّل`
                : 'استعرض كورساتك'}
            </p>
          </button>

          {/* Last video tile */}
          {lastVideo && (
            <button className="db-tile"
              onClick={() => navigate(`/student/courses/${lastVideo.course_id}`, { state: { videoId: lastVideo.video_id } })}
              style={{
                borderRadius:20,
                background: dark
                  ? 'linear-gradient(145deg,#2d1b69,#1e1040)'
                  : 'linear-gradient(145deg,#faf5ff,#ede9fe)',
                border: `1.5px solid ${dark ? 'rgba(168,85,247,.3)' : 'rgba(168,85,247,.3)'}`,
                padding:'1.25rem',
                textAlign:'right',
                cursor:'pointer',
                position:'relative',
                overflow:'hidden',
              }}>
              <div style={{ position:'absolute', bottom:-20, left:-20, width:90, height:90, borderRadius:'50%', background:'rgba(168,85,247,.08)', pointerEvents:'none' }} />

              {/* icon + ring */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'.85rem' }}>
                <div style={{ position:'relative', display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
                  <ProgressRing pct={videoPct} size={44} stroke={3.5} color={dark ? '#c084fc' : '#9333ea'} />
                  <Play style={{ position:'absolute', width:16, height:16, color: dark ? '#c084fc' : '#9333ea' }} />
                </div>
                <span style={{
                  fontSize:'.65rem', fontWeight:800,
                  background: dark ? 'rgba(168,85,247,.25)' : 'rgba(168,85,247,.15)',
                  color: dark ? '#c084fc' : '#7e22ce',
                  padding:'2px 8px', borderRadius:99,
                }}>
                  {videoPct}%
                </span>
              </div>

              <p style={{ fontWeight:900, fontSize:'.88rem', color: dark ? '#c084fc' : '#6b21a8', margin:0, lineHeight:1.3,
                overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>
                {lastVideo.title}
              </p>
              <p style={{ fontSize:'.68rem', color: dark ? '#64748b' : '#9333ea', marginTop:5, fontWeight:600 }}>
                تابع من حيث توقفت ←
              </p>
            </button>
          )}
        </div>

        {/* ══ BROWSE CTA ════════════════════════════════════════════════════ */}
        <button className="db-tile" onClick={() => navigate('/student/courses', { state: { tab: 'browse' } })} style={{
          width:'100%',
          borderRadius:20,
          background: dark
            ? 'linear-gradient(135deg,#431407,#7c2d12)'
            : 'linear-gradient(135deg,#fff7ed,#ffedd5)',
          border: `1.5px solid ${dark ? 'rgba(249,115,22,.3)' : 'rgba(249,115,22,.35)'}`,
          padding: '1.1rem 1.3rem',
          display:'flex', alignItems:'center', justifyContent:'space-between', gap:'1rem',
          cursor:'pointer',
          position:'relative',
          overflow:'hidden',
          textAlign:'right',
        }}>
          <div style={{ position:'absolute', top:-30, left:-30, width:120, height:120, borderRadius:'50%', background:'rgba(249,115,22,.06)', pointerEvents:'none' }} />

          <div style={{ flex:1, minWidth:0, position:'relative' }}>
            <p style={{ fontWeight:900, fontSize:'1rem', color: dark ? '#fb923c' : '#9a3412', margin:0 }}>
              تصفح الكورسات المتاحة
            </p>
            <p style={{ fontSize:'.75rem', color: dark ? '#fdba74' : '#ea580c', marginTop:4, fontWeight:600 }}>
              اكتشف الكورسات وانضم قبل الشراء
            </p>
          </div>

          <div style={{
            width:48, height:48, borderRadius:15, flexShrink:0,
            background:'linear-gradient(135deg,#f97316,#ea580c)',
            display:'flex', alignItems:'center', justifyContent:'center',
            animation: 'db-float 3s ease-in-out infinite',
          }}>
            <Compass style={{ width:22, height:22, color:'#fff' }} />
          </div>
        </button>

        {/* ══ BADGES ════════════════════════════════════════════════════════ */}
        {data?.badges?.length > 0 && (
          <div style={{
            borderRadius:18,
            background: s.card,
            border:`1.5px solid ${s.border}`,
            padding:'1.1rem 1.2rem',
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:'1rem' }}>
              <Award style={{ width:18, height:18, color:'#f97316' }} />
              <span style={{ fontWeight:900, fontSize:'.95rem', color: s.text }}>شاراتي</span>
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {data.badges.map(b => (
                <span key={b.id} style={{
                  display:'flex', alignItems:'center', gap:6,
                  padding:'5px 14px',
                  borderRadius:99,
                  fontSize:'.75rem', fontWeight:800, color:'#fff',
                  backgroundColor: b.badge_color || '#f97316',
                }}>
                  🏅 {b.badge_name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ══ RECENT RESULTS ════════════════════════════════════════════════ */}
        <div style={{
          borderRadius:18,
          background: s.card,
          border:`1.5px solid ${s.border}`,
          padding:'1.1rem 1.2rem',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:'1rem' }}>
            <FileText style={{ width:18, height:18, color:'#f97316' }} />
            <span style={{ fontWeight:900, fontSize:'.95rem', color: s.text }}>آخر النتائج</span>
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:'.6rem' }}>
            {isLoading ? (
              [...Array(3)].map((_, i) => (
                <div key={i} style={{ height:64, borderRadius:14, background: dark ? '#2d2b3d' : '#f1f5f9', animation:'pulse 1.5s ease-in-out infinite' }} />
              ))
            ) : data?.recentResults?.length > 0 ? (
              data.recentResults.map(r => {
                const isAbsent = r.is_absent === true || r.is_absent === 'true';
                const passed   = !isAbsent && r.score >= r.pass_score;
                const pct      = r.total_score > 0 ? Math.round((r.score / r.total_score) * 100) : 0;

                const rowBg = isAbsent
                  ? (dark ? 'rgba(100,116,139,.12)' : '#f8fafc')
                  : passed
                    ? (dark ? 'rgba(16,185,129,.09)' : '#f0fdf4')
                    : (dark ? 'rgba(239,68,68,.09)'  : '#fff1f2');

                const rowBorder = isAbsent
                  ? (dark ? 'rgba(100,116,139,.25)' : '#e2e8f0')
                  : passed
                    ? (dark ? 'rgba(16,185,129,.3)'  : '#bbf7d0')
                    : (dark ? 'rgba(239,68,68,.3)'   : '#fecdd3');

                return (
                  <div key={r.id} style={{
                    display:'flex', alignItems:'center', gap:12,
                    padding:'10px 12px',
                    borderRadius:14,
                    border:`1.5px solid ${rowBorder}`,
                    background: rowBg,
                    transition:'background .15s',
                  }}>
                    {/* icon */}
                    <div style={{
                      width:38, height:38, borderRadius:12, flexShrink:0,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      background: isAbsent ? (dark?'rgba(100,116,139,.2)':'#e2e8f0')
                        : passed ? 'rgba(16,185,129,.15)' : 'rgba(239,68,68,.15)',
                    }}>
                      {isAbsent
                        ? <XCircle style={{ width:18, height:18, color:'#94a3b8' }} />
                        : passed
                          ? <CheckCircle style={{ width:18, height:18, color:'#10b981' }} />
                          : <XCircle style={{ width:18, height:18, color:'#ef4444' }} />
                      }
                    </div>

                    {/* info */}
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontWeight:700, fontSize:'.85rem', color: s.text, margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {r.exam_title}
                      </p>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:5 }}>
                        {!isAbsent && (
                          <>
                            <div style={{ flex:1, maxWidth:70, height:4, borderRadius:99, background: dark?'rgba(255,255,255,.1)':'#e2e8f0', overflow:'hidden' }}>
                              <div style={{ width:`${pct}%`, height:'100%', borderRadius:99, background: passed?'#10b981':'#ef4444', transition:'width .4s' }} />
                            </div>
                            <span style={{ fontSize:'.7rem', fontWeight:800,
                              color: passed ? (dark?'#6ee7b7':'#065f46') : (dark?'#fca5a5':'#9f1239') }}>
                              {pct}%
                            </span>
                          </>
                        )}
                        <span style={{ fontSize:'.68rem', color: s.sub }}>
                          {new Date(r.created_at).toLocaleDateString('ar-EG')}
                        </span>
                      </div>
                    </div>

                    {/* score / review */}
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                      {isAbsent ? (
                        <span style={{ fontSize:'.72rem', fontWeight:800,
                          background: dark?'rgba(100,116,139,.2)':'#e2e8f0',
                          color: dark?'#94a3b8':'#475569',
                          padding:'3px 10px', borderRadius:8 }}>غائب</span>
                      ) : (
                        <>
                          <div style={{ textAlign:'center' }}>
                            <p style={{ fontWeight:900, fontSize:'1rem', margin:0,
                              color: passed ? (dark?'#6ee7b7':'#065f46') : (dark?'#fca5a5':'#9f1239') }}>
                              {r.score}
                              <span style={{ fontSize:'.7rem', fontWeight:600, color: s.sub }}>/{r.total_score}</span>
                            </p>
                            <span style={{ fontSize:'.62rem', fontWeight:800, padding:'2px 7px', borderRadius:99,
                              background: passed ? (dark?'rgba(16,185,129,.2)':'#d1fae5') : (dark?'rgba(239,68,68,.2)':'#fee2e2'),
                              color: passed ? (dark?'#6ee7b7':'#065f46') : (dark?'#fca5a5':'#9f1239') }}>
                              {passed ? '✓ ناجح' : '✗ راسب'}
                            </span>
                          </div>
                          <button
                            onClick={() => navigate(`/student/exam-review/${r.id}`)}
                            style={{
                              display:'flex', alignItems:'center', gap:4,
                              padding:'6px 12px', borderRadius:10,
                              fontSize:'.72rem', fontWeight:800,
                              border:'none', cursor:'pointer',
                              background: dark?'rgba(255,255,255,.08)':'#0f172a',
                              color:'#fff',
                              transition:'background .15s',
                            }}
                          >
                            <Eye style={{ width:13, height:13 }} /> مراجعة
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ textAlign:'center', padding:'2.5rem 0' }}>
                <FileText style={{ width:40, height:40, margin:'0 auto 10px', color: dark?'#334155':'#cbd5e1' }} />
                <p style={{ fontSize:'.85rem', color: s.sub, fontWeight:600 }}>لم تؤدِ أي اختبارات بعد</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
