import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import crypto from 'crypto';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import {
  Case,
  CaseDocument,
  StepStatus,
  PreQuestionnaire,
  Approval,
} from './schemas/case.schema';
import { Lawyer, LawyerDocument } from './schemas/lawyer.schema';
import { MailService } from '../mail/mail.service';

@Injectable()
export class CasesService {
  constructor(
    @InjectModel(Case.name) private caseModel: Model<CaseDocument>,
    @InjectModel(Lawyer.name) private lawyerModel: Model<LawyerDocument>,
    private config: ConfigService,
    private mailService: MailService,
  ) { }

  // -----------------------
  // Utility helpers
  // -----------------------

  /** Properly shaped default for a StepStatus (keeps TypeScript happy). */
  private defaultStepStatus(): StepStatus {
    return {
      submitted: false,
      submittedBy: null,
      submittedAt: null,
      locked: false,
      lockedBy: null,
      lockedAt: null,
      unlockedBy: null,
      unlockedAt: null,
    } as StepStatus;
  }

  /** Ensure a StepStatus exists on the case for a dynamic step key ("step1".."step7"). */
  private ensureStepStatusObj(
    c: CaseDocument,
    stepKey: `step${1 | 2 | 3 | 4 | 5 | 6 | 7}`,
  ): StepStatus {
    // c.status may be undefined initially
    c.status = c.status || {};
    // use any for dynamic property access, but populate with a properly typed object
    const statusAny = c.status as any;
    if (!statusAny[stepKey]) {
      statusAny[stepKey] = this.defaultStepStatus();
    }
    return statusAny[stepKey] as StepStatus;
  }

  /** Properly formed empty PreQuestionnaire object (typed) */
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

  /**
   * Return true if all steps 1..7 on the provided case document have been submitted.
   * This is used to gate pre-questionnaire submission and lawyer selection.
   */
  public areAllStepsSubmitted(c: CaseDocument): boolean {
    if (!c || !c.status) return false;
    for (let i = 1; i <= 7; i++) {
      const sk = `step${i}` as `step${1 | 2 | 3 | 4 | 5 | 6 | 7}`;
      const s = (c.status as any)[sk];
      if (!s || !s.submitted) return false;
    }
    return true;
  }

  // -----------------------
  // CRUD / listings
  // -----------------------

  async create(ownerId: string, title?: string): Promise<CaseDocument> {
    const c = new this.caseModel({
      title: title || 'Untitled case',
      owner: new Types.ObjectId(ownerId),
    });
    return c.save();
  }

