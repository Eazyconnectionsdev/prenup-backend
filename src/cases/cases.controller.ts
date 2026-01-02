import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CasesService } from './cases.service';
import { CreateCaseDto } from './dto/create-case.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Step1Dto } from './dto/step1.dto';
import { Step2Dto } from './dto/step2.dto';
import { Step3Dto } from './dto/step3.dto';
import { Step4Dto } from './dto/step4.dto';
import { Step5Dto } from './dto/step5.dto';
import { Step6Dto } from './dto/step6.dto';
import { Step7Dto } from './dto/step7.dto';
import { LawyersService } from './lawyer.service';

const END_USER1_STEPS = [1, 2, 5, 6, 7];
const END_USER2_STEPS = [3, 4];

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

  /** Create a new case */
  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Req() req, @Body() body: CreateCaseDto) {
    const user = this.ensureUser(req);
    const title = body.title;
    return this.casesService.create(user.id, title);
  }

  /**
   * List cases:
   * - admins / superadmin / case_manager -> all cases
   * - others -> cases where they are owner or invitedUser
   */
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

  /** Get case by id. Privileged users get populated owner/invitedUser */
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findById(@Req() req, @Param('id') id: string) {
    const user = this.ensureUser(req);
    const isPrivileged = this.isPrivilegedRole(user.role);

    const c = await this.casesService.findById(id, isPrivileged);
    if (!c) throw new NotFoundException('Case not found');

    // Non-privileged users should only access if owner or invitedUser
    if (!isPrivileged) {
      const userIdStr = (user.id ?? user._id)?.toString();
      const ownerId = c.owner?.toString();
      const invitedId = c.invitedUser?.toString();
      if (ownerId !== userIdStr && invitedId !== userIdStr) {
        throw new ForbiddenException('Forbidden');
      }
    }

    return c;
  }

  /** Invite a user to a case */
  @UseGuards(JwtAuthGuard)
  @Post(':id/invite')
  async invite(@Req() req, @Param('id') id: string, @Body('email') email: string) {
    const user = this.ensureUser(req);
    const c = await this.casesService.findById(id);
    if (!c) throw new NotFoundException('Case not found');

    // only privileged or owner can invite
    const isPrivileged = this.isPrivilegedRole(user.role);
    const userIdStr = (user.id ?? user._id)?.toString();
    if (!(isPrivileged || c.owner?.toString() === userIdStr)) {
      throw new ForbiddenException('Forbidden');
    }

    return this.casesService.invite(id, user.id, email);
  }

  /** Attach invited user to a case (accept invite) */
  @UseGuards(JwtAuthGuard)
  @Post(':id/attach-invited')
  async attachInvitedUser(@Req() req, @Param('id') id: string) {
    const user = this.ensureUser(req);
    return this.casesService.attachInvitedUser(id, user.id);
  }

  /**
   * Fetch a single step's data and status for a case
   */
  @UseGuards(JwtAuthGuard)
  @Get(':id/steps/:stepNumber')
  async getStep(@Req() req, @Param('id') id: string, @Param('stepNumber') stepNumberStr: string) {
    const user = this.ensureUser(req);
    const isPrivileged = this.isPrivilegedRole(user.role);

    const c = await this.casesService.findById(id, isPrivileged);
    if (!c) throw new NotFoundException('Case not found');

    // Access check for non-admins
    if (!isPrivileged) {
      const userIdStr = (user.id ?? user._id)?.toString();
      if (c.owner?.toString() !== userIdStr && c.invitedUser?.toString() !== userIdStr) {
        throw new ForbiddenException('Forbidden');
      }
    }

    const stepNumber = Number(stepNumberStr);
    if (!Number.isInteger(stepNumber) || stepNumber < 1 || stepNumber > 7) {
      throw new BadRequestException('Invalid step number');
    }

    const key = `step${stepNumber}`;
    const stepData = (c as any)[key] ?? {};
    const stepStatus = (c.status && (c.status as any)[key]) || {};

    return {
      stepNumber,
      data: stepData,
      status: stepStatus,
      fullyLocked: !!c.fullyLocked,
    };
  }

  /** Update a specific step of a case
   * - Non-privileged end-users: must follow end-user step rules (which step types they can submit).
   * - Privileged roles: may update any step.
   * - New locking: only step 7 submission triggers a complete lock; otherwise end-users may re-submit/update 1-6.
   */
  @UseGuards(JwtAuthGuard)
  @Post(':id/steps/:stepNumber')
  async updateStep(@Req() req, @Param('id') id: string, @Param('stepNumber') stepNumberStr: string, @Body() body: any) {
    const user = this.ensureUser(req);
    const stepNumber = Number(stepNumberStr);
    const c = await this.casesService.findById(id);
    if (!c) throw new NotFoundException('Case not found');

    const isPrivileged = this.isPrivilegedRole(user.role);

    if (!isPrivileged) {
      const userIdStr = (user.id ?? user._id)?.toString();

      // Owner path (end_user type user1)
      if (c.owner?.toString() === userIdStr) {
        if (user.endUserType !== 'user1') throw new ForbiddenException('Owner not user1');
        if (!END_USER1_STEPS.includes(stepNumber)) throw new ForbiddenException('Not allowed to submit this step');
      }
      else if (c.invitedUser && c.invitedUser?.toString() === userIdStr) {
        if (user.endUserType !== 'user2') throw new ForbiddenException('Invited user not user2');
        if (!END_USER2_STEPS.includes(stepNumber)) throw new ForbiddenException('Not allowed to submit this step');
      } else {
        throw new ForbiddenException('Forbidden');
      }
    }

    // If case is fully locked, only privileged can update (steps are locked).
    if (c.fullyLocked && !isPrivileged) {
      throw new ForbiddenException('Case is fully locked. Please ask a case manager to unlock it.');
    }

    const dtoMap: Record<number, any> = {
      1: Step1Dto,
      2: Step2Dto,
      3: Step3Dto,
      4: Step4Dto,
      5: Step5Dto,
      6: Step6Dto,
      7: Step7Dto,
    };

    const DtoClass = dtoMap[stepNumber];
    let validatedData = body;

    if (DtoClass) {
      const instance = plainToInstance(DtoClass, body);
      const errors = await validate(instance as object, { whitelist: true, forbidNonWhitelisted: false });
      if (errors.length > 0) {
        const formatted = errors.map(err => ({
          property: err.property,
          constraints: err.constraints,
          children: err.children,
        }));
        throw new BadRequestException({ message: 'Validation failed', errors: formatted });
      }
      validatedData = instance;
    }

    // call service (service will perform full-lock if this is step 7)
    const updated = await this.casesService.updateStep(id, stepNumber, validatedData, user.id ?? user._id);
    return updated;
  }

  // cases.controller.ts (excerpt)
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

    // Access check for non-admins
    if (!isPrivileged) {
      const userIdStr = (user.id ?? user._id)?.toString();
      if (
        c.owner?.toString() !== userIdStr &&
        c.invitedUser?.toString() !== userIdStr
      ) {
        throw new ForbiddenException('Forbidden');
      }
    }

    // New rule: pre-questionnaire submission and lawyer selection are only allowed *after*
    // all steps are submitted AND the case is fully locked. Enforce controller-level check here.
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

      return {
        id: lid,
        externalId: l.externalId,
        name: l.name,
        priceText: l.priceText,
        avatarUrl: l.avatarUrl,
        selectedBy,
      };
    });

    return {
      total: mapped.length,
      lawyers: mapped,
      yourSelected: isOwner ? p1SelectedId : p2SelectedId,
      partnerSelected: isOwner ? p2SelectedId : p1SelectedId,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('seed')
  async seedLawyers(@Req() req) {
    const user = req.user;

    return this.lawyersService.seedInitialLawyersIfEmpty();
  }


  @UseGuards(JwtAuthGuard)
  @Post(':id/pre-questionnaire')
  async submitPreQuestionnaireEndpoint(@Req() req, @Param('id') id: string, @Body() body: { answers?: string[] }) {
    const user = this.ensureUser(req);
    // basic validation
    if (!body || !Array.isArray(body.answers)) {
      throw new BadRequestException('Request body must include "answers" array');
    }

    const c = await this.casesService.findById(id);
    if (!c) throw new NotFoundException('Case not found');

    // New rule: pre-questionnaire can only be submitted after all steps are submitted AND case is fully locked.
    const isPrivileged = this.isPrivilegedRole(user.role);
    const allStepsSubmitted = this.casesService.areAllStepsSubmitted(c);
    if (!(c.fullyLocked && allStepsSubmitted) && !isPrivileged) {
      throw new ForbiddenException('Pre-questionnaire can only be submitted after all steps are submitted and the case is fully locked.');
    }

    // call service to submit (service enforces the same rules)
    const updatedCase = await this.casesService.submitPreQuestionnaire(id, user.id ?? user._id, body.answers);
    return {
      message: 'Pre-questionnaire submitted',
      case: updatedCase,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/select-lawyer')
  async selectLawyerEndpoint(@Req() req, @Param('id') id: string, @Body() body: { lawyerId?: string; force?: boolean }) {
    const user = this.ensureUser(req);
    if (!body || !body.lawyerId) {
      throw new BadRequestException('Request body must include "lawyerId" (Mongo _id of the lawyer)');
    }

    const c = await this.casesService.findById(id);
    if (!c) throw new NotFoundException('Case not found');

    const isPrivileged = this.isPrivilegedRole(user.role);

    // New rule: lawyer selection allowed only after all steps are submitted AND case is fully locked.
    const allStepsSubmitted = this.casesService.areAllStepsSubmitted(c);
    if (!(c.fullyLocked && allStepsSubmitted) && !isPrivileged) {
      throw new ForbiddenException('Lawyer selection is allowed only after all steps are submitted and the case is fully locked.');
    }

    // If caller is privileged they can pass force=true to override exclusivity (service handles it)
    const force = !!body.force;

    const updatedCase = await this.casesService.selectLawyer(id, user.id ?? user._id, body.lawyerId, force);
    return {
      message: 'Lawyer selected',
      case: updatedCase,
    };
  }
}
