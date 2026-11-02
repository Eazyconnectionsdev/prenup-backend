
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
  Put,
  Delete,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AdminService, MAX_COMPANY_FILE_BYTES, MAX_LAWYER_PHOTO_BYTES } from './admin.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { CreateCompanyDocumentDto } from './dto/create-company-document.dto';
import { CreateLawyerDto } from './dto/create-lawyer.dto';
import { CreateLawyerDocumentDto } from './dto/create-lawyer-document.dto';
import { CreateEnquiryDto } from './dto/create-enquiry.dto';
import { CreateCaseManagerDto } from './dto/create-case-manager.dto';

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

  // ------------------- Dashboard -------------------
  @Get('dashboard')
  async dashboard(@Req() req) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.getDashboard();
  }

  @Get('dashboard/stages')
  async dashboardStages(@Req() req) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.getDashboardStages();
  }

  @Get('dashboard/stages/:status/cases')
  async casesByStage(
    @Req() req,
    @Param('status') status: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.getCasesByStage(
      status,
      Number(page) || 1,
      Number(limit) || 20,
    );
  }

  // ------------------- Cases -------------------
  @Get('cases')
  async listCases(
    @Req() req,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.listCases(
      Number(page) || 1,
      Number(limit) || 50,
      status,
      search,
    );
  }

  // ------------------- Settings -------------------
  @Get('settings/topbar')
  async getTopbarSettings() {
    const settings = await this.adminService.getSettings();
    return {
      topBar1Enabled: settings.topBar1Enabled ?? true,
      topBar1Text: settings.topBar1Text ?? '',
      topBar2Enabled: settings.topBar2Enabled ?? true,
      topBar2Text: settings.topBar2Text ?? '',
      topBar: settings.topBar ?? [],
    };
  }

  @Get('settings')
  async getSettings(@Req() req) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.getSettings();
  }

  @Patch('settings')
  async updateSettingsPatch(@Req() req, @Body() body: any) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.updateSettings(body);
  }

  @Put('settings')
  async updateSettingsPut(@Req() req, @Body() body: any) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.updateSettings(body);
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

  @Get('companies/:id')
  async getCompany(@Req() req, @Param('id') id: string) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.getCompanyById(id);
  }

  @Post('companies')
  async createCompany(@Req() req, @Body() body: CreateCompanyDto) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.createCompany(body, user.id || user._id);
  }

  @Patch('companies/:id')
  async updateCompany(@Req() req, @Param('id') id: string, @Body() body: CreateCompanyDto) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.updateCompany(id, body);
  }

  @Post('companies/:id/documents')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_COMPANY_FILE_BYTES } }))
  async addCompanyDocument(
    @Req() req,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: CreateCompanyDocumentDto,
  ) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.addCompanyDocument(id, file, body, user.id || user._id);
  }

  @Get('companies/:id/documents/:docId/download')
  async downloadCompanyDocument(
    @Req() req,
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    const file = await this.adminService.getCompanyDocumentFile(id, docId);
    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(file.buffer);
  }

  @Delete('companies/:id/documents/:docId')
  async deleteCompanyDocument(@Req() req, @Param('id') id: string, @Param('docId') docId: string) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.deleteCompanyDocument(id, docId);
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

  @Get('lawyers/:id')
  async getLawyer(@Req() req, @Param('id') id: string) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.getLawyerById(id);
  }

  @Post('lawyers')
  async createLawyer(@Req() req, @Body() body: CreateLawyerDto) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.createLawyer(body, user.id || user._id);
  }

  @Patch('lawyers/:id')
  async updateLawyer(@Req() req, @Param('id') id: string, @Body() body: CreateLawyerDto) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.updateLawyer(id, body);
  }

  @Post('lawyers/:id/photo')
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: MAX_LAWYER_PHOTO_BYTES } }))
  async setLawyerPhoto(@Req() req, @Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.setLawyerPhoto(id, file);
  }

  @Get('lawyers/:id/photo')
  async getLawyerPhoto(@Req() req, @Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    const photo = await this.adminService.getLawyerPhoto(id);
    res.set({
      'Content-Type': photo.mimeType,
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(photo.buffer);
  }

  @Delete('lawyers/:id/photo')
  async removeLawyerPhoto(@Req() req, @Param('id') id: string) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.removeLawyerPhoto(id);
  }

  @Post('lawyers/:id/documents')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_COMPANY_FILE_BYTES } }))
  async addLawyerDocument(
    @Req() req,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: CreateLawyerDocumentDto,
  ) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.addLawyerDocument(id, file, body, user.id || user._id);
  }

  @Get('lawyers/:id/documents/:docId/download')
  async downloadLawyerDocument(
    @Req() req,
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    const file = await this.adminService.getLawyerDocumentFile(id, docId);
    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(file.buffer);
  }

  @Delete('lawyers/:id/documents/:docId')
  async deleteLawyerDocument(@Req() req, @Param('id') id: string, @Param('docId') docId: string) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.deleteLawyerDocument(id, docId);
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

  // ------------------- Case Managers -------------------
  @Get('case-managers')
  async listCaseManagers(@Req() req, @Query('page') page = '1', @Query('limit') limit = '50') {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user) && user?.role !== 'case_manager') throw new BadRequestException('Admin or Case Manager only');
    return this.adminService.listCaseManagers(Number(limit) || 50, Number(page) || 1);
  }

  @Post('case-managers')
  async createCaseManager(@Req() req, @Body() body: CreateCaseManagerDto) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.createCaseManager(body);
  }

  @Patch('case-managers/:id/jurisdiction')
  async updateCaseManagerJurisdiction(
    @Req() req,
    @Param('id') id: string,
    @Body('jurisdiction') jurisdiction: string,
    @Body('primaryJurisdiction') primaryJurisdiction?: string,
  ) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.updateCaseManagerJurisdiction(
      id,
      jurisdiction,
      primaryJurisdiction,
    );
  }
}
