import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RequestResetDto } from './dto/request-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    // caution: in production do not let clients create admin/superadmin
    return this.authService.register(dto.email, dto.password, dto.name, dto.role || 'end_user', (dto as any).endUserType || null);
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

  @Post('accept-invite')
  async acceptInvite(@Body() body: { caseId: string; token: string; email: string; password: string; name?: string }) {
    return this.authService.acceptInvite(body.caseId, body.token, body.email, body.password, body.name);
  }
}
