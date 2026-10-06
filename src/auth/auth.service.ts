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
import { PartnerInviteService } from '../cases/partner-invite.service';
import { Model, Types } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from 'src/users/schemas/user.schema';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private jwtService: JwtService,
    private usersService: UsersService,
    private mailService: MailService,
    private config: ConfigService,
    private casesService: CasesService,
    private partnerInviteService: PartnerInviteService,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) { }

  private static readonly RESEND_COOLDOWN_MS = 60 * 1000;

  private static readonly DUMMY_HASH =
    '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.4V8y1o0xqJ1vYk0M3m1m2uZ5s3gC';

  async registerAndSendOtp(dto: any) {
    const {
      email,
      password,
      firstName,
      middleName,
      lastName,
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
      // Never trust client-supplied role / endUserType on public signup.
      role: 'end_user',
      endUserType: 'user1',
      phone: phone?.trim(),
      marketingConsent: !!marketingConsent,
      acceptedTerms: true,
      emailVerified: false,
    } as any);

    const createdCase = await this.casesService.create(user._id.toString());

    await this.userModel.findByIdAndUpdate(
      user._id,
      { $set: { inviteCaseId: createdCase._id } },
      { new: true },
    );

    const otpResult = await this.generateAndSendVerificationOtp(user);

    return {
      email: user.email,
      expiresAt: otpResult.expiresAt,
    };
  }

  async generateAndSendVerificationOtp(user: any) {
    const otpLength = Number(this.config.get('OTP_LENGTH') || 6);
    const otp = this.generateNumericOtp(otpLength);
    const expires = new Date(
      Date.now() +
      Number(this.config.get('OTP_EXPIRY_MINUTES') || 10) * 60 * 1000,
    );

    // store OTP on user
    await this.usersService.setEmailVerificationOtp(
      user._id.toString(),
      otp,
      expires,
    );

    // attempt to send OTP email (don't fail registration if emailing fails)
    try {
      await this.mailService.sendVerificationOtp(user.email, otp, {
        expiresAt: expires,
      });
    } catch (err) {
      // log and continue; user can resend OTP
      this.logger.error('Failed to send verification OTP', err as any);
    }

    return { otp, expiresAt: expires.getTime() };
  }

  async verifyRegistrationOtp(email: string, otp: string): Promise<any> {
    const normalizedEmail = email?.toLowerCase?.();

    if (!normalizedEmail) throw new BadRequestException('Email required');

    const user = await this.usersService.findByEmail(normalizedEmail);
    if (!user) throw new NotFoundException('User not found');

    if (!user.emailVerificationOtp || user.emailVerificationOtp !== otp) {
      throw new BadRequestException('Invalid OTP');
    }
    if (

      !user.emailVerificationOtpExpires ||
      user.emailVerificationOtpExpires < new Date()
    ) {
      throw new BadRequestException('OTP expired');
    }

    await this.usersService.markEmailVerified(user._id.toString());
    await this.usersService.clearEmailVerificationOtp(user._id.toString());

    const freshUser = await this.usersService.findById(user._id.toString());

    return this.signUser(freshUser);
  }

  async resendRegistrationOtp(email: string) {
    const normalizedEmail = email?.toLowerCase?.();
    if (!normalizedEmail) return;

    const user = await this.usersService.findByEmail(normalizedEmail);
    if (!user) return;

    if (user.emailVerified) {
      return;
    }

    // Cooldown: ignore resend if the current OTP was issued under 60s ago.
    // Works for expired OTPs too (they were issued long ago).
    const expiryMs =
      Number(this.config.get('OTP_EXPIRY_MINUTES') || 10) * 60 * 1000;
    const issuedAt = user.emailVerificationOtpExpires
      ? user.emailVerificationOtpExpires.getTime() - expiryMs
      : 0;
    if (Date.now() - issuedAt < AuthService.RESEND_COOLDOWN_MS) {
      throw new BadRequestException(
        'Please wait a minute before requesting another code',
      );
    }

    await this.generateAndSendVerificationOtp(user);
  }

  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByEmail(email?.trim());

    // Always run a bcrypt compare so a missing user and a wrong password take
    // about the same time (prevents email enumeration by timing).
    const ok = await this.usersService.comparePassword(
      password,
      user?.passwordHash || AuthService.DUMMY_HASH,
    );
    if (!user || !ok) return null;
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
  async acceptInvite(
    caseId: string,
    token: string,
    password: string,
    profile: {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
    } = {},
  ) {
    const caseDoc = await this.casesService.findById(caseId);
    if (!caseDoc) {
      throw new BadRequestException(
        'Invalid case or invite',
      );

    }

    if (
      !caseDoc.inviteToken ||
      caseDoc.inviteToken !== token
    ) {
      throw new BadRequestException(
        'Invalid token',
      );

    }

    if (
      !caseDoc.inviteTokenExpires ||
      caseDoc.inviteTokenExpires < new Date()
    ) {
      throw new BadRequestException(
        'Invite expired',
      );
    }


    const partner =

      caseDoc.partnerInviteDetails;

    if (!partner?.email) {
      throw new BadRequestException(
        'Partner invitation details not found',

      );
    }

    // The partner may register with their own email/name/phone. If the email
    // differs from the one invited, it is unverified until they confirm an OTP.
    const invitedEmail = partner.email.toLowerCase();
    const email = (profile.email?.trim() || invitedEmail).toLowerCase();
    const emailChanged = email !== invitedEmail;
    const existing =
      await this.usersService.findByEmail(
        email,
      );

    if (existing) {
      throw new BadRequestException(
        'User already exists',
      );
    }

    const firstName = profile.firstName?.trim() || partner.firstName;
    const lastName = profile.lastName?.trim() || partner.lastName;
    const fullName = [
      firstName,
      lastName,
    ]
      .filter(Boolean)

      .join(' ')
      .trim();

    const passwordHash =
      await this.usersService.hashPassword(
        password,
      );

    let user;

    try {

      user =
        await this.usersService.create({
          email,
          passwordHash,
          firstName,

          lastName,
          phone: profile.phone?.trim() || partner.mobileNumber || null,
          role: 'end_user',
          endUserType: 'user2',
          invitedBy: caseDoc.owner,
          inviteCaseId: caseDoc._id,
          acceptedTerms: true,
          emailVerified: !emailChanged,
        } as any);
    } catch (err) {
      this.logger?.error?.(
        'User creation failed in acceptInvite',
        err as any,
      );

      throw new BadRequestException(
        'Failed to create invited user',
      );
    }

    await this.userModel.updateOne(
      { _id: caseDoc.owner },
      {

        $set: {
          invitedUser: user._id,
        },

      },
    );


    const createdId =
      user && (user as any)._id
        ? (user as any)._id.toString()
        : user && (user as any).id
          ? (user as any).id.toString()

          : null;

    if (!createdId) {
      this.logger?.error?.(
        'Created user missing _id or id',
        { user },
      );

      throw new BadRequestException(
        'User creation did not return id',
      );
    }

    await this.casesService.attachInvitedUser(
      caseId,
      createdId,
    );

    // Track who actually registered (compared with what the inviter typed).
    await this.partnerInviteService.markAccepted(caseId, user as any);

    // Different email: it must be verified before the partner can sign in.
    if (emailChanged) {
      await this.generateAndSendVerificationOtp(user);
      return {
        success: true,
        requiresEmailVerification: true,
        email,
      };
    }

    try {
      await this.mailService.sendInviteCredentials(
        email,
        password,
        caseDoc._id.toString(),
      );
    } catch (err) {
      this.logger?.error?.(
        'Failed to send invite credentials email',
        err as any,
      );
    }

    return this.signUser(user);
  }
  async getUserProfile(id: string): Promise<User> {
    const user = await this.usersService.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async deletePartner(currentUserId: string): Promise<{ message: string }> {
    const user = await this.userModel.findById(currentUserId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.invitedUser) {
      throw new BadRequestException('No partner linked to this user');
    }

    const partner = await this.userModel.findByIdAndDelete(
      user.invitedUser._id,
    );
    if (!partner) {
      throw new NotFoundException('Partner not found');
    }

    partner.invitedBy = null;
    user.invitedUser = null;

    await user.save();

    if (user.inviteCaseId) {
      await this.casesService.deleteCaseDataForPartner(
        user.inviteCaseId.toString(),
      );
    }

    return { message: 'Partner removed successfully' };
  }

  //
  // Utilities
  //


  signUser(user: any): any {
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
        _id: user._id?.toString ? user._id.toString() : user._id,
        firstName: user?.firstName,
        middleName: user?.middleName,
        lastName: user?.lastName,
        email: user.email,
        phone: user?.phone,
        suffix: user?.suffix,
        dateOfBirth: user?.dateOfBirth ? user?.dateOfBirth.toISOString() : null,
        role: user.role,
        invitedBy: user.invitedBy,
        invitedUser: user.invitedUser,
        endUserType: user.endUserType,
        acceptedTerms: !!user?.acceptedTerms,
        marketingConsent: !!user?.marketingConsent,
        paymentDone: !!(user as any)?.paymentDone,
      },
    };
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

  async updateUserProfile(id: string, updateDto: UpdateUserDto): Promise<User> {
    const findUser = await this.usersService.findById(id);

    if (!findUser) {
      throw new NotFoundException('User not found');
    }

    const updates: Promise<any>[] = [];

    // update current user
    updates.push(
      this.userModel.findByIdAndUpdate(
        findUser._id,
        {
          $set: {
            firstName: updateDto.firstName,
            middleName: updateDto.middleName,
            lastName: updateDto.lastName,
            suffix: updateDto.suffix,
            email: updateDto.email,
            dateOfBirth: updateDto.dateOfBirth,
          },
        },
        { new: true, runValidators: true },
      ),
    );

    // update partner if exists
    if (findUser.invitedUser) {
      updates.push(
        this.userModel.findByIdAndUpdate(
          findUser.invitedUser,
          {
            $set: {
              firstName: updateDto.fianceFirstName,
              middleName: updateDto.fianceMiddleName,
              lastName: updateDto.fianceLastName,
              suffix: updateDto.fianceSuffix,
              email: updateDto.fianceEmail,
              dateOfBirth: updateDto.fianceDateOfBirth,
            },
          },
          { new: true, runValidators: true },
        ),
      );
    }

    const [updatedUser] = await Promise.all(updates);

    return updatedUser;
  }

  private generateNumericOtp(length = 6): string {
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    const n = Math.floor(Math.random() * (max - min + 1)) + min;
    return n.toString();
  }
}
