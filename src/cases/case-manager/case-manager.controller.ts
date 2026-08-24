// src/case-manager/case-manager.controller.ts

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UnauthorizedException,
  Query,
} from '@nestjs/common';

import { FileInterceptor } from '@nestjs/platform-express';

import { JwtAuthGuard } from '../../common/jwt-auth.guard';

import { CaseManagerService } from './case-manager.service';

import { AssignLawyersDto } from './dto/assign-lawyers.dto';
import { ReturnDraftDto } from './dto/return-draft.dto';
import { ApproveCaseDto } from './dto/approve-case.dto';
import { CreateNoteDto } from './dto/create-note.dto';
import { CreateVersionDto } from './dto/create-version.dto';

@Controller('case-manager')
@UseGuards(JwtAuthGuard)
export class CaseManagerController {
  constructor(
    private readonly caseManagerService: CaseManagerService,
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
  async getDashboard(
    @Req() req,
  ) {
    const user = this.ensureUser(req);

    return this.caseManagerService.getDashboard(
      user.id,
    );
  }

  @Get('dashboard/stages')
  async getStageSummary(
    @Req() req,
  ) {
    const user = this.ensureUser(req);

    return this.caseManagerService.getStageSummary(
      user.id,
    );
  }

  // =====================================================
  // CASE OVERVIEW
  // =====================================================

  @Get(':caseId')
  async getCaseOverview(
    @Param('caseId') caseId: string,
  ) {
    return this.caseManagerService.getCaseOverview(
      caseId,
    );
  }

  @Get(':caseId/status')
  async getCaseStatus(
    @Param('caseId') caseId: string,
  ) {
    return this.caseManagerService.getCaseStatus(
      caseId,
    );
  }

  // =====================================================
  // CM REVIEW
  // =====================================================

  @Post(':caseId/return-draft')
  async returnToDraft(
    @Req() req,
    @Param('caseId') caseId: string,
    @Body() dto: ReturnDraftDto,
  ) {
    const user = this.ensureUser(req);

    return this.caseManagerService.returnToDraft(
      caseId,
      dto,
      user.id,
    );
  }

  @Post(':caseId/approve')
  async approveCase(
    @Req() req,
    @Param('caseId') caseId: string,
    @Body() dto: ApproveCaseDto,
  ) {
    const user = this.ensureUser(req);

    return this.caseManagerService.approveCase(
      caseId,
      dto,
      user.id,
    );
  }

  // =====================================================
  // COUPLE APPROVALS
  // =====================================================

  @Post(':caseId/request-couple-approval')
  async requestCoupleApproval(
    @Req() req,
    @Param('caseId') caseId: string,
  ) {
    const user = this.ensureUser(req);

    return this.caseManagerService.requestCoupleApproval(
      caseId,
      user.id,
    );
  }

  @Post(':caseId/p1-confirmation')
  @UseInterceptors(
    FileInterceptor('file'),
  )
  async uploadP1Confirmation(
    @Req() req,
    @Param('caseId') caseId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const user = this.ensureUser(req);

    return this.caseManagerService.uploadP1Confirmation(
      caseId,
      file,
      user.id,
    );
  }

  @Post(':caseId/p2-confirmation')
  @UseInterceptors(
    FileInterceptor('file'),
  )
  async uploadP2Confirmation(
    @Req() req,
    @Param('caseId') caseId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const user = this.ensureUser(req);

    return this.caseManagerService.uploadP2Confirmation(
      caseId,
      file,
      user.id,
    );
  }

  @Get(':caseId/confirmations')
  async getConfirmations(
    @Param('caseId') caseId: string,
  ) {
    return this.caseManagerService.getConfirmations(
      caseId,
    );
  }

  // =====================================================
  // LAWYER ASSIGNMENT
  // =====================================================

  @Get(':caseId/available-lawyers')
  async availableLawyers(
    @Param('caseId') caseId: string,
  ) {
    return this.caseManagerService.availableLawyers(
      caseId,
    );
  }

  @Post(':caseId/assign-lawyers')
  async assignLawyers(
    @Req() req,
    @Param('caseId') caseId: string,
    @Body() dto: AssignLawyersDto,
  ) {
    const user = this.ensureUser(req);

    return this.caseManagerService.assignLawyers(
      caseId,
      dto,
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

    return this.caseManagerService.uploadDocument(
      caseId,
      file,
      user.id,
    );
  }

  @Get(':caseId/documents')
  async getDocuments(
    @Param('caseId') caseId: string,
  ) {
    return this.caseManagerService.getDocuments(
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

    return this.caseManagerService.deleteDocument(
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

    return this.caseManagerService.addNote(
      caseId,
      dto,
      user.id,
    );
  }

  @Get(':caseId/notes')
  async getNotes(
    @Param('caseId') caseId: string,
  ) {
    return this.caseManagerService.getNotes(
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

    return this.caseManagerService.deleteNote(
      caseId,
      noteId,
      user.id,
    );
  }

  // =====================================================
  // VERSIONING
  // =====================================================

  @Post(':caseId/versions')
  async createVersion(
    @Req() req,
    @Param('caseId') caseId: string,
    @Body() dto: CreateVersionDto,
  ) {
    const user = this.ensureUser(req);

    return this.caseManagerService.createVersion(
      caseId,
      dto,
      user.id,
    );
  }

  @Get(':caseId/versions')
  async getVersions(
    @Param('caseId') caseId: string,
  ) {
    return this.caseManagerService.getVersions(
      caseId,
    );
  }

  @Get(':caseId/versions/:versionId')
  async getVersion(
    @Param('caseId') caseId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.caseManagerService.getVersion(
      caseId,
      versionId,
    );
  }

  @Get(':caseId/versions/compare')
async compareVersions(
  @Param('caseId') caseId: string,
  @Query('from') from: string,
  @Query('to') to: string,
) {
  return this.caseManagerService.compareVersions(
    caseId,
    from,
    to,
  );
}

@Get(':caseId/changesets')
async getChangeSets(
  @Param('caseId') caseId: string,
) {
  return this.caseManagerService.getChangeSets(
    caseId,
  );
}

@Get(':caseId/agreements')
async agreementVersions(
  @Param('caseId') caseId: string,
) {
  return this.caseManagerService.agreementVersions(
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
  @UploadedFile() file: any,
) {
  const user = this.ensureUser(req);

  return this.caseManagerService.uploadAgreement(
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
  return this.caseManagerService.compareAgreements(
    caseId,
    left,
    right,
  );
}

@Get(':caseId/timeline')
async timeline(
  @Param('caseId') caseId: string,
) {
  return this.caseManagerService.timeline(
    caseId,
  );
}

@Get(':caseId/audit-log')
async auditLog(
  @Param('caseId') caseId: string,
) {
  return this.caseManagerService.auditLog(
    caseId,
  );
}

@Post(':caseId/archive')
async archiveCase(
  @Req() req,
  @Param('caseId') caseId: string,
) {
  const user = this.ensureUser(req);

  return this.caseManagerService.archiveCase(
    caseId,
    user.id,
  );
}

@Get('completed/list')
async completedCases(
  @Req() req,
) {
  const user = this.ensureUser(req);

  return this.caseManagerService.completedCases(
    user.id,
  );
}

@Get('ready-for-archive/list')
async readyForArchive(
  @Req() req,
) {
  const user = this.ensureUser(req);

  return this.caseManagerService.readyForArchive(
    user.id,
  );
}



}