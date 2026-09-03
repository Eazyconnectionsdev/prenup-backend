// src/cases/cases.service.ts
import { BadRequestException, Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
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
  CaseWorkflowStatus
} from './schemas/case.schema';

import { Lawyer, LawyerDocument } from './schemas/lawyer.schema';
import { MailService } from '../mail/mail.service';
import { InvitePartnerDto } from '../cases/dto/Invite-partner.dto';

@Injectable()
export class CasesService {
  private DUMMY_AGREEMENT_DRIVE_LINK = 'https://drive.google.com/file/d/FAKE_GOOGLE_DRIVE_ID/view';
  constructor(@InjectModel(Case.name) private caseModel: Model<CaseDocument>, @InjectModel(Lawyer.name) private lawyerModel: Model<LawyerDocument>, private config: ConfigService, private mailService: MailService) { }
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
  private ensureSectionStatus(
    c: CaseDocument,
    section: string,
  ): SectionStatus {

    c.status = c.status || {};

    const statusAny = c.status as any;

    if (!statusAny[section]) {
      statusAny[section] =
        this.defaultSectionStatus();
    }

    return statusAny[
      section
    ] as SectionStatus;
  }
  private makeEmptyPreQuestionnaire(): PreQuestionnaire {
    return { answers: [], selectedLawyer: null, submitted: false, submittedBy: null, submittedAt: null, locked: false, lockedBy: null, lockedAt: null } as PreQuestionnaire;
  }
  public areAllSectionsSubmitted(
    c: CaseDocument,
  ): boolean {

    return !!(
      c.status?.myInformation?.submitted &&
      c.status?.partnerInformation?.submitted &&
      c.status?.jointInformation?.submitted &&
      c.status?.independentLegalAdvice
        ?.submitted
    );
  }

  async create(
    ownerId: string,
    title?: string,
  ): Promise<CaseDocument> {

    const c = new this.caseModel({
      title:
        title || 'Untitled case',

      owner:
        new Types.ObjectId(ownerId),

      workflowStatus:
        CaseWorkflowStatus.NOT_PAID,

      paymentCompleted: false,
    });

    return c.save();
  }
  async markPaymentCompleted(
    caseId: string,
    actorId: string,
  ) {

    const c =
      await this.caseModel.findById(caseId);

    if (!c) {
      throw new NotFoundException(
        'Case not found',
      );
    }

    c.paymentCompleted = true;

    c.workflowStatus =
      CaseWorkflowStatus.DRAFT;

    await c.save();

    return c;
  }


