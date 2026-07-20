import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Sparkles, Building2, Users2, UserSquare2, Receipt, DoorOpen, Wrench, CornerDownLeft, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import { PALETTE_ROUTES } from './nav';
import type { Module } from '../../lib/modules';

interface Hit { id: string; label: string; sublabel?: string; path: string; group: string; icon: typeof Building2 }

// Which tables to search, gated by module permission. RLS still governs row access.
const SOURCES: { module: Module; group: string; icon: typeof Building2; run: (q: string) => Promise<Hit[]> }[] = [
  {
    module: 'properties', group: 'Properties', icon: Building2,
    run: async (q) => mapHits(await supabase.from('properties').select('id,name,address').ilike('name', `%${q}%`).is('deleted_at', null).limit(5),
      (r) => ({ id: r.id, label: r.name, sublabel: r.address ?? undefined, path: `/properties/${r.id}`, group: 'Properties', icon: Building2 })),
  },
  {
    module: 'tenants', group: 'Tenants', icon: Users2,
    run: async (q) => mapHits(await supabase.from('tenants').select('id,full_name,phone').ilike('full_name', `%${q}%`).is('deleted_at', null).limit(5),
      (r) => ({ id: r.id, label: r.full_name, sublabel: r.phone ?? undefined, path: `/tenants/${r.id}`, group: 'Tenants', icon: Users2 })),
  },
  {
    module: 'landlords', group: 'Landlords', icon: UserSquare2,
    run: async (q) => mapHits(await supabase.from('landlords').select('id,full_name,phone').ilike('full_name', `%${q}%`).is('deleted_at', null).limit(5),
      (r) => ({ id: r.id, label: r.full_name, sublabel: r.phone ?? undefined, path: `/landlords/${r.id}`, group: 'Landlords', icon: UserSquare2 })),
  },
  {
    module: 'finance', group: 'Invoices', icon: Receipt,
    run: async (q) => mapHits(await supabase.from('invoices').select('id,invoice_number,total').ilike('invoice_number', `%${q}%`).is('deleted_at', null).limit(5),
      (r) => ({ id: r.id, label: r.invoice_number, sublabel: undefined, path: `/finance/invoices/${r.id}`, group: 'Invoices', icon: Receipt })),
  },
  {
    module: 'properties', group: 'Units', icon: DoorOpen,
    run: async (q) => mapHits(await supabase.from('units').select('id,unit_number,property_id').ilike('unit_number', `%${q}%`).is('deleted_at', null).limit(5),
      (r) => ({ id: r.id, label: `Unit ${r.unit_number}`, sublabel: undefined, path: `/properties`, group: 'Units', icon: DoorOpen })),
  },
  {
    module: 'maintenance', group: 'Work orders', icon: Wrench,
    run: async (q) => mapHits(await supabase.from('work_orders').select('id,title').ilike('title', `%${q}%`).is('deleted_at', null).limit(5),
      (r) => ({ id: r.id, label: r.title, sublabel: undefined, path: `/maintenance`, group: 'Work orders', icon: Wrench })),
  },
];

function mapHits<T>(res: { data: T[] | null; error: unknown }, fn: (r: T) => Hit): Hit[] {
  if (res.error || !res.data) return [];
  return res.data.map(fn);
}

