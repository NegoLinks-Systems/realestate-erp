import { NavLink } from 'react-router-dom';
import { useBranding } from '../../providers/BrandingProvider';
import { usePermissions } from '../../hooks/usePermissions';
import { useAuth } from '../../hooks/useAuth';
import { NAV_ITEMS } from './nav';

export function Sidebar({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { organizationName, applicationName, logoUrl } = useBranding();
  const { user } = useAuth();
  const perms = usePermissions(user?.id);

  const items = NAV_ITEMS.filter((i) => {
    if (i.roles && !i.roles.some((r) => perms.roles.includes(r))) return false;
    if (i.hideForRoles && !perms.isAdmin && i.hideForRoles.some((r) => perms.roles.includes(r))
        && perms.roles.every((r) => i.hideForRoles!.includes(r) || r === 'tenant' || r === 'landlord' || r === 'property_owner')) return false;
    if (i.module && !perms.can(i.module, 'view')) return false;
    return true;
  });

  return (
    <nav className="flex h-full flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-3 px-4 py-4">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="h-8 w-8 rounded object-contain" />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded bg-brand font-display text-sm font-bold text-white">
            {organizationName.charAt(0)}
          </div>
        )}
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-semibold leading-tight">{applicationName}</p>
            <p className="truncate text-[11px] uppercase tracking-widest text-zinc-500">{organizationName}</p>
          </div>
        )}
      </div>
      <ul className="mt-2 flex-1 space-y-0.5 px-2">
        {items.map((item) => (
          <li key={item.path}>
            <NavLink
              to={item.path}
              end={item.path === '/'}
              onClick={onNavigate}
              className={({ isActive }) =>
                `nav-tick flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50'
                    : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100'
                }`
              }
            >
              {({ isActive }) => (
                <span data-active={isActive} className="nav-tick flex items-center gap-3 pl-1.5">
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && item.label}
                </span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
      {!collapsed && (
        <p className="px-4 py-3 text-[11px] text-zinc-400">
          More modules appear here as they ship.
        </p>
      )}
    </nav>
  );
}
