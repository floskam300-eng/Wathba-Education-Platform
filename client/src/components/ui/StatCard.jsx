import React from 'react';
import clsx from 'clsx';

export default function StatCard({ icon: Icon, label, value, color = 'navy', sub }) {
  const colors = {
    navy: 'bg-navy-500 text-white',
    orange: 'bg-orange-500 text-white',
    green: 'bg-green-600 text-white',
    purple: 'bg-purple-600 text-white',
    red: 'bg-red-600 text-white',
    teal: 'bg-teal-600 text-white',
  };

  return (
    <div className="card flex items-center gap-3 group hover:scale-[1.02] transition-transform duration-200 p-3 sm:p-5">
      <div className={clsx('w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg', colors[color])}>
        <Icon className="w-5 h-5 sm:w-7 sm:h-7" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-gray-600 text-xs sm:text-sm font-semibold leading-tight truncate">{label}</p>
        <p className="text-xl sm:text-2xl font-black text-navy-600 leading-tight">{value}</p>
        {sub && <p className="text-xs text-gray-600 mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
}
