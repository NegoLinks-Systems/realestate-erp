import { useState } from 'react';
import { LogOut, Moon, Sun, UserRound } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';
import { usePermissions } from '../../hooks/usePermissions';

export function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const { user, signOut } = useAuth();
  const { dark, toggle } = useTheme();
  const perms = usePermissions(user?.id);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-md p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        aria-label="Account menu"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand/10 text-brand">
          <UserRound className="h-4 w-4" />
        </span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-64 rounded-lg border border-zinc-200 bg-white p-2 shadow-lg dark:border-[#1C1C34] dark:bg-[#131325]">
            <div className="px-3 py-2">
              <p className="truncate text-sm font-medium">{user?.email}</p>
              <p className="mt-0.5 truncate font-mono text-[11px] text-zinc-500">
                {perms.roles.join(', ') || 'no role assigned'}
              </p>
            </div>
            <button
              onClick={toggle}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {dark ? 'Switch to light mode' : 'Switch to dark mode'}
            </button>
            <button
              onClick={() => void signOut()}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
