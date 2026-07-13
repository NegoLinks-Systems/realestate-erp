import type { InvoiceStatus } from '../../lib/database.types';
import { Badge } from '../../components/ui/Bits';

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const tone =
    status === 'paid' ? 'green'
    : status === 'partially_paid' ? 'amber'
    : status === 'overdue' ? 'red'
    : status === 'void' ? 'zinc'
    : 'brand';
  return <Badge tone={tone as 'green' | 'amber' | 'red' | 'zinc' | 'brand'}>{status.replace('_', ' ')}</Badge>;
}

export const INVOICE_STATUSES = ['draft', 'issued', 'partially_paid', 'paid', 'overdue', 'void'] as const;
export const PAYMENT_METHODS = ['cash', 'bank_transfer', 'pos', 'cheque', 'online'] as const;
