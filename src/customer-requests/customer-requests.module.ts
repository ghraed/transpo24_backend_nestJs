import { RequestGeographyService } from './request-geography.service';
import { Module, forwardRef } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ChatModule } from '../chat/chat.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { PrismaService } from '../prisma/prisma.service';
import { TripsModule } from '../trips/trips.module';
import { CustomerHomeController } from './customer-home.controller';
import { CustomerRequestsController } from './customer-requests.controller';
import { CustomerRequestsService } from './customer-requests.service';

import { CustomerPlacesController } from './customer-places.controller';
import { CustomerPlacesService } from './customer-places.service';

@Module({
  imports: [
    AuthModule,
    forwardRef(() => ChatModule),
    NotificationsModule,
    forwardRef(() => PaymentsModule),
    forwardRef(() => TripsModule),
  ],
  controllers: [
    CustomerPlacesController,
    CustomerHomeController,
    CustomerRequestsController,
  ],
  providers: [
    RequestGeographyService,
    CustomerPlacesService,
    CustomerRequestsService,
    PrismaService,
  ],
  exports: [CustomerRequestsService],
})
export class CustomerRequestsModule {}
