import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Req,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CustomerAuthGuard } from '../../auth/guards/customer-auth.guard';
import type { AuthenticatedRequest } from '../../auth/auth.types';
import { RegistrationRateLimitGuard } from './registration-rate-limit.guard';
import { RegistrationExceptionFilter } from './registration-exception.filter';
import { RegistrationQueueService } from './registration-queue.service';
import {
  RegistrationUploadInterceptor,
  type RegistrationUploadRequest,
} from './registration-upload.interceptor';

@Controller('vehicles')
@UseGuards(CustomerAuthGuard)
@UseFilters(RegistrationExceptionFilter)
export class RegistrationController {
  constructor(private readonly queue: RegistrationQueueService) {}

  @Post('registration-extractions')
  @HttpCode(202)
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(RegistrationRateLimitGuard)
  @UseInterceptors(RegistrationUploadInterceptor)
  async create(@Req() req: RegistrationUploadRequest) {
    return this.queue.enqueue(
      req.registrationJobId,
      req.files as Express.Multer.File[],
    );
  }

  @Get('registration-extractions/:jobId')
  @Header('Cache-Control', 'private, no-store')
  async status(@Req() req: AuthenticatedRequest, @Param('jobId') id: string) {
    await this.queue.store.limit(req.user.id, 'poll', 60, 60);
    return this.queue.status(req.user.id, id);
  }

  @Delete('registration-extractions/:jobId')
  @Header('Cache-Control', 'private, no-store')
  async cancel(@Req() req: AuthenticatedRequest, @Param('jobId') id: string) {
    return this.queue.cancel(req.user.id, id);
  }

  @Post('extract-registration')
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(RegistrationRateLimitGuard)
  @UseInterceptors(RegistrationUploadInterceptor)
  async extract(@Req() req: RegistrationUploadRequest) {
    await this.queue.enqueue(
      req.registrationJobId,
      req.files as Express.Multer.File[],
    );
    return this.queue.waitForLegacy(
      req.user.id,
      req.registrationJobId,
      req.registrationSignal,
    );
  }
}
