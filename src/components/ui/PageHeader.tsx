import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** Standard module page header (component-library skill §12). */
export function PageHeader({
  title, subtitle, breadcrumb, actions,
}: {
  title: string;
  subtitle?: string;
  breadcrumb?: { label: string; href?: string }[];
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-zinc-200 pb-4 dark:border-[#1C1C34]">
      <div className="min-w-0">
        {breadcrumb && breadcrumb.length > 0 && (
          <nav className="mb-1 flex items-center gap-1.5 text-xs text-zinc-500">
            {breadcrumb.map((b, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {b.href ? <Link to={b.href} className="hover:text-[var(--accent-light)]">{b.label}</Link> : <span>{b.label}</span>}
                {i < breadcrumb.length - 1 && <span className="text-zinc-600">/</span>}
              </span>
            ))}
          </nav>
        )}
        <h1 className="font-display text-2xl font-bold text-zinc-900 dark:text-white">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
