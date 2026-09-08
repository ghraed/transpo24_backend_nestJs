import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { RequestFilesService } from './request-files.service';
import { RequestFilesController } from './request-files.controller';
@Module({
  imports: [AuthModule],
  providers: [PrismaService, RequestFilesService],
  controllers: [RequestFilesController],
  exports: [RequestFilesService],
})
export class RequestFilesModule {}
