/**
 * Permission vocabulary — MUST stay in sync with migration
 * 00004_seed_permissions.sql. Policies check these exact strings.
 */
export const MODULES = [
  'settings', 'branches', 'users', 'permissions', 'audit',
  'properties', 'units', 'landlords', 'tenants', 'leases',
  'finance', 'maintenance', 'facilities', 'visitors', 'parking',
  'procurement', 'inventory', 'crm', 'projects', 'hr',
  'communications', 'reports', 'ai',
] as const;

export const ACTIONS = ['view', 'create', 'update', 'delete', 'approve', 'export'] as const;

export type Module = (typeof MODULES)[number];
export type Action = (typeof ACTIONS)[number];
