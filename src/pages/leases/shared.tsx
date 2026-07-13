import type { LeaseStatus } from '../../lib/database.types';
import { Badge } from '../../components/ui/Bits';

export function LeaseStatusBadge({ status }: { status: LeaseStatus }) {
  const tone =
    status === 'active' ? 'green'
    : status === 'expiring' ? 'amber'
    : status === 'draft' ? 'zinc'
    : status === 'renewed' ? 'brand'
    : 'red';
  return <Badge tone={tone as 'green' | 'amber' | 'zinc' | 'brand' | 'red'}>{status}</Badge>;
}

export const LEASE_STATUSES = ['draft', 'active', 'expiring', 'expired', 'terminated', 'renewed'] as const;
