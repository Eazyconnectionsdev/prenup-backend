// src/cases/cases.service.ts
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
  ) {}

  /**
   * Create a new case owned by ownerId
   */
  async create(ownerId: string, title?: string) {
    const c = new this.caseModel({ title: title || 'Untitled case', owner: new Types.ObjectId(ownerId) });
    return c.save();
  }

  /**
   * Find case by id, returns null if not valid id or not found
   */
  async findById(id: string) {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.caseModel.findById(id).exec();
  }

  /**
   * Attach invited user to a case and clear invite token
   */
  async attachInvitedUser(caseId: string, userId: string) {
    const c = await this.caseModel.findById(caseId);
    if (!c) throw new NotFoundException('Case not found');

    // ensure proper ObjectId assignment (TypeScript-friendly)
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
   */
  async updateStep(caseId: string, stepNumber: number, data: any, actorId: string) {
    const c = await this.caseModel.findById(caseId);
    if (!c) throw new NotFoundException('Case not found');

    const key = `step${stepNumber}`;
    if (!['step1', 'step2', 'step3', 'step4', 'step5', 'step6', 'step7'].includes(key)) {
      throw new BadRequestException('Invalid step');
    }

    // assign the step object (replace or set as needed)
    (c as any)[key] = data;
    c.status = c.status || {};

    // ensure submittedBy is stored as ObjectId
    c.status[key] = {
      submitted: true,
      submittedBy: new Types.ObjectId(actorId),
      submittedAt: new Date(),
    };

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
}
