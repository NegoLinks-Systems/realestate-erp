import type { AssetCategory, AssetStatus, InspectionStatus, OperationType } from '../../lib/database.types';
import { Badge } from '../../components/ui/Bits';

export const ASSET_CATEGORIES: AssetCategory[] = ['generator', 'lift', 'pump', 'hvac', 'electrical', 'plumbing', 'fire_safety', 'other'];
export const ASSET_STATUSES: AssetStatus[] = ['operational', 'faulty', 'under_repair', 'decommissioned', 'disposed'];
export const OPERATION_TYPES: OperationType[] = ['cleaning', 'security', 'waste', 'landscaping', 'other'];

export function AssetStatusBadge({ status }: { status: AssetStatus }) {
  const tone =
    status === 'operational' ? 'green'
    : status === 'faulty' ? 'red'
    : status === 'under_repair' ? 'amber'
    : 'zinc';
  return <Badge tone={tone as 'green' | 'red' | 'amber' | 'zinc'}>{status.replace('_', ' ')}</Badge>;
}

export function InspectionStatusBadge({ status }: { status: InspectionStatus }) {
  const tone = status === 'completed' ? 'green' : status === 'in_progress' ? 'brand' : 'zinc';
  return <Badge tone={tone as 'green' | 'brand' | 'zinc'}>{status.replace('_', ' ')}</Badge>;
}

export function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) return <Badge tone="zinc">not scored</Badge>;
  const tone = score >= 4 ? 'green' : score >= 2.5 ? 'amber' : 'red';
  return <Badge tone={tone as 'green' | 'amber' | 'red'}>{score.toFixed(1)} / 5</Badge>;
}
