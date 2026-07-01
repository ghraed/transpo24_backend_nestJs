import { Module } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

@Module({
  providers: [NotificationsService, PrismaService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
