// One lawyer's view of a case: which applicant they act for, and where their
// own part of the work stands. Used by the lawyer dashboard, the Active Cases
// list and the Archived Cases list so the three always agree.
//
// Per-side stage, in order (every assigned, non-archived case is in exactly
// one, so Total Assigned = Pending + Completed):
//   REVIEW_PENDING             lawyers assigned, legal review not completed
//   ILA_SIGNOFF_PENDING        review completed, this side's ILA / sign-off not done
//   FINAL_CONFIRMATION_PENDING this side signed off, its final confirmation not done
//   COMPLETED                  this side's final confirmation done, or the case completed

import { caseLawyerIds } from '../case-access.util';

export type LawyerSide = 'P1' | 'P2';

export type LawyerStage =
  | 'REVIEW_PENDING'
  | 'ILA_SIGNOFF_PENDING'
  | 'FINAL_CONFIRMATION_PENDING'
  | 'COMPLETED';

export const PENDING_STAGES: LawyerStage[] = [
  'REVIEW_PENDING',
  'ILA_SIGNOFF_PENDING',
  'FINAL_CONFIRMATION_PENDING',
];

const REVIEW_DONE_STATUSES = [
  'LAWYER_REVIEW_COMPLETED',
  'LAWYER_ILA_PENDING',
  'LAWYER_SIGNOFF_COMPLETE',
  'LAWYER_CLIENT_CONFIRMATION',
  'COMPLETED',
  'ARCHIVED',
];

const idOf = (v: any): string =>
  v && typeof v === 'object' ? String(v._id ?? v.id ?? v) : v ? String(v) : '';

/**
 * Which side of the case the lawyer (any of `myIds`) acts for, if any: the
 * solicitor each partner chose, falling back to the older CM assignment.
 */
export function sideFor(c: any, myIds: Set<string>): LawyerSide | null {
  const { p1, p2 } = caseLawyerIds(c);
  if (p1 && myIds.has(p1)) return 'P1';
  if (p2 && myIds.has(p2)) return 'P2';
  return null;
}

/** When this side's solicitor was chosen (or, for older cases, assigned). */
function assignedAt(c: any, side: LawyerSide): Date | null {
  const pq = side === 'P1' ? c.preQuestionnaireUser1 : c.preQuestionnaireUser2;
  return pq?.selectedAt || c.lawyersAssignedAt || null;
}

export function stageFor(c: any, side: LawyerSide): LawyerStage {
  const p = side === 'P1' ? 'p1' : 'p2';
  const finalConfirmed = Boolean(c[side === 'P1' ? 'finalP1Confirmed' : 'finalP2Confirmed']);
  if (['COMPLETED', 'ARCHIVED'].includes(c.workflowStatus) || finalConfirmed) return 'COMPLETED';
  if (c[`${p}LawyerSigned`]) return 'FINAL_CONFIRMATION_PENDING';
  if (c.lawyerReviewCompleted || REVIEW_DONE_STATUSES.includes(c.workflowStatus)) {
    return 'ILA_SIGNOFF_PENDING';
  }
  return 'REVIEW_PENDING';
}

/** When this side entered its current stage (best known moment). */
export function stageEnteredAt(
  c: any,
  side: LawyerSide,
  stage: LawyerStage,
): Date | null {
  const p = side === 'P1' ? 'p1' : 'p2';
  const pick = (...vals: any[]) => {
    const ds = vals.filter(Boolean).map((v) => new Date(v)).filter((d) => !isNaN(+d));
    return ds.length ? new Date(Math.max(...ds.map(Number))) : null;
  };
  switch (stage) {
    case 'REVIEW_PENDING':
      return pick(assignedAt(c, side));
    case 'ILA_SIGNOFF_PENDING':
      return pick(c.lawyerReviewCompletedAt, assignedAt(c, side));
    case 'FINAL_CONFIRMATION_PENDING':
      return pick(c[`${p}LawyerSignedAt`]);
    case 'COMPLETED':
      return pick(
        c[side === 'P1' ? 'finalP1ConfirmedAt' : 'finalP2ConfirmedAt'],
        c.completedAt,
      );
  }
}

const fullName = (u: any) =>
  u && typeof u === 'object'
    ? [u.firstName, u.middleName, u.lastName].filter(Boolean).join(' ').trim() || u.email || ''
    : '';

/** The row the lawyer portal lists for one assignment. */
export function toAssignmentRow(c: any, side: LawyerSide) {
  const stage = stageFor(c, side);
  const client = side === 'P1' ? c.owner : c.invitedUser;
  const other = side === 'P1' ? c.invitedUser : c.owner;
  const entered = stageEnteredAt(c, side, stage);
  const days = entered
    ? Math.max(0, Math.floor((Date.now() - entered.getTime()) / 86_400_000))
    : null;
  return {
    _id: idOf(c._id),
    caseNumber: c.caseNumber || idOf(c._id),
    side,
    stage,
    workflowStatus: c.workflowStatus,
    agreementType: c.agreementType || null,
    priority: String(c.priority || 'MEDIUM').toUpperCase(),
    applicantName: fullName(client) || (side === 'P2' ? c.invitedEmail || '' : ''),
    applicantEmail: (client && client.email) || (side === 'P2' ? c.invitedEmail || '' : ''),
    partnerName: fullName(other) || (side === 'P1' ? c.invitedEmail || '' : ''),
    dateAssigned: assignedAt(c, side),
    stageEnteredAt: entered,
    daysInStage: days,
    completedAt: c.completedAt || null,
    archivedAt: c.archivedAt || null,
  };
}
