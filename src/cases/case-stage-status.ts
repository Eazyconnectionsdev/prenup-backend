// Stage 1–3 status structure (Registration and Payment, Primary Applicant,
// Secondary Applicant). One definition shared by the case detail (/stages)
// and anything that filters cases by these statuses.
//
//   Stage                         Stage status          Item statuses
//   1 Registration and Payment    Completed | Pending   Registered        Completed
//                                                       Invited           Pending | Sent | Accepted | Expired
//                                                       Partner Joined    Pending | Completed
//                                                       Payment Completed Pending | Initiated | Failed | Completed | Partially Refunded | Refunded
//   2 Application - Primary       Completed | Pending   10 forms          Pending | In Progress | Completed
//   3 Application - Secondary     Completed | Pending   6 forms           Pending | In Progress | Completed

import { PaymentStatus } from './schemas/case.schema';
import { PartnerInviteStatus } from './schemas/partner_invite.schema';

export const STAGE_STATUSES = ['Pending', 'Completed'] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];

export const INVITE_STATUSES = ['Pending', 'Sent', 'Accepted', 'Expired'] as const;
export type InviteItemStatus = (typeof INVITE_STATUSES)[number];

export const PARTNER_JOINED_STATUSES = ['Pending', 'Completed'] as const;
export type PartnerJoinedStatus = (typeof PARTNER_JOINED_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'Pending',
  'Initiated',
  'Failed',
  'Completed',
  'Partially Refunded',
  'Refunded',
] as const;
export type PaymentItemStatus = (typeof PAYMENT_STATUSES)[number];

export const SECTION_STATUSES = ['Pending', 'In Progress', 'Completed'] as const;
export type SectionItemStatus = (typeof SECTION_STATUSES)[number];

// key = API key; field = where the form is stored in myInformation /
// partnerInformation / jointInformation
type FormDef = { key: string; field: string; label: string };

const PERSONAL_FORMS: FormDef[] = [
  { key: 'personalInformation', field: 'personalInformation', label: 'Personal Information' },
  { key: 'legalDeclaration', field: 'legalDeclaration', label: 'Legal Declaration' },
  { key: 'familyAndDependents', field: 'familyAndDependents', label: 'Family & Dependents' },
  { key: 'assets', field: 'individualAssets', label: 'Assets' },
  { key: 'incomeAndRevenue', field: 'incomeAndRevenue', label: 'Income & Revenue' },
  { key: 'liabilitiesAndDebts', field: 'liabilitiesAndDebts', label: 'Liabilities & Debts' },
];

const JOINT_FORMS: FormDef[] = [
  { key: 'jointAssets', field: 'jointAssets', label: 'Joint Assets' },
  { key: 'jointIncomeAndRevenue', field: 'jointIncomeAndRevenue', label: 'Joint Income & Revenue' },
  { key: 'jointLiabilitiesAndDebts', field: 'jointLiabilitiesAndDebts', label: 'Joint Liabilities & Debts' },
  { key: 'matrimonialAgreement', field: 'matrimonialAgreement', label: 'Matrimonial Agreement & Review' },
];

const toPlain = (v: any) =>
  v && typeof v.toObject === 'function' ? v.toObject() : v;

// A form is saved as a whole, so "has any filled value" means it was saved.
export const hasFormData = (data: any): boolean => {
  const plain = toPlain(data);
  if (!plain || typeof plain !== 'object') return false;
  return Object.values(plain).some((v: any) => {
    if (v === null || v === undefined || v === '') return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.keys(toPlain(v) ?? {}).length > 0;
    return true;
  });
};

export function deriveInviteStatus(c: any, invite: any): InviteItemStatus {
  if (c.invitedUser) return 'Accepted';
  if (invite) {
    switch (invite.status) {
      case PartnerInviteStatus.ACCEPTED:
        return 'Accepted';
      case PartnerInviteStatus.EXPIRED:
        return 'Expired';
      case PartnerInviteStatus.PENDING:
      case PartnerInviteStatus.OPENED:
        // Expiry is only written back when someone opens the link, so check
        // the date here too.
        return invite.expiresAt && new Date(invite.expiresAt) < new Date()
          ? 'Expired'
          : 'Sent';
      // Revoked / removed: no live invite any more, a new one is needed.
      default:
        return 'Pending';
    }
  }
  // Cases from before the partner_invites collection.
  return c.invitedEmail || c.partnerInvited ? 'Sent' : 'Pending';
}

