import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import type { Module } from '../../lib/modules';

const TABS: { label: string; to: string; end?: boolean; module: Module }[] = [
  { label: 'Organization', to: '/settings', end: true, module: 'settings' },
  { label: 'Branding & theme', to: '/settings/branding', module: 'settings' },
  { label: 'Domain & deployment', to: '/settings/domain', module: 'settings' },
  { label: 'AI assistant', to: '/settings/ai', module: 'settings' },
  { label: 'Branches', to: '/settings/branches', module: 'branches' },
  { label: 'Users & roles', to: '/settings/users', module: 'users' },
  { label: 'Activity log', to: '/settings/activity', module: 'audit' },
];

export default function SettingsLayout() {
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const tabs = TABS.filter((t) => perms.can(t.module, 'view') || perms.can(t.module, 'update'));

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <h1 className="font-display text-xl font-semibold">Settings</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Everything here rebrands the whole application — pages, documents, and emails read these values.
      </p>
      <div className="mt-4 flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
                isActive
                  ? 'border-brand text-brand'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </div>
      <div className="py-5">
        <Outlet />
      </div>
    </div>
  );
}
