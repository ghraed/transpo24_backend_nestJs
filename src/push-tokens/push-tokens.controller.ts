import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthenticatedUserGuard } from '../auth/guards/authenticated-user.guard';
import { NotificationsService } from '../notifications/notifications.service';
import { TestPushTokenDto } from './dto/test-push-token.dto';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import { PushTokensService } from './push-tokens.service';

@Controller('push-tokens')
@UseGuards(AuthenticatedUserGuard)
export class PushTokensController {
  constructor(
    private readonly pushTokensService: PushTokensService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Post('test')
  async testPushToken(
    @Req() request: AuthenticatedRequest,
    @Body() dto: TestPushTokenDto,
  ): Promise<{ accepted: true }> {
    return this.notificationsService.sendTestToDevice(
      request.user.id,
      dto.app,
      dto.token.trim(),
    );
  }

  @Post()
  async registerPushToken(
    @Req() request: AuthenticatedRequest,
    @Body() dto: RegisterPushTokenDto,
  ): Promise<{ success: true }> {
    return this.pushTokensService.registerToken({
      userId: request.user.id,
      role: request.user.role,
      hasDriverProfile: request.user.hasDriverProfile,
      token: dto.token,
      app: dto.app,
      platform: dto.platform,
      deviceName: dto.deviceName,
    });
  }
}
