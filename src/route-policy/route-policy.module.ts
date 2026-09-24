import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RoutePolicyService } from './route-policy.service';

@Module({
  providers: [PrismaService, RoutePolicyService],
  exports: [RoutePolicyService],
})
export class RoutePolicyModule {}
