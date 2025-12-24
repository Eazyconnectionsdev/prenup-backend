// src/cases/cases.controller.ts
import { Body, Controller, ForbiddenException, Get, Param, Post, Req, UseGuards, BadRequestException, NotFoundException } from '@nestjs/common';
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

const END_USER1_STEPS = [1, 2, 5, 6, 7];
const END_USER2_STEPS = [3, 4];

@Controller('cases')
export class CasesController {
  constructor(private casesService: CasesService) { }

  /** Create a new case */
  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Req() req, @Body() body: CreateCaseDto) {
    const user = req.user;
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
    const user = req.user;
    const isPrivileged = user.role === 'superadmin' || user.role === 'admin' || user.role === 'case_manager';
    if (isPrivileged) {
      return this.casesService.findAll();
    }
    return this.casesService.findByUser(user.id);
  }

  /** Get case by id. Privileged users get populated owner/invitedUser */
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findById(@Req() req, @Param('id') id: string) {
    const user = req.user;
    const isPrivileged = user.role === 'superadmin' || user.role === 'admin' || user.role === 'case_manager';

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
    const user = req.user;
    const c = await this.casesService.findById(id);
    if (!c) throw new NotFoundException('Case not found');

    // only privileged or owner can invite
    const isPrivileged = user.role === 'superadmin' || user.role === 'admin' || user.role === 'case_manager';
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
    const user = req.user;
    return this.casesService.attachInvitedUser(id, user.id);
  }

  /** Update a specific step of a case */
  @UseGuards(JwtAuthGuard)
  @Post(':id/steps/:stepNumber')
  async updateStep(@Req() req, @Param('id') id: string, @Param('stepNumber') stepNumberStr: string, @Body() body: any) {
    const user = req.user;
    const stepNumber = Number(stepNumberStr);
    const c = await this.casesService.findById(id);
    if (!c) throw new NotFoundException('Case not found');

    const isPrivileged = user.role === 'superadmin' || user.role === 'admin' || user.role === 'case_manager';

    // If not privileged, enforce end_user rules. Privileged users are allowed to update any step.
    if (!isPrivileged) {
      const userIdStr = (user.id ?? user._id)?.toString();

      // Owner path (end_user type user1)
      if (c.owner?.toString() === userIdStr) {
        if (user.endUserType !== 'user1') throw new ForbiddenException('Owner not user1');
        if (!END_USER1_STEPS.includes(stepNumber)) throw new ForbiddenException('Not allowed to submit this step');
      }
      // Invited user path (end_user type user2)
      else if (c.invitedUser && c.invitedUser?.toString() === userIdStr) {
        if (user.endUserType !== 'user2') throw new ForbiddenException('Invited user not user2');
        if (!END_USER2_STEPS.includes(stepNumber)) throw new ForbiddenException('Not allowed to submit this step');
      } else {
        throw new ForbiddenException('Forbidden');
      }
    }
    // privileged users fall through and are allowed to update any step

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

    return this.casesService.updateStep(id, stepNumber, validatedData, user.id);
  }
}