export function UniversalSearch({ open, onClose, onAskAI }: { open: boolean; onClose: () => void; onAskAI?: (q: string) => void }) {
  const [query, setQuery] = useState('');
  const [dataHits, setDataHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [index, setIndex] = useState(0);
  const navigate = useNavigate();
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const { isEnabled } = useFeatureFlags();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const aiOn = isEnabled('ai_assistant') && !!onAskAI;

  // page routes (existing behaviour)
  const pageHits: Hit[] = useMemo(() => {
    const allowed = PALETTE_ROUTES.filter((r) => !r.module || perms.can(r.module, 'view'));
    const q = query.trim().toLowerCase();
    const list = q ? allowed.filter((r) => r.label.toLowerCase().includes(q)) : allowed;
    return list.map((r) => ({ id: r.path, label: r.label, path: r.path, group: 'Pages', icon: FileText }));
  }, [query, perms]);

  useEffect(() => { if (open) { setQuery(''); setDataHits([]); setIndex(0); } }, [open]);

  // debounced cross-module data search
  useEffect(() => {
    setIndex(0);
    if (debounce.current) clearTimeout(debounce.current);
    const q = query.trim();
    if (q.length < 2) { setDataHits([]); setLoading(false); return; }
    setLoading(true);
    debounce.current = setTimeout(async () => {
      const sources = SOURCES.filter((s) => perms.can(s.module, 'view') || perms.isAdmin);
      const results = await Promise.all(sources.map((s) => s.run(q).catch(() => [])));
      setDataHits(results.flat());
      setLoading(false);
    }, 220);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [query, perms]);

  const allHits = useMemo(() => [...dataHits, ...pageHits], [dataHits, pageHits]);
  const grouped = useMemo(() => {
    const g = new Map<string, Hit[]>();
    for (const h of allHits) { if (!g.has(h.group)) g.set(h.group, []); g.get(h.group)!.push(h); }
    return [...g.entries()];
  }, [allHits]);

  if (!open) return null;

  const go = (path: string) => { onClose(); navigate(path); };
  const askAI = () => { if (aiOn && query.trim()) { onAskAI!(query.trim()); onClose(); } };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-[#1C1C34] dark:bg-[#131325]">
        <div className="flex items-center gap-2 border-b border-zinc-200 px-4 dark:border-[#1C1C34]">
          <Search className="h-4 w-4 text-zinc-400" />
          <input
            autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, allHits.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
              if (e.key === 'Enter') { if (allHits[index]) go(allHits[index].path); else askAI(); }
              if (e.key === 'Escape') onClose();
            }}
            placeholder="Search properties, tenants, invoices, pages…"
            className="w-full bg-transparent py-3.5 text-sm outline-none placeholder:text-zinc-400 dark:text-white"
          />
          {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-300 border-t-[var(--accent-primary)]" />}
        </div>

        <div className="max-h-[54vh] overflow-y-auto py-2">
          {aiOn && query.trim().length >= 2 && (
            <button onClick={askAI}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-white/5">
              <span className="flex h-7 w-7 items-center justify-center rounded-md" style={{ background: 'var(--accent-glow)', color: 'var(--accent-light)' }}><Sparkles className="h-4 w-4" /></span>
              <span className="flex-1 text-sm">Ask the assistant: <span className="font-medium">“{query.trim()}”</span></span>
              <CornerDownLeft className="h-3.5 w-3.5 text-zinc-400" />
            </button>
          )}

          {allHits.length === 0 && !loading ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-500">
              {query.trim().length < 2 ? 'Type to search across your modules.' : 'No matches found.'}
            </p>
          ) : (
            grouped.map(([group, hits]) => (
              <div key={group} className="mb-1">
                <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{group}</p>
                {hits.map((h) => {
                  const flatIdx = allHits.indexOf(h);
                  const Icon = h.icon;
                  return (
                    <button key={`${group}-${h.id}`} onClick={() => go(h.path)} onMouseEnter={() => setIndex(flatIdx)}
                      className={`flex w-full items-center gap-3 px-4 py-2 text-left ${flatIdx === index ? 'bg-zinc-100 dark:bg-white/5' : ''}`}>
                      <Icon className="h-4 w-4 shrink-0 text-zinc-400" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm dark:text-white">{h.label}</span>
                        {h.sublabel && <span className="block truncate text-xs text-zinc-500">{h.sublabel}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-2 text-[10px] text-zinc-400 dark:border-[#1C1C34]">
          <span>↑↓ navigate · ↵ open · esc close</span>
          {aiOn && <span className="flex items-center gap-1"><Sparkles className="h-3 w-3" /> AI search available</span>}
        </div>
      </div>
    </div>
  );
}
