import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu, PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { CommandPalette } from './CommandPalette';
import { NotificationCenter } from './NotificationCenter';
import { ProfileMenu } from './ProfileMenu';

export function AppShell() {
  const [collapsed, setCollapsed] = useState(() => window.localStorage.getItem('erp-sidebar') === '1');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    window.localStorage.setItem('erp-sidebar', collapsed ? '1' : '0');
  }, [collapsed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-full">
      {/* desktop sidebar */}
      <aside className={`hidden md:block ${collapsed ? 'w-16' : 'w-60'} shrink-0 transition-all`}>
        <Sidebar collapsed={collapsed} />
      </aside>

      {/* mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64">
            <Sidebar collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
          <button
            className="rounded-md p-2 hover:bg-zinc-100 md:hidden dark:hover:bg-zinc-800"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-4.5 w-4.5" />
          </button>
          <button
            className="hidden rounded-md p-2 hover:bg-zinc-100 md:block dark:hover:bg-zinc-800"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen className="h-4.5 w-4.5" /> : <PanelLeftClose className="h-4.5 w-4.5" />}
          </button>

          <button
            onClick={() => setPaletteOpen(true)}
            className="ml-1 flex flex-1 max-w-md items-center gap-2 rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-400 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search pages…</span>
            <kbd className="ml-auto rounded border border-zinc-300 px-1.5 font-mono text-[10px] dark:border-zinc-700">⌘K</kbd>
          </button>

          <div className="ml-auto flex items-center gap-1">
            <NotificationCenter />
            <ProfileMenu />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
