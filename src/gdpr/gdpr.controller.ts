import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { GdprService } from './gdpr.service';

// Applicants submit and follow their own requests.
@UseGuards(JwtAuthGuard)
@Controller('gdpr/requests')
export class GdprController {
  constructor(private readonly gdpr: GdprService) {}

  @Post()
  create(@Req() req: any, @Body('type') type: string, @Body('notes') notes?: string) {
    return this.gdpr.create({ type, userId: String(req.user.id), notes }, 'web');
  }

  @Get('mine')
  mine(@Req() req: any) {
    return this.gdpr.listForUser(String(req.user.id));
  }
}

// Staff register: log requests received by email/phone and work them.
// The list itself is served by the Security & Compliance reports.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('superadmin', 'admin')
@Controller('admin/gdpr-requests')
export class AdminGdprController {
  constructor(private readonly gdpr: GdprService) {}

  @Post()
  create(@Body() body: any) {
    return this.gdpr.create(
      {
        type: body?.type,
        userId: body?.userId,
        email: body?.email,
        userName: body?.userName,
        caseId: body?.caseId,
        requestDate: body?.requestDate,
        notes: body?.notes,
        assignedTo: body?.assignedTo,
      },
      'staff',
    );
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.gdpr.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.gdpr.update(id, {
      status: body?.status,
      assignedTo: body?.assignedTo,
      notes: body?.notes,
      note: body?.note,
    });
  }
}
