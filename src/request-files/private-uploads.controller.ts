import {
  Controller,
  Get,
  Param,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { createReadStream } from 'node:fs';
import type { Response } from 'express';
import { AuthenticatedUserGuard } from '../auth/guards/authenticated-user.guard';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { PrivateUploadsService } from './private-uploads.service';

// Protect legacy URLs too: there is no unauthenticated static-file fallback.
@Controller('uploads')
@UseGuards(AuthenticatedUserGuard)
export class PrivateUploadsController {
  constructor(private readonly files: PrivateUploadsService) {}
  @Get('*path')
  async content(
    @Req() req: AuthenticatedRequest,
    @Param('path') path: string | string[],
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.files.file(
      req.user,
      Array.isArray(path) ? path.join('/') : path,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    return new StreamableFile(createReadStream(file.absolute), {
      type: file.mime,
      disposition: 'attachment',
    });
  }
}
