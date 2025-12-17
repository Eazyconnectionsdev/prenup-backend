// auth.controller.ts
import { Body, Controller, ForbiddenException, Get, HttpCode, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RequestResetDto } from './dto/request-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { CasesService } from '../cases/cases.service';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService, private casesService: CasesService) { }


  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(
      dto.email,
      dto.password,
      dto.name,
      dto.role || 'end_user',
      (dto as any).endUserType || null,
      dto.phone,
      typeof dto.marketingConsent === 'boolean' ? dto.marketingConsent : false,
      !!dto.acceptedTerms, // boolean (ValidationPipe should ensure proper type)
    );
  }
  // LOGIN: set cookie using passthrough so we can still return JSON
  @HttpCode(200)
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.authService.validateUser(dto.email, dto.password);
    if (!user) {
      return { error: 'Invalid credentials' };
    }

    const signed = this.authService.signUser(user);
    const token = signed.token;

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // must be true in prod (HTTPS)
      sameSite: process.env.NODE_ENV === 'production' ? 'none' as const : 'lax' as const,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      // domain: '.example.com', // set if needed for subdomains
      path: '/',
    };

    res.cookie('access_token', token, cookieOptions);

    // return user object (do NOT include token here)
    return { user: signed.user };
  }

  // LOGOUT: clear cookie
  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('access_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' as const : 'lax' as const,
      path: '/',
    });
    return { success: true };
  }

  @Post('request-reset')
  async requestReset(@Body() dto: RequestResetDto) {
    await this.authService.requestPasswordReset(dto.email);
    return { message: 'If that email exists, a reset link has been sent' };
  }

  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.email, dto.token, dto.newPassword);
    return { message: 'Password reset successful' };
  }

  // Accept-invite: create user and also sign-cookie
  @Get('accept-invite')
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

    const result = await this.authService.acceptInvite(
      caseId,
      token,
      email,
      password,
      name,
    );

    // if Response provided (it will be), set cookie
    if (res && result && result.token) {
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' as const : 'lax' as const,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
      };
      res.cookie('access_token', result.token, cookieOptions);
    }

    return {
      message: 'Invite accepted, user registered',
      ...result,
    };
  }
}
