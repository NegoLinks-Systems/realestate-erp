/**
 * Zod schemas — the single source of truth for every form.
 * Constraints mirror the database CHECK constraints so validation
 * errors surface in the form, not as opaque 500s.
 */
import { z } from 'zod';

// ---- shared ----
export const uuid = z.string().uuid();
export const money = z.coerce.number().min(0, 'Cannot be negative');
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const rentFrequency = z.enum(['monthly', 'quarterly', 'biannual', 'annual']);

// ---- organization settings ----
export const themeColorsSchema = z.object({
  primary: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex color like #1d4ed8').optional(),
  secondary: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export const organizationSettingsSchema = z.object({
  organization_name: z.string().min(1, 'Organization name is required').max(200),
  product_name: z.string().min(1).max(200),
  application_name: z.string().min(1).max(200),
  address: z.string().max(500).optional().nullable(),
  website: z.string().url('Enter a full URL like https://example.com').optional().or(z.literal('')).nullable(),
  currency: z.string().length(3, 'Use a 3-letter code like NGN'),
  timezone: z.string().min(1),
  date_format: z.string().min(1),
  language: z.string().min(2).max(10),
  theme_colors: themeColorsSchema.optional(),
});
export type OrganizationSettingsInput = z.infer<typeof organizationSettingsSchema>;

// ---- branch ----
export const branchSchema = z.object({
  name: z.string().min(1, 'Branch name is required').max(200),
  code: z.string().max(20).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  country: z.string().min(1).default('Nigeria'),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email().optional().or(z.literal('')).nullable(),
  is_head_office: z.boolean().default(false),
});
export type BranchInput = z.infer<typeof branchSchema>;

// ---- property ----
export const propertySchema = z.object({
  branch_id: uuid,
  name: z.string().min(1, 'Property name is required').max(200),
  property_type: z.enum([
    'residential', 'commercial', 'mixed_use', 'mall', 'office_building',
    'estate', 'apartment_block', 'house', 'warehouse', 'land',
  ]),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  country: z.string().default('Nigeria'),
  year_built: z.coerce.number().int().min(1800).max(2200).optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
});
export type PropertyInput = z.infer<typeof propertySchema>;

// ---- unit ----
export const unitSchema = z.object({
  property_id: uuid,
  building_id: uuid.optional().nullable(),
  floor_id: uuid.optional().nullable(),
  unit_number: z.string().min(1, 'Unit number is required').max(50),
  unit_type: z.enum([
    'apartment', 'shop', 'office', 'villa', 'parking_space',
    'warehouse_unit', 'house', 'land_plot', 'other',
  ]),
  bedrooms: z.coerce.number().int().min(0).optional().nullable(),
  bathrooms: z.coerce.number().int().min(0).optional().nullable(),
  size_sqm: z.coerce.number().positive('Size must be greater than 0').optional().nullable(),
  base_rent: money,
  rent_frequency: rentFrequency.default('annual'),
  service_charge: money.default(0),
});
export type UnitInput = z.infer<typeof unitSchema>;

// ---- tenant ----
export const tenantSchema = z.object({
  kind: z.enum(['individual', 'corporate']).default('individual'),
  full_name: z.string().min(1, 'Name is required').max(200),
  contact_person: z.string().max(200).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')).nullable(),
  id_type: z.string().max(50).optional().nullable(),
  id_number: z.string().max(100).optional().nullable(),
  employer: z.string().max(200).optional().nullable(),
});
export type TenantInput = z.infer<typeof tenantSchema>;

// ---- lease ----
export const leaseSchema = z
  .object({
    unit_id: uuid,
    tenant_id: uuid,
    start_date: isoDate,
    end_date: isoDate,
    rent_amount: z.coerce.number().min(0),
    rent_frequency: rentFrequency.default('annual'),
    service_charge: money.default(0),
    deposit_amount: money.default(0),
  })
  .refine((v) => v.end_date > v.start_date, {
    message: 'End date must be after the start date',
    path: ['end_date'],
  });
export type LeaseInput = z.infer<typeof leaseSchema>;

// ---- payment ----
export const paymentSchema = z.object({
  tenant_id: uuid,
  property_id: uuid.optional().nullable(),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  method: z.enum(['cash', 'bank_transfer', 'pos', 'cheque', 'online']),
  reference: z.string().max(100).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});
export type PaymentInput = z.infer<typeof paymentSchema>;

// ---- expense ----
export const expenseSchema = z.object({
  property_id: uuid.optional().nullable(),
  category_id: uuid,
  description: z.string().min(1, 'Description is required').max(500),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  incurred_at: isoDate,
  vendor_name: z.string().max(200).optional().nullable(),
});
export type ExpenseInput = z.infer<typeof expenseSchema>;

export const maintenanceRequestSchema = z.object({
  property_id: z.string().uuid('Choose a property'),
  category: z.enum(['plumbing', 'electrical', 'hvac', 'structural', 'cleaning', 'security', 'other']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  title: z.string().min(1, 'Title is required').max(160),
  description: z.string().max(2000).optional().or(z.literal('')),
});
export type MaintenanceRequestInput = z.infer<typeof maintenanceRequestSchema>;
