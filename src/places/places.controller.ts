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
import {
  PlaceAutocompleteDto,
  PlaceDetailsDto,
  PlaceReverseDto,
} from './places.dto';
import { PlacesService } from './places.service';

@Injectable()
export class PlacesRateLimitGuard implements CanActivate {
  constructor(private readonly counters: TranslationCacheService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: { id: string } }>();
    if (!user?.id) throw new UnauthorizedException();
    const count = await this.counters.incrementRateLimitCounter(
      `places:minute:${user.id}`,
      60,
    );
    if (count > 120)
      throw new HttpException(
        'Too many place requests.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    return true;
  }
}

@Controller('driver/places')
@UseGuards(DriverAuthGuard, PlacesRateLimitGuard)
export class PlacesController {
  constructor(private readonly places: PlacesService) {}
  @Post('autocomplete')
  autocomplete(@Body() dto: PlaceAutocompleteDto) {
    return this.places.autocomplete(dto);
  }
  @Post('details')
  details(@Body() dto: PlaceDetailsDto) {
    return this.places.details(dto);
  }
  @Post('reverse')
  reverse(@Body() dto: PlaceReverseDto) {
    return this.places.reverse(dto);
  }
}
