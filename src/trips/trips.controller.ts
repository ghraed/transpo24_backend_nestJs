import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Request } from 'express';

import { CustomerAuthGuard } from '../auth/guards/customer-auth.guard';
import { AcceptDriverOfferDto } from '../customer-requests/dto/accept-driver-offer.dto';
import { CustomerAcceptOfferResponseDto } from '../customer-requests/dto/customer-accept-offer-response.dto';
import { CustomerRequestsService } from '../customer-requests/customer-requests.service';
import {
  CreateDriverRatingDto,
  TripIdParamDto,
} from './dto/create-driver-rating.dto';
import { TripsGateway } from './trips.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { TripsService } from './trips.service';
import { CreateDriverRatingResponse } from './trips.types';

type AuthenticatedRequest = Request & {
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
  };
};

@Controller('trips')
@UseGuards(CustomerAuthGuard)
export class TripsController {
  constructor(
    private readonly customerRequestsService: CustomerRequestsService,
    private readonly tripsGateway: TripsGateway,
    private readonly tripsService: TripsService,
  ) {}

  @Post(':tripId/offers/:offerId/accept')
  async acceptDriverOffer(
    @Req() request: AuthenticatedRequest,
    @Param('tripId') tripId: string,
    @Param('offerId') offerId: string,
    @Body() dto: AcceptDriverOfferDto,
  ): Promise<CustomerAcceptOfferResponseDto> {
    const accepted = await this.customerRequestsService.acceptDriverOffer({
      customerId: request.user.id,
      requestId: tripId,
      offerId,
      confirm: dto.confirm ?? true,
      paymentMethod: dto.paymentMethod,
      stripePaymentMethodId: dto.stripePaymentMethodId,
    });

    if (accepted.nextStep !== 'TRACK_REQUEST' || !accepted.request.acceptedAt) {
      return accepted;
    }

    const offerAcceptedPayload =
      await this.tripsService.mapOfferAcceptedPayload(tripId);
    const tripStatusPayload = this.tripsService.mapTripStatusResponse(
      tripId,
      accepted.request.status,
      new Date(accepted.request.acceptedAt),
    );

    this.tripsGateway.emitOfferAccepted(
      offerAcceptedPayload,
      tripStatusPayload,
    );

    return accepted;
  }
}

@Controller('customer/trips')
@UseGuards(CustomerAuthGuard)
export class CustomerTripsController {
  constructor(
    private readonly tripsService: TripsService,
    private readonly paymentsService: PaymentsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Get('pending-delivery-confirmations')
  async pendingDeliveries(@Req() request: AuthenticatedRequest) {
    return this.tripsService.listPendingDeliveryConfirmations(request.user.id);
  }

  @Post(':tripId/confirm-delivery')
  async confirmDelivery(
    @Req() request: AuthenticatedRequest,
    @Param() params: TripIdParamDto,
  ) {
    const result = await this.tripsService.confirmCustomerDelivery(
      request.user.id,
      params.tripId,
    );
    await this.notificationsService.notifyCustomerTripUpdate(
      params.tripId,
      'CUSTOMER_DELIVERY_CONFIRMED',
    );
    await this.paymentsService.queueDriverPayoutForTrip(params.tripId);
    return result;
  }

  @Post(':tripId/rating')
  async rateDriver(
    @Req() request: AuthenticatedRequest,
    @Param() params: TripIdParamDto,
    @Body() dto: CreateDriverRatingDto,
  ): Promise<CreateDriverRatingResponse> {
    return this.tripsService.createDriverRating({
      customerId: request.user.id,
      tripId: params.tripId,
      rating: dto.rating,
      comment: dto.comment?.trim(),
    });
  }
}
