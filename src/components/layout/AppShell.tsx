import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu, PanelLeftClose, PanelLeftOpen, Search, Sparkles } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { UniversalSearch } from './UniversalSearch';
import { NotificationCenter } from './NotificationCenter';
import { ProfileMenu } from './ProfileMenu';
import { AIPanel } from '../ai/AIPanel';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import { DemoModeBanner } from '../ui/DemoModeBanner';

export function AppShell() {
  const [collapsed, setCollapsed] = useState(() => window.localStorage.getItem('erp-sidebar') === '1');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiSeed, setAiSeed] = useState<string | undefined>(undefined);
  const { isEnabled } = useFeatureFlags();

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
        <header className="flex items-center gap-2 border-b border-zinc-200 bg-white/95 px-3 py-2 backdrop-blur dark:border-[#1C1C34] dark:bg-[#0E0E1C]/95">
          <button
            className="rounded-md p-2 hover:bg-zinc-100 md:hidden dark:hover:bg-white/5"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-4.5 w-4.5" />
          </button>
          <button
            className="hidden rounded-md p-2 hover:bg-zinc-100 md:block dark:hover:bg-white/5"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen className="h-4.5 w-4.5" /> : <PanelLeftClose className="h-4.5 w-4.5" />}
          </button>

          <button
            onClick={() => setPaletteOpen(true)}
            className="ml-1 flex flex-1 max-w-md items-center gap-2 rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-400 hover:border-zinc-300 dark:border-[#1C1C34] dark:hover:border-[var(--accent-border)]"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search pages…</span>
            <kbd className="ml-auto rounded border border-zinc-300 px-1.5 font-mono text-[10px] dark:border-[#1C1C34]">⌘K</kbd>
          </button>

          <div className="ml-auto flex items-center gap-1">
            {isEnabled('ai_assistant') && (
              <button
                onClick={() => setAiOpen(true)}
                className="flex items-center gap-1.5 rounded-lg border border-[#1C1C34] px-2.5 py-1.5 text-sm text-[var(--accent-light)] hover:border-[var(--accent-border)] dark:bg-[#131325]"
                aria-label="Open Executive Assistant"
              >
                <Sparkles className="h-4 w-4" />
                <span className="hidden sm:inline">Assistant</span>
              </button>
            )}
            <NotificationCenter />
            <ProfileMenu />
          </div>
        </header>

        <DemoModeBanner />
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
        <footer className="flex items-center justify-between border-t border-[#1C1C34] px-4 py-2 text-[11px] text-[#5A5A78]">
          <span>Powered by NegoLinks Enterprise Suite</span>
          <span>© {new Date().getFullYear()} Nego Links Systems Ltd.</span>
        </footer>
      </div>

      {isEnabled('ai_assistant') && <AIPanel open={aiOpen} onClose={() => setAiOpen(false)} seed={aiSeed} />}
      <UniversalSearch open={paletteOpen} onClose={() => setPaletteOpen(false)} onAskAI={(q) => { setAiSeed(q); setAiOpen(true); }} />
    </div>
  );
}
