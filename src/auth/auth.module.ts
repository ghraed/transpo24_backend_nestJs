import { Module } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PhoneAuthRateLimitService } from './phone-auth-rate-limit.service';
import { TwilioVerifyService } from './twilio-verify.service';
import { CustomerAuthGuard } from './guards/customer-auth.guard';
import { TestingOnlyGuard } from './guards/testing-only.guard';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    CustomerAuthGuard,
    TestingOnlyGuard,
    PhoneAuthRateLimitService,
    PrismaService,
    TwilioVerifyService,
  ],
  exports: [AuthService, TestingOnlyGuard],
})
export class AuthModule {}
