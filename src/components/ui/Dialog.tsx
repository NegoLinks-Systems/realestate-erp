import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-[#1C1C34] dark:bg-[#131325]">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3.5 dark:border-[#1C1C34]">
          <h3 className="font-display text-sm font-semibold">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-zinc-100 dark:hover:bg-white/5">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
