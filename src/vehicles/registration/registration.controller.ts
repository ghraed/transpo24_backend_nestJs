import {
  Body,
  Controller,
  Header,
  Post,
  Req,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  UseFilters,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CustomerAuthGuard } from '../../auth/guards/customer-auth.guard';
import type { AuthenticatedRequest } from '../../auth/auth.types';
import { scanError } from './registration.errors';
import { RegistrationRateLimitGuard } from './registration-rate-limit.guard';
import { RegistrationExceptionFilter } from './registration-exception.filter';
import {
  MAX_REGISTRATION_IMAGE_BYTES,
  RegistrationService,
} from './registration.service';

@Controller('vehicles')
@UseGuards(CustomerAuthGuard, RegistrationRateLimitGuard)
@UseFilters(RegistrationExceptionFilter)
export class RegistrationController {
  constructor(private readonly service: RegistrationService) {}

  @Post('extract-registration')
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(
    FilesInterceptor('images', 2, {
      limits: {
        fileSize: MAX_REGISTRATION_IMAGE_BYTES,
        files: 2,
        fields: 0,
        parts: 2,
      },
    }),
  )
  async extract(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: Record<string, unknown>,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const abort = new AbortController();
    const onClose = () => {
      if (!res.writableEnded) abort.abort();
    };
    res.once('close', onClose);
    try {
      if (Object.keys(body ?? {}).length)
        throw scanError('REGISTRATION_INVALID_UPLOAD', 400);
      return await this.service.extract(files, abort.signal);
    } finally {
      res.removeListener('close', onClose);
      for (const file of files ?? []) {
        file.buffer?.fill(0);
        file.buffer = Buffer.alloc(0);
      }
    }
  }
}
