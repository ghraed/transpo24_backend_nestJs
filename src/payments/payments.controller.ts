import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Logger,
  Param,
  Post,
  Req,
  UseGuards,
  forwardRef,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Request } from 'express';

import { CustomerAuthGuard } from '../auth/guards/customer-auth.guard';
import { CustomerRequestsService } from '../customer-requests/customer-requests.service';
import { TripsGateway } from '../trips/trips.gateway';
import { ApproveAdditionalChargeDto } from './dto/approve-additional-charge.dto';
import { CreateWalletTopUpDto } from './dto/create-wallet-top-up.dto';
import {
  AdditionalChargeResponseDto,
  CancelTripPaymentResponseDto,
  CustomerWalletSummaryDto,
  CustomerWalletTopUpResponseDto,
  PaymentSummaryDto,
  SavedPaymentMethodSummaryDto,
} from './dto/request-payment.dto';
import { SaveDefaultPaymentMethodDto } from './dto/save-default-payment-method.dto';
import { PaymentsService } from './payments.service';

type AuthenticatedRequest = Request & {
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
  };
};

@Controller()
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly tripsGateway: TripsGateway,
    @Inject(forwardRef(() => CustomerRequestsService))
    private readonly customerRequestsService: CustomerRequestsService,
  ) {}

  @Get('customer/requests/:requestId/payment')
  @UseGuards(CustomerAuthGuard)
  async getRequestPayment(
    @Req() request: AuthenticatedRequest,
    @Param('requestId') requestId: string,
  ): Promise<PaymentSummaryDto> {
    const payment = await this.paymentsService.getRequestPayment({
      customerId: request.user.id,
      requestId,
    });

    if (payment.status === 'PAYMENT_CAPTURED') {
      try {
        await this.customerRequestsService.finalizeAcceptedOfferPayment({
          customerId: request.user.id,
          requestId,
        });
      } catch (error) {
        this.logger.error(
          `Failed to auto-finalize captured payment for request ${requestId}.`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    return payment;
  }

  @Post('customer/requests/:requestId/payment/cancel')
  @UseGuards(CustomerAuthGuard)
  async cancelRequestPayment(
    @Req() request: AuthenticatedRequest,
    @Param('requestId') requestId: string,
  ): Promise<PaymentSummaryDto> {
    const payment = await this.paymentsService.cancelRequestPayment({
      customerId: request.user.id,
      requestId,
    });

    this.tripsGateway.emitPaymentCancelled(payment.customerId, payment);
    return payment;
  }

  @Post('customer/requests/:requestId/cancel')
  @UseGuards(CustomerAuthGuard)
  async cancelCollectedTrip(
    @Req() request: AuthenticatedRequest,
    @Param('requestId') requestId: string,
  ): Promise<CancelTripPaymentResponseDto> {
    const result = await this.paymentsService.cancelCollectedTrip({
      customerId: request.user.id,
      requestId,
    });

    return result;
  }

  @Get('customer/payment-method/default')
  @UseGuards(CustomerAuthGuard)
  async getDefaultPaymentMethod(
    @Req() request: AuthenticatedRequest,
  ): Promise<SavedPaymentMethodSummaryDto | null> {
    return this.paymentsService.getCustomerDefaultPaymentMethodSummary({
      customerId: request.user.id,
    });
  }

  @Post('customer/payment-method/default')
  @UseGuards(CustomerAuthGuard)
  async saveDefaultPaymentMethod(
    @Req() request: AuthenticatedRequest,
    @Body() dto: SaveDefaultPaymentMethodDto,
  ): Promise<SavedPaymentMethodSummaryDto> {
    return this.paymentsService.saveCustomerDefaultPaymentMethod({
      customerId: request.user.id,
      stripePaymentMethodId: dto.stripePaymentMethodId,
    });
  }

  @Get('customer/wallet')
  @UseGuards(CustomerAuthGuard)
  async getCustomerWallet(
    @Req() request: AuthenticatedRequest,
  ): Promise<CustomerWalletSummaryDto> {
    return this.paymentsService.getCustomerWalletSummary({
      customerId: request.user.id,
    });
  }

  @Post('customer/wallet/top-ups')
  @UseGuards(CustomerAuthGuard)
  async createCustomerWalletTopUp(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateWalletTopUpDto,
  ): Promise<CustomerWalletTopUpResponseDto> {
    return this.paymentsService.createCustomerWalletTopUp({
      customerId: request.user.id,
      amount: dto.amount,
      currency: dto.currency,
      paymentMethod: dto.paymentMethod,
    });
  }

  @Get('customer/wallet/top-ups/:topUpId')
  @UseGuards(CustomerAuthGuard)
  async getCustomerWalletTopUp(
    @Req() request: AuthenticatedRequest,
    @Param('topUpId') topUpId: string,
  ): Promise<CustomerWalletTopUpResponseDto> {
    return this.paymentsService.getCustomerWalletTopUp({
      customerId: request.user.id,
      topUpId,
    });
  }

  @Get('customer/requests/:requestId/additional-charges')
  @UseGuards(CustomerAuthGuard)
  async getRequestAdditionalCharges(
    @Req() request: AuthenticatedRequest,
    @Param('requestId') requestId: string,
  ): Promise<AdditionalChargeResponseDto[]> {
    return this.paymentsService.getRequestAdditionalCharges({
      customerId: request.user.id,
      requestId,
    });
  }

  @Post('customer/requests/:requestId/additional-charges/:chargeId/approve')
  @UseGuards(CustomerAuthGuard)
  async approveAdditionalCharge(
    @Req() request: AuthenticatedRequest,
    @Param('requestId') requestId: string,
    @Param('chargeId') chargeId: string,
    @Body() dto: ApproveAdditionalChargeDto,
  ): Promise<AdditionalChargeResponseDto> {
    const charge = await this.paymentsService.approveAdditionalCharge({
      customerId: request.user.id,
      requestId,
      chargeId,
      confirmationLocale: dto.confirmationLocale,
      confirmationText: dto.confirmationText,
      paymentOption: dto.paymentOption,
    });

    this.tripsGateway.emitAdditionalChargeAdded(charge.customerId, charge);
    return charge;
  }

  @Post('webhooks/stripe')
  async handleStripeWebhook(
    @Req() request: Request & { body: Buffer },
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<{ received: true; type: string }> {
    if (!signature?.trim()) {
      throw new BadRequestException('Missing Stripe signature.');
    }

    return this.paymentsService.handleStripeWebhook(request.body, signature);
  }
}
