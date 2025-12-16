// src/cases/cases.controller.ts
import { Body, Controller, ForbiddenException, Get, Param, Post, Req, UseGuards, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CasesService } from './cases.service';
import { CreateCaseDto } from './dto/create-case.dto';
import { UsersService } from '../users/users.service';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Step1Dto } from './dto/step1.dto';
import { Step2Dto } from './dto/step2.dto';
// import other step DTOs when created

const END_USER1_STEPS = [1, 2, 5, 6, 7];
const END_USER2_STEPS = [3, 4];

@Controller('cases')
export class CasesController {
  constructor(private casesService: CasesService, private usersService: UsersService) { }

  /** Create a new case */
  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Req() req, @Body() body: CreateCaseDto) {
    const user = req.user;
    const title = body.title;
    return this.casesService.create(user.id, title);
  }

  /** Get case by id */
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findById(@Param('id') id: string) {
    const c = await this.casesService.findById(id);
    if (!c) throw new NotFoundException('Case not found');
    return c;
  }

  /** Invite a user to a case */
  @UseGuards(JwtAuthGuard)
  @Post(':id/invite')
  async invite(@Req() req, @Param('id') id: string, @Body('email') email: string) {
    console.log("here")
    const user = req.user;
    const c = await this.casesService.findById(id);
    if (!c) throw new NotFoundException('Case not found');


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
    if (!c) throw new ForbiddenException('Not found');

    const isPrivileged = user.role === 'superadmin' || user.role === 'admin' || user.role === 'case_manager';
    if (!isPrivileged) {
      if (user.role === 'end_user') {
        if (c.owner.toString() === user.id) {
          if (user.endUserType !== 'user1') throw new ForbiddenException('Owner not user1');
          if (!END_USER1_STEPS.includes(stepNumber)) throw new ForbiddenException('Not allowed to submit this step');
        } else if (c.invitedUser && c.invitedUser.toString() === user.id) {
          if (user.endUserType !== 'user2') throw new ForbiddenException('Invited user not user2');
          if (!END_USER2_STEPS.includes(stepNumber)) throw new ForbiddenException('Not allowed to submit this step');
        } else {
          throw new ForbiddenException('Forbidden');
        }
      } else {
        throw new ForbiddenException('Forbidden');
      }
    }

    const dtoMap: Record<number, any> = {
      1: Step1Dto,
      2: Step2Dto,
      // 3: Step3Dto,
      // 4: Step4Dto,
      // 5: Step5Dto,
      // 6: Step6Dto,
      // 7: Step7Dto,
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
