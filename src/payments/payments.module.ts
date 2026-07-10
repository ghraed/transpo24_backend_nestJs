import { Module, forwardRef } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CustomerRequestsModule } from '../customer-requests/customer-requests.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaService } from '../prisma/prisma.service';
import { TripsModule } from '../trips/trips.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { StripeService } from './stripe.service';

@Module({
  imports: [
    AuthModule,
    forwardRef(() => TripsModule),
    forwardRef(() => CustomerRequestsModule),
    NotificationsModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, StripeService, PrismaService],
  exports: [PaymentsService, StripeService],
})
export class PaymentsModule {}
