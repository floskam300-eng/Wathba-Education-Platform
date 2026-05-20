import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

export const AuthContext = createContext(null);

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
          localStorage.setItem('wathba_user', JSON.stringify(userData));
        } catch (err) {
          // Token invalid/expired — api interceptor handles cleanup & redirect
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

  const login = async (username, password, role) => {
    const body = role ? { username, password, role } : { username, password };
    const res = await api.post('/auth/login', body);
    const { token, user } = res.data;
    localStorage.setItem('wathba_token', token);
    localStorage.setItem('wathba_user', JSON.stringify(user));
    setUser(user);
    return user;
  };

  const logout = () => {
    localStorage.removeItem('wathba_token');
    localStorage.removeItem('wathba_user');
    setUser(null);
  };

  const updateUser = (updates) => {
    const updated = { ...user, ...updates };
    localStorage.setItem('wathba_user', JSON.stringify(updated));
    setUser(updated);
    // Background re-fetch to ensure data stays in sync with server
    api.get('/auth/me').then(res => {
      const fresh = res.data;
      localStorage.setItem('wathba_user', JSON.stringify(fresh));
      setUser(fresh);
    }).catch(() => {});
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
