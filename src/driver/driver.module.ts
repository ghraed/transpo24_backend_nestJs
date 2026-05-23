import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { DriverController } from './driver.controller';
import { DriverService } from './driver.service';

@Module({
  imports: [AuthModule],
  controllers: [DriverController],
  providers: [DriverService, PrismaService],
})
export class DriverModule {}
