// src/cases/lawyers.controller.ts
import { Controller, Post, UseGuards, Req, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { LawyersService } from './lawyer.service';

@Controller('admin/lawyers')
export class LawyersController {
  constructor(private lawyersService: LawyersService) {}

  private isPrivileged(user: any) {
    return user && (user.role === 'admin' || user.role === 'superadmin' || user.role === 'case_manager');
  }

  @UseGuards(JwtAuthGuard)
  @Post('seed')
  async seed(@Req() req) {
    const user = req.user;
    if (!this.isPrivileged(user)) throw new ForbiddenException('Only admins may seed lawyers');
    return this.lawyersService.seedInitialLawyersIfEmpty();
  }
}
