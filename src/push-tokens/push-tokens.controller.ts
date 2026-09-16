import { PushApp } from '@prisma/client';
import { pushScope } from '../notifications/push-environment';
import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';

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

  @Get('environment')
  getPushEnvironment() {
    return {
      environment: pushScope(PushApp.CUSTOMER).environment,
      applicationIds: [
        pushScope(PushApp.CUSTOMER).applicationId,
        pushScope(PushApp.DRIVER).applicationId,
      ],
    };
  }

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
      applicationId: dto.applicationId,
      app: dto.app,
      platform: dto.platform,
      deviceName: dto.deviceName,
    });
  }
}
