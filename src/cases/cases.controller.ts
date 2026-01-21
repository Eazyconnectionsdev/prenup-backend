// src/cases/cases.controller.ts
import { Body, Controller, ForbiddenException, Get, Param, Post, Req, UseGuards, BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CasesService } from './cases.service';
import { CreateCaseDto } from './dto/create-case.dto';
import { LawyersService } from './lawyer.service';

@Controller('cases')
export class CasesController {
  constructor(private casesService: CasesService, private lawyersService: LawyersService) {}
  private ensureUser(req: any) {
    const user = req.user;
    if (!user) throw new UnauthorizedException('Authentication required');
    return user;
  }
  private isPrivilegedRole(role?: string) {
    return role === 'superadmin' || role === 'admin' || role === 'case_manager';
  }
  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Req() req, @Body() body: CreateCaseDto) {
    const user = this.ensureUser(req);
    const title = body.title;
    return this.casesService.create(user.id, title);
  }
  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@Req() req) {
    const user = this.ensureUser(req);
    const isPrivileged = this.isPrivilegedRole(user.role);
    if (isPrivileged) {
      return this.casesService.findAll();
    }
    return this.casesService.findByUser(user.id);
  }
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findById(@Req() req, @Param('id') id: string) {
    const user = this.ensureUser(req);
    const c = await this.casesService.findById(id, true);
    if (!c) throw new NotFoundException('Case not found');
   
    return c;
  }
  @UseGuards(JwtAuthGuard)
  @Post(':id/invite')
  async invite(@Req() req, @Param('id') id: string, @Body('email') email: string) {
    const user = this.ensureUser(req);
    const c = await this.casesService.findById(id);
    if (!c) throw new NotFoundException('Case not found');
    const isPrivileged = this.isPrivilegedRole(user.role);
    const userIdStr = (user.id ?? user._id)?.toString();
    if (!(isPrivileged || c.owner?.toString() === userIdStr)) {
      throw new ForbiddenException('Forbidden');
    }
    return this.casesService.invite(id, user.id, email);
  }
  @UseGuards(JwtAuthGuard)
  @Post(':id/attach-invited')
  async attachInvitedUser(@Req() req, @Param('id') id: string) {
    const user = this.ensureUser(req);
    return this.casesService.attachInvitedUser(id, user.id);
  }
  @UseGuards(JwtAuthGuard)
  @Get(':id/steps/:stepNumber')
  async getStep(@Req() req, @Param('id') id: string, @Param('stepNumber') stepNumberStr: string) {
    const user = this.ensureUser(req);
    return this.casesService.getStepForUi(id, Number(stepNumberStr), user);
  }
  @UseGuards(JwtAuthGuard)
  @Post(':id/steps/:stepNumber')
  async updateStep(@Req() req, @Param('id') id: string, @Param('stepNumber') stepNumberStr: string, @Body() body: any) {
    const user = this.ensureUser(req);
    const isPrivileged = this.isPrivilegedRole(user.role);
    const updated = await this.casesService.updateStep(id, Number(stepNumberStr), body, user.id ?? user._id, isPrivileged, user);
    return updated;
  }
  @UseGuards(JwtAuthGuard)
  @Post(':id/unlock')
  async unlockCase(@Req() req, @Param('id') id: string) {
    const user = this.ensureUser(req);
    const isPrivileged = this.isPrivilegedRole(user.role);
    if (!isPrivileged) throw new ForbiddenException('Only privileged users may unlock cases');
    return this.casesService.unlockCase(id, user.id);
  }
  @UseGuards(JwtAuthGuard)
  @Get(':id/lawyers')
  async getLawyersForCase(@Req() req, @Param('id') id: string) {
    const user = this.ensureUser(req);
    const isPrivileged = this.isPrivilegedRole(user.role);
    const c = await this.casesService.findById(id);
    if (!c) throw new NotFoundException('Case not found');
    if (!isPrivileged) {
      const userIdStr = (user.id ?? user._id)?.toString();
      if (c.owner?.toString() !== userIdStr && c.invitedUser?.toString() !== userIdStr) {
        throw new ForbiddenException('Forbidden');
      }
    }
    if (!isPrivileged) {
      const allStepsSubmitted = this.casesService.areAllStepsSubmitted(c);
      if (!(c.fullyLocked && allStepsSubmitted)) {
        throw new ForbiddenException('Lawyer listing/selection is allowed only after all steps are submitted and the case is fully locked.');
      }
    }
    const lawyers = await this.lawyersService.listAll();
    const p1SelectedId = c.preQuestionnaireUser1?.selectedLawyer?.toString() ?? null;
    const p2SelectedId = c.preQuestionnaireUser2?.selectedLawyer?.toString() ?? null;
    const userIdStr = (user.id ?? user._id)?.toString();
    const isOwner = c.owner?.toString() === userIdStr;
    const isInvited = c.invitedUser?.toString() === userIdStr;
    const mapped = lawyers.map((l: any) => {
      const lid = l._id.toString();
      const selectedByUser1 = p1SelectedId === lid;
      const selectedByUser2 = p2SelectedId === lid;
      let selectedBy: 'you' | 'partner' | 'both' | null = null;
      if (selectedByUser1 && selectedByUser2) {
        selectedBy = 'both';
      } else if (selectedByUser1) {
        selectedBy = isOwner ? 'you' : 'partner';
      } else if (selectedByUser2) {
        selectedBy = isInvited ? 'you' : 'partner';
      }
      return { id: lid, externalId: l.externalId, name: l.name, priceText: l.priceText, avatarUrl: l.avatarUrl, selectedBy };
    });
    return { total: mapped.length, lawyers: mapped, yourSelected: isOwner ? p1SelectedId : p2SelectedId, partnerSelected: isOwner ? p2SelectedId : p1SelectedId };
  }
  @UseGuards(JwtAuthGuard)
  @Post('seed')
  async seedLawyers(@Req() req) {
    return this.lawyersService.seedInitialLawyersIfEmpty();
  }
  @UseGuards(JwtAuthGuard)
  @Post(':id/pre-questionnaire')
  async submitPreQuestionnaireEndpoint(@Req() req, @Param('id') id: string, @Body() body: { answers?: string[] }) {
    const user = this.ensureUser(req);
    if (!body || !Array.isArray(body.answers)) {
      throw new BadRequestException('Request body must include "answers" array');
    }
    const updatedCase = await this.casesService.submitPreQuestionnaire(id, user.id ?? user._id, body.answers);
    return { message: 'Pre-questionnaire submitted', case: updatedCase };
  }
  @UseGuards(JwtAuthGuard)
  @Post(':id/select-lawyer')
  async selectLawyerEndpoint(@Req() req, @Param('id') id: string, @Body() body: { lawyerId?: string; force?: boolean; message?: string }) {
    const user = this.ensureUser(req);
    if (!body || !body.lawyerId) throw new BadRequestException('Request body must include "lawyerId" (Mongo _id of the lawyer)');
    const updatedCase = await this.casesService.selectLawyer(id, user.id ?? user._id, body.lawyerId, !!body.force, typeof body.message === 'string' ? body.message : undefined);
    return { message: 'Lawyer selected', case: updatedCase };
  }
  @UseGuards(JwtAuthGuard)
  @Post(':id/approve')
  async approveByUser(@Req() req, @Param('id') id: string) {
    const user = this.ensureUser(req);
    return this.casesService.approveCaseByUser(id, user.id ?? user._id);
  }
  @UseGuards(JwtAuthGuard)
  @Post(':id/approve-lawyer')
  async approveByLawyer(@Req() req, @Param('id') id: string, @Body() body: { lawyerId?: string }) {
    if (!body?.lawyerId) throw new BadRequestException('lawyerId required');
    return this.casesService.approveCaseByLawyer(id, body.lawyerId);
  }
  @UseGuards(JwtAuthGuard)
  @Post(':id/approve-manager')
  async approveByCaseManager(@Req() req, @Param('id') id: string) {
    const user = this.ensureUser(req);
    if (!this.isPrivilegedRole(user.role)) throw new ForbiddenException('Only case managers/admins');
    return this.casesService.approveCaseByManager(id, user.id ?? user._id);
  }
  @UseGuards(JwtAuthGuard)
  @Post(':id/assign-manager')
  async assignCaseManager(@Req() req, @Param('id') id: string, @Body() body: { managerId?: string }) {
    const user = this.ensureUser(req);
    if (!this.isPrivilegedRole(user.role)) throw new ForbiddenException('Only case managers/admins');
    const managerId = body?.managerId || user.id || user._id;
    return this.casesService.assignCaseManager(id, managerId, user.id ?? user._id);
  }
  @UseGuards(JwtAuthGuard)
  @Post(':id/change-status')
  async changeStatus(@Req() req, @Param('id') id: string, @Body() body: { status?: string }) {
    const user = this.ensureUser(req);
    if (!this.isPrivilegedRole(user.role)) throw new ForbiddenException('Only case managers/admins can change workflow status');
    if (!body || !body.status) throw new BadRequestException('Request body must include "status"');
    const allowed = ['CM', 'PAID', 'LAWYER'];
    if (!allowed.includes(body.status)) throw new BadRequestException('Invalid status');
    return this.casesService.changeWorkflowStatus(id, body.status, user.id ?? user._id);
  }
}
