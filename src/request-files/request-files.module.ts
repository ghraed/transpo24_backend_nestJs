import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { RequestFilesService } from './request-files.service';
import { RequestFilesController } from './request-files.controller';
import { PrivateUploadsController } from './private-uploads.controller';
import { PrivateUploadsService } from './private-uploads.service';
@Module({
  imports: [AuthModule],
  providers: [PrismaService, RequestFilesService, PrivateUploadsService],
  controllers: [RequestFilesController, PrivateUploadsController],
  exports: [RequestFilesService],
})
export class RequestFilesModule {}
