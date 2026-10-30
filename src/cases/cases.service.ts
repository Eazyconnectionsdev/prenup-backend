// src/cases/cases.service.ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import crypto from 'crypto';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import {
  Case,
  CaseDocument,
  SectionStatus,
  PreQuestionnaire,
  Approval,
  CaseWorkflowStatus,
  PaymentStatus,
  PartnerReviewStatus,
  MutualApprovalStatus,
  ReviewTimelineEntry,
} from './schemas/case.schema';

import { Lawyer, LawyerDocument } from './schemas/lawyer.schema';
import { CaseBackup, CaseBackupDocument } from './schemas/case_backup.schema';
import { Counter, CounterDocument } from '../common/schemas/counter.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  CaseAuditLog,
  CaseAuditLogDocument,
} from './schemas/case_audit_logs.schema';
import { PartnerLinkConflictOutcome } from './schemas/partner_invite.schema';
import { MailService } from '../mail/mail.service';
import { InvitePartnerDto } from '../cases/dto/Invite-partner.dto';
import { PartnerInviteService } from './partner-invite.service';
import { generateCaseNumber } from '../utils/case-number.util';

// Deliberately vague: it must not reveal whether the address has an account
// or who it is linked to.
const CANNOT_INVITE_MESSAGE =
  "This email address can't be invited to your case. Please check the address or contact support.";

@Injectable()
export class CasesService {
  private DUMMY_AGREEMENT_DRIVE_LINK = 'https://drive.google.com/file/d/FAKE_GOOGLE_DRIVE_ID/view';
  constructor(
    @InjectModel(Case.name) private caseModel: Model<CaseDocument>,
    @InjectModel(Lawyer.name) private lawyerModel: Model<LawyerDocument>,
    private config: ConfigService,
    private mailService: MailService,
    @InjectModel(CaseBackup.name) private questionnaireBackupModel: Model<CaseBackupDocument>,
    @InjectModel(Counter.name) private counterModel: Model<CounterDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(CaseAuditLog.name) private auditLogModel: Model<CaseAuditLogDocument>,
    private partnerInvites: PartnerInviteService,
  ) { }
  private isPrivilegedRole(role?: string): boolean {
    return role === 'superadmin' || role === 'admin' || role === 'case_manager';
  }

  private readonly STEP_MAP = {
    'personal-information': {
      section: 'myInformation',
      field: 'personalInformation',
    },

    'legal-declaration': {
      section: 'myInformation',
      field: 'legalDeclaration',
    },

    'family-and-dependents': {
      section: 'myInformation',
      field: 'familyAndDependents',
    },

    'individual-assets': {
      section: 'myInformation',
      field: 'individualAssets',
    },

    'income-and-revenue': {
      section: 'myInformation',
      field: 'incomeAndRevenue',
    },

    'liabilities-and-debts': {
      section: 'myInformation',
      field: 'liabilitiesAndDebts',
    },

    'partner-personal-information': {
      section: 'partnerInformation',
      field: 'personalInformation',
    },

    'partner-legal-declaration': {
      section: 'partnerInformation',
      field: 'legalDeclaration',
    },

    'partner-family-and-dependents': {
      section: 'partnerInformation',
      field: 'familyAndDependents',
    },

    'partner-individual-assets': {
      section: 'partnerInformation',
      field: 'individualAssets',
    },

    'partner-income-and-revenue': {
      section: 'partnerInformation',
      field: 'incomeAndRevenue',
    },

    'partner-liabilities-and-debts': {
      section: 'partnerInformation',
      field: 'liabilitiesAndDebts',
    },

    'joint-assets': {
      section: 'jointInformation',
      field: 'jointAssets',
    },

    'joint-income-and-revenue': {
      section: 'jointInformation',
      field: 'jointIncomeAndRevenue',
    },

    'joint-liabilities-and-debts': {
      section: 'jointInformation',
      field: 'jointLiabilitiesAndDebts',
    },

    'matrimonial-agreement': {
      section: 'jointInformation',
      field: 'matrimonialAgreement',
    },

    'solicitor-details': {
      section: 'independentLegalAdvice',
      field: 'solicitorDetails',
    },

    'lawyer-questionnaire': {
      section: 'independentLegalAdvice',
      field: 'lawyerQuestionnaire',
    },

    'review-and-sign': {
      section: 'independentLegalAdvice',
      field: 'reviewAndSign',
    },
  };

  private defaultSectionStatus(): SectionStatus {
    return {
      submitted: false,
      submittedBy: null,
      submittedAt: null,
      locked: false,
      lockedBy: null,
      lockedAt: null,
      unlockedBy: null,
      unlockedAt: null,
    } as SectionStatus;
  }
  private ensureSectionStatus(c: CaseDocument, section: string): SectionStatus {
    c.status = c.status || {};

    const statusAny = c.status as any;

    if (!statusAny[section]) {
      statusAny[section] = this.defaultSectionStatus();
    }

    return statusAny[section] as SectionStatus;
  }
  private makeEmptyPreQuestionnaire(): PreQuestionnaire {
    return {
      answers: [],
      selectedLawyer: null,
      submitted: false,
      submittedBy: null,
      submittedAt: null,
      locked: false,
      lockedBy: null,
      lockedAt: null,
    } as PreQuestionnaire;
  }
  private hasData(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;

    // Typed sub-schemas (the matrimonial agreement) arrive as mongoose
    // subdocuments, whose own enumerable properties are internals
    const plain =
      typeof (value as any).toObject === 'function'
        ? (value as any).toObject()
        : value;

    return Object.keys(plain).length > 0;
  }

  // Joint section is awaiting the partner's approval: submitted via its last form
  // (older cases may have `submitted` set by the first joint form only)
  private isJointReviewPending(c: CaseDocument): boolean {
    const status = c.status?.jointInformation;
    return (
      !!status?.submitted &&
      !status.locked &&
      (this.hasData((c as any).jointInformation?.matrimonialAgreement) ||
        // cases created before the matrimonial agreement form existed
        this.hasData((c as any).jointInformation?.jointLiabilitiesAndDebts))
    );
  }

  public areAllSectionsSubmitted(c: CaseDocument): boolean {
    return !!(
      c.status?.myInformation?.submitted &&
      c.status?.partnerInformation?.submitted &&
      c.status?.jointInformation?.submitted &&
      c.status?.independentLegalAdvice?.submitted
    );
  }

  // Issues a new Case ID. Only reached through startCase: registering an
  // account, inviting a partner and joining as a partner never get here.
  async create(
    ownerId: string,
    title?: string,
    id?: Types.ObjectId,
  ): Promise<CaseDocument> {
    const caseNumber = await generateCaseNumber(this.counterModel);

    const c = new this.caseModel({
      ...(id ? { _id: id } : {}),

      title: title || 'Untitled case',

      owner: new Types.ObjectId(ownerId),

      workflowStatus: CaseWorkflowStatus.NOT_PAID,

      paymentCompleted: false,

      caseNumber,
    });

    return c.save();
  }

  // A case that was given up (or cancelled) no longer counts as the user's
  // current matter. It and its Case ID stay on record.
  private isSetAside(c: Pick<Case, 'workflowStatus' | 'abandonedAt'>): boolean {
    return (
      !!c.abandonedAt || c.workflowStatus === CaseWorkflowStatus.CANCELLED
    );
  }

