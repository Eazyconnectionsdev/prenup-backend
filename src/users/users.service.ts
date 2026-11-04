// src/users/users.service.ts
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { User, UserDocument } from './schemas/user.schema';
import { NotFoundException } from '@nestjs/common';
import { UpdateUserProfileDto } from './interface/update-user-profile.dto';
import { UpdatePartnerProfileDto } from './interface/update-partner-profile.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly bcryptSaltRounds: number;

  /** Everything the partner-details screen may read — nothing sensitive. */
  private static readonly PARTNER_FIELDS =
    '_id firstName middleName lastName suffix dateOfBirth email phone emailVerified role endUserType';

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private config: ConfigService,
  ) {
    this.bcryptSaltRounds = Number(this.config.get('BCRYPT_SALT_ROUNDS') || 10);
  }

  // Create user document
  async create(payload: Partial<User>): Promise<UserDocument> {
    if (!payload.email) {
      throw new BadRequestException('Email is required to create user');
    }
    const normalized = payload.email.toLowerCase();
    const existing = await this.userModel
      .findOne({ email: normalized })
      .lean()
      .exec();
    if (existing) {
      throw new BadRequestException('Email already exists');
    }

    const created = new this.userModel({
      ...payload,
      email: normalized,
    });
    return created.save();
  }

  // Find by email (normalized)
  async findByEmail(email: string): Promise<UserDocument | null> {
    if (!email) return null;
    return this.userModel
      .findOne({ email: email.toLowerCase() })
      // The sign-in, OTP and reset flows read these; they are hidden everywhere else.
      .select(
        '+passwordHash +resetPasswordToken +resetPasswordExpires +emailVerificationOtp +emailVerificationOtpExpires',
      )
      .populate([
        {
          path: 'invitedUser',
          select:
            '_id firstName middleName lastName email phone role endUserType dateOfBirth suffix',
        },
        {
          path: 'invitedBy',
          select:
            '_id firstName middleName lastName email phone role endUserType dateOfBirth suffix',
        },
      ])
      .exec();
  }

  // Find by id
  async findById(id: string): Promise<UserDocument | null> {
    if (!id) return null;
    if (!Types.ObjectId.isValid(id)) return null;
    return this.userModel
      .findById(new Types.ObjectId(id))
      .populate([
        {
          path: 'invitedUser',
          select:
            'firstName middleName lastName email phone role endUserType dateOfBirth suffix',
        },
        {
          path: 'invitedBy',
          select:
            'firstName middleName lastName email phone role endUserType dateOfBirth suffix',
        },
      ])
      .exec();
  }

  // Hash password
  async hashPassword(password: string): Promise<string> {
    if (!password)
      throw new BadRequestException('Password required for hashing');
    const salt = await bcrypt.genSalt(this.bcryptSaltRounds);
    return bcrypt.hash(password, salt);
  }

  async recordLogin(userId: string): Promise<void> {
    await this.userModel.updateOne({ _id: userId }, { $set: { lastLoginAt: new Date() } }).exec();
  }

  // Compare password
  async comparePassword(plain: string, hash: string): Promise<boolean> {
    if (!plain || !hash) return false;
    return bcrypt.compare(plain, hash);
  }

  // Reset token helpers
  async setResetToken(
    userId: string,
    token: string,
    expires: Date,
  ): Promise<void> {
    if (!Types.ObjectId.isValid(userId))
      throw new BadRequestException('Invalid user id');
    await this.userModel
      .findByIdAndUpdate(userId, {
        resetPasswordToken: token,
        resetPasswordExpires: expires,
      })
      .exec();
  }

  async clearResetToken(userId: string): Promise<void> {
    if (!Types.ObjectId.isValid(userId))
      throw new BadRequestException('Invalid user id');
    await this.userModel
      .findByIdAndUpdate(userId, {
        resetPasswordToken: null,
        resetPasswordExpires: null,
      })
      .exec();
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    if (!Types.ObjectId.isValid(userId))
      throw new BadRequestException('Invalid user id');
    await this.userModel
      .findByIdAndUpdate(userId, {
        passwordHash,
        resetPasswordToken: null,
        resetPasswordExpires: null,
      })
      .exec();
  }

  // Email OTP helpers
  async setEmailVerificationOtp(
    userId: string,
    otp: string,
    expires: Date,
  ): Promise<void> {
    if (!Types.ObjectId.isValid(userId))
      throw new BadRequestException('Invalid user id');
    await this.userModel
      .findByIdAndUpdate(userId, {
        emailVerificationOtp: otp,
        emailVerificationOtpExpires: expires,
      })
      .exec();
  }

  async clearEmailVerificationOtp(userId: string): Promise<void> {
    if (!Types.ObjectId.isValid(userId))
      throw new BadRequestException('Invalid user id');
    await this.userModel
      .findByIdAndUpdate(userId, {
        $unset: { emailVerificationOtp: '', emailVerificationOtpExpires: '' },
      })
      .exec();
  }

  async markEmailVerified(userId: string): Promise<void> {
    if (!Types.ObjectId.isValid(userId))
      throw new BadRequestException('Invalid user id');
    await this.userModel
      .findByIdAndUpdate(userId, {
        emailVerified: true,
      })
      .exec();
  }

  // Utility: generate random token
  generateRandomToken(bytes = 32): string {
    return crypto.randomBytes(bytes).toString('hex');
  }

  // Utility: generate random friendly password
  generateRandomPassword(length = 12): string {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }


