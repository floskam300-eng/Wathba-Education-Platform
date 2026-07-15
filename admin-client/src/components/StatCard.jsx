import React from 'react';

export default function StatCard({ title, value, icon: Icon, description, trendColor = 'text-amber-500' }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg backdrop-blur-md transition hover:border-slate-700">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-400 font-cairo">{title}</p>
          <p className="mt-2 text-3xl font-bold text-white tracking-tight">{value}</p>
        </div>
        <div className="rounded-lg bg-slate-800 p-3 text-amber-500">
          <Icon size={24} />
        </div>
      </div>
      {description && (
        <p className={`mt-4 text-xs font-cairo ${trendColor}`}>
          {description}
        </p>
      )}
    </div>
  );
}
