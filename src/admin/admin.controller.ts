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
  StreamableFile,
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
import { AdminPaymentDisputesQueryDto } from './dto/admin-payment-disputes-query.dto';
import { AdminPaymentDisputesListResponseDto } from './dto/admin-payment-disputes-response.dto';
import { AdminPaymentReconciliationQueryDto } from './dto/admin-payment-reconciliation-query.dto';
import {
  AdminPaymentReconciliationListResponseDto,
  AdminPaymentReconciliationRunResponseDto,
} from './dto/admin-payment-reconciliation-response.dto';
import { AdminDriverReviewResponseDto } from './dto/admin-driver-review-response.dto';
import { ReviewDriverRequestDto } from './dto/review-driver-request.dto';
import { RunPaymentReconciliationDto } from './dto/run-payment-reconciliation.dto';
import { createReadStream } from 'node:fs';
import { AdminDeliveryOperationsQueryDto } from './dto/admin-delivery-operations-query.dto';
import { AdminDeliveryOperationsListResponseDto } from './dto/admin-delivery-operations-response.dto';
import {
  AdminChatReportItemDto,
  AdminChatReportsListResponseDto,
  AdminChatReportsQueryDto,
  UpdateAdminChatReportDto,
} from './dto/admin-chat-reports.dto';

@Controller('admin')
@UseGuards(AuthenticatedUserGuard, AdminRoleGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  findAll(): Promise<AdminUserResponseDto[]> {
    return this.adminService.findAll();
  }

  @Get('chat-reports')
  findChatReports(
    @Query() query: AdminChatReportsQueryDto,
  ): Promise<AdminChatReportsListResponseDto> {
    return this.adminService.findChatReports(query);
  }

  @Put('chat-reports/:id')
  updateChatReport(
    @Param('id') id: string,
    @Body() dto: UpdateAdminChatReportDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminChatReportItemDto> {
    return this.adminService.updateChatReport(id, dto, user.id);
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

  @Get('delivery-operations')
  findDeliveryOperations(
    @Query() query: AdminDeliveryOperationsQueryDto,
  ): Promise<AdminDeliveryOperationsListResponseDto> {
    return this.adminService.findDeliveryOperations(query);
  }

  @Get('delivery-operations/proofs/:proofId/view-image')
  async viewDeliveryProof(
    @Param('proofId') proofId: string,
  ): Promise<StreamableFile> {
    const proof = await this.adminService.getDeliveryProofImage(proofId);
    return new StreamableFile(createReadStream(proof.path), {
      type: proof.mimeType,
      disposition: 'inline',
    });
  }

  @Get('payments/disputes')
  findPaymentDisputes(
    @Query() query: AdminPaymentDisputesQueryDto,
  ): Promise<AdminPaymentDisputesListResponseDto> {
    return this.adminService.findPaymentDisputes(query);
  }

  @Get('payments/reconciliation')
  findPaymentReconciliation(
    @Query() query: AdminPaymentReconciliationQueryDto,
  ): Promise<AdminPaymentReconciliationListResponseDto> {
    return this.adminService.findPaymentReconciliation(query);
  }

  @Post('payments/reconciliation/run')
  runPaymentReconciliation(
    @Body() dto: RunPaymentReconciliationDto,
  ): Promise<AdminPaymentReconciliationRunResponseDto> {
    return this.adminService.runPaymentReconciliation(dto);
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

  @Post('driver-reviews/:id/vehicles/:vehicleId/approve')
  approveDriverReviewVehicle(
    @Param('id') id: string,
    @Param('vehicleId') vehicleId: string,
  ): Promise<AdminDriverReviewResponseDto> {
    return this.adminService.approveDriverReviewVehicle(id, vehicleId);
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
