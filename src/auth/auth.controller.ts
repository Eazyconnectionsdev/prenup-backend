import { Body, Controller, ForbiddenException, Get, HttpCode, Post, Query } from '@nestjs/common';
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
    );
  }

  @HttpCode(200)
  @Post('login')
  async login(@Body() dto: LoginDto) {
    const user = await this.authService.validateUser(dto.email, dto.password);
    if (!user) {
      return { error: 'Invalid credentials' };
    }
    return this.authService.signUser(user);
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

  @Get('accept-invite')
  async acceptInvite(
    @Query('token') token: string,
    @Query('caseId') caseId: string,
    @Query('email') email: string,
    @Query('name') name?: string,
    @Query('password') password?: string, // optional, generate if not provided
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

    // You can generate a random password if not provided
    const userPassword = password || this.authService.generateRandomPassword?.() || 'DefaultPass123';
    const user = await this.authService.acceptInvite(caseId, token, email, password, name);

    // Attach invited user to case
    await this.casesService.attachInvitedUser(caseId, (user as any)._id.toString());

    return {
      message: 'Invite accepted, user registered',
      user,
      password: userPassword, // optionally return generated password
    };
  }

}
