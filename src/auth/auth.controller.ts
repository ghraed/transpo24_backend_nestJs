import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RegisterDriverResponseDto } from './dto/register-driver-response.dto';
import { RegisterDriverDto } from './dto/register-driver.dto';
import { RegisterResponseDto } from './dto/register-response.dto';
import { RegisterDto } from './dto/register.dto';
import { PhoneAuthResponseDto } from './dto/phone-auth-response.dto';
import { RefreshSessionDto } from './dto/refresh-session.dto';
import { SendPhoneCodeDto } from './dto/send-phone-code.dto';
import { VerifyPhoneCodeDto } from './dto/verify-phone-code.dto';
import { CompleteCustomerProfileDto } from './dto/complete-customer-profile.dto';
import { CustomerAuthGuard } from './guards/customer-auth.guard';
import type { AuthenticatedRequest } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto): Promise<RegisterResponseDto> {
    return this.authService.register(dto);
  }

  @Post('driver/register')
  registerDriver(
    @Body() dto: RegisterDriverDto,
  ): Promise<RegisterDriverResponseDto> {
    return this.authService.registerDriver(dto);
  }

  @Post('driver/login')
  loginDriver(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.authService.loginDriver(dto);
  }

  @Post('driver/phone/send-code')
  sendDriverPhoneCode(
    @Body() dto: SendPhoneCodeDto,
    @Req() request: Request,
  ): Promise<{ success: true; message: string }> {
    return this.authService.sendDriverPhoneCode(dto, request.ip || 'unknown');
  }

  @Post('driver/phone/verify-code')
  verifyDriverPhoneCode(
    @Body() dto: VerifyPhoneCodeDto,
    @Req() request: Request,
  ): Promise<LoginResponseDto> {
    return this.authService.verifyDriverPhoneCode(dto, request.ip || 'unknown');
  }

  @Post('login')
  login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.authService.login(dto);
  }

  @Post('admin/login')
  loginAdmin(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.authService.loginAdmin(dto);
  }

  @Post('testing/reset-users')
  resetUsersForTesting(): Promise<{ deletedUsers: number; keptEmail: string }> {
    return this.authService.resetUsersForTesting();
  }

  @Post('testing/reset-drivers')
  resetDriversForTesting(): Promise<{
    deletedDrivers: number;
    keptEmail: string;
  }> {
    return this.authService.resetDriversForTesting();
  }

  @Post('phone/send-code')
  sendPhoneCode(
    @Body() dto: SendPhoneCodeDto,
    @Req() request: Request,
  ): Promise<{ success: true; message: string }> {
    return this.authService.sendPhoneCode(dto, request.ip || 'unknown');
  }

  @Post('phone/verify-code')
  verifyPhoneCode(
    @Body() dto: VerifyPhoneCodeDto,
    @Req() request: Request,
  ): Promise<PhoneAuthResponseDto> {
    return this.authService.verifyPhoneCode(dto, request.ip || 'unknown');
  }

  @Post('refresh')
  refreshSession(
    @Body() dto: RefreshSessionDto,
  ): Promise<PhoneAuthResponseDto> {
    return this.authService.refreshCustomerSession(dto.refreshToken);
  }

  @Post('logout')
  logout(@Body() dto: RefreshSessionDto): Promise<{ success: true }> {
    return this.authService.logoutCustomer(dto.refreshToken);
  }

  @UseGuards(CustomerAuthGuard)
  @Post('phone/complete-profile')
  completeCustomerProfile(
    @Body() dto: CompleteCustomerProfileDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ success: true; name: string }> {
    return this.authService.completeCustomerProfile(request.user.id, dto.name);
  }
}
