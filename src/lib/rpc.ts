/**
 * Typed wrappers around the database functions from migrations
 * 00005–00009. All throw on error so React Query can surface it.
 */
import { supabase } from './supabase';
import type { Json, UnitType } from './database.types';

async function unwrap<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
}

export const rpc = {
  /** Mirror of the server-side permission check (server still enforces). */
  hasPermission: (module: string, action: string) =>
    unwrap(supabase.rpc('has_permission', { p_module: module, p_action: action })),

  /** Append to the audit trail. Call after every financial/property mutation. */
  logActivity: (args: {
    module: string; action: string; entityType: string;
    entityId: string; before?: Json; after?: Json;
  }) =>
    unwrap(supabase.rpc('log_activity', {
      p_module: args.module, p_action: args.action,
      p_entity_type: args.entityType, p_entity_id: args.entityId,
      p_before: args.before, p_after: args.after,
    })),

  /** Executive dashboard numbers, scoped to what the caller can see. */
  portfolioStats: async () => {
    const rows = await unwrap(supabase.rpc('portfolio_stats'));
    return rows[0] ?? {
      total_properties: 0, total_units: 0,
      occupied_units: 0, vacant_units: 0, occupancy_rate: 0,
    };
  },

  /** Bulk-create pattern-named units on a floor (A-101…A-1NN). */
  generateUnits: (args: {
    floorId: string; prefix: string; count: number; unitType: UnitType;
    baseRent?: number; serviceCharge?: number; bedrooms?: number; seqWidth?: number;
  }) =>
    unwrap(supabase.rpc('generate_units', {
      p_floor_id: args.floorId, p_prefix: args.prefix, p_count: args.count,
      p_unit_type: args.unitType, p_base_rent: args.baseRent,
      p_service_charge: args.serviceCharge, p_bedrooms: args.bedrooms,
      p_seq_width: args.seqWidth,
    })),

  /** Nightly: active→expiring within window, past-end→expired. */
  leaseStatusRefresh: async (windowDays = 90) => {
    const rows = await unwrap(supabase.rpc('lease_status_refresh', { p_window_days: windowDays }));
    return rows[0] ?? { flipped_expiring: 0, flipped_expired: 0 };
  },

  /** Generate due invoices from live leases. Idempotent. */
  billingRun: () => unwrap(supabase.rpc('billing_run')),

  /** Add late-payment penalty lines. Idempotent per (invoice, rule). */
  applyPenalties: () => unwrap(supabase.rpc('apply_penalties')),

  /** Allocate a recorded payment oldest-first across unpaid invoices. */
  allocatePayment: (paymentId: string) =>
    unwrap(supabase.rpc('allocate_payment', { p_payment_id: paymentId })),

  /** Compute (or recompute) a landlord statement for a period. */
  generateLandlordStatement: (landlordId: string, periodStart: string, periodEnd: string) =>
    unwrap(supabase.rpc('generate_landlord_statement', {
      p_landlord_id: landlordId, p_start: periodStart, p_end: periodEnd,
    })),

  /** Gate operation: check a visitor in by QR token. Returns the visit log id. */
  checkInPass: (token: string, note?: string) =>
    unwrap(supabase.rpc('check_in_pass', { p_token: token, p_note: note ?? null })),

  /** Gate operation: check a visitor out by QR token. */
  checkOutPass: (token: string) =>
    unwrap(supabase.rpc('check_out_pass', { p_token: token })),

  /** Bill active tenant parking allocations for the month. Idempotent. Returns count created. */
  parkingBillingRun: () => unwrap<number>(supabase.rpc('parking_billing_run')),


  /** Approve or reject a submitted requisition (SoD: server blocks self-approval). */
  approveRequisition: (id: string, approve: boolean, reason?: string) =>
    unwrap(supabase.rpc('approve_requisition', { p_id: id, p_approve: approve, p_reason: reason ?? null })),

  /** Partial receipt against a PO. p_lines: [{po_line_id, quantity}]. Returns the goods_receipt id. */
  receiveGoods: (poId: string, lines: { po_line_id: string; quantity: number }[], note?: string) =>
    unwrap<string>(supabase.rpc('receive_goods', { p_po_id: poId, p_lines: lines as unknown as Json, p_note: note ?? null })),

  /** Issue stock to a work order (decrements stock, adds a parts cost line). */
  issueStockToWorkOrder: (workOrderId: string, itemId: string, warehouseId: string, quantity: number) =>
    unwrap(supabase.rpc('issue_stock_to_work_order', {
      p_work_order_id: workOrderId, p_item_id: itemId, p_warehouse_id: warehouseId, p_quantity: quantity,
    })),

  /** Items at or below reorder level. */
  lowStockItems: () => unwrap<{ item_id: string; sku: string; name: string; total_quantity: number; reorder_level: number }[]>(
    supabase.rpc('low_stock_items')),


  /** Super-Admin: toggle the org-wide DEMO MODE banner. */
  setDemoMode: (on: boolean) => unwrap(supabase.rpc('set_demo_mode', { p_on: on })),

  /** Super-Admin: generate interconnected demo data across core modules. */
  loadDemoData: (scenario: string) =>
    unwrap(supabase.rpc('load_demo_data', { p_scenario: scenario })) as Promise<{
      scenario: string; properties: number; units: number; active_leases: number; invoices: number; payments: number; branches: number;
    }>,

  /** Super-Admin: remove all demo data and clear demo mode. */
  deleteDemoData: () => unwrap(supabase.rpc('delete_demo_data')),

};
