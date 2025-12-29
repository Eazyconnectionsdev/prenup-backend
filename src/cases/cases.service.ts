import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import crypto from 'crypto';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Case, CaseDocument } from './schemas/case.schema';
import { MailService } from '../mail/mail.service';

@Injectable()
export class CasesService {
  constructor(
    @InjectModel(Case.name) private caseModel: Model<CaseDocument>,
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
   * If populate=true, populate owner and invitedUser (helpful for admin/case manager views).
   */
  async findById(id: string, populate = false) {
    if (!Types.ObjectId.isValid(id)) return null;
    const q = this.caseModel.findById(id);
    if (populate) q.populate('owner invitedUser');
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
   * Update a specific step on case and set status (submitted, submittedBy, submittedAt)
   * actorId must be a string user id
   *
   * lock param: if true the step will be marked locked (lockedBy/lockedAt set)
   */
  async updateStep(caseId: string, stepNumber: number, data: any, actorId: string, lock = false) {
    const c = await this.caseModel.findById(caseId);
    if (!c) throw new NotFoundException('Case not found');

    const key = `step${stepNumber}`;
    if (!['step1', 'step2', 'step3', 'step4', 'step5', 'step6', 'step7'].includes(key)) {
      throw new BadRequestException('Invalid step');
    }

    // assign the step object (replace or set as needed)
    (c as any)[key] = data;

    // ensure status container exists
    c.status = c.status || {};
    c.status[key] = c.status[key] || {};

    // ensure boolean/fields are present (avoid undefined)
    c.status[key].submitted = true;
    c.status[key].submittedBy = new Types.ObjectId(actorId);
    c.status[key].submittedAt = new Date();

    if (lock) {
      c.status[key].locked = true;
      c.status[key].lockedBy = new Types.ObjectId(actorId);
      c.status[key].lockedAt = new Date();
      // wipe previous unlock audit
      c.status[key].unlockedBy = null;
      c.status[key].unlockedAt = null;
    }

    await c.save();
    return c;
  }

  /**
   * Unlock a given step (privileged users)
   * actorId: id of the privileged user performing the unlock
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

  async setInviteCredentials(caseId: string, creds: { email: string; password: string; createdAt: Date }) {
    if (!Types.ObjectId.isValid(caseId)) {
      throw new BadRequestException('Invalid case id');
    }

    // Use findByIdAndUpdate to avoid optimistic concurrency VersionError
    return this.caseModel.findByIdAndUpdate(
      caseId,
      { inviteCredentials: creds },
      { new: true, useFindAndModify: false } // return updated doc
    ).exec();
  }

  // NOTE: kept for compatibility; previously returned one case — use findByUser for multi-case queries
  async findByUserId(userId: Types.ObjectId) {
    return this.caseModel.findOne({ owner: userId });
  }
}
