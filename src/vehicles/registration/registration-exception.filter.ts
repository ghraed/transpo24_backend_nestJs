import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import type { Response } from 'express';
import { JsonExceptionFilter } from '../../common/filters/json-exception.filter';
import { scanError } from './registration.errors';

@Catch()
export class RegistrationExceptionFilter extends JsonExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    host
      .switchToHttp()
      .getResponse<Response>()
      .setHeader('Cache-Control', 'private, no-store');
    if (
      exception instanceof HttpException &&
      [400, 413].includes(exception.getStatus())
    ) {
      const response = exception.getResponse();
      if (!response || typeof response !== 'object' || !('code' in response))
        exception = scanError(
          'REGISTRATION_INVALID_UPLOAD',
          exception.getStatus(),
        );
    }
    super.catch(exception, host);
  }
}
