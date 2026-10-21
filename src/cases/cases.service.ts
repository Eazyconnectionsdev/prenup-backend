// src/cases/cases.service.ts
import {
  BadRequestException,
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
import { MailService } from '../mail/mail.service';
import { InvitePartnerDto } from '../cases/dto/Invite-partner.dto';
import { PartnerInviteService } from './partner-invite.service';
import { generateCaseNumber } from '../utils/case-number.util';

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

  async create(ownerId: string, title?: string): Promise<CaseDocument> {
    const caseNumber = await generateCaseNumber(this.counterModel);

    const c = new this.caseModel({
      title: title || 'Untitled case',

      owner: new Types.ObjectId(ownerId),

      workflowStatus: CaseWorkflowStatus.NOT_PAID,

      paymentCompleted: false,

      caseNumber,
    });

    return c.save();
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
      .find({ $or: [{ owner: id }, { invitedUser: id }] })
      .exec();
  }
  async findByCaseId(
    caseId: Types.ObjectId | null,
  ): Promise<CaseDocument | null> {
    return this.caseModel.findOne({ _id: caseId }).exec();
  }
  async attachInvitedUser(
    caseId: string,
    userId: string,
  ): Promise<CaseDocument> {
    const c = await this.caseModel.findById(caseId);
    if (!c) throw new NotFoundException('Case not found');
    c.invitedUser = new Types.ObjectId(userId);
    c.inviteToken = null;
    c.inviteTokenExpires = null;
    return c.save();
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

  getInvite(caseId: string) {
    return this.partnerInvites.getForCase(caseId);
  }

  async invite(caseId: string, inviterId: string, dto: InvitePartnerDto) {
    const c = await this.caseModel.findById(caseId);

    if (!c) {
      throw new NotFoundException('Case not found');
    }

    // A partner who already joined can't be re-invited.
    await this.partnerInvites.assertCanInvite(caseId);

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

    const inviteUrl = `${this.config.get('APP_BASE_URL')}/register-partner?${params.toString()}`;
    console.log('dto.email', dto.email);
    await this.mailService.sendInvite(dto.email, inviteUrl);

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
      await this.notifyCaseManagersOfNewCmCase(c);
    } catch (err) {
      console.error(`Failed to notify case managers for case ${c._id}`, err);
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

  async deleteCaseDataForPartner(caseId: string): Promise<void> {
    if (!Types.ObjectId.isValid(caseId)) {
      throw new BadRequestException('Invalid case id');
    }

    const updated = await this.caseModel.findByIdAndUpdate(
      caseId,
      {
        $set: {
          partnerInformation: {},

          'status.partnerInformation.submitted': false,

          'status.partnerInformation.submittedBy': null,

          'status.partnerInformation.submittedAt': null,
        },
      },
      {
        new: true,
      },
    );

    if (!updated) {
      throw new NotFoundException('Case not found');
    }
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
  
  async assignCaseManager(
    caseId: string,
    managerId: string,
    actorId: string,
  ): Promise<CaseDocument> {
    if (!Types.ObjectId.isValid(caseId))
      throw new BadRequestException('Invalid case id');
    if (!managerId || !Types.ObjectId.isValid(managerId))
      throw new BadRequestException('Invalid manager id');
    const c = await this.caseModel.findById(caseId);
    if (!c) throw new NotFoundException('Case not found');
    (c as any).assignedCaseManager = new Types.ObjectId(managerId);

    c.workflowStatus = CaseWorkflowStatus.COUPLE_SUBMITTED;
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
Wenup
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
Wenup
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
