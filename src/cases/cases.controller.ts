// src/cases/cases.controller.ts
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { JwtAuthGuard } from '../common/jwt-auth.guard';

import { CasesService } from './cases.service';

import { CreateCaseDto } from './dto/create-case.dto';

import { InvitePartnerDto } from '../cases/dto/Invite-partner.dto';

// IMPORTANT:
// Use the NEW unified LawyerService.
// Do NOT import the old lawyer-manager service.
import { LawyerService } from '../cases/lawyer-manager/lawyer.service';

@Controller('cases')
export class CasesController {
  constructor(
    private readonly casesService: CasesService,

    // This is now the unified LawyerService
    private readonly lawyersService: LawyerService,
  ) {}

  // ============================================================
  // AUTH HELPERS
  // ============================================================

  private ensureUser(req: any) {
    const user = req.user;

    if (!user) {
      throw new UnauthorizedException(
        'Authentication required',
      );
    }

    return user;
  }

  private isPrivilegedRole(role?: string) {
    return (
      role === 'superadmin' ||
      role === 'admin' ||
      role === 'case_manager'
    );
  }

  // ============================================================
  // CREATE CASE
  // POST /cases
  // ============================================================

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(
    @Req() req: any,
    @Body() body: CreateCaseDto,
  ) {
    const user = this.ensureUser(req);

    const title = body.title;

    return this.casesService.create(
      user.id,
      title,
    );
  }

