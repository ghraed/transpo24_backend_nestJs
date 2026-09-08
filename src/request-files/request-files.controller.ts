import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AuthenticatedUserGuard } from '../auth/guards/authenticated-user.guard';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { RequestFilesService } from './request-files.service';
import { type IncomingFile, MAX_FILE_SIZE } from './file-validation';

@Controller('request-files')
@UseGuards(AuthenticatedUserGuard)
export class RequestFilesController {
  constructor(private readonly files: RequestFilesService) {}
  @Get('request/:requestId')
  list(@Req() req: AuthenticatedRequest, @Param('requestId') id: string) {
    return this.files.list(req.user, id);
  }
  @Post('request/:requestId/acknowledge')
  acknowledge(
    @Req() req: AuthenticatedRequest,
    @Param('requestId') id: string,
  ) {
    return this.files.acknowledge(req.user, id);
  }
  @Post('request/:requestId')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_SIZE, files: 1, fields: 1 },
    }),
  )
  upload(
    @Req() req: AuthenticatedRequest,
    @Param('requestId') id: string,
    @Body('documentType') type: string,
    @UploadedFile() file: IncomingFile,
  ) {
    return this.files.uploadOfficial(req.user, id, type, file);
  }
  @Get(':id/content')
  async content(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.files.content(req.user, id);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(Buffer.from(file.data), {
      type: file.mimeType,
      length: file.size,
      disposition: `attachment; filename="document${file.mimeType === 'application/pdf' ? '.pdf' : file.mimeType === 'image/png' ? '.png' : '.jpg'}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    });
  }
}
