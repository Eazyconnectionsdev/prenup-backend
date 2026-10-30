import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import crypto from 'crypto';
import { Model, Types } from 'mongoose';
import {
  PartnerInvite,
  PartnerInviteDocument,
  PartnerInviteStatus,
  PartnerLinkConflictOutcome,
} from './schemas/partner_invite.schema';

const ACTIVE = [
  PartnerInviteStatus.PENDING,
  PartnerInviteStatus.OPENED,
  PartnerInviteStatus.EXPIRED,
];

// An invite that can still be acted on by the person it was sent to.
const OPEN = [PartnerInviteStatus.PENDING, PartnerInviteStatus.OPENED];

const norm = (v?: string | null) => (v ?? '').trim().toLowerCase();

export interface InviteInput {
  firstName?: string;
  lastName?: string;
  email: string;
  mobileNumber?: string;
  relationshipStatus?: string;
  targetWeddingDate?: Date | string;
  personalMessage?: string;
}

@Injectable()
export class PartnerInviteService {
  constructor(
    @InjectModel(PartnerInvite.name)
    private inviteModel: Model<PartnerInviteDocument>,
  ) {}

  static hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  latest(caseId: string | Types.ObjectId) {
    return this.inviteModel
      .findOne({ caseId: new Types.ObjectId(String(caseId)) })
      .sort({ createdAt: -1 })
      .exec();
  }

  // Call before issuing a new invite: a partner who already joined can't be
  // re-invited until they have been removed.
  async assertCanInvite(caseId: string) {
    const last = await this.latest(caseId);
    if (last?.status === PartnerInviteStatus.ACCEPTED) {
      throw new BadRequestException('Your partner has already joined this case');
    }
  }

  // Create the invite, or update it (re-invite) if the email is unchanged.
  // An invite to a different email revokes the previous one.
  async recordSent(
    caseId: string,
    inviterId: string,
    input: InviteInput,
    token: string,
    expiresAt: Date,
  ) {
    const email = norm(input.email);
    const invitee = {
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      email,
      mobileNumber: input.mobileNumber ?? null,
      relationshipStatus: input.relationshipStatus ?? null,
      targetWeddingDate: input.targetWeddingDate
        ? new Date(input.targetWeddingDate)
        : null,
      personalMessage: input.personalMessage ?? null,
    };
    const tokenHash = PartnerInviteService.hashToken(token);
    const now = new Date();

    const last = await this.latest(caseId);
    if (last && ACTIVE.includes(last.status)) {
      if (last.invitee.email === email) {
        last.invitee = invitee as any;
        last.tokenHash = tokenHash;
        last.expiresAt = expiresAt;
        last.status = PartnerInviteStatus.PENDING;
        last.openedAt = null;
        last.lastOpenedAt = null;
        last.resendCount = (last.resendCount || 0) + 1;
        last.lastResentAt = now;
        return last.save();
      }
      last.status = PartnerInviteStatus.REVOKED;
      last.revokedAt = now;
      await last.save();
    }

    return this.inviteModel.create({
      caseId: new Types.ObjectId(caseId),
      invitedBy: new Types.ObjectId(inviterId),
      invitee,
      tokenHash,
      expiresAt,
      sentAt: now,
      status: PartnerInviteStatus.PENDING,
    });
  }

