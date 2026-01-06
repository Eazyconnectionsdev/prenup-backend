// src/auth/auth.service.ts
import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { CasesService } from '../cases/cases.service';
import { Model, Types } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from 'src/users/schemas/user.schema';
import { UpdateUserDto } from './dto/update-user.dto';

export interface SignedUser {
  token: string;
  expiresAt: number;
  user: {
    id: string;
    email: string;
    role: string;
    endUserType?: string;
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private jwtService: JwtService,
    private usersService: UsersService,
    private mailService: MailService,
    private config: ConfigService,
    private casesService: CasesService,
    @InjectModel(User.name) private userModel: Model<UserDocument>
  ) {}

  //
  // Registration (with OTP)
  //
  async registerAndSendOtp(dto: any) {
    const {
      email,
      password,
      firstName,
      middleName,
      lastName,
      role = 'end_user',
      endUserType,
      phone,
      marketingConsent = false,
      acceptedTerms,
    } = dto;

    if (!acceptedTerms) {
      throw new BadRequestException(
        'You must accept the Terms & Conditions and Privacy Policy',
      );
    }

    const normalizedEmail = email?.toLowerCase?.();
    if (!normalizedEmail) throw new BadRequestException('Email required');

    const existing = await this.usersService.findByEmail(normalizedEmail);
    if (existing) {
      throw new BadRequestException('Email already registered');
    }

    const passwordHash = await this.usersService.hashPassword(password);

    const user = await this.usersService.create({
      email: normalizedEmail,
      passwordHash,
      firstName,
      middleName,
      lastName,
      role,
      endUserType,
      phone: phone?.trim(),
      marketingConsent: !!marketingConsent,
      acceptedTerms: true,
      emailVerified: false,
    } as any);

    // create a case for the user (your business logic might differ)
    await this.casesService.create(user._id.toString());

    // generate and send OTP
    const otpResult = await this.generateAndSendVerificationOtp(user);

    return {
      email: user.email,
      expiresAt: otpResult.expiresAt,
    };
  }

  // Generate numeric OTP, save to user, and send via mail service
  async generateAndSendVerificationOtp(user: any) {
    const otpLength = Number(this.config.get('OTP_LENGTH') || 6);
    const otp = this.generateNumericOtp(otpLength);
    const expires = new Date(
      Date.now() + Number(this.config.get('OTP_EXPIRY_MINUTES') || 10) * 60 * 1000,
    );

    // store OTP on user
    await this.usersService.setEmailVerificationOtp(user._id.toString(), otp, expires);

    // attempt to send OTP email (don't fail registration if emailing fails)
    try {
      await this.mailService.sendVerificationOtp(user.email, otp, { expiresAt: expires });
    } catch (err) {
      // log and continue; user can resend OTP
      this.logger.error('Failed to send verification OTP', err as any);
    }

    return { otp, expiresAt: expires.getTime() };
  }

  // Verify OTP for registration - marks emailVerified and signs user
  async verifyRegistrationOtp(email: string, otp: string): Promise<SignedUser> {
    const normalizedEmail = email?.toLowerCase?.();
    if (!normalizedEmail) throw new BadRequestException('Email required');

    const user = await this.usersService.findByEmail(normalizedEmail);
    if (!user) throw new NotFoundException('User not found');

    if (!user.emailVerificationOtp || user.emailVerificationOtp !== otp) {
      throw new BadRequestException('Invalid OTP');
    }
    if (!user.emailVerificationOtpExpires || user.emailVerificationOtpExpires < new Date()) {
      throw new BadRequestException('OTP expired');
    }

    // mark verified and clear OTP
    await this.usersService.markEmailVerified(user._id.toString());
    await this.usersService.clearEmailVerificationOtp(user._id.toString());

    // Re-fetch user to ensure latest fields (optional)
    const freshUser = await this.usersService.findById(user._id.toString());

    // sign and return
    return this.signUser(freshUser);
  }

  // Resend OTP (if user exists and not verified)
  async resendRegistrationOtp(email: string) {
    const normalizedEmail = email?.toLowerCase?.();
    if (!normalizedEmail) return;

    const user = await this.usersService.findByEmail(normalizedEmail);
    if (!user) return;

    if (user.emailVerified) {
      // already verified - nothing to do
      return;
    }

    await this.generateAndSendVerificationOtp(user);
  }

