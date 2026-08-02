// src/cases/cases.controller.ts
import { Body, Controller, ForbiddenException, Get, Param, Post, Req, UseGuards, BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CasesService } from './cases.service';
import { CreateCaseDto } from './dto/create-case.dto';
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
      const allSectionsSubmitted =
        this.casesService.areAllSectionsSubmitted(c);

      if (
        !c.fullyLocked ||
        !allSectionsSubmitted
      ) {
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
   
  }

}
