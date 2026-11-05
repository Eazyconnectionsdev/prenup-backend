import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Case, CaseSchema } from '../cases/schemas/case.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Counter, CounterSchema } from '../common/schemas/counter.schema';
import {
  PaymentTransaction,
  PaymentTransactionSchema,
  ProcessedStripeEvent,
  ProcessedStripeEventSchema,
} from './schemas/payment-transaction.schema';
import { PaymentsService } from './payments.service';
import { AdminPaymentsController, PaymentsController } from './payments.controller';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PaymentTransaction.name, schema: PaymentTransactionSchema },
      { name: ProcessedStripeEvent.name, schema: ProcessedStripeEventSchema },
      { name: Case.name, schema: CaseSchema },
      { name: User.name, schema: UserSchema },
      { name: Counter.name, schema: CounterSchema },
    ]),
  ],
  controllers: [PaymentsController, AdminPaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService, MongooseModule],
})
export class PaymentsModule {}