  // Public: validates the emailed token, records the first open, and returns
  // only what the registration page needs.
  async openByToken(caseId: string, token: string) {
    if (!Types.ObjectId.isValid(caseId) || !token) {
      throw new BadRequestException('Invalid invite link');
    }
    const invite = await this.latest(caseId);
    if (
      !invite ||
      invite.tokenHash !== PartnerInviteService.hashToken(token) ||
      invite.status === PartnerInviteStatus.REVOKED ||
      invite.status === PartnerInviteStatus.REMOVED
    ) {
      throw new BadRequestException('Invalid invite link');
    }
    if (invite.status === PartnerInviteStatus.ACCEPTED) {
      throw new BadRequestException('This invite has already been used');
    }
    if (invite.expiresAt < new Date()) {
      invite.status = PartnerInviteStatus.EXPIRED;
      await invite.save();
      throw new BadRequestException('Invite expired');
    }

    const now = new Date();
    if (!invite.openedAt) invite.openedAt = now;
    invite.lastOpenedAt = now;
    invite.status = PartnerInviteStatus.OPENED;
    await invite.save();

    return {
      firstName: invite.invitee.firstName,
      lastName: invite.invitee.lastName,
      email: invite.invitee.email,
      mobileNumber: invite.invitee.mobileNumber,
      relationshipStatus: invite.invitee.relationshipStatus,
      targetWeddingDate: invite.invitee.targetWeddingDate,
      personalMessage: invite.invitee.personalMessage,
    };
  }

  // Signed-in acceptance. The invite is proven either by the emailed token or,
  // with no token, by being signed in as the (verified) address it was sent to.
  // Unlike openByToken this does not record an "open".
  async findAcceptable(
    caseId: string,
    user: { email: string },
    token?: string | null,
  ) {
    if (!Types.ObjectId.isValid(caseId)) {
      throw new BadRequestException('Invalid invite link');
    }
    const invite = await this.latest(caseId);
    if (
      !invite ||
      invite.status === PartnerInviteStatus.REVOKED ||
      invite.status === PartnerInviteStatus.REMOVED
    ) {
      throw new BadRequestException('Invalid invite link');
    }
    if (token) {
      if (invite.tokenHash !== PartnerInviteService.hashToken(token)) {
        throw new BadRequestException('Invalid invite link');
      }
    } else if (norm(user.email) !== invite.invitee.email) {
      throw new BadRequestException('Invalid invite link');
    }
    if (invite.status === PartnerInviteStatus.ACCEPTED) {
      throw new BadRequestException('This invite has already been used');
    }
    if (invite.expiresAt < new Date()) {
      if (invite.status !== PartnerInviteStatus.EXPIRED) {
        invite.status = PartnerInviteStatus.EXPIRED;
        await invite.save();
      }
      throw new BadRequestException('Invite expired');
    }
    return invite;
  }

