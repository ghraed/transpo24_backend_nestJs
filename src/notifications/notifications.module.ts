import { Module } from '@nestjs/common';

import { AdminRoleGuard } from '../admin/guards/admin-role.guard';
import { AuthModule } from '../auth/auth.module';
import { AuthenticatedUserGuard } from '../auth/guards/authenticated-user.guard';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { WebPushProvider } from './web-push.provider';
import { WebPushSubscriptionsService } from './web-push-subscriptions.service';

@Module({
  imports: [AuthModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    WebPushProvider,
    WebPushSubscriptionsService,
    AuthenticatedUserGuard,
    AdminRoleGuard,
    PrismaService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
