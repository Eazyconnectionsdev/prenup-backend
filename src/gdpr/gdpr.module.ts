import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Counter, CounterSchema } from '../common/schemas/counter.schema';
import { GdprRequest, GdprRequestSchema } from './gdpr-request.schema';
import { GdprService } from './gdpr.service';
import { AdminGdprController, GdprController } from './gdpr.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GdprRequest.name, schema: GdprRequestSchema },
      { name: User.name, schema: UserSchema },
      { name: Counter.name, schema: CounterSchema },
    ]),
  ],
  controllers: [GdprController, AdminGdprController],
  providers: [GdprService],
  exports: [GdprService, MongooseModule],
})
export class GdprModule {}
