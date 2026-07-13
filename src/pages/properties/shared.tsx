import type { PropertyType, UnitStatus } from '../../lib/database.types';
import { Badge } from '../../components/ui/Bits';

export const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'mixed_use', label: 'Mixed use' },
  { value: 'mall', label: 'Shopping mall' },
  { value: 'office_building', label: 'Office building' },
  { value: 'estate', label: 'Estate' },
  { value: 'apartment_block', label: 'Apartment block' },
  { value: 'house', label: 'House' },
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'land', label: 'Land' },
];

export const UNIT_TYPES = [
  'apartment', 'shop', 'office', 'villa', 'parking_space', 'warehouse_unit', 'house', 'land_plot', 'other',
] as const;

export function typeLabel(t: PropertyType) {
  return PROPERTY_TYPES.find((p) => p.value === t)?.label ?? t;
}

export function UnitStatusBadge({ status }: { status: UnitStatus }) {
  const tone =
    status === 'available' ? 'green'
    : status === 'occupied' ? 'brand'
    : status === 'reserved' ? 'amber'
    : status === 'maintenance' ? 'red'
    : 'zinc';
  return <Badge tone={tone}>{status}</Badge>;
}

export function PropertyStatusBadge({ status }: { status: string }) {
  const tone = status === 'active' ? 'green' : status === 'under_development' ? 'amber' : 'zinc';
  return <Badge tone={tone as 'green' | 'amber' | 'zinc'}>{status.replace('_', ' ')}</Badge>;
}