export function derivePaymentStatus(c: any): PaymentItemStatus {
  // Refunded wins over the legacy paymentCompleted flag, which a refund
  // does not clear.
  if (c.paymentStatus === PaymentStatus.REFUNDED) return 'Refunded';
  if (c.paymentStatus === PaymentStatus.PARTIALLY_REFUNDED) return 'Partially Refunded';
  if (c.paymentCompleted || c.paymentStatus === PaymentStatus.COMPLETED) {
    return 'Completed';
  }
  if (c.paymentStatus === PaymentStatus.INITIATED) return 'Initiated';
  if (c.paymentStatus === PaymentStatus.FAILED) return 'Failed';
  return 'Pending';
}

// Pending     = form not saved yet
// In Progress = form saved, but its section has been reopened and is being
//               revised (personal: unlocked by staff; joint: returned by the
//               other partner for changes)
// Completed   = form saved and not under revision
const formStatus = (data: any, reopened: boolean): SectionItemStatus => {
  if (!hasFormData(data)) return 'Pending';
  return reopened ? 'In Progress' : 'Completed';
};

const personalReopened = (s: any): boolean =>
  Boolean(s && !s.locked && s.unlockedAt);

const jointReopened = (s: any): boolean =>
  Boolean(s && !s.locked && !s.submitted && s.submittedBy);

const allCompleted = (items: { status: string }[]): StageStatus =>
  items.every((i) => i.status === 'Completed') ? 'Completed' : 'Pending';

function buildForms(
  forms: FormDef[],
  section: any,
  reopened: boolean,
) {
  const data = toPlain(section) || {};
  return forms.map((f) => ({
    key: f.key,
    label: f.label,
    status: formStatus(
      // Older cases stored individual assets under `assets`.
      f.field === 'individualAssets' && !hasFormData(data.individualAssets)
        ? data.assets
        : data[f.field],
      reopened,
    ),
    possibleStatuses: [...SECTION_STATUSES],
  }));
}

export function buildCaseStageStatus(c: any, invite: any) {
  // ── Stage 1: Registration and Payment ──
  const inviteStatus = deriveInviteStatus(c, invite);
  const partnerJoined: PartnerJoinedStatus = c.invitedUser ? 'Completed' : 'Pending';
  const payment = derivePaymentStatus(c);

  const stage1Items = [
    {
      key: 'registered',
      label: 'Registered',
      status: 'Completed' as const,
      possibleStatuses: ['Completed'],
    },
    {
      key: 'invited',
      label: 'Invited',
      status: inviteStatus,
      possibleStatuses: [...INVITE_STATUSES],
    },
    {
      key: 'partnerJoined',
      label: 'Partner Joined',
      status: partnerJoined,
      possibleStatuses: [...PARTNER_JOINED_STATUSES],
    },
    {
      key: 'paymentCompleted',
      label: 'Payment Completed',
      status: payment,
      possibleStatuses: [...PAYMENT_STATUSES],
    },
  ];

  // ── Stage 2: Application - Primary Applicant (6 personal + 4 joint) ──
  const stage2Sections = [
    ...buildForms(
      PERSONAL_FORMS,
      c.myInformation,
      personalReopened(c.status?.myInformation),
    ),
    ...buildForms(
      JOINT_FORMS,
      c.jointInformation,
      jointReopened(c.status?.jointInformation),
    ),
  ];

  // ── Stage 3: Application - Secondary Applicant (6 personal) ──
  const stage3Sections = buildForms(
    PERSONAL_FORMS,
    c.partnerInformation,
    personalReopened(c.status?.partnerInformation),
  );

  return {
    stage1: {
      id: '1',
      name: 'Registration and Payment',
      // "Invited" ends at Accepted rather than Completed.
      status: (inviteStatus === 'Accepted' &&
      partnerJoined === 'Completed' &&
      // A partial refund still leaves the case paid for.
      (payment === 'Completed' || payment === 'Partially Refunded')
        ? 'Completed'
        : 'Pending') as StageStatus,
      possibleStatuses: [...STAGE_STATUSES],
      items: stage1Items,
    },
    stage2: {
      id: '2',
      name: 'Application - Primary Applicant',
      status: allCompleted(stage2Sections),
      possibleStatuses: [...STAGE_STATUSES],
      submitted: Boolean(c.status?.myInformation?.submitted),
      sections: stage2Sections,
    },
    stage3: {
      id: '3',
      name: 'Application - Secondary Applicant',
      status: allCompleted(stage3Sections),
      possibleStatuses: [...STAGE_STATUSES],
      submitted: Boolean(c.status?.partnerInformation?.submitted),
      sections: stage3Sections,
    },
  };
}
