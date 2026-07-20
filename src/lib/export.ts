/** Report export helpers. CSV is dependency-free; XLSX loads SheetJS on demand. */

type Row = Record<string, string | number | null | undefined>;

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function stamp(name: string) {
  return `${name}-${new Date().toISOString().slice(0, 10)}`;
}

export function exportCSV(rows: Row[], filename: string) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `${stamp(filename)}.csv`);
}

export async function exportXLSX(rows: Row[], filename: string, sheetName = 'Sheet1') {
  if (rows.length === 0) return;
  const XLSX = await import('xlsx'); // lazy — keeps SheetJS out of the initial bundle
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, `${stamp(filename)}.xlsx`);
}
