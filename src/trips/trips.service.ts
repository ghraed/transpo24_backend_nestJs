import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DriverEarningStatus,
  DriverStatus,
  Prisma,
  TransportRequestStatus,
  UserRole,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  DeliverItemInput,
  DeliverItemResponse,
  CreateDriverRatingInput,
  CreateDriverRatingResponse,
  DriverStartedDeliveryPayload,
  OfferAcceptedPayload,
  DriverArrivedPickupConfirmedPayload,
  DriverArrivedPickupInput,
  DriverLocationInput,
  DriverLocationUpdatedPayload,
  ItemDeliveredPayload,
  ItemPickedUpPayload,
  JoinTripRoomInput,
  PickupItemInput,
  PickupItemResponse,
  StartDeliveryInput,
  StartDeliveryResponse,
  TripAccessRecord,
  TripStatusUpdatedPayload,
} from './trips.types';

const TRACKABLE_DRIVER_STATUSES: TransportRequestStatus[] = [
  TransportRequestStatus.DRIVER_GOING_TO_PICKUP,
  TransportRequestStatus.DRIVER_GOING_TO_DROPOFF,
];

const TERMINAL_STATUSES: TransportRequestStatus[] = [
  TransportRequestStatus.CANCELLED,
  TransportRequestStatus.DELIVERED,
  TransportRequestStatus.COMPLETED,
];

export const DRIVER_PICKUP_ARRIVAL_RADIUS_METERS = 100;
export const PICKUP_ITEM_RADIUS_METERS = 150;
export const DELIVER_ITEM_RADIUS_METERS = 150;
const PLATFORM_FEE_PERCENTAGE = new Prisma.Decimal(0.1);
const DEFAULT_CURRENCY = 'USD';

@Injectable()
export class TripsService {
  constructor(private readonly prisma: PrismaService) {}

  async joinTripRoom(input: JoinTripRoomInput): Promise<void> {
    const trip = await this.prisma.transportRequest.findUnique({
      where: { id: input.tripId },
      select: { id: true, customerId: true, assignedDriverId: true },
    });

    if (!trip) {
      throw new NotFoundException('Trip not found.');
    }

    if (input.role === UserRole.CUSTOMER && trip.customerId !== input.userId) {
      throw new ForbiddenException(
        'You are not allowed to join this trip room.',
      );
    }

    if (input.role === UserRole.DRIVER) {
      const profile = await this.ensureDriverProfile(input.userId);
      if (trip.assignedDriverId !== profile.id) {
        throw new ForbiddenException(
          'You are not allowed to join this trip room.',
        );
      }
    }
  }

  async mapOfferAcceptedPayload(tripId: string): Promise<OfferAcceptedPayload> {
    const trip = await this.prisma.transportRequest.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        customerId: true,
        assignedDriverId: true,
        acceptedOfferId: true,
        status: true,
        pickupLatitude: true,
        pickupLongitude: true,
        pickupAddress: true,
        dropoffLatitude: true,
        dropoffLongitude: true,
        dropoffAddress: true,
        acceptedOffer: {
          select: {
            price: true,
            currency: true,
          },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException('Trip not found.');
    }

    if (!trip.assignedDriverId) {
      throw new BadRequestException(
        'Assigned driver is missing for this trip.',
      );
    }

    if (
      trip.pickupLatitude === null ||
      trip.pickupLongitude === null ||
      trip.dropoffLatitude === null ||
      trip.dropoffLongitude === null
    ) {
      throw new BadRequestException('Trip location details are incomplete.');
    }

    return {
      tripId: trip.id,
      acceptedOfferId: trip.acceptedOfferId ?? '',
      driverId: trip.assignedDriverId,
      customerId: trip.customerId,
      agreedPrice: trip.acceptedOffer ? Number(trip.acceptedOffer.price) : 0,
      currency: trip.acceptedOffer?.currency ?? 'USD',
      pickupLocation: {
        latitude: trip.pickupLatitude,
        longitude: trip.pickupLongitude,
        address: trip.pickupAddress,
      },
      dropoffLocation: {
        latitude: trip.dropoffLatitude,
        longitude: trip.dropoffLongitude,
        address: trip.dropoffAddress,
      },
      status: trip.status,
    };
  }

