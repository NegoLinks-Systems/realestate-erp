import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Loader2 } from 'lucide-react';

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return <Loader2 className={`animate-spin text-[var(--accent-primary)] ${className}`} />;
}

export function PageSpinner() {
  return (
    <div className="flex h-full min-h-40 items-center justify-center">
      <Spinner className="h-6 w-6" />
    </div>
  );
}

export function Badge({ children, tone = 'zinc' }: { children: ReactNode; tone?: 'zinc' | 'brand' | 'green' | 'red' | 'amber' }) {
  const tones = {
    zinc: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
    brand: 'bg-brand/10 text-brand',
    green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    red: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  } as const;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-xs ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function EmptyState({ title, hint, icon: Icon }: { title: string; hint?: string; icon?: LucideIcon }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 px-6 py-10 text-center dark:border-[#1C1C34]">
      {Icon && (
        <Icon className="mx-auto mb-3 h-12 w-12" style={{ color: 'var(--accent-primary)', opacity: 0.4 }} />
      )}
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="mt-1 text-sm text-zinc-500">{hint}</p>}
    </div>
  );
}

export function Toast({ message, tone }: { message: string; tone: 'ok' | 'err' }) {
  return (
    <div
      className={`fixed bottom-4 right-4 z-50 rounded-md px-4 py-2.5 text-sm text-white shadow-lg ${
        tone === 'ok' ? 'bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900' : 'bg-red-600'
      }`}
    >
      {message}
    </div>
  );
}
