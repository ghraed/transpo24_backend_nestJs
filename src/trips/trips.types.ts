import {
  DriverEarningStatus,
  DriverOfferStatus,
  DriverStatus,
  TransportRequestStatus,
  UserRole,
} from '@prisma/client';
import type { CustomerRequestOfferSummaryDto } from '../customer-requests/dto/customer-request-offers.dto';
import type { CustomerAcceptOfferResponseDto } from '../customer-requests/dto/customer-accept-offer-response.dto';
import type { DriverRequestAlertSummaryDto } from '../driver/dto/driver-request-alert.dto';

export type TripUserRole = UserRole;

export type AcceptDriverOfferInput = {
  customerId: string;
  tripId: string;
  offerId: string;
};

export type JoinTripRoomInput = {
  userId: string;
  role: TripUserRole;
  tripId: string;
};

export type DriverLocationInput = {
  driverId: string;
  tripId: string;
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
  accuracy?: number;
};

export type DriverArrivedPickupInput = {
  driverId: string;
  tripId: string;
  latitude: number;
  longitude: number;
};

export type PickupItemInput = {
  driverId: string;
  tripId: string;
  latitude?: number;
  longitude?: number;
  notes?: string;
  proofImageUrl?: string;
};

export type StartDeliveryInput = {
  driverId: string;
  tripId: string;
};

export type DeliverItemInput = {
  driverId: string;
  tripId: string;
  latitude?: number;
  longitude?: number;
  notes?: string;
  proofImageUrl?: string;
};

export type OfferAcceptedPayload = {
  tripId: string;
  acceptedOfferId: string;
  driverId: string;
  customerId: string;
  agreedPrice: number;
  currency: string;
  pickupLocation: {
    latitude: number;
    longitude: number;
    address: string | null;
  };
  dropoffLocation: {
    latitude: number;
    longitude: number;
    address: string | null;
  };
  status: TransportRequestStatus;
};

export type RequestNewPayload = DriverRequestAlertSummaryDto;

export type OfferNewPayload = {
  requestId: string;
  requestStatus: TransportRequestStatus;
  offer: CustomerRequestOfferSummaryDto;
};

export type OfferRejectedPayload = {
  requestId: string;
  offerId: string;
  driverId: string;
  status: DriverOfferStatus;
  rejectedAt: string;
};

export type RequestDriverSelectedPayload = CustomerAcceptOfferResponseDto;

export type TripStatusUpdatedPayload = {
  tripId: string;
  status: TransportRequestStatus;
  updatedAt: string;
};

export type DriverLocationUpdatedPayload = {
  tripId: string;
  driverId: string;
  latitude: number;
  longitude: number;
  heading: number | null;
  speed: number | null;
  accuracy: number | null;
  recordedAt: string;
};

export type DriverArrivedPickupConfirmedPayload = {
  tripId: string;
  driverId: string;
  status: TransportRequestStatus;
  arrivedAt: string;
};

export type PickupItemResponse = {
  tripId: string;
  driverId: string;
  customerId: string;
  status: TransportRequestStatus;
  pickedUpAt: string;
  pickupNotes: string | null;
  pickupProofImageUrl: string | null;
  nextStep: 'DELIVER_ITEM';
};

export type ItemPickedUpPayload = {
  tripId: string;
  driverId: string;
  customerId: string;
  status: 'ITEM_PICKED_UP';
  pickedUpAt: string;
  pickupNotes: string | null;
  pickupProofImageUrl: string | null;
};

export type StartDeliveryResponse = {
  tripId: string;
  driverId: string;
  customerId: string;
  status: 'DRIVER_GOING_TO_DROPOFF';
  dropoffLocation: {
    latitude: number;
    longitude: number;
    address: string | null;
  };
  startedAt: string;
  nextStep: 'GO_TO_DROPOFF';
};

export type DeliverItemResponse = {
  tripId: string;
  driverId: string;
  customerId: string;
  status: 'DELIVERED';
  deliveredAt: string;
  deliveryNotes: string | null;
  deliveryProofImageUrl: string | null;
  nextStep: 'VIEW_EARNINGS_AND_RATINGS';
};

export type DriverStartedDeliveryPayload = {
  tripId: string;
  driverId: string;
  customerId: string;
  status: 'DRIVER_GOING_TO_DROPOFF';
  dropoffLocation: {
    latitude: number;
    longitude: number;
    address: string | null;
  };
  startedAt: string;
};

export type ItemDeliveredPayload = {
  tripId: string;
  driverId: string;
  customerId: string;
  status: 'DELIVERED';
  deliveredAt: string;
  deliveryNotes: string | null;
  deliveryProofImageUrl: string | null;
};

export type TripAccessRecord = {
  id: string;
  customerId: string;
  assignedDriverId: string | null;
  status: TransportRequestStatus;
};

export type OfferValidationRecord = {
  id: string;
  requestId: string;
  driverId: string;
  status: DriverOfferStatus;
  expiresAt: Date | null;
  acceptedAt: Date | null;
  rejectedAt: Date | null;
  cancelledAt: Date | null;
};

export type DriverEligibility = {
  id: string;
  status: DriverStatus;
  isProfileCompleted: boolean;
  vehicles: Array<{ id: string }>;
  availability: { isOnline: boolean } | null;
};

export type DateRangeQuery = {
  from?: string;
  to?: string;
};

export type PaginationQuery = {
  page: number;
  limit: number;
};

export type DriverEarningStatusType = DriverEarningStatus;

export type DriverEarningsSummaryInput = DateRangeQuery & {
  driverId: string;
};

export type DriverEarningsListInput = DateRangeQuery &
  PaginationQuery & {
    driverId: string;
    status?: DriverEarningStatusType;
  };

export type DriverRatingsListInput = PaginationQuery & {
  driverId: string;
  rating?: number;
};

export type CreateDriverRatingInput = {
  customerId: string;
  tripId: string;
  rating: number;
  comment?: string;
};

export type DriverEarningsSummaryResponse = {
  currency: string;
  totalGross: number;
  totalPlatformFees: number;
  totalNet: number;
  pendingAmount: number;
  availableAmount: number;
  paidOutAmount: number;
  completedTripsCount: number;
  averageRating: number | null;
  ratingsCount: number;
};

export type DriverEarningItemResponse = {
  id: string;
  tripId: string;
  grossAmount: number;
  platformFeeAmount: number;
  netAmount: number;
  currency: string;
  status: DriverEarningStatusType;
  createdAt: string;
  availableAt: string | null;
  paidOutAt: string | null;
};

export type DriverRatingItemResponse = {
  id: string;
  tripId: string;
  rating: number;
  comment: string | null;
  customerName: string | null;
  createdAt: string;
};

export type PaginatedResponse<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type CreateDriverRatingResponse = {
  id: string;
  tripId: string;
  driverId: string;
  customerId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
};
