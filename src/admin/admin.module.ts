import { RoutePolicyModule } from '../route-policy/route-policy.module';
import { RouteBlocksController } from './route-blocks.controller';
import { RouteBlocksService } from './route-blocks.service';
import { Module } from '@nestjs/common';

import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  imports: [RoutePolicyModule, AuthModule, NotificationsModule, PaymentsModule],
  controllers: [AdminController, RouteBlocksController],
  providers: [RouteBlocksService, AdminService, PrismaService],
})
export class AdminModule {}
