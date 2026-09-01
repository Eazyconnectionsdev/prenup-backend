import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UnauthorizedException,
} from '@nestjs/common';

import { FileInterceptor } from '@nestjs/platform-express';

import { JwtAuthGuard } from '../../common/jwt-auth.guard';

import { LawyerService } from './lawyer.service';

import { CreateNoteDto } from '../case-manager/dto/create-note.dto';
import { CreateVersionDto } from '../case-manager/dto/create-version.dto';

@Controller('lawyer')
@UseGuards(JwtAuthGuard)
export class LawyerController {
  constructor(
    private readonly lawyerService: LawyerService,
  ) {}

  private ensureUser(req: any) {
    const user = req.user;

    if (!user) {
      throw new UnauthorizedException(
        'Authentication required',
      );
    }

    return user;
  }

  // =====================================================
  // DASHBOARD
  // =====================================================

  @Get('dashboard')
  async dashboard(
    @Req() req,
  ) {
    const user = this.ensureUser(req);

    return this.lawyerService.dashboard(
      user.id,
    );
  }

  @Get('dashboard/stages')
  async stageSummary(
    @Req() req,
  ) {
    const user = this.ensureUser(req);

    return this.lawyerService.stageSummary(
      user.id,
    );
  }

  // =====================================================
  // CASE
  // =====================================================

  @Get(':caseId')
  async caseOverview(
    @Param('caseId') caseId: string,
  ) {
    return this.lawyerService.caseOverview(
      caseId,
    );
  }

  @Get(':caseId/status')
  async status(
    @Param('caseId') caseId: string,
  ) {
    return this.lawyerService.status(
      caseId,
    );
  }

  // =====================================================
  // LAWYER REVIEW
  // =====================================================

  @Post(':caseId/review-complete')
  async reviewComplete(
    @Req() req,
    @Param('caseId') caseId: string,
  ) {
    const user = this.ensureUser(req);

    return this.lawyerService.reviewComplete(
      caseId,
      user.id,
    );
  }

  // =====================================================
  // ILA
  // =====================================================

  @Post(':caseId/request-ila')
  async requestILA(
    @Req() req,
    @Param('caseId') caseId: string,
  ) {
    const user = this.ensureUser(req);

    return this.lawyerService.requestILA(
      caseId,
      user.id,
    );
  }

  @Post(':caseId/p1-ila')
  @UseInterceptors(
    FileInterceptor('file'),
  )
  async completeP1ILA(
    @Req() req,
    @Param('caseId') caseId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const user = this.ensureUser(req);

    return this.lawyerService.completeP1ILA(
      caseId,
      file,
      user.id,
    );
  }

  @Post(':caseId/p2-ila')
  @UseInterceptors(
    FileInterceptor('file'),
  )
  async completeP2ILA(
    @Req() req,
    @Param('caseId') caseId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const user = this.ensureUser(req);

    return this.lawyerService.completeP2ILA(
      caseId,
      file,
      user.id,
    );
  }

  @Get(':caseId/ila-status')
  async ilaStatus(
    @Param('caseId') caseId: string,
  ) {
    return this.lawyerService.ilaStatus(
      caseId,
    );
  }

  // =====================================================
  // LAWYER SIGNOFF
  // =====================================================

  @Post(':caseId/p1-signoff')
  async p1Signoff(
    @Req() req,
    @Param('caseId') caseId: string,
  ) {
    const user = this.ensureUser(req);

    return this.lawyerService.p1Signoff(
      caseId,
      user.id,
    );
  }

  @Post(':caseId/p2-signoff')
  async p2Signoff(
    @Req() req,
    @Param('caseId') caseId: string,
  ) {
    const user = this.ensureUser(req);

    return this.lawyerService.p2Signoff(
      caseId,
      user.id,
    );
  }

  // =====================================================
  // FINAL CLIENT CONFIRMATION
  // =====================================================

  @Post(':caseId/p1-confirmation')
  @UseInterceptors(
    FileInterceptor('file'),
  )
  async finalP1Confirmation(
    @Req() req,
    @Param('caseId') caseId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const user = this.ensureUser(req);

    return this.lawyerService.finalP1Confirmation(
      caseId,
      file,
      user.id,
    );
  }

  @Post(':caseId/p2-confirmation')
  @UseInterceptors(
    FileInterceptor('file'),
  )
  async finalP2Confirmation(
    @Req() req,
    @Param('caseId') caseId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const user = this.ensureUser(req);

    return this.lawyerService.finalP2Confirmation(
      caseId,
      file,
      user.id,
    );
  }

  @Get(':caseId/confirmations')
  async confirmations(
    @Param('caseId') caseId: string,
  ) {
    return this.lawyerService.confirmations(
      caseId,
    );
  }

