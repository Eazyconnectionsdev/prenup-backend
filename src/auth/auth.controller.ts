
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  NotFoundException,
  UnauthorizedException,
  Put,
  Delete,
  Param,
} from '@nestjs/common';

import type { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RequestResetDto } from './dto/request-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { CasesService } from '../cases/cases.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { UpdateUserDto } from './dto/update-user.dto';

import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { UsersService } from '../users/users.service';

// import cookie helpers from same folder (adjust path if you put cookie.utils elsewhere)
import { DEFAULT_COOKIE_OPTIONS, cookieOptionsWithMaxAge } from './cookie.utils';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private casesService: CasesService,
    private usersService: UsersService,
  ) {}

  @Post('register')
  @HttpCode(201)
  async register(@Body() dto: RegisterDto) {
    const result = await this.authService.registerAndSendOtp(dto);
    return {
      message: 'Registration successful. An OTP has been sent to your email for verification.',
      email: result.email,
      expiresAt: result.expiresAt,
      success : true
    };
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {

    const user = await this.authService.validateUser(dto.email, dto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.emailVerified) {
      throw new UnauthorizedException('Email not verified. Please verify via OTP sent to your email.');
    }

    const userCase = await this.casesService.findByCaseId(user.inviteCaseId);
    
    const signed = this.authService.signUser(user);
    const token = signed.token;
    const expiresAt = signed.expiresAt;
    const maxAge = expiresAt
      ? Math.max(0, expiresAt - Date.now())
      : 7 * 24 * 60 * 60 * 1000;

    // use centralized cookie options with maxAge
    res.cookie('access_token', token, cookieOptionsWithMaxAge(maxAge));

    return {
      success: true,
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
        inviteCaseId: user.inviteCaseId,
        invitedBy: user.invitedBy,
        invitedUser: user.invitedUser,
        endUserType: user.endUserType,
        acceptedTerms: !!user?.acceptedTerms,
        marketingConsent: !!user?.marketingConsent,
        paymentDone: !!(user as any)?.paymentDone,
      },
      caseId:
        userCase && (userCase._id || userCase.id)
          ? userCase._id
            ? userCase._id.toString()
            : userCase.id.toString()
          : null,
    };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Res({ passthrough: true }) res: Response) {
    // clearCookie must match domain/path/sameSite/secure used when setting
    res.clearCookie('access_token', { ...DEFAULT_COOKIE_OPTIONS, path: '/' });
    return { success: true };
  }

  @Post('request-reset')
  @HttpCode(200)
  async requestReset(@Body() dto: RequestResetDto) {
    await this.authService.requestPasswordReset(dto.email);
    return { message: 'If that email exists, a reset link has been sent' };
  }

  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.email, dto.token, dto.newPassword);
    return { message: 'Password reset successful' };
  }


  @Post('verify-otp')
  @HttpCode(200)
  async verifyOtp(@Body() dto: VerifyOtpDto, @Res({ passthrough: true }) res: Response) {
    const signed = await this.authService.verifyRegistrationOtp(dto.email, dto.otp);
    
    const token = signed.token;
    const expiresAt = signed.expiresAt;
    const maxAge = expiresAt
      ? Math.max(0, expiresAt - Date.now())
      : 7 * 24 * 60 * 60 * 1000;

    // include domain and other matching options
    res.cookie('access_token', token, cookieOptionsWithMaxAge(maxAge));

    const userDoc = await this.usersService.findById(signed.user._id);
    if (!userDoc) {
      throw new NotFoundException('User not found after verification');
    }

    const userCase = await this.casesService.findByCaseId(userDoc.inviteCaseId);

    return {
      success: true,
      user: {
        _id: userDoc._id?.toString ? userDoc._id.toString() : userDoc._id,
        firstName: userDoc?.firstName,
        middleName: userDoc?.middleName,
        lastName: userDoc?.lastName,
        email: userDoc.email,
        phone: userDoc?.phone,
        suffix: userDoc?.suffix,
        dateOfBirth: userDoc?.dateOfBirth ? userDoc.dateOfBirth.toISOString() : null,
        role: userDoc.role,
        inviteCaseId: userDoc.inviteCaseId,
        invitedBy: userDoc.invitedBy,
        invitedUser: userDoc.invitedUser,
        endUserType: userDoc.endUserType,
        acceptedTerms: !!userDoc?.acceptedTerms,
        marketingConsent: !!userDoc?.marketingConsent,
        paymentDone: !!(userDoc as any)?.paymentDone,
      },
      caseId:
        userCase && (userCase._id || userCase.id)
          ? userCase._id
            ? userCase._id.toString()
            : userCase.id.toString()
          : null,
    };
  }

  @Post('resend-otp')
  @HttpCode(200)
  async resendOtp(@Body() dto: ResendOtpDto) {
    await this.authService.resendRegistrationOtp(dto.email);
    return { message: 'If that email exists and is unverified, a new OTP was sent.' };
  }

  
  
  @Get('accept-invite')
  @HttpCode(200)
  async acceptInvite(
    @Query('token') token: string,
    @Query('caseId') caseId: string,
    @Query('email') email: string,
    @Query('name') name?: string,
    @Query('password') password?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const c = await this.casesService.findById(caseId);
    if (
      !c ||
      c.inviteToken !== token ||
      !c.inviteTokenExpires ||
      new Date() > c.inviteTokenExpires
    ) {
      throw new ForbiddenException('Invalid or expired invite token');
    }

    const result = await this.authService.acceptInvite(caseId, token, email, password, name);

    if (res && result && result.token) {
      const maxAge = 7 * 24 * 60 * 60 * 1000;
      res.cookie('access_token', result.token, cookieOptionsWithMaxAge(maxAge));
    }

    return {
      message: 'Invite accepted, user registered',
      ...result,
    };
  }

    @UseGuards(JwtAuthGuard)
    @Delete('/delete-partner')
    async deletePartner(@Req() req) {
      return this.authService.deletePartner(req.user.id);
    }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @HttpCode(200)
  async me(@Req() req: Request & { user?: any }) {
    const user = await this.authService.getUserProfile(req.user.id);
    return { user };
  }

  @UseGuards(JwtAuthGuard)
  @Put('update-details')
  async updateDetails(@Req() req, @Body() dto: UpdateUserDto) {
    const user = await this.authService.updateUserProfile(req.user.id, dto);
    return user;
  }
}
