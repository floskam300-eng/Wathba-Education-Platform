import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { KeyRound, User, AlertCircle } from 'lucide-react';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login, admin, loading } = useAuth();
  const navigate = useNavigate();

  // F4 FIX: redirect already-authenticated admins away from the login page
  useEffect(() => {
    if (!loading && admin) {
      navigate('/', { replace: true });
    }
  }, [admin, loading, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!username || !password) {
      return setError('جميع الحقول مطلوبة');
    }
    setSubmitting(true);
    try {
      await login(username, password);
      navigate('/', { replace: true });
    } catch (err) {
      console.error(err);
      setError(
        err.response?.data?.error || 'فشل تسجيل الدخول، يرجى التحقق من البيانات والمحاولة مجدداً'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-2xl backdrop-blur-md">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white tracking-wide font-cairo">وثبة الإدارية</h2>
          <p className="mt-2 text-sm text-slate-400 font-cairo">تسجيل الدخول للوحة إدارة المنصة</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-950/40 border border-red-500/30 p-4 text-sm text-red-400 font-cairo">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 font-cairo" htmlFor="username">
                اسم المستخدم
              </label>
              <div className="relative mt-1">
                <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500">
                  <User size={18} />
                </span>
                <input
                  id="username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full rounded-xl border border-slate-800 bg-slate-950/80 py-3 pr-10 pl-4 text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 transition text-sm"
                  placeholder="admin"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 font-cairo" htmlFor="password">
                كلمة المرور
              </label>
              <div className="relative mt-1">
                <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500">
                  <KeyRound size={18} />
                </span>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-xl border border-slate-800 bg-slate-950/80 py-3 pr-10 pl-4 text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 transition text-sm"
                  placeholder="••••••••"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full justify-center rounded-xl bg-amber-500 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-500/20 hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-slate-950 transition disabled:opacity-50 font-cairo"
          >
            {submitting ? 'جاري التحقق...' : 'دخول'}
          </button>
        </form>
      </div>
    </div>
  );
}
