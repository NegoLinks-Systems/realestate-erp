import { Building2, Car, ClipboardCheck, FileSignature, Home, LayoutDashboard, Package, Receipt, Settings, UserSquare2, Users2, Wallet, Wrench } from 'lucide-react';
import type { Module } from '../../lib/modules';
import type { AppRole } from '../../lib/database.types';

export interface NavItem {
  label: string;
  path: string;
  icon: typeof LayoutDashboard;
  /** module whose 'view' permission gates visibility; undefined = always */
  module?: Module;
  /** if set, item shows ONLY for holders of one of these roles */
  roles?: AppRole[];
  /** if set, item hides for holders of these roles (keeps portals out of staff nav noise) */
  hideForRoles?: AppRole[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard, hideForRoles: ['tenant'] },
  { label: 'My home', path: '/portal', icon: Home, roles: ['tenant'] },
  { label: 'Properties', path: '/properties', icon: Building2, module: 'properties' },
  { label: 'Tenants', path: '/tenants', icon: Users2, module: 'tenants', hideForRoles: ['tenant'] },
  { label: 'Landlords', path: '/landlords', icon: UserSquare2, module: 'landlords', hideForRoles: ['landlord', 'property_owner'] },
  { label: 'Leases', path: '/leases', icon: FileSignature, module: 'leases', hideForRoles: ['tenant'] },
  { label: 'Finance', path: '/finance', icon: Wallet, module: 'finance', hideForRoles: ['tenant', 'landlord', 'property_owner'] },
  { label: 'Maintenance', path: '/maintenance', icon: Wrench, module: 'maintenance', hideForRoles: ['tenant', 'landlord', 'property_owner'] },
  { label: 'Facilities', path: '/facilities', icon: ClipboardCheck, module: 'facilities', hideForRoles: ['tenant', 'landlord', 'property_owner'] },
  { label: 'Visitors', path: '/visitors', icon: Users2, module: 'visitors', hideForRoles: ['tenant', 'landlord', 'property_owner'] },
  { label: 'Parking', path: '/parking', icon: Car, module: 'parking', hideForRoles: ['tenant', 'landlord', 'property_owner'] },
  { label: 'Procurement', path: '/procurement', icon: Package, module: 'procurement', hideForRoles: ['tenant', 'landlord', 'property_owner'] },
  { label: 'My statements', path: '/my-statements', icon: Receipt, roles: ['landlord', 'property_owner'] },
  { label: 'Settings', path: '/settings', icon: Settings, module: 'settings' },
];

export const PALETTE_ROUTES: { label: string; path: string; module?: Module }[] = [
  { label: 'Dashboard', path: '/' },
  { label: 'Properties', path: '/properties', module: 'properties' },
  { label: 'Tenants', path: '/tenants', module: 'tenants' },
  { label: 'Landlords', path: '/landlords', module: 'landlords' },
  { label: 'Leases', path: '/leases', module: 'leases' },
  { label: 'Finance · Overview', path: '/finance', module: 'finance' },
  { label: 'Finance · Invoices', path: '/finance/invoices', module: 'finance' },
  { label: 'Finance · Payments', path: '/finance/payments', module: 'finance' },
  { label: 'Finance · Expenses', path: '/finance/expenses', module: 'finance' },
  { label: 'Finance · Landlord statements', path: '/finance/statements', module: 'finance' },
  { label: 'Finance · Penalty rules', path: '/finance/penalties', module: 'finance' },
  { label: 'Maintenance · Requests', path: '/maintenance', module: 'maintenance' },
  { label: 'Maintenance · Work orders', path: '/maintenance/work-orders', module: 'maintenance' },
  { label: 'Maintenance · Contractors', path: '/maintenance/contractors', module: 'maintenance' },
  { label: 'Facilities · Assets', path: '/facilities', module: 'facilities' },
  { label: 'Facilities · Operations', path: '/facilities/operations', module: 'facilities' },
  { label: 'Facilities · Inspections', path: '/facilities/inspections', module: 'facilities' },
  { label: 'Visitors · Gate & passes', path: '/visitors', module: 'visitors' },
  { label: 'Parking · Zones & allocations', path: '/parking', module: 'parking' },
  { label: 'Procurement · Requisitions', path: '/procurement', module: 'procurement' },
  { label: 'Procurement · Purchase orders', path: '/procurement/orders', module: 'procurement' },
  { label: 'Procurement · Inventory', path: '/procurement/inventory', module: 'procurement' },
  { label: 'Procurement · Vendors', path: '/procurement/vendors', module: 'procurement' },
  { label: 'Settings · Organization', path: '/settings', module: 'settings' },
  { label: 'Settings · Branding & theme', path: '/settings/branding', module: 'settings' },
  { label: 'Settings · Domain & deployment', path: '/settings/domain', module: 'settings' },
  { label: 'Settings · AI assistant', path: '/settings/ai', module: 'settings' },
  { label: 'Settings · Branches', path: '/settings/branches', module: 'branches' },
  { label: 'Settings · Users & roles', path: '/settings/users', module: 'users' },
  { label: 'Settings · Activity log', path: '/settings/activity', module: 'audit' },
];
