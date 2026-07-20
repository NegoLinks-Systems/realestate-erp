import type { ReactNode } from 'react';

export function ChartCard({
  title, subtitle, action, children, className = '',
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-zinc-200 bg-white p-5 dark:border-[#1C1C34] dark:bg-[#131325] ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-sm font-semibold text-zinc-900 dark:text-white">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
