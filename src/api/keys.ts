/**
 * React Query key factories — one per feature, per CLAUDE.md.
 * Every hook must build keys from these; never inline arrays.
 */
export const orgKeys = {
  all: ['org'] as const,
  settings: () => [...orgKeys.all, 'settings'] as const,
};

export const authKeys = {
  all: ['auth'] as const,
  roles: (userId: string) => [...authKeys.all, 'roles', userId] as const,
  permissions: (userId: string) => [...authKeys.all, 'permissions', userId] as const,
};

export const branchKeys = {
  all: ['branches'] as const,
  list: () => [...branchKeys.all, 'list'] as const,
  detail: (id: string) => [...branchKeys.all, 'detail', id] as const,
};

export const propertyKeys = {
  all: ['properties'] as const,
  list: (filters?: Record<string, unknown>) => [...propertyKeys.all, 'list', filters ?? {}] as const,
  detail: (id: string) => [...propertyKeys.all, 'detail', id] as const,
  stats: () => [...propertyKeys.all, 'stats'] as const,
  structure: (id: string) => [...propertyKeys.all, 'structure', id] as const,
  photos: (id: string) => [...propertyKeys.all, 'photos', id] as const,
  documents: (id: string) => [...propertyKeys.all, 'documents', id] as const,
  managers: (id: string) => [...propertyKeys.all, 'managers', id] as const,
  parcels: (id: string) => [...propertyKeys.all, 'parcels', id] as const,
};

export const unitKeys = {
  all: ['units'] as const,
  list: (propertyId: string) => [...unitKeys.all, 'list', propertyId] as const,
  detail: (id: string) => [...unitKeys.all, 'detail', id] as const,
};

export const tenantKeys = {
  all: ['tenants'] as const,
  list: (filters?: Record<string, unknown>) => [...tenantKeys.all, 'list', filters ?? {}] as const,
  detail: (id: string) => [...tenantKeys.all, 'detail', id] as const,
  documents: (id: string) => [...tenantKeys.all, 'documents', id] as const,
  complaints: (id: string) => [...tenantKeys.all, 'complaints', id] as const,
  notices: (id: string) => [...tenantKeys.all, 'notices', id] as const,
  leases: (id: string) => [...tenantKeys.all, 'leases', id] as const,
};

export const landlordKeys = {
  all: ['landlords'] as const,
  list: () => [...landlordKeys.all, 'list'] as const,
  detail: (id: string) => [...landlordKeys.all, 'detail', id] as const,
  ownership: (id: string) => [...landlordKeys.all, 'ownership', id] as const,
  statements: (id: string) => [...landlordKeys.all, 'statements', id] as const,
};

export const leaseKeys = {
  all: ['leases'] as const,
  list: (filters?: Record<string, unknown>) => [...leaseKeys.all, 'list', filters ?? {}] as const,
  detail: (id: string) => [...leaseKeys.all, 'detail', id] as const,
  expiring: (days: number) => [...leaseKeys.all, 'expiring', days] as const,
};

export const financeKeys = {
  all: ['finance'] as const,
  dashboard: () => [...financeKeys.all, 'dashboard'] as const,
  invoices: (filters?: Record<string, unknown>) => [...financeKeys.all, 'invoices', filters ?? {}] as const,
  invoice: (id: string) => [...financeKeys.all, 'invoice', id] as const,
  payments: (filters?: Record<string, unknown>) => [...financeKeys.all, 'payments', filters ?? {}] as const,
  expenses: (filters?: Record<string, unknown>) => [...financeKeys.all, 'expenses', filters ?? {}] as const,
  penaltyRules: () => [...financeKeys.all, 'penalty-rules'] as const,
  statements: (landlordId?: string) => [...financeKeys.all, 'statements', landlordId ?? 'all'] as const,
};

export const notificationKeys = {
  all: ['notifications'] as const,
  unread: () => [...notificationKeys.all, 'unread'] as const,
};

export const portalKeys = {
  all: ['portal'] as const,
  lease: () => [...portalKeys.all, 'lease'] as const,
  documents: () => [...portalKeys.all, 'documents'] as const,
  complaints: () => [...portalKeys.all, 'complaints'] as const,
  notices: () => [...portalKeys.all, 'notices'] as const,
};

export const leaseDetailKeys = {
  deposits: (leaseId: string) => ['lease-deposits', leaseId] as const,
};

export const maintenanceKeys = {
  all: ['maintenance'] as const,
  requests: (filters?: Record<string, unknown>) => [...maintenanceKeys.all, 'requests', filters ?? {}] as const,
  request: (id: string) => [...maintenanceKeys.all, 'request', id] as const,
  workOrders: (filters?: Record<string, unknown>) => [...maintenanceKeys.all, 'work-orders', filters ?? {}] as const,
  workOrder: (id: string) => [...maintenanceKeys.all, 'work-order', id] as const,
  contractors: () => [...maintenanceKeys.all, 'contractors'] as const,
};

export const facilityKeys = {
  all: ['facility'] as const,
  assets: (filters?: Record<string, unknown>) => [...facilityKeys.all, 'assets', filters ?? {}] as const,
  asset: (id: string) => [...facilityKeys.all, 'asset', id] as const,
  serviceHistory: (assetId: string) => [...facilityKeys.all, 'service-history', assetId] as const,
  schedules: () => [...facilityKeys.all, 'schedules'] as const,
  scheduleLogs: (scheduleId: string) => [...facilityKeys.all, 'schedule-logs', scheduleId] as const,
  inspections: (filters?: Record<string, unknown>) => [...facilityKeys.all, 'inspections', filters ?? {}] as const,
  inspection: (id: string) => [...facilityKeys.all, 'inspection', id] as const,
};

export const visitorKeys = {
  all: ['visitors'] as const,
  passes: (filters?: Record<string, unknown>) => [...visitorKeys.all, 'passes', filters ?? {}] as const,
  pass: (id: string) => [...visitorKeys.all, 'pass', id] as const,
  logs: (passId: string) => [...visitorKeys.all, 'logs', passId] as const,
};

export const parkingKeys = {
  all: ['parking'] as const,
  zones: () => [...parkingKeys.all, 'zones'] as const,
  spaces: (zoneId?: string) => [...parkingKeys.all, 'spaces', zoneId ?? 'all'] as const,
  allocations: () => [...parkingKeys.all, 'allocations'] as const,
  vehicles: () => [...parkingKeys.all, 'vehicles'] as const,
};

export const procurementKeys = {
  all: ['procurement'] as const,
  vendors: () => [...procurementKeys.all, 'vendors'] as const,
  items: () => [...procurementKeys.all, 'items'] as const,
  warehouses: () => [...procurementKeys.all, 'warehouses'] as const,
  stock: () => [...procurementKeys.all, 'stock'] as const,
  requisitions: (filters?: Record<string, unknown>) => [...procurementKeys.all, 'requisitions', filters ?? {}] as const,
  requisition: (id: string) => [...procurementKeys.all, 'requisition', id] as const,
  purchaseOrders: (filters?: Record<string, unknown>) => [...procurementKeys.all, 'pos', filters ?? {}] as const,
  purchaseOrder: (id: string) => [...procurementKeys.all, 'po', id] as const,
  lowStock: () => [...procurementKeys.all, 'low-stock'] as const,
};
