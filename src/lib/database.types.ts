/**
 * Database types for the Real Estate ERP — hand-written to match
 * migrations 00001–00010 exactly.
 *
 * Once you have a live Supabase project, replace this file with the
 * generated version and diff it against this one as a sanity check:
 *   supabase gen types typescript --linked > src/lib/database.types.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ---- Enums (00001, 00005, 00007, 00009) ----
export type AppRole =
  | 'super_admin' | 'company_owner' | 'regional_manager' | 'branch_manager'
  | 'property_manager' | 'estate_manager' | 'facility_manager'
  | 'leasing_officer' | 'sales_officer' | 'accountant' | 'procurement_officer'
  | 'maintenance_officer' | 'security_officer' | 'receptionist'
  | 'landlord' | 'tenant' | 'property_owner' | 'contractor' | 'vendor' | 'auditor';

export type NotificationType = 'info' | 'warning' | 'action_required' | 'success';
export type PropertyType =
  | 'residential' | 'commercial' | 'mixed_use' | 'mall' | 'office_building'
  | 'estate' | 'apartment_block' | 'house' | 'warehouse' | 'land';
export type UnitType =
  | 'apartment' | 'shop' | 'office' | 'villa' | 'parking_space'
  | 'warehouse_unit' | 'house' | 'land_plot' | 'other';
export type UnitStatus = 'available' | 'reserved' | 'occupied' | 'maintenance' | 'unlisted';
export type PartyKind = 'individual' | 'corporate';
export type LeaseStatus = 'draft' | 'active' | 'expiring' | 'expired' | 'terminated' | 'renewed';
export type RentFrequency = 'monthly' | 'quarterly' | 'biannual' | 'annual';
export type DepositStatus = 'held' | 'partially_refunded' | 'refunded' | 'forfeited';
export type ComplaintStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type InvoiceStatus = 'draft' | 'issued' | 'partially_paid' | 'paid' | 'overdue' | 'void';
export type InvoiceLineType =
  | 'rent' | 'service_charge' | 'utility' | 'penalty' | 'parking' | 'discount' | 'other';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'pos' | 'cheque' | 'online';
export type MaintenanceCategory = 'plumbing' | 'electrical' | 'hvac' | 'structural' | 'cleaning' | 'security' | 'other';
export type RequestPriority = 'low' | 'medium' | 'high' | 'urgent';
export type RequestStatus = 'new' | 'acknowledged' | 'converted' | 'rejected';
export type WorkOrderStatus = 'open' | 'in_progress' | 'on_hold' | 'completed' | 'verified' | 'cancelled';
export type AssetCategory = 'generator' | 'lift' | 'pump' | 'hvac' | 'electrical' | 'plumbing' | 'fire_safety' | 'other';
export type AssetStatus = 'operational' | 'faulty' | 'under_repair' | 'decommissioned' | 'disposed';
export type OperationType = 'cleaning' | 'security' | 'waste' | 'landscaping' | 'other';
export type InspectionStatus = 'draft' | 'in_progress' | 'completed';
export type PassStatus = 'pending' | 'checked_in' | 'checked_out' | 'expired' | 'revoked';
export type SpaceType = 'resident' | 'visitor' | 'reserved';
export type SpaceStatus = 'available' | 'allocated' | 'blocked';
export type RequisitionStatus = 'draft' | 'submitted' | 'approved' | 'rejected';
export type PoStatus = 'draft' | 'issued' | 'partially_received' | 'received' | 'closed' | 'cancelled';
export type MovementType = 'receipt' | 'issue' | 'transfer_in' | 'transfer_out' | 'adjustment';

// ---- Row shapes ----
export type OrganizationSettingsRow = {
  id: string;
  singleton: boolean;
  organization_name: string;
  product_name: string;
  application_name: string;
  logo_url: string | null;
  favicon_url: string | null;
  letterhead_url: string | null;
  stamp_url: string | null;
  signature_url: string | null;
  address: string | null;
  phone_numbers: Json;
  whatsapp_numbers: Json;
  emails: Json;
  website: string | null;
  registration_details: Json;
  tax_info: Json;
  social_links: Json;
  currency: string;
  timezone: string;
  date_format: string;
  language: string;
  theme_colors: Json;
  login_branding: Json;
  domain_settings: Json;
  ai_branding: Json;
  email_template_defaults: Json;
  document_template_defaults: Json;
  created_at: string;
  updated_at: string;
}

export type BranchRow = {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string;
  phone: string | null;
  email: string | null;
  is_head_office: boolean;
  status: 'active' | 'inactive';
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type UserProfileRow = {
  id: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  job_title: string | null;
  status: 'active' | 'suspended' | 'invited';
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type UserRoleRow = {
  id: string;
  user_id: string;
  role: AppRole;
  branch_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type RolePermissionRow = {
  id: string;
  role: AppRole;
  module: string;
  action: string;
  allowed: boolean;
  created_at: string;
  updated_at: string;
}

export type NotificationRow = {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type PropertyRow = {
  id: string;
  branch_id: string;
  name: string;
  code: string | null;
  property_type: PropertyType;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  year_built: number | null;
  description: string | null;
  status: 'active' | 'inactive' | 'under_development' | 'sold';
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type BuildingRow = {
  id: string;
  property_id: string;
  name: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type FloorRow = {
  id: string;
  building_id: string;
  floor_number: number;
  name: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type UnitRow = {
  id: string;
  property_id: string;
  building_id: string | null;
  floor_id: string | null;
  unit_number: string;
  unit_type: UnitType;
  bedrooms: number | null;
  bathrooms: number | null;
  size_sqm: number | null;
  base_rent: number;
  rent_frequency: RentFrequency;
  service_charge: number;
  status: UnitStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type LandlordRow = {
  id: string;
  user_id: string | null;
  kind: PartyKind;
  full_name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  bank_details: Json;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type OwnershipRecordRow = {
  id: string;
  landlord_id: string;
  property_id: string;
  unit_id: string | null;
  ownership_percent: number;
  management_fee_percent: number;
  start_date: string;
  end_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type TenantRow = {
  id: string;
  user_id: string | null;
  kind: PartyKind;
  full_name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  id_type: string | null;
  id_number: string | null;
  employer: string | null;
  emergency_contact: Json;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type LeaseRow = {
  id: string;
  unit_id: string;
  tenant_id: string;
  status: LeaseStatus;
  start_date: string;
  end_date: string;
  rent_amount: number;
  rent_frequency: RentFrequency;
  service_charge: number;
  deposit_amount: number;
  agreement_path: string | null;
  renewed_from: string | null;
  terminated_at: string | null;
  termination_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type InvoiceRow = {
  id: string;
  invoice_number: string;
  lease_id: string | null;
  tenant_id: string;
  unit_id: string | null;
  property_id: string;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string;
  period_start: string | null;
  period_end: string | null;
  total: number;
  amount_paid: number;
  void_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type InvoiceLineRow = {
  id: string;
  invoice_id: string;
  line_type: InvoiceLineType;
  description: string;
  amount: number;
  source_ref: string | null;
  created_at: string;
}

export type PaymentRow = {
  id: string;
  tenant_id: string;
  property_id: string | null;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  received_at: string;
  received_by: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type LandlordStatementRow = {
  id: string;
  landlord_id: string;
  period_start: string;
  period_end: string;
  gross_collected: number;
  management_fee: number;
  expenses_total: number;
  net_due: number;
  breakdown: Json;
  status: 'draft' | 'finalized' | 'disbursed';
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type ExpenseRow = {
  id: string;
  property_id: string | null;
  category_id: string;
  description: string;
  amount: number;
  incurred_at: string;
  vendor_name: string | null;
  receipt_path: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}


export type PropertyPhotoRow = {
  id: string;
  property_id: string;
  unit_id: string | null;
  storage_path: string;
  caption: string | null;
  sort_order: number;
  is_cover: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PropertyDocumentRow = {
  id: string;
  property_id: string;
  unit_id: string | null;
  title: string;
  category: 'title' | 'survey' | 'approval' | 'insurance' | 'valuation' | 'contract' | 'other';
  storage_path: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PropertyManagerRow = {
  id: string;
  property_id: string;
  user_id: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type LandParcelRow = {
  id: string;
  property_id: string;
  parcel_number: string | null;
  title_type: string | null;
  title_number: string | null;
  size_sqm: number | null;
  survey_plan_no: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};


export type TenantDocumentRow = {
  id: string;
  tenant_id: string;
  title: string;
  category: 'id' | 'reference' | 'guarantor' | 'contract' | 'other';
  storage_path: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type SecurityDepositRow = {
  id: string;
  lease_id: string;
  amount: number;
  status: DepositStatus;
  refunded_amount: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ComplaintRow = {
  id: string;
  tenant_id: string;
  property_id: string;
  unit_id: string | null;
  subject: string;
  description: string | null;
  status: ComplaintStatus;
  resolved_at: string | null;
  resolution_note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type NoticeRow = {
  id: string;
  tenant_id: string;
  lease_id: string | null;
  notice_type: 'general' | 'renewal' | 'rent_review' | 'quit' | 'warning' | 'maintenance';
  title: string;
  body: string | null;
  acknowledged_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};


export type PaymentAllocationRow = {
  id: string;
  payment_id: string;
  invoice_id: string;
  amount: number;
  created_at: string;
};

export type PenaltyRuleRow = {
  id: string;
  property_id: string | null;
  name: string;
  grace_days: number;
  percent: number | null;
  flat_amount: number | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ExpenseCategoryRow = {
  id: string;
  name: string;
  created_at: string;
};

export type DisbursementRow = {
  id: string;
  statement_id: string;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  disbursed_at: string;
  disbursed_by: string | null;
  created_at: string;
};

export type MaintenanceRequestRow = {
  id: string;
  property_id: string;
  unit_id: string | null;
  tenant_id: string | null;
  category: MaintenanceCategory;
  priority: RequestPriority;
  title: string;
  description: string | null;
  photos: string[];
  status: RequestStatus;
  rejected_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ContractorRow = {
  id: string;
  user_id: string | null;
  company_name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  trades: string[];
  rating: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type WorkOrderRow = {
  id: string;
  request_id: string | null;
  property_id: string;
  unit_id: string | null;
  title: string;
  description: string | null;
  assigned_user_id: string | null;
  contractor_id: string | null;
  scheduled_date: string | null;
  status: WorkOrderStatus;
  completion_notes: string | null;
  completion_photos: string[];
  completed_at: string | null;
  verified_by: string | null;
  verified_at: string | null;
  total_cost: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type WorkOrderItemRow = {
  id: string;
  work_order_id: string;
  item_type: 'labor' | 'parts' | 'other';
  description: string;
  quantity: number;
  unit_cost: number;
  created_by: string | null;
  created_at: string;
  deleted_at: string | null;
};

export type AssetRow = {
  id: string;
  property_id: string;
  category: AssetCategory;
  name: string;
  serial_number: string | null;
  location_note: string | null;
  purchase_date: string | null;
  purchase_cost: number | null;
  warranty_expiry: string | null;
  status: AssetStatus;
  last_serviced_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type AssetServiceHistoryRow = {
  id: string;
  asset_id: string;
  work_order_id: string;
  serviced_at: string;
  cost: number;
  summary: string | null;
  created_at: string;
};

export type OperationalScheduleRow = {
  id: string;
  property_id: string;
  op_type: OperationType;
  title: string;
  description: string | null;
  frequency: string | null;
  assigned_note: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type OperationalLogRow = {
  id: string;
  schedule_id: string;
  performed_at: string;
  performed_by: string | null;
  notes: string | null;
  photos: string[];
  created_at: string;
  deleted_at: string | null;
};

export type InspectionTemplateRow = {
  id: string;
  name: string;
  description: string | null;
  items: { label: string; category?: string }[];
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type InspectionRow = {
  id: string;
  template_id: string | null;
  property_id: string;
  title: string;
  inspector_id: string | null;
  status: InspectionStatus;
  overall_score: number | null;
  notes: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type InspectionItemRow = {
  id: string;
  inspection_id: string;
  label: string;
  category: string | null;
  score: number | null;
  comment: string | null;
  photos: string[];
  created_at: string;
  deleted_at: string | null;
};

export type VisitorRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  photo_path: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type VisitorPassRow = {
  id: string;
  visitor_id: string;
  host_user_id: string;
  property_id: string;
  unit_id: string | null;
  purpose: string | null;
  valid_from: string;
  valid_to: string;
  qr_token: string;
  status: PassStatus;
  revoked_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type VisitLogRow = {
  id: string;
  pass_id: string;
  checked_in_at: string;
  checked_in_by: string | null;
  checked_out_at: string | null;
  checked_out_by: string | null;
  gate_note: string | null;
  created_at: string;
};

export type VehicleRow = {
  id: string;
  property_id: string;
  tenant_id: string | null;
  owner_name: string;
  plate: string;
  model: string | null;
  color: string | null;
  sticker_no: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ParkingZoneRow = {
  id: string;
  property_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ParkingSpaceRow = {
  id: string;
  zone_id: string;
  space_number: string;
  space_type: SpaceType;
  status: SpaceStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ParkingAllocationRow = {
  id: string;
  space_id: string;
  tenant_id: string | null;
  vehicle_id: string | null;
  monthly_fee: number;
  active: boolean;
  start_date: string;
  end_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type VendorRow = {
  id: string;
  user_id: string | null;
  company_name: string;
  categories: string[];
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  bank_details: Json;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type WarehouseRow = {
  id: string;
  property_id: string | null;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type InventoryItemRow = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  reorder_level: number;
  default_cost: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type StockLevelRow = {
  item_id: string;
  warehouse_id: string;
  quantity: number;
  updated_at: string;
};

export type StockMovementRow = {
  id: string;
  item_id: string;
  warehouse_id: string;
  movement_type: MovementType;
  quantity: number;
  unit_cost: number | null;
  reference_type: string | null;
  reference_id: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

export type PurchaseRequisitionRow = {
  id: string;
  property_id: string | null;
  requested_by: string;
  status: RequisitionStatus;
  notes: string | null;
  decided_by: string | null;
  decided_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type RequisitionLineRow = {
  id: string;
  requisition_id: string;
  item_id: string | null;
  description: string;
  quantity: number;
  est_unit_cost: number;
  created_at: string;
  deleted_at: string | null;
};

export type PurchaseOrderRow = {
  id: string;
  po_number: string;
  vendor_id: string;
  requisition_id: string | null;
  warehouse_id: string;
  property_id: string | null;
  status: PoStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PoLineRow = {
  id: string;
  po_id: string;
  item_id: string | null;
  description: string;
  quantity: number;
  unit_cost: number;
  received_qty: number;
  created_at: string;
  deleted_at: string | null;
};

// ---- Generic table plumbing ----
type Generated = 'id' | 'created_at' | 'updated_at';
type Table<R> = {
  Row: R;
  Insert: Omit<Partial<R>, Generated> & { [K in Exclude<keyof R, Generated>]?: R[K] };
  Update: Partial<R>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      organization_settings: Table<OrganizationSettingsRow>;
      branches: Table<BranchRow>;
      user_profiles: Table<UserProfileRow>;
      user_roles: Table<UserRoleRow>;
      role_permissions: Table<RolePermissionRow>;
      notifications: Table<NotificationRow>;
      properties: Table<PropertyRow>;
      buildings: Table<BuildingRow>;
      floors: Table<FloorRow>;
      units: Table<UnitRow>;
      property_photos: Table<PropertyPhotoRow>;
      property_documents: Table<PropertyDocumentRow>;
      property_managers: Table<PropertyManagerRow>;
      land_parcels: Table<LandParcelRow>;
      landlords: Table<LandlordRow>;
      ownership_records: Table<OwnershipRecordRow>;
      tenants: Table<TenantRow>;
      leases: Table<LeaseRow>;
      tenant_documents: Table<TenantDocumentRow>;
      security_deposits: Table<SecurityDepositRow>;
      complaints: Table<ComplaintRow>;
      notices: Table<NoticeRow>;
      invoices: Table<InvoiceRow>;
      invoice_lines: Table<InvoiceLineRow>;
      payment_allocations: Table<PaymentAllocationRow>;
      penalty_rules: Table<PenaltyRuleRow>;
      expense_categories: Table<ExpenseCategoryRow>;
      disbursements: Table<DisbursementRow>;
      payments: Table<PaymentRow>;
      landlord_statements: Table<LandlordStatementRow>;
      expenses: Table<ExpenseRow>;
      maintenance_requests: Table<MaintenanceRequestRow>;
      contractors: Table<ContractorRow>;
      work_orders: Table<WorkOrderRow>;
      work_order_items: Table<WorkOrderItemRow>;
      assets: Table<AssetRow>;
      asset_service_history: Table<AssetServiceHistoryRow>;
      operational_schedules: Table<OperationalScheduleRow>;
      operational_logs: Table<OperationalLogRow>;
      inspection_templates: Table<InspectionTemplateRow>;
      inspections: Table<InspectionRow>;
      inspection_items: Table<InspectionItemRow>;
      visitors: Table<VisitorRow>;
      visitor_passes: Table<VisitorPassRow>;
      visit_logs: Table<VisitLogRow>;
      vehicles: Table<VehicleRow>;
      parking_zones: Table<ParkingZoneRow>;
      parking_spaces: Table<ParkingSpaceRow>;
      parking_allocations: Table<ParkingAllocationRow>;
      vendors: Table<VendorRow>;
      warehouses: Table<WarehouseRow>;
      inventory_items: Table<InventoryItemRow>;
      stock_levels: Table<StockLevelRow>;
      stock_movements: Table<StockMovementRow>;
      purchase_requisitions: Table<PurchaseRequisitionRow>;
      requisition_lines: Table<RequisitionLineRow>;
      purchase_orders: Table<PurchaseOrderRow>;
      po_lines: Table<PoLineRow>;
    };
    Views: Record<string, never>;
    Functions: {
      has_permission: { Args: { p_module: string; p_action: string }; Returns: boolean };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      log_activity: {
        Args: {
          p_module: string; p_action: string; p_entity_type: string;
          p_entity_id: string; p_before?: Json; p_after?: Json;
        };
        Returns: undefined;
      };
      portfolio_stats: {
        Args: Record<string, never>;
        Returns: {
          total_properties: number; total_units: number;
          occupied_units: number; vacant_units: number; occupancy_rate: number;
        }[];
      };
      generate_units: {
        Args: {
          p_floor_id: string; p_prefix: string; p_count: number;
          p_unit_type: UnitType; p_base_rent?: number; p_service_charge?: number;
          p_bedrooms?: number; p_seq_width?: number;
        };
        Returns: UnitRow[];
      };
      lease_status_refresh: {
        Args: { p_window_days?: number };
        Returns: { flipped_expiring: number; flipped_expired: number }[];
      };
      billing_run: { Args: Record<string, never>; Returns: number };
      apply_penalties: { Args: Record<string, never>; Returns: number };
      allocate_payment: { Args: { p_payment_id: string }; Returns: number };
      generate_landlord_statement: {
        Args: { p_landlord_id: string; p_start: string; p_end: string };
        Returns: string;
      };
      check_in_pass: { Args: { p_token: string; p_note?: string | null }; Returns: string };
      check_out_pass: { Args: { p_token: string }; Returns: undefined };
      parking_billing_run: { Args: Record<string, never>; Returns: number };
      approve_requisition: { Args: { p_id: string; p_approve: boolean; p_reason?: string | null }; Returns: undefined };
      receive_goods: { Args: { p_po_id: string; p_lines: Json; p_note?: string | null }; Returns: string };
      issue_stock_to_work_order: {
        Args: { p_work_order_id: string; p_item_id: string; p_warehouse_id: string; p_quantity: number };
        Returns: undefined;
      };
      low_stock_items: {
        Args: Record<string, never>;
        Returns: { item_id: string; sku: string; name: string; total_quantity: number; reorder_level: number }[];
      };
    };
    Enums: {
      app_role: AppRole;
      notification_type: NotificationType;
      property_type: PropertyType;
      unit_type: UnitType;
      unit_status: UnitStatus;
      party_kind: PartyKind;
      lease_status: LeaseStatus;
      deposit_status: DepositStatus;
      complaint_status: ComplaintStatus;
      invoice_status: InvoiceStatus;
      invoice_line_type: InvoiceLineType;
      payment_method: PaymentMethod;
    };
    CompositeTypes: Record<string, never>;
  };
}
