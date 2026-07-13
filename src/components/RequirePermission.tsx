import type { ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import { usePermissions } from '../hooks/usePermissions';
import type { Action, Module } from '../lib/modules';
import { PageSpinner, EmptyState } from './ui/Bits';

export function RequirePermission({
  module,
  action = 'view',
  children,
}: {
  module: Module;
  action?: Action;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  if (perms.isLoading) return <PageSpinner />;
  if (!perms.can(module, action)) {
    return (
      <div className="p-6">
        <EmptyState
          title="You don't have access to this area"
          hint="Ask an administrator to grant your role the required permission."
        />
      </div>
    );
  }
  return <>{children}</>;
}