  // Starts a new legal matter for the signed-in client and issues its Case ID.
  // Idempotent: a client with a current case gets that one back, so a retry
  // or a double click can never produce a second Case ID.
  async startCase(userId: string, title?: string): Promise<CaseDocument> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user id');
    }
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== 'end_user') {
      throw new ForbiddenException('Only clients can start a case');
    }

    const current = user.inviteCaseId
      ? await this.caseModel.findById(user.inviteCaseId)
      : null;
    if (current && !this.isSetAside(current)) {
      if (current.owner.toString() !== userId) {
        throw new BadRequestException(
          "You have joined your partner's case, so you can't start a separate one.",
        );
      }
      return current;
    }

    // Claim the slot before issuing a Case ID, so two simultaneous requests
    // cannot both create a case (and burn a number).
    const id = new Types.ObjectId();
    const claimed = await this.userModel.updateOne(
      { _id: user._id, inviteCaseId: user.inviteCaseId ?? null },
      { $set: { inviteCaseId: id } },
    );
    if (!claimed.modifiedCount) {
      const fresh = await this.userModel.findById(userId);
      const existing = fresh?.inviteCaseId
        ? await this.caseModel.findById(fresh.inviteCaseId)
        : null;
      if (existing) return existing;
      throw new ConflictException('Could not start your case. Please try again.');
    }

    try {
      return await this.create(userId, title, id);
    } catch (err) {
      await this.userModel.updateOne(
        { _id: user._id, inviteCaseId: id },
        { $set: { inviteCaseId: user.inviteCaseId ?? null } },
      );
      throw err;
    }
  }

  // ---------------------------------------------------------------------
  // Joining a partner's case with an account that already exists
  // ---------------------------------------------------------------------

  // True when a questionnaire answer holds something the user typed. Booleans
  // are ignored: they are almost always untouched defaults.
  private hasContent(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (typeof value === 'number') return true;
    if (value instanceof Date) return true;
    if (Array.isArray(value)) return value.some((v) => this.hasContent(v));
    if (typeof value === 'object') {
      if (value instanceof Types.ObjectId) return false;
      const plain =
        typeof (value as any).toObject === 'function'
          ? (value as any).toObject()
          : value;
      return Object.entries(plain as Record<string, unknown>).some(
        ([k, v]) => k !== '_id' && k !== '__v' && this.hasContent(v),
      );
    }
    return false;
  }

  // Does this case hold anything worth protecting: money, answers, progress?
  // An empty draft (at most an agreement choice) is safe to set aside once
  // the owner confirms; anything else needs a person to decide.
  assessCase(
    c: CaseDocument,
    owner?: Pick<User, 'paymentDone'> | null,
  ): { meaningful: boolean; reasons: string[] } {
    const reasons: string[] = [];

    if (
      c.paymentCompleted ||
      owner?.paymentDone ||
      (c.paymentStatus && c.paymentStatus !== PaymentStatus.PENDING)
    ) {
      reasons.push('Payment has been made or started');
    }
    if (c.invitedUser) reasons.push('A partner has already joined');
    if (
      c.workflowStatus &&
      ![CaseWorkflowStatus.NOT_PAID, CaseWorkflowStatus.DRAFT].includes(
        c.workflowStatus,
      )
    ) {
      reasons.push(`Case has progressed to ${c.workflowStatus}`);
    }
    const sections = [
      'myInformation',
      'partnerInformation',
      'jointInformation',
      'independentLegalAdvice',
    ] as const;
    if (sections.some((k) => (c.status as any)?.[k]?.submitted === true)) {
      reasons.push('Sections have been submitted');
    }
    if (sections.some((k) => this.hasContent((c as any)[k]))) {
      reasons.push('Questionnaire answers have been entered');
    }
    if (c.assignedCaseManager || c.assignedLawyerP1 || c.assignedLawyerP2) {
      reasons.push('A case manager or lawyer has been assigned');
    }
    if ((c.totalDocuments ?? 0) > 0 || (c.totalNotes ?? 0) > 0) {
      reasons.push('Documents or notes are attached');
    }

    return { meaningful: reasons.length > 0, reasons };
  }

  // The user's own open cases, other than the one they are being invited to.
  private async ownOpenCases(
    user: UserDocument,
    exceptCaseId?: Types.ObjectId,
  ) {
    const q: Record<string, any> = {
      owner: user._id,
      abandonedAt: null,
      workflowStatus: { $ne: CaseWorkflowStatus.CANCELLED },
    };
    if (exceptCaseId) q._id = { $ne: exceptCaseId };
    return this.caseModel.find(q).exec();
  }

  // One partner per person, in both directions.
  private async assertFreeToLink(user: UserDocument, targetCaseId: Types.ObjectId) {
    const joinedElsewhere = await this.caseModel.exists({
      invitedUser: user._id,
      _id: { $ne: targetCaseId },
    });
    const ownsCouple = await this.caseModel.exists({
      owner: user._id,
      invitedUser: { $ne: null },
      abandonedAt: null,
      _id: { $ne: targetCaseId },
    });
    if (joinedElsewhere || ownsCouple) {
      throw new BadRequestException(
        'Your account is already linked to a partner, so it cannot join another case.',
      );
    }
  }

  private async audit(
    caseId: Types.ObjectId | string,
    userId: string | Types.ObjectId,
    action: string,
    notes?: string,
    extra?: { oldValue?: any; newValue?: any },
  ) {
    try {
      await this.auditLogModel.create({
        caseId: new Types.ObjectId(String(caseId)),
        userId: new Types.ObjectId(String(userId)),
        action,
        notes,
        ...extra,
      });
    } catch (err) {
      // An audit hiccup must not undo a link that already happened.
      console.error(`Failed to write audit log ${action}`, err);
    }
  }

  // Sets a case aside without deleting anything. The Case ID stays attached
  // to it and is never issued again.
  private async setCaseAside(
    c: CaseDocument,
    actorId: string,
    supersededBy: Types.ObjectId,
    reason: string,
  ) {
    await this.caseModel.updateOne(
      { _id: c._id },
      {
        $set: {
          workflowStatus: CaseWorkflowStatus.CANCELLED,
          abandonedAt: new Date(),
          abandonedBy: new Types.ObjectId(actorId),
          abandonedReason: reason,
          supersededByCaseId: supersededBy,
          partnerInvited: false,
          inviteToken: null,
          inviteTokenExpires: null,
        },
      },
    );
    await this.audit(c._id, actorId, 'CASE_SET_ASIDE', reason, {
      oldValue: { workflowStatus: c.workflowStatus },
      newValue: { supersededByCaseId: supersededBy },
    });
  }

  // What the signed-in invitee sees before accepting: who invited them and
  // what would happen to a case they already have.
  async previewInviteForUser(
    userId: string,
    caseId: string,
    token?: string | null,
  ) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const invite = await this.partnerInvites.findAcceptable(caseId, user, token);
    const c = await this.caseModel.findById(caseId).populate('owner', 'firstName lastName');
    if (!c) throw new BadRequestException('Invalid invite link');

    const own = await this.ownOpenCases(user, c._id);
    const assessed = own.map((oc) => ({
      caseNumber: oc.caseNumber ?? null,
      createdAt: (oc as any).createdAt ?? null,
      ...this.assessCase(oc, user),
    }));
    const conflict = invite.conflict ?? null;
    const owner: any = c.owner;

    return {
      inviter: {
        firstName: owner?.firstName ?? null,
        lastName: owner?.lastName ?? null,
      },
      caseNumber: c.caseNumber ?? null,
      expiresAt: invite.expiresAt,
      emailMatchesInvite:
        (user.email ?? '').trim().toLowerCase() === invite.invitee.email,
      // NONE: nothing to give up. DRAFT: unused, confirm to set it aside.
      // NEEDS_RESOLUTION: has data/payment, staff must decide first.
      // APPROVED: staff cleared it, confirm to proceed.
      ownCase: assessed.some((a) => a.meaningful)
        ? conflict?.outcome === PartnerLinkConflictOutcome.APPROVED
          ? 'APPROVED'
          : 'NEEDS_RESOLUTION'
        : assessed.length
          ? 'DRAFT'
          : 'NONE',
      ownCases: assessed,
      resolutionRequested: !!conflict && !conflict.resolvedAt,
    };
  }

  // A signed-in user with an existing account accepts a partner invitation.
  // Their account is linked to the inviter's case as the secondary applicant;
  // nothing is created, no Case ID is issued, no account is deleted.
  async acceptInviteAsExistingUser(
    userId: string,
    caseId: string,
    token: string | null | undefined,
    confirmSetAsideOwnCase: boolean,
  ) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== 'end_user') {
      throw new ForbiddenException(
        'Only client accounts can join a case as a partner',
      );
    }

    const invite = await this.partnerInvites.findAcceptable(caseId, user, token);
    const c = await this.caseModel.findById(caseId);
    if (!c) throw new BadRequestException('Invalid invite link');

    if (c.owner.toString() === userId) {
      throw new BadRequestException("You can't accept your own invitation");
    }
    if (c.invitedUser) {
      throw new BadRequestException('This case already has a partner');
    }
    if (this.isSetAside(c)) {
      throw new BadRequestException('This case is no longer open');
    }

    await this.assertFreeToLink(user, c._id);

    const own = await this.ownOpenCases(user, c._id);
    const assessed = own.map((oc) => ({ oc, ...this.assessCase(oc, user) }));
    const meaningful = assessed.filter((a) => a.meaningful);
    const staffApproved =
      !!invite.conflict?.resolvedAt &&
      invite.conflict.outcome === PartnerLinkConflictOutcome.APPROVED;

    // Real data or payment on their own case: never decided automatically.
    if (meaningful.length && !staffApproved) {
      const reasons = [...new Set(meaningful.flatMap((a) => a.reasons))];
      const wasOpen = !!invite.conflict && !invite.conflict.resolvedAt;
      await this.partnerInvites.flagConflict(caseId, {
        userId: user._id,
        existingCaseId: meaningful[0].oc._id,
        reasons,
      });
      if (!wasOpen) {
        await this.audit(
          c._id,
          userId,
          'PARTNER_LINK_FLAGGED',
          `Invited partner already has case ${meaningful[0].oc.caseNumber ?? meaningful[0].oc._id}`,
          { newValue: { existingCaseId: meaningful[0].oc._id, reasons } },
        );
        await this.notifyStaffOfLinkConflict(
          c,
          meaningful[0].oc,
          reasons,
        );
      }
      return {
        success: false,
        linked: false,
        resolutionRequired: true,
        message:
          'You already have a case with information or a payment on it. We have asked our team to review this before linking you to your partner. Nothing has been changed, and we will contact you.',
      };
    }

    if (assessed.length && !confirmSetAsideOwnCase) {
      throw new ConflictException({
        code: 'CONFIRM_SET_ASIDE_OWN_CASE',
        message:
          'You have an unused case of your own. Confirm that you want to set it aside and join your partner’s case instead. It will not be deleted.',
        ownCases: assessed.map((a) => a.oc.caseNumber ?? String(a.oc._id)),
      });
    }

    // One partner per case: the claim is conditional, so a concurrent accept
    // cannot link a second person.
    const claimed = await this.caseModel.updateOne(
      { _id: c._id, invitedUser: null },
      {
        $set: {
          invitedUser: user._id,
          inviteToken: null,
          inviteTokenExpires: null,
        },
      },
    );
    if (!claimed.modifiedCount) {
      throw new BadRequestException('This case already has a partner');
    }

    try {
      await this.userModel.updateOne(
        { _id: user._id },
        {
          $set: {
            endUserType: 'user2',
            invitedBy: c.owner,
            inviteCaseId: c._id,
          },
        },
      );
      await this.userModel.updateOne(
        { _id: c.owner },
        { $set: { invitedUser: user._id } },
      );
    } catch (err) {
      await this.caseModel.updateOne(
        { _id: c._id, invitedUser: user._id },
        { $set: { invitedUser: null } },
      );
      throw err;
    }

    for (const a of assessed) {
      await this.setCaseAside(
        a.oc,
        userId,
        c._id,
        'Owner joined their partner’s case',
      );
    }
    await this.partnerInvites.markAccepted(caseId, user);
    await this.partnerInvites.revokeOutstanding({
      email: user.email,
      ownCaseIds: own.map((o) => o._id),
      exceptCaseId: c._id,
    });
    await this.audit(c._id, userId, 'PARTNER_LINKED', 'Existing account linked as partner', {
      newValue: { partnerId: user._id },
    });
    await this.notifyPartnerJoined(caseId);

    return { success: true, linked: true, caseId: String(c._id) };
  }

  // An open invitation addressed to this signed-in client's email, for
  // someone who signed up on their own instead of using the emailed link.
  // The token is never exposed: acceptance is by being signed in as the
  // invited (verified) address.
  async pendingInviteFor(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user || user.role !== 'end_user' || !user.emailVerified) {
      return { invite: null };
    }

    const joined = await this.caseModel.exists({ invitedUser: user._id });
    if (joined) return { invite: null };

    const invite = await this.partnerInvites.findPendingForEmail(user.email);
    if (!invite) return { invite: null };

    const c = await this.caseModel
      .findById(invite.caseId)
      .populate('owner', 'firstName lastName')
      .exec();
    const owner: any = c?.owner;
    if (
      !c ||
      c.invitedUser ||
      this.isSetAside(c) ||
      String(owner?._id) === String(user._id)
    ) {
      return { invite: null };
    }

    return {
      invite: {
        caseId: String(c._id),
        caseNumber: c.caseNumber ?? null,
        inviterFirstName: owner?.firstName ?? null,
        inviterLastName: owner?.lastName ?? null,
        expiresAt: invite.expiresAt,
        resolutionRequested: !!invite.conflict && !invite.conflict.resolvedAt,
      },
    };
  }

  private async staffEmailsFor(c: CaseDocument): Promise<string[]> {
    const emails = new Set<string>();
    (this.config.get<string>('CASE_MANAGER_EMAILS') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((e) => emails.add(e));

    const ids = c.assignedCaseManager ? [c.assignedCaseManager] : [];
    const staff = await this.userModel
      .find(
        ids.length
          ? { _id: { $in: ids } }
          : { role: { $in: ['admin', 'superadmin'] } },
      )
      .select('email')
      .lean()
      .exec();
    staff.forEach((s: any) => s.email && emails.add(s.email));
    return [...emails];
  }

  private async notifyStaffOfLinkConflict(
    target: CaseDocument,
    existing: CaseDocument,
    reasons: string[],
  ) {
    try {
      const subject = `Partner link needs review — ${target.caseNumber ?? target._id}`;
      const body = `The partner invited to case ${target.caseNumber ?? target._id} already has their own case (${existing.caseNumber ?? existing._id}) that holds data or a payment.

Why it was held:
- ${reasons.join('\n- ')}

Nothing has been merged, deleted or linked. Open case ${target.caseNumber ?? target._id} to approve or reject the link.`;
      for (const to of await this.staffEmailsFor(target)) {
        await this.mailService.sendMail(to, subject, body);
      }
    } catch (err) {
      console.error('Failed to notify staff of partner link conflict', err);
    }
  }

  // Staff decision on a held link. APPROVED lets the invitee confirm and
  // join (their own case is set aside, never deleted); REJECTED withdraws
  // the invitation.
  async resolvePartnerConflict(
    caseId: string,
    actorId: string,
    outcome: PartnerLinkConflictOutcome,
    note?: string,
  ) {
    if (!Types.ObjectId.isValid(caseId)) {
      throw new BadRequestException('Invalid case id');
    }
    const c = await this.caseModel.findById(caseId);
    if (!c) throw new NotFoundException('Case not found');

    await this.partnerInvites.resolveConflict(caseId, actorId, outcome, note);
    await this.audit(
      c._id,
      actorId,
      outcome === PartnerLinkConflictOutcome.APPROVED
        ? 'PARTNER_LINK_APPROVED'
        : 'PARTNER_LINK_REJECTED',
      note,
    );
    return this.getInvite(caseId, true);
  }
  async markPaymentCompleted(caseId: string, actorId: string) {
    const c = await this.caseModel.findById(caseId);

    if (!c) {
      throw new NotFoundException('Case not found');
    }

    c.paymentCompleted = true;
    c.paymentStatus = PaymentStatus.COMPLETED;

    c.workflowStatus = CaseWorkflowStatus.DRAFT;

    await c.save();

    return c;
  }

  async findById(id: string, populate = false): Promise<CaseDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const q = this.caseModel.findById(id);
    if (populate) {
      q.populate(
        'owner invitedUser preQuestionnaireUser1.selectedLawyer preQuestionnaireUser2.selectedLawyer assignedCaseManager',
      );
    }
    return q.exec();
  }
  async findAll(): Promise<CaseDocument[]> {
    return this.caseModel.find().exec();
  }
  async findByUser(userId: string | Types.ObjectId): Promise<CaseDocument[]> {
    const id = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    return this.caseModel
      .find({
        $or: [{ owner: id }, { invitedUser: id }],
        // Cases the user gave up on stay on record but are not theirs to work on.
        abandonedAt: null,
      })
      .exec();
  }
  async findByCaseId(
    caseId: Types.ObjectId | null,
  ): Promise<CaseDocument | null> {
    return this.caseModel.findOne({ _id: caseId }).exec();
  }
  // Links a newly registered partner. One partner per case: the update only
  // applies while the slot is empty (or already theirs), so it can never
  // replace someone who has joined.
  async attachInvitedUser(
    caseId: string,
    userId: string,
  ): Promise<CaseDocument> {
    const saved = await this.caseModel.findOneAndUpdate(
      {
        _id: caseId,
        $or: [{ invitedUser: null }, { invitedUser: new Types.ObjectId(userId) }],
      },
      {
        $set: {
          invitedUser: new Types.ObjectId(userId),
          inviteToken: null,
          inviteTokenExpires: null,
        },
      },
      { new: true },
    );
    if (!saved) {
      const exists = await this.caseModel.exists({ _id: caseId });
      if (!exists) throw new NotFoundException('Case not found');
      throw new BadRequestException('This case already has a partner');
    }

    await this.notifyPartnerJoined(caseId);
    return saved;
  }

  // Tells the primary applicant that their partner has joined.
  private async notifyPartnerJoined(caseId: string) {
    try {
      const populated = await this.caseModel.findById(caseId).populate('owner invitedUser').lean().exec();
      const ownerEmail = (populated?.owner as any)?.email;
      const ownerName = (populated?.owner as any)?.firstName || 'there';
      const partnerName = (populated?.invitedUser as any)?.firstName || 'Your partner';
      const appUrl = this.config.get('APP_SERVER_URL') || this.config.get('APP_BASE_URL') || '';
      const dashboardUrl = `${appUrl}/dashboard`;

      if (ownerEmail) {
        await this.mailService.sendPartnerJoinedNotification(ownerEmail, ownerName, partnerName, dashboardUrl);
      }
    } catch (err) {
      console.error('Failed to send partner joined notification', err);
    }
  }

  // Onboarding belongs to the case owner (user 1) only; the invited partner
  // (user 2) never goes through it.
  async getOnboarding(caseId: string, userId: string) {
    if (!Types.ObjectId.isValid(caseId)) {
      throw new BadRequestException('Invalid case id');
    }
    const c = await this.caseModel.findById(caseId).lean().exec();
    if (!c) throw new NotFoundException('Case not found');
    if (c.owner?.toString() !== userId.toString()) {
      throw new ForbiddenException('Forbidden');
    }
    return {
      completed: !!c.onboarding?.completed,
      agreementType: c.agreementType ?? null,
      completedAt: c.onboarding?.completedAt ?? null,
    };
  }

  async completeOnboarding(
    caseId: string,
    userId: string,
    dto: { agreementType: string; residesInUK: boolean; },
  ) {
    if (!Types.ObjectId.isValid(caseId)) {
      throw new BadRequestException('Invalid case id');
    }
    const c = await this.caseModel.findById(caseId);
    if (!c) throw new NotFoundException('Case not found');
    if (c.owner?.toString() !== userId.toString()) {
      throw new ForbiddenException('Only the case owner can complete onboarding');
    }

    const prev = c.onboarding;
    c.agreementType = dto.agreementType;
    c.onboarding = {
      completed: true,
      completedAt: prev?.completedAt ?? new Date(),
      completedBy: prev?.completedBy ?? new Types.ObjectId(userId),
      residesInUK: dto.residesInUK,
    } as any;
    await c.save();

    return {
      completed: true,
      agreementType: c.agreementType,
      completedAt: c.onboarding?.completedAt,
    };
  }

  // Staff see the full link conflict (the other case and why it was held).
  // The inviter only learns that the link is waiting on a review: what the
  // invited person has on their own account is not theirs to see.
  async getInvite(caseId: string, forStaff = false) {
    const result: any = await this.partnerInvites.getForCase(caseId);
    const conflict = result?.invite?.conflict;
    if (!conflict) return result;

    if (!forStaff) {
      result.invite.conflict = {
        open: !conflict.resolvedAt,
        outcome: conflict.outcome ?? null,
      };
      return result;
    }

    const existing = await this.caseModel
      .findById(conflict.existingCaseId)
      .select('caseNumber workflowStatus paymentCompleted')
      .lean()
      .exec();
    result.invite.conflict = {
      ...conflict,
      open: !conflict.resolvedAt,
      existingCase: existing
        ? {
            _id: String(existing._id),
            caseNumber: existing.caseNumber ?? null,
            workflowStatus: existing.workflowStatus,
            paymentCompleted: !!existing.paymentCompleted,
          }
        : null,
    };
    return result;
  }

  async invite(caseId: string, inviterId: string, dto: InvitePartnerDto) {
    const c = await this.caseModel.findById(caseId);

    if (!c) {
      throw new NotFoundException('Case not found');
    }

    if (this.isSetAside(c)) {
      throw new BadRequestException('This case is no longer open');
    }

    // A partner who already joined can't be re-invited (until removed).
    await this.partnerInvites.assertCanInvite(caseId);
    if (c.invitedUser) {
      throw new BadRequestException('Your partner has already joined this case');
    }

    // One partner per person. If the address already has an account, the
    // person signs in and accepts; they are never asked to register again or
    // to delete anything.
    const inviteeEmail = dto.email.trim().toLowerCase();
    const owner = await this.userModel.findById(c.owner).select('email');
    if (owner?.email === inviteeEmail) {
      throw new BadRequestException("You can't invite yourself");
    }
    const existingAccount = await this.userModel.findOne({ email: inviteeEmail });
    if (existingAccount) {
      if (existingAccount.role !== 'end_user') {
        throw new BadRequestException(CANNOT_INVITE_MESSAGE);
      }
      const linkedElsewhere = await this.caseModel.exists({
        invitedUser: existingAccount._id,
        _id: { $ne: c._id },
      });
      const ownsCouple = await this.caseModel.exists({
        owner: existingAccount._id,
        invitedUser: { $ne: null },
        abandonedAt: null,
      });
      if (linkedElsewhere || ownsCouple) {
        throw new BadRequestException(CANNOT_INVITE_MESSAGE);
      }
    }

    const token = crypto.randomBytes(32).toString('hex');

    const expires = new Date(
      Date.now() +
        Number(this.config.get('INVITE_TOKEN_EXPIRY_HOURS') || 72) *
          3600 *
          1000,
    );

    c.invitedEmail = dto.email;

    c.partnerInvited = true;

    c.inviteToken = token;

    c.inviteTokenExpires = expires;

    c.partnerInviteDetails = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      mobileNumber: dto.mobileNumber,
      relationshipStatus: dto.relationshipStatus,
      targetWeddingDate: dto.targetWeddingDate,
      personalMessage: dto.personalMessage,
    };

    await c.save();

    // Track the invite (status, opens, resends, who registered).
    await this.partnerInvites.recordSent(caseId, inviterId, dto, token, expires);

    const params = new URLSearchParams({
      token,
      caseId: c._id.toString(),
      email: dto.email,
      firstName: dto.firstName || '',
      lastName: dto.lastName || '',
      mobileNumber: dto.mobileNumber || '',
      relationshipStatus: dto.relationshipStatus || '',
      targetWeddingDate: dto.targetWeddingDate
        ? new Date(dto.targetWeddingDate).toISOString()
        : '',
      personalMessage: dto.personalMessage || '',
    });

    // Existing accounts go straight to the sign-in-and-accept page; anyone
    // else registers. (The register page also hands an existing account over
    // to sign-in, for someone who signed up after the invite was sent.)
    const baseUrl = this.config.get('APP_BASE_URL');
    const inviteUrl = existingAccount
      ? `${baseUrl}/accept-invite?${new URLSearchParams({ caseId: c._id.toString(), token }).toString()}`
      : `${baseUrl}/register-partner?${params.toString()}`;
    await this.mailService.sendInvite(dto.email, inviteUrl, {
      existingAccount: !!existingAccount,
    });

    return {
      inviteUrl,
    };
  }

  // async updateQuestionnaireStep(
  //   caseId: string,
  //   stepName: string,
  //   data: any,
  //   actorId: string,
  //   isPrivileged = false,
  // ): Promise<CaseDocument> {
  //   const c = await this.caseModel.findById(caseId);

  //   if (!c) {
  //     throw new NotFoundException('Case not found');
  //   }

  //   const config = this.STEP_MAP[stepName as keyof typeof this.STEP_MAP];

  //   if (!config) {
  //     throw new BadRequestException('Invalid step');
  //   }

  //   const { section, field } = config;

  //   (c as any)[section] = (c as any)[section] || {};

  //   (c as any)[section][field] = data;

  //   const status = this.ensureSectionStatus(c, section);

  //   status.submitted = true;
  //   status.submittedBy = new Types.ObjectId(actorId);
  //   status.submittedAt = new Date();

  //   console.log('c', c);

  //   const isOwner = c.owner?.toString() === actorId.toString();
  //   const isInvited = c.owner?.toString() !== actorId.toString();

  //   if (stepName === 'joint-liabilities-and-debts' && (isOwner || isInvited)) {

  //     const approval = this.ensureApprovalObj(c);

  //     const now = new Date();
  //     if (isOwner) {
  //       approval.user1Approved = true;

  //       approval.user1ApprovedAt = now;
  //     } else {
  //       approval.user2Approved = true;
  //       approval.user2ApprovedAt = now;
  //     }
  //   }

  //   if (stepName === 'review-and-sign') {
  //     if (!this.areAllSectionsSubmitted(c)) {
  //       throw new BadRequestException('All sections must be submitted');
  //     }

  //     const now = new Date();

  //     c.fullyLocked = true;
  //     c.fullyLockedAt = now;
  //     c.fullyLockedBy = new Types.ObjectId(actorId);

  //     for (const name of [
  //       'myInformation',
  //       'partnerInformation',
  //       'jointInformation',
  //       'independentLegalAdvice',
  //     ]) {
  //       const s = this.ensureSectionStatus(c, name);

  //       s.locked = true;
  //       s.lockedBy = new Types.ObjectId(actorId);

  //       s.lockedAt = now;
  //     }
  //   }

  //   await c.save();

  //   return c;
  // }

  async updateQuestionnaireStep(
    caseId: string,
    stepName: string,
    data: any,
    actorId: string,
    isPrivileged = false,
  ): Promise<CaseDocument> {
    const c = await this.caseModel.findById(caseId);
    if (!c) throw new NotFoundException('Case not found');

    const config = this.STEP_MAP[stepName as keyof typeof this.STEP_MAP];
    if (!config) throw new BadRequestException('Invalid step');

    const isOwner = c.owner?.toString() === actorId.toString();
    const isInvited = c.invitedUser?.toString() === actorId.toString();

    // A locked section is read-only for the couple, whichever form it came
    // from: once both partners confirm, the case belongs to the case manager.
    if (!isPrivileged && c.status?.[config.section]?.locked) {
      throw new BadRequestException('This section is already locked');
    }


    // Joint information is filled in over several forms but reviewed as one
    // section. The same turn/lock rules apply to every one of those forms.
    const isJointStep = config.section === 'jointInformation';

    if (isJointStep && !isPrivileged) {
      const existing = c.status?.jointInformation;
      const alreadySubmittedBy = existing?.submittedBy
        ? existing.submittedBy.toString()
        : null;

      if (existing?.locked) {
        throw new BadRequestException('This section is already locked');
      }
      if (this.isJointReviewPending(c)) {
        throw new BadRequestException(
          'This section is pending review by the other party',
        );
      }

      const canSubmit =
        alreadySubmittedBy === null
          ? isOwner
          : alreadySubmittedBy === actorId.toString();

      if (!canSubmit) {
        throw new ForbiddenException(
          alreadySubmittedBy === null
            ? 'Only the case owner can submit this section'
            : 'It is not your turn to submit this section',
        );
      }
    }

    const { section, field } = config;
    (c as any)[section] = (c as any)[section] || {};
    (c as any)[section][field] = data;
    c.markModified(section);

    // Joint forms, including the last one, only save. The section goes to the
    // partner for approval when its owner asks for it from the final review
    // page (submitJointInformationForReview) — never as a side effect of a save.
    if (!isJointStep) {
      const status = this.ensureSectionStatus(c, section);
      status.submitted = true;
      status.submittedBy = new Types.ObjectId(actorId);
      status.submittedAt = new Date();
    }

    if (stepName === 'review-and-sign') {
      if (!this.areAllSectionsSubmitted(c)) {
        throw new BadRequestException('All sections must be submitted');
      }
      const now = new Date();
      c.fullyLocked = true;
      c.fullyLockedAt = now;
      c.fullyLockedBy = new Types.ObjectId(actorId);

      for (const name of [
        'myInformation',
        'partnerInformation',
        'jointInformation',
        'independentLegalAdvice',
      ]) {
        const s = this.ensureSectionStatus(c, name);
        s.locked = true;
        s.lockedBy = new Types.ObjectId(actorId);
        s.lockedAt = now;
      }
    }

    await c.save();
    return c;
  }

  // Explicitly ask the other partner to review and approve the information.
  // This is the only thing that starts an approval round: filling in the forms
  // (the matrimonial agreement included) just saves them.
  async submitJointInformationForReview(
    caseId: string,
    actorId: string,
  ): Promise<CaseDocument> {
    const c = await this.caseModel.findById(caseId);
    if (!c) throw new NotFoundException('Case not found');

    const isOwner = c.owner?.toString() === actorId.toString();
    const isInvited = c.invitedUser?.toString() === actorId.toString();
    if (!isOwner && !isInvited) throw new ForbiddenException('Not part of case');

    if (!c.invitedUser) {
      throw new BadRequestException(
        'Your partner has not joined the case yet, so there is nobody to review this.',
      );
    }

    const status = this.ensureSectionStatus(c, 'jointInformation');

    if (status.locked) {
      throw new BadRequestException('This section is already locked');
    }
    if (this.isJointReviewPending(c)) {
      throw new BadRequestException(
        'This section is already pending review by the other party',
      );
    }

    const joint = (c as any).jointInformation || {};
    if (
      !this.hasData(joint.jointAssets) ||
      !this.hasData(joint.jointIncomeAndRevenue) ||
      !this.hasData(joint.jointLiabilitiesAndDebts) ||
      !this.hasData(joint.matrimonialAgreement)
    ) {
      throw new BadRequestException(
        'Please complete Joint Assets, Joint Income, Joint Liabilities and the Matrimonial Agreement before sending this for approval',
      );
    }

    // Owner sends the first round; after a disapproval it is the partner who
    // disapproved that fixes the information and sends the next one.
    const alreadySubmittedBy = status.submittedBy
      ? status.submittedBy.toString()
      : null;
    const canSubmit =
      alreadySubmittedBy === null
        ? isOwner
        : alreadySubmittedBy === actorId.toString();

    if (!canSubmit) {
      throw new ForbiddenException(
        alreadySubmittedBy === null
          ? 'Only the case owner can send this section for approval'
          : 'It is not your turn to send this section for approval',
      );
    }

    const now = new Date();
    status.submitted = true;
    status.submittedBy = new Types.ObjectId(actorId);
    status.submittedAt = now;
    c.markModified('status');

    // Sending for review is the sender's own approval of this version; the
    // other partner's approval is what completes the round.
    const approval = this.ensureApprovalObj(c);

    let actionLabel = '';
    if (isOwner) {
      approval.user1Approved = true;
      approval.user1ApprovedAt = now;
      approval.user2Approved = false;
      approval.user2ApprovedAt = null;

      approval.p1ReviewStatus = PartnerReviewStatus.FINAL_SUBMIT;
      approval.p2ReviewStatus = PartnerReviewStatus.IN_REVIEW;
      approval.mutualApprovalAndSnapshot = MutualApprovalStatus.PENDING;

      const hasPreviousSubmit =
        approval.reviewTimeline && approval.reviewTimeline.length > 0;
      actionLabel = hasPreviousSubmit
        ? 'Primary Applicant — Changes Submitted'
        : 'Primary Applicant — Submitted';

      approval.reviewTimeline.push({
        action: actionLabel,
        actor: new Types.ObjectId(actorId),
        actorRole: 'PRIMARY',
        p1Status: PartnerReviewStatus.FINAL_SUBMIT,
        p2Status: PartnerReviewStatus.IN_REVIEW,
        mutualStatus: MutualApprovalStatus.PENDING,
        timestamp: now,
      } as ReviewTimelineEntry);
    } else {
      approval.user2Approved = true;
      approval.user2ApprovedAt = now;
      approval.user1Approved = false;
      approval.user1ApprovedAt = null;

      approval.p1ReviewStatus = PartnerReviewStatus.IN_REVIEW;
      approval.p2ReviewStatus = PartnerReviewStatus.FINAL_SUBMIT;
      approval.mutualApprovalAndSnapshot = MutualApprovalStatus.PENDING;

      actionLabel = 'Secondary Applicant — Changes Submitted';

      approval.reviewTimeline.push({
        action: actionLabel,
        actor: new Types.ObjectId(actorId),
        actorRole: 'SECONDARY',
        p1Status: PartnerReviewStatus.IN_REVIEW,
        p2Status: PartnerReviewStatus.FINAL_SUBMIT,
        mutualStatus: MutualApprovalStatus.PENDING,
        timestamp: now,
      } as ReviewTimelineEntry);
    }

    approval.disapprovedBy = null;
    approval.disapprovedAt = null;
    approval.disapprovalReason = null;
    c.markModified('approval');

    await c.save();

    // Trigger Handshake review emails
    try {
      const populated = await this.caseModel.findById(c._id).populate('owner invitedUser').lean().exec();
      const appUrl = this.config.get('APP_SERVER_URL') || this.config.get('APP_BASE_URL') || '';
      const caseIdDisplay = (c as any).caseNumber || c._id.toString();
      const reviewUrl = `${appUrl}/dashboard/review-approval`;
      const caseUrl = `${appUrl}/dashboard`;

      const submitter = isOwner ? populated?.owner : populated?.invitedUser;
      const reviewer = isOwner ? populated?.invitedUser : populated?.owner;

      const submitterName = (submitter as any)?.firstName || 'Your Partner';
      const reviewerName = (reviewer as any)?.firstName || 'there';
      const reviewerEmail = (reviewer as any)?.email;
      const submitterEmail = (submitter as any)?.email;

      // 1. Notify Reviewer that forms are ready for review & approval
      if (reviewerEmail) {
        await this.mailService.sendHandshakeReviewRequest(reviewerEmail, reviewerName, submitterName, caseIdDisplay, reviewUrl);
      }
      // 2. Notify Submitter that forms are now pending partner review
      if (submitterEmail) {
        await this.mailService.sendSubmissionPendingPartner(submitterEmail, submitterName, reviewerName, caseIdDisplay, caseUrl);
      }
    } catch (err) {
      console.error('Failed to send handshake review emails', err);
    }

    return c;
  }

  async approveCaseByUser(
  caseId: string,
  actorId: string,
): Promise<CaseDocument> {
  const c = await this.caseModel.findById(caseId);
  if (!c) throw new NotFoundException('Case not found');

  const isOwner = c.owner?.toString() === actorId.toString();
  const isInvited = c.invitedUser?.toString() === actorId.toString();
  if (!isOwner && !isInvited) throw new ForbiddenException('Not part of case');

  const jointStatus = c.status?.jointInformation;
  if (jointStatus?.locked) {
    throw new BadRequestException('Section is already locked');
  }
  if (!jointStatus || !this.isJointReviewPending(c)) {
    throw new BadRequestException(
      'Nothing is pending review: the joint information has not been submitted yet.',
    );
  }
  if (jointStatus.submittedBy?.toString() === actorId.toString()) {
    throw new BadRequestException('You cannot approve your own submission');
  }

  let movedToCaseManager = false;
  const approval = this.ensureApprovalObj(c);
  const now = new Date();

  if (isOwner) {
    approval.user1Approved = true;
    approval.user1ApprovedAt = now;
    approval.p1ReviewStatus = PartnerReviewStatus.APPROVED;
    approval.mutualApprovalAndSnapshot = MutualApprovalStatus.COMPLETED;
    approval.mutualApprovalCompletedAt = now;

    // Bug 1 fix: mirror P2 hadChanges check so Scenario A gets the correct label.
    const p1HadChanges =
      approval.reviewTimeline &&
      approval.reviewTimeline.some((t: any) =>
        t.action?.includes('Changes Submitted'),
      );
    const p1ApproveAction = p1HadChanges
      ? 'Primary Applicant — Approved Updated Version'
      : 'Primary Applicant — Approved without changes';

    approval.reviewTimeline.push({
      action: p1ApproveAction,
      actor: new Types.ObjectId(actorId),
      actorRole: 'PRIMARY',
      p1Status: PartnerReviewStatus.APPROVED,
      p2Status: approval.p2ReviewStatus || PartnerReviewStatus.FINAL_SUBMIT,
      mutualStatus: MutualApprovalStatus.COMPLETED,
      timestamp: now,
    } as ReviewTimelineEntry);
  } else {
    approval.user2Approved = true;
    approval.user2ApprovedAt = now;
    approval.p2ReviewStatus = PartnerReviewStatus.APPROVED;
    approval.mutualApprovalAndSnapshot = MutualApprovalStatus.COMPLETED;
    approval.mutualApprovalCompletedAt = now;

    const hadChanges =
      approval.reviewTimeline &&
      approval.reviewTimeline.some((t: any) =>
        t.action?.includes('Changes Submitted'),
      );
    const approveAction = hadChanges
      ? 'Secondary Applicant — Approved Updated Version'
      : 'Secondary Applicant — Approved without changes';

    approval.reviewTimeline.push({
      action: approveAction,
      actor: new Types.ObjectId(actorId),
      actorRole: 'SECONDARY',
      p1Status: approval.p1ReviewStatus || PartnerReviewStatus.FINAL_SUBMIT,
      p2Status: PartnerReviewStatus.APPROVED,
      mutualStatus: MutualApprovalStatus.COMPLETED,
      timestamp: now,
    } as ReviewTimelineEntry);
  }

  // Bug 2 note: this entry fires exactly once (after the per-approver entry
  // above), so the timeline never gets a duplicate Mutual Approval entry.
  approval.reviewTimeline.push({
    action: 'Mutual Approval & Snapshot — Completed',
    actor: new Types.ObjectId(actorId),
    actorRole: isOwner ? 'PRIMARY' : 'SECONDARY',
    p1Status: approval.p1ReviewStatus,
    p2Status: approval.p2ReviewStatus,
    mutualStatus: MutualApprovalStatus.COMPLETED,
    timestamp: now,
  } as ReviewTimelineEntry);

  // Freeze snapshot data
  approval.snapshotData = {
    frozenAt: now,
    myInformation: c.myInformation,
    partnerInformation: c.partnerInformation,
    jointInformation: c.jointInformation,
    caseNumber: c.caseNumber,
    title: c.title,
    owner: c.owner,
    invitedUser: c.invitedUser,
  };

  jointStatus.locked = true;
  jointStatus.lockedBy = new Types.ObjectId(actorId);
  jointStatus.lockedAt = now;

  // Both partners have confirmed: freeze the couple-facing sections and
  // hand the case to a case manager. Independent legal advice stays open.
  for (const name of ['myInformation', 'partnerInformation', 'jointInformation']) {
    const s = this.ensureSectionStatus(c, name);
    if (!s.locked && s.submitted) {
      s.locked = true;
      s.lockedBy = new Types.ObjectId(actorId);
      s.lockedAt = now;
    }
  }
  c.markModified('status');
  c.markModified('approval');

  c.workflowStatus = CaseWorkflowStatus.COUPLE_SUBMITTED;
  movedToCaseManager = true;

  await c.save();

  if (movedToCaseManager) {
    try {
      await this.mailService.sendMutualSubmitCompleted(c);
      await this.notifyCaseManagersOfNewCmCase(c);
    } catch (err) {
      console.error(`Failed to notify case managers and applicants for case ${c._id}`, err);
    }
  }

  return c;
}