  async findById(id: string, populate = false): Promise<CaseDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const q = this.caseModel.findById(id);
    if (populate) {
      q.populate(
        'owner invitedUser preQuestionnaireUser1.selectedLawyer preQuestionnaireUser2.selectedLawyer',
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

  // -----------------------
  // Invite / attach
  // -----------------------

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

  async invite(caseId: string, inviterId: string, inviteEmail: string) {
    const c = await this.caseModel.findById(caseId);
    if (!c) throw new NotFoundException('Case not found');

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(
      Date.now() +
      Number(this.config.get('INVITE_TOKEN_EXPIRY_HOURS') || 72) *
      3600 *
      1000,
    );

    c.invitedEmail = inviteEmail.toLowerCase();
    c.inviteToken = token;
    c.inviteTokenExpires = expires;

    await c.save();

    const inviteUrl = `${this.config.get('APP_SERVER_URL')}/auth/accept-invite?token=${token}&caseId=${c._id}&email=${encodeURIComponent(inviteEmail)}`;
    await this.mailService.sendInvite(inviteEmail, inviteUrl);

    return { inviteUrl };
  }

  // -----------------------
  // Steps: update & locking
  // -----------------------

  /**
   * Update a specific step on case.
   *
   * NEW LOCKING RULES:
   * - Steps 1-6: no automatic locking on submission — users can re-submit/update.
   * - When step 7 is submitted, the CASE becomes fully locked: all steps' status.*.locked = true,
   *   status.*.lockedBy = actorId, lockedAt = now, and case.fullyLocked metadata is set.
   *
   * IMPORTANT CHANGE: pre-questionnaire objects are NOT locked automatically on step7 submission.
   * Pre-questionnaire submission and lawyer selection are allowed only after all steps are submitted
   * and the case is fully locked (these checks are enforced where appropriate).
   *
   * controller should already guard who may call updateStep (privileged vs end-user).
   */
  async updateStep(
    caseId: string,
    stepNumber: number,
    data: any,
    actorId: string,
  ): Promise<CaseDocument> {
    if (!Types.ObjectId.isValid(caseId))
      throw new BadRequestException('Invalid case id');
    const c = await this.caseModel.findById(caseId);
    if (!c) throw new NotFoundException('Case not found');

    if (!Number.isInteger(stepNumber) || stepNumber < 1 || stepNumber > 7) {
      throw new BadRequestException('Invalid step');
    }

    // If case is fully locked, deny any update.
    if (c.fullyLocked) {
      throw new ForbiddenException(
        'Case is fully locked and cannot be modified',
      );
    }

    const key = `step${stepNumber}` as `step${1 | 2 | 3 | 4 | 5 | 6 | 7}`;
    // write the actual step payload (StepXDetails) onto the case doc
    (c as any)[key] = data;

    // ensure a StepStatus exists for this step, and mark submitted metadata
    const stepStatus = this.ensureStepStatusObj(c, key);
    stepStatus.submitted = true;
    stepStatus.submittedBy = new Types.ObjectId(actorId);
    stepStatus.submittedAt = new Date();

    // When step 7 is submitted we lock the entire case (full lock) — lock only steps 1..7
    if (stepNumber === 7) {
      c.fullyLocked = true;
      c.fullyLockedBy = new Types.ObjectId(actorId);
      c.fullyLockedAt = new Date();

      const now = new Date();
      for (let i = 1; i <= 7; i++) {
        const sk = `step${i}` as `step${1 | 2 | 3 | 4 | 5 | 6 | 7}`;
        const s = this.ensureStepStatusObj(c, sk);
        s.locked = true;
        s.lockedBy = new Types.ObjectId(actorId);
        s.lockedAt = now;
        // unlockedBy/unlockedAt remain null until admin unlock
      }

      // NOTE: per new requirement we do NOT lock preQuestionnaireUser1/2 here.
      // Leave preQuestionnaire fields as-is; submission/selection will be gated by checks that
      // require all steps submitted AND fullyLocked.
    }

    await c.save();
    return c;
  }

  /**
   * Unlock the case (privileged users). This method:
   * - only allows unlocking when case is fullyLocked OR when step7 has been submitted.
   * - clears fullyLocked metadata and clears per-step locked flags while setting unlocked audit.
   */
  async unlockCase(caseId: string, actorId: string): Promise<CaseDocument> {
    if (!Types.ObjectId.isValid(caseId))
      throw new BadRequestException('Invalid case id');
    const c = await this.caseModel.findById(caseId);
    if (!c) throw new NotFoundException('Case not found');

    // ensure status and step7 exist (with proper typed default)
    this.ensureStepStatusObj(c, 'step7');

    const step7Status = (c.status as any).step7 as StepStatus;
    const step7Submitted =
      Boolean(step7Status.submitted) || Boolean(step7Status.submittedAt);

    if (!c.fullyLocked && !step7Submitted) {
      throw new BadRequestException(
        'Case is not fully locked nor locked by step 7 submission',
      );
    }

    const actorObjId = Types.ObjectId.isValid(actorId)
      ? new Types.ObjectId(actorId)
      : null;
    const now = new Date();

    // clear full-lock metadata
    c.fullyLocked = false;
    c.fullyLockedBy = null;
    c.fullyLockedAt = null;

    // clear all step locks and set unlockedBy/unlockedAt audit fields
    for (let i = 1; i <= 7; i++) {
      const sk = `step${i}` as `step${1 | 2 | 3 | 4 | 5 | 6 | 7}`;
      const s = this.ensureStepStatusObj(c, sk);
      s.locked = false;
      s.lockedBy = null;
      s.lockedAt = null;
      s.unlockedBy = actorObjId;
      s.unlockedAt = now;
    }

    // Note: preQuestionnaire locks were not set by full-lock anymore, but keep safety clear
    if (c.preQuestionnaireUser1) {
      c.preQuestionnaireUser1.locked = false;
      c.preQuestionnaireUser1.lockedBy = null;
      c.preQuestionnaireUser1.lockedAt = null;
    }
    if (c.preQuestionnaireUser2) {
      c.preQuestionnaireUser2.locked = false;
      c.preQuestionnaireUser2.lockedBy = null;
      c.preQuestionnaireUser2.lockedAt = null;
    }

    await c.save();
    return c;
  }

  // -----------------------
  // Pre-questionnaire
  // -----------------------

  /**
   * Update PreQuestionnaire fields directly (used by controller convenience)
   * Expects dotted paths, e.g. { 'preQuestionnaireUser1.answers': [...], 'preQuestionnaireUser1.selectedLawyer': ObjectId(...) }
   */
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

  /**
   * Submit the pre-questionnaire for the current actor (owner => user1, invitedUser => user2).
   *
   * NEW: pre-questionnaire submission is only allowed after all steps are submitted AND the case is fully locked.
   */
  async submitPreQuestionnaire(
    caseId: string,
    actorId: string,
    answers: string[],
  ): Promise<CaseDocument> {
    if (!Types.ObjectId.isValid(caseId))
      throw new BadRequestException('Invalid case id');
    const c = await this.caseModel.findById(caseId);
    if (!c) throw new NotFoundException('Case not found');

    // New rule: allow pre-questionnaire submission only after the case is fully locked AND all steps submitted.
    if (!c.fullyLocked || !this.areAllStepsSubmitted(c)) {
      throw new BadRequestException(
        'Pre-questionnaire can only be submitted after all steps are submitted and the case is fully locked',
      );
    }

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
    return c;
  }

  // -----------------------
  // Lawyer selection
  // -----------------------

  async selectLawyer(
    caseId: string,
    actorId: string,
    lawyerId: string,
    force = false,
  ): Promise<CaseDocument> {
    if (!Types.ObjectId.isValid(caseId))
      throw new BadRequestException('Invalid case id');
    if (!Types.ObjectId.isValid(lawyerId))
      throw new BadRequestException('Invalid lawyer id');

    const c = await this.caseModel.findById(caseId).exec();
    if (!c) throw new NotFoundException('Case not found');

    // New rule: lawyer selection is allowed *only* after the case is fully locked AND all steps are submitted.
    if (!c.fullyLocked || !this.areAllStepsSubmitted(c)) {
      throw new BadRequestException(
        'Lawyer selection is allowed only after all steps are submitted and the case is fully locked',
      );
    }

    if (!Types.ObjectId.isValid(actorId)) {
      throw new BadRequestException('Invalid actor id');
    }
    const actorObjId = new Types.ObjectId(actorId);

    const extractId = (val: any): Types.ObjectId | null => {
      if (!val) return null;
      if (val instanceof Types.ObjectId) return val;
      if (typeof val === 'object' && val._id) {
        return val._id instanceof Types.ObjectId
          ? val._id
          : new Types.ObjectId(val._id.toString());
      }
      if (typeof val === 'string' && Types.ObjectId.isValid(val))
        return new Types.ObjectId(val);
      return null;
    };

    const ownerId = extractId(c.owner);
    const invitedId = extractId(c.invitedUser);

    const equalsId = (idA: Types.ObjectId | null, idB: Types.ObjectId) => {
      if (!idA) return false;
      if (typeof (idA as any).equals === 'function')
        return (idA as any).equals(idB);
      return idA.toString() === idB.toString();
    };

    const isOwner = equalsId(ownerId, actorObjId);
    const isInvited = equalsId(invitedId, actorObjId);

    if (!isOwner && !isInvited) {
      throw new ForbiddenException('Actor not part of this case');
    }

    // ensure both parties have submitted
    const p1Submitted = !!(
      c.preQuestionnaireUser1 && c.preQuestionnaireUser1.submitted
    );
    const p2Submitted = !!(
      c.preQuestionnaireUser2 && c.preQuestionnaireUser2.submitted
    );
    if (!p1Submitted || !p2Submitted) {
      throw new BadRequestException(
        'Both parties must submit their pre-questionnaires before selecting lawyers',
      );
    }

    const lawyerDoc = await this.lawyerModel.findById(lawyerId).exec();
    if (!lawyerDoc) throw new NotFoundException('Lawyer not found');

    if (isOwner) {
      const otherSelected = c.preQuestionnaireUser2?.selectedLawyer?.toString();
      if (otherSelected === lawyerId && !force) {
        throw new BadRequestException(
          'This lawyer has already been chosen by the other party',
        );
      }

      if (!c.preQuestionnaireUser1)
        c.preQuestionnaireUser1 = this.makeEmptyPreQuestionnaire() as any;
      c.preQuestionnaireUser1.selectedLawyer = new Types.ObjectId(lawyerId);
      (c.preQuestionnaireUser1 as any).selectedAt = new Date();
    } else {
      const otherSelected = c.preQuestionnaireUser1?.selectedLawyer?.toString();
      if (otherSelected === lawyerId && !force) {
        throw new BadRequestException(
          'This lawyer has already been chosen by the other party',
        );
      }

      if (!c.preQuestionnaireUser2)
        c.preQuestionnaireUser2 = this.makeEmptyPreQuestionnaire() as any;
      c.preQuestionnaireUser2.selectedLawyer = new Types.ObjectId(lawyerId);
      (c.preQuestionnaireUser2 as any).selectedAt = new Date();
    }

    await c.save();
    return c;
  }

  async isLawyerSelected(caseId: string, lawyerId: string): Promise<boolean> {
    const c = await this.caseModel
      .findById(caseId)
      .select(
        'preQuestionnaireUser1.selectedLawyer preQuestionnaireUser2.selectedLawyer',
      )
      .lean()
      .exec();
    if (!c) throw new NotFoundException('Case not found');
    const l1 = c.preQuestionnaireUser1?.selectedLawyer?.toString();
    const l2 = c.preQuestionnaireUser2?.selectedLawyer?.toString();
    return l1 === lawyerId || l2 === lawyerId;
  }

  async listLawyers(limit = 50, page = 1) {
    const skip = (page - 1) * limit;
    const docs = await this.lawyerModel
      .find()
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();
    const total = await this.lawyerModel.countDocuments().exec();
    return { total, docs };
  }

  async setInviteCredentials(
    caseId: string,
    creds: { email: string; password: string; createdAt: Date },
  ) {
    if (!Types.ObjectId.isValid(caseId)) {
      throw new BadRequestException('Invalid case id');
    }

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
          // reset partner steps data (if required)
          step3: {},
          step4: {},

          'status.step3.submitted': false,
          'status.step3.submittedBy': null,
          'status.step3.submittedAt': null,

          'status.step4.submitted': false,
          'status.step4.submittedBy': null,
          'status.step4.submittedAt': null,
        },
      },
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException('Case not found');
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
    if (!Types.ObjectId.isValid(caseId)) {
      throw new BadRequestException('Invalid case id');
    }

    const c = await this.caseModel.findById(caseId);
    if (!c) throw new NotFoundException('Case not found');

    // Must be fully locked & both pre-questionnaires submitted
    if (!c.fullyLocked || !this.areAllStepsSubmitted(c)) {
      throw new BadRequestException(
        'Case must be fully locked and completed before approval',
      );
    }

    const actorObjId = new Types.ObjectId(actorId);

    const isOwner = c.owner?.toString() === actorObjId.toString();
    const isInvited = c.invitedUser?.toString() === actorObjId.toString();

    if (!isOwner && !isInvited) {
      throw new ForbiddenException('Actor not part of this case');
    }

    const now = new Date();

    // ensure approval object exists
    const approval = this.ensureApprovalObj(c);

    if (isOwner) {
      approval.user1Approved = true;
      approval.user1ApprovedAt = now;
    } else {
      approval.user2Approved = true;
      approval.user2ApprovedAt = now;
    }

    await c.save();
    return c;
  }


