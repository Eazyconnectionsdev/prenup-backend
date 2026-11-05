// Display labels shared by the history records and the admin reports.

// In workflow order. The report spec names most of these; the rest
// (Pre-Lawyer Completed, Client Confirmation, Sign-off Complete, Archived) are
// shown separately so the totals always add up.
export const WORKFLOW_STATUS_LABELS: Record<string, string> = {
  NOT_PAID: 'Not Paid',
  DRAFT: 'Draft',
  COUPLE_SUBMITTED: 'Couple Submitted',
  CM_APPROVED: 'CM Approved',
  PRE_LAWYER_PENDING: 'Pre-Lawyer Pending',
  PRE_LAWYER_COMPLETED: 'Pre-Lawyer Completed',
  LAWYERS_ASSIGNED: 'Lawyers Assigned',
  LAWYER_CLIENT_CONFIRMATION: 'Lawyer Client Confirmation',
  LAWYER_REVIEW: 'Lawyer Review',
  LAWYER_REVIEW_COMPLETED: 'Lawyer Review Completed',
  LAWYER_ILA_PENDING: 'ILA Pending',
  LAWYER_SIGNOFF_COMPLETE: 'Lawyer Sign-off Complete',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  ARCHIVED: 'Archived',
};

export const WORKFLOW_ORDER = Object.keys(WORKFLOW_STATUS_LABELS);

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  INITIATED: 'Initiated',
  FAILED: 'Failed',
  COMPLETED: 'Completed',
  PARTIALLY_REFUNDED: 'Partially Refunded',
  REFUNDED: 'Refunded',
};

export const workflowLabel = (s?: string | null) =>
  s ? WORKFLOW_STATUS_LABELS[s] || s : '—';

export const paymentLabel = (s?: string | null) =>
  s ? PAYMENT_STATUS_LABELS[s] || s : '—';

// Service Type filter groups. "Help me choose" has no service yet.
export type ServiceGroup = 'PRENUPTIAL' | 'POSTNUPTIAL' | 'COHABITATION' | 'UNDECIDED';

export const SERVICE_GROUP_LABELS: Record<ServiceGroup, string> = {
  PRENUPTIAL: 'Prenuptial',
  POSTNUPTIAL: 'Postnuptial',
  COHABITATION: 'Cohabitation',
  UNDECIDED: 'Not yet chosen',
};

export const SERVICE_GROUP_TYPES: Record<ServiceGroup, (string | null)[]> = {
  PRENUPTIAL: ['prenup-marriage', 'prenup-civil'],
  POSTNUPTIAL: ['postnup-marriage', 'postnup-civil'],
  COHABITATION: ['cohabitation'],
  UNDECIDED: ['help-choose', null],
};

export function serviceGroupOf(agreementType?: string | null): ServiceGroup {
  if (!agreementType) return 'UNDECIDED';
  if (agreementType.startsWith('prenup')) return 'PRENUPTIAL';
  if (agreementType.startsWith('postnup')) return 'POSTNUPTIAL';
  if (agreementType === 'cohabitation') return 'COHABITATION';
  return 'UNDECIDED';
}

export const AGREEMENT_TYPE_LABELS: Record<string, string> = {
  'prenup-marriage': 'Prenuptial Agreement (Marriage)',
  'prenup-civil': 'Prenuptial Agreement (Civil Partnership)',
  'postnup-marriage': 'Postnuptial Agreement (Marriage)',
  'postnup-civil': 'Postnuptial Agreement (Civil Partnership)',
  cohabitation: 'Cohabitation Agreement',
  'help-choose': 'Help me choose',
};
