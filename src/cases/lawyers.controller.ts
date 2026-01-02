import { Controller, Post, UseGuards, Req, Body, Get, UploadedFile, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { LawyersService } from './lawyer.service';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Multer } from 'multer';

@Controller('admin/lawyers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LawyersController {
  constructor(private lawyersService: LawyersService) {}

  @Roles('admin', 'superadmin', 'case_manager')
  @Post('seed')
  async seed(@Req() req) {
    return this.lawyersService.seedInitialLawyersIfEmpty();
  }

  @Roles('admin', 'superadmin', 'case_manager')
  @UseInterceptors(FileInterceptor('photo'))
  @Post()
  async create(
    @Req() req,
    @UploadedFile() file: Multer.File,
    @Body() body: any,
  ) {
    const payload: any = { ...body };
    if (file) payload.avatarUrl = `/uploads/lawyers/${file.filename}`;
    return this.lawyersService.create(body.companyId, payload);
  }

  @Get()
  async listAll() {
    return this.lawyersService.listAll();
  }
}
