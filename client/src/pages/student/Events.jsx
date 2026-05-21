import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { PlayCircle, Trophy, Zap, Shield, Timer, Star, ChevronLeft } from 'lucide-react';
import api from '../../lib/api';

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');

@keyframes floatBob { 0%,100%{transform:translateY(0) rotate(-3deg)} 50%{transform:translateY(-10px) rotate(3deg)} }
@keyframes shimmerSlide { 0%{background-position:-200% center} 100%{background-position:200% center} }
@keyframes gridPulse { 0%,100%{opacity:.07} 50%{opacity:.18} }
@keyframes arcPulse { 0%,100%{stroke-dashoffset:220} 50%{stroke-dashoffset:0} }
@keyframes boltFlash { 0%,78%,100%{opacity:0} 82%,92%{opacity:1} }
@keyframes fadeUp { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:none} }
@keyframes pingDot { 0%,100%{transform:scale(1);opacity:.6} 50%{transform:scale(1.9);opacity:0} }
@keyframes pulseGlow { 0%,100%{box-shadow:0 0 18px rgba(124,58,237,.5)} 50%{box-shadow:0 0 38px rgba(236,72,153,.7)} }

.ev-hero { animation: fadeUp .5s .1s both; }
.ev-card { animation: fadeUp .5s .25s both; }
.ev-bosses { animation: fadeUp .5s .4s both; }
.ev-rules { animation: fadeUp .5s .52s both; }
`;

function Particle({ x, y, s, c, del, dur }) {
  return (
    <div style={{
      position: 'absolute', left: `${x}%`, top: `${y}%`,
      width: s, height: s, borderRadius: '50%', background: c, opacity: .5,
      animation: `pingDot ${dur}s ${del}s ease-in-out infinite`, pointerEvents: 'none',
    }} />
  );
}

function BossCard({ num, label, emoji, pts, monsterLabel, color, glowColor }) {
  return (
    <div style={{
      flex: 1, minWidth: 0, borderRadius: 14,
      background: `rgba(${color},0.08)`, border: `1px solid rgba(${color},0.25)`,
      padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', textAlign: 'center',
    }}>
      <div style={{ fontSize: 32, filter: `drop-shadow(0 0 10px rgba(${color},.6))` }}>{emoji}</div>
      <div style={{ color: '#fff', fontWeight: 900, fontSize: 13 }}>{label}</div>
      <code style={{ fontSize: 11, color: `rgba(${color},1)`, background: `rgba(${color},.1)`, borderRadius: 5, padding: '2px 8px' }}>{monsterLabel}</code>
      <div style={{ marginTop: 4, background: `rgba(${color},.18)`, border: `1px solid rgba(${color},.35)`, borderRadius: 8, padding: '5px 14px' }}>
        <span style={{ color: '#fbbf24', fontWeight: 900, fontSize: 16 }}>+{pts}</span>
        <span style={{ color: 'rgba(255,255,255,.4)', fontSize: 11, marginRight: 4 }}>نقطة</span>
      </div>
    </div>
  );
}

export default function Events() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [weeklyPlayed, setWeeklyPlayed] = useState(false);
  const [particles] = useState(() => {
    const cols = ['#f59e0b', '#ec4899', '#8b5cf6', '#10b981', '#3b82f6', '#f97316'];
    return Array.from({ length: 18 }, (_, i) => ({
      id: i, x: Math.random() * 100, y: Math.random() * 100,
      s: 4 + Math.random() * 5, c: cols[i % cols.length],
      del: Math.random() * 2, dur: 1.8 + Math.random() * 2.5,
    }));
  });

  useEffect(() => {
    api.get('/events/weekly-run/status')
      .then(r => setWeeklyPlayed(r.data.played))
      .catch(() => {});
  }, []);

  const pts = user?.points || 0;

  return (
    <div dir="rtl" style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', background: '#0a0812', fontFamily: "'Cairo', sans-serif" }}>
      <style>{CSS}</style>

      {/* ── HERO HEADER ── */}
      <div style={{
        position: 'relative', flexShrink: 0,
        background: 'linear-gradient(135deg,#1a0838 0%,#350768 45%,#1a0e30 100%)',
        borderBottom: '1px solid rgba(139,92,246,.2)', overflow: 'hidden', padding: '22px 26px 24px',
      }}>
        {particles.map(p => <Particle key={p.id} {...p} />)}
        {['🎮', '🏆', '⚡', '🎯', '🧠', '🚀'].map((e, i) => (
          <span key={i} style={{
            position: 'absolute', top: `${8 + i * 14}%`, left: i < 3 ? `${2 + i * 8}%` : undefined,
            right: i >= 3 ? `${2 + (i - 3) * 9}%` : undefined,
            fontSize: 22, pointerEvents: 'none', userSelect: 'none',
            animation: `floatBob ${2.6 + i * .3}s ${i * .2}s ease-in-out infinite`,
          }}>{e}</span>
        ))}
        <div className="ev-hero" style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 16, fontSize: 24, flexShrink: 0,
              background: 'linear-gradient(135deg,#7c3aed,#ec4899,#f97316)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 28px rgba(124,58,237,.5)',
            }}>🎮</div>
            <div>
              <h1 style={{
                margin: 0, fontSize: 24, fontWeight: 900,
                background: 'linear-gradient(90deg,#fff 0%,#c4b5fd 40%,#f9a8d4 75%,#fdba74 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>الفعاليات التعليمية</h1>
              <p style={{ margin: '3px 0 0', color: 'rgba(196,181,253,.6)', fontSize: 13 }}>
                العب، تعلّم، واكسب نقاط حقيقية على حسابك ✨
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
            {[
              { ic: <Trophy size={13}/>, label: `${pts.toLocaleString('ar-EG')} نقطة`, col: '#fbbf24', bg: 'rgba(251,191,36,.1)', brd: 'rgba(251,191,36,.25)' },
              { ic: <Zap size={13}/>, label: 'مرة في الأسبوع', col: '#a78bfa', bg: 'rgba(167,139,250,.1)', brd: 'rgba(167,139,250,.25)' },
              { ic: <Shield size={13}/>, label: '3 أرواح', col: '#f87171', bg: 'rgba(248,113,113,.1)', brd: 'rgba(248,113,113,.25)' },
            ].map(({ ic, label, col, bg, brd }) => (
              <div key={label} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: bg, border: `1px solid ${brd}`, borderRadius: 8,
                padding: '5px 12px', color: col, fontSize: 12, fontWeight: 700,
              }}>{ic}{label}</div>
            ))}
          </div>
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div style={{ padding: '22px 20px', display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 860, margin: '0 auto', width: '100%' }}>

        {/* MAIN GAME CARD */}
        <div className="ev-card" style={{
          position: 'relative', borderRadius: 22, overflow: 'hidden',
          background: 'linear-gradient(145deg,#080820 0%,#141060 55%,#080820 100%)',
          boxShadow: weeklyPlayed ? '0 6px 28px rgba(99,102,241,.25)' : '0 8px 40px rgba(99,102,241,.5), 0 0 0 1px rgba(255,255,255,.07)',
          animation: weeklyPlayed ? 'none' : 'pulseGlow 3s ease-in-out infinite',
        }}>
          {/* Grid background */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            backgroundImage: 'linear-gradient(rgba(99,102,241,.8) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,.8) 1px,transparent 1px)',
            backgroundSize: '32px 32px', animation: 'gridPulse 3s ease-in-out infinite',
          }} />

          {/* Arc decorations */}
          <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '45%', opacity: .45, pointerEvents: 'none' }}
            viewBox="0 0 400 100" preserveAspectRatio="none">
            <path d="M10,80 Q100,10 200,60 Q300,10 390,40" fill="none" stroke="#818cf8" strokeWidth="2"
              strokeDasharray="220" style={{ animation: 'arcPulse 4s ease-in-out infinite' }} />
            <path d="M10,90 Q120,40 220,75 Q310,40 390,65" fill="none" stroke="#6366f1" strokeWidth="1.5"
              strokeDasharray="220" style={{ animation: 'arcPulse 4s 1s ease-in-out infinite' }} />
          </svg>

          {/* Weekly badge */}
          <div style={{
            position: 'absolute', top: 16, right: 16, zIndex: 2,
            background: 'rgba(99,102,241,.35)', backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,.18)', borderRadius: 999,
            padding: '4px 12px', color: '#c7d2fe', fontSize: 12, fontWeight: 700,
          }}>أسبوعي ⚡</div>

          <div style={{ position: 'relative', zIndex: 1, padding: '28px 26px 26px' }}>
            {/* Title row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
              <div style={{
                fontSize: 72, lineHeight: 1, flexShrink: 0,
                animation: 'boltFlash 3.5s ease-in-out infinite',
                filter: 'drop-shadow(0 0 18px rgba(129,140,248,.8))',
              }}>🏃</div>
              <div>
                <h2 style={{ color: '#fff', fontWeight: 900, fontSize: 22, margin: '0 0 4px' }}>
                  تحدي الأسبوعي الرياضي
                </h2>
                <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 14, margin: 0 }}>
                  اهرب من معادلات الشيطان وهزم الأستاذ نفسه! 😤
                </p>
              </div>
            </div>

            {/* Stats row */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 22 }}>
              {[
                { ic: '🏆', val: '300', sub: 'أقصى نقاط' },
                { ic: '👹', val: '3', sub: 'بوسات' },
                { ic: '❤️', val: '3', sub: 'أرواح' },
                { ic: '⏱️', val: '~5', sub: 'دقائق' },
              ].map(({ ic, val, sub }) => (
                <div key={sub} style={{
                  flex: '1 1 80px', background: 'rgba(255,255,255,.06)',
                  border: '1px solid rgba(255,255,255,.1)', borderRadius: 12,
                  padding: '10px 14px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 18 }}>{ic}</div>
                  <div style={{ color: '#fff', fontWeight: 900, fontSize: 18, lineHeight: 1.2 }}>{val}</div>
                  <div style={{ color: 'rgba(255,255,255,.35)', fontSize: 11 }}>{sub}</div>
                </div>
              ))}
            </div>

            {/* How to play */}
            <div style={{
              background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)',
              borderRadius: 14, padding: '14px 16px', marginBottom: 22,
            }}>
              <div style={{ color: '#c4b5fd', fontWeight: 900, fontSize: 13, marginBottom: 10 }}>
                🕹️ كيف تلعب؟
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 8 }}>
                {[
                  ['⬆️', 'مسافة / سهم لفوق', 'قفز فوق العقبات'],
                  ['⬇️', 'سهم لتحت / S', 'اركع تحت العقبات'],
                  ['💥', 'اصطدام بعقبة', 'خسارة قلب'],
                  ['🧠', 'جاوب صح على السؤال', 'اكسب النقاط'],
                ].map(([ic, key, desc]) => (
                  <div key={desc} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{ic}</span>
                    <div>
                      <div style={{ color: 'rgba(255,255,255,.35)', fontSize: 10 }}>{key}</div>
                      <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 12, fontWeight: 700 }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Play / Already played */}
            {weeklyPlayed ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 14,
                background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.2)',
                borderRadius: 14, padding: '14px 18px',
              }}>
                <div style={{ fontSize: 36 }}>✅</div>
                <div>
                  <div style={{ color: '#86efac', fontWeight: 900, fontSize: 15 }}>لعبت هذا الأسبوع!</div>
                  <div style={{ color: 'rgba(255,255,255,.4)', fontSize: 13 }}>تقدر تلعب تاني الأسبوع الجاي 🗓️</div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => navigate('/student/events/stickman-run')}
                style={{
                  width: '100%', padding: '14px 0', borderRadius: 14, border: 'none',
                  background: 'linear-gradient(135deg,#6366f1 0%,#8b5cf6 50%,#ec4899 100%)',
                  color: '#fff', fontFamily: 'inherit', fontWeight: 900, fontSize: 17,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: '0 6px 28px rgba(99,102,241,.55)',
                  transition: 'transform .15s, box-shadow .15s',
                  backgroundSize: '200% 100%', animation: 'shimmerSlide 2.5s linear infinite',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 36px rgba(99,102,241,.7)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 6px 28px rgba(99,102,241,.55)'; }}
              >
                <PlayCircle size={20} />
                العب دلوقتي
                <ChevronLeft size={18} />
              </button>
            )}
          </div>
        </div>

        {/* BOSSES PREVIEW */}
        <div className="ev-bosses">
          <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
            👾 الـ 3 بوسات اللي هتقابلهم
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <BossCard num={1} label="بوس الجبر" emoji="👹" pts={50}
              monsterLabel="x²+5x+6=0" color="168,85,247" glowColor="#a855f7" />
            <BossCard num={2} label="بوس التفاضل" emoji="👾" pts={100}
              monsterLabel="∫f(x)dx" color="236,72,153" glowColor="#ec4899" />
            <BossCard num={3} label="الأستاذ نفسه!" emoji="🤵" pts={150}
              monsterLabel="سؤال صعب 😤" color="251,191,36" glowColor="#fbbf24" />
          </div>
        </div>

        {/* TIPS */}
        <div className="ev-rules" style={{
          background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)',
          borderRadius: 16, padding: '16px 18px',
        }}>
          <div style={{ color: 'rgba(255,255,255,.45)', fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
            💡 نصايح المحترفين
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {[
              ['🟣', 'السرعة بتزيد مع الوقت — استعد من الأول'],
              ['🔵', 'العقبة الطويلة → اقفز | العقبة الطايرة → اركع'],
              ['🟡', 'حتى لو غلطت في الإجابة، اللعبة بتكمل — بس بتاخد قلب'],
              ['🔴', 'إجابة صح مع بوس = نقاط بتضاف لحسابك على طول'],
            ].map(([dot, tip]) => (
              <div key={tip} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 10, marginTop: 4, flexShrink: 0 }}>{dot}</span>
                <span style={{ color: 'rgba(255,255,255,.55)', fontSize: 13 }}>{tip}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ height: 16 }} />
      </div>
    </div>
  );
}
