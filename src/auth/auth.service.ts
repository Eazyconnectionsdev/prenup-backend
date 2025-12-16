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
  ) { }

  async register(
    email: string,
    password: string,
    name?: string,
    role = 'end_user',
    endUserType?: string,
  ) {
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

    // Automatically create a case for this user
    const newCase = await this.casesService.create(user._id.toString());

    const signedUser = this.signUser(user);

    return {
      ...signedUser,
      caseId: newCase._id.toString(), // return the case ID so user can generate invite link
    };
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

  async acceptInvite(caseId: string, token: string, email: string, password?: string, name?: string) {
    const caseDoc = await this.casesService.findById(caseId);
    if (!caseDoc) throw new BadRequestException('Invalid case or invite');
    if (!caseDoc.inviteToken || caseDoc.inviteToken !== token) throw new BadRequestException('Invalid token');
    if (!caseDoc.inviteTokenExpires || caseDoc.inviteTokenExpires < new Date()) throw new BadRequestException('Invite expired');

    if (!caseDoc.invitedEmail || caseDoc.invitedEmail.toLowerCase() !== email.toLowerCase()) {
      throw new BadRequestException('Invite email mismatch');
    }

    const existing = await this.usersService.findByEmail(email);
    if (existing) throw new BadRequestException('User already exists');

    // Generate a random password if not provided
    const userPassword = password || this.usersService.generateRandomPassword();

    const passwordHash = await this.usersService.hashPassword(userPassword);

    const user = await this.usersService.create({
      email: email.toLowerCase(),
      passwordHash,
      name,
      role: 'end_user',
      endUserType: 'user2',
      invitedBy: caseDoc.owner,
      inviteCaseId: caseDoc._id,
    } as any);

    // Attach user to case
    await this.casesService.attachInvitedUser(caseId, user._id.toString());

    // Store the generated credentials in the case for later reference by owner (user1)
    caseDoc.inviteCredentials = {
      email: email.toLowerCase(),
      password: userPassword,
      createdAt: new Date(),
    };
    await caseDoc.save();

    // Send email to invited user with credentials
    await this.mailService.sendInviteCredentials(email, userPassword, caseDoc._id.toString());

    return this.signUser(user);
  }

    generateRandomPassword(length = 12): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}
