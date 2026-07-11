import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { AuthenticatedUser } from '../../auth/auth.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as Request & { user?: AuthenticatedUser }).user;

    if (!user) {
      throw new Error('CurrentUser decorator used without authentication.');
    }

    return user;
  },
);
