import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, FileText, TrendingUp } from 'lucide-react';
import StatCard from '../../components/ui/StatCard';
import api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

export default function AssistantDashboard() {
  const { user } = useAuth();

  const canViewStudents = user?.can_view_analytics || user?.can_add_students || user?.can_edit_students || user?.can_delete_students;
  const canViewExams = user?.can_manage_exams || user?.can_view_analytics;

  const { data: students = [] } = useQuery({
    queryKey: ['students'],
    queryFn: () => api.get('/students').then(r => r.data.students || r.data || []),
    enabled: !!canViewStudents,
  });

  const { data: exams = [] } = useQuery({
    queryKey: ['exams'],
    queryFn: () => api.get('/exams').then(r => r.data),
    enabled: !!canViewExams,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-navy-600">لوحة التحكم</h1>
        {/* gray-700 on white = 10:1 ✓ */}
        <p className="text-gray-700 text-sm font-medium mt-1">مرحباً {user?.name}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {canViewStudents && <StatCard icon={Users} label="الطلاب" value={students.length} color="navy" />}
        {canViewExams && <StatCard icon={FileText} label="الاختبارات" value={exams.length} color="orange" />}
      </div>

      {canViewStudents && (
        <div className="card">
          <h2 className="section-title mb-4">
            <TrendingUp className="w-5 h-5 text-orange-500" />
            آخر الطلاب المضافين
          </h2>
          <div className="space-y-3">
            {students.slice(0, 8).map(s => (
              <div key={s.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <div className="w-10 h-10 bg-navy-600 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
                  {s.name?.charAt(0)}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-navy-600 text-sm">{s.name}</p>
                  {/* gray-600 on gray-50 = 5.9:1 ✓ */}
                  <p className="text-xs text-gray-600 font-medium">{s.academic_stage} — {s.phone || 'بلا هاتف'}</p>
                </div>
                {/* orange-700 on white = 7.4:1 ✓ */}
                <span className="text-orange-700 text-sm font-bold">⭐ {s.points}</span>
              </div>
            ))}
            {students.length === 0 && <p className="text-gray-600 font-medium text-center py-6 text-sm">لا يوجد طلاب بعد</p>}
          </div>
        </div>
      )}
    </div>
  );
}
