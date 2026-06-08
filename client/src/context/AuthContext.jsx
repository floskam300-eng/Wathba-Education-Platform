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
  const navigate = useNavigate();

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('wathba_token');
      if (token) {
        try {
          const res = await api.get('/auth/me');
          const userData = res.data;
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
    return () => window.removeEventListener('wathba_unauthorized', handleUnauthorized);
  }, [navigate]);

  const login = async (username, password, role, _slug, deviceId) => {
    const body = { username, password };
    if (role) body.role = role;
    if (deviceId) body.device_id = deviceId;
    const res = await api.post('/auth/login', body);
    const { token, user } = res.data;
    localStorage.setItem('wathba_token', token);
    localStorage.setItem('wathba_user', JSON.stringify(pickStorable(user)));
    if (user.teacher_slug) {
      localStorage.setItem('wathba_teacher_slug', user.teacher_slug);
    }
    setUser(user);
    return user;
  };

  const logout = () => {
    localStorage.removeItem('wathba_token');
    localStorage.removeItem('wathba_user');
    clearMediaToken();
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

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
