
import {
  Controller,
  UseGuards,
  Req,
  Get,
  Param,
  Body,
  Post,
  Query,
  Patch,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AdminService } from './admin.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { CreateLawyerDto } from './dto/create-lawyer.dto';
import { CreateEnquiryDto } from './dto/create-enquiry.dto';

@UseGuards(JwtAuthGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  private ensureUser(req: any) {
    const user = req.user;
    if (!user) throw new BadRequestException('Authentication required');
    return user;
  }

  private isAdmin(user: any) {
    return user && (user.role === 'superadmin' || user.role === 'admin');
  }

  // ------------------- Users -------------------
  @Get('users')
  async listUsers(@Req() req, @Query('page') page = '1', @Query('limit') limit = '50') {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    const p = Number(page) || 1;
    const l = Number(limit) || 50;
    return this.adminService.listUsers(l, p);
  }

  @Get('users/:id')
  async getUser(@Req() req, @Param('id') id: string) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.getUserById(id);
  }

  @Patch('users/:id/role')
  async updateUserRole(@Req() req, @Param('id') id: string, @Body('role') role: string) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.updateUserRole(id, role, user.id || user._id);
  }

  @Patch('users/:id/deactivate')
  async deactivateUser(@Req() req, @Param('id') id: string) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.deactivateUser(id, user.id || user._id);
  }

  // ------------------- Enquiries -------------------
  @Get('enquiries')
  async listEnquiries(@Req() req, @Query('page') page = '1', @Query('limit') limit = '50') {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.listEnquiries(Number(limit) || 50, Number(page) || 1);
  }

  @Post('enquiries')
  async createEnquiry(@Req() req, @Body() body: CreateEnquiryDto) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.createEnquiry(body);
  }

  // ------------------- Companies -------------------
  @Get('companies')
  async listCompanies(@Req() req, @Query('page') page = '1', @Query('limit') limit = '50') {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.listCompanies(Number(limit) || 50, Number(page) || 1);
  }

  @Post('companies')
  async createCompany(@Req() req, @Body() body: CreateCompanyDto) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.createCompany(body);
  }

  @Patch('companies/:id/verify')
  async verifyCompany(@Req() req, @Param('id') id: string) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.setCompanyVerified(id, true, user.id || user._id);
  }

  // ------------------- Lawyers -------------------
  @Get('lawyers')
  async listLawyers(@Req() req, @Query('page') page = '1', @Query('limit') limit = '50') {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.listLawyers(Number(limit) || 50, Number(page) || 1);
  }

  @Post('lawyers')
  async createLawyer(@Req() req, @Body() body: CreateLawyerDto) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.createLawyer(body);
  }

  @Patch('lawyers/:id/verify')
  async verifyLawyer(@Req() req, @Param('id') id: string) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.setLawyerVerified(id, true, user.id || user._id);
  }

  @Patch('lawyers/:id/archive')
  async archiveLawyer(@Req() req, @Param('id') id: string) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.archiveLawyer(id, user.id || user._id);
  }
}
