import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';

type ErrorBody = {
  statusCode: number;
  message: string | string[];
  error?: string;
  timestamp: string;
  path: string;
};

@Catch()
export class JsonExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    if (response.headersSent) {
      return;
    }

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const body = this.toErrorBody(exception, status, request.url);
    response.status(status).json(body);
  }

  private toErrorBody(
    exception: unknown,
    statusCode: number,
    path: string,
  ): ErrorBody {
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        return {
          statusCode,
          message: payload,
          error: exception.name,
          timestamp: new Date().toISOString(),
          path,
        };
      }

      if (payload && typeof payload === 'object') {
        const candidate = payload as {
          message?: string | string[];
          error?: string;
          statusCode?: number;
        };

        return {
          statusCode:
            typeof candidate.statusCode === 'number'
              ? candidate.statusCode
              : statusCode,
          message:
            candidate.message ??
            exception.message ??
            'Unexpected server error.',
          error: candidate.error ?? exception.name,
          timestamp: new Date().toISOString(),
          path,
        };
      }
    }

    return {
      statusCode,
      message:
        exception instanceof Error && exception.message
          ? exception.message
          : 'Unexpected server error.',
      error: exception instanceof Error ? exception.name : 'Error',
      timestamp: new Date().toISOString(),
      path,
    };
  }
}
