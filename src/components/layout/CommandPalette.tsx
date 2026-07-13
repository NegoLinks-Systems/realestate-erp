import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { PALETTE_ROUTES } from './nav';

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const navigate = useNavigate();
  const { user } = useAuth();
  const perms = usePermissions(user?.id);

  const results = useMemo(() => {
    const allowed = PALETTE_ROUTES.filter((r) => !r.module || perms.can(r.module, 'view'));
    if (!query.trim()) return allowed;
    const q = query.toLowerCase();
    return allowed.filter((r) => r.label.toLowerCase().includes(q));
  }, [query, perms]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
    }
  }, [open]);

  useEffect(() => setIndex(0), [query]);

  if (!open) return null;

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[15vh]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2 border-b border-zinc-200 px-4 dark:border-zinc-800">
          <Search className="h-4 w-4 text-zinc-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') setIndex((i) => Math.min(i + 1, results.length - 1));
              if (e.key === 'ArrowUp') setIndex((i) => Math.max(i - 1, 0));
              if (e.key === 'Enter' && results[index]) go(results[index].path);
              if (e.key === 'Escape') onClose();
            }}
            placeholder="Go to…"
            className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-zinc-400"
          />
          <kbd className="rounded border border-zinc-300 px-1.5 font-mono text-[10px] text-zinc-500 dark:border-zinc-700">esc</kbd>
        </div>
        <ul className="max-h-72 overflow-y-auto p-2">
          {results.length === 0 && (
            <li className="px-3 py-4 text-sm text-zinc-500">No pages match “{query}”.</li>
          )}
          {results.map((r, i) => (
            <li key={r.path}>
              <button
                onClick={() => go(r.path)}
                onMouseEnter={() => setIndex(i)}
                className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                  i === index ? 'bg-brand/10 text-brand' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                }`}
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
