import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

export function KPICard({
  title, value, trend, trendUp, icon: Icon, loading = false,
}: {
  title: string;
  value: string | number;
  trend?: string;
  trendUp?: boolean;
  icon: LucideIcon;
  loading?: boolean;
}) {
  return (
    <div
      className="rounded-xl border p-5 dark:border-[var(--accent-border)]"
      style={{ background: 'linear-gradient(135deg, #141420, #1A1A28)' }}
    >
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-[#A0A0B8]">{title}</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'var(--accent-glow)', color: 'var(--accent-primary)' }}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p
        className="mt-3 font-display text-[1.75rem] font-bold leading-none tabular-nums"
        style={{ background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-accent))', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
      >
        {loading ? '·' : value}
      </p>
      {trend && !loading && (
        <div className={`mt-2 flex items-center gap-1 text-xs font-medium ${trendUp ? 'text-emerald-400' : 'text-red-400'}`}>
          {trendUp ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
          {trend}
        </div>
      )}
    </div>
  );
}
