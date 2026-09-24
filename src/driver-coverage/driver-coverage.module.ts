import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { DriverCoverageService } from './driver-coverage.service';
import {
  DriverCoverageController,
  AdminDriverCoverageController,
} from './driver-coverage.controller';
@Module({
  imports: [AuthModule],
  controllers: [DriverCoverageController, AdminDriverCoverageController],
  providers: [PrismaService, DriverCoverageService],
  exports: [DriverCoverageService],
})
export class DriverCoverageModule {}
