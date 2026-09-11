import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';
import { AuthenticatedUserGuard } from '../auth/guards/authenticated-user.guard';
import { PrismaService } from '../prisma/prisma.service';
import { PushTokensController } from './push-tokens.controller';
import { PushTokensService } from './push-tokens.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [PushTokensController],
  providers: [PushTokensService, AuthenticatedUserGuard, PrismaService],
})
export class PushTokensModule {}
