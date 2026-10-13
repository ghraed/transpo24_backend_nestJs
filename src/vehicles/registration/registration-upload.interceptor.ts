import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import multer, { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { from, lastValueFrom } from 'rxjs';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../auth/auth.types';
import { RegistrationQueueService } from './registration-queue.service';
import { MAX_REGISTRATION_IMAGE_BYTES } from './registration.service';
import { scanError } from './registration.errors';

export type RegistrationUploadRequest = AuthenticatedRequest & {
  registrationJobId: string;
  registrationSignal: AbortSignal;
};

@Injectable()
export class RegistrationUploadInterceptor implements NestInterceptor {
  constructor(private readonly queue: RegistrationQueueService) {}
  intercept(context: ExecutionContext, next: CallHandler<unknown>) {
    return from(this.upload(context, next));
  }
  private async upload(context: ExecutionContext, next: CallHandler<unknown>) {
    const req = context.switchToHttp().getRequest<RegistrationUploadRequest>();
    const res = context.switchToHttp().getResponse<Response>();
    const record = await this.queue.reserve(req.user.id);
    const abort = new AbortController();
    req.registrationJobId = record.jobId;
    req.registrationSignal = abort.signal;
    const closed = () => {
      if (!res.writableEnded) abort.abort();
    };
    res.once('close', closed);
    req.once('aborted', closed);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const parser = multer({
        storage: diskStorage({
          destination: this.queue.directory(record.jobId),
          filename: (_req, _file, callback) => callback(null, randomUUID()),
        }),
        limits: {
          fileSize: MAX_REGISTRATION_IMAGE_BYTES,
          files: 2,
          fields: 0,
          parts: 2,
        },
      }).array('images', 2);
      await new Promise<void>((resolve, reject) => {
        timeout = setTimeout(() => {
          abort.abort();
          req.destroy();
          reject(scanError('REGISTRATION_TIMEOUT', 504));
        }, this.queue.uploadTimeoutMs);
        parser(req, res, (error) => {
          if (error)
            reject(
              scanError(
                'REGISTRATION_INVALID_UPLOAD',
                error instanceof multer.MulterError &&
                  error.code === 'LIMIT_FILE_SIZE'
                  ? 413
                  : 400,
              ),
            );
          else resolve();
        });
      });
      clearTimeout(timeout);
      if (abort.signal.aborted) throw scanError('REGISTRATION_CANCELLED', 400);
      return await lastValueFrom(next.handle());
    } catch (error) {
      await this.queue.abandon(record.jobId).catch(() => undefined);
      throw error;
    } finally {
      clearTimeout(timeout);
      res.removeListener('close', closed);
      req.removeListener('aborted', closed);
    }
  }
}
