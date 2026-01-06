// src/users/users.service.ts
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { User, UserDocument } from './schemas/user.schema';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly bcryptSaltRounds: number;

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
    const existing = await this.userModel.findOne({ email: normalized }).lean().exec();
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
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  // Find by id
  async findById(id: string): Promise<UserDocument | null> {
    if (!id) return null;
    if (!Types.ObjectId.isValid(id)) return null;
    return this.userModel.findById(new Types.ObjectId(id)).exec();
  }

  // Hash password
  async hashPassword(password: string): Promise<string> {
    if (!password) throw new BadRequestException('Password required for hashing');
    const salt = await bcrypt.genSalt(this.bcryptSaltRounds);
    return bcrypt.hash(password, salt);
  }

  // Compare password
  async comparePassword(plain: string, hash: string): Promise<boolean> {
    if (!plain || !hash) return false;
    return bcrypt.compare(plain, hash);
  }

  // Reset token helpers
  async setResetToken(userId: string, token: string, expires: Date): Promise<void> {
    if (!Types.ObjectId.isValid(userId)) throw new BadRequestException('Invalid user id');
    await this.userModel.findByIdAndUpdate(userId, {
      resetPasswordToken: token,
      resetPasswordExpires: expires,
    }).exec();
  }

  async clearResetToken(userId: string): Promise<void> {
    if (!Types.ObjectId.isValid(userId)) throw new BadRequestException('Invalid user id');
    await this.userModel.findByIdAndUpdate(userId, {
      resetPasswordToken: null,
      resetPasswordExpires: null,
    }).exec();
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    if (!Types.ObjectId.isValid(userId)) throw new BadRequestException('Invalid user id');
    await this.userModel.findByIdAndUpdate(userId, {
      passwordHash,
      resetPasswordToken: null,
      resetPasswordExpires: null,
    }).exec();
  }

  // Email OTP helpers
  async setEmailVerificationOtp(userId: string, otp: string, expires: Date): Promise<void> {
    if (!Types.ObjectId.isValid(userId)) throw new BadRequestException('Invalid user id');
    await this.userModel.findByIdAndUpdate(userId, {
      emailVerificationOtp: otp,
      emailVerificationOtpExpires: expires,
    }).exec();
  }

  async clearEmailVerificationOtp(userId: string): Promise<void> {
    if (!Types.ObjectId.isValid(userId)) throw new BadRequestException('Invalid user id');
    await this.userModel.findByIdAndUpdate(userId, {
      $unset: { emailVerificationOtp: '', emailVerificationOtpExpires: '' },
    }).exec();
  }

  async markEmailVerified(userId: string): Promise<void> {
    if (!Types.ObjectId.isValid(userId)) throw new BadRequestException('Invalid user id');
    await this.userModel.findByIdAndUpdate(userId, {
      emailVerified: true,
    }).exec();
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
}
