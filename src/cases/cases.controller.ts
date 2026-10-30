// src/cases/cases.controller.ts
import {
  Body,
  Put,
  Patch,
  Controller,
  Delete,
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
import { PartnerLinkConflictOutcome } from './schemas/partner_invite.schema';

import { CreateCaseDto } from './dto/create-case.dto';
import { RemovePartnerDto } from './dto/remove-partner.dto';
import { ResolvePartnerConflictDto } from './dto/resolve-partner-conflict.dto';

import { InvitePartnerDto } from '../cases/dto/Invite-partner.dto';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';
import { MatrimonialAgreementDto } from './dto/matrimonial-agreement.dto';

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
  // START A LEGAL MATTER
  // POST /cases
  //
  // This is the only place a Case ID is issued for a client.
  // Idempotent: a client who already has a current case gets it back.
  // ============================================================

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(
    @Req() req: any,
    @Body() body: CreateCaseDto,
  ) {
    const user = this.ensureUser(req);

    const title = body.title;

    return this.casesService.startCase(
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

    const doc: any = (c as any).toObject ? (c as any).toObject() : c;
    try {
      doc.stages = await this.casesService.getCaseStages(id);
    } catch {
      // stages optional fallback
    }

    return doc;
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/stages')
  async getStages(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    this.ensureUser(req);
    return this.casesService.getCaseStages(id);
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
  // ONBOARDING (user 1 / case owner only)
  // GET  /cases/:id/onboarding
  // POST /cases/:id/onboarding
  // ============================================================

  @UseGuards(JwtAuthGuard)
  @Get(':id/onboarding')
  async getOnboarding(@Req() req: any, @Param('id') id: string) {
    const user = this.ensureUser(req);
    return this.casesService.getOnboarding(id, (user.id ?? user._id).toString());
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/onboarding')
  async completeOnboarding(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: CompleteOnboardingDto,
  ) {
    const user = this.ensureUser(req);
    return this.casesService.completeOnboarding(
      id,
      (user.id ?? user._id).toString(),
      dto,
    );
  }

  // ============================================================
  // GET INVITE STATUS (what was typed + who actually registered)
  // GET /cases/:id/invite
  // ============================================================

  @UseGuards(JwtAuthGuard)
  @Get(':id/invite')
  async getInvite(@Req() req: any, @Param('id') id: string) {
    const user = this.ensureUser(req);

    const c = await this.casesService.findById(id);
    if (!c) {
      throw new NotFoundException('Case not found');
    }

    const userIdStr = (user.id ?? user._id)?.toString();
    if (
      !(this.isPrivilegedRole(user.role) || c.owner?.toString() === userIdStr)
    ) {
      throw new ForbiddenException('Forbidden');
    }

    return this.casesService.getInvite(
      id,
      this.isPrivilegedRole(user.role),
    );
  }

  // ============================================================
  // REMOVE PARTNER
  // DELETE /cases/:id/partner
  //
  // Case Manager / Admin (or the owner, early on) unlinks the partner so a
  // partner can be invited again. The partner's account is kept.
  // ============================================================

  @UseGuards(JwtAuthGuard)
  @Delete(':id/partner')
  async removePartner(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: RemovePartnerDto,
  ) {
    const user = this.ensureUser(req);

    return this.casesService.removePartner(
      id,
      { id: (user.id ?? user._id).toString(), role: user.role },
      dto?.reason,
    );
  }

  // ============================================================
  // RESOLVE A HELD PARTNER LINK (Case Manager / Admin)
  // POST /cases/:id/invite/resolve
  // ============================================================

  @UseGuards(JwtAuthGuard)
  @Post(':id/invite/resolve')
  async resolvePartnerConflict(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ResolvePartnerConflictDto,
  ) {
    const user = this.ensureUser(req);

    if (!this.isPrivilegedRole(user.role)) {
      throw new ForbiddenException('Forbidden');
    }

    return this.casesService.resolvePartnerConflict(
      id,
      (user.id ?? user._id).toString(),
      dto.action === 'APPROVE'
        ? PartnerLinkConflictOutcome.APPROVED
        : PartnerLinkConflictOutcome.REJECTED,
      dto.note,
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
  // MATRIMONIAL AGREEMENT & INTENTIONS
  // POST /cases/:id/questionnaire/matrimonial-agreement
  //
  // Declared before the generic step route below so this step gets validated
  // against its DTO instead of being stored as a free-form body.
  // ============================================================

  @UseGuards(JwtAuthGuard)
  @Post(':id/questionnaire/matrimonial-agreement')
  async updateMatrimonialAgreement(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: MatrimonialAgreementDto,
  ) {
    const user = this.ensureUser(req);

    return this.casesService.updateQuestionnaireStep(
      id,
      'matrimonial-agreement',
      body,
      user.id ?? user._id,
      this.isPrivilegedRole(user.role),
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
  // SEND JOINT INFORMATION FOR THE PARTNER'S APPROVAL
  // POST /cases/:id/joint-information/submit
  // ============================================================

  @UseGuards(JwtAuthGuard)
  @Post(':id/joint-information/submit')
  async submitJointInformationForReview(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    const user =
      this.ensureUser(req);

    return this.casesService.submitJointInformationForReview(
      id,
      user.id ?? user._id,
    );
  }

  // ============================================================
  // ASSIGN CASE MANAGER
  // POST /cases/:id/assign-case-manager
  // ============================================================

  // ============================================================
  // UPDATE CASE / PRIORITY
  // PUT /cases/:id
  // ============================================================

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async updateCase(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const user = this.ensureUser(req);
    return this.casesService.updateCase(id, body, user.id ?? user._id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async patchCase(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const user = this.ensureUser(req);
    return this.casesService.updateCase(id, body, user.id ?? user._id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/assign-case-manager')
  async assignCaseManager(
    @Req() req: any,
    @Param('id') id: string,
    @Body('managerId') managerId: string,
  ) {
    const user = this.ensureUser(req);
    const isPrivileged = this.isPrivilegedRole(user.role);

    if (!isPrivileged) {
      throw new ForbiddenException(
        'Only admins or case managers may assign cases',
      );
    }

    return this.casesService.assignCaseManager(
      id,
      managerId,
      user.id ?? user._id,
      user.role,
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