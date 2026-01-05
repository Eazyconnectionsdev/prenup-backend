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
import { Types } from 'mongoose';
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
  ) {}

  async register(dto: any) {
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

    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new BadRequestException('Email already registered');
    }

    const passwordHash = await this.usersService.hashPassword(password);

    const user = await this.usersService.create({
      email: email.toLowerCase(),
      passwordHash,
      firstName,
      middleName,
      lastName,
      role,
      endUserType,
      phone: phone?.trim(),
      marketingConsent: !!marketingConsent,
      acceptedTerms: true,
    });

    const userCase = await this.casesService.create(user._id.toString());

    const signed = this.signUser(user);

    return {
      token: signed.token,
      expiresAt: signed.expiresAt,

      user: {
        _id: user._id?.toString ? user._id.toString() : user._id,
        firstName: user?.firstName,
        middleName: user?.middleName,
        lastName: user?.lastName,
        email: user.email,
        phone: user?.phone,
        fianceDetails: user?.fianceDetails || {},
        suffix: user?.suffix,
        dateOfBirth: user?.dateOfBirth ? user.dateOfBirth.toISOString() : null,
        role: user.role,
        endUserType: user.endUserType,
        acceptedTerms: !!user?.acceptedTerms,
        marketingConsent: !!user?.marketingConsent,
      },

      caseId:
        userCase && (userCase._id || userCase.id)
          ? userCase._id
            ? userCase._id.toString()
            : userCase.id.toString()
          : null,
    };
  }

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
    const ok = await this.usersService.comparePassword(
      password,
      user.passwordHash,
    );
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
      Date.now() +
        Number(this.config.get('RESET_TOKEN_EXPIRY_HOURS') || 2) * 3600 * 1000,
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

  // inside AuthService (or the service that has acceptInvite)
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
        acceptedTerms : acceptedTerms
      } as any);
    } catch (err) {
      // log and rethrow with helpful message
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
      // dump user for debugging (don't leave verbose logging in production if it contains sensitive data)
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

    // 9) Send email with credentials (catch errors but don't crash the whole flow if email fails)
    try {
      await this.mailService.sendInviteCredentials(
        email,
        userPassword,
        caseDoc._id.toString(),
      );
    } catch (err) {
      // log the email failure but continue — inviter can still fetch stored creds
      this.logger?.error?.(
        'Failed to send invite credentials email',
        err as any,
      );
    }

    // 10) return signed user (token) or whatever signUser does
    return this.signUser(user);
  }

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
