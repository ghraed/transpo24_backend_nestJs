import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Module({
  controllers: [TenantsController],
  providers: [PrismaService, TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
