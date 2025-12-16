import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { CasesService } from '../cases/cases.service';
import { Types } from 'mongoose';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private usersService: UsersService,
    private mailService: MailService,
    private config: ConfigService,
    private casesService: CasesService,
  ) {}

 async register(email: string, password: string, name?: string, role = 'end_user', endUserType?: string) {
    const existing = await this.usersService.findByEmail(email);
    if (existing) throw new BadRequestException('Email already registered');
    const passwordHash = await this.usersService.hashPassword(password);
    const user = await this.usersService.create({
      email: email.toLowerCase(),
      passwordHash,
      name,
      role,
      endUserType,
    } as any);
    return this.signUser(user);
  }

  signUser(user: any) {
    const payload = { id: user._id.toString(), role: user.role };
    const token = this.jwtService.sign(payload);
    return {
      token,
      user: {
        id: user._id.toString(), // ensure string
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
    const expires = new Date(Date.now() + Number(this.config.get('RESET_TOKEN_EXPIRY_HOURS') || 2) * 3600 * 1000);
    await this.usersService.setResetToken(user._id.toString(), token, expires);
    const resetUrl = `${this.config.get('APP_BASE_URL')}/auth/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`;
    await this.mailService.sendReset(user.email, resetUrl);
  }

  async resetPassword(email: string, token: string, newPassword: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new NotFoundException('User not found');
    if (!user.resetPasswordToken || user.resetPasswordToken !== token) throw new BadRequestException('Invalid token');
    if (!user.resetPasswordExpires || user.resetPasswordExpires < new Date()) throw new BadRequestException('Token expired');
    const hash = await this.usersService.hashPassword(newPassword);
    await this.usersService.updatePassword(user._id.toString(), hash);
  }

  // Accept invite: creates user2 and binds to case
  async acceptInvite(caseId: string, token: string, email: string, password: string, name?: string) {
    const caseDoc = await this.casesService.findById(caseId);
    if (!caseDoc) throw new BadRequestException('Invalid case or invite');
    if (!caseDoc.inviteToken || caseDoc.inviteToken !== token) throw new BadRequestException('Invalid token');
    if (!caseDoc.inviteTokenExpires || caseDoc.inviteTokenExpires < new Date()) throw new BadRequestException('Invite expired');

    // === SAFELY CHECK invitedEmail (avoid calling toLowerCase on null) ===
    if (!caseDoc.invitedEmail || caseDoc.invitedEmail.toLowerCase() !== email.toLowerCase()) {
      throw new BadRequestException('Invite email mismatch');
    }

    const existing = await this.usersService.findByEmail(email);
    if (existing) throw new BadRequestException('User already exists');

    const passwordHash = await this.usersService.hashPassword(password);
    const user = await this.usersService.create({
      email: email.toLowerCase(),
      passwordHash,
      name,
      role: 'end_user',
      endUserType: 'user2',
      invitedBy: caseDoc.owner,
      inviteCaseId: caseDoc._id,
    } as any);

    // attach to case — convert ObjectId to string if necessary
    // If your CasesService.attachInvitedUser accepts string IDs, use .toString()
    await this.casesService.attachInvitedUser(caseId, user._id.toString());

    return this.signUser(user);
  }
}
