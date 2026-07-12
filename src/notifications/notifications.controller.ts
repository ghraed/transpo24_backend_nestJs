import { Body, Controller, Delete, Get, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../admin/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AuthenticatedUserGuard } from '../auth/guards/authenticated-user.guard';
import { AdminRoleGuard } from '../admin/guards/admin-role.guard';
import { CreateWebPushSubscriptionDto } from './dto/create-web-push-subscription.dto';
import { DeleteWebPushSubscriptionDto } from './dto/delete-web-push-subscription.dto';
import {
  WebPushSubscriptionResponseDto,
  WebPushSubscriptionsService,
} from './web-push-subscriptions.service';

@Controller('notifications/web-push/subscriptions')
@UseGuards(AuthenticatedUserGuard, AdminRoleGuard)
export class NotificationsController {
  constructor(
    private readonly webPushSubscriptionsService: WebPushSubscriptionsService,
  ) {}

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWebPushSubscriptionDto,
  ): Promise<WebPushSubscriptionResponseDto> {
    return this.webPushSubscriptionsService.upsert({
      userId: user.id,
      role: user.role,
      subscription: dto,
    });
  }

  @Delete()
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeleteWebPushSubscriptionDto,
  ): Promise<{ success: true }> {
    return this.webPushSubscriptionsService.remove({
      userId: user.id,
      role: user.role,
      endpoint: dto.endpoint,
    });
  }

  @Get('me')
  async findMine(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<WebPushSubscriptionResponseDto[]> {
    return this.webPushSubscriptionsService.findMine(user.id);
  }
}
