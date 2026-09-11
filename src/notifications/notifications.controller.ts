import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  UseGuards,
  Param,
  Query,
} from '@nestjs/common';

import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';
import { CustomerAuthGuard } from '../auth/guards/customer-auth.guard';
import { NotificationsService } from './notifications.service';

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

class NotificationListQueryDto {
  @IsOptional()
  @IsDateString({ strict: true })
  since?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  cursor?: string;
}

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

@Controller('customer/notifications')
@UseGuards(CustomerAuthGuard)
export class CustomerNotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: NotificationListQueryDto,
  ) {
    return this.notificationsService.listCustomerNotifications(
      user.id,
      query.cursor,
      query.since,
    );
  }

  @Post(':id/read')
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.notificationsService.markCustomerNotificationRead(user.id, id);
  }
}
