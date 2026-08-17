import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class TestingOnlyGuard implements CanActivate {
  canActivate(): boolean {
    if (
      process.env.NODE_ENV === 'production' ||
      process.env.ENABLE_TEST_ENDPOINTS !== 'true'
    ) {
      throw new NotFoundException('Cannot POST this resource.');
    }

    return true;
  }
}