async updateProfile(
  userId: string,
  updateData: UpdateUserProfileDto,
) {
  if (!Types.ObjectId.isValid(userId))
    throw new BadRequestException('Invalid user id');

  const user = await this.userModel.findByIdAndUpdate(
    userId,
    { $set: updateData },
    { new: true, runValidators: true },
  ).select(
    '-passwordHash -emailVerificationOtp -emailVerificationOtpExpires -resetPasswordToken -resetPasswordExpires',
  );

  if (!user) {
    throw new NotFoundException('User not found');
  }

  return user;
}

  // ── Partner (the other party on the same case) ─────────────────────────────

  /**
   * Resolve the partner linked to `userId`: the user they invited
   * (`invitedUser`) or, when they are the invited party, the owner who invited
   * them (`invitedBy`). Null when no partner has registered yet.
   */
  private async resolvePartnerId(
    userId: string,
  ): Promise<Types.ObjectId | null> {
    if (!Types.ObjectId.isValid(userId))
      throw new BadRequestException('Invalid user id');

    const me = await this.userModel
      .findById(new Types.ObjectId(userId))
      .select('invitedUser invitedBy')
      .lean()
      .exec();

    if (!me) throw new NotFoundException('User not found');

    return (me.invitedUser ?? me.invitedBy ?? null) as Types.ObjectId | null;
  }

  /** Partner details for the profile settings screen. */
  async getPartner(userId: string) {
    const partnerId = await this.resolvePartnerId(userId);
    if (!partnerId) return { partner: null };

    const partner = await this.userModel
      .findById(partnerId)
      .select(UsersService.PARTNER_FIELDS)
      .lean()
      .exec();

    return { partner: partner ?? null };
  }

  async updatePartnerProfile(
    userId: string,
    updateData: UpdatePartnerProfileDto,
  ) {
    const partnerId = await this.resolvePartnerId(userId);
    if (!partnerId) {
      throw new BadRequestException('No partner is linked to this account yet');
    }

    const partner = await this.userModel
      .findByIdAndUpdate(
        partnerId,
        { $set: updateData },
        { new: true, runValidators: true },
      )
      .select(UsersService.PARTNER_FIELDS)
      .lean()
      .exec();

    if (!partner) {
      throw new NotFoundException('Partner not found');
    }

    return { partner };
  }
}