  // =====================================================
  // COMPLETE CASE
  // =====================================================

  @Post(':caseId/complete')
  async completeCase(
    @Req() req,
    @Param('caseId') caseId: string,
  ) {
    const user = this.ensureUser(req);

    return this.lawyerService.completeCase(
      caseId,
      user.id,
    );
  }

  // =====================================================
  // DOCUMENTS
  // =====================================================

  @Post(':caseId/documents')
  @UseInterceptors(
    FileInterceptor('file'),
  )
  async uploadDocument(
    @Req() req,
    @Param('caseId') caseId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const user = this.ensureUser(req);

    return this.lawyerService.uploadDocument(
      caseId,
      file,
      user.id,
    );
  }

  @Get(':caseId/documents')
  async documents(
    @Param('caseId') caseId: string,
  ) {
    return this.lawyerService.documents(
      caseId,
    );
  }

  @Delete(':caseId/documents/:documentId')
  async deleteDocument(
    @Req() req,
    @Param('caseId') caseId: string,
    @Param('documentId') documentId: string,
  ) {
    const user = this.ensureUser(req);

    return this.lawyerService.deleteDocument(
      caseId,
      documentId,
      user.id,
    );
  }

  // =====================================================
  // NOTES
  // =====================================================

  @Post(':caseId/notes')
  async addNote(
    @Req() req,
    @Param('caseId') caseId: string,
    @Body() dto: CreateNoteDto,
  ) {
    const user = this.ensureUser(req);

    return this.lawyerService.addNote(
      caseId,
      dto,
      user.id,
    );
  }

  @Get(':caseId/notes')
  async notes(
    @Param('caseId') caseId: string,
  ) {
    return this.lawyerService.notes(
      caseId,
    );
  }

  @Delete(':caseId/notes/:noteId')
  async deleteNote(
    @Req() req,
    @Param('caseId') caseId: string,
    @Param('noteId') noteId: string,
  ) {
    const user = this.ensureUser(req);

    return this.lawyerService.deleteNote(
      caseId,
      noteId,
      user.id,
    );
  }

  // =====================================================
  // CASE VERSIONING
  // =====================================================

  @Post(':caseId/versions')
  async createVersion(
    @Req() req,
    @Param('caseId') caseId: string,
    @Body() dto: CreateVersionDto,
  ) {
    const user = this.ensureUser(req);

    return this.lawyerService.createVersion(
      caseId,
      dto,
      user.id,
    );
  }

  @Get(':caseId/versions')
  async versions(
    @Param('caseId') caseId: string,
  ) {
    return this.lawyerService.versions(
      caseId,
    );
  }

  @Get(':caseId/versions/:versionId')
  async version(
    @Param('versionId') versionId: string,
  ) {
    return this.lawyerService.version(
      versionId,
    );
  }

  @Get(':caseId/versions/compare')
  async compareVersions(
    @Param('caseId') caseId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.lawyerService.compareVersions(
      caseId,
      from,
      to,
    );
  }

  @Get(':caseId/changesets')
  async changeSets(
    @Param('caseId') caseId: string,
  ) {
    return this.lawyerService.changeSets(
      caseId,
    );
  }

  // =====================================================
  // AGREEMENT VERSIONS
  // =====================================================

  @Get(':caseId/agreements')
  async agreements(
    @Param('caseId') caseId: string,
  ) {
    return this.lawyerService.agreements(
      caseId,
    );
  }

  @Post(':caseId/agreements')
  @UseInterceptors(
    FileInterceptor('file'),
  )
  async uploadAgreement(
    @Req() req,
    @Param('caseId') caseId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const user = this.ensureUser(req);

    return this.lawyerService.uploadAgreement(
      caseId,
      file,
      user.id,
    );
  }

  @Get(':caseId/agreements/compare')
  async compareAgreements(
    @Param('caseId') caseId: string,
    @Query('left') left: string,
    @Query('right') right: string,
  ) {
    return this.lawyerService.compareAgreements(
      caseId,
      left,
      right,
    );
  }

  // =====================================================
  // TIMELINE
  // =====================================================

  @Get(':caseId/timeline')
  async timeline(
    @Param('caseId') caseId: string,
  ) {
    return this.lawyerService.timeline(
      caseId,
    );
  }

  @Get(':caseId/audit-log')
  async auditLog(
    @Param('caseId') caseId: string,
  ) {
    return this.lawyerService.auditLog(
      caseId,
    );
  }

  // =====================================================
  // COMPLETED
  // =====================================================

  @Get('completed/list')
  async completedCases(
    @Req() req,
  ) {
    const user = this.ensureUser(req);

    return this.lawyerService.completedCases(
      user.id,
    );
  }
}