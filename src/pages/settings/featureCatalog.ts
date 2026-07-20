export const FEATURE_MODULES: { key: string; label: string; description: string }[] = [
  { key: 'properties', label: 'Properties', description: 'Portfolio, buildings, units and land parcels' },
  { key: 'tenants', label: 'Tenants', description: 'Tenant records and the tenant portal' },
  { key: 'landlords', label: 'Landlords', description: 'Landlords, ownership and statements' },
  { key: 'leases', label: 'Leases', description: 'Tenancies, renewals and terminations' },
  { key: 'finance', label: 'Finance', description: 'Invoicing, payments, expenses and statements' },
  { key: 'maintenance', label: 'Maintenance', description: 'Requests, work orders and contractors' },
  { key: 'facilities', label: 'Facilities', description: 'Assets, operations and inspections' },
  { key: 'visitors', label: 'Visitors', description: 'Visitor passes and gate management' },
  { key: 'parking', label: 'Parking', description: 'Zones, allocations and vehicles' },
  { key: 'procurement', label: 'Procurement', description: 'Requisitions, purchase orders and inventory' },
];

export const FEATURE_TOGGLES: { key: string; label: string; description: string; beta?: boolean }[] = [
  { key: 'ai_assistant', label: 'AI Assistant', description: 'The in-app intelligence assistant', beta: true },
  { key: 'ai_insights', label: 'AI Smart Insights', description: 'AI-authored dashboard insights (data-derived until the AI platform ships)', beta: true },
  { key: 'universal_search', label: 'Universal Search', description: 'Cross-module command palette search' },
  { key: 'demo_data', label: 'Demo Data Manager', description: 'Load and manage demonstration data' },
];
