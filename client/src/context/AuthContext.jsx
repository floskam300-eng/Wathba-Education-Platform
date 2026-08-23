import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { clearMediaToken } from '../lib/mediaAccess';

export const AuthContext = createContext(null);

const SAFE_STORAGE_FIELDS = [
  'id', 'role', 'name', 'username', 'teacher_slug', 'teacher_id',
  'points', 'academic_stage', 'gender', 'phone', 'parent_phone',
  'profile_image', 'logo_url', 'bio', 'slug', 'classification',
  'whatsapp_phone', 'subject', 'created_at',
  'can_add_students', 'can_edit_students', 'can_delete_students',
  'can_manage_exams', 'can_view_analytics',
  'can_manage_payments', 'can_manage_courses', 'can_send_notifications',
  'is_simulation', 'simulated_by_teacher_id',
];

const pickStorable = (userData) => {
  if (!userData) return null;
  const obj = {};
  for (const k of SAFE_STORAGE_FIELDS) {
    if (k in userData) obj[k] = userData[k];
  }
  return obj;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [suspendedNotice, setSuspendedNotice] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
      const initAuth = async () => {
      const token = localStorage.getItem('wathba_token');
      if (token) {
        try {
          const res = await api.get('/auth/me');
          const userData = res.data;
          // [CACHE-FIX] Detect cross-user cache contamination on app startup.
          // If the user ID stored in the cache doesn't match the authenticated user
          // (e.g. a different student logged in on a shared device and the cache
          // was not cleared), discard the stale cache before hydrating the new user.
          try {
            const storedUser = JSON.parse(localStorage.getItem('wathba_user') || 'null');
            if (storedUser && storedUser.id && storedUser.id !== userData.id) {
              localStorage.removeItem('WATHBA_QUERY_CACHE');
            }
          } catch (_) {}
          setUser(userData);
          localStorage.setItem('wathba_user', JSON.stringify(pickStorable(userData)));
          if (userData.teacher_slug) {
            localStorage.setItem('wathba_teacher_slug', userData.teacher_slug);
          }
        } catch (err) {
          setUser(null);
        }
      }
      setLoading(false);
    };


    initAuth();

    const handleUnauthorized = () => {
      setUser(null);
      navigate('/login', { replace: true });
    };
    window.addEventListener('wathba_unauthorized', handleUnauthorized);
    // [H-1] Listen for account_suspended 403s fired by api.js response interceptor.
    // Without this listener the student stayed on the page after the server
    // rejected their JWT. We now show a dedicated modal and force them back
    // to the login page so they cannot keep using cached UI data.
    const handleAccountSuspended = (e) => {
      const title = e?.detail?.title || 'تم إيقاف حسابك';
      const icon = e?.detail?.icon || '🔒';
      const message = e?.detail?.message || 'تم إيقاف حسابك مؤقتاً. يرجى التواصل مع المدرس.';
      setUser(null);
      setSuspendedNotice({ title, icon, message });
      setTimeout(() => navigate('/login', { replace: true }), 4000);
    };
    window.addEventListener('wathba_account_suspended', handleAccountSuspended);
    return () => {
      window.removeEventListener('wathba_unauthorized', handleUnauthorized);
      window.removeEventListener('wathba_account_suspended', handleAccountSuspended);
    };
  }, [navigate]);

  const dismissSuspendedNotice = () => {
    setSuspendedNotice(null);
  };

  const login = async (username, password, role, _slug, deviceId, deviceOrigin, deviceName, hardwareProfile, hardwareHash) => {
    const body = { username, password };
    if (role) body.role = role;
    if (deviceId) body.device_id = deviceId;
    if (deviceName) body.device_name = deviceName;
    if (deviceOrigin) body.device_origin = deviceOrigin;
    if (hardwareProfile && Object.keys(hardwareProfile).length > 0) body.hardware_profile = hardwareProfile;
    if (hardwareHash) body.hardware_hash = hardwareHash;
    const res = await api.post('/auth/login', body);
    const { token, user, force_password_change, is_new_device } = res.data;
    // [CACHE-FIX] Clear any previously cached query data from a different user
    // before setting the new token. This prevents cross-user data contamination
    // when two different students log in from the same browser without an
    // explicit logout (e.g. shared device, tab reuse).
    localStorage.removeItem('WATHBA_QUERY_CACHE');
    localStorage.setItem('wathba_token', token);
    localStorage.setItem('wathba_user', JSON.stringify(pickStorable(user)));
    if (user.teacher_slug) {
      localStorage.setItem('wathba_teacher_slug', user.teacher_slug);
    }
    setUser(user);
    // [M-16] Pass force_password_change flag to the caller so Login page can
    // redirect the teacher to change their default seed password immediately.
    // [H-3] Also pass is_new_device so Login can gate the warning modal.
    return {
      user,
      force_password_change: force_password_change === true,
      is_new_device: is_new_device === true,
    };
  };

  const logout = () => {
    localStorage.removeItem('wathba_token');
    localStorage.removeItem('wathba_user');
    // Clear the persisted React Query cache so the next user starts fresh
    localStorage.removeItem('WATHBA_QUERY_CACHE');
    clearMediaToken();
    try {
      // Clear any in-progress recitation and exam session keys to prevent leakage across student accounts on shared devices
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('recitation_') || key.startsWith('exam_answers_') || key.startsWith('exam_active_')) {
          localStorage.removeItem(key);
        }
      });
    } catch (_) {}
    // wathba_teacher_slug is intentionally kept so the user stays on the tenant
    // route after logout (in dev / Replit the slug comes from localStorage, not
    // subdomain). In production the subdomain is authoritative anyway.
    setUser(null);
    navigate('/login', { replace: true });
  };

  const updateUser = (updates) => {
    const updated = { ...user, ...updates };
    localStorage.setItem('wathba_user', JSON.stringify(pickStorable(updated)));
    if (updated.teacher_slug) localStorage.setItem('wathba_teacher_slug', updated.teacher_slug);
    setUser(updated);
    api.get('/auth/me').then(res => {
      const fresh = res.data;
      localStorage.setItem('wathba_user', JSON.stringify(pickStorable(fresh)));
      if (fresh.teacher_slug) localStorage.setItem('wathba_teacher_slug', fresh.teacher_slug);
      setUser(fresh);
    }).catch((err) => {
      console.warn('[auth] Background user refresh failed:', err?.response?.status, err?.message);
    });
  };

  // ── Simulation Mode Helpers ────────────────────────────────────────────────
  const isSimulating = Boolean(user?.is_simulation);

  const startSimulation = async ({ academic_stage, auto_enroll = true, reset_data = false, destination = '/student' }) => {
    // 1. Backup current teacher token and user if not already in simulation
    if (!isSimulating) {
      const currentToken = localStorage.getItem('wathba_token');
      const currentUser = localStorage.getItem('wathba_user');
      if (currentToken) sessionStorage.setItem('wathba_teacher_backup_token', currentToken);
      if (currentUser) sessionStorage.setItem('wathba_teacher_backup_user', currentUser);
      sessionStorage.setItem('wathba_sim_return_path', window.location.pathname);
    }

    // 2. Call backend simulation endpoint
    const res = await api.post('/teachers/simulation/start', {
      academic_stage,
      auto_enroll,
      reset_data,
      destination,
    });

    const { token, user: simUser } = res.data;

    // 3. Clear react-query cache and swap active token
    localStorage.removeItem('WATHBA_QUERY_CACHE');
    clearMediaToken();
    localStorage.setItem('wathba_token', token);
    localStorage.setItem('wathba_user', JSON.stringify(pickStorable(simUser)));
    if (simUser.teacher_slug) localStorage.setItem('wathba_teacher_slug', simUser.teacher_slug);
    setUser(simUser);

    // 4. Navigate to student destination
    navigate(destination || '/student', { replace: true });
    return res.data;
  };

  const switchSimulatedStage = async (newStage, autoEnroll = true) => {
    const res = await api.post('/teachers/simulation/switch-stage', {
      academic_stage: newStage,
      auto_enroll: autoEnroll,
    });

    const { token, user: updatedUser } = res.data;
    localStorage.removeItem('WATHBA_QUERY_CACHE');
    localStorage.setItem('wathba_token', token);
    localStorage.setItem('wathba_user', JSON.stringify(pickStorable(updatedUser)));
    setUser(updatedUser);
    return res.data;
  };

  const resetSimulationProgress = async () => {
    const res = await api.post('/teachers/simulation/reset');
    localStorage.removeItem('WATHBA_QUERY_CACHE');
    try {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('recitation_') || key.startsWith('exam_answers_') || key.startsWith('exam_active_')) {
          localStorage.removeItem(key);
        }
      });
    } catch (_) {}
    return res.data;
  };

  const exitSimulation = async () => {
    const backupToken = sessionStorage.getItem('wathba_teacher_backup_token');
    const returnPath = sessionStorage.getItem('wathba_sim_return_path') || '/teacher';

    localStorage.removeItem('WATHBA_QUERY_CACHE');
    clearMediaToken();
    try {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('recitation_') || key.startsWith('exam_answers_') || key.startsWith('exam_active_')) {
          localStorage.removeItem(key);
        }
      });
    } catch (_) {}

    if (backupToken) {
      localStorage.setItem('wathba_token', backupToken);
      sessionStorage.removeItem('wathba_teacher_backup_token');
      sessionStorage.removeItem('wathba_teacher_backup_user');
      sessionStorage.removeItem('wathba_sim_return_path');

      try {
        const res = await api.get('/auth/me');
        const teacherUser = res.data;
        localStorage.setItem('wathba_user', JSON.stringify(pickStorable(teacherUser)));
        if (teacherUser.teacher_slug) localStorage.setItem('wathba_teacher_slug', teacherUser.teacher_slug);
        setUser(teacherUser);
      } catch (e) {
        console.warn('[auth] Could not restore teacher profile on exit simulation:', e);
      }

      const targetUrl = (returnPath.startsWith('/teacher') || returnPath.startsWith('/assistant'))
        ? returnPath
        : '/teacher';
      navigate(targetUrl, { replace: true });
    } else {
      logout();
    }
  };

  const isLock = suspendedNotice?.icon === '🔒';

  return (
    <AuthContext.Provider value={{
      user, login, logout, loading, updateUser,
      suspendedNotice, dismissSuspendedNotice,
      isSimulating, startSimulation, switchSimulatedStage, resetSimulationProgress, exitSimulation
    }}>
      {children}
      {suspendedNotice && (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.7)',
            backdropFilter: 'blur(4px)',
            direction: 'rtl',
            fontFamily: "'Tajawal', sans-serif",
          }}
        >
          <div style={{
            background: '#fff', borderRadius: 16, padding: '32px 28px',
            maxWidth: 420, width: '92%', boxShadow: '0 25px 50px -12px rgba(0,0,0,.35)',
            textAlign: 'center', borderTop: `6px solid ${isLock ? '#DC2626' : '#D97706'}`,
          }}>
            <div style={{
              width: 64, height: 64, margin: '0 auto 16px',
              borderRadius: '50%', background: isLock ? '#FEE2E2' : '#FEF3C7',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 32,
            }}>{suspendedNotice.icon || '🔒'}</div>
            <h2 style={{ margin: '0 0 12px', fontSize: 22, fontWeight: 800, color: isLock ? '#991B1B' : '#B45309' }}>
              {suspendedNotice.title || 'تم إيقاف حسابك'}
            </h2>
            <p style={{ margin: '0 0 8px', fontSize: 15, color: '#475569', lineHeight: 1.7 }}>
              {suspendedNotice.message}
            </p>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: '#94A3B8' }}>
              سيتم تحويلك لصفحة الدخول خلال ثوانٍ...
            </p>
            <button
              onClick={dismissSuspendedNotice}
              style={{
                background: isLock ? '#DC2626' : '#D97706', color: '#fff', border: 'none',
                borderRadius: 10, padding: '10px 24px', fontSize: 15,
                fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              حسناً
            </button>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
