import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Put,
  UseGuards,
} from '@nestjs/common';

import { AdminService } from './admin.service';
import { AuthenticatedUserGuard } from '../auth/guards/authenticated-user.guard';
import { AdminRoleGuard } from './guards/admin-role.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { AdminUserResponseDto } from './dto/admin-user-response.dto';
import {
  AdminDriverEarningItemDto,
  AdminDriverEarningsListResponseDto,
} from './dto/admin-driver-earnings-response.dto';
import { AdminDriverEarningsQueryDto } from './dto/admin-driver-earnings-query.dto';
import { AdminDriverReviewResponseDto } from './dto/admin-driver-review-response.dto';
import { ReviewDriverRequestDto } from './dto/review-driver-request.dto';

@Controller('admin')
@UseGuards(AuthenticatedUserGuard, AdminRoleGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  findAll(): Promise<AdminUserResponseDto[]> {
    return this.adminService.findAll();
  }

  @Get('users/:id')
  findById(@Param('id') id: string): Promise<AdminUserResponseDto> {
    return this.adminService.findById(id);
  }

  @Post('users')
  create(@Body() dto: CreateAdminUserDto): Promise<AdminUserResponseDto> {
    return this.adminService.create(dto);
  }

  @Put('users/:id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAdminUserDto,
  ): Promise<AdminUserResponseDto> {
    return this.adminService.update(id, dto);
  }

  @Post('users/:id/reactivate')
  reactivate(@Param('id') id: string): Promise<AdminUserResponseDto> {
    return this.adminService.reactivate(id);
  }

  @Get('driver-reviews')
  findDriverReviews(): Promise<AdminDriverReviewResponseDto[]> {
    return this.adminService.findDriverReviews();
  }

  @Get('driver-reviews/:id')
  findDriverReviewById(
    @Param('id') id: string,
  ): Promise<AdminDriverReviewResponseDto> {
    return this.adminService.findDriverReviewById(id);
  }

  @Get('driver-earnings')
  findDriverEarnings(
    @Query() query: AdminDriverEarningsQueryDto,
  ): Promise<AdminDriverEarningsListResponseDto> {
    return this.adminService.findDriverEarnings(query);
  }

  @Post('driver-earnings/:tripId/retry-payout')
  retryDriverPayout(
    @Param('tripId') tripId: string,
  ): Promise<AdminDriverEarningItemDto> {
    return this.adminService.retryDriverPayout(tripId);
  }

  @Post('driver-reviews/:id/approve')
  approveDriverReview(
    @Param('id') id: string,
  ): Promise<AdminDriverReviewResponseDto> {
    return this.adminService.approveDriverReview(id);
  }

  @Post('driver-reviews/:id/decline')
  declineDriverReview(
    @Param('id') id: string,
    @Body() dto: ReviewDriverRequestDto,
  ): Promise<AdminDriverReviewResponseDto> {
    return this.adminService.declineDriverReview(id, dto.reason);
  }

  @Delete('users/:id')
  async softDelete(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ success: boolean }> {
    await this.adminService.softDelete(id, user.id);
    return { success: true };
  }
}
