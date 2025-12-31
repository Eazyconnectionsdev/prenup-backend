// src/cases/cases.service.ts
import { BadRequestException, Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import crypto from 'crypto';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Case, CaseDocument } from './schemas/case.schema';
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

  /**
   * Create a new case owned by ownerId
   */
  async create(ownerId: string, title?: string) {
    const c = new this.caseModel({ title: title || 'Untitled case', owner: new Types.ObjectId(ownerId) });
    return c.save();
  }

  /**
   * Find case by id, returns null if not valid id or not found.
   * If populate=true, populate owner and invitedUser and lawyer selections.
   */
  async findById(id: string, populate = false) {
    if (!Types.ObjectId.isValid(id)) return null;
    const q = this.caseModel.findById(id);
    if (populate) {
      q.populate('owner invitedUser preQuestionnaireUser1.selectedLawyer preQuestionnaireUser2.selectedLawyer');
    }
    return q.exec();
  }

  /**
   * Return all cases (admins / case managers)
   */
  async findAll() {
    return this.caseModel.find().exec();
  }

  /**
   * Return cases related to a user (owner or invitedUser)
   * userId can be string or ObjectId
   */
  async findByUser(userId: string | Types.ObjectId) {
    const id = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    return this.caseModel.find({ $or: [{ owner: id }, { invitedUser: id }] }).exec();
  }

  /**
   * Attach invited user to a case and clear invite token
   */
  async attachInvitedUser(caseId: string, userId: string) {
    const c = await this.caseModel.findById(caseId);
    if (!c) throw new NotFoundException('Case not found');

    c.invitedUser = new Types.ObjectId(userId);
    c.inviteToken = null;
    c.inviteTokenExpires = null;
    return c.save();
  }

  /**
   * Create an invite token on case and send an email
   */
  async invite(caseId: string, inviterId: string, inviteEmail: string) {
    const c = await this.caseModel.findById(caseId);
    if (!c) throw new NotFoundException('Case not found');

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + Number(this.config.get('INVITE_TOKEN_EXPIRY_HOURS') || 72) * 3600 * 1000);

    c.invitedEmail = inviteEmail.toLowerCase();
    c.inviteToken = token;
    c.inviteTokenExpires = expires;

    await c.save();

    const inviteUrl = `${this.config.get('APP_BASE_URL')}/auth/accept-invite?token=${token}&caseId=${c._id}&email=${encodeURIComponent(inviteEmail)}`;
    await this.mailService.sendInvite(inviteEmail, inviteUrl);

    return { inviteUrl };
  }

  /**
   * Update a specific step on case and set status (existing method preserved)
   */
  async updateStep(caseId: string, stepNumber: number, data: any, actorId: string, lock = false) {
    const c = await this.caseModel.findById(caseId);
    if (!c) throw new NotFoundException('Case not found');

    const key = `step${stepNumber}`;
    if (!['step1', 'step2', 'step3', 'step4', 'step5', 'step6', 'step7'].includes(key)) {
      throw new BadRequestException('Invalid step');
    }

    (c as any)[key] = data;

    c.status = c.status || {};
    c.status[key] = c.status[key] || {};

    c.status[key].submitted = true;
    c.status[key].submittedBy = new Types.ObjectId(actorId);
    c.status[key].submittedAt = new Date();

    if (lock) {
      c.status[key].locked = true;
      c.status[key].lockedBy = new Types.ObjectId(actorId);
      c.status[key].lockedAt = new Date();
      c.status[key].unlockedBy = null;
      c.status[key].unlockedAt = null;
    }

    await c.save();
    return c;
  }

  /**
   * Unlock a given step (privileged users)
   */
  async unlockStep(caseId: string, stepNumber: number, actorId: string) {
    const c = await this.caseModel.findById(caseId);
    if (!c) throw new NotFoundException('Case not found');

    const key = `step${stepNumber}`;
    if (!['step1', 'step2', 'step3', 'step4', 'step5', 'step6', 'step7'].includes(key)) {
      throw new BadRequestException('Invalid step');
    }

    c.status = c.status || {};
    c.status[key] = c.status[key] || {};

    c.status[key].locked = false;
    c.status[key].lockedBy = null;
    c.status[key].lockedAt = null;

    c.status[key].unlockedBy = new Types.ObjectId(actorId);
    c.status[key].unlockedAt = new Date();

    await c.save();
    return c;
  }

  /**
   * Update PreQuestionnaire fields directly (used by controller convenience)
   * Expects dotted paths, e.g. { 'preQuestionnaireUser1.answers': [...], 'preQuestionnaireUser1.selectedLawyer': ObjectId(...) }
   */
  async updatePreQuestionnaire(caseId: string, updatePatch: any) {
    if (!Types.ObjectId.isValid(caseId)) throw new BadRequestException('Invalid case id');
    const updated = await this.caseModel.findByIdAndUpdate(caseId, { $set: updatePatch }, { new: true }).exec();
    if (!updated) throw new NotFoundException('Case not found');
    return updated;
  }

  /**
   * Submit the pre-questionnaire for the current actor (owner => user1, invitedUser => user2).
   * Automatically locks that user's pre-questionnaire to prevent re-submission by plain end users.
   */// inside CasesService (add helper and replace the two methods)

  private makeEmptyPreQuestionnaire() {
    // keep shape in sync with your PreQuestionnaire schema
    return {
      answers: [] as string[],
      selectedLawyer: null as Types.ObjectId | null,
      submitted: false,
      submittedBy: null as Types.ObjectId | null,
      submittedAt: null as Date | null,
      locked: false,
      lockedBy: null as Types.ObjectId | null,
      lockedAt: null as Date | null,
      // any other fields you expect (e.g. selectedAt) can be added here
    };
  }

  async submitPreQuestionnaire(caseId: string, actorId: string, answers: string[]) {
    const c = await this.caseModel.findById(caseId);
    if (!c) throw new NotFoundException('Case not found');

    const actorObjId = new Types.ObjectId(actorId);
    const isOwner = c.owner?.toString() === actorId;
    const isInvited = c.invitedUser?.toString() === actorId;

    if (!isOwner && !isInvited) throw new ForbiddenException('Actor not part of this case');

    const now = new Date();

    if (isOwner) {
      // check lock safely using optional chaining
      if (c.preQuestionnaireUser1?.submitted && c.preQuestionnaireUser1?.locked) {
        throw new BadRequestException('Pre-questionnaire already submitted and locked for user1');
      }

      // ensure object exists before assigning fields (this removes the TS error)
      if (!c.preQuestionnaireUser1) {
        c.preQuestionnaireUser1 = this.makeEmptyPreQuestionnaire() as any;
      }

      c.preQuestionnaireUser1.answers = answers ?? [];
      c.preQuestionnaireUser1.submitted = true;
      c.preQuestionnaireUser1.submittedBy = actorObjId;
      c.preQuestionnaireUser1.submittedAt = now;
      c.preQuestionnaireUser1.locked = true;
      c.preQuestionnaireUser1.lockedBy = actorObjId;
      c.preQuestionnaireUser1.lockedAt = now;
    } else {
      if (c.preQuestionnaireUser2?.submitted && c.preQuestionnaireUser2?.locked) {
        throw new BadRequestException('Pre-questionnaire already submitted and locked for user2');
      }

      if (!c.preQuestionnaireUser2) {
        c.preQuestionnaireUser2 = this.makeEmptyPreQuestionnaire() as any;
      }

      c.preQuestionnaireUser2.answers = answers ?? [];
      c.preQuestionnaireUser2.submitted = true;
      c.preQuestionnaireUser2.submittedBy = actorObjId;
      c.preQuestionnaireUser2.submittedAt = now;
      c.preQuestionnaireUser2.locked = true;
      c.preQuestionnaireUser2.lockedBy = actorObjId;
      c.preQuestionnaireUser2.lockedAt = now;
    }

    await c.save();
    return c;
  }

  async selectLawyer(caseId: string, actorId: string, lawyerId: string, force = false) {
    if (!Types.ObjectId.isValid(lawyerId)) throw new BadRequestException('Invalid lawyer id');
    const c = await this.caseModel.findById(caseId);
    if (!c) throw new NotFoundException('Case not found');

    const actorObjId = new Types.ObjectId(actorId);
    const isOwner = c.owner?.toString() === actorId;
    const isInvited = c.invitedUser?.toString() === actorId;
    if (!isOwner && !isInvited) throw new ForbiddenException('Actor not part of this case');

    // ensure both parties have submitted (use safe optional chaining)
    const p1Submitted = !!(c.preQuestionnaireUser1 && c.preQuestionnaireUser1.submitted);
    const p2Submitted = !!(c.preQuestionnaireUser2 && c.preQuestionnaireUser2.submitted);
    if (!p1Submitted || !p2Submitted) {
      throw new BadRequestException('Both parties must submit their pre-questionnaires before selecting lawyers');
    }

    // ensure selected lawyer exists
    const lawyerDoc = await this.lawyerModel.findById(lawyerId).exec();
    if (!lawyerDoc) throw new NotFoundException('Lawyer not found');

    if (isOwner) {
      const otherSelected = c.preQuestionnaireUser2?.selectedLawyer?.toString();
      if (otherSelected === lawyerId && !force) {
        throw new BadRequestException('This lawyer has already been chosen by the other party');
      }

      if (!c.preQuestionnaireUser1) {
        c.preQuestionnaireUser1 = this.makeEmptyPreQuestionnaire() as any;
      }

      c.preQuestionnaireUser1.selectedLawyer = new Types.ObjectId(lawyerId);
      (c.preQuestionnaireUser1 as any).selectedAt = new Date();
    } else {
      const otherSelected = c.preQuestionnaireUser1?.selectedLawyer?.toString();
      if (otherSelected === lawyerId && !force) {
        throw new BadRequestException('This lawyer has already been chosen by the other party');
      }

      if (!c.preQuestionnaireUser2) {
        c.preQuestionnaireUser2 = this.makeEmptyPreQuestionnaire() as any;
      }

      c.preQuestionnaireUser2.selectedLawyer = new Types.ObjectId(lawyerId);
      (c.preQuestionnaireUser2 as any).selectedAt = new Date();
    }

    await c.save();
    return c;
  }

  /**
   * Check whether a given lawyer is already selected by either user for a case.
   */
  async isLawyerSelected(caseId: string, lawyerId: string) {
    const c = await this.caseModel.findById(caseId).select('preQuestionnaireUser1.selectedLawyer preQuestionnaireUser2.selectedLawyer').lean().exec();
    if (!c) throw new NotFoundException('Case not found');
    const l1 = c.preQuestionnaireUser1?.selectedLawyer?.toString();
    const l2 = c.preQuestionnaireUser2?.selectedLawyer?.toString();
    return l1 === lawyerId || l2 === lawyerId;
  }


  async listLawyers(limit = 50, page = 1) {
    const skip = (page - 1) * limit;
    const docs = await this.lawyerModel.find().skip(skip).limit(limit).lean().exec();
    const total = await this.lawyerModel.countDocuments().exec();
    return { total, docs };
  }

  async findByUserId(userId: Types.ObjectId) {
    return this.caseModel.findOne({ owner: userId });
  }
    async setInviteCredentials(caseId: string, creds: { email: string; password: string; createdAt: Date }) {
    if (!Types.ObjectId.isValid(caseId)) {
      throw new BadRequestException('Invalid case id');
    }

    return this.caseModel.findByIdAndUpdate(
      caseId,
      { inviteCredentials: creds },
      { new: true, useFindAndModify: false } 
    ).exec();
  }
}
