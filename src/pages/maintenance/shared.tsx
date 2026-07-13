import type { MaintenanceCategory, RequestPriority, RequestStatus, WorkOrderStatus } from '../../lib/database.types';
import { Badge } from '../../components/ui/Bits';

export const CATEGORIES: MaintenanceCategory[] = ['plumbing', 'electrical', 'hvac', 'structural', 'cleaning', 'security', 'other'];
export const PRIORITIES: RequestPriority[] = ['low', 'medium', 'high', 'urgent'];
export const WORK_ORDER_STATUSES: WorkOrderStatus[] = ['open', 'in_progress', 'on_hold', 'completed', 'verified', 'cancelled'];

export function PriorityBadge({ priority }: { priority: RequestPriority }) {
  const tone = priority === 'urgent' ? 'red' : priority === 'high' ? 'amber' : priority === 'medium' ? 'brand' : 'zinc';
  return <Badge tone={tone as 'red' | 'amber' | 'brand' | 'zinc'}>{priority}</Badge>;
}

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  const tone = status === 'new' ? 'amber' : status === 'acknowledged' ? 'brand' : status === 'converted' ? 'green' : 'zinc';
  return <Badge tone={tone as 'amber' | 'brand' | 'green' | 'zinc'}>{status}</Badge>;
}

export function WorkOrderStatusBadge({ status }: { status: WorkOrderStatus }) {
  const tone =
    status === 'open' ? 'amber'
    : status === 'in_progress' ? 'brand'
    : status === 'on_hold' ? 'zinc'
    : status === 'completed' ? 'brand'
    : status === 'verified' ? 'green'
    : 'red';
  return <Badge tone={tone as 'amber' | 'brand' | 'zinc' | 'green' | 'red'}>{status.replace('_', ' ')}</Badge>;
}
