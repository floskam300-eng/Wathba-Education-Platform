import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('wathba_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      // Don't redirect if student is actively taking an exam
      // (any exam_start_ key in localStorage means an exam is in progress)
      const isInExam = Object.keys(localStorage).some(k => k.startsWith('exam_start_'));
      if (isInExam) return Promise.reject(err);

      localStorage.removeItem('wathba_token');
      localStorage.removeItem('wathba_user');
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;
