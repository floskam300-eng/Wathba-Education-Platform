import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import StatCard from '../components/StatCard';
import { Users, Activity, Radio, Wallet, Clock, AlertTriangle, UserMinus } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Overview() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const res = await api.get('/stats');
      setStats(res.data.stats);
    } catch (err) {
      console.error(err);
      toast.error('فشل تحميل الإحصاءات العامة');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white font-cairo">الرئيسية</h1>
        <p className="text-slate-400 mt-1 font-cairo">إحصاءات منصة وثبة وحالة الخادم الفورية</p>
      </div>

      {stats && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="المدرسين المشتركين"
            value={stats.teachers.total}
            icon={Users}
            description={`النشطين: ${stats.teachers.active} | الموقوفين: ${stats.teachers.suspended}`}
            trendColor={stats.teachers.suspended > 0 ? 'text-red-400' : 'text-slate-400'}
          />
          <StatCard
            title="إجمالي الطلاب بالمنصة"
            value={stats.students.total}
            icon={Users}
            description={`النشطين اليوم: ${stats.students.active_today}`}
            trendColor="text-emerald-400"
          />
          <StatCard
            title="الاتصالات النشطة (SSE)"
            value={stats.sse_connections}
            icon={Radio}
            description="اتصال متزامن حالياً مع الخادم"
            trendColor="text-emerald-400"
          />
          <StatCard
            title="مدفوعات هذا الشهر"
            value={`${stats.payments.collected_this_month} EGP`}
            icon={Wallet}
            description={`تجديدات معلقة: ${stats.payments.pending_renewals}`}
            trendColor="text-amber-500"
          />
        </div>
      )}

      {/* Action required alerts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
          <h3 className="flex items-center gap-2 text-lg font-bold text-white font-cairo">
            <Clock className="text-amber-500" size={20} />
            <span>اشتراكات تنتهي خلال أسبوع</span>
          </h3>
          <p className="mt-2 text-sm text-slate-400 font-cairo">
            المدرسون الذين تنتهي باقاتهم قريباً ويحتاجون للتجديد ومتابعة الدفع
          </p>
          <div className="mt-4 border-t border-slate-800 pt-4 text-sm text-slate-500 font-cairo">
             {stats?.subscriptions?.expiring_soon > 0 ? (
               <div className="text-amber-400 font-semibold">
                 يوجد عدد {stats.subscriptions.expiring_soon} اشتراكات تنتهي في غضون 7 أيام. راجع صفحة الاشتراكات لمزيد من التفاصيل.
               </div>
             ) : (
               <span>لا توجد اشتراكات تنتهي قريباً. كل شيء مضبوط!</span>
             )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
          <h3 className="flex items-center gap-2 text-lg font-bold text-white font-cairo">
            <UserMinus className="text-red-500" size={20} />
            <span>المنصات الموقوفة</span>
          </h3>
          <p className="mt-2 text-sm text-slate-400 font-cairo">
            المدرسون الموقوفون بقرار إداري مؤقت وتم حجب لوحاتهم وطلابهم
          </p>
          <div className="mt-4 border-t border-slate-800 pt-4 text-sm text-slate-500 font-cairo">
             {stats?.teachers?.suspended > 0 ? (
               <div className="text-red-400 font-semibold">
                 يوجد عدد {stats.teachers.suspended} مدرسين معلقين إدارياً بالمنصة.
               </div>
             ) : (
               <span>لا توجد أي منصات موقوفة حالياً.</span>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}