  async findById(id: string, populate = false): Promise<CaseDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const q = this.caseModel.findById(id);
    if (populate) {
      q.populate('owner invitedUser preQuestionnaireUser1.selectedLawyer preQuestionnaireUser2.selectedLawyer assignedCaseManager');
    }
    return q.exec();
  }
  async findAll(): Promise<CaseDocument[]> {
    return this.caseModel.find().exec();
  }
  async findByUser(userId: string | Types.ObjectId): Promise<CaseDocument[]> {
    const id = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    return this.caseModel.find({ $or: [{ owner: id }, { invitedUser: id }] }).exec();
  }
  async findByCaseId(caseId: Types.ObjectId | null): Promise<CaseDocument | null> {
    return this.caseModel.findOne({ _id: caseId }).exec();
  }
  async attachInvitedUser(caseId: string, userId: string): Promise<CaseDocument> {
    const c = await this.caseModel.findById(caseId);
    if (!c) throw new NotFoundException('Case not found');
    c.invitedUser = new Types.ObjectId(userId);
    c.inviteToken = null;
    c.inviteTokenExpires = null;
    return c.save();
  }


  
  async invite(
  caseId: string,
  inviterId: string,
  dto: InvitePartnerDto,
) {
  const c = await this.caseModel.findById(caseId);

  if (!c) {
    throw new NotFoundException(
      'Case not found',
    );
  }

  const token =
    crypto.randomBytes(32).toString(
      'hex',
    );

  const expires = new Date(
    Date.now() +
      Number(
        this.config.get(
          'INVITE_TOKEN_EXPIRY_HOURS',
        ) || 72,
      ) *
        3600 *
        1000,
  );

  c.invitedEmail =
    dto.email;

  c.partnerInvited = true;

  c.inviteToken = token;

  c.inviteTokenExpires = expires;

  c.partnerInviteDetails = {
    firstName: dto.firstName,
    lastName: dto.lastName,
    email: dto.email,
    mobileNumber:
      dto.mobileNumber,
    relationshipStatus:
      dto.relationshipStatus,
    targetWeddingDate:
      dto.targetWeddingDate,
    personalMessage:
      dto.personalMessage,
  };

  await c.save();

  const params =
    new URLSearchParams({
      token,
      caseId: c._id.toString(),
      email: dto.email,
      firstName:
        dto.firstName || '',
      lastName:
        dto.lastName || '',
      mobileNumber:
        dto.mobileNumber || '',
      relationshipStatus:
        dto.relationshipStatus ||
        '',
      targetWeddingDate:
        dto.targetWeddingDate
          ? new Date(
              dto.targetWeddingDate,
            ).toISOString()
          : '',
      personalMessage:
        dto.personalMessage || '',
    });

  const inviteUrl =
    `${this.config.get('APP_BASE_URL')}/register-partner?${params.toString()}`;
console.log("dto.email", dto.email)
  await this.mailService.sendInvite(
    dto.email,
    inviteUrl,
  );

  return {
    inviteUrl,
  };
}

  async updateQuestionnaireStep(
    caseId: string,
    stepName: string,
    data: any,
    actorId: string,
    isPrivileged = false,
  ): Promise<CaseDocument> {

    const c =
      await this.caseModel.findById(caseId);

    if (!c) {
      throw new NotFoundException(
        'Case not found',
      );
    }

    const config =
      this.STEP_MAP[
      stepName as keyof typeof this.STEP_MAP
      ];

    if (!config) {
      throw new BadRequestException(
        'Invalid step',
      );
    }

    const { section, field } = config;

    (c as any)[section] =
      (c as any)[section] || {};

    (c as any)[section][field] = data;

    const status =
      this.ensureSectionStatus(
        c,
        section,
      );

    status.submitted = true;
    status.submittedBy =
      new Types.ObjectId(actorId);

    status.submittedAt =
      new Date();

    if (stepName === 'review-and-sign') {

      if (
        !this.areAllSectionsSubmitted(
          c,
        )
      ) {
        throw new BadRequestException(
          'All sections must be submitted',
        );
      }

      const now = new Date();

      c.fullyLocked = true;
      c.fullyLockedAt = now;
      c.fullyLockedBy =
        new Types.ObjectId(actorId);

      for (const name of [
        'myInformation',
        'partnerInformation',
        'jointInformation',
        'independentLegalAdvice',
      ]) {
        const s =
          this.ensureSectionStatus(
            c,
            name,
          );

        s.locked = true;
        s.lockedBy =
          new Types.ObjectId(actorId);

        s.lockedAt = now;
      }
    }

    await c.save();

    return c;
  }
  async unlockCase(
    caseId: string,
    actorId: string,
  ): Promise<CaseDocument> {

    if (!Types.ObjectId.isValid(caseId)) {
      throw new BadRequestException(
        'Invalid case id',
      );
    }

    const c =
      await this.caseModel.findById(caseId);

    if (!c) {
      throw new NotFoundException(
        'Case not found',
      );
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
      const s =
        this.ensureSectionStatus(
          c,
          section,
        );

      s.locked = false;
      s.lockedBy = null;
      s.lockedAt = null;

      s.unlockedBy =
        new Types.ObjectId(actorId);

      s.unlockedAt = now;
    }

    if (c.preQuestionnaireUser1) {
      c.preQuestionnaireUser1.locked =
        false;
    }

    if (c.preQuestionnaireUser2) {
      c.preQuestionnaireUser2.locked =
        false;
    }

    await c.save();

    return c;
  }
  async updatePreQuestionnaire(caseId: string, updatePatch: any): Promise<CaseDocument> {
    if (!Types.ObjectId.isValid(caseId)) throw new BadRequestException('Invalid case id');
    const updated = await this.caseModel.findByIdAndUpdate(caseId, { $set: updatePatch }, { new: true }).exec();
    if (!updated) throw new NotFoundException('Case not found');
    return updated;
  }
  // submitPreQuestionnaire
  async submitPreQuestionnaire(caseId: string, actorId: string, answers: string[]): Promise<CaseDocument> {
    if (!Types.ObjectId.isValid(caseId)) throw new BadRequestException('Invalid case id');
    if (!Array.isArray(answers)) throw new BadRequestException('Answers must be an array');

    const c = await this.caseModel.findById(caseId).exec();
    if (!c) throw new NotFoundException('Case not found');

    // enforce workflow state
    if (c.workflowStatus !== CaseWorkflowStatus.LAWYERS_ASSIGNED) {
      throw new ForbiddenException('Pre-questionnaire cannot be submitted: case not in LAWYER Selection state');
    }

    if (!Types.ObjectId.isValid(actorId)) throw new BadRequestException('Invalid actor id');
    const actorObjId = new Types.ObjectId(actorId);

    const ownerIsObj = c.owner instanceof Types.ObjectId;
    const isOwner = ownerIsObj && (c.owner as Types.ObjectId).equals(actorObjId);
    const isInvited = c.invitedUser instanceof Types.ObjectId && (c.invitedUser as Types.ObjectId).equals(actorObjId);
    if (!isOwner && !isInvited) throw new ForbiddenException('Actor not part of this case');

    const now = new Date();
    if (isOwner) {
      if (!c.preQuestionnaireUser1) c.preQuestionnaireUser1 = this.makeEmptyPreQuestionnaire() as any;
      c.preQuestionnaireUser1.answers = answers ?? [];
      c.preQuestionnaireUser1.submitted = true;
      c.preQuestionnaireUser1.submittedBy = actorObjId;
      c.preQuestionnaireUser1.submittedAt = now;
    } else {
      if (!c.preQuestionnaireUser2) c.preQuestionnaireUser2 = this.makeEmptyPreQuestionnaire() as any;
      c.preQuestionnaireUser2.answers = answers ?? [];
      c.preQuestionnaireUser2.submitted = true;
      c.preQuestionnaireUser2.submittedBy = actorObjId;
      c.preQuestionnaireUser2.submittedAt = now;
    }

    await c.save();

    // reload populated doc for email resolution
    const populated = await this.caseModel.findById(c._id).populate('owner invitedUser').exec();

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
          if ((ref as any).invitedEmail && typeof (ref as any).invitedEmail === 'string' && (ref as any).invitedEmail.includes('@')) return (ref as any).invitedEmail.trim();
        }
        return null;
      } catch (err) {
        return fallback ?? null;
      }
    };

    // formatting helpers
    const personName = (ref: any, fallback?: string) => {
      if (!ref) return fallback ?? 'Participant';
      return (ref.fullName || ref.name || ((ref.firstName || ref.lastName) ? `${ref.firstName ?? ''} ${ref.lastName ?? ''}`.trim() : ref.email || fallback || 'Participant'));
    };

    const ownerName = personName(populated?.owner, 'Owner');
    const invitedName = personName(populated?.invitedUser ?? 'Invited user');

    const taskStatus = (done: boolean) => done ? 'COMPLETED' : 'PENDING';
    const taskLines = [
      `Task 1 - ${ownerName} Pre-Lawyer Questionnaire\n\nStatus: ${taskStatus(!!(c.preQuestionnaireUser1 && c.preQuestionnaireUser1.submitted))}`,
      `Task 2 - ${ownerName} Lawyer Selection\n\nStatus: ${taskStatus(!!(c.preQuestionnaireUser1 && c.preQuestionnaireUser1.selectedLawyer))}`,
      `Task 3 - ${invitedName} Pre-Lawyer Questionnaire\n\nStatus: ${taskStatus(!!(c.preQuestionnaireUser2 && c.preQuestionnaireUser2.submitted))}`,
      `Task 4 - ${invitedName} Lawyer Selection\n\nStatus: ${taskStatus(!!(c.preQuestionnaireUser2 && c.preQuestionnaireUser2.selectedLawyer))}`,
    ];

    const actorDisplayName = isOwner ? ownerName : invitedName;
    const subject = `Agreement update — case ${c._id}`;
    const bodyText = `Hello!

${actorDisplayName} has completed the pre-lawyer questionnaire.

Thank you for completing all steps. You will be connected with your lawyers within 15 minutes.

${taskLines.join('\n\n')}`;

    // resolve recipient emails (owner and invited). use ?? undefined to avoid null
    const ownerEmail = resolveEmailLocal(populated?.owner);
    const invitedEmail = resolveEmailLocal(populated?.invitedUser, populated?.invitedEmail ?? undefined);

    const recipients = Array.from(new Set([ownerEmail, invitedEmail].filter(Boolean) as string[]));

    if (recipients.length === 0) {
      console.warn(`No recipient emails resolved for case ${c._id} after pre-questionnaire submission`);
    } else {
      await Promise.all(recipients.map(async (r) => {
        try {
          if (typeof (this.mailService as any).sendMail === 'function') {
            await (this.mailService as any).sendMail(r, subject, bodyText);
          } else if (typeof (this.mailService as any).sendRaw === 'function') {
            await (this.mailService as any).sendRaw({ to: r, subject, text: bodyText });
          } else {
            console.warn('mailService send methods not available; skipping email send');
          }
        } catch (err) {
          console.error(`Failed to send pre-questionnaire notification to ${r} for case ${c._id}`, err);
        }
      }));
    }

    // complete transition if both submitted
    const p1Submitted = !!(c.preQuestionnaireUser1 && c.preQuestionnaireUser1.submitted);
    const p2Submitted = !!(c.preQuestionnaireUser2 && c.preQuestionnaireUser2.submitted);
    if (p1Submitted && p2Submitted) {
      c.workflowStatus = CaseWorkflowStatus.LAWYERS_ASSIGNED;
      await c.save();

      // notify both users using mailService helper (it internally resolves emails)
      try {
        if (typeof (this.mailService as any).sendFirstPhaseCompletedForCase === 'function') {
          await (this.mailService as any).sendFirstPhaseCompletedForCase(populated);
        }
      } catch (err) {
        console.error(`Failed to send first-phase completed email for case ${c._id}`, err);
      }

      // notify case managers (keep original behavior)
      try {
        await this.notifyCaseManagersOfNewCmCase(c);
      } catch (err) {
        console.error(`Failed to notify case managers for case ${c._id}`, err);
      }
    }

    return c;
  }


  async setInviteCredentials(caseId: string, creds: { email: string; password: string; createdAt: Date }) {
    if (!Types.ObjectId.isValid(caseId)) throw new BadRequestException('Invalid case id');
    return this.caseModel.findByIdAndUpdate(caseId, { inviteCredentials: creds }, { new: true, useFindAndModify: false }).exec();
  }
  async deleteCaseDataForPartner(
    caseId: string,
  ): Promise<void> {

    if (
      !Types.ObjectId.isValid(caseId)
    ) {
      throw new BadRequestException(
        'Invalid case id',
      );
    }

    const updated =
      await this.caseModel
        .findByIdAndUpdate(
          caseId,
          {
            $set: {
              partnerInformation: {},

              'status.partnerInformation.submitted':
                false,

              'status.partnerInformation.submittedBy':
                null,

              'status.partnerInformation.submittedAt':
                null,
            },
          },
          {
            new: true,
          },
        );

    if (!updated) {
      throw new NotFoundException(
        'Case not found',
      );
    }
  }
  private ensureApprovalObj(c: CaseDocument): Approval {
    if (!c.approval) (c as any).approval = {};
    return (c as any).approval as Approval;
  }
  async approveCaseByUser(
    caseId: string,
    actorId: string,
  ): Promise<CaseDocument> {

    const c =
      await this.caseModel.findById(
        caseId,
      );

    if (!c) {
      throw new NotFoundException(
        'Case not found',
      );
    }

    const approval =
      this.ensureApprovalObj(c);

    const actorObjId =
      new Types.ObjectId(actorId);

    const isOwner =
      c.owner?.toString() ===
      actorObjId.toString();

    const isInvited =
      c.invitedUser?.toString() ===
      actorObjId.toString();

    if (!isOwner && !isInvited) {
      throw new ForbiddenException(
        'Not part of case',
      );
    }

    const now = new Date();

    if (isOwner) {
      approval.user1Approved =
        true;

      approval.user1ApprovedAt =
        now;
    } else {
      approval.user2Approved =
        true;

      approval.user2ApprovedAt =
        now;
    }

    if (
      approval.user1Approved &&
      approval.user2Approved
    ) {
      c.workflowStatus =
        CaseWorkflowStatus.COUPLE_SUBMITTED;

      c.fullyLocked = true;

      c.fullyLockedAt =
        now;
    }

    await c.save();

    return c;
  }

  async rejectCaseByUser(
    caseId: string,
    actorId: string,
    reason: string,
  ) {
    const c =
      await this.caseModel.findById(
        caseId,
      );

    if (!c) {
      throw new NotFoundException(
        'Case not found',
      );
    }

    c.fullyLocked = false;

    c.workflowStatus =
      CaseWorkflowStatus.DRAFT;

    await c.save();

    return c;
  }


  async approveCaseByManager(caseId: string, actorId: string): Promise<CaseDocument> {
    if (!Types.ObjectId.isValid(caseId)) throw new BadRequestException('Invalid case id');
    const c = await this.caseModel.findById(caseId);
    if (!c) throw new NotFoundException('Case not found');
    const approval = this.ensureApprovalObj(c);
    approval.caseManagerApproved = true;
    approval.caseManagerApprovedAt = new Date();
    (approval as any).approvedBy = new Types.ObjectId(actorId);
    await c.save();
    if (approval.user1Approved && approval.user2Approved && approval.caseManagerApproved) {
      c.workflowStatus = CaseWorkflowStatus.LAWYERS_ASSIGNED;
      c.fullyLocked = true;
      await c.save();
      await this.notifyUsersToCompletePreLawyer(c);
    }
    return c;
  }
  async assignCaseManager(caseId: string, managerId: string, actorId: string): Promise<CaseDocument> {
    if (!Types.ObjectId.isValid(caseId)) throw new BadRequestException('Invalid case id');
    if (!managerId || !Types.ObjectId.isValid(managerId)) throw new BadRequestException('Invalid manager id');
    const c = await this.caseModel.findById(caseId);
    if (!c) throw new NotFoundException('Case not found');
    (c as any).assignedCaseManager = new Types.ObjectId(managerId);
    c.workflowStatus = CaseWorkflowStatus.COUPLE_SUBMITTED;
    await c.save();
    const populated = await this.caseModel.findById(c._id).populate('assignedCaseManager owner invitedUser').exec();
    const cmObj = (populated as any).assignedCaseManager;
    const cmDetails = { name: cmObj && cmObj.name ? cmObj.name : 'Case Manager', email: cmObj && cmObj.email ? cmObj.email : null, phone: cmObj && cmObj.phone ? cmObj.phone : null };
    const recipients: { email: string; name?: string }[] = [];
    const ownerObj = (populated as any).owner;
    const invitedObj = (populated as any).invitedUser;
    if (ownerObj && typeof ownerObj === 'object' && ownerObj.email) recipients.push({ email: ownerObj.email, name: ownerObj.name });
    if (invitedObj && typeof invitedObj === 'object' && invitedObj.email) recipients.push({ email: invitedObj.email, name: invitedObj.name });
    if (c.invitedEmail && !invitedObj) recipients.push({ email: c.invitedEmail });
    const uniqueRecipients = Array.from(new Map(recipients.map(r => [r.email, r])).values());
    const subject = `Your case ${c._id} has been assigned a Case Manager`;
    const body = `Hello,

Your case (${c._id}) has been assigned to a Case Manager.

Case Manager details:
Name: ${cmDetails.name}
${cmDetails.email ? `Email: ${cmDetails.email}\n` : ''}
${cmDetails.phone ? `Phone: ${cmDetails.phone}\n` : ''}

Please expect contact from them shortly.

Regards,
Wenup
`;
    if (uniqueRecipients.length > 0 && typeof (this.mailService as any).sendMail === 'function') {
      for (const to of uniqueRecipients) {
        try { await (this.mailService as any).sendMail(to.email, subject, body); } catch (e) { }
      }
    }
    return c;
  }
  async changeWorkflowStatus(caseId: string, status: string, actorId: string): Promise<CaseDocument> {
    if (!Types.ObjectId.isValid(caseId)) throw new BadRequestException('Invalid case id');
    const c = await this.caseModel.findById(caseId);
    if (!c) throw new NotFoundException('Case not found');
    const normalized = (status || '').toUpperCase();
    if (!['CM', 'PAID', 'LAWYER'].includes(normalized)) throw new BadRequestException('Invalid status');
    if (normalized === 'CM') {
      c.workflowStatus = CaseWorkflowStatus.COUPLE_SUBMITTED;
      if (!c.assignedCaseManager) c.assignedCaseManager = Types.ObjectId.isValid(actorId) ? new Types.ObjectId(actorId) : null;
      await c.save();
      await this.notifyCaseManagersOfNewCmCase(c);
      return c;
    }
    if (normalized === 'PAID') {
      c.workflowStatus = CaseWorkflowStatus.DRAFT;
      c.fullyLocked = false;
      c.fullyLockedBy = null;
      c.fullyLockedAt = null;
      if (c.preQuestionnaireUser1) { c.preQuestionnaireUser1.submitted = false; c.preQuestionnaireUser1.submittedBy = null; c.preQuestionnaireUser1.submittedAt = null; }
      if (c.preQuestionnaireUser2) { c.preQuestionnaireUser2.submitted = false; c.preQuestionnaireUser2.submittedBy = null; c.preQuestionnaireUser2.submittedAt = null; }
      const sections = [
        'myInformation',
        'partnerInformation',
        'jointInformation',
        'independentLegalAdvice',
      ];

      for (const section of sections) {
        const s =
          this.ensureSectionStatus(
            c,
            section,
          );

        s.locked = false;
        s.lockedBy = null;
        s.lockedAt = null;

        s.unlockedBy =
          Types.ObjectId.isValid(actorId)
            ? new Types.ObjectId(actorId)
            : null;

        s.unlockedAt = new Date();
      }
      await c.save();
      await this.notifyUsersCaseMovedToPaid(c);
      return c;
    }
    if (normalized === 'LAWYERS_ASSIGNED') {
      c.workflowStatus = CaseWorkflowStatus.LAWYERS_ASSIGNED;;
      c.fullyLocked = true;
      c.fullyLockedBy = Types.ObjectId.isValid(actorId) ? new Types.ObjectId(actorId) : null;
      c.fullyLockedAt = new Date();
      await c.save();
      await this.notifyUsersToCompletePreLawyer(c);
      return c;
    }
    return c;
  }
  private async notifyCaseManagersOfNewCmCase(c: CaseDocument) {
    try {
      if (this.mailService && typeof (this.mailService as any).sendCaseManagerIntimation === 'function') { await (this.mailService as any).sendCaseManagerIntimation(c); return; }
    } catch (e) { }
    const env = this.config.get('CASE_MANAGER_EMAILS') || '';
    const emails = (env as string).split(',').map((s) => s.trim()).filter(Boolean);
    const subject = `New case ready for Case Manager — ${c._id}`;
    const body = `A case has reached the Case Manager stage.

Case: ${c._id}
Title: ${(c as any).title ?? 'N/A'}

Please login to the platform to review and manage this case.
`;
    if (emails.length > 0 && typeof (this.mailService as any).sendMail === 'function') {
      for (const to of emails) {
        try { await (this.mailService as any).sendMail(to, subject, body); } catch (e) { }
      }
    }
  }
  private async notifyUsersToCompletePreLawyer(c: CaseDocument) {
    const populated = await this.caseModel.findById(c._id).populate('owner invitedUser').exec();
    const recipients: string[] = [];
    if ((populated as any).owner && (populated as any).owner.email) recipients.push((populated as any).owner.email);
    if ((populated as any).invitedUser && (populated as any).invitedUser.email) recipients.push((populated as any).invitedUser.email);
    else if (c.invitedEmail) recipients.push(c.invitedEmail);
    const uniqueRecipients = Array.from(new Set(recipients)).filter(Boolean) as string[];
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
    if (uniqueRecipients.length > 0 && typeof (this.mailService as any).sendMail === 'function') {
      for (const to of uniqueRecipients) {
        try { await (this.mailService as any).sendMail(to, subject, body); } catch (e) { }
      }
    }
  }
  private async notifyUsersCaseMovedToPaid(c: CaseDocument) {
    const populated = await this.caseModel.findById(c._id).populate('owner invitedUser').exec();
    const recipients: string[] = [];
    if ((populated as any).owner && (populated as any).owner.email) recipients.push((populated as any).owner.email);
    if ((populated as any).invitedUser && (populated as any).invitedUser.email) recipients.push((populated as any).invitedUser.email);
    else if (c.invitedEmail) recipients.push(c.invitedEmail);
    const uniqueRecipients = Array.from(new Set(recipients)).filter(Boolean) as string[];
    const subject = `Case moved to PAID — please re-open pre-questionnaire`;
    const body = `Hi,

Your case ${c._id} has been moved to 'Paid' by the Case Manager. This means the pre-lawyer questionnaire statuses have been reset and you can now update your answers.

Please login to the platform and edit your pre-lawyer questionnaire and required steps.

Regards,
Wenup
`;
    if (uniqueRecipients.length > 0 && typeof (this.mailService as any).sendMail === 'function') {
      for (const to of uniqueRecipients) {
        try { await (this.mailService as any).sendMail(to, subject, body); } catch (e) { }
      }
    }
  }

  async getQuestionnaireSection(
    caseId: string,
    sectionName: string,
    user: any,
  ) {
    if (!Types.ObjectId.isValid(caseId)) {
      throw new BadRequestException(
        'Invalid case id',
      );
    }

    const c =
      await this.caseModel.findById(caseId);

    if (!c) {
      throw new NotFoundException(
        'Case not found',
      );
    }

    const isPrivileged =
      this.isPrivilegedRole(
        user?.role,
      );

    if (!isPrivileged) {
      const uid =
        (
          user?.id ??
          user?._id
        )?.toString();

      if (
        c.owner?.toString() !== uid &&
        c.invitedUser?.toString() !== uid
      ) {
        throw new ForbiddenException(
          'Forbidden',
        );
      }
    }

    const sections = {
      myInformation:
        c.myInformation,

      partnerInformation:
        c.partnerInformation,

      jointInformation:
        c.jointInformation,

      independentLegalAdvice:
        c.independentLegalAdvice,
    };

    const status =
      (c.status as any)?.[
      sectionName
      ] || {
        submitted: false,
        submittedBy: null,
        submittedAt: null,
        locked: false,
        lockedBy: null,
        lockedAt: null,
        unlockedBy: null,
        unlockedAt: null,
      };

    const data =
      (sections as any)[
      sectionName
      ];

    if (!data) {
      throw new BadRequestException(
        'Unknown section',
      );
    }

    return {
      section: sectionName,
      data,
      status,
      fullyLocked:
        !!c.fullyLocked,
    };
  }

  private determineWorkflowStatus(
    c: CaseDocument,
  ): CaseWorkflowStatus {

    if (!c.paymentCompleted) {
      return CaseWorkflowStatus.NOT_PAID;
    }

    if (
      !c.approval?.user1Approved ||
      !c.approval?.user2Approved
    ) {
      return CaseWorkflowStatus.DRAFT;
    }

    if (
      c.approval.user1Approved &&
      c.approval.user2Approved &&
      !c.approval.caseManagerApproved
    ) {
      return CaseWorkflowStatus.COUPLE_SUBMITTED;
    }

    if (
      c.approval.caseManagerApproved
    ) {
      return CaseWorkflowStatus.CM_APPROVED;
    }

    return CaseWorkflowStatus.DRAFT;
  }
}
