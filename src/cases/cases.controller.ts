// src/cases/cases.controller.ts (replace updateStep method with this)
import { Body, Controller, ForbiddenException, Get, Param, Post, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CasesService } from './cases.service';
import { CreateCaseDto } from './dto/create-case.dto';
import { InviteDto } from './dto/invite.dto';
import { UsersService } from '../users/users.service';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Step1Dto } from './dto/step1.dto';
import { Step2Dto } from './dto/step2.dto';
// (import other step DTOs when created)

const END_USER1_STEPS = [1,2,5,6,7];
const END_USER2_STEPS = [3,4];

@Controller('cases')
export class CasesController {
  constructor(private casesService: CasesService, private usersService: UsersService) {}

  // ... other routes unchanged ...

  @UseGuards(JwtAuthGuard)
  @Post(':id/steps/:stepNumber')
  async updateStep(@Req() req, @Param('id') id: string, @Param('stepNumber') stepNumberStr: string, @Body() body: any) {
    const user = req.user;
    const stepNumber = Number(stepNumberStr);
    const c = await this.casesService.findById(id);
    if (!c) throw new ForbiddenException('Not found');

    // authorization (same as before)
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

    // --- Validation section: map stepNumber to DTO if available ---
    const dtoMap: Record<number, any> = {
      1: Step1Dto,
      2: Step2Dto,
      // 3: Step3Dto, // create similar DTOs for step3..step7 and add here
      // 4: Step4Dto,
      // 5: Step5Dto,
      // 6: Step6Dto,
      // 7: Step7Dto,
    };

    const DtoClass = dtoMap[stepNumber];
    let validatedData = body;

    if (DtoClass) {
      // transform & validate
      const instance = plainToInstance(DtoClass, body);
      const errors = await validate(instance as object, { whitelist: true, forbidNonWhitelisted: false });
      if (errors.length > 0) {
        // Map errors to readable format
        const formatted = errors.map(err => ({
          property: err.property,
          constraints: err.constraints,
          children: err.children,
        }));
        throw new BadRequestException({ message: 'Validation failed', errors: formatted });
      }
      // Use the validated & transformed object
      validatedData = instance;
    } else {
      // no DTO for this step yet — accept raw data but you should add DTOs for strong validation
      // Optionally: perform minimal checks here
    }

    // call service (service will store and set status.submittedBy)
    return this.casesService.updateStep(id, stepNumber, validatedData, user.id);
  }
}