  //
  // Existing auth helpers
  //
  signUser(user: any): SignedUser {
    const payload = { id: user._id.toString(), role: user.role };
    const token = this.jwtService.sign(payload);

    const decoded: any = this.jwtService.decode(token);
    const expiresAt = decoded?.exp
      ? decoded.exp * 1000
      : Date.now() + 7 * 24 * 60 * 60 * 1000;

    return {
      token,
      expiresAt,
      user: {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        endUserType: user.endUserType,
      },
    };
  }

  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) return null;
    const ok = await this.usersService.comparePassword(password, user.passwordHash);
    if (!ok) return null;
    return user;
  }

  async requestPasswordReset(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      // do not leak
      return;
    }
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(
      Date.now() + Number(this.config.get('RESET_TOKEN_EXPIRY_HOURS') || 2) * 3600 * 1000,
    );
    await this.usersService.setResetToken(user._id.toString(), token, expires);
    const resetUrl = `${this.config.get('APP_BASE_URL')}/auth/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`;
    await this.mailService.sendReset(user.email, resetUrl);
  }

  async resetPassword(email: string, token: string, newPassword: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new NotFoundException('User not found');
    if (!user.resetPasswordToken || user.resetPasswordToken !== token)
      throw new BadRequestException('Invalid token');
    if (!user.resetPasswordExpires || user.resetPasswordExpires < new Date())
      throw new BadRequestException('Token expired');
    const hash = await this.usersService.hashPassword(newPassword);
    await this.usersService.updatePassword(user._id.toString(), hash);
  }

  //
  // Invite acceptance (existing logic)
  //
  async acceptInvite(
    caseId: string,
    token: string,
    email: string,
    password?: string,
    name?: string,
  ) {
    // 1) validate case & invite token
    const caseDoc = await this.casesService.findById(caseId);
    if (!caseDoc) throw new BadRequestException('Invalid case or invite');
    if (!caseDoc.inviteToken || caseDoc.inviteToken !== token)
      throw new BadRequestException('Invalid token');
    if (!caseDoc.inviteTokenExpires || caseDoc.inviteTokenExpires < new Date())
      throw new BadRequestException('Invite expired');

    if (
      !caseDoc.invitedEmail ||
      caseDoc.invitedEmail.toLowerCase() !== email.toLowerCase()
    ) {
      throw new BadRequestException('Invite email mismatch');
    }

    // 2) ensure user does not already exist
    const existing = await this.usersService.findByEmail(email);
    if (existing) throw new BadRequestException('User already exists');

    // 3) generate password (if not provided)
    const userPassword = password || this.usersService.generateRandomPassword();

    // 4) hash
    const passwordHash = await this.usersService.hashPassword(userPassword);
    const acceptedTerms = true;

    // 5) create user with try/catch and debug logging
    let user;
    try {
      user = await this.usersService.create({
        email: email.toLowerCase(),
        passwordHash,
        name,
        role: 'end_user',
        endUserType: 'user2',
        invitedBy: caseDoc.owner,
        inviteCaseId: caseDoc._id,
        acceptedTerms: acceptedTerms,
        emailVerified: true, // invited users considered verified by invite flow
      } as any);
    } catch (err) {
      this.logger?.error?.('User creation failed in acceptInvite', err as any);
      throw new BadRequestException('Failed to create invited user');
    }

    // 6) defensive check: ensure we have an id to attach
    const createdId =
      user && (user as any)._id
        ? (user as any)._id.toString()
        : user && (user as any).id
          ? (user as any).id.toString()
          : null;

    if (!createdId) {
      this.logger?.error?.('Created user missing _id or id', { user });
      throw new BadRequestException('User creation did not return id');
    }

    // 7) Attach user to case (this clears invite token inside attachInvitedUser)
    await this.casesService.attachInvitedUser(caseId, createdId);

    // 8) store invite credentials (use service method to avoid VersionError)
    await this.casesService.setInviteCredentials(caseId, {
      email: email.toLowerCase(),
      password: userPassword,
      createdAt: new Date(),
    });

    // 9) Send email with credentials (catch errors but don't crash)
    try {
      await this.mailService.sendInviteCredentials(
        email,
        userPassword,
        caseDoc._id.toString(),
      );
    } catch (err) {
      this.logger?.error?.('Failed to send invite credentials email', err as any);
    }

    // 10) return signed user (token)
    return this.signUser(user);
  }

  //
  // Utilities
  //
  generateRandomPassword(length = 12): string {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }


  async updateUserProfile(id: string, updateDto: UpdateUserDto): Promise<User> {
      const user = await this.userModel.findByIdAndUpdate(
        id,
        {
          $set: {
            firstName: updateDto.firstName,
            middleName: updateDto.middleName,
            lastName: updateDto.lastName,
            suffix: updateDto.suffix,
            email: updateDto.email,
            dateOfBirth: updateDto.dateOfBirth,
            fianceDetails: {
              firstName: updateDto.fianceFirstName,
              middleName: updateDto.fianceMiddleName,
              lastName: updateDto.fianceLastName,
              suffix: updateDto.fianceSuffix,
              dateOfBirth: updateDto.fianceDateOfBirth,
              email: updateDto.fianceEmail,
            },
          },
        },
        { new: true, runValidators: true },
      );
  
      if (!user) {
        throw new NotFoundException('User not found');
      }
  
      return user;
    }
  private generateNumericOtp(length = 6): string {
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    const n = Math.floor(Math.random() * (max - min + 1)) + min;
    return n.toString();
  }
}
