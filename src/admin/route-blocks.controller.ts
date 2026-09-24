import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedUserGuard } from '../auth/guards/authenticated-user.guard';
import { AdminRoleGuard } from './guards/admin-role.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { RoutePolicyService } from '../route-policy/route-policy.service';
import { RouteBlocksService } from './route-blocks.service';
import {
  CreateRouteBlockDto,
  UpdateRouteBlockDto,
  RouteBlocksQueryDto,
  RouteCheckQueryDto,
} from './dto/route-block.dto';

@Controller('admin')
@UseGuards(AuthenticatedUserGuard, AdminRoleGuard)
export class RouteBlocksController {
  constructor(
    private readonly blocks: RouteBlocksService,
    private readonly policy: RoutePolicyService,
  ) {}

  @Get('route-blocks')
  list(@Query() query: RouteBlocksQueryDto) {
    return this.blocks.list(query);
  }

  @Get('route-blocks/:id')
  get(@Param('id') id: string) {
    return this.blocks.get(id);
  }

  @Post('route-blocks')
  create(
    @Body() dto: CreateRouteBlockDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.blocks.create(dto, user.id);
  }

  @Patch('route-blocks/:id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRouteBlockDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.blocks.update(id, dto, user.id);
  }

  @Delete('route-blocks/:id')
  deactivate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.blocks.update(id, { isActive: false }, user.id);
  }

  @Get('route-policy/check')
  async check(@Query() query: RouteCheckQueryDto) {
    const route = {
      fromCountryCode: query.from,
      toCountryCode: query.to,
      transportType: query.type,
    };
    const blockedBy = await this.policy.findBlock(route);
    return { ...route, allowed: blockedBy === null, blockedBy };
  }
}