  async approveCaseByLawyer(
    caseId: string,
    lawyerId: string,
  ): Promise<CaseDocument> {
    if (!Types.ObjectId.isValid(caseId) || !Types.ObjectId.isValid(lawyerId)) {
      throw new BadRequestException('Invalid ids');
    }

    const c = await this.caseModel.findById(caseId);
    if (!c) throw new NotFoundException('Case not found');

    // Ensure lawyer was selected
    const selected =
      c.preQuestionnaireUser1?.selectedLawyer?.toString() === lawyerId ||
      c.preQuestionnaireUser2?.selectedLawyer?.toString() === lawyerId;

    if (!selected) {
      throw new ForbiddenException('Lawyer not selected for this case');
    }

    // ensure approval object exists
    const approval = this.ensureApprovalObj(c);

    approval.lawyerApproved = true;
    approval.lawyerApprovedAt = new Date();
    approval.approvedLawyer = new Types.ObjectId(lawyerId);

    await c.save();
    return c;
  }


  async approveCaseByManager(
    caseId: string,
    actorId: string,
  ): Promise<CaseDocument> {
    if (!Types.ObjectId.isValid(caseId)) {
      throw new BadRequestException('Invalid case id');
    }

    const c = await this.caseModel.findById(caseId);
    if (!c) throw new NotFoundException('Case not found');

    // ensure approval object exists
    const approval = this.ensureApprovalObj(c);

    approval.caseManagerApproved = true;
    approval.caseManagerApprovedAt = new Date();

    await c.save();
    return c;
  }

}