async rejectCaseByUser(
  caseId: string,
  actorId: string,
  reason: string,
): Promise<CaseDocument> {
  const c = await this.caseModel.findById(caseId);
  if (!c) throw new NotFoundException('Case not found');

  const isOwner = c.owner?.toString() === actorId.toString();
  const isInvited = c.invitedUser?.toString() === actorId.toString();
  if (!isOwner && !isInvited) throw new ForbiddenException('Not part of case');

  const jointStatus = c.status?.jointInformation;
  if (jointStatus?.locked) {
    throw new BadRequestException('Section is already locked');
  }
  if (!jointStatus || !this.isJointReviewPending(c)) {
    throw new BadRequestException(
      'Nothing is pending review: the joint information has not been submitted yet.',
    );
  }
  if (jointStatus.submittedBy?.toString() === actorId.toString()) {
    throw new BadRequestException('You cannot disapprove your own submission');
  }

  const approval = this.ensureApprovalObj(c);
  const now = new Date();

  // Hand editing control to whoever just disapproved — THEY fix it and
  // resubmit next, not the original submitter.
  jointStatus.submitted = false;
  jointStatus.submittedBy = new Types.ObjectId(actorId);
  jointStatus.submittedAt = null;

  // Fresh round — clear both approval flags.
  approval.user1Approved = false;
  approval.user1ApprovedAt = null;
  approval.user2Approved = false;
  approval.user2ApprovedAt = null;

  if (isOwner) {
    approval.p1ReviewStatus = PartnerReviewStatus.IN_PROGRESS;
    approval.p2ReviewStatus = PartnerReviewStatus.IN_REVIEW;
  } else {
    approval.p1ReviewStatus = PartnerReviewStatus.IN_REVIEW;
    approval.p2ReviewStatus = PartnerReviewStatus.IN_PROGRESS;
  }
  approval.mutualApprovalAndSnapshot = MutualApprovalStatus.PENDING;

  approval.disapprovedBy = new Types.ObjectId(actorId);
  approval.disapprovedAt = now;
  approval.disapprovalReason = reason || null;

  const action = isOwner
    ? 'Primary Applicant — Requested Further Changes'
    : 'Secondary Applicant — Requested Changes';

  approval.reviewTimeline.push({
    action,
    actor: new Types.ObjectId(actorId),
    actorRole: isOwner ? 'PRIMARY' : 'SECONDARY',
    p1Status: approval.p1ReviewStatus,
    p2Status: approval.p2ReviewStatus,
    mutualStatus: MutualApprovalStatus.PENDING,
    timestamp: now,
    notes: reason || null,
  } as ReviewTimelineEntry);

  c.markModified('approval');
  await c.save();

  // Notify other partner that updates are requested
  try {
    const populated = await this.caseModel.findById(c._id).populate('owner invitedUser').lean().exec();
    const appUrl = this.config.get('APP_SERVER_URL') || this.config.get('APP_BASE_URL') || '';
    const caseIdDisplay = (c as any).caseNumber || c._id.toString();
    const editUrl = `${appUrl}/dashboard/joint-liabilities-debts`;

    const rejector = isOwner ? populated?.owner : populated?.invitedUser;
    const recipient = isOwner ? populated?.invitedUser : populated?.owner;

    const rejectorName = (rejector as any)?.firstName || 'Your Partner';
    const recipientName = (recipient as any)?.firstName || 'there';
    const recipientEmail = (recipient as any)?.email;

    if (recipientEmail) {
      await this.mailService.sendPartnerChangesRequested(recipientEmail, recipientName, rejectorName, caseIdDisplay, reason, editUrl);
    }
  } catch (err) {
    console.error('Failed to send partner changes requested email', err);
  }

  return c;
}

  async unlockCase(caseId: string, actorId: string): Promise<CaseDocument> {
    if (!Types.ObjectId.isValid(caseId)) {
      throw new BadRequestException('Invalid case id');
    }

    const c = await this.caseModel.findById(caseId);

    if (!c) {
      throw new NotFoundException('Case not found');
    }

    const sections = [
      'myInformation',
      'partnerInformation',
      'jointInformation',
      'independentLegalAdvice',
    ];

    c.fullyLocked = false;

    c.fullyLockedBy = null;
    c.fullyLockedAt = null;

    const now = new Date();

    for (const section of sections) {
      const s = this.ensureSectionStatus(c, section);

      s.locked = false;
      s.lockedBy = null;
      s.lockedAt = null;

      s.unlockedBy = new Types.ObjectId(actorId);

      s.unlockedAt = now;
    }

    if (c.preQuestionnaireUser1) {
      c.preQuestionnaireUser1.locked = false;
    }

    if (c.preQuestionnaireUser2) {
      c.preQuestionnaireUser2.locked = false;
    }

    await c.save();

    return c;
  }

  async updatePreQuestionnaire(
    caseId: string,
    updatePatch: any,
  ): Promise<CaseDocument> {
    if (!Types.ObjectId.isValid(caseId))
      throw new BadRequestException('Invalid case id');
    const updated = await this.caseModel
      .findByIdAndUpdate(caseId, { $set: updatePatch }, { new: true })
      .exec();
    if (!updated) throw new NotFoundException('Case not found');
    return updated;
  }
  // submitPreQuestionnaire
  async submitPreQuestionnaire(
    caseId: string,
    actorId: string,
    answers: string[],
  ): Promise<CaseDocument> {
    if (!Types.ObjectId.isValid(caseId))
      throw new BadRequestException('Invalid case id');
    if (!Array.isArray(answers))
      throw new BadRequestException('Answers must be an array');

    const c = await this.caseModel.findById(caseId).exec();
    if (!c) throw new NotFoundException('Case not found');

    // enforce workflow state
    if (c.workflowStatus !== CaseWorkflowStatus.LAWYERS_ASSIGNED) {
      throw new ForbiddenException(
        'Pre-questionnaire cannot be submitted: case not in LAWYER Selection state',
      );
    }

    if (!Types.ObjectId.isValid(actorId))
      throw new BadRequestException('Invalid actor id');
    const actorObjId = new Types.ObjectId(actorId);

    const ownerIsObj = c.owner instanceof Types.ObjectId;
    const isOwner =
      ownerIsObj && (c.owner as Types.ObjectId).equals(actorObjId);
    const isInvited =
      c.invitedUser instanceof Types.ObjectId &&
      (c.invitedUser as Types.ObjectId).equals(actorObjId);
    if (!isOwner && !isInvited)
      throw new ForbiddenException('Actor not part of this case');

    const now = new Date();
    if (isOwner) {
      if (!c.preQuestionnaireUser1)
        c.preQuestionnaireUser1 = this.makeEmptyPreQuestionnaire() as any;
      c.preQuestionnaireUser1.answers = answers ?? [];
      c.preQuestionnaireUser1.submitted = true;
      c.preQuestionnaireUser1.submittedBy = actorObjId;
      c.preQuestionnaireUser1.submittedAt = now;
    } else {
      if (!c.preQuestionnaireUser2)
        c.preQuestionnaireUser2 = this.makeEmptyPreQuestionnaire() as any;

      c.preQuestionnaireUser2.answers = answers ?? [];
      c.preQuestionnaireUser2.submitted = true;
      c.preQuestionnaireUser2.submittedBy = actorObjId;
      c.preQuestionnaireUser2.submittedAt = now;
    }

    await c.save();

    // reload populated doc for email resolution
    const populated = await this.caseModel
      .findById(c._id)
      .populate('owner invitedUser')
      .exec();

    // local resolver (does not require other service helpers)
    const resolveEmailLocal = (ref: any, fallback?: string): string | null => {
      try {
        if (!ref && fallback) return fallback;
        if (!ref) return null;
        if (typeof ref === 'string') {
          if (ref.includes('@')) return ref.trim();
          return null;
        }
        if (typeof ref === 'object') {
          const maybe = (ref as any).email;
          if (typeof maybe === 'string' && maybe.trim()) return maybe.trim();

          if (
            (ref as any).invitedEmail &&
            typeof (ref as any).invitedEmail === 'string' &&
            (ref as any).invitedEmail.includes('@')
          )
            return (ref as any).invitedEmail.trim();
        }
        return null;
      } catch (err) {
        return fallback ?? null;
      }
    };

    // formatting helpers
    const personName = (ref: any, fallback?: string) => {
      if (!ref) return fallback ?? 'Participant';
      return (
        ref.fullName ||
        ref.name ||
        (ref.firstName || ref.lastName
          ? `${ref.firstName ?? ''} ${ref.lastName ?? ''}`.trim()
          : ref.email || fallback || 'Participant')
      );
    };

    const ownerName = personName(populated?.owner, 'Owner');
    const invitedName = personName(populated?.invitedUser ?? 'Invited user');

    const taskStatus = (done: boolean) => (done ? 'COMPLETED' : 'PENDING');
    const taskLines = [
      `Task 1 - ${ownerName} Pre-Lawyer Questionnaire\n\nStatus: ${taskStatus(!!(c.preQuestionnaireUser1 && c.preQuestionnaireUser1.submitted))}`,
      `Task 2 - ${ownerName} Lawyer Selection\n\nStatus: ${taskStatus(!!(c.preQuestionnaireUser1 && c.preQuestionnaireUser1.selectedLawyer))}`,
      `Task 3 - ${invitedName} Pre-Lawyer Questionnaire\n\nStatus: ${taskStatus(!!(c.preQuestionnaireUser2 && c.preQuestionnaireUser2.submitted))}`,
      `Task 4 - ${invitedName} Lawyer Selection\n\nStatus: ${taskStatus(!!(c.preQuestionnaireUser2 && c.preQuestionnaireUser2.selectedLawyer))}`,
    ];

    const actorDisplayName = isOwner ? ownerName : invitedName;
    const subject = `Agreement update — case ${c.caseNumber ?? c._id}`;
    const bodyText = `Hello!

${actorDisplayName} has completed the pre-lawyer questionnaire.

Thank you for completing all steps. You will be connected with your lawyers within 15 minutes.

${taskLines.join('\n\n')}`;

    // resolve recipient emails (owner and invited). use ?? undefined to avoid null
    const ownerEmail = resolveEmailLocal(populated?.owner);
    const invitedEmail = resolveEmailLocal(
      populated?.invitedUser,
      populated?.invitedEmail ?? undefined,
    );

    const recipients = Array.from(
      new Set([ownerEmail, invitedEmail].filter(Boolean) as string[]),
    );

    if (recipients.length === 0) {
      console.warn(
        `No recipient emails resolved for case ${c.caseNumber ?? c._id} after pre-questionnaire submission`,
      );
    } else {
      await Promise.all(
        recipients.map(async (r) => {
          try {
            if (typeof (this.mailService as any).sendMail === 'function') {
              await (this.mailService as any).sendMail(r, subject, bodyText);
            } else if (
              typeof (this.mailService as any).sendRaw === 'function'
            ) {
              await (this.mailService as any).sendRaw({
                to: r,
                subject,
                text: bodyText,
              });
            } else {
              console.warn(
                'mailService send methods not available; skipping email send',
              );
            }
          } catch (err) {
            console.error(
              `Failed to send pre-questionnaire notification to ${r} for case ${c.caseNumber ?? c._id}`,
              err,
            );
          }
        }),
      );
    }

    // complete transition if both submitted
    const p1Submitted = !!(
      c.preQuestionnaireUser1 && c.preQuestionnaireUser1.submitted
    );
    const p2Submitted = !!(
      c.preQuestionnaireUser2 && c.preQuestionnaireUser2.submitted
    );
    // Bug 5 fix: when both partners finish the pre-questionnaire the case
    // was already in LAWYERS_ASSIGNED; advance it to PRE_LAWYER_COMPLETED.
    if (p1Submitted && p2Submitted) {
      c.workflowStatus = CaseWorkflowStatus.PRE_LAWYER_COMPLETED;
      await c.save();

      // notify both users using mailService helper (it internally resolves emails)
      try {
        if (
          typeof (this.mailService as any).sendFirstPhaseCompletedForCase ===
          'function'
        ) {
          await (this.mailService as any).sendFirstPhaseCompletedForCase(
            populated,
          );
        }
      } catch (err) {
        console.error(
          `Failed to send first-phase completed email for case ${c.caseNumber ?? c._id}`,
          err,
        );
      }

      // notify case managers (keep original behavior)
      try {
        await this.notifyCaseManagersOfNewCmCase(c);
      } catch (err) {
        console.error(`Failed to notify case managers for case ${c.caseNumber ?? c._id}`, err);
      }
    }

    return c;
  }

  async setInviteCredentials(
    caseId: string,
    creds: { email: string; password: string; createdAt: Date },
  ) {
    if (!Types.ObjectId.isValid(caseId))
      throw new BadRequestException('Invalid case id');
    return this.caseModel
      .findByIdAndUpdate(
        caseId,
        { inviteCredentials: creds },
        { new: true, useFindAndModify: false },
      )
      .exec();
  }

  // Unlinks the partner from the case and clears what they entered, so the
  // owner can invite someone (including the same person) again. The case, its
  // Case ID and the owner's own answers are untouched.
  private async clearPartnerFromCase(caseId: string): Promise<void> {
    const updated = await this.caseModel.findByIdAndUpdate(
      caseId,
      {
        $set: {
          invitedUser: null,
          invitedEmail: null,
          partnerInvited: false,
          inviteToken: null,
          inviteTokenExpires: null,
          partnerInviteDetails: {},

          partnerInformation: {},
          'status.partnerInformation.submitted': false,
          'status.partnerInformation.submittedBy': null,
          'status.partnerInformation.submittedAt': null,

          preQuestionnaireUser2: this.makeEmptyPreQuestionnaire(),
          'approval.user2Approved': false,
          'approval.user2ApprovedAt': null,
          'approval.p2ReviewStatus': PartnerReviewStatus.IN_PROGRESS,
        },
      },
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException('Case not found');
    }
  }

  // Removes the partner from a case. Allowed for the case owner (early
  // stages only), Case Managers and Admins. The partner's account is NOT
  // deleted: it is released so they can accept a fresh invitation (or start
  // their own matter). Their answers are snapshotted before being cleared.
  async removePartner(
    caseId: string,
    actor: { id: string; role?: string },
    reason?: string,
  ) {
    if (!Types.ObjectId.isValid(caseId)) {
      throw new BadRequestException('Invalid case id');
    }
    const c = await this.caseModel.findById(caseId);
    if (!c) throw new NotFoundException('Case not found');

    const privileged = this.isPrivilegedRole(actor.role);
    if (!privileged && c.owner.toString() !== actor.id) {
      throw new ForbiddenException(
        'Only the case owner, a case manager or an admin can remove the partner',
      );
    }
    if (!c.invitedUser) {
      throw new BadRequestException('No partner is linked to this case');
    }
    if (
      [
        CaseWorkflowStatus.COMPLETED,
        CaseWorkflowStatus.ARCHIVED,
        CaseWorkflowStatus.CANCELLED,
      ].includes(c.workflowStatus)
    ) {
      throw new BadRequestException(
        'The partner cannot be removed from a closed case',
      );
    }
    if (
      !privileged &&
      ![CaseWorkflowStatus.NOT_PAID, CaseWorkflowStatus.DRAFT].includes(
        c.workflowStatus,
      )
    ) {
      throw new ForbiddenException(
        'Your case is already under review. Please ask your case manager to remove your partner.',
      );
    }

    const partnerId = c.invitedUser;
    const [partner, owner] = await Promise.all([
      this.userModel.findById(partnerId).select('email firstName').lean().exec(),
      this.userModel.findById(c.owner).select('email firstName').lean().exec(),
    ]);

    // Keep the partner's answers before they are cleared.
    await this.createQuestionnaireBackup(caseId, actor.id);
    await this.clearPartnerFromCase(caseId);

    await this.userModel.updateOne(
      { _id: partnerId, inviteCaseId: c._id },
      { $set: { endUserType: 'user1', invitedBy: null, inviteCaseId: null } },
    );
    await this.userModel.updateOne(
      { _id: c.owner },
      { $set: { invitedUser: null } },
    );
    await this.partnerInvites.markRemoved(caseId, actor.id, reason);
    await this.audit(
      c._id,
      actor.id,
      'PARTNER_REMOVED',
      reason?.trim() || undefined,
      { oldValue: { partnerId, partnerEmail: partner?.email ?? null } },
    );

    const caseLabel = c.caseNumber ?? String(c._id);
    const note = (to?: string | null, text?: string) =>
      to && text
        ? this.mailService
            .sendMail(to, `Update to case ${caseLabel}`, text)
            .catch((err) =>
              console.error('Failed to send partner removal email', err),
            )
        : Promise.resolve();
    await Promise.all([
      note(
        partner?.email,
        `Hi ${partner?.firstName || 'there'},\n\nYou have been removed from case ${caseLabel}. Your account has not been deleted. You can sign in at any time to start your own matter or accept a new invitation.\n\nLets Prenup`,
      ),
      note(
        owner?.email,
        `Hi ${owner?.firstName || 'there'},\n\nYour partner has been removed from case ${caseLabel}. You can now invite a partner again from your dashboard.\n\nLets Prenup`,
      ),
    ]);

    return { message: 'Partner removed successfully' };
  }

  private ensureApprovalObj(c: CaseDocument) {
    (c as any).approval = (c as any).approval || {
      user1Approved: false,
      user1ApprovedAt: null,
      user2Approved: false,
      user2ApprovedAt: null,
      p1ReviewStatus: PartnerReviewStatus.IN_PROGRESS,
      p2ReviewStatus: PartnerReviewStatus.IN_PROGRESS,
      mutualApprovalAndSnapshot: MutualApprovalStatus.PENDING,
      mutualApprovalCompletedAt: null,
      reviewTimeline: [],
      snapshotData: null,
      disapprovedBy: null,
      disapprovedAt: null,
      disapprovalReason: null,
      lawyerApproved: false,
      lawyerApprovedAt: null,
      approvedLawyer: null,
      caseManagerApproved: false,
      caseManagerApprovedAt: null,
      approvedBy: null,
    };
    const a = (c as any).approval;
    if (!a.p1ReviewStatus) a.p1ReviewStatus = PartnerReviewStatus.IN_PROGRESS;
    if (!a.p2ReviewStatus) a.p2ReviewStatus = PartnerReviewStatus.IN_PROGRESS;
    if (!a.mutualApprovalAndSnapshot)
      a.mutualApprovalAndSnapshot = MutualApprovalStatus.PENDING;
    if (!a.reviewTimeline) a.reviewTimeline = [];
    return a;
  }


  async approveCaseByManager(
    caseId: string,
    actorId: string,
  ): Promise<CaseDocument> {
    if (!Types.ObjectId.isValid(caseId))
      throw new BadRequestException('Invalid case id');
    const c = await this.caseModel.findById(caseId);
    if (!c) throw new NotFoundException('Case not found');
    const approval = this.ensureApprovalObj(c);
    approval.caseManagerApproved = true;
    approval.caseManagerApprovedAt = new Date();
    (approval as any).approvedBy = new Types.ObjectId(actorId);
    await c.save();
    if (
      approval.user1Approved &&
      approval.user2Approved &&
      approval.caseManagerApproved
    ) {
      c.workflowStatus = CaseWorkflowStatus.LAWYERS_ASSIGNED;
      c.fullyLocked = true;
      await c.save();

      await this.notifyUsersToCompletePreLawyer(c);
    }
    return c;
  }
  
  
  async updateCase(
    caseId: string,
    updateData: any,
    userId: string,
  ): Promise<CaseDocument> {
    if (!Types.ObjectId.isValid(caseId)) {
      throw new BadRequestException('Invalid case id');
    }
    const c = await this.caseModel.findById(caseId);
    if (!c) throw new NotFoundException('Case not found');

    if (updateData.priority !== undefined) {
      c.priority = String(updateData.priority).toUpperCase();
    }
    if (updateData.title !== undefined) {
      c.title = updateData.title;
    }
    await c.save();
    return c;
  }

  async assignCaseManager(
    caseId: string,
    managerId: string,
    actorId: string,
    actorRole?: string,
  ): Promise<CaseDocument> {
    if (!Types.ObjectId.isValid(caseId))
      throw new BadRequestException('Invalid case id');

    const c = await this.caseModel.findById(caseId);
    if (!c) throw new NotFoundException('Case not found');

    if (!managerId || managerId === 'unassign') {
      (c as any).assignedCaseManager = null;
      await c.save();
      return c;
    }

    if (!Types.ObjectId.isValid(managerId))
      throw new BadRequestException('Invalid manager id');

    (c as any).assignedCaseManager = new Types.ObjectId(managerId);

    if (!c.workflowStatus || c.workflowStatus === CaseWorkflowStatus.DRAFT) {
      c.workflowStatus = CaseWorkflowStatus.COUPLE_SUBMITTED;
    }
    await c.save();
    const populated = await this.caseModel
      .findById(c._id)
      .populate('assignedCaseManager owner invitedUser')
      .exec();
    const cmObj = (populated as any).assignedCaseManager;
    const cmDetails = {
      name: cmObj && cmObj.name ? cmObj.name : 'Case Manager',
      email: cmObj && cmObj.email ? cmObj.email : null,
      phone: cmObj && cmObj.phone ? cmObj.phone : null,
    };
    const recipients: { email: string; name?: string }[] = [];
    const ownerObj = (populated as any).owner;
    const invitedObj = (populated as any).invitedUser;
    if (ownerObj && typeof ownerObj === 'object' && ownerObj.email)
      recipients.push({ email: ownerObj.email, name: ownerObj.name });
    if (invitedObj && typeof invitedObj === 'object' && invitedObj.email)
      recipients.push({ email: invitedObj.email, name: invitedObj.name });
    if (c.invitedEmail && !invitedObj)
      recipients.push({ email: c.invitedEmail });
    const uniqueRecipients = Array.from(
      new Map(recipients.map((r) => [r.email, r])).values(),
    );
    const subject = `Your case ${c.caseNumber ?? c._id} has been assigned a Case Manager`;
    const body = `Hello,

Your case (${c.caseNumber ?? c._id}) has been assigned to a Case Manager.

Case Manager details:
Name: ${cmDetails.name}
${cmDetails.email ? `Email: ${cmDetails.email}\n` : ''}
${cmDetails.phone ? `Phone: ${cmDetails.phone}\n` : ''}

Please expect contact from them shortly.


Regards,
Lets Prenup
`;
    if (
      uniqueRecipients.length > 0 &&
      typeof (this.mailService as any).sendMail === 'function'
    ) {
      for (const to of uniqueRecipients) {
        try {
          await (this.mailService as any).sendMail(to.email, subject, body);
        } catch (e) {}
      }
    }
    return c;
  }
  async changeWorkflowStatus(
    caseId: string,
    status: string,
    actorId: string,
  ): Promise<CaseDocument> {
    if (!Types.ObjectId.isValid(caseId))
      throw new BadRequestException('Invalid case id');
    const c = await this.caseModel.findById(caseId);
    if (!c) throw new NotFoundException('Case not found');
    const normalized = (status || '').toUpperCase();
    if (!['CM', 'PAID', 'LAWYER'].includes(normalized))
      throw new BadRequestException('Invalid status');
    if (normalized === 'CM') {
      c.workflowStatus = CaseWorkflowStatus.COUPLE_SUBMITTED;
      if (!c.assignedCaseManager)
        c.assignedCaseManager = Types.ObjectId.isValid(actorId)
          ? new Types.ObjectId(actorId)
          : null;
      await c.save();
      await this.notifyCaseManagersOfNewCmCase(c);
      return c;
    }
    if (normalized === 'PAID') {
      c.workflowStatus = CaseWorkflowStatus.DRAFT;
      c.fullyLocked = false;
      c.fullyLockedBy = null;
      c.fullyLockedAt = null;
      if (c.preQuestionnaireUser1) {
        c.preQuestionnaireUser1.submitted = false;
        c.preQuestionnaireUser1.submittedBy = null;

        c.preQuestionnaireUser1.submittedAt = null;
      }
      if (c.preQuestionnaireUser2) {
        c.preQuestionnaireUser2.submitted = false;
        c.preQuestionnaireUser2.submittedBy = null;
        c.preQuestionnaireUser2.submittedAt = null;
      }
      const sections = [
        'myInformation',
        'partnerInformation',
        'jointInformation',
        'independentLegalAdvice',
      ];

      for (const section of sections) {
        const s = this.ensureSectionStatus(c, section);

        s.locked = false;
        s.lockedBy = null;
        s.lockedAt = null;

        s.unlockedBy = Types.ObjectId.isValid(actorId)
          ? new Types.ObjectId(actorId)
          : null;

        s.unlockedAt = new Date();
      }
      await c.save();
      await this.notifyUsersCaseMovedToPaid(c);
      return c;
    }
    if (normalized === 'LAWYERS_ASSIGNED') {
      c.workflowStatus = CaseWorkflowStatus.LAWYERS_ASSIGNED;
      c.fullyLocked = true;
      c.fullyLockedBy = Types.ObjectId.isValid(actorId)
        ? new Types.ObjectId(actorId)
        : null;
      c.fullyLockedAt = new Date();
      await c.save();
      await this.notifyUsersToCompletePreLawyer(c);
      return c;
    }
    return c;
  }
  private async notifyCaseManagersOfNewCmCase(c: CaseDocument) {
    try {
      if (
        this.mailService &&
        typeof (this.mailService as any).sendCaseManagerIntimation ===
          'function'
      ) {
        await (this.mailService as any).sendCaseManagerIntimation(c);
        return;
      }
    } catch (e) {}
    const env = this.config.get('CASE_MANAGER_EMAILS') || '';
    const emails = (env as string)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const subject = `New case ready for Case Manager — ${c.caseNumber ?? c._id}`;
    const body = `A case has reached the Case Manager stage.

Case: ${c.caseNumber ?? c._id}
Title: ${(c as any).title ?? 'N/A'}

Please login to the platform to review and manage this case.
`;
    if (
      emails.length > 0 &&
      typeof (this.mailService as any).sendMail === 'function'
    ) {
      for (const to of emails) {
        try {
          await (this.mailService as any).sendMail(to, subject, body);
        } catch (e) {}
      }
    }
  }
  private async notifyUsersToCompletePreLawyer(c: CaseDocument) {
    const populated = await this.caseModel
      .findById(c._id)
      .populate('owner invitedUser')
      .exec();
    const recipients: string[] = [];
    if ((populated as any).owner && (populated as any).owner.email)
      recipients.push((populated as any).owner.email);
    if ((populated as any).invitedUser && (populated as any).invitedUser.email)
      recipients.push((populated as any).invitedUser.email);
    else if (c.invitedEmail) recipients.push(c.invitedEmail);
    const uniqueRecipients = Array.from(new Set(recipients)).filter(
      Boolean,
    ) as string[];
    const subject = `Next steps — please complete pre-lawyer questionnaire and select a lawyer`;
    const body = `Hi,

Thank you both for your emails.

To move forward, could you each please access the platform, complete the pre-lawyer questionnaire, and select your lawyers?

On the platform you will see a selection of lawyers to choose from, you will notice that some are £300 inclusive of VAT or VAT exempt, and others are £300 + VAT. You are both of course welcome to choose whichever lawyers you prefer, the difference is that there would be £60 of VAT applicable to the hourly rate of the lawyers who charge VAT.

Each of you needs to select a different lawyer, and your lawyers cannot work at the same law firm. This ensures that both of you will receive independent legal advice. Please note, you will each need to complete all 4 steps in the process before you are connected to your lawyers.

If you have any questions or need further assistance with these steps, please don’t hesitate to reach out. 

Best wishes,

Your Case Manager
`;
    if (
      uniqueRecipients.length > 0 &&
      typeof (this.mailService as any).sendMail === 'function'
    ) {
      for (const to of uniqueRecipients) {
        try {
          await (this.mailService as any).sendMail(to, subject, body);
        } catch (e) {}
      }
    }
  }
  private async notifyUsersCaseMovedToPaid(c: CaseDocument) {
    const populated = await this.caseModel
      .findById(c._id)
      .populate('owner invitedUser')
      .exec();
    const recipients: string[] = [];
    if ((populated as any).owner && (populated as any).owner.email)
      recipients.push((populated as any).owner.email);
    if ((populated as any).invitedUser && (populated as any).invitedUser.email)
      recipients.push((populated as any).invitedUser.email);
    else if (c.invitedEmail) recipients.push(c.invitedEmail);
    const uniqueRecipients = Array.from(new Set(recipients)).filter(
      Boolean,
    ) as string[];
    const subject = `Case moved to PAID — please re-open pre-questionnaire`;
    const body = `Hi,

Your case ${c.caseNumber ?? c._id} has been moved to 'Paid' by the Case Manager. This means the pre-lawyer questionnaire statuses have been reset and you can now update your answers.

Please login to the platform and edit your pre-lawyer questionnaire and required steps.

Regards,
Lets Prenup
`;
    if (
      uniqueRecipients.length > 0 &&
      typeof (this.mailService as any).sendMail === 'function'
    ) {
      for (const to of uniqueRecipients) {
        try {
          await (this.mailService as any).sendMail(to, subject, body);
        } catch (e) {}
      }
    }
  }

  async getQuestionnaireSection(
    caseId: string,
    sectionName: string,
    user: any,
  ) {
    if (!Types.ObjectId.isValid(caseId)) {
      throw new BadRequestException('Invalid case id');
    }

    const c = await this.caseModel.findById(caseId);

    if (!c) {
      throw new NotFoundException('Case not found');
    }

    const isPrivileged = this.isPrivilegedRole(user?.role);

    if (!isPrivileged) {
      const uid = (user?.id ?? user?._id)?.toString();

      if (c.owner?.toString() !== uid && c.invitedUser?.toString() !== uid) {
        throw new ForbiddenException('Forbidden');
      }
    }

    const sections = {
      myInformation: c.myInformation,

      partnerInformation: c.partnerInformation,

      jointInformation: c.jointInformation,

      independentLegalAdvice: c.independentLegalAdvice,
    };

    const status = (c.status as any)?.[sectionName] || {
      submitted: false,
      submittedBy: null,
      submittedAt: null,
      locked: false,
      lockedBy: null,
      lockedAt: null,
      unlockedBy: null,
      unlockedAt: null,
    };

    const data = (sections as any)[sectionName];

    if (!data) {
      throw new BadRequestException('Unknown section');
    }

    return {
      section: sectionName,
      data,
      status,
      fullyLocked: !!c.fullyLocked,
    };
  }

  private determineWorkflowStatus(c: CaseDocument): CaseWorkflowStatus {
    if (!c.paymentCompleted) {
      return CaseWorkflowStatus.NOT_PAID;
    }

    if (!c.approval?.user1Approved || !c.approval?.user2Approved) {
      return CaseWorkflowStatus.DRAFT;
    }

    if (
      c.approval.user1Approved &&
      c.approval.user2Approved &&
      !c.approval.caseManagerApproved
    ) {
      return CaseWorkflowStatus.COUPLE_SUBMITTED;
    }

    if (c.approval.caseManagerApproved) {
      return CaseWorkflowStatus.CM_APPROVED;
    }

    return CaseWorkflowStatus.DRAFT;
  }

  async getCasesByStatus(userId: string, status: string) {
    return this.caseModel
      .find({
        assignedCaseManager: new Types.ObjectId(userId),
        workflowStatus: status,
      })
      .populate('owner invitedUser assignedCaseManager')
      .sort({ createdAt: -1 })
      .exec();
  }


  async createQuestionnaireBackup(
    caseId: string,
    userId: string,
  ) {
    const caseDoc =
      await this.caseModel.findById(caseId);

    if (!caseDoc) {
      throw new NotFoundException(
        'Case not found',
      );
    }

    await this.questionnaireBackupModel.create({
      caseId,
      createdBy: userId,

      snapshot: {
        myInformation:
          caseDoc.myInformation,

        partnerInformation:
          caseDoc.partnerInformation,

        jointInformation:
          caseDoc.jointInformation,

        workflowStatus:
          caseDoc.workflowStatus,
      },
    });

    return {
      success: true,
      message:
        'Questionnaire backup created',
    };
  }

  async revertQuestionnaire(
    caseId: string,
    userId: string,
  ) {
    const backup =
      await this.questionnaireBackupModel
        .findOne({
          caseId,
        })
        .sort({
          createdAt: -1,
        });

    if (!backup) {
      throw new NotFoundException(
        'No questionnaire backup found',
      );
    }

    await this.caseModel.findByIdAndUpdate(
      caseId,
      {
        myInformation:
          backup.snapshot.myInformation,

        partnerInformation:
          backup.snapshot.partnerInformation,

        jointInformation:
          backup.snapshot.jointInformation,

        workflowStatus:
          backup.snapshot.workflowStatus,
      },
    );

    return {
      success: true,
      message:
        'Questionnaire restored from backup',
    };
  }

  async getCaseStages(caseId: string): Promise<any> {
    const c = await this.caseModel
      .findById(caseId)
      .populate('owner invitedUser')
      .exec();

    if (!c) throw new NotFoundException('Case not found');

    let invite: any = null;
    try {
      invite = await this.partnerInvites.latest(caseId);
    } catch {
      invite = null;
    }

    // Stage A: Applicant Draft Created
    const stageA = {
      id: 'A',
      name: 'Applicant Draft Created',
      status: 'Completed',
      createdAt: (c as any).createdAt || null,
    };

    // ── Stage 1: Registration and Payment ──────────────────────────────────
    // Sub-item statuses use the exact enum values from the spreadsheet.

    // Invited: Pending | Sent | Accepted | Expired
    let inviteStatus: 'Pending' | 'Sent' | 'Accepted' | 'Expired' = 'Pending';
    if (invite) {
      if (invite.status === 'ACCEPTED' || c.invitedUser) {
        inviteStatus = 'Accepted';
      } else if (invite.status === 'EXPIRED') {
        inviteStatus = 'Expired';
      } else {
        inviteStatus = 'Sent';
      }
    } else if (c.invitedEmail || c.partnerInvited) {
      inviteStatus = c.invitedUser ? 'Accepted' : 'Sent';
    }

    // Partner Joined: Pending | Completed
    const partnerJoinedStatus: 'Pending' | 'Completed' =
      Boolean(c.invitedUser) ? 'Completed' : 'Pending';

    // Payment Completed: Pending | Initiated | Failed | Completed | Refunded
    type PaymentItemStatus = 'Pending' | 'Initiated' | 'Failed' | 'Completed' | 'Refunded';
    let paymentItemStatus: PaymentItemStatus = 'Pending';
    if (c.paymentCompleted || c.paymentStatus === PaymentStatus.COMPLETED) {
      paymentItemStatus = 'Completed';
    } else if (c.paymentStatus === PaymentStatus.INITIATED) {
      paymentItemStatus = 'Initiated';
    } else if (c.paymentStatus === PaymentStatus.FAILED) {
      paymentItemStatus = 'Failed';
    } else if (c.paymentStatus === PaymentStatus.REFUNDED) {
      paymentItemStatus = 'Refunded';
    }

    // Stage 1 overall: Completed only when all 3 required items are done
    const stage1AllDone =
      inviteStatus === 'Accepted' &&
      partnerJoinedStatus === 'Completed' &&
      paymentItemStatus === 'Completed';
    const stage1AnyStarted =
      inviteStatus !== 'Pending' ||
      partnerJoinedStatus === 'Completed' ||
      paymentItemStatus !== 'Pending';
    const stage1Status: 'Pending' | 'In Progress' | 'Completed' =
      stage1AllDone ? 'Completed' : stage1AnyStarted ? 'In Progress' : 'Pending';

    const stage1 = {
      id: '1',
      name: 'Registration and Payment',
      status: stage1Status,
      items: [
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
          possibleStatuses: ['Pending', 'Sent', 'Accepted', 'Expired'],
        },
        {
          key: 'partnerJoined',
          label: 'Partner Joined',
          status: partnerJoinedStatus,
          possibleStatuses: ['Pending', 'Completed'],
        },
        {
          key: 'paymentCompleted',
          label: 'Payment Completed',
          status: paymentItemStatus,
          possibleStatuses: ['Pending', 'Initiated', 'Failed', 'Completed', 'Refunded'],
        },
      ],
    };

    // ── Shared helper: derive a sub-section status from saved data + submitted flag ──
    // Priority: if the parent section is submitted → Completed.
    // Otherwise, check whether the sub-object has any filled keys.
    const subSectionStatus = (
      data: any,
      parentSubmitted: boolean,
    ): 'Pending' | 'In Progress' | 'Completed' => {
      if (parentSubmitted) return 'Completed';
      if (!data || typeof data !== 'object') return 'Pending';
      const plain =
        typeof (data as any).toObject === 'function'
          ? (data as any).toObject()
          : data;
      const keys = Object.keys(plain);
      if (keys.length === 0) return 'Pending';
      const filled = keys.filter((k) => {
        const v = plain[k];
        if (v === null || v === undefined || v === '') return false;
        if (Array.isArray(v)) return v.length > 0;
        if (typeof v === 'object') return Object.keys(v).length > 0;
        return true;
      }).length;
      if (filled === 0) return 'Pending';
      if (filled >= keys.length) return 'Completed';
      return 'In Progress';
    };

    // ── Stage 2: Application - Primary Applicant ────────────────────────────
    // 6 personal sub-sections + 4 joint sub-sections = 10 total.
    // The section-level "submitted" flag is the authoritative source for
    // Completed; individual sub-section statuses use data presence + that flag.
    const myInfo = (c.myInformation as any) || {};
    const jointInfo = (c.jointInformation as any) || {};
    const myInfoSubmitted = Boolean(c.status?.myInformation?.submitted);
    const jointInfoSubmitted = Boolean(c.status?.jointInformation?.submitted);

    const stage2Sections = [
      {
        key: 'personalInformation',
        label: 'Personal Information',
        status: subSectionStatus(myInfo.personalInformation, myInfoSubmitted),
        possibleStatuses: ['Pending', 'In Progress', 'Completed'],
      },
      {
        key: 'legalDeclaration',
        label: 'Legal Declaration',
        status: subSectionStatus(myInfo.legalDeclaration, myInfoSubmitted),
        possibleStatuses: ['Pending', 'In Progress', 'Completed'],
      },
      {
        key: 'familyAndDependents',
        label: 'Family & Dependents',
        status: subSectionStatus(myInfo.familyAndDependents, myInfoSubmitted),
        possibleStatuses: ['Pending', 'In Progress', 'Completed'],
      },
      {
        key: 'assets',
        label: 'Assets',
        status: subSectionStatus(
          myInfo.individualAssets ?? myInfo.assets,
          myInfoSubmitted,
        ),
        possibleStatuses: ['Pending', 'In Progress', 'Completed'],
      },
      {
        key: 'incomeAndRevenue',
        label: 'Income & Revenue',
        status: subSectionStatus(myInfo.incomeAndRevenue, myInfoSubmitted),
        possibleStatuses: ['Pending', 'In Progress', 'Completed'],
      },
      {
        key: 'liabilitiesAndDebts',
        label: 'Liabilities & Debts',
        status: subSectionStatus(myInfo.liabilitiesAndDebts, myInfoSubmitted),
        possibleStatuses: ['Pending', 'In Progress', 'Completed'],
      },
      // Joint sub-sections (filled by P1, reviewed jointly)
      {
        key: 'jointAssets',
        label: 'Joint Assets',
        status: subSectionStatus(jointInfo.jointAssets, jointInfoSubmitted),
        possibleStatuses: ['Pending', 'In Progress', 'Completed'],
      },
      {
        key: 'jointIncomeAndRevenue',
        label: 'Joint Income & Revenue',
        status: subSectionStatus(jointInfo.jointIncomeAndRevenue, jointInfoSubmitted),
        possibleStatuses: ['Pending', 'In Progress', 'Completed'],
      },
      {
        key: 'jointLiabilitiesAndDebts',
        label: 'Joint Liabilities & Debts',
        status: subSectionStatus(jointInfo.jointLiabilitiesAndDebts, jointInfoSubmitted),
        possibleStatuses: ['Pending', 'In Progress', 'Completed'],
      },
      {
        key: 'matrimonialAgreement',
        label: 'Matrimonial Agreement & Review',
        status: subSectionStatus(jointInfo.matrimonialAgreement, jointInfoSubmitted),
        possibleStatuses: ['Pending', 'In Progress', 'Completed'],
      },
    ];

    // Stage 2 overall: Completed when myInformation section is submitted;
    // In Progress when any sub-section has data; Pending otherwise.
    const stage2OverallStatus: 'Pending' | 'In Progress' | 'Completed' = (() => {
      if (myInfoSubmitted) return 'Completed';
      if (stage2Sections.some((s) => s.status !== 'Pending')) return 'In Progress';
      return 'Pending';
    })();

    const stage2 = {
      id: '2',
      name: 'Application - Primary Applicant',
      status: stage2OverallStatus,
      possibleStatuses: ['Pending', 'In Progress', 'Completed'],
      submitted: myInfoSubmitted,
      sections: stage2Sections,
    };

    // ── Stage 3: Application - Secondary Applicant ──────────────────────────
    // 6 personal sub-sections filled by the invited partner.
    const partnerInfo = (c.partnerInformation as any) || {};
    const partnerInfoSubmitted = Boolean(c.status?.partnerInformation?.submitted);

    const stage3Sections = [
      {
        key: 'personalInformation',
        label: 'Personal Information',
        status: subSectionStatus(partnerInfo.personalInformation, partnerInfoSubmitted),
        possibleStatuses: ['Pending', 'In Progress', 'Completed'],
      },
      {
        key: 'legalDeclaration',
        label: 'Legal Declaration',
        status: subSectionStatus(partnerInfo.legalDeclaration, partnerInfoSubmitted),
        possibleStatuses: ['Pending', 'In Progress', 'Completed'],
      },
      {
        key: 'familyAndDependents',
        label: 'Family & Dependents',
        status: subSectionStatus(partnerInfo.familyAndDependents, partnerInfoSubmitted),
        possibleStatuses: ['Pending', 'In Progress', 'Completed'],
      },
      {
        key: 'assets',
        label: 'Assets',
        status: subSectionStatus(
          partnerInfo.individualAssets ?? partnerInfo.assets,
          partnerInfoSubmitted,
        ),
        possibleStatuses: ['Pending', 'In Progress', 'Completed'],
      },
      {
        key: 'incomeAndRevenue',
        label: 'Income & Revenue',
        status: subSectionStatus(partnerInfo.incomeAndRevenue, partnerInfoSubmitted),
        possibleStatuses: ['Pending', 'In Progress', 'Completed'],
      },
      {
        key: 'liabilitiesAndDebts',
        label: 'Liabilities & Debts',
        status: subSectionStatus(partnerInfo.liabilitiesAndDebts, partnerInfoSubmitted),
        possibleStatuses: ['Pending', 'In Progress', 'Completed'],
      },
    ];

    // Stage 3 overall: same derivation as stage 2
    const stage3OverallStatus: 'Pending' | 'In Progress' | 'Completed' = (() => {
      if (partnerInfoSubmitted) return 'Completed';
      if (stage3Sections.some((s) => s.status !== 'Pending')) return 'In Progress';
      return 'Pending';
    })();

    const stage3 = {
      id: '3',
      name: 'Application - Secondary Applicant',
      status: stage3OverallStatus,
      possibleStatuses: ['Pending', 'In Progress', 'Completed'],
      submitted: partnerInfoSubmitted,
      sections: stage3Sections,
    };

    // Stage 4: Partner Review Stage
    const approval = c.approval || ({} as any);
    const p1Status =
      approval.p1ReviewStatus ||
      (approval.user1Approved
        ? PartnerReviewStatus.FINAL_SUBMIT
        : PartnerReviewStatus.IN_PROGRESS);
    const p2Status =
      approval.p2ReviewStatus ||
      (approval.user2Approved
        ? PartnerReviewStatus.APPROVED
        : PartnerReviewStatus.IN_PROGRESS);
    const mutualStatus =
      approval.mutualApprovalAndSnapshot ||
      (approval.user1Approved && approval.user2Approved
        ? MutualApprovalStatus.COMPLETED
        : MutualApprovalStatus.PENDING);
    const timeline = approval.reviewTimeline || [];

    // Determine Scenario & Step
    let scenario = 'Scenario A — P2 approves without making changes';
    let currentStep = 1;
    let currentAction = 'Completing the package';

    // Bug 3 fix: only match the explicit action string so that P2 merely
    // approving (actorRole=SECONDARY) is not mistaken for making changes.
    const p2MadeChanges = timeline.some(
      (t: any) => t.action?.includes('Secondary Applicant — Changes Submitted'),
    );
    const p1MadeFurtherChanges = timeline.some(
      (t: any) =>
        t.action?.includes('Primary Applicant — Changes Submitted') ||
        t.action?.includes('Primary Applicant — Submitted Updated Version'),
    );

    if (p1MadeFurtherChanges) {
      scenario = 'Scenario C — P2 makes changes; P1 makes further changes';
      // Bug 4 fix: add steps 1 & 2 so all intermediate states are reachable.
      if (mutualStatus === MutualApprovalStatus.COMPLETED) {
        currentStep = 5;
        currentAction = 'P2 approves the latest version';
      } else if (
        p1Status === PartnerReviewStatus.FINAL_SUBMIT &&
        p2Status === PartnerReviewStatus.IN_REVIEW
      ) {
        currentStep = 4;
        currentAction = 'P1 makes further changes and submits to P2';
      } else if (p2Status === PartnerReviewStatus.FINAL_SUBMIT && p1Status === PartnerReviewStatus.IN_REVIEW) {
        currentStep = 3;
        currentAction = 'P2 makes changes and submits to P1';
      } else if (p1Status === PartnerReviewStatus.FINAL_SUBMIT) {
        currentStep = 2;
        currentAction = 'P1 submits to P2';
      } else {
        currentStep = 1;
        currentAction = 'Completing the package';
      }
    } else if (p2MadeChanges) {
      scenario = 'Scenario B — P2 makes changes; P1 accepts';
      // Bug 4 fix: add steps 1 & 2 so every intermediate state is reachable.
      if (mutualStatus === MutualApprovalStatus.COMPLETED) {
        currentStep = 4;
        currentAction = 'P1 approves the updated version';
      } else if (p2Status === PartnerReviewStatus.FINAL_SUBMIT && p1Status === PartnerReviewStatus.IN_REVIEW) {
        currentStep = 3;
        currentAction = 'P2 makes changes and submits to P1';
      } else if (p1Status === PartnerReviewStatus.FINAL_SUBMIT) {
        currentStep = 2;
        currentAction = 'P1 submits to P2';
      } else {
        currentStep = 1;
        currentAction = 'Completing the package';
      }
    } else {
      scenario = 'Scenario A — P2 approves without making changes';
      if (mutualStatus === MutualApprovalStatus.COMPLETED) {
        currentStep = 3;
        currentAction = 'P2 approves without changes';
      } else if (p1Status === PartnerReviewStatus.FINAL_SUBMIT) {
        currentStep = 2;
        currentAction = 'P1 submits to P2';
      } else {
        currentStep = 1;
        currentAction = 'Completing the package';
      }
    }

    const stage4 = {
      id: '4',
      name: 'Partner Review Stage',
      status:
        mutualStatus === MutualApprovalStatus.COMPLETED
          ? 'Completed'
          : currentStep > 1
            ? 'In Progress'
            : 'Pending',
      scenario,
      currentStep,
      action: currentAction,
      p1Status,
      p2Status,
      mutualApprovalAndSnapshot: mutualStatus,
      timeline,
      locked: Boolean(c.status?.jointInformation?.locked),
    };

    return {
      caseId: c._id,
      caseNumber: c.caseNumber,
      title: c.title,
      workflowStatus: c.workflowStatus,
      stageA,
      stage1,
      stage2,
      stage3,
      stage4,
    };
  }
}
