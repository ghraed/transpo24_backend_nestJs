import {
  BadRequestException,
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
import { PaymentsService } from './payments.service';
import { PaymentSummaryDto } from './dto/request-payment.dto';

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

    if (
      payment.status === 'PAYMENT_HELD' ||
      payment.status === 'PAYMENT_CAPTURE_PENDING' ||
      payment.status === 'PAYMENT_CAPTURED'
    ) {
      try {
        await this.customerRequestsService.finalizeAcceptedOfferPayment({
          customerId: request.user.id,
          requestId,
        });
      } catch (error) {
        this.logger.error(
          `Failed to auto-finalize successful payment hold for request ${requestId}.`,
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

  @Post('customer/requests/:requestId/payment/capture')
  @UseGuards(CustomerAuthGuard)
  async captureRequestPayment(
    @Req() request: AuthenticatedRequest,
    @Param('requestId') requestId: string,
  ): Promise<PaymentSummaryDto> {
    const payment = await this.paymentsService.captureRequestPayment({
      customerId: request.user.id,
      requestId,
    });

    this.tripsGateway.emitPaymentCaptured(payment.customerId, payment);
    return payment;
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
