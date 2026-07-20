import { useState, useRef, useEffect } from 'react';
import { Download, FileSpreadsheet, FileText, ChevronDown } from 'lucide-react';
import { exportCSV, exportXLSX } from '../../lib/export';

type Row = Record<string, string | number | null | undefined>;

/** Export button with CSV / Excel options. Pass the already-loaded rows. */
export function ExportMenu({ rows, filename, sheetName, disabled }: {
  rows: Row[]; filename: string; sheetName?: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const isEmpty = disabled || rows.length === 0;
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)} disabled={isEmpty}
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-[#1C1C34] dark:hover:bg-white/5"
      >
        <Download className="h-4 w-4" /> Export <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-[#1C1C34] dark:bg-[#131325]">
          <button onClick={() => { exportCSV(rows, filename); setOpen(false); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-white/5">
            <FileText className="h-4 w-4 text-zinc-400" /> CSV (.csv)
          </button>
          <button onClick={async () => { await exportXLSX(rows, filename, sheetName); setOpen(false); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-white/5">
            <FileSpreadsheet className="h-4 w-4 text-zinc-400" /> Excel (.xlsx)
          </button>
        </div>
      )}
    </div>
  );
}
