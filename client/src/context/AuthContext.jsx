import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../lib/api';

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

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
  }, []);

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
