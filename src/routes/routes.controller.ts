import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { DriverAuthGuard } from '../auth/guards/driver-auth.guard';
import { TranslationCacheService } from '../translations/translation-cache.service';
import { ComputeDriverRouteDto } from './routes.dto';
import { RoutesService } from './routes.service';

@Injectable()
export class RoutesRateLimitGuard implements CanActivate {
  constructor(private readonly counters: TranslationCacheService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: { id: string } }>();
    if (!user?.id) throw new UnauthorizedException();
    const count = await this.counters.incrementRateLimitCounter(
      `routes:minute:${user.id}`,
      60,
    );
    if (count > 30)
      throw new HttpException(
        'Too many route requests.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    return true;
  }
}

@Controller('driver/routes')
@UseGuards(DriverAuthGuard, RoutesRateLimitGuard)
export class RoutesController {
  constructor(private readonly routes: RoutesService) {}

  @Post('compute')
  compute(@Body() dto: ComputeDriverRouteDto) {
    return this.routes.compute(dto);
  }
}
