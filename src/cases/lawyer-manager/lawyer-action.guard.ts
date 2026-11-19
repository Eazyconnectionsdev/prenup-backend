import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { Case, CaseWorkflowStatus } from '../schemas/case.schema';
import { Lawyer } from '../schemas/lawyer.schema';
import { User } from '../../users/schemas/user.schema';
import { LawyerSide, caseLawyerIds, isStaffRole, lawyerSidesFor } from '../case-access.util';

/**
 * Who may take each step of the legal stage, and when.
 *
 * Each partner has their own solicitor, so a step that belongs to one partner
 * (their ILA, their sign-off, their final confirmation) can only be taken by
 * that partner's lawyer. The steps also happen in order:
 *
 *   review          each lawyer completes their own review; once both have,
 *                   the review is complete (LAWYER_REVIEW_COMPLETED)
 *   request-ila     after both reviews
 *   pN-ila          that partner's lawyer, after ILA was requested
 *   pN-signoff      that partner's lawyer, after that partner's ILA
 *   pN-confirmation that partner's lawyer, after their own sign-off
 *   complete        either lawyer, after both final confirmations
 *   casework        notes, documents, agreement edits: either lawyer
 *
 * Staff (admin / case manager) are not tied to a side, but the order applies
 * to everyone. The lawyer's side(s) are left on `req.lawyerSides`.
 */
export type LawyerActionKind =
  | 'review'
  | 'request-ila'
  | 'p1-ila'
  | 'p2-ila'
  | 'p1-signoff'
  | 'p2-signoff'
  | 'p1-confirmation'
  | 'p2-confirmation'
  | 'complete'
  | 'casework';

export const LAWYER_ACTION_KEY = 'lawyerAction';
export const LawyerAction = (kind: LawyerActionKind) => SetMetadata(LAWYER_ACTION_KEY, kind);

const CLOSED = [
  CaseWorkflowStatus.COMPLETED,
  CaseWorkflowStatus.ARCHIVED,
  CaseWorkflowStatus.CANCELLED,
] as string[];

const PARTNER: Record<LawyerSide, string> = { P1: 'Partner 1', P2: 'Partner 2' };

/** The lawyers can start: both questionnaires in and both solicitors chosen. */
export function legalStageOpen(c: any): boolean {
  const { p1, p2 } = caseLawyerIds(c);
  return Boolean(
    c?.preQuestionnaireUser1?.submitted && c?.preQuestionnaireUser2?.submitted && p1 && p2,
  );
}

/** Why this step cannot be taken now, or null if it can. */
export function lawyerStepBlocker(c: any, kind: LawyerActionKind, sides: Set<LawyerSide> | null): string | null {
  const status = String(c?.workflowStatus ?? '');
  const side: LawyerSide | null = kind.startsWith('p1-') ? 'P1' : kind.startsWith('p2-') ? 'P2' : null;
  const p = side === 'P2' ? 'p2' : 'p1';

  if (kind === 'casework') return null;
  if (kind === 'complete') {
    if (status === CaseWorkflowStatus.COMPLETED) return 'This case is already completed.';
    if (!c.p1LawyerSigned || !c.p2LawyerSigned) return 'Both lawyers must sign off before the case is completed.';
    return null; // the service checks both final confirmations
  }
  if (CLOSED.includes(status)) return 'This case is closed.';
  if (!legalStageOpen(c)) {
    return 'Both partners must submit the pre-lawyer questionnaire and choose their solicitor before the lawyers start.';
  }

  switch (kind) {
    case 'review': {
      if (c.lawyerReviewCompleted) return 'The legal review is already completed.';
      const mine = sides && sides.size ? [...sides] : null;
      if (mine && mine.every((s) => c[s === 'P1' ? 'p1LawyerApproved' : 'p2LawyerApproved'])) {
        return 'You have already completed your review; waiting for the other lawyer.';
      }
      return null;
    }
    case 'request-ila':
      if (!c.lawyerReviewCompleted) return 'Both lawyers must complete their review before ILA is requested.';
      if (status !== CaseWorkflowStatus.LAWYER_REVIEW_COMPLETED) return 'ILA has already been requested.';
      return null;
    case 'p1-ila':
    case 'p2-ila':
      if (status !== CaseWorkflowStatus.LAWYER_ILA_PENDING) {
        return c.lawyerReviewCompleted ? 'ILA has not been requested yet.' : 'The legal review is not completed yet.';
      }
      if (c[`${p}LawyerSigned`]) return `${PARTNER[side!]}'s lawyer has already signed off.`;
      return null;
    case 'p1-signoff':
    case 'p2-signoff':
      if (!c[`${p}ILACompleted`]) return `Upload ${PARTNER[side!]}'s ILA before signing off.`;
      if (c[`${p}LawyerSigned`]) return `${PARTNER[side!]}'s lawyer has already signed off.`;
      return null;
    case 'p1-confirmation':
    case 'p2-confirmation':
      if (!c[`${p}LawyerSigned`]) return `${PARTNER[side!]}'s lawyer must sign off before the final confirmation.`;
      return null;
  }
  return null;
}

@Injectable()
export class LawyerActionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectModel(Case.name) private readonly caseModel: Model<any>,
    @InjectModel(User.name) private readonly userModel: Model<any>,
    @InjectModel(Lawyer.name) private readonly lawyerModel: Model<any>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const kind = this.reflector.get<LawyerActionKind>(LAWYER_ACTION_KEY, context.getHandler());
    if (!kind) return true;
    const req = context.switchToHttp().getRequest();
    const caseId = req.params?.caseId;
    if (!caseId || !isValidObjectId(caseId)) return true;
    const c = await this.caseModel.findById(caseId).lean().exec();
    if (!c) return true;

    const actor = req.user ?? {};
    const staff = isStaffRole(actor.role);
    const sides = staff
      ? null
      : await lawyerSidesFor({ user: this.userModel, lawyer: this.lawyerModel }, c as any, actor);
    if (!staff && !sides!.size) throw new ForbiddenException('Forbidden');

    const side: LawyerSide | null = kind.startsWith('p1-') ? 'P1' : kind.startsWith('p2-') ? 'P2' : null;
    if (side && sides && !sides.has(side)) {
      throw new ForbiddenException(`Only ${PARTNER[side]}'s lawyer can do this step.`);
    }

    const blocker = lawyerStepBlocker(c, kind, sides);
    if (blocker) throw new BadRequestException(blocker);

    req.lawyerSides = sides ? [...sides] : null;
    return true;
  }
}