  async validateDriverCanAccessTrip(
    driverUserId: string,
    tripId: string,
  ): Promise<TripAccessRecord> {
    const profile = await this.ensureDriverProfile(driverUserId);

    const trip = await this.prisma.transportRequest.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        customerId: true,
        assignedDriverId: true,
        status: true,
      },
    });

    if (!trip) {
      throw new NotFoundException('Trip not found.');
    }

    if (trip.assignedDriverId !== profile.id) {
      throw new ForbiddenException('Trip is not assigned to this driver.');
    }

    return trip;
  }

  async updateDriverLocation(
    input: DriverLocationInput,
  ): Promise<DriverLocationUpdatedPayload> {
    const trip = await this.validateDriverCanAccessTrip(
      input.driverId,
      input.tripId,
    );

    if (TERMINAL_STATUSES.includes(trip.status)) {
      throw new BadRequestException('Trip is already closed.');
    }

    if (!TRACKABLE_DRIVER_STATUSES.includes(trip.status)) {
      throw new BadRequestException(
        'Trip status does not allow live location updates.',
      );
    }

    if (!trip.assignedDriverId) {
      throw new BadRequestException('Trip is missing assigned driver.');
    }

    const location = await this.prisma.driverLocation.create({
      data: {
        driverId: trip.assignedDriverId,
        requestId: trip.id,
        latitude: input.latitude,
        longitude: input.longitude,
        heading: input.heading ?? null,
        speed: input.speed ?? null,
        accuracy: input.accuracy ?? null,
        recordedAt: new Date(),
      },
      select: {
        requestId: true,
        driverId: true,
        latitude: true,
        longitude: true,
        heading: true,
        speed: true,
        accuracy: true,
        recordedAt: true,
      },
    });

    return this.mapDriverLocationUpdatedPayload(location);
  }

  async markDriverArrivedAtPickup(input: DriverArrivedPickupInput): Promise<{
    arrival: DriverArrivedPickupConfirmedPayload;
    status: TripStatusUpdatedPayload;
  }> {
    const trip = await this.validateDriverCanAccessTrip(
      input.driverId,
      input.tripId,
    );

    if (trip.status !== TransportRequestStatus.DRIVER_GOING_TO_PICKUP) {
      throw new BadRequestException(
        'Driver can only mark arrival while going to pickup.',
      );
    }

    const request = await this.prisma.transportRequest.findUnique({
      where: { id: trip.id },
      select: {
        id: true,
        pickupLatitude: true,
        pickupLongitude: true,
        driverArrivedPickupAt: true,
      },
    });

    if (!request) {
      throw new NotFoundException('Trip not found.');
    }

    if (request.driverArrivedPickupAt) {
      throw new BadRequestException(
        'Driver has already marked arrival at pickup.',
      );
    }

    if (request.pickupLatitude === null || request.pickupLongitude === null) {
      throw new BadRequestException('Pickup location is missing.');
    }

    const distanceMeters = this.calculateDistanceMeters(
      { latitude: input.latitude, longitude: input.longitude },
      { latitude: request.pickupLatitude, longitude: request.pickupLongitude },
    );

    if (distanceMeters > DRIVER_PICKUP_ARRIVAL_RADIUS_METERS) {
      throw new BadRequestException(
        'Driver is too far from pickup location to mark arrival.',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedTrip = await tx.transportRequest.update({
        where: { id: trip.id },
        data: {
          status: TransportRequestStatus.DRIVER_ARRIVED_PICKUP,
          driverArrivedPickupAt: new Date(),
        },
        select: {
          id: true,
          assignedDriverId: true,
          status: true,
          driverArrivedPickupAt: true,
          updatedAt: true,
        },
      });

      await tx.driverLocation.create({
        data: {
          driverId: updatedTrip.assignedDriverId as string,
          requestId: updatedTrip.id,
          latitude: input.latitude,
          longitude: input.longitude,
          recordedAt: updatedTrip.driverArrivedPickupAt as Date,
        },
      });

      return updatedTrip;
    });

    return {
      arrival: this.mapDriverArrivedPickupConfirmedPayload(updated),
      status: this.mapTripStatusResponse(
        updated.id,
        updated.status,
        updated.updatedAt,
      ),
    };
  }

  async pickupItem(input: PickupItemInput): Promise<{
    response: PickupItemResponse;
    itemPickedUp: ItemPickedUpPayload;
    status: TripStatusUpdatedPayload;
  }> {
    this.validateTripId(input.tripId);
    const driverProfile = await this.validateDriverCanPickupItem(
      input.driverId,
      input.tripId,
    );
    const trip = await this.validateTripAssignedToDriver(
      input.tripId,
      driverProfile.id,
    );
    if (trip.status === TransportRequestStatus.ITEM_PICKED_UP) {
      throw new BadRequestException('Item pickup has already been confirmed.');
    }
    if (trip.status !== TransportRequestStatus.DRIVER_ARRIVED_PICKUP) {
      throw new BadRequestException(
        'Trip status must be DRIVER_ARRIVED_PICKUP before confirming item pickup.',
      );
    }
    this.validatePickupCoordinates({
      latitude: input.latitude,
      longitude: input.longitude,
      pickupLatitude: trip.pickupLatitude,
      pickupLongitude: trip.pickupLongitude,
    });

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.transportRequest.findUnique({
        where: { id: trip.id },
        select: {
          id: true,
          customerId: true,
          assignedDriverId: true,
          status: true,
          itemPickedUpAt: true,
          pickupNotes: true,
          pickupProofImageUrl: true,
          updatedAt: true,
        },
      });

      if (!current) {
        throw new NotFoundException('Trip not found.');
      }

      if (current.status !== TransportRequestStatus.DRIVER_ARRIVED_PICKUP) {
        throw new BadRequestException(
          'Trip status must be DRIVER_ARRIVED_PICKUP before confirming item pickup.',
        );
      }

      if (current.itemPickedUpAt) {
        throw new BadRequestException(
          'Item pickup has already been confirmed.',
        );
      }

      return tx.transportRequest.update({
        where: { id: current.id },
        data: {
          status: TransportRequestStatus.ITEM_PICKED_UP,
          itemPickedUpAt: now,
          pickupConfirmedByDriver: true,
          pickupNotes: input.notes ?? null,
          pickupProofImageUrl: input.proofImageUrl ?? null,
        },
        select: {
          id: true,
          customerId: true,
          assignedDriverId: true,
          status: true,
          itemPickedUpAt: true,
          pickupNotes: true,
          pickupProofImageUrl: true,
          updatedAt: true,
        },
      });
    });

    return {
      response: this.mapPickupItemResponse(updated),
      itemPickedUp: this.mapItemPickedUpPayload(updated),
      status: this.mapTripStatusUpdatedPayload(
        updated.id,
        updated.status,
        updated.updatedAt,
      ),
    };
  }

  async startDelivery(input: StartDeliveryInput): Promise<{
    response: StartDeliveryResponse;
    startedDelivery: DriverStartedDeliveryPayload;
    status: TripStatusUpdatedPayload;
  }> {
    this.validateTripId(input.tripId);
    const driverProfile = await this.validateDriverCanStartDelivery(
      input.driverId,
      input.tripId,
    );
    const trip = await this.validateTripAssignedToDriver(
      input.tripId,
      driverProfile.id,
    );

    if (trip.status !== TransportRequestStatus.ITEM_PICKED_UP) {
      throw new BadRequestException(
        'Trip status must be ITEM_PICKED_UP before starting delivery.',
      );
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.transportRequest.findUnique({
        where: { id: trip.id },
        select: {
          id: true,
          customerId: true,
          assignedDriverId: true,
          status: true,
          driverGoingToDropoffAt: true,
          dropoffLatitude: true,
          dropoffLongitude: true,
          dropoffAddress: true,
          updatedAt: true,
        },
      });

      if (!current) {
        throw new NotFoundException('Trip not found.');
      }

      if (current.status !== TransportRequestStatus.ITEM_PICKED_UP) {
        throw new BadRequestException(
          'Trip status must be ITEM_PICKED_UP before starting delivery.',
        );
      }

      if (current.driverGoingToDropoffAt) {
        throw new BadRequestException(
          'Delivery has already started for this trip.',
        );
      }

      if (
        current.dropoffLatitude === null ||
        current.dropoffLongitude === null
      ) {
        throw new BadRequestException('Dropoff location is missing.');
      }

      return tx.transportRequest.update({
        where: { id: current.id },
        data: {
          status: TransportRequestStatus.DRIVER_GOING_TO_DROPOFF,
          driverGoingToDropoffAt: now,
        },
        select: {
          id: true,
          customerId: true,
          assignedDriverId: true,
          status: true,
          driverGoingToDropoffAt: true,
          dropoffLatitude: true,
          dropoffLongitude: true,
          dropoffAddress: true,
          updatedAt: true,
        },
      });
    });

    return {
      response: this.mapStartDeliveryResponse(updated),
      startedDelivery: this.mapDriverStartedDeliveryPayload(updated),
      status: this.mapTripStatusUpdatedPayload(
        updated.id,
        updated.status,
        updated.updatedAt,
      ),
    };
  }

  async deliverItem(input: DeliverItemInput): Promise<{
    response: DeliverItemResponse;
    delivered: ItemDeliveredPayload;
    status: TripStatusUpdatedPayload;
  }> {
    this.validateTripId(input.tripId);
    const driverProfile = await this.validateDriverCanDeliverItem(
      input.driverId,
      input.tripId,
    );
    const trip = await this.validateTripAssignedToDriver(
      input.tripId,
      driverProfile.id,
    );

    if (trip.status !== TransportRequestStatus.DRIVER_GOING_TO_DROPOFF) {
      throw new BadRequestException(
        'Trip status must be DRIVER_GOING_TO_DROPOFF before confirming delivery.',
      );
    }

    this.validateDeliveryCoordinates({
      latitude: input.latitude,
      longitude: input.longitude,
      dropoffLatitude: trip.dropoffLatitude,
      dropoffLongitude: trip.dropoffLongitude,
    });

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.transportRequest.findUnique({
        where: { id: trip.id },
        select: {
          id: true,
          customerId: true,
          assignedDriverId: true,
          status: true,
          deliveredAt: true,
          deliveryNotes: true,
          deliveryProofImageUrl: true,
          dropoffLatitude: true,
          dropoffLongitude: true,
          updatedAt: true,
        },
      });

      if (!current) {
        throw new NotFoundException('Trip not found.');
      }

      if (current.status !== TransportRequestStatus.DRIVER_GOING_TO_DROPOFF) {
        throw new BadRequestException(
          'Trip status must be DRIVER_GOING_TO_DROPOFF before confirming delivery.',
        );
      }

      if (current.deliveredAt) {
        throw new BadRequestException('Delivery has already been confirmed.');
      }

      if (
        current.dropoffLatitude === null ||
        current.dropoffLongitude === null
      ) {
        throw new BadRequestException('Dropoff location is missing.');
      }

      const deliveredTrip = await tx.transportRequest.update({
        where: { id: current.id },
        data: {
          status: TransportRequestStatus.DELIVERED,
          deliveredAt: now,
          deliveryConfirmedByDriver: true,
          deliveryNotes: input.notes ?? null,
          deliveryProofImageUrl: input.proofImageUrl ?? null,
        },
        select: {
          id: true,
          customerId: true,
          assignedDriverId: true,
          status: true,
          deliveredAt: true,
          deliveryNotes: true,
          deliveryProofImageUrl: true,
          updatedAt: true,
        },
      });

      await this.createDriverEarningForDeliveredTrip(tx, deliveredTrip.id);
      return deliveredTrip;
    });

    return {
      response: this.mapDeliverItemResponse(updated),
      delivered: this.mapItemDeliveredPayload(updated),
      status: this.mapTripStatusUpdatedPayload(
        updated.id,
        updated.status,
        updated.updatedAt,
      ),
    };
  }

  async createDriverRating(
    input: CreateDriverRatingInput,
  ): Promise<CreateDriverRatingResponse> {
    this.validateTripId(input.tripId);
    this.validateCustomerRatingInput(input.rating, input.comment);

    const created = await this.prisma.$transaction(async (tx) => {
      const trip = await this.validateCustomerCanRateTrip(
        tx,
        input.customerId,
        input.tripId,
      );

      const existingRating = await tx.driverRating.findUnique({
        where: { tripId: trip.id },
        select: { id: true },
      });

      if (existingRating) {
        throw new ConflictException('Trip has already been rated.');
      }

      const rating = await tx.driverRating.create({
        data: {
          tripId: trip.id,
          driverId: trip.assignedDriverId,
          customerId: trip.customerId,
          rating: input.rating,
          comment: input.comment ?? null,
        },
        select: {
          id: true,
          tripId: true,
          driverId: true,
          customerId: true,
          rating: true,
          comment: true,
          createdAt: true,
        },
      });

      await this.recalculateDriverRatingAggregate(tx, trip.assignedDriverId);
      return rating;
    });

    return this.mapCreateDriverRatingResponse(created);
  }

  async createDriverEarningForDeliveredTrip(
    tx: Prisma.TransactionClient,
    tripId: string,
  ): Promise<void> {
    const existing = await tx.driverEarning.findUnique({
      where: { tripId },
      select: { id: true },
    });
    if (existing) {
      return;
    }

    const trip = await tx.transportRequest.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        assignedDriverId: true,
        acceptedOfferId: true,
        finalPrice: true,
        currency: true,
        deliveredAt: true,
        status: true,
      },
    });

    if (!trip) {
      throw new NotFoundException('Trip not found.');
    }
    if (!trip.assignedDriverId) {
      throw new BadRequestException('Trip has no assigned driver.');
    }
    if (!trip.deliveredAt || trip.status !== TransportRequestStatus.DELIVERED) {
      throw new BadRequestException(
        'Trip must be DELIVERED to create earning.',
      );
    }

    const acceptedOffer = trip.acceptedOfferId
      ? await tx.driverOffer.findUnique({
          where: { id: trip.acceptedOfferId },
          select: { price: true, currency: true },
        })
      : null;

    const grossAmount = acceptedOffer?.price ?? trip.finalPrice;
    if (!grossAmount) {
      throw new BadRequestException(
        'Unable to determine trip final amount for earning.',
      );
    }

    const currency =
      acceptedOffer?.currency ?? trip.currency ?? DEFAULT_CURRENCY;
    const amounts = this.calculateDriverEarningAmounts(grossAmount);

    await tx.driverEarning.create({
      data: {
        driverId: trip.assignedDriverId,
        tripId: trip.id,
        grossAmount: amounts.grossAmount,
        platformFeeAmount: amounts.platformFeeAmount,
        netAmount: amounts.netAmount,
        currency,
        status: DriverEarningStatus.AVAILABLE,
        availableAt: trip.deliveredAt,
      },
    });
  }

  calculateDriverEarningAmounts(grossAmount: Prisma.Decimal): {
    grossAmount: Prisma.Decimal;
    platformFeeAmount: Prisma.Decimal;
    netAmount: Prisma.Decimal;
  } {
    const normalizedGross = new Prisma.Decimal(grossAmount).toDecimalPlaces(2);
    const platformFeeAmount = normalizedGross
      .mul(PLATFORM_FEE_PERCENTAGE)
      .toDecimalPlaces(2);
    const netAmount = normalizedGross.sub(platformFeeAmount).toDecimalPlaces(2);
    return {
      grossAmount: normalizedGross,
      platformFeeAmount,
      netAmount,
    };
  }

  async recalculateDriverRatingAggregate(
    tx: Prisma.TransactionClient,
    driverId: string,
  ): Promise<void> {
    const aggregate = await tx.driverRating.aggregate({
      where: { driverId },
      _count: { _all: true },
      _avg: { rating: true },
    });

    const average =
      aggregate._avg.rating === null
        ? null
        : new Prisma.Decimal(aggregate._avg.rating).toDecimalPlaces(2);

    await tx.driverProfile.update({
      where: { id: driverId },
      data: {
        ratingsCount: aggregate._count._all,
        averageRating: average,
      },
    });
  }

  mapCreateDriverRatingResponse(rating: {
    id: string;
    tripId: string;
    driverId: string;
    customerId: string;
    rating: number;
    comment: string | null;
    createdAt: Date;
  }): CreateDriverRatingResponse {
    return {
      id: rating.id,
      tripId: rating.tripId,
      driverId: rating.driverId,
      customerId: rating.customerId,
      rating: rating.rating,
      comment: rating.comment,
      createdAt: rating.createdAt.toISOString(),
    };
  }

  calculateDistanceMeters(
    origin: { latitude: number; longitude: number },
    destination: { latitude: number; longitude: number },
  ): number {
    const earthRadiusMeters = 6371000;
    const lat1 = this.degreesToRadians(origin.latitude);
    const lat2 = this.degreesToRadians(destination.latitude);
    const deltaLat = this.degreesToRadians(
      destination.latitude - origin.latitude,
    );
    const deltaLon = this.degreesToRadians(
      destination.longitude - origin.longitude,
    );

    const a =
      Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
      Math.cos(lat1) *
        Math.cos(lat2) *
        Math.sin(deltaLon / 2) *
        Math.sin(deltaLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusMeters * c;
  }

  mapTripStatusResponse(
    tripId: string,
    status: TransportRequestStatus,
    updatedAt: Date,
  ): TripStatusUpdatedPayload {
    return this.mapTripStatusUpdatedPayload(tripId, status, updatedAt);
  }

  mapTripStatusUpdatedPayload(
    tripId: string,
    status: TransportRequestStatus,
    updatedAt: Date,
  ): TripStatusUpdatedPayload {
    return {
      tripId,
      status,
      updatedAt: updatedAt.toISOString(),
    };
  }

  mapPickupItemResponse(trip: {
    id: string;
    customerId: string;
    assignedDriverId: string | null;
    status: TransportRequestStatus;
    itemPickedUpAt: Date | null;
    pickupNotes: string | null;
    pickupProofImageUrl: string | null;
  }): PickupItemResponse {
    if (!trip.assignedDriverId || !trip.itemPickedUpAt) {
      throw new BadRequestException('Pickup confirmation data is incomplete.');
    }

    return {
      tripId: trip.id,
      driverId: trip.assignedDriverId,
      customerId: trip.customerId,
      status: trip.status,
      pickedUpAt: trip.itemPickedUpAt.toISOString(),
      pickupNotes: trip.pickupNotes,
      pickupProofImageUrl: trip.pickupProofImageUrl,
      nextStep: 'DELIVER_ITEM',
    };
  }

  mapItemPickedUpPayload(trip: {
    id: string;
    customerId: string;
    assignedDriverId: string | null;
    status: TransportRequestStatus;
    itemPickedUpAt: Date | null;
    pickupNotes: string | null;
    pickupProofImageUrl: string | null;
  }): ItemPickedUpPayload {
    if (!trip.assignedDriverId || !trip.itemPickedUpAt) {
      throw new BadRequestException('Pickup event data is incomplete.');
    }

    if (trip.status !== TransportRequestStatus.ITEM_PICKED_UP) {
      throw new BadRequestException('Trip status is not ITEM_PICKED_UP.');
    }

    return {
      tripId: trip.id,
      driverId: trip.assignedDriverId,
      customerId: trip.customerId,
      status: TransportRequestStatus.ITEM_PICKED_UP,
      pickedUpAt: trip.itemPickedUpAt.toISOString(),
      pickupNotes: trip.pickupNotes,
      pickupProofImageUrl: trip.pickupProofImageUrl,
    };
  }

  mapStartDeliveryResponse(trip: {
    id: string;
    customerId: string;
    assignedDriverId: string | null;
    status: TransportRequestStatus;
    driverGoingToDropoffAt: Date | null;
    dropoffLatitude: number | null;
    dropoffLongitude: number | null;
    dropoffAddress: string | null;
  }): StartDeliveryResponse {
    if (
      !trip.assignedDriverId ||
      !trip.driverGoingToDropoffAt ||
      trip.dropoffLatitude === null ||
      trip.dropoffLongitude === null
    ) {
      throw new BadRequestException('Start delivery data is incomplete.');
    }

    if (trip.status !== TransportRequestStatus.DRIVER_GOING_TO_DROPOFF) {
      throw new BadRequestException(
        'Trip status is not DRIVER_GOING_TO_DROPOFF.',
      );
    }

    return {
      tripId: trip.id,
      driverId: trip.assignedDriverId,
      customerId: trip.customerId,
      status: TransportRequestStatus.DRIVER_GOING_TO_DROPOFF,
      dropoffLocation: {
        latitude: trip.dropoffLatitude,
        longitude: trip.dropoffLongitude,
        address: trip.dropoffAddress,
      },
      startedAt: trip.driverGoingToDropoffAt.toISOString(),
      nextStep: 'GO_TO_DROPOFF',
    };
  }

  mapDriverStartedDeliveryPayload(trip: {
    id: string;
    customerId: string;
    assignedDriverId: string | null;
    status: TransportRequestStatus;
    driverGoingToDropoffAt: Date | null;
    dropoffLatitude: number | null;
    dropoffLongitude: number | null;
    dropoffAddress: string | null;
  }): DriverStartedDeliveryPayload {
    const mapped = this.mapStartDeliveryResponse(trip);
    return {
      tripId: mapped.tripId,
      driverId: mapped.driverId,
      customerId: mapped.customerId,
      status: TransportRequestStatus.DRIVER_GOING_TO_DROPOFF,
      dropoffLocation: mapped.dropoffLocation,
      startedAt: mapped.startedAt,
    };
  }

  mapDeliverItemResponse(trip: {
    id: string;
    customerId: string;
    assignedDriverId: string | null;
    status: TransportRequestStatus;
    deliveredAt: Date | null;
    deliveryNotes: string | null;
    deliveryProofImageUrl: string | null;
  }): DeliverItemResponse {
    if (!trip.assignedDriverId || !trip.deliveredAt) {
      throw new BadRequestException(
        'Delivery confirmation data is incomplete.',
      );
    }

    if (trip.status !== TransportRequestStatus.DELIVERED) {
      throw new BadRequestException('Trip status is not DELIVERED.');
    }

    return {
      tripId: trip.id,
      driverId: trip.assignedDriverId,
      customerId: trip.customerId,
      status: TransportRequestStatus.DELIVERED,
      deliveredAt: trip.deliveredAt.toISOString(),
      deliveryNotes: trip.deliveryNotes,
      deliveryProofImageUrl: trip.deliveryProofImageUrl,
      nextStep: 'VIEW_EARNINGS_AND_RATINGS',
    };
  }

  mapItemDeliveredPayload(trip: {
    id: string;
    customerId: string;
    assignedDriverId: string | null;
    status: TransportRequestStatus;
    deliveredAt: Date | null;
    deliveryNotes: string | null;
    deliveryProofImageUrl: string | null;
  }): ItemDeliveredPayload {
    const mapped = this.mapDeliverItemResponse(trip);
    return {
      tripId: mapped.tripId,
      driverId: mapped.driverId,
      customerId: mapped.customerId,
      status: TransportRequestStatus.DELIVERED,
      deliveredAt: mapped.deliveredAt,
      deliveryNotes: mapped.deliveryNotes,
      deliveryProofImageUrl: mapped.deliveryProofImageUrl,
    };
  }

  private mapDriverLocationUpdatedPayload(location: {
    requestId: string | null;
    driverId: string;
    latitude: number;
    longitude: number;
    heading: number | null;
    speed: number | null;
    accuracy: number | null;
    recordedAt: Date;
  }): DriverLocationUpdatedPayload {
    if (!location.requestId) {
      throw new BadRequestException(
        'Trip context is required for location updates.',
      );
    }

    return {
      tripId: location.requestId,
      driverId: location.driverId,
      latitude: location.latitude,
      longitude: location.longitude,
      heading: location.heading,
      speed: location.speed,
      accuracy: location.accuracy,
      recordedAt: location.recordedAt.toISOString(),
    };
  }

  private mapDriverArrivedPickupConfirmedPayload(trip: {
    id: string;
    assignedDriverId: string | null;
    status: TransportRequestStatus;
    driverArrivedPickupAt: Date | null;
  }): DriverArrivedPickupConfirmedPayload {
    if (!trip.assignedDriverId || !trip.driverArrivedPickupAt) {
      throw new BadRequestException('Trip arrival data is incomplete.');
    }

    return {
      tripId: trip.id,
      driverId: trip.assignedDriverId,
      status: trip.status,
      arrivedAt: trip.driverArrivedPickupAt.toISOString(),
    };
  }

  private degreesToRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }

  private validateTripId(tripId: string): void {
    const value = tripId.trim();
    if (!value || value.length < 8 || value.length > 64) {
      throw new BadRequestException('Invalid tripId.');
    }
  }

  private validateCustomerRatingInput(rating: number, comment?: string): void {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException(
        'rating must be an integer between 1 and 5.',
      );
    }
    if (comment && comment.trim().length > 500) {
      throw new BadRequestException('comment must be 500 characters or less.');
    }
  }

  private async validateCustomerCanRateTrip(
    tx: Prisma.TransactionClient,
    customerId: string,
    tripId: string,
  ): Promise<{
    id: string;
    customerId: string;
    assignedDriverId: string;
    status: TransportRequestStatus;
  }> {
    const trip = await tx.transportRequest.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        customerId: true,
        assignedDriverId: true,
        status: true,
      },
    });

    if (!trip) {
      throw new NotFoundException('Trip not found.');
    }
    if (trip.customerId !== customerId) {
      throw new ForbiddenException('You are not allowed to rate this trip.');
    }
    if (!trip.assignedDriverId) {
      throw new BadRequestException('Trip has no assigned driver.');
    }
    if (
      trip.status !== TransportRequestStatus.DELIVERED &&
      trip.status !== TransportRequestStatus.COMPLETED
    ) {
      throw new BadRequestException(
        'Trip must be DELIVERED or COMPLETED before rating.',
      );
    }

    return {
      id: trip.id,
      customerId: trip.customerId,
      assignedDriverId: trip.assignedDriverId,
      status: trip.status,
    };
  }

  private async validateDriverCanPickupItem(
    driverUserId: string,
    tripId: string,
  ): Promise<{ id: string; status: DriverStatus }> {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { userId: driverUserId },
      select: {
        id: true,
        status: true,
      },
    });

    if (!profile) {
      throw new NotFoundException('Driver profile not found.');
    }

    if (
      profile.status === DriverStatus.SUSPENDED ||
      profile.status === DriverStatus.REJECTED
    ) {
      throw new ForbiddenException(
        'Driver is not allowed to confirm item pickup.',
      );
    }

    const trip = await this.prisma.transportRequest.findUnique({
      where: { id: tripId },
      select: { assignedDriverId: true },
    });

    if (
      trip?.assignedDriverId === profile.id &&
      profile.status !== DriverStatus.APPROVED
    ) {
      throw new ForbiddenException(
        'Driver must be approved before confirming item pickup.',
      );
    }

    return profile;
  }

  private async validateDriverCanStartDelivery(
    driverUserId: string,
    tripId: string,
  ): Promise<{ id: string; status: DriverStatus }> {
    return this.validateDriverCanPickupItem(driverUserId, tripId);
  }

  private async validateDriverCanDeliverItem(
    driverUserId: string,
    tripId: string,
  ): Promise<{ id: string; status: DriverStatus }> {
    return this.validateDriverCanPickupItem(driverUserId, tripId);
  }

  private async validateTripAssignedToDriver(
    tripId: string,
    driverProfileId: string,
  ): Promise<{
    id: string;
    status: TransportRequestStatus;
    pickupLatitude: number | null;
    pickupLongitude: number | null;
    dropoffLatitude: number | null;
    dropoffLongitude: number | null;
  }> {
    const trip = await this.prisma.transportRequest.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        assignedDriverId: true,
        status: true,
        pickupLatitude: true,
        pickupLongitude: true,
        dropoffLatitude: true,
        dropoffLongitude: true,
      },
    });

    if (!trip) {
      throw new NotFoundException('Trip not found.');
    }

    if (trip.assignedDriverId !== driverProfileId) {
      throw new ForbiddenException('Trip is not assigned to this driver.');
    }

    if (TERMINAL_STATUSES.includes(trip.status)) {
      throw new BadRequestException('Trip is already closed.');
    }

    return {
      id: trip.id,
      status: trip.status,
      pickupLatitude: trip.pickupLatitude,
      pickupLongitude: trip.pickupLongitude,
      dropoffLatitude: trip.dropoffLatitude,
      dropoffLongitude: trip.dropoffLongitude,
    };
  }

  private validatePickupCoordinates(input: {
    latitude?: number;
    longitude?: number;
    pickupLatitude: number | null;
    pickupLongitude: number | null;
  }): void {
    if (input.latitude === undefined && input.longitude === undefined) {
      return;
    }

    if (input.latitude === undefined || input.longitude === undefined) {
      throw new BadRequestException(
        'Both latitude and longitude are required when providing pickup coordinates.',
      );
    }

    if (
      input.latitude < -90 ||
      input.latitude > 90 ||
      input.longitude < -180 ||
      input.longitude > 180
    ) {
      throw new BadRequestException('Coordinates are invalid.');
    }

    if (input.pickupLatitude === null || input.pickupLongitude === null) {
      return;
    }

    const distanceMeters = this.calculateDistanceMeters(
      { latitude: input.latitude, longitude: input.longitude },
      { latitude: input.pickupLatitude, longitude: input.pickupLongitude },
    );

    if (distanceMeters > PICKUP_ITEM_RADIUS_METERS) {
      throw new BadRequestException(
        'Driver is too far from pickup location to confirm item pickup.',
      );
    }
  }

  private validateDeliveryCoordinates(input: {
    latitude?: number;
    longitude?: number;
    dropoffLatitude: number | null;
    dropoffLongitude: number | null;
  }): void {
    if (input.latitude === undefined && input.longitude === undefined) {
      return;
    }

    if (input.latitude === undefined || input.longitude === undefined) {
      throw new BadRequestException(
        'Both latitude and longitude are required when providing delivery coordinates.',
      );
    }

    if (
      input.latitude < -90 ||
      input.latitude > 90 ||
      input.longitude < -180 ||
      input.longitude > 180
    ) {
      throw new BadRequestException('Coordinates are invalid.');
    }

    if (input.dropoffLatitude === null || input.dropoffLongitude === null) {
      throw new BadRequestException('Dropoff location is missing.');
    }

    const distanceMeters = this.calculateDistanceMeters(
      { latitude: input.latitude, longitude: input.longitude },
      { latitude: input.dropoffLatitude, longitude: input.dropoffLongitude },
    );

    if (distanceMeters > DELIVER_ITEM_RADIUS_METERS) {
      throw new BadRequestException(
        'Driver is too far from dropoff location to confirm delivery.',
      );
    }
  }

  private async ensureDriverProfile(userId: string): Promise<{ id: string }> {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!profile) {
      throw new NotFoundException('Driver profile not found.');
    }

    return profile;
  }
}
