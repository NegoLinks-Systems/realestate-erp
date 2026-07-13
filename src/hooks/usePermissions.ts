/**
 * Client-side permission mirror. The database RLS is the real
 * enforcement; this hook exists so the UI can hide what a user
 * cannot do (navigation filtering, disabled buttons).
 *
 * Loads the user's roles + the permission matrix once, computes a
 * Set of "module:action" strings, and exposes can().
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Action, Module } from '../lib/modules';
import type { AppRole } from '../lib/database.types';
import { authKeys } from '../api/keys';

export interface Permissions {
  roles: AppRole[];
  isAdmin: boolean;
  can: (module: Module, action: Action) => boolean;
  isLoading: boolean;
}

const NO_PERMISSIONS: Omit<Permissions, 'isLoading'> = {
  roles: [],
  isAdmin: false,
  can: () => false,
};

async function loadPermissions(userId: string) {
  const { data: roleRows, error: rolesError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .is('deleted_at', null);
  if (rolesError) throw new Error(rolesError.message);

  const roles = (roleRows ?? []).map((r) => r.role);
  if (roles.length === 0) return { roles, granted: new Set<string>() };

  const { data: permRows, error: permsError } = await supabase
    .from('role_permissions')
    .select('module, action')
    .in('role', roles)
    .eq('allowed', true);
  if (permsError) throw new Error(permsError.message);

  const granted = new Set((permRows ?? []).map((p) => `${p.module}:${p.action}`));
  return { roles, granted };
}

export function usePermissions(userId: string | undefined): Permissions {
  const query = useQuery({
    queryKey: authKeys.permissions(userId ?? 'anonymous'),
    queryFn: () => loadPermissions(userId as string),
    enabled: Boolean(userId),
    staleTime: 5 * 60 * 1000,
  });

  if (!userId || !query.data) {
    return { ...NO_PERMISSIONS, isLoading: query.isLoading };
  }

  const { roles, granted } = query.data;
  const isAdmin = roles.includes('super_admin') || roles.includes('company_owner');

  return {
    roles,
    isAdmin,
    can: (module, action) => isAdmin || granted.has(`${module}:${action}`),
    isLoading: false,
  };
}
