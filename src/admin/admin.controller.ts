import {
  Controller,
  UseGuards,
  Req,
  Get,
  Param,
  Body,
  Post,
  Delete,
  Query,
  Patch,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AdminService } from './admin.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { CreateLawyerDto } from './dto/create-lawyer.dto';
import { CreateEnquiryDto } from './dto/create-enquiry.dto';
import { UpdateAdminSettingsDto } from './dto/update-admin-settings.dto';
import { AddCompanyNoteDto, AddLawyerNoteDto } from './dto/add-note.dto';

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

  // =============================================
  // USERS
  // =============================================

  @Get('users')
  async listUsers(
    @Req() req,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.listUsers(Number(limit) || 50, Number(page) || 1);
  }

  @Get('users/:id')
  async getUser(@Req() req, @Param('id') id: string) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.getUserById(id);
  }

  @Patch('users/:id/role')
  async updateUserRole(
    @Req() req,
    @Param('id') id: string,
    @Body('role') role: string,
  ) {
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

  // =============================================
  // ENQUIRIES
  // =============================================

  @Get('enquiries')
  async listEnquiries(
    @Req() req,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
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

  // =============================================
  // COMPANIES  (Section 2 – with attachments & notes)
  // =============================================

  @Get('companies')
  async listCompanies(
    @Req() req,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.listCompanies(Number(limit) || 50, Number(page) || 1);
  }

  /** Get company detail + its attachments + notes (view) */
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
    return this.adminService.createCompany(body);
  }

  @Patch('companies/:id/verify')
  async verifyCompany(@Req() req, @Param('id') id: string) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.setCompanyVerified(id, true, user.id || user._id);
  }

  // -- Company Attachments --

  @Post('companies/:id/attachments')
  @UseInterceptors(FileInterceptor('file'))
  async addCompanyAttachment(
    @Req() req,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('fileUrl') fileUrl: string,
  ) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    if (!file) throw new BadRequestException('File is required');
    // fileUrl should be the S3/CDN URL returned after upload; if not provided fall back to originalname placeholder
    const resolvedUrl = fileUrl || file.originalname;
    return this.adminService.addCompanyAttachment(id, file, resolvedUrl, user.id || user._id);
  }

  @Get('companies/:id/attachments')
  async getCompanyAttachments(@Req() req, @Param('id') id: string) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.getCompanyAttachments(id);
  }

  @Delete('companies/:id/attachments/:attachmentId')
  async deleteCompanyAttachment(
    @Req() req,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.deleteCompanyAttachment(id, attachmentId);
  }

  // -- Company Notes --

  @Post('companies/:id/notes')
  async addCompanyNote(
    @Req() req,
    @Param('id') id: string,
    @Body() body: AddCompanyNoteDto,
  ) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.addCompanyNote(id, body.content, user.id || user._id);
  }

  @Get('companies/:id/notes')
  async getCompanyNotes(@Req() req, @Param('id') id: string) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.getCompanyNotes(id);
  }

  @Delete('companies/:id/notes/:noteId')
  async deleteCompanyNote(
    @Req() req,
    @Param('id') id: string,
    @Param('noteId') noteId: string,
  ) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.deleteCompanyNote(id, noteId);
  }

  // =============================================
  // LAWYERS  (Section 2 – with attachments & notes)
  // =============================================

  @Get('lawyers')
  async listLawyers(
    @Req() req,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.listLawyers(Number(limit) || 50, Number(page) || 1);
  }

  /** Get lawyer detail + attachments + notes (view) */
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

  // -- Lawyer Attachments --

  @Post('lawyers/:id/attachments')
  @UseInterceptors(FileInterceptor('file'))
  async addLawyerAttachment(
    @Req() req,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('fileUrl') fileUrl: string,
  ) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    if (!file) throw new BadRequestException('File is required');
    const resolvedUrl = fileUrl || file.originalname;
    return this.adminService.addLawyerAttachment(id, file, resolvedUrl, user.id || user._id);
  }

  @Get('lawyers/:id/attachments')
  async getLawyerAttachments(@Req() req, @Param('id') id: string) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.getLawyerAttachments(id);
  }

  @Delete('lawyers/:id/attachments/:attachmentId')
  async deleteLawyerAttachment(
    @Req() req,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.deleteLawyerAttachment(id, attachmentId);
  }

  // -- Lawyer Notes --

  @Post('lawyers/:id/notes')
  async addLawyerNote(
    @Req() req,
    @Param('id') id: string,
    @Body() body: AddLawyerNoteDto,
  ) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.addLawyerNote(id, body.content, user.id || user._id);
  }

  @Get('lawyers/:id/notes')
  async getLawyerNotes(@Req() req, @Param('id') id: string) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.getLawyerNotes(id);
  }

  @Delete('lawyers/:id/notes/:noteId')
  async deleteLawyerNote(
    @Req() req,
    @Param('id') id: string,
    @Param('noteId') noteId: string,
  ) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.deleteLawyerNote(id, noteId);
  }

  // =============================================
  // ADMIN SETTINGS  (Section 1 – TopBar)
  // =============================================

  /** GET /admin/settings  – retrieve current TopBar settings */
  @Get('settings')
  async getSettings(@Req() req) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.getAdminSettings();
  }

  /** PATCH /admin/settings  – update any subset of TopBar settings */
  @Patch('settings')
  async updateSettings(@Req() req, @Body() body: UpdateAdminSettingsDto) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.updateAdminSettings(body);
  }

  // =============================================
  // DASHBOARD  (same as Case-Manager)
  // =============================================

  /** GET /admin/dashboard  – high-level KPI counts */
  @Get('dashboard')
  async getDashboard(@Req() req) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.getDashboard();
  }

  /** GET /admin/dashboard/stages  – cases grouped by workflow status */
  @Get('dashboard/stages')
  async getStageSummary(@Req() req) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.getStageSummary();
  }

  /** GET /admin/dashboard/stages/:status/cases */
  @Get('dashboard/stages/:status/cases')
  async getCasesByStatus(@Req() req, @Param('status') status: string) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.getCasesByStatus(status);
  }

  // =============================================
  // CASES  (same as Case-Manager – admin sees all)
  // =============================================

  /** GET /admin/cases  – paginated list of all cases */
  @Get('cases')
  async getAllCases(
    @Req() req,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.getAllCases(Number(limit) || 50, Number(page) || 1);
  }

  ps;;ss;;s;pee/** GET /admin/cases/:caseId  – single case detail */
  @Get('cases/:caseId')
  async getCaseById(@Req() req, @Param('caseId') caseId: string) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.getCaseById(caseId);
  }

  // =============================================
  // REPORTS
  // =============================================

  /**
   * GET /admin/reports
   * Query params: from (ISO date), to (ISO date)
   * Returns: casesByStatus, newCasesOverTime, lawyerAssignments
   */
  @Get('reports')
  async getReports(
    @Req() req,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const user = this.ensureUser(req);
    if (!this.isAdmin(user)) throw new BadRequestException('Admin only');
    return this.adminService.getReports(from, to);
  }
}
