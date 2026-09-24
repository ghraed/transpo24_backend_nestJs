import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RoutePolicyModule } from '../route-policy/route-policy.module';
import { MatchingService } from './matching.service';
@Module({
  imports: [RoutePolicyModule],
  providers: [PrismaService, MatchingService],
  exports: [MatchingService],
})
export class MatchingModule {}