  // The newest still-open invitation addressed to this email, if any. Lets a
  // person who signed up on their own (not via the emailed link) find it.
  findPendingForEmail(email: string) {
    return this.inviteModel
      .findOne({
        'invitee.email': norm(email),
        status: { $in: OPEN },
        expiresAt: { $gt: new Date() },
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  // One partner per person: once someone is linked, every other open
  // invitation to them, and every invitation they sent, is withdrawn.
  async revokeOutstanding(opts: {
    email: string;
    ownCaseIds: Types.ObjectId[];
    exceptCaseId: Types.ObjectId | string;
  }) {
    const or: any[] = [{ 'invitee.email': norm(opts.email) }];
    if (opts.ownCaseIds.length) or.push({ caseId: { $in: opts.ownCaseIds } });

    await this.inviteModel.updateMany(
      {
        status: { $in: ACTIVE },
        caseId: { $ne: new Types.ObjectId(String(opts.exceptCaseId)) },
        $or: or,
      },
      { $set: { status: PartnerInviteStatus.REVOKED, revokedAt: new Date() } },
    );
  }

  async markAccepted(
    caseId: string,
    user: {
      _id: any;
      email: string;
      firstName?: string | null;
      lastName?: string | null;
    },
  ) {
    const invite = await this.latest(caseId);
    if (!invite) return null;

    invite.status = PartnerInviteStatus.ACCEPTED;
    invite.acceptedAt = new Date();
    invite.acceptedUser = user._id;
    invite.emailMatchedInvite = norm(user.email) === invite.invitee.email;
    invite.nameMatchedInvite =
      norm(user.firstName) === norm(invite.invitee.firstName) &&
      norm(user.lastName) === norm(invite.invitee.lastName);
    return invite.save();
  }

  // The partner was unlinked after joining; the case may invite again.
  async markRemoved(caseId: string, actorId: string, reason?: string | null) {
    const invite = await this.latest(caseId);
    if (!invite || invite.status !== PartnerInviteStatus.ACCEPTED) return null;

    invite.status = PartnerInviteStatus.REMOVED;
    invite.removedAt = new Date();
    invite.removedBy = new Types.ObjectId(actorId);
    invite.removalReason = reason?.trim() || null;
    return invite.save();
  }

  // Hold the link for staff: the invited person has a case with real content.
  async flagConflict(
    caseId: string,
    data: {
      userId: Types.ObjectId;
      existingCaseId: Types.ObjectId;
      reasons: string[];
    },
  ) {
    const invite = await this.latest(caseId);
    if (!invite) return null;

    const open = invite.conflict && !invite.conflict.resolvedAt;
    if (open) return invite;

    invite.conflict = { ...data, flaggedAt: new Date() };
    invite.markModified('conflict');
    return invite.save();
  }

  async resolveConflict(
    caseId: string,
    actorId: string,
    outcome: PartnerLinkConflictOutcome,
    note?: string | null,
  ) {
    const invite = await this.latest(caseId);
    if (!invite?.conflict || invite.conflict.resolvedAt) {
      throw new BadRequestException('There is no open conflict on this invite');
    }

    invite.conflict = {
      ...invite.conflict,
      resolvedAt: new Date(),
      resolvedBy: new Types.ObjectId(actorId),
      outcome,
      note: note?.trim() || null,
    };
    invite.markModified('conflict');

    if (outcome === PartnerLinkConflictOutcome.REJECTED) {
      invite.status = PartnerInviteStatus.REVOKED;
      invite.revokedAt = new Date();
    }
    return invite.save();
  }

  // Inviter view: what was typed, the live status, and (once accepted) who
  // actually registered, read live from the User document.
  async getForCase(caseId: string) {
    if (!Types.ObjectId.isValid(caseId)) {
      throw new BadRequestException('Invalid case id');
    }
    const invite = await this.inviteModel
      .findOne({ caseId: new Types.ObjectId(caseId) })
      .sort({ createdAt: -1 })
      .populate('acceptedUser', 'firstName lastName email phone emailVerified')
      .exec();
    if (!invite) return { invite: null };

    // The partner was removed: the case is free to invite again.
    if (invite.status === PartnerInviteStatus.REMOVED) {
      return {
        invite: null,
        removed: {
          removedAt: invite.removedAt ?? null,
          reason: invite.removalReason ?? null,
        },
      };
    }

    if (
      ACTIVE.includes(invite.status) &&
      invite.status !== PartnerInviteStatus.EXPIRED &&
      invite.expiresAt < new Date()
    ) {
      invite.status = PartnerInviteStatus.EXPIRED;
      await invite.save();
    }

    const u: any = invite.acceptedUser;
    const registered = u
      ? {
          _id: String(u._id),
          firstName: u.firstName ?? null,
          lastName: u.lastName ?? null,
          email: u.email,
          phone: u.phone ?? null,
          emailVerified: !!u.emailVerified,
        }
      : null;

    return {
      invite: {
        _id: String(invite._id),
        status: invite.status,
        invitee: invite.invitee,
        sentAt: invite.sentAt,
        expiresAt: invite.expiresAt,
        resendCount: invite.resendCount,
        lastResentAt: invite.lastResentAt ?? null,
        openedAt: invite.openedAt ?? null,
        acceptedAt: invite.acceptedAt ?? null,
        registered,
        conflict: invite.conflict ?? null,
        // Computed live so later profile edits by the partner are reflected.
        emailDiffers: registered
          ? norm(registered.email) !== invite.invitee.email
          : false,
        nameDiffers: registered
          ? norm(registered.firstName) !== norm(invite.invitee.firstName) ||
            norm(registered.lastName) !== norm(invite.invitee.lastName)
          : false,
      },
    };
  }
}
