import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerRequestsController } from './customer-requests.controller';
import { CustomerRequestsService } from './customer-requests.service';

@Module({
  imports: [AuthModule],
  controllers: [CustomerRequestsController],
  providers: [CustomerRequestsService, PrismaService],
})
export class CustomerRequestsModule {}
