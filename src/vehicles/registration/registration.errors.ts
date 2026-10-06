import { HttpException } from '@nestjs/common';

export function scanError(code: string, status: number): HttpException {
  return new HttpException(
    { code, message: 'Registration scanning could not be completed.' },
    status,
  );
}