  // ============================================================
  // LIST CASES
  // GET /cases
  // ============================================================

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@Req() req: any) {
    const user = this.ensureUser(req);

    const isPrivileged =
      this.isPrivilegedRole(user.role);

    if (isPrivileged) {
      return this.casesService.findAll();
    }

    return this.casesService.findByUser(
      user.id,
    );
  }

  // ============================================================
  // GET CASE
  // GET /cases/:id
  // ============================================================

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findById(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    this.ensureUser(req);

    const c =
      await this.casesService.findById(
        id,
        true,
      );

    if (!c) {
      throw new NotFoundException(
        'Case not found',
      );
    }

    return c;
  }

  // ============================================================
  // INVITE PARTNER
  // POST /cases/:id/invite
  // ============================================================

  @UseGuards(JwtAuthGuard)
  @Post(':id/invite')
  async invite(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: InvitePartnerDto,
  ) {
    console.log(
      'RAW BODY:',
      req.body,
    );

    console.log(
      'DTO:',
      dto,
    );

    const user =
      this.ensureUser(req);

    const c =
      await this.casesService.findById(
        id,
      );

    if (!c) {
      throw new NotFoundException(
        'Case not found',
      );
    }

    const isPrivileged =
      this.isPrivilegedRole(
        user.role,
      );

    const userIdStr =
      (
        user.id ??
        user._id
      )?.toString();

    if (
      !(
        isPrivileged ||
        c.owner?.toString() ===
          userIdStr
      )
    ) {
      throw new ForbiddenException(
        'Forbidden',
      );
    }

    return this.casesService.invite(id, user.id, dto);
  }

  // ============================================================
  // ATTACH INVITED USER
  // POST /cases/:id/attach-invited
  // ============================================================

  @UseGuards(JwtAuthGuard)
  @Post(':id/attach-invited')
  async attachInvitedUser(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    const user =
      this.ensureUser(req);

    return this.casesService.attachInvitedUser(
      id,
      user.id,
    );
  }

  // ============================================================
  // GET QUESTIONNAIRE SECTION
  // GET /cases/:id/section/:sectionName
  // ============================================================

  @UseGuards(JwtAuthGuard)
  @Get(':id/section/:sectionName')
  async getSection(
    @Req() req: any,
    @Param('id') id: string,
    @Param('sectionName')
    sectionName: string,
  ) {
    const user =
      this.ensureUser(req);

    return this.casesService.getQuestionnaireSection(
      id,
      sectionName,
      user,
    );
  }

  // ============================================================
  // UPDATE QUESTIONNAIRE
  // POST /cases/:id/questionnaire/:stepName
  // ============================================================

  @UseGuards(JwtAuthGuard)
  @Post(':id/questionnaire/:stepName')
  async updateQuestionnaireStep(
    @Req() req: any,
    @Param('id') id: string,
    @Param('stepName')
    stepName: string,
    @Body() body: any,
  ) {
    const user =
      this.ensureUser(req);

    const isPrivileged = this.isPrivilegedRole(user.role);

    return this.casesService.updateQuestionnaireStep(
      id,
      stepName,
      body,
      user.id ?? user._id,
      isPrivileged,
    );
  }

  // ============================================================
  // UNLOCK CASE
  // POST /cases/:id/unlock
  // ============================================================

  @UseGuards(JwtAuthGuard)
  @Post(':id/unlock')
  async unlockCase(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    const user =
      this.ensureUser(req);

    const isPrivileged =
      this.isPrivilegedRole(
        user.role,
      );

    if (!isPrivileged) {
      throw new ForbiddenException(
        'Only privileged users may unlock cases',
      );
    }

    return this.casesService.unlockCase(
      id,
      user.id,
    );
  }

  // ============================================================
  // PAYMENT COMPLETED
  // POST /cases/:id/payment-completed
  // ============================================================

  @UseGuards(JwtAuthGuard)
  @Post(':id/payment-completed')
  async paymentCompleted(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    const user =
      this.ensureUser(req);

    return this.casesService.markPaymentCompleted(
      id,
      user.id,
    );
  }

  // ============================================================
  // APPROVE CASE
  // POST /cases/:id/approve
  // ============================================================

  @UseGuards(JwtAuthGuard)
  @Post(':id/approve')
  async approveCase(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    const user =
      this.ensureUser(req);

    return this.casesService.approveCaseByUser(
      id,
      user.id,
    );
  }

  // ============================================================
  // REJECT CASE
  // POST /cases/:id/reject
  // ============================================================

  @UseGuards(JwtAuthGuard)
  @Post(':id/reject')
  async rejectCase(
    @Req() req: any,
    @Param('id') id: string,
    @Body('reason') reason: string,
  ) {
    const user =
      this.ensureUser(req);

    return this.casesService.rejectCaseByUser(
      id,
      user.id,
      reason,
    );
  }

  // ============================================================
  // CASE STATUS
  // GET /cases/:id/status
  // ============================================================

  @UseGuards(JwtAuthGuard)
  @Get(':id/status')
  async getStatus(
    @Param('id') id: string,
  ) {
    const c =
      await this.casesService.findById(
        id,
      );

    if (!c) {
      throw new NotFoundException('Case not found');
    }

    return {
      workflowStatus: c.workflowStatus,
    };
  }

  // ============================================================
  // GET LAWYERS FOR CASE
  // GET /cases/:id/lawyers
  // ============================================================

  @UseGuards(JwtAuthGuard)
  @Get(':id/lawyers')
  async getLawyersForCase(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    const user =
      this.ensureUser(req);

    const c =
      await this.casesService.findById(
        id,
      );

    if (!c) {
      throw new NotFoundException('Case not found');
    }

    const userIdStr =
      (
        user.id ??
        user._id
      )?.toString();

    const isPrivileged =
      this.isPrivilegedRole(
        user.role,
      );

    if (
      !isPrivileged &&
      c.owner?.toString() !==
        userIdStr &&
      c.invitedUser?.toString() !==
        userIdStr
    ) {
      throw new ForbiddenException('Forbidden');
    }

    // IMPORTANT:
    // This now calls the unified LawyerService.
    const lawyers =
      await this.lawyersService.listAll();

    return {
      total: lawyers.length,
      lawyers,
    };
  }

  // ============================================================
  // CREATE QUESTIONNAIRE BACKUP
  // POST /cases/:id/create-case-backup
  // ============================================================

  @UseGuards(JwtAuthGuard)
  @Post(':id/create-case-backup')
  async createQuestionnaireBackup(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    const user =
      this.ensureUser(req);

    const isPrivileged =
      this.isPrivilegedRole(
        user.role,
      );

    if (!isPrivileged) {
      throw new ForbiddenException(
        'Only case managers may edit questionnaires',
      );
    }

    return this.casesService.createQuestionnaireBackup(
      id,
      user.id,
    );
  }

  // ============================================================
  // REVERT QUESTIONNAIRE
  // POST /cases/:id/revert-case-backup
  // ============================================================

  @UseGuards(JwtAuthGuard)
  @Post(':id/revert-case-backup')
  async revertQuestionnaire(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    const user =
      this.ensureUser(req);

    const isPrivileged =
      this.isPrivilegedRole(
        user.role,
      );

    if (!isPrivileged) {
      throw new ForbiddenException(
        'Only case managers may revert questionnaires',
      );
    }

    return this.casesService.revertQuestionnaire(
      id,
      user.id,
    );
  }
}