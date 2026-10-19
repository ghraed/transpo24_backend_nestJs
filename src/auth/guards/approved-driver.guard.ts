import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthService } from '../auth.service';

@Injectable()
export class ApprovedDriverGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: { id: string; role: UserRole } }>();
    if (!request.user) throw new UnauthorizedException();
    if (request.user.role === UserRole.DRIVER) {
      await this.authService.assertDriverApproved(request.user.id);
    }
    return true;
  }
}
