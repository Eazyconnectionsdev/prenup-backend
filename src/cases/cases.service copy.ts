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

  private ensureStepStatusObj(
    c: CaseDocument,
    stepKey: `step${1 | 2 | 3 | 4 | 5 | 6 | 7}`,
  ): StepStatus {
    c.status = c.status || {};
    const statusAny = c.status as any;
    if (!statusAny[stepKey]) {
      statusAny[stepKey] = this.defaultStepStatus();
    }
    return statusAny[stepKey] as StepStatus;
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

    const inviteUrl = `${this.config.get('APP_SERVER_URL')}/auth/accept-invite?token=${token}&caseId=${c._id}&email=${encodeURIComponent(
      inviteEmail,
    )}`;
    await this.mailService.sendInvite(inviteEmail, inviteUrl);

    return { inviteUrl };
  }

  // -----------------------
  // Steps: update & locking
  // -----------------------
async updateStep(
    caseId: string,
    stepNumber: number,
    data: any,
    actorId: string,
    isPrivileged = false, // new optional param
  ): Promise<CaseDocument> {
    if (!Types.ObjectId.isValid(caseId))
      throw new BadRequestException('Invalid case id');
    const c = await this.caseModel.findById(caseId);
    if (!c) throw new NotFoundException('Case not found');

    if (!Number.isInteger(stepNumber) || stepNumber < 1 || stepNumber > 7) {
      throw new BadRequestException('Invalid step');
    }

    // allow privileged users to update even if fullyLocked
    if (c.fullyLocked && !isPrivileged) {
      throw new ForbiddenException('Case is fully locked and cannot be modified');
    }

    const key = `step${stepNumber}` as `step${1 | 2 | 3 | 4 | 5 | 6 | 7}`;
    (c as any)[key] = data;

    const stepStatus = this.ensureStepStatusObj(c, key);
    stepStatus.submitted = true;
    stepStatus.submittedBy = new Types.ObjectId(actorId);
    stepStatus.submittedAt = new Date();

    if (stepNumber === 7) {
      const requiredUser1 = [1, 2, 5, 6, 7];
      const requiredUser2 = [3, 4];

      const statusAny = c.status || {};

      const isSubmitted = (n: number) =>
        Boolean(statusAny[`step${n}`] && statusAny[`step${n}`].submitted);

      const missingUser1 = requiredUser1.filter((n) => !isSubmitted(n));
      const missingUser2 = requiredUser2.filter((n) => !isSubmitted(n));

      if (!c.invitedUser) {
        throw new BadRequestException(
          'Cannot submit step 7: invited user not attached to case.',
        );
      }

      if (missingUser1.length || missingUser2.length) {
        const parts: string[] = [];

        if (missingUser1.length) {
          parts.push(`owner missing steps: ${missingUser1.join(', ')}`);
        }

        if (missingUser2.length) {
          parts.push(`invited user missing steps: ${missingUser2.join(', ')}`);
        }

        throw new BadRequestException(
          `Cannot submit step 7. Please ensure all required steps are saved before final submission. ${parts.join(
            '; ',
          )}`,
        );
      }

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
      }
    }

    await c.save();

    // Send the "first phase completed" notification only when the case is fully locked
    // and all steps are submitted.
    try {
      if (c.fullyLocked && this.areAllStepsSubmitted(c)) {
        // Prefer a dedicated mail helper if present
        if (
          this.mailService &&
          typeof (this.mailService as any).sendFirstPhaseCompletedForCase === 'function'
        ) {
          await (this.mailService as any).sendFirstPhaseCompletedForCase(c);
        } else {
          // Fallback: best-effort inline send without case link and with the requested text
          const recipients: string[] = [];
          if ((c as any).owner && typeof (c as any).owner.email === 'string') {
            recipients.push((c as any).owner.email);
          }
          if ((c as any).invitedUser && typeof (c as any).invitedUser.email === 'string') {
            recipients.push((c as any).invitedUser.email);
          } else if (c.invitedEmail) {
            recipients.push(c.invitedEmail);
          }
          const uniqueRecipients = Array.from(new Set(recipients)).filter(Boolean) as string[];

          const subject = `First phase completed — case ${c._id}`;
          const bodyText = `Hello,

The first phase of questionnaires has been submitted by both you and your partner for case ${c._id}.
You have now moved to the Case Manager.
If you have questions, contact support.

Regards,
LetsPrenup Team
`;
          if (uniqueRecipients.length > 0 && typeof (this.mailService as any).sendMail === 'function') {
            for (const to of uniqueRecipients) {
              try {
                await (this.mailService as any).sendMail(to, subject, bodyText);
              } catch (err) {
                // swallow to avoid failing updateStep; mail errors are best-effort
                // but log if available
                if (this.mailService && (this.mailService as any).logger) {
                  try { (this.mailService as any).logger.error(`Fallback send failed to ${to}`, err); } catch (e) {}
                }
              }
            }
          } else {
            // no recipients resolved or no sendMail - warn to logs if possible
            if (this.mailService && (this.mailService as any).logger) {
              try { (this.mailService as any).logger.warn(`First-phase: no recipients or mail helper for case ${c._id}`); } catch (e) {}
            }
          }
        }
      }
    } catch (err) {
      // Do not block the operation on email failures; log and continue.
      try {
        if (this.mailService && (this.mailService as any).logger) {
          (this.mailService as any).logger.error('Failed to send first-phase notification for case', err);
        } else {
          console.error('Failed to send first-phase notification for case', c._id, err);
        }
      } catch (e) {
        console.error('Failed to log email error', e);
      }
    }

    return c;
  }

  /**
   * Unlock the case (privileged users).
   */
  async unlockCase(caseId: string, actorId: string): Promise<CaseDocument> {
    if (!Types.ObjectId.isValid(caseId))
      throw new BadRequestException('Invalid case id');
    const c = await this.caseModel.findById(caseId);
    if (!c) throw new NotFoundException('Case not found');

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

    c.fullyLocked = false;
    c.fullyLockedBy = null;
    c.fullyLockedAt = null;

    for (let i = 1; i <= 7; i++) {
      const sk = `step${i}` as `step${1 | 2 | 3 | 4 | 5 | 6 | 7}`;
      const s = this.ensureStepStatusObj(c, sk);
      s.locked = false;
      s.lockedBy = null;
      s.lockedAt = null;
      s.unlockedBy = actorObjId;
      s.unlockedAt = now;
    }

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

  async updatePreQuestionnaire(
    caseId: string,
    updatePatch: any,
  ): Promise<CaseDocument> {
    if (!Types.ObjectId.isValid(caseId))
      throw new BadRequestException('Invalid case id');
    const updated = await this.caseModel
      .findByIdAndUpdate(caseId, { $set: updatePatch }, { new: true })
      .exec();
    if (!updated) {
      throw new NotFoundException('Case not found');
    }
    return updated;
  }

  /**
   * Submit the pre-questionnaire for the current actor and email status updates.
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

    // --- Send Agreement status email for first step completion (best-effort) ---
    try {
      const actorEmail = this.resolveEmailForActor(c, actorObjId);
      if (actorEmail) {
        const requiredSteps = isOwner ? [1, 2, 5, 6, 7] : [3, 4];
        const missing = requiredSteps.filter((n) => {
          const s = (c.status as any)[`step${n}`];
          return !(s && s.submitted);
        });

        const friendlyMissing = missing.map((n) => this.friendlyStepName(n));
        const subject = `Agreement status: First step completed — case ${c._id}`;
        const bodyText = `Hello,

You have completed the pre-lawyer questionnaire for case ${c._id}.
Completed: Pre-lawyer questionnaire (first step).
Remaining required steps for you: ${friendlyMissing.length > 0 ? friendlyMissing.join(
          ', ',
        ) : 'None — you have completed your required steps.'}

Please return to LetsPrenup to continue.

Regards,
LetsPrenup Team
`;
        if (typeof (this.mailService as any).sendMail === 'function') {
          await (this.mailService as any).sendMail(actorEmail, subject, bodyText);
        } else if (typeof this.mailService.sendAgreementSubmittedForCase === 'function') {
          // fallback to generic helper if present
          await (this.mailService as any).sendMail(actorEmail, subject, bodyText);
        } else {
          console.warn('Mail service has no sendMail helper; skipping pre-questionnaire email');
        }
      } else {
        console.warn('Could not resolve actor email for pre-questionnaire notification for case', c._id);
      }
    } catch (err) {
      console.error('Failed to send pre-questionnaire notification for case', c._id, err);
    }

    return c;
  }

  // -----------------------
  // Lawyer selection
  // -----------------------

  /**
   * Select a lawyer for a case (actor picks lawyer). Also send the required intro emails (best-effort).
   *
   * Added parameter `message?: string` that will be forwarded to lawyer in intro email.
   */
  async selectLawyer(
    caseId: string,
    actorId: string,
    lawyerId: string,
    force = false,
    message?: string,
  ): Promise<CaseDocument> {
    if (!Types.ObjectId.isValid(caseId))
      throw new BadRequestException('Invalid case id');
    if (!Types.ObjectId.isValid(lawyerId))
      throw new BadRequestException('Invalid lawyer id');

    const c = await this.caseModel.findById(caseId).exec();
    if (!c) throw new NotFoundException('Case not found');

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
      if (typeof (idA as any).equals === 'function') return (idA as any).equals(idB);
      return idA.toString() === idB.toString();
    };

    const isOwner = equalsId(ownerId, actorObjId);
    const isInvited = equalsId(invitedId, actorObjId);

    if (!isOwner && !isInvited) {
      throw new ForbiddenException('Actor not part of this case');
    }

    const p1Submitted = !!(c.preQuestionnaireUser1 && c.preQuestionnaireUser1.submitted);
    const p2Submitted = !!(c.preQuestionnaireUser2 && c.preQuestionnaireUser2.submitted);
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

    // --- Send Agreement status email for second step completion (best-effort) ---
    try {
      const actorEmail = this.resolveEmailForActor(c, actorObjId);
      if (actorEmail) {
        // determine remaining required steps for actor
        const requiredSteps = isOwner ? [1, 2, 5, 6, 7] : [3, 4];
        const missing = requiredSteps.filter((n) => {
          const s = (c.status as any)[`step${n}`];
          return !(s && s.submitted);
        });
        const friendlyMissing = missing.map((n) => this.friendlyStepName(n));
        const subject = `Agreement status: Second step completed — case ${c._id}`;
        const bodyText = `Hello,

You have selected a lawyer for case ${c._id}.
Completed: Select lawyer (second step).
Remaining required steps for you: ${friendlyMissing.length > 0 ? friendlyMissing.join(', ') : 'None — you have completed your required steps.'}

Your selected lawyer:
${(lawyerDoc as any).name ?? 'N/A'}${this.getLawyerContactEmail(lawyerDoc) ? `\nEmail: ${this.getLawyerContactEmail(lawyerDoc)}` : ''}

Regards,
LetsPrenup Team
`;
        if (typeof (this.mailService as any).sendMail === 'function') {
          await (this.mailService as any).sendMail(actorEmail, subject, bodyText);
        }
      } else {
        console.warn('Could not resolve actor email for lawyer-selection notification for case', c._id);
      }
    } catch (err) {
      console.error('Failed to send lawyer-selection notification for case', c._id, err);
    }

    // --- Send Lawyer Introduction Email to client (actor) (best-effort) ---
    try {
      const actorEmail = this.resolveEmailForActor(c, actorObjId);
      if (actorEmail) {
        const subject = `Lawyer introduction — ${(lawyerDoc as any).name ?? ''} (LetsPrenup)`;
        const bodyText = `Hello,

Thanks for choosing a lawyer via LetsPrenup.

Lawyer: ${(lawyerDoc as any).name ?? 'N/A'}
${this.getLawyerContactEmail(lawyerDoc) ? `Email: ${this.getLawyerContactEmail(lawyerDoc)}\n` : ''}
${this.getLawyerContactPhone(lawyerDoc) ? `Phone: ${this.getLawyerContactPhone(lawyerDoc)}\n` : ''}
You can expect an outreach from your lawyer shortly.

Regards,
LetsPrenup Team
`;
        if (typeof (this.mailService as any).sendMail === 'function') {
          await (this.mailService as any).sendMail(actorEmail, subject, bodyText);
        }
      }
    } catch (err) {
      console.error('Failed to send lawyer-intro-to-client for case', c._id, err);
    }

    // --- Send Client Introduction Email to the Lawyer (best-effort) ---
    try {
      const lawyerEmail = this.getLawyerContactEmail(lawyerDoc);
      if (lawyerEmail) {
        const clientInfo = isOwner
          ? {
            role: 'Owner (P1)',
            email: (c as any).owner?.email ?? 'N/A',
          }
          : {
            role: 'Invited user (P2)',
            email: c.invitedEmail ?? (c as any).invitedUser?.email ?? 'N/A',
          };

        const appUrl = this.config.get('APP_SERVER_URL') || '';
        const loginUrl = `${appUrl}/auth/login`;

        const subject = `Client introduction — new client via LetsPrenup (case ${c._id})`;
        const bodyText = `Hello ${(lawyerDoc as any).name ?? ''},

You have been selected as the lawyer for a client via LetsPrenup.

Case: ${c._id}
Client role: ${clientInfo.role}
Client email: ${clientInfo.email}

Client message (if any):
${message || '(no message provided)'}

Please login to LetsPrenup to view the case and begin the process:
${loginUrl}

Regards,
LetsPrenup Team
`;
        if (typeof (this.mailService as any).sendMail === 'function') {
          await (this.mailService as any).sendMail(lawyerEmail, subject, bodyText);
        } else if (typeof (this.mailService as any).sendLawyerIntro === 'function') {
          await (this.mailService as any).sendLawyerIntro(lawyerEmail, c, message);
        } else {
          console.warn('Mail service has no sendMail helper; skipping lawyer intro email');
        }
      } else {
        console.warn('Could not resolve lawyer email for lawyer intro for case', c._id);
      }
    } catch (err) {
      console.error('Failed to send client-intro email to lawyer for case', c._id, err);
    }

    return c;
  }

  /**
   * Helper: prefer directEmail over publicEmail.
   */
  private getLawyerContactEmail(lawyerDoc: LawyerDocument | any): string | null {
    try {
      return (lawyerDoc as any).directEmail ?? (lawyerDoc as any).publicEmail ?? null;
    } catch (err) {
      return null;
    }
  }

  /**
   * Helper: prefer directPhone over publicPhone.
   */
  private getLawyerContactPhone(lawyerDoc: LawyerDocument | any): string | null {
    try {
      return (lawyerDoc as any).directPhone ?? (lawyerDoc as any).publicPhone ?? null;
    } catch (err) {
      return null;
    }
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
    const docs = await this.lawyerModel.find().skip(skip).limit(limit).lean().exec();
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
      .findByIdAndUpdate(caseId, { inviteCredentials: creds }, { new: true, useFindAndModify: false })
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

  // -----------------------
  // Approvals (unchanged)
  // -----------------------

  async approveCaseByUser(caseId: string, actorId: string): Promise<CaseDocument> {
    if (!Types.ObjectId.isValid(caseId)) {
      throw new BadRequestException('Invalid case id');
    }

    const c = await this.caseModel.findById(caseId);
    if (!c) throw new NotFoundException('Case not found');

    if (!c.fullyLocked || !this.areAllStepsSubmitted(c)) {
      throw new BadRequestException('Case must be fully locked and completed before approval');
    }

    const actorObjId = new Types.ObjectId(actorId);

    const isOwner = c.owner?.toString() === actorObjId.toString();
    const isInvited = c.invitedUser?.toString() === actorObjId.toString();

    if (!isOwner && !isInvited) {
      throw new ForbiddenException('Actor not part of this case');
    }

    const now = new Date();

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

  async approveCaseByLawyer(caseId: string, lawyerId: string): Promise<CaseDocument> {
    if (!Types.ObjectId.isValid(caseId) || !Types.ObjectId.isValid(lawyerId)) {
      throw new BadRequestException('Invalid ids');
    }

    const c = await this.caseModel.findById(caseId);
    if (!c) throw new NotFoundException('Case not found');

    const selected =
      c.preQuestionnaireUser1?.selectedLawyer?.toString() === lawyerId ||
      c.preQuestionnaireUser2?.selectedLawyer?.toString() === lawyerId;

    if (!selected) {
      throw new ForbiddenException('Lawyer not selected for this case');
    }

    const approval = this.ensureApprovalObj(c);

    approval.lawyerApproved = true;
    approval.lawyerApprovedAt = new Date();
    approval.approvedLawyer = new Types.ObjectId(lawyerId);

    await c.save();
    return c;
  }

  async approveCaseByManager(caseId: string, actorId: string): Promise<CaseDocument> {
    if (!Types.ObjectId.isValid(caseId)) {
      throw new BadRequestException('Invalid case id');
    }

    const c = await this.caseModel.findById(caseId);
    if (!c) throw new NotFoundException('Case not found');

    const approval = this.ensureApprovalObj(c);

    approval.caseManagerApproved = true;
    approval.caseManagerApprovedAt = new Date();

    await c.save();
    return c;
  }

  // -----------------------
  // Helper functions (email resolving, friendly names)
  // -----------------------

  /**
   * Try to resolve an email address for an actor (owner or invited) using best-effort
   * (case doc might have populated owner/invitedUser objects or invite email)
   */
  private resolveEmailForActor(c: CaseDocument, actorObjId: Types.ObjectId | null): string | null {
    try {
      if (!actorObjId) return null;
      // owner
      if (c.owner && typeof (c.owner as any).toString === 'function') {
        if ((c.owner as any).toString() === actorObjId.toString()) {
          if ((c as any).owner && typeof (c as any).owner.email === 'string') {
            return (c as any).owner.email;
          }
        }
      }
      // invited user
      if (c.invitedUser && typeof (c.invitedUser as any).toString === 'function') {
        if ((c.invitedUser as any).toString() === actorObjId.toString()) {
          if ((c as any).invitedUser && typeof (c as any).invitedUser.email === 'string') {
            return (c as any).invitedUser.email;
          }
          if (c.invitedEmail) return c.invitedEmail;
        }
      }
      // fallback: if invitedEmail exists and actor matches invitedId
      if (c.invitedEmail) {
        if (c.invitedUser == null) {
          // maybe actor is external invited person; return invitedEmail
          return c.invitedEmail;
        }
      }
      return null;
    } catch (err) {
      console.warn('resolveEmailForActor error', err);
      return null;
    }
  }

  private friendlyStepName(stepNumber: number): string {
    switch (stepNumber) {
      case 1:
        return 'Personal details (step 1)';
      case 2:
        return 'Select lawyer (step 2)';
      case 3:
        return 'Partner personal details (step 3)';
      case 4:
        return 'Partner finances (step 4)';
      case 5:
        return 'Joint assets (step 5)';
      case 6:
        return 'Future assets (step 6)';
      case 7:
        return 'Finalise & submit (step 7)';
      default:
        return `Step ${stepNumber}`;
    }
  }
}
