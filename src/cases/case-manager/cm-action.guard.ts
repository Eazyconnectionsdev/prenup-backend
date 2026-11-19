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

/**
 * When a case manager may act on a case.
 *
 * A case is visible to case managers from the moment it is created, but they
 * can only act on it once the couple have handed it over: payment made, both
 * partners' information completed, and the final review approved by both
 * (that is what moves it to COUPLE_SUBMITTED, see CasesService.approveCaseByUser).
 * Before that, only priority and case manager assignment can be changed.
 *
 *   review     the case manager's review: approve, return to draft, couple
 *              confirmations, agreement drafts/versions. Only while the case
 *              is with the case manager (COUPLE_SUBMITTED).
 *   casework   notes and documents on the case. Any time after hand-over.
 *   pre-lawyer the older "case manager assigns the lawyers" step. Only after
 *              approval, before the lawyers start.
 *   archive    only a completed case.
 *
 * review, casework and pre-lawyer also need the case to be assigned to the
 * acting case manager; an admin may act on any case manager's case.
 */
export type CmActionKind = 'review' | 'casework' | 'pre-lawyer' | 'archive';

export const CM_ACTION_KEY = 'cmAction';
export const CmAction = (kind: CmActionKind) => SetMetadata(CM_ACTION_KEY, kind);

const ADMIN_ROLES = ['admin', 'superadmin'];

const PRE_LAWYER = [
  CaseWorkflowStatus.CM_APPROVED,
  CaseWorkflowStatus.PRE_LAWYER_PENDING,
  CaseWorkflowStatus.PRE_LAWYER_COMPLETED,
  CaseWorkflowStatus.LAWYERS_ASSIGNED,
] as string[];

const NOT_HANDED_OVER = [
  CaseWorkflowStatus.NOT_PAID,
  CaseWorkflowStatus.DRAFT,
  CaseWorkflowStatus.CANCELLED,
] as string[];

const idOf = (v: any): string => (v ? String(v._id ?? v) : '');

export function isCasePaid(c: any): boolean {
  const status = String(c?.paymentStatus ?? '').toUpperCase();
  if (status === 'REFUNDED' || status === 'PARTIALLY_REFUNDED') return false;
  return Boolean(c?.paymentCompleted) || status === 'COMPLETED';
}

/** Has the couple finished and handed the case to the case manager? */
export function isHandedToCaseManager(c: any): boolean {
  const a = c?.approval ?? {};
  return (
    isCasePaid(c) &&
    Boolean(a.user1Approved && a.user2Approved) &&
    !NOT_HANDED_OVER.includes(c?.workflowStatus)
  );
}

export const NOT_HANDED_OVER_MESSAGE =
  'The couple have not finished yet. A case manager can act on this case once it is paid, both partners have completed their information and both have approved the final review.';

/** Throws unless a case manager may act on the case now. */
export function assertCmMayAct(
  c: any,
  actor: { id?: any; _id?: any; role?: string },
  kind: CmActionKind,
): void {
  const status = String(c?.workflowStatus ?? '');

  if (kind === 'archive') {
    if (status !== CaseWorkflowStatus.COMPLETED) {
      throw new BadRequestException('Only a completed case can be archived.');
    }
    return;
  }

  if (!isHandedToCaseManager(c)) {
    throw new BadRequestException(NOT_HANDED_OVER_MESSAGE);
  }
  if (kind === 'review' && status !== CaseWorkflowStatus.COUPLE_SUBMITTED) {
    throw new BadRequestException(
      'This case is no longer with the case manager for review (current stage: ' +
        status.replace(/_/g, ' ').toLowerCase() +
        ').',
    );
  }
  if (kind === 'pre-lawyer' && !PRE_LAWYER.includes(status)) {
    throw new BadRequestException(
      'Lawyers can only be assigned after the case manager has approved the case and before the lawyers start.',
    );
  }

  if (ADMIN_ROLES.includes(actor.role ?? '')) return;
  const assigned = idOf(c?.assignedCaseManager);
  if (!assigned) {
    throw new ForbiddenException('Assign this case to a case manager first.');
  }
  if (assigned !== idOf(actor.id ?? actor._id)) {
    throw new ForbiddenException('This case is assigned to another case manager.');
  }
}

@Injectable()
export class CmActionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectModel(Case.name) private readonly caseModel: Model<any>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const kind = this.reflector.get<CmActionKind>(CM_ACTION_KEY, context.getHandler());
    if (!kind) return true;
    const req = context.switchToHttp().getRequest();
    const caseId = req.params?.caseId ?? req.params?.id;
    // Let the handler answer a malformed id the way it always has.
    if (!caseId || !isValidObjectId(caseId)) return true;
    const c = await this.caseModel
      .findById(caseId)
      .select('workflowStatus paymentStatus paymentCompleted approval assignedCaseManager')
      .lean()
      .exec();
    if (!c) return true;
    assertCmMayAct(c, req.user ?? {}, kind);
    return true;
  }
}
