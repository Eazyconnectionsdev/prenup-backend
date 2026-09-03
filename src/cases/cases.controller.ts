// src/cases/cases.controller.ts
import { Body, Controller, ForbiddenException, Get, Param, Post, Req, UseGuards, BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CasesService } from './cases.service';
import { CreateCaseDto } from './dto/create-case.dto';
import { InvitePartnerDto } from '../cases/dto/Invite-partner.dto';
import { LawyersService } from './lawyer.service';

@Controller('cases')
export class CasesController {
  constructor(private casesService: CasesService, private lawyersService: LawyersService) { }
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
  async invite(
    @Req() req,
    @Param('id') id: string,
    @Body() dto: InvitePartnerDto,
  ) {
    console.log('RAW BODY:', req.body);
8
console.log('DTO:', dto);


    const user = this.ensureUser(req);

    const c = await this.casesService.findById(id);

    if (!c) {
      throw new NotFoundException('Case not found');
    }

    const isPrivileged = this.isPrivilegedRole(user.role);

    const userIdStr =
      (user.id ?? user._id)?.toString();

    if (
      !(
        isPrivileged ||
        c.owner?.toString() === userIdStr
      )
    ) {
      throw new ForbiddenException(
        'Forbidden',
      );
    }

    return this.casesService.invite(
      id,
      user.id,
      dto,
    );
  }
  @UseGuards(JwtAuthGuard)
  @Post(':id/attach-invited')
  async attachInvitedUser(@Req() req, @Param('id') id: string) {
    const user = this.ensureUser(req);
    return this.casesService.attachInvitedUser(id, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/section/:sectionName')
  async getSection(
    @Req() req,
    @Param('id') id: string,
    @Param('sectionName')
    sectionName: string,
  ) {
    const user = this.ensureUser(req);

    return this.casesService
      .getQuestionnaireSection(
        id,
        sectionName,
        user,
      );
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/questionnaire/:stepName')
  async updateQuestionnaireStep(
    @Req() req,
    @Param('id') id: string,
    @Param('stepName')
    stepName: string,
    @Body() body: any,
  ) {
    const user = this.ensureUser(req);

    const isPrivileged =
      this.isPrivilegedRole(
        user.role,
      );

    return this.casesService
      .updateQuestionnaireStep(
        id,
        stepName,
        body,
        user.id ?? user._id,
        isPrivileged,
      );
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
  @Post(':id/payment-completed')
  async paymentCompleted(
    @Req() req,
    @Param('id') id: string,
  ) {
    const user =
      this.ensureUser(req);

    return this.casesService
      .markPaymentCompleted(
        id,
        user.id,
      );
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/approve')
  async approveCase(
    @Req() req,
    @Param('id') id: string,
  ) {
    const user =
      this.ensureUser(req);

    return this.casesService
      .approveCaseByUser(
        id,
        user.id,
      );
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/reject')
  async rejectCase(
    @Req() req,
    @Param('id') id: string,
    @Body('reason')
    reason: string,
  ) {
    const user =
      this.ensureUser(req);

    return this.casesService
      .rejectCaseByUser(
        id,
        user.id,
        reason,
      );
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/status')
  async getStatus(
    @Param('id') id: string,
  ) {
    const c =
      await this.casesService.findById(id);

    if (!c) {
      throw new NotFoundException(
        'Case not found',
      );
    }

    return {
      workflowStatus:
        c.workflowStatus,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/lawyers')
  async getLawyersForCase(
    @Req() req,
    @Param('id') id: string,
  ) {
    const user =
      this.ensureUser(req);

    const c =
      await this.casesService.findById(id);

    if (!c) {
      throw new NotFoundException(
        'Case not found',
      );
    }

    const userIdStr =
      (user.id ?? user._id)?.toString();

    const isPrivileged =
      this.isPrivilegedRole(user.role);

    if (
      !isPrivileged &&
      c.owner?.toString() !==
      userIdStr &&
      c.invitedUser?.toString() !==
      userIdStr
    ) {
      throw new ForbiddenException(
        'Forbidden',
      );
    }

    const lawyers =
      await this.lawyersService.listAll();

    return {
      total: lawyers.length,
      lawyers,
    };
  }

}
