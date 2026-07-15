import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import AdminLayout from './components/Layout/AdminLayout';
import Login from './pages/Login';
import Overview from './pages/Overview';
import TeachersList from './pages/teachers/TeachersList';
import TeacherForm from './pages/teachers/TeacherForm';
import TeacherDetail from './pages/teachers/TeacherDetail';
import PlansList from './pages/plans/PlansList';
import SubscriptionsList from './pages/subscriptions/SubscriptionsList';
import PaymentsList from './pages/payments/PaymentsList';
import { Toaster } from 'react-hot-toast';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route element={<AdminLayout />}>
            <Route path="/" element={<Overview />} />
            <Route path="/teachers" element={<TeachersList />} />
            <Route path="/teachers/new" element={<TeacherForm />} />
            <Route path="/teachers/edit/:id" element={<TeacherForm />} />
            <Route path="/teachers/:id" element={<TeacherDetail />} />
            <Route path="/plans" element={<PlansList />} />
            <Route path="/subscriptions" element={<SubscriptionsList />} />
            <Route path="/payments" element={<PaymentsList />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
        
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#1E293B',
              color: '#F1F5F9',
              border: '1px solid #334155',
              fontFamily: 'Cairo, sans-serif',
              fontSize: '14px',
            },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  );
}
