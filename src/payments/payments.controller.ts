import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  // Price and payment state for the applicant's case.
  @UseGuards(JwtAuthGuard)
  @Get('cases/:caseId')
  getCasePayment(@Req() req: any, @Param('caseId') caseId: string) {
    return this.payments.getCasePayment(caseId, req.user);
  }

  // Starts Stripe Checkout; the client redirects to the returned url.
  @UseGuards(JwtAuthGuard)
  @Post('cases/:caseId/checkout')
  checkout(@Req() req: any, @Param('caseId') caseId: string) {
    return this.payments.createCheckout(caseId, req.user);
  }

  // The Stripe return page confirms the session here.
  @UseGuards(JwtAuthGuard)
  @Get('checkout/:sessionId/verify')
  verify(@Req() req: any, @Param('sessionId') sessionId: string) {
    if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) throw new BadRequestException('Invalid session');
    return this.payments.verifySession(sessionId, req.user);
  }

  // Stripe -> us. Authenticated by the webhook signature, not a session.
  @Post('stripe/webhook')
  @HttpCode(200)
  webhook(@Req() req: RawBodyRequest<any>, @Headers('stripe-signature') signature: string) {
    return this.payments.handleWebhook(req.rawBody, signature);
  }
}

// Refunds are issued by admins from the Finance reports.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('superadmin', 'admin')
@Controller('admin/payments')
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('refunds')
  refund(
    @Req() req: any,
    @Body('transactionId') transactionId: string,
    @Body('amount') amount: number | string | undefined,
    @Body('reason') reason: string,
  ) {
    if (!transactionId) throw new BadRequestException('transactionId is required');
    const value = amount === undefined || amount === null || amount === '' ? undefined : Number(amount);
    return this.payments.createRefund(transactionId, value, reason, req.user);
  }
}
