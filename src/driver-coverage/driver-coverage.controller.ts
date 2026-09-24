import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { DriverAuthGuard } from '../auth/guards/driver-auth.guard';
import { AuthenticatedUserGuard } from '../auth/guards/authenticated-user.guard';
import { AdminRoleGuard } from '../admin/guards/admin-role.guard';
import { CurrentUser } from '../admin/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { DriverCoverageService } from './driver-coverage.service';
import {
  CountryCoverageDto,
  RoutePermissionDto,
  ReviewCountryDto,
  ReviewRouteDto,
} from './coverage.dto';

@Controller('driver/me/operational-coverage')
@UseGuards(DriverAuthGuard)
export class DriverCoverageController {
  constructor(private readonly coverage: DriverCoverageService) {}
  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.coverage.list(await this.coverage.driverForUser(user.id));
  }
  @Post('countries')
  async country(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CountryCoverageDto,
  ) {
    return this.coverage.requestCountry(
      await this.coverage.driverForUser(user.id),
      dto,
    );
  }
  @Post('routes')
  async route(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RoutePermissionDto,
  ) {
    return this.coverage.requestRoute(
      await this.coverage.driverForUser(user.id),
      dto,
    );
  }
}

@Controller('admin/drivers/:driverId/operational-coverage')
@UseGuards(AuthenticatedUserGuard, AdminRoleGuard)
export class AdminDriverCoverageController {
  constructor(private readonly coverage: DriverCoverageService) {}
  @Get()
  list(@Param('driverId') id: string) {
    return this.coverage.list(id);
  }
  @Post('initialize-home')
  initialize(@Param('driverId') id: string) {
    return this.coverage.initializeHome(id);
  }
  @Put('countries')
  country(
    @Param('driverId') id: string,
    @Body() dto: ReviewCountryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.coverage.reviewCountry(id, dto, user.id);
  }
  @Put('routes')
  route(
    @Param('driverId') id: string,
    @Body() dto: ReviewRouteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.coverage.reviewRoute(id, dto, user.id);
  }
}
