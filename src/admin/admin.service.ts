import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import {
  AdditionalChargeStatus,
  CustomerWalletTopUpStatus,
  DocumentStatus,
  DriverDocumentType,
  DriverEarningStatus,
  DriverPayoutState,
  DriverStatus,
  DriverVehicleReviewStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
  Prisma,
  TripPaymentSettlementStatus,
  UserRole,
  VehicleType,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { hashPassword } from '../common/security/password.util';
import { AdminDriverEarningsQueryDto } from './dto/admin-driver-earnings-query.dto';
import {
  type AdminDriverEarningsView,
  AdminDriverEarningItemDto,
  AdminDriverEarningsListResponseDto,
  AdminDriverEarningSummaryDto,
} from './dto/admin-driver-earnings-response.dto';
import { AdminPaymentDisputesQueryDto } from './dto/admin-payment-disputes-query.dto';
import {
  type AdminPaymentDisputeRecordType,
  AdminPaymentDisputeItemDto,
  AdminPaymentDisputesListResponseDto,
  AdminPaymentDisputeSummaryDto,
} from './dto/admin-payment-disputes-response.dto';
import { AdminPaymentReconciliationQueryDto } from './dto/admin-payment-reconciliation-query.dto';
import {
  type AdminPaymentReconciliationStatus as AdminPaymentReconciliationStatusFilter,
  type AdminPaymentReconciliationStream as AdminPaymentReconciliationStreamFilter,
  AdminPaymentReconciliationItemDto,
  AdminPaymentReconciliationJobRunDto,
  AdminPaymentReconciliationListResponseDto,
  AdminPaymentReconciliationRunResponseDto,
  AdminPaymentReconciliationSummaryDto,
} from './dto/admin-payment-reconciliation-response.dto';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { AdminUserResponseDto } from './dto/admin-user-response.dto';
import {
  AdminDriverReviewDocumentDto,
  AdminDriverReviewResponseDto,
  AdminDriverReviewVehicleDto,
} from './dto/admin-driver-review-response.dto';
import { RunPaymentReconciliationDto } from './dto/run-payment-reconciliation.dto';
import { AdminDeliveryOperationsQueryDto } from './dto/admin-delivery-operations-query.dto';
import {
  AdminDeliveryOperationsItemDto,
  AdminDeliveryOperationsListResponseDto,
  AdminDeliveryOperationsOfferDto,
  AdminDeliveryOperationsPartyDto,
  AdminDeliveryOperationsPhotoDto,
  AdminDeliveryOperationsSummaryDto,
} from './dto/admin-delivery-operations-response.dto';

const DRIVER_ONBOARDING_REQUIRED_DOCUMENT_TYPES: DriverDocumentType[] = [
  DriverDocumentType.PERSONAL_SELFIE,
  DriverDocumentType.ID_FRONT,
  DriverDocumentType.ID_BACK,
  DriverDocumentType.DRIVING_LICENSE,
];

const DRIVER_CANONICAL_VEHICLE_DOCUMENT_TYPES: DriverDocumentType[] = [
  DriverDocumentType.VEHICLE_FRONT_PHOTO,
  DriverDocumentType.VEHICLE_REAR_PHOTO,
  DriverDocumentType.VEHICLE_SIDE_PHOTO,
  DriverDocumentType.VEHICLE_LICENSE_PLATE_PHOTO,
  DriverDocumentType.VEHICLE_REGISTRATION_FRONT,
  DriverDocumentType.VEHICLE_REGISTRATION_BACK,
  DriverDocumentType.VEHICLE_INSURANCE_DOCUMENT,
];

const PaymentReconciliationStream = {
  WALLET: 'WALLET',
  CAPTURE: 'CAPTURE',
  REFUND: 'REFUND',
  TRANSFER: 'TRANSFER',
} as const;

type PaymentReconciliationStream =
  (typeof PaymentReconciliationStream)[keyof typeof PaymentReconciliationStream];

const PaymentReconciliationStatus = {
  MATCHED: 'MATCHED',
  MISMATCH: 'MISMATCH',
  MISSING: 'MISSING',
  FAILED: 'FAILED',
} as const;

type PaymentReconciliationStatus =
  (typeof PaymentReconciliationStatus)[keyof typeof PaymentReconciliationStatus];

const PaymentReconciliationRunStatus = {
  SUCCESS: 'SUCCESS',
  PARTIAL: 'PARTIAL',
  FAILED: 'FAILED',
  RUNNING: 'RUNNING',
} as const;

type PaymentReconciliationRunStatus =
  (typeof PaymentReconciliationRunStatus)[keyof typeof PaymentReconciliationRunStatus];

const PAYMENT_RECONCILIATION_STREAMS: PaymentReconciliationStream[] = [
  PaymentReconciliationStream.WALLET,
  PaymentReconciliationStream.CAPTURE,
  PaymentReconciliationStream.REFUND,
  PaymentReconciliationStream.TRANSFER,
];

const ADDITIONAL_CHARGE_APP_FEE_PERCENTAGE = new Prisma.Decimal('0.10');

type PaymentReconciliationRecordDraft = {
  stream: PaymentReconciliationStream;
  status: PaymentReconciliationStatus;
  currency: string;
  expectedAmount: Prisma.Decimal | null;
  actualAmount: Prisma.Decimal | null;
  deltaAmount: Prisma.Decimal | null;
  reference: string | null;
  externalReference: string | null;
  tripId: string | null;
  walletTopUpId: string | null;
  transferId: string | null;
  refundId: string | null;
  captureId: string | null;
  customerId: string | null;
  driverId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  driverName: string | null;
  driverEmail: string | null;
  reason: string | null;
  resolvedAt: Date | null;
};

type PaymentReconciliationRunRow = {
  id: string;
  stream: PaymentReconciliationStream;
  status: PaymentReconciliationRunStatus;
  scannedCount: number;
  matchedCount: number;
  mismatchCount: number;
  missingCount: number;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type PaymentReconciliationRecordRow = {
  id: string;
  runId: string;
  stream: PaymentReconciliationStream;
  status: PaymentReconciliationStatus;
  currency: string;
  expectedAmount: Prisma.Decimal | number | string | null;
  actualAmount: Prisma.Decimal | number | string | null;
  deltaAmount: Prisma.Decimal | number | string | null;
  reference: string | null;
  externalReference: string | null;
  tripId: string | null;
  walletTopUpId: string | null;
  transferId: string | null;
  refundId: string | null;
  captureId: string | null;
  customerId: string | null;
  driverId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  driverName: string | null;
  driverEmail: string | null;
  reason: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type ReviewDocumentSource = {
  id: string;
  vehicleId: string | null;
  type: DriverDocumentType;
  url: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus;
  rejectionReason: string | null;
  expiresAt: Date | null;
  reviewedAt: Date | null;
  createdAt: Date;
};

type ReviewVehicleSource = {
  id: string;
  vehicleType: VehicleType;
  make: string;
  model: string;
  year: number;
  plateNumber: string;
  status: DriverVehicleReviewStatus;
  rejectionReason: string | null;
  isActive: boolean;
  capacityKg: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  allowedCargoTypes: string[];
  workingSchedule: unknown;
  createdAt: Date;
  updatedAt: Date;
  documents: ReviewDocumentSource[];
};

type ReviewProfileSource = {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  phone: string;
  city: string | null;
  coverageAreas: string[];
  identityDocumentKind: 'NATIONAL_ID' | 'RESIDENCY_CARD' | null;
  status: DriverStatus;
  submittedForReviewAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  user: {
    name: string;
    email: string;
  };
  documents: ReviewDocumentSource[];
  vehicles: ReviewVehicleSource[];
};

type DeliveryOperationsSource = {
  id: string;
  status: string;
  createdAt: Date;
  submittedAt: Date | null;
  scheduledPickupAt: Date | null;
  isImmediate: boolean;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  itemTitle: string | null;
  itemType: string | null;
  itemDescription: string | null;
  itemBrand: string | null;
  itemModel: string | null;
  itemYear: number | null;
  itemCondition: string | null;
  itemWeightKg: number | null;
  itemLengthCm: number | null;
  itemWidthCm: number | null;
  itemHeightCm: number | null;
  specialInstructions: string | null;
  customerNote: string | null;
  goodsDescription: string | null;
  goodsNumberOfPieces: number | null;
  goodsIsFragile: boolean;
  furnitureDescription: string | null;
  furnitureApproximateItemCount: number | null;
  vehicleVin: string | null;
  vehicleBrand: string | null;
  vehicleModel: string | null;
  vehicleManufactureYear: number | null;
  acceptedOfferId: string | null;
  acceptedAt: Date | null;
  driverArrivedPickupAt: Date | null;
  itemPickedUpAt: Date | null;
  driverGoingToDropoffAt: Date | null;
  deliveredAt: Date | null;
  completedAt: Date | null;
  pickupNotes: string | null;
  deliveryNotes: string | null;
  pickupProofImageUrl: string | null;
  deliveryProofImageUrl: string | null;
  pickupConfirmedByDriver: boolean;
  deliveryConfirmedByDriver: boolean;
  finalPrice: Prisma.Decimal | null;
  currency: string | null;
  paymentStatus: string | null;
  paymentMethod: string | null;
  heldAmount: Prisma.Decimal | null;
  capturedAmount: Prisma.Decimal | null;
  service: { nameEn: string };
  customer: { id: string; name: string; email: string; phoneNumber: string | null };
  assignedDriver: { id: string; phone: string; user: { name: string; email: string; phoneNumber: string | null } } | null;
  offers: Array<{
    id: string; price: Prisma.Decimal; currency: string; status: string; message: string | null;
    estimatedPickupAt: Date | null; estimatedDeliveryAt: Date | null; estimatedDurationMinutes: number | null;
    createdAt: Date; acceptedAt: Date | null; rejectedAt: Date | null; cancelledAt: Date | null;
    driver: { id: string; phone: string; user: { name: string; email: string; phoneNumber: string | null } };
  }>;
  photos: Array<{ id: string; url: string; originalName: string | null; createdAt: Date }>;
  proofPhotos: Array<{ id: string; type: string; url: string; originalName: string | null; createdAt: Date }>;
};

type DriverEarningAdminSource = {
  id: string;
  tripId: string;
  grossAmount: Prisma.Decimal;
  platformFeeAmount: Prisma.Decimal;
  netAmount: Prisma.Decimal;
  currency: string;
  status: DriverEarningStatus;
  availableAt: Date | null;
  paidOutAt: Date | null;
  stripeTransferId: string | null;
  stripeTransferStatus: string | null;
  driver: {
    id: string;
    userId: string;
    stripeAccountId: string | null;
    stripeDetailsSubmitted: boolean;
    stripePayoutsEnabled: boolean;
    user: {
      name: string;
      email: string;
    };
  };
  trip: {
    customer: {
      id: string;
      name: string;
      email: string;
    };
    additionalCharges: Array<{
      id: string;
      amount: Prisma.Decimal;
      currency: string;
      status: AdditionalChargeStatus;
      approvedAt: Date | null;
      stripePaymentIntentId: string | null;
      stripeChargeId: string | null;
      savedPaymentMethodId: string | null;
      savedPaymentMethodBrand: string | null;
      savedPaymentMethodLast4: string | null;
      savedPaymentMethodExpMonth: number | null;
      savedPaymentMethodExpYear: number | null;
      createdAt: Date;
    }>;
    paymentSettlement: {
      id: string;
      driverPayoutState: DriverPayoutState;
      payoutAttemptCount: number;
      lastPayoutAttemptAt: Date | null;
      nextPayoutRetryAt: Date | null;
      payoutFailureReason: string | null;
    } | null;
  };
};

type TripPaymentDisputeAdminSource = {
  id: string;
  requestId: string;
  status: TripPaymentSettlementStatus;
  currency: string;
  collectedAmount: Prisma.Decimal;
  requiresManualReview: boolean;
  stripeDisputeId: string | null;
  disputeStatus: string | null;
  disputeReason: string | null;
  disputeAmount: Prisma.Decimal | null;
  disputeCurrency: string | null;
  disputeCreatedAt: Date | null;
  disputeUpdatedAt: Date | null;
  disputeClosedAt: Date | null;
  disputeEvidenceDueBy: Date | null;
  createdAt: Date;
  updatedAt: Date;
  driverPayoutState: DriverPayoutState;
  paymentHold: {
    stripeChargeId: string | null;
    stripePaymentIntentId: string | null;
  };
  customer: {
    id: string;
    name: string;
    email: string;
  };
  driver: {
    id: string;
    userId: string;
    user: {
      name: string;
      email: string;
    };
  } | null;
};

type WalletTopUpDisputeAdminSource = {
  id: string;
  status: CustomerWalletTopUpStatus;
  amount: Prisma.Decimal;
  currency: string;
  requiresManualReview: boolean;
  stripeDisputeId: string | null;
  stripePaymentIntentId: string | null;
  stripeChargeId: string | null;
  disputeStatus: string | null;
  disputeReason: string | null;
  disputeAmount: Prisma.Decimal | null;
  disputeCurrency: string | null;
  disputeCreatedAt: Date | null;
  disputeUpdatedAt: Date | null;
  disputeClosedAt: Date | null;
  disputeEvidenceDueBy: Date | null;
  createdAt: Date;
  updatedAt: Date;
  customer: {
    id: string;
    name: string;
    email: string;
  };
};

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly paymentsService: PaymentsService,
  ) {}

  async findAll(): Promise<AdminUserResponseDto[]> {
    const users = await this.prisma.user.findMany({
      where: {
        role: UserRole.ADMIN,
      },
      orderBy: [{ deletedAt: 'asc' }, { createdAt: 'desc' }],
      select: this.adminUserSelect(),
    });

    return users.map((user) => this.mapToResponse(user));
  }

  async findById(id: string): Promise<AdminUserResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        role: UserRole.ADMIN,
      },
      select: this.adminUserSelect(),
    });

    if (!user) {
      throw new NotFoundException('Admin user not found.');
    }

    return this.mapToResponse(user);
  }

  async create(dto: CreateAdminUserDto): Promise<AdminUserResponseDto> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, deletedAt: true },
    });

    if (existingUser) {
      if (existingUser.deletedAt) {
        throw new ConflictException(
          'Email is associated with a deactivated account.',
        );
      }
      throw new ConflictException('Email is already in use.');
    }

    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email: normalizedEmail,
        passwordHash: hashPassword(dto.password),
        role: UserRole.ADMIN,
      },
      select: this.adminUserSelect(),
    });

    return this.mapToResponse(user);
  }

  async update(
    id: string,
    dto: UpdateAdminUserDto,
  ): Promise<AdminUserResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        role: UserRole.ADMIN,
        deletedAt: null,
      },
      select: { id: true, email: true },
    });

    if (!user) {
      throw new NotFoundException('Admin user not found.');
    }

    const normalizedEmail = dto.email?.trim().toLowerCase();

    if (normalizedEmail && normalizedEmail !== user.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true, deletedAt: true },
      });

      if (existingUser) {
        if (existingUser.deletedAt) {
          throw new ConflictException(
            'Email is associated with a deactivated account.',
          );
        }
        throw new ConflictException('Email is already in use.');
      }
    }

    const updateData: {
      name?: string;
      email?: string;
      passwordHash?: string;
    } = {};

    if (dto.name !== undefined) {
      updateData.name = dto.name.trim();
    }

    if (normalizedEmail !== undefined) {
      updateData.email = normalizedEmail;
    }

    if (dto.password !== undefined && dto.password.length > 0) {
      updateData.passwordHash = hashPassword(dto.password);
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: updateData,
      select: this.adminUserSelect(),
    });

    return this.mapToResponse(updated);
  }

  async reactivate(id: string): Promise<AdminUserResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        role: UserRole.ADMIN,
      },
      select: { id: true, deletedAt: true },
    });

    if (!user) {
      throw new NotFoundException('Admin user not found.');
    }

    if (!user.deletedAt) {
      throw new BadRequestException('Admin user is already active.');
    }

    const restored = await this.prisma.user.update({
      where: { id: user.id },
      data: { deletedAt: null },
      select: this.adminUserSelect(),
    });

    return this.mapToResponse(restored);
  }

  async findDriverReviews(): Promise<AdminDriverReviewResponseDto[]> {
    const profiles = await this.prisma.driverProfile.findMany({
      where: {
        submittedForReviewAt: {
          not: null,
        },
      },
      orderBy: [{ status: 'asc' }, { submittedForReviewAt: 'desc' }],
      select: this.driverReviewSelect(),
    });

    return profiles.map((profile) => this.mapDriverReview(profile));
  }

  async findDriverReviewById(
    id: string,
  ): Promise<AdminDriverReviewResponseDto> {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { id },
      select: this.driverReviewSelect(),
    });

    if (!profile || !profile.submittedForReviewAt) {
      throw new NotFoundException('Driver review request not found.');
    }

    return this.mapDriverReview(profile);
  }

  async findDriverEarnings(
    query: AdminDriverEarningsQueryDto,
  ): Promise<AdminDriverEarningsListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const view = query.view ?? 'all';
    const where = this.buildDriverEarningsWhere(view);

    const [items, total, summary] = await Promise.all([
      this.prisma.driverEarning.findMany({
        where,
        orderBy: [
          { availableAt: 'asc' },
          { createdAt: 'desc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
        select: this.driverEarningAdminSelect(),
      }),
      this.prisma.driverEarning.count({ where }),
      this.getDriverEarningsSummary(),
    ]);

    return {
      items: (items as unknown as DriverEarningAdminSource[]).map((item) =>
        this.mapDriverEarning(item),
      ),
      total,
      summary,
    };
  }

  async findDeliveryOperations(
    query: AdminDeliveryOperationsQueryDto,
  ): Promise<AdminDeliveryOperationsListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildDeliveryOperationsWhere(query);
    const [records, total, summary] = await Promise.all([
      this.prisma.transportRequest.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: this.deliveryOperationsSelect(),
      }),
      this.prisma.transportRequest.count({ where }),
      this.getDeliveryOperationsSummary(),
    ]);

    return {
      items: (records as unknown as DeliveryOperationsSource[]).map((record) =>
        this.mapDeliveryOperationsRecord(record),
      ),
      total,
      summary,
    };
  }

  async getDeliveryProofImage(
    proofId: string,
  ): Promise<{ path: string; mimeType: string }> {
    const legacyMatch = /^legacy-(pickup|delivery)-(.+)$/.exec(proofId);

    if (legacyMatch) {
      const [, kind, requestId] = legacyMatch;
      const request = await this.prisma.transportRequest.findUnique({
        where: { id: requestId },
        select: {
          pickupProofImageUrl: true,
          deliveryProofImageUrl: true,
        },
      });
      const url = kind === 'pickup'
        ? request?.pickupProofImageUrl
        : request?.deliveryProofImageUrl;

      if (!url) {
        throw new NotFoundException('Delivery proof image not found.');
      }

      return this.localUploadImage(url);
    }

    const photo = await this.prisma.transportRequestProofPhoto.findUnique({
      where: { id: proofId },
      select: { storageKey: true, url: true, mimeType: true },
    });

    if (!photo) {
      throw new NotFoundException('Delivery proof image not found.');
    }

    return this.localUploadImage(photo.storageKey ?? photo.url, photo.mimeType);
  }

  async findPaymentDisputes(
    query: AdminPaymentDisputesQueryDto,
  ): Promise<AdminPaymentDisputesListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [tripDisputes, walletTopUps] = await Promise.all([
      this.prisma.tripPaymentSettlement.findMany({
        where: this.buildTripPaymentDisputesWhere(query),
        orderBy: [
          { disputeUpdatedAt: 'desc' },
          { disputeCreatedAt: 'desc' },
          { updatedAt: 'desc' },
        ],
        select: this.tripPaymentDisputeSelect(),
      }),
      this.prisma.customerWalletTopUp.findMany({
        where: this.buildWalletTopUpDisputesWhere(query),
        orderBy: [
          { disputeUpdatedAt: 'desc' },
          { disputeCreatedAt: 'desc' },
          { updatedAt: 'desc' },
        ],
        select: this.walletTopUpDisputeSelect(),
      }),
    ]);

    const items = [
      ...tripDisputes.map((item) => this.mapTripPaymentDispute(item)),
      ...walletTopUps.map((item) => this.mapWalletTopUpDispute(item)),
    ].sort((left, right) => {
      const leftTime = Date.parse(
        left.disputeUpdatedAt ?? left.disputeCreatedAt ?? left.updatedAt,
      );
      const rightTime = Date.parse(
        right.disputeUpdatedAt ?? right.disputeCreatedAt ?? right.updatedAt,
      );

      return rightTime - leftTime;
    });

    const pagedItems = items.slice(skip, skip + limit);

    return {
      items: pagedItems,
      total: items.length,
      summary: this.getPaymentDisputeSummary(items),
    };
  }

  async findPaymentReconciliation(
    query: AdminPaymentReconciliationQueryDto,
  ): Promise<AdminPaymentReconciliationListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const streamFilter = query.stream ?? 'all';
    const statusFilter = query.status ?? 'all';

    const latestRuns = await this.ensureLatestPaymentReconciliationRuns();
    const latestRunIds = latestRuns.map((run) => run.id);
    const internalStream = this.mapPaymentReconciliationStreamFilter(streamFilter);
    const internalStatus = this.mapPaymentReconciliationStatusFilter(statusFilter);
    const items = await this.loadPaymentReconciliationRecords({
      runIds: latestRunIds,
      stream: internalStream,
      status: internalStatus,
      page,
      limit,
    });
    const total = await this.countPaymentReconciliationRecords({
      runIds: latestRunIds,
      stream: internalStream,
      status: internalStatus,
    });

    return {
      items: items.map((item) => this.mapPaymentReconciliationRecord(item)),
      total,
      summary: this.getPaymentReconciliationSummary(latestRuns),
      latestRuns: latestRuns.map((run) => this.mapPaymentReconciliationRun(run)),
    };
  }

  async runPaymentReconciliation(
    dto: RunPaymentReconciliationDto,
  ): Promise<AdminPaymentReconciliationRunResponseDto> {
    const runs = await this.runPaymentReconciliationStreams(dto.stream ?? 'all');

    return {
      runs: runs.map((run) => this.mapPaymentReconciliationRun(run)),
    };
  }

  async retryDriverPayout(tripId: string): Promise<AdminDriverEarningItemDto> {
    const earning = await this.getDriverEarningByTripId(tripId);

    if (!earning || !earning.trip.paymentSettlement) {
      throw new NotFoundException('Driver earning not found.');
    }

    const retryState = this.getDriverEarningRetryState(earning);
    if (!retryState.canRetry) {
      throw new BadRequestException(
        retryState.retryBlockedReason ?? 'Driver payout cannot be retried yet.',
      );
    }

    await this.prisma.tripPaymentSettlement.update({
      where: { id: earning.trip.paymentSettlement.id },
      data: {
        driverPayoutState: DriverPayoutState.EARNING_CREATED,
        payoutFailureReason: null,
        nextPayoutRetryAt: null,
      },
    });

    await this.paymentsService.queueAdminDriverPayoutRetry(tripId);

    const refreshed = await this.getDriverEarningByTripId(tripId);
    if (!refreshed) {
      throw new NotFoundException('Driver earning not found.');
    }

    return this.mapDriverEarning(refreshed);
  }

  async approveDriverReview(id: string): Promise<AdminDriverReviewResponseDto> {
    const profile = await this.getDriverReviewProfile(id);
    const reviewVehicle = this.pickReviewVehicle(profile.vehicles);

    if (!reviewVehicle) {
      throw new BadRequestException(
        'Driver review cannot be approved without a submitted vehicle.',
      );
    }

    if (!this.hasRequiredVehicleDocuments(reviewVehicle.documents)) {
      throw new BadRequestException(
        'The selected vehicle does not have all required documents.',
      );
    }

    if (!this.hasVehicleLoadCapacityProfile(reviewVehicle)) {
      throw new BadRequestException(
        'The selected vehicle does not have a complete load-capacity profile.',
      );
    }

    const reviewedAt = new Date();

    await this.prisma.$transaction([
      this.prisma.driverProfile.update({
        where: { id: profile.id },
        data: {
          status: DriverStatus.APPROVED,
        },
      }),
      this.prisma.driverDocument.updateMany({
        where: {
          driverId: profile.id,
          vehicleId: null,
          type: { in: DRIVER_ONBOARDING_REQUIRED_DOCUMENT_TYPES },
          status: {
            in: [
              DocumentStatus.UPLOADED,
              DocumentStatus.PENDING_REVIEW,
              DocumentStatus.UNDER_REVIEW,
              DocumentStatus.REJECTED,
            ],
          },
        },
        data: {
          status: DocumentStatus.APPROVED,
          rejectionReason: null,
          reviewedAt,
        },
      }),
      this.prisma.driverVehicle.update({
        where: { id: reviewVehicle.id },
        data: {
          status: DriverVehicleReviewStatus.APPROVED,
          rejectionReason: null,
          isActive: true,
        },
      }),
      this.prisma.driverDocument.updateMany({
        where: {
          driverId: profile.id,
          vehicleId: reviewVehicle.id,
          status: {
            in: [
              DocumentStatus.UPLOADED,
              DocumentStatus.PENDING_REVIEW,
              DocumentStatus.UNDER_REVIEW,
              DocumentStatus.REJECTED,
            ],
          },
        },
        data: {
          status: DocumentStatus.APPROVED,
          rejectionReason: null,
          reviewedAt,
        },
      }),
    ]);

    void this.notificationsService
      .notifyDriverApproved({
        driverUserId: profile.userId,
        driverName: profile.user.name,
      })
      .catch((notificationError: unknown) => {
        this.logger.error(
          `Failed to notify approved driver ${profile.id}: ${notificationError instanceof Error ? notificationError.message : 'Unexpected error'}`,
        );
      });

    return this.findDriverReviewById(id);
  }

  async approveDriverReviewVehicle(
    id: string,
    vehicleId: string,
  ): Promise<AdminDriverReviewResponseDto> {
    const profile = await this.getDriverReviewProfile(id);
    const vehicle = profile.vehicles.find((item) => item.id === vehicleId);

    if (!vehicle) {
      throw new NotFoundException('Vehicle submission not found for this driver.');
    }

    if (!this.hasRequiredVehicleDocuments(vehicle.documents)) {
      throw new BadRequestException(
        'This vehicle does not have all required documents.',
      );
    }

    if (!this.hasVehicleLoadCapacityProfile(vehicle)) {
      throw new BadRequestException(
        'This vehicle does not have a complete load-capacity profile.',
      );
    }

    const reviewedAt = new Date();

    await this.prisma.$transaction([
      this.prisma.driverProfile.update({
        where: { id: profile.id },
        data: { status: DriverStatus.APPROVED },
      }),
      this.prisma.driverDocument.updateMany({
        where: {
          driverId: profile.id,
          vehicleId: null,
          type: { in: DRIVER_ONBOARDING_REQUIRED_DOCUMENT_TYPES },
          status: {
            in: [
              DocumentStatus.UPLOADED,
              DocumentStatus.PENDING_REVIEW,
              DocumentStatus.UNDER_REVIEW,
              DocumentStatus.REJECTED,
            ],
          },
        },
        data: {
          status: DocumentStatus.APPROVED,
          rejectionReason: null,
          reviewedAt,
        },
      }),
      this.prisma.driverVehicle.update({
        where: { id: vehicle.id },
        data: {
          status: DriverVehicleReviewStatus.APPROVED,
          rejectionReason: null,
          isActive: true,
        },
      }),
      this.prisma.driverDocument.updateMany({
        where: {
          driverId: profile.id,
          vehicleId: vehicle.id,
          status: {
            in: [
              DocumentStatus.UPLOADED,
              DocumentStatus.PENDING_REVIEW,
              DocumentStatus.UNDER_REVIEW,
              DocumentStatus.REJECTED,
            ],
          },
        },
        data: {
          status: DocumentStatus.APPROVED,
          rejectionReason: null,
          reviewedAt,
        },
      }),
    ]);

    return this.findDriverReviewById(id);
  }

  async declineDriverReview(
    id: string,
    reason?: string,
  ): Promise<AdminDriverReviewResponseDto> {
    const profile = await this.getDriverReviewProfile(id);
    const reviewVehicle = this.pickReviewVehicle(profile.vehicles);
    const normalizedReason = reason?.trim() || 'Declined by admin review.';
    const reviewedAt = new Date();

    await this.prisma.$transaction([
      this.prisma.driverProfile.update({
        where: { id: profile.id },
        data: {
          status: DriverStatus.REJECTED,
        },
      }),
      this.prisma.driverDocument.updateMany({
        where: {
          driverId: profile.id,
          vehicleId: null,
          type: { in: DRIVER_ONBOARDING_REQUIRED_DOCUMENT_TYPES },
          status: {
            in: [
              DocumentStatus.UPLOADED,
              DocumentStatus.PENDING_REVIEW,
              DocumentStatus.UNDER_REVIEW,
              DocumentStatus.APPROVED,
            ],
          },
        },
        data: {
          status: DocumentStatus.REJECTED,
          rejectionReason: normalizedReason,
          reviewedAt,
        },
      }),
      ...(reviewVehicle
        ? [
            this.prisma.driverVehicle.update({
              where: { id: reviewVehicle.id },
              data: {
                status: DriverVehicleReviewStatus.REJECTED,
                rejectionReason: normalizedReason,
                isActive: false,
              },
            }),
            this.prisma.driverDocument.updateMany({
              where: {
                driverId: profile.id,
                vehicleId: reviewVehicle.id,
                status: {
                  in: [
                    DocumentStatus.UPLOADED,
                    DocumentStatus.PENDING_REVIEW,
                    DocumentStatus.UNDER_REVIEW,
                    DocumentStatus.APPROVED,
                  ],
                },
              },
              data: {
                status: DocumentStatus.REJECTED,
                rejectionReason: normalizedReason,
                reviewedAt,
              },
            }),
          ]
        : []),
    ]);

    return this.findDriverReviewById(id);
  }

  async softDelete(id: string, actorId: string): Promise<void> {
    if (id === actorId) {
      throw new ForbiddenException('You cannot delete your own admin account.');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id,
        role: UserRole.ADMIN,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('Admin user not found.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { deletedAt: new Date() },
    });
  }

  private buildDriverEarningsWhere(
    view: AdminDriverEarningsView,
  ): Prisma.DriverEarningWhereInput {
    const pendingWhere: Prisma.DriverEarningWhereInput = {
      status: DriverEarningStatus.PENDING,
      trip: {
        paymentSettlement: {
          isNot: null,
        },
      },
    };
    const activeWhere: Prisma.DriverEarningWhereInput = {
      trip: {
        paymentSettlement: {
          is: {
            driverPayoutState: {
              in: [
                DriverPayoutState.EARNING_CREATED,
                DriverPayoutState.PENDING_TRANSFER,
              ],
            },
          },
        },
      },
    };
    const failedWhere: Prisma.DriverEarningWhereInput = {
      trip: {
        paymentSettlement: {
          is: {
            driverPayoutState: DriverPayoutState.TRANSFER_FAILED,
          },
        },
      },
    };
    const paidWhere: Prisma.DriverEarningWhereInput = {
      trip: {
        paymentSettlement: {
          is: {
            driverPayoutState: DriverPayoutState.PAID_OUT,
          },
        },
      },
    };

    if (view === 'pending') {
      return pendingWhere;
    }

    if (view === 'active') {
      return activeWhere;
    }

    if (view === 'failed') {
      return failedWhere;
    }

    if (view === 'paid') {
      return paidWhere;
    }

    return {
      OR: [pendingWhere, activeWhere, failedWhere, paidWhere],
    };
  }

  private driverEarningAdminSelect(): Prisma.DriverEarningSelect {
    return {
      id: true,
      tripId: true,
      grossAmount: true,
      platformFeeAmount: true,
      netAmount: true,
      currency: true,
      status: true,
      availableAt: true,
      paidOutAt: true,
      stripeTransferId: true,
      stripeTransferStatus: true,
      driver: {
        select: {
          id: true,
          userId: true,
          stripeAccountId: true,
          stripeDetailsSubmitted: true,
          stripePayoutsEnabled: true,
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
      trip: {
        select: {
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          additionalCharges: {
            orderBy: {
              createdAt: 'desc' as const,
            },
            select: {
              id: true,
              amount: true,
              currency: true,
              status: true,
              approvedAt: true,
              stripePaymentIntentId: true,
              stripeChargeId: true,
              savedPaymentMethodId: true,
              savedPaymentMethodBrand: true,
              savedPaymentMethodLast4: true,
              savedPaymentMethodExpMonth: true,
              savedPaymentMethodExpYear: true,
              createdAt: true,
            },
          },
          paymentSettlement: {
            select: {
              id: true,
              driverPayoutState: true,
              payoutAttemptCount: true,
              lastPayoutAttemptAt: true,
              nextPayoutRetryAt: true,
              payoutFailureReason: true,
            },
          },
        },
      },
    } satisfies Prisma.DriverEarningSelect;
  }

  private async getDriverEarningsSummary(): Promise<AdminDriverEarningSummaryDto> {
    const [pendingCount, activeCount, failedCount] = await Promise.all([
      this.prisma.driverEarning.count({
        where: this.buildDriverEarningsWhere('pending'),
      }),
      this.prisma.driverEarning.count({
        where: this.buildDriverEarningsWhere('active'),
      }),
      this.prisma.driverEarning.count({
        where: this.buildDriverEarningsWhere('failed'),
      }),
    ]);

    return {
      pendingCount,
      activeCount,
      failedCount,
    };
  }

  private async getDriverEarningByTripId(
    tripId: string,
  ): Promise<DriverEarningAdminSource | null> {
    return this.prisma.driverEarning.findUnique({
      where: { tripId },
      select: this.driverEarningAdminSelect(),
    }) as Promise<DriverEarningAdminSource | null>;
  }

  private mapDriverEarning(
    earning: DriverEarningAdminSource,
  ): AdminDriverEarningItemDto {
    if (!earning.trip.paymentSettlement) {
      throw new NotFoundException('Driver payout settlement not found.');
    }

    const retryState = this.getDriverEarningRetryState(earning);

    return {
      tripId: earning.tripId,
      earningId: earning.id,
      settlementId: earning.trip.paymentSettlement.id,
      driver: {
        id: earning.driver.id,
        userId: earning.driver.userId,
        name: earning.driver.user.name,
        email: earning.driver.user.email,
      },
      customer: {
        id: earning.trip.customer.id,
        name: earning.trip.customer.name,
        email: earning.trip.customer.email,
      },
      stripe: {
        accountId: earning.driver.stripeAccountId,
        detailsSubmitted: earning.driver.stripeDetailsSubmitted,
        payoutsEnabled: earning.driver.stripePayoutsEnabled,
      },
      grossAmount: Number(earning.grossAmount),
      platformFeeAmount: Number(earning.platformFeeAmount),
      netAmount: Number(earning.netAmount),
      currency: earning.currency,
      earningStatus: earning.status,
      availableAt: earning.availableAt?.toISOString() ?? null,
      paidOutAt: earning.paidOutAt?.toISOString() ?? null,
      driverPayoutState: earning.trip.paymentSettlement.driverPayoutState,
      payoutAttemptCount: earning.trip.paymentSettlement.payoutAttemptCount,
      lastPayoutAttemptAt:
        earning.trip.paymentSettlement.lastPayoutAttemptAt?.toISOString() ??
        null,
      nextPayoutRetryAt:
        earning.trip.paymentSettlement.nextPayoutRetryAt?.toISOString() ?? null,
      payoutFailureReason: earning.trip.paymentSettlement.payoutFailureReason,
      stripeTransferId: earning.stripeTransferId,
      stripeTransferStatus: earning.stripeTransferStatus,
      canRetry: retryState.canRetry,
      retryBlockedReason: retryState.retryBlockedReason,
      additionalCharges: earning.trip.additionalCharges.map((charge) => ({
        id: charge.id,
        amount: Number(charge.amount),
        appFeeAmount: Number(this.calculateAdditionalChargeAppFee(charge.amount)),
        totalChargeAmount: Number(this.calculateAdditionalChargeTotal(charge.amount)),
        currency: charge.currency,
        status: charge.status,
        paymentOption: this.getAdditionalChargePaymentOption({
          approvedAt: charge.approvedAt,
          stripePaymentIntentId: charge.stripePaymentIntentId,
          stripeChargeId: charge.stripeChargeId,
          savedPaymentMethodId: charge.savedPaymentMethodId,
        }),
        savedPaymentMethod: charge.savedPaymentMethodId
          ? {
              id: charge.savedPaymentMethodId,
              brand: charge.savedPaymentMethodBrand,
              last4: charge.savedPaymentMethodLast4,
              expMonth: charge.savedPaymentMethodExpMonth,
              expYear: charge.savedPaymentMethodExpYear,
            }
          : null,
        createdAt: charge.createdAt.toISOString(),
      })),
    };
  }

  private getAdditionalChargePaymentOption(input: {
    approvedAt: Date | null;
    stripePaymentIntentId: string | null;
    stripeChargeId: string | null;
    savedPaymentMethodId: string | null;
  }): 'SAVED_CARD' | 'CASH_ON_DELIVERY' | null {
    if (
      input.savedPaymentMethodId ||
      input.stripePaymentIntentId ||
      input.stripeChargeId
    ) {
      return 'SAVED_CARD';
    }

    if (input.approvedAt) {
      return 'CASH_ON_DELIVERY';
    }

    return null;
  }

  private calculateAdditionalChargeAppFee(
    baseAmount: Prisma.Decimal,
  ): Prisma.Decimal {
    return baseAmount
      .mul(ADDITIONAL_CHARGE_APP_FEE_PERCENTAGE)
      .toDecimalPlaces(2);
  }

  private calculateAdditionalChargeTotal(
    baseAmount: Prisma.Decimal,
  ): Prisma.Decimal {
    return baseAmount
      .add(this.calculateAdditionalChargeAppFee(baseAmount))
      .toDecimalPlaces(2);
  }

  private getDriverEarningRetryState(earning: DriverEarningAdminSource): {
    canRetry: boolean;
    retryBlockedReason: string | null;
  } {
    const settlement = earning.trip.paymentSettlement;
    if (!settlement) {
      return {
        canRetry: false,
        retryBlockedReason: 'Driver payout settlement is missing.',
      };
    }

    if (earning.status === DriverEarningStatus.PAID_OUT || earning.stripeTransferId) {
      return {
        canRetry: false,
        retryBlockedReason: 'Driver payout was already transferred.',
      };
    }

    const now = Date.now();

    if (settlement.driverPayoutState === DriverPayoutState.TRANSFER_FAILED) {
      return {
        canRetry: true,
        retryBlockedReason: null,
      };
    }

    if (settlement.driverPayoutState === DriverPayoutState.PENDING_TRANSFER) {
      const isStale =
        settlement.lastPayoutAttemptAt !== null &&
        settlement.lastPayoutAttemptAt.getTime() <=
          now - 15 * 60 * 1000;

      return {
        canRetry: isStale,
        retryBlockedReason: isStale
          ? null
          : 'Payout transfer is still being processed.',
      };
    }

    if (settlement.driverPayoutState === DriverPayoutState.EARNING_CREATED) {
      if (earning.availableAt && earning.availableAt.getTime() > now) {
        return {
          canRetry: false,
          retryBlockedReason: 'Driver earning is still in the 24-hour pending hold.',
        };
      }

      return {
        canRetry: true,
        retryBlockedReason: null,
      };
    }

    return {
      canRetry: false,
      retryBlockedReason: 'Driver payout is not eligible for retry.',
    };
  }

  private buildTripPaymentDisputesWhere(
    query: AdminPaymentDisputesQueryDto,
  ): Prisma.TripPaymentSettlementWhereInput {
    if (query.recordType === 'WALLET_TOP_UP') {
      return { id: '__none__' };
    }

    const baseWhere: Prisma.TripPaymentSettlementWhereInput = {
      stripeDisputeId: { not: null },
    };

    if (query.view === 'manual_review') {
      return {
        ...baseWhere,
        requiresManualReview: true,
      };
    }

    if (query.view === 'closed') {
      return {
        ...baseWhere,
        disputeClosedAt: { not: null },
      };
    }

    return {
      ...baseWhere,
      OR: [{ disputeClosedAt: null }, { requiresManualReview: true }],
    };
  }

  private buildWalletTopUpDisputesWhere(
    query: AdminPaymentDisputesQueryDto,
  ): Prisma.CustomerWalletTopUpWhereInput {
    if (query.recordType === 'TRIP_CHARGE') {
      return { id: '__none__' };
    }

    const baseWhere: Prisma.CustomerWalletTopUpWhereInput = {
      stripeDisputeId: { not: null },
    };

    if (query.view === 'manual_review') {
      return {
        ...baseWhere,
        requiresManualReview: true,
      };
    }

    if (query.view === 'closed') {
      return {
        ...baseWhere,
        disputeClosedAt: { not: null },
      };
    }

    return {
      ...baseWhere,
      OR: [{ disputeClosedAt: null }, { requiresManualReview: true }],
    };
  }

  private tripPaymentDisputeSelect() {
    return {
      id: true,
      requestId: true,
      status: true,
      currency: true,
      collectedAmount: true,
      requiresManualReview: true,
      stripeDisputeId: true,
      disputeStatus: true,
      disputeReason: true,
      disputeAmount: true,
      disputeCurrency: true,
      disputeCreatedAt: true,
      disputeUpdatedAt: true,
      disputeClosedAt: true,
      disputeEvidenceDueBy: true,
      createdAt: true,
      updatedAt: true,
      driverPayoutState: true,
      paymentHold: {
        select: {
          stripeChargeId: true,
          stripePaymentIntentId: true,
        },
      },
      customer: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      driver: {
        select: {
          id: true,
          userId: true,
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
    };
  }

  private walletTopUpDisputeSelect() {
    return {
      id: true,
      status: true,
      amount: true,
      currency: true,
      requiresManualReview: true,
      stripeDisputeId: true,
      stripePaymentIntentId: true,
      stripeChargeId: true,
      disputeStatus: true,
      disputeReason: true,
      disputeAmount: true,
      disputeCurrency: true,
      disputeCreatedAt: true,
      disputeUpdatedAt: true,
      disputeClosedAt: true,
      disputeEvidenceDueBy: true,
      createdAt: true,
      updatedAt: true,
      customer: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    };
  }

  private getPaymentDisputeSummary(
    items: AdminPaymentDisputeItemDto[],
  ): AdminPaymentDisputeSummaryDto {
    return items.reduce<AdminPaymentDisputeSummaryDto>(
      (summary, item) => {
        if (item.requiresManualReview) {
          summary.manualReviewCount += 1;
        }

        if (item.disputeClosedAt) {
          summary.closedCount += 1;
        } else {
          summary.openCount += 1;
        }

        return summary;
      },
      {
        openCount: 0,
        closedCount: 0,
        manualReviewCount: 0,
      },
    );
  }

  private mapTripPaymentDispute(
    settlement: TripPaymentDisputeAdminSource,
  ): AdminPaymentDisputeItemDto {
    return {
      id: settlement.id,
      recordType: 'TRIP_CHARGE',
      paymentStatus: settlement.status,
      disputeStatus: settlement.disputeStatus,
      stripeDisputeId: settlement.stripeDisputeId,
      stripeChargeId: settlement.paymentHold.stripeChargeId,
      stripePaymentIntentId: settlement.paymentHold.stripePaymentIntentId,
      amount: Number(settlement.collectedAmount),
      currency: settlement.currency,
      disputeAmount:
        settlement.disputeAmount !== null ? Number(settlement.disputeAmount) : null,
      disputeCurrency: settlement.disputeCurrency,
      disputeReason: settlement.disputeReason,
      disputeCreatedAt: settlement.disputeCreatedAt?.toISOString() ?? null,
      disputeUpdatedAt: settlement.disputeUpdatedAt?.toISOString() ?? null,
      disputeClosedAt: settlement.disputeClosedAt?.toISOString() ?? null,
      disputeEvidenceDueBy:
        settlement.disputeEvidenceDueBy?.toISOString() ?? null,
      requiresManualReview: settlement.requiresManualReview,
      customer: {
        id: settlement.customer.id,
        name: settlement.customer.name,
        email: settlement.customer.email,
      },
      trip: {
        requestId: settlement.requestId,
        driver: settlement.driver
          ? {
              id: settlement.driver.id,
              userId: settlement.driver.userId,
              name: settlement.driver.user.name,
              email: settlement.driver.user.email,
            }
          : null,
        driverPayoutState: settlement.driverPayoutState,
      },
      walletTopUpId: null,
      createdAt: settlement.createdAt.toISOString(),
      updatedAt: settlement.updatedAt.toISOString(),
    };
  }

  private mapWalletTopUpDispute(
    topUp: WalletTopUpDisputeAdminSource,
  ): AdminPaymentDisputeItemDto {
    return {
      id: topUp.id,
      recordType: 'WALLET_TOP_UP',
      paymentStatus: topUp.status,
      disputeStatus: topUp.disputeStatus,
      stripeDisputeId: topUp.stripeDisputeId,
      stripeChargeId: topUp.stripeChargeId,
      stripePaymentIntentId: topUp.stripePaymentIntentId,
      amount: Number(topUp.amount),
      currency: topUp.currency,
      disputeAmount: topUp.disputeAmount !== null ? Number(topUp.disputeAmount) : null,
      disputeCurrency: topUp.disputeCurrency,
      disputeReason: topUp.disputeReason,
      disputeCreatedAt: topUp.disputeCreatedAt?.toISOString() ?? null,
      disputeUpdatedAt: topUp.disputeUpdatedAt?.toISOString() ?? null,
      disputeClosedAt: topUp.disputeClosedAt?.toISOString() ?? null,
      disputeEvidenceDueBy: topUp.disputeEvidenceDueBy?.toISOString() ?? null,
      requiresManualReview: topUp.requiresManualReview,
      customer: {
        id: topUp.customer.id,
        name: topUp.customer.name,
        email: topUp.customer.email,
      },
      trip: null,
      walletTopUpId: topUp.id,
      createdAt: topUp.createdAt.toISOString(),
      updatedAt: topUp.updatedAt.toISOString(),
    };
  }

  private async ensureLatestPaymentReconciliationRuns() {
    let latestRuns = await this.getLatestPaymentReconciliationRuns();

    if (latestRuns.length === PAYMENT_RECONCILIATION_STREAMS.length) {
      return latestRuns;
    }

    const coveredStreams = new Set(latestRuns.map((run) => run.stream));
    const missingStreams = PAYMENT_RECONCILIATION_STREAMS.filter(
      (stream) => !coveredStreams.has(stream),
    );

    if (missingStreams.length > 0) {
      for (const stream of missingStreams) {
        await this.executePaymentReconciliationStream(stream);
      }
      latestRuns = await this.getLatestPaymentReconciliationRuns();
    }

    return latestRuns;
  }

  private async getLatestPaymentReconciliationRuns() {
    const runs = await this.prisma.$queryRaw<PaymentReconciliationRunRow[]>(
      Prisma.sql`
        SELECT
          id,
          stream,
          status,
          "scannedCount",
          "matchedCount",
          "mismatchCount",
          "missingCount",
          "errorMessage",
          "startedAt",
          "finishedAt",
          "createdAt",
          "updatedAt"
        FROM "payment_reconciliation_runs"
        ORDER BY "createdAt" DESC
        LIMIT 32
      `,
    );
    const latestByStream = new Map<PaymentReconciliationStream, PaymentReconciliationRunRow>();

    for (const run of runs) {
      if (!latestByStream.has(run.stream)) {
        latestByStream.set(run.stream, run);
      }
    }

    return PAYMENT_RECONCILIATION_STREAMS.map((stream) => latestByStream.get(stream)).filter(
      (run): run is PaymentReconciliationRunRow => Boolean(run),
    );
  }

  private async runPaymentReconciliationStreams(
    streamFilter: AdminPaymentReconciliationStreamFilter,
  ) {
    const streams =
      streamFilter === 'all'
        ? PAYMENT_RECONCILIATION_STREAMS
        : [this.mapPaymentReconciliationStreamValue(streamFilter)];

    const runs: PaymentReconciliationRunRow[] = [];
    for (const stream of streams) {
      runs.push(await this.executePaymentReconciliationStream(stream));
    }

    return runs;
  }

  private async executePaymentReconciliationStream(
    stream: PaymentReconciliationStream,
  ) {
    const startedAt = new Date();
    const [run] = await this.prisma.$queryRaw<PaymentReconciliationRunRow[]>(
      Prisma.sql`
        INSERT INTO "payment_reconciliation_runs" (
          id,
          stream,
          status,
          "startedAt",
          "createdAt",
          "updatedAt"
        )
        VALUES (
          ${this.createCuid()},
          ${stream}::"PaymentReconciliationStream",
          ${PaymentReconciliationRunStatus.RUNNING}::"PaymentReconciliationRunStatus",
          ${startedAt},
          NOW(),
          NOW()
        )
        RETURNING
          id,
          stream,
          status,
          "scannedCount",
          "matchedCount",
          "mismatchCount",
          "missingCount",
          "errorMessage",
          "startedAt",
          "finishedAt",
          "createdAt",
          "updatedAt"
      `,
    );

    try {
      const records = await this.buildPaymentReconciliationRecords(stream);
      const summary = this.summarizePaymentReconciliationRecords(records);

      if (records.length > 0) {
        await this.insertPaymentReconciliationRecords(run.id, records);
      }

      return this.updatePaymentReconciliationRun(run.id, {
        status:
          summary.mismatchCount > 0 || summary.missingCount > 0
            ? PaymentReconciliationRunStatus.PARTIAL
            : PaymentReconciliationRunStatus.SUCCESS,
        scannedCount: summary.scannedCount,
        matchedCount: summary.matchedCount,
        mismatchCount: summary.mismatchCount,
        missingCount: summary.missingCount,
        finishedAt: new Date(),
        errorMessage: null,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Payment reconciliation failed.';

      await this.updatePaymentReconciliationRun(run.id, {
          status: PaymentReconciliationRunStatus.FAILED,
          finishedAt: new Date(),
          errorMessage: message,
      });

      throw error;
    }
  }

  private async buildPaymentReconciliationRecords(
    stream: PaymentReconciliationStream,
  ): Promise<PaymentReconciliationRecordDraft[]> {
    switch (stream) {
      case PaymentReconciliationStream.WALLET:
        return this.buildWalletPaymentReconciliationRecords();
      case PaymentReconciliationStream.CAPTURE:
        return this.buildCapturePaymentReconciliationRecords();
      case PaymentReconciliationStream.REFUND:
        return this.buildRefundPaymentReconciliationRecords();
      case PaymentReconciliationStream.TRANSFER:
        return this.buildTransferPaymentReconciliationRecords();
      default:
        return [];
    }
  }

  private async buildWalletPaymentReconciliationRecords(): Promise<
    PaymentReconciliationRecordDraft[]
  > {
    const topUps = await this.prisma.customerWalletTopUp.findMany({
      where: {
        status: {
          not: CustomerWalletTopUpStatus.PENDING,
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
      select: {
        id: true,
        walletId: true,
        customerId: true,
        amount: true,
        currency: true,
        status: true,
        stripePaymentIntentId: true,
        stripeChargeId: true,
        requiresManualReview: true,
        failureReason: true,
        createdAt: true,
        updatedAt: true,
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        walletTransactions: {
          select: {
            amount: true,
            currency: true,
            type: true,
          },
        },
      },
    });

    return topUps.map((topUp) => {
      const topUpTransactions = topUp.walletTransactions.filter(
        (transaction) => transaction.type === PaymentTransactionType.TOP_UP,
      );
      const actualAmount = this.sumDecimalValues(topUpTransactions.map((item) => item.amount));
      const currencyMismatch = topUpTransactions.some(
        (transaction) => transaction.currency !== topUp.currency,
      );

      let status: PaymentReconciliationStatus = PaymentReconciliationStatus.MATCHED;
      let reason: string | null = null;

      if (topUp.status === CustomerWalletTopUpStatus.SUCCEEDED) {
        if (!topUp.walletId) {
          status = PaymentReconciliationStatus.MISSING;
          reason = 'Wallet top-up succeeded without a linked wallet.';
        } else if (topUpTransactions.length === 0) {
          status = PaymentReconciliationStatus.MISSING;
          reason = 'Wallet top-up succeeded without a wallet transaction.';
        } else if (currencyMismatch) {
          status = PaymentReconciliationStatus.MISMATCH;
          reason = 'Wallet top-up transaction currency does not match the top-up currency.';
        } else if (!this.decimalsEqual(actualAmount, topUp.amount)) {
          status = PaymentReconciliationStatus.MISMATCH;
          reason = 'Wallet top-up transaction amount does not match the recorded top-up amount.';
        }
      } else if (
        topUp.status === CustomerWalletTopUpStatus.FAILED ||
        topUp.status === CustomerWalletTopUpStatus.CANCELLED
      ) {
        status =
          topUpTransactions.length > 0
            ? PaymentReconciliationStatus.MISMATCH
            : PaymentReconciliationStatus.FAILED;
        reason =
          topUp.failureReason ??
          (topUpTransactions.length > 0
            ? 'Failed wallet top-up still produced wallet transactions.'
            : 'Wallet top-up did not complete successfully.');
      } else if (
        topUp.status === CustomerWalletTopUpStatus.DISPUTED ||
        topUp.status === CustomerWalletTopUpStatus.MANUAL_REVIEW
      ) {
        status = PaymentReconciliationStatus.MISMATCH;
        reason = topUp.requiresManualReview
          ? 'Wallet top-up is under manual review.'
          : 'Wallet top-up is disputed and requires reconciliation.';
      }

      return this.buildPaymentReconciliationDraft({
        stream: PaymentReconciliationStream.WALLET,
        status,
        currency: topUp.currency,
        expectedAmount: topUp.amount,
        actualAmount,
        reference: topUp.id,
        externalReference: topUp.stripeChargeId ?? topUp.stripePaymentIntentId,
        walletTopUpId: topUp.id,
        customerId: topUp.customer.id,
        customerName: topUp.customer.name,
        customerEmail: topUp.customer.email,
        reason,
        createdAt: topUp.createdAt,
        updatedAt: topUp.updatedAt,
      });
    });
  }

  private async buildCapturePaymentReconciliationRecords(): Promise<
    PaymentReconciliationRecordDraft[]
  > {
    const holds = await this.prisma.paymentHold.findMany({
      where: {
        OR: [
          { status: PaymentStatus.PAYMENT_CAPTURED },
          { request: { paymentStatus: PaymentStatus.PAYMENT_CAPTURED } },
          { settlement: { isNot: null } },
        ],
      },
      orderBy: [{ updatedAt: 'desc' }],
      select: {
        id: true,
        requestId: true,
        customerId: true,
        amount: true,
        currency: true,
        status: true,
        stripeChargeId: true,
        stripePaymentIntentId: true,
        capturedAt: true,
        createdAt: true,
        updatedAt: true,
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        request: {
          select: {
            id: true,
            paymentStatus: true,
            capturedAmount: true,
          },
        },
        settlement: {
          select: {
            id: true,
            collectedAmount: true,
            currency: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    return holds.map((hold) => {
      const settlementAmount = hold.settlement?.collectedAmount ?? null;
      let status: PaymentReconciliationStatus = PaymentReconciliationStatus.MATCHED;
      let reason: string | null = null;

      if (hold.status !== PaymentStatus.PAYMENT_CAPTURED) {
        status = PaymentReconciliationStatus.MISMATCH;
        reason = 'Payment hold is not marked as captured.';
      } else if (!hold.capturedAt) {
        status = PaymentReconciliationStatus.MISMATCH;
        reason = 'Payment hold is captured without a captured timestamp.';
      } else if (!hold.settlement) {
        status = PaymentReconciliationStatus.MISSING;
        reason = 'Captured payment is missing a settlement record.';
      } else if (hold.request.paymentStatus !== PaymentStatus.PAYMENT_CAPTURED) {
        status = PaymentReconciliationStatus.MISMATCH;
        reason = 'Transport request payment status is not marked as captured.';
      } else if (hold.request.capturedAmount === null) {
        status = PaymentReconciliationStatus.MISSING;
        reason = 'Transport request is missing the captured amount.';
      } else if (
        hold.settlement.currency !== hold.currency ||
        !this.decimalsEqual(hold.settlement.collectedAmount, hold.amount) ||
        !this.decimalsEqual(hold.request.capturedAmount, hold.amount)
      ) {
        status = PaymentReconciliationStatus.MISMATCH;
        reason = 'Captured payment totals do not match across hold, request, and settlement.';
      }

      return this.buildPaymentReconciliationDraft({
        stream: PaymentReconciliationStream.CAPTURE,
        status,
        currency: hold.currency,
        expectedAmount: hold.amount,
        actualAmount: settlementAmount,
        reference: hold.requestId,
        externalReference: hold.stripeChargeId ?? hold.stripePaymentIntentId,
        tripId: hold.requestId,
        captureId: hold.id,
        customerId: hold.customer.id,
        customerName: hold.customer.name,
        customerEmail: hold.customer.email,
        reason,
        createdAt: hold.createdAt,
        updatedAt: hold.updatedAt,
      });
    });
  }

  private async buildRefundPaymentReconciliationRecords(): Promise<
    PaymentReconciliationRecordDraft[]
  > {
    const settlements = await this.prisma.tripPaymentSettlement.findMany({
      where: {
        OR: [
          { refundedAmount: { gt: new Prisma.Decimal(0) } },
          {
            status: {
              in: [
                TripPaymentSettlementStatus.REFUND_PENDING,
                TripPaymentSettlementStatus.PARTIALLY_REFUNDED,
                TripPaymentSettlementStatus.REFUNDED,
              ],
            },
          },
        ],
      },
      orderBy: [{ updatedAt: 'desc' }],
      select: {
        id: true,
        requestId: true,
        customerId: true,
        driverId: true,
        currency: true,
        refundedAmount: true,
        status: true,
        lastStripeRefundId: true,
        createdAt: true,
        updatedAt: true,
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        driver: {
          select: {
            id: true,
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
        paymentHold: {
          select: {
            paymentMethod: true,
            walletTransactions: {
              select: {
                amount: true,
                currency: true,
                type: true,
              },
            },
          },
        },
      },
    });

    return settlements.map((settlement) => {
      const refundTransactions = settlement.paymentHold.walletTransactions.filter(
        (transaction) => transaction.type === PaymentTransactionType.REFUND,
      );
      const walletRefundAmount = this.sumDecimalValues(
        refundTransactions.map((item) => item.amount),
      );
      const usesWalletRefund =
        settlement.paymentHold.paymentMethod === PaymentMethod.APP_WALLET;
      const actualAmount = usesWalletRefund
        ? walletRefundAmount
        : settlement.lastStripeRefundId
          ? settlement.refundedAmount
          : null;

      let status: PaymentReconciliationStatus = PaymentReconciliationStatus.MATCHED;
      let reason: string | null = null;

      if (settlement.refundedAmount.comparedTo(0) <= 0) {
        status = PaymentReconciliationStatus.MISMATCH;
        reason = 'Refund status is set without a positive refunded amount.';
      } else if (usesWalletRefund) {
        const hasCurrencyMismatch = refundTransactions.some(
          (transaction) => transaction.currency !== settlement.currency,
        );

        if (refundTransactions.length === 0) {
          status = PaymentReconciliationStatus.MISSING;
          reason = 'Wallet refund is missing a wallet refund transaction.';
        } else if (hasCurrencyMismatch) {
          status = PaymentReconciliationStatus.MISMATCH;
          reason = 'Wallet refund transaction currency does not match the settlement currency.';
        } else if (!this.decimalsEqual(walletRefundAmount, settlement.refundedAmount)) {
          status = PaymentReconciliationStatus.MISMATCH;
          reason = 'Wallet refund transaction amount does not match the settlement refunded amount.';
        }
      } else if (!settlement.lastStripeRefundId) {
        status = PaymentReconciliationStatus.MISSING;
        reason =
          settlement.status === TripPaymentSettlementStatus.REFUND_PENDING
            ? 'Refund is pending and does not have a Stripe refund id yet.'
            : 'Refunded settlement is missing a Stripe refund id.';
      }

      return this.buildPaymentReconciliationDraft({
        stream: PaymentReconciliationStream.REFUND,
        status,
        currency: settlement.currency,
        expectedAmount: settlement.refundedAmount,
        actualAmount,
        reference: settlement.requestId,
        externalReference: settlement.lastStripeRefundId,
        tripId: settlement.requestId,
        refundId: settlement.lastStripeRefundId ?? settlement.id,
        customerId: settlement.customer.id,
        driverId: settlement.driver?.id ?? settlement.driverId,
        customerName: settlement.customer.name,
        customerEmail: settlement.customer.email,
        driverName: settlement.driver?.user.name ?? null,
        driverEmail: settlement.driver?.user.email ?? null,
        reason,
        createdAt: settlement.createdAt,
        updatedAt: settlement.updatedAt,
      });
    });
  }

  private async buildTransferPaymentReconciliationRecords(): Promise<
    PaymentReconciliationRecordDraft[]
  > {
    const earnings = await this.prisma.driverEarning.findMany({
      where: {
        trip: {
          paymentSettlement: {
            isNot: null,
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
      select: {
        id: true,
        tripId: true,
        netAmount: true,
        currency: true,
        status: true,
        stripeTransferId: true,
        stripeTransferStatus: true,
        createdAt: true,
        updatedAt: true,
        driver: {
          select: {
            id: true,
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
        trip: {
          select: {
            customer: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            paymentSettlement: {
              select: {
                id: true,
                driverShareAmount: true,
                driverPayoutState: true,
                payoutFailureReason: true,
                updatedAt: true,
              },
            },
          },
        },
      },
    });

    return earnings
      .filter((earning) =>
        Boolean(
          earning.trip.paymentSettlement &&
            (earning.trip.paymentSettlement.driverPayoutState !==
              DriverPayoutState.NOT_EARNED ||
              earning.stripeTransferId ||
              earning.status === DriverEarningStatus.PAID_OUT),
        ),
      )
      .map((earning) => {
        const settlement = earning.trip.paymentSettlement;
        if (!settlement) {
          return this.buildPaymentReconciliationDraft({
            stream: PaymentReconciliationStream.TRANSFER,
            status: PaymentReconciliationStatus.MISSING,
            currency: earning.currency,
            expectedAmount: earning.netAmount,
            actualAmount: null,
            reference: earning.tripId,
            externalReference: earning.stripeTransferId,
            tripId: earning.tripId,
            transferId: earning.stripeTransferId,
            customerId: earning.trip.customer.id,
            driverId: earning.driver.id,
            customerName: earning.trip.customer.name,
            customerEmail: earning.trip.customer.email,
            driverName: earning.driver.user.name,
            driverEmail: earning.driver.user.email,
            reason: 'Driver earning is missing a payout settlement.',
            createdAt: earning.createdAt,
            updatedAt: earning.updatedAt,
          });
        }

        let status: PaymentReconciliationStatus = PaymentReconciliationStatus.MATCHED;
        let reason: string | null = null;

        if (!this.decimalsEqual(settlement.driverShareAmount, earning.netAmount)) {
          status = PaymentReconciliationStatus.MISMATCH;
          reason = 'Driver earning amount does not match the settlement driver share.';
        } else if (settlement.driverPayoutState === DriverPayoutState.PAID_OUT) {
          if (!earning.stripeTransferId) {
            status = PaymentReconciliationStatus.MISSING;
            reason = 'Paid-out earning is missing a Stripe transfer id.';
          } else if (earning.stripeTransferStatus !== 'paid') {
            status = PaymentReconciliationStatus.MISMATCH;
            reason = 'Paid-out earning has a non-paid Stripe transfer status.';
          } else if (earning.status !== DriverEarningStatus.PAID_OUT) {
            status = PaymentReconciliationStatus.MISMATCH;
            reason = 'Settlement is paid out but earning status is not PAID_OUT.';
          }
        } else if (
          settlement.driverPayoutState === DriverPayoutState.TRANSFER_FAILED
        ) {
          status = PaymentReconciliationStatus.FAILED;
          reason =
            settlement.payoutFailureReason ?? 'Driver payout transfer failed.';
        }

        return this.buildPaymentReconciliationDraft({
          stream: PaymentReconciliationStream.TRANSFER,
          status,
          currency: earning.currency,
          expectedAmount: earning.netAmount,
          actualAmount: settlement.driverShareAmount,
          reference: earning.tripId,
          externalReference: earning.stripeTransferId,
          tripId: earning.tripId,
          transferId: earning.stripeTransferId,
          customerId: earning.trip.customer.id,
          driverId: earning.driver.id,
          customerName: earning.trip.customer.name,
          customerEmail: earning.trip.customer.email,
          driverName: earning.driver.user.name,
          driverEmail: earning.driver.user.email,
          reason,
          createdAt: earning.createdAt,
          updatedAt: settlement.updatedAt,
        });
      });
  }

  private buildPaymentReconciliationDraft(input: {
    stream: PaymentReconciliationStream;
    status: PaymentReconciliationStatus;
    currency: string;
    expectedAmount: Prisma.Decimal | null;
    actualAmount: Prisma.Decimal | null;
    reference: string | null;
    externalReference?: string | null;
    tripId?: string | null;
    walletTopUpId?: string | null;
    transferId?: string | null;
    refundId?: string | null;
    captureId?: string | null;
    customerId?: string | null;
    driverId?: string | null;
    customerName?: string | null;
    customerEmail?: string | null;
    driverName?: string | null;
    driverEmail?: string | null;
    reason?: string | null;
    resolvedAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): PaymentReconciliationRecordDraft {
    return {
      stream: input.stream,
      status: input.status,
      currency: input.currency,
      expectedAmount: input.expectedAmount,
      actualAmount: input.actualAmount,
      deltaAmount: this.calculateDeltaAmount(input.expectedAmount, input.actualAmount),
      reference: input.reference ?? null,
      externalReference: input.externalReference ?? null,
      tripId: input.tripId ?? null,
      walletTopUpId: input.walletTopUpId ?? null,
      transferId: input.transferId ?? null,
      refundId: input.refundId ?? null,
      captureId: input.captureId ?? null,
      customerId: input.customerId ?? null,
      driverId: input.driverId ?? null,
      customerName: input.customerName ?? null,
      customerEmail: input.customerEmail ?? null,
      driverName: input.driverName ?? null,
      driverEmail: input.driverEmail ?? null,
      reason: input.reason ?? null,
      resolvedAt: input.status === PaymentReconciliationStatus.MATCHED ? input.updatedAt : input.resolvedAt ?? null,
    };
  }

  private summarizePaymentReconciliationRecords(
    records: PaymentReconciliationRecordDraft[],
  ) {
    return records.reduce(
      (summary, record) => {
        summary.scannedCount += 1;

        if (record.status === PaymentReconciliationStatus.MATCHED) {
          summary.matchedCount += 1;
        } else if (record.status === PaymentReconciliationStatus.MISMATCH) {
          summary.mismatchCount += 1;
        } else if (record.status === PaymentReconciliationStatus.MISSING) {
          summary.missingCount += 1;
        }

        return summary;
      },
      {
        scannedCount: 0,
        matchedCount: 0,
        mismatchCount: 0,
        missingCount: 0,
      },
    );
  }

  private getPaymentReconciliationSummary(
    runs: Array<{
      stream: PaymentReconciliationStream;
      scannedCount: number;
      mismatchCount: number;
      status: PaymentReconciliationRunStatus;
    }>,
  ): AdminPaymentReconciliationSummaryDto {
    return runs.reduce<AdminPaymentReconciliationSummaryDto>(
      (summary, run) => {
        if (run.stream === PaymentReconciliationStream.WALLET) {
          summary.walletCount = run.scannedCount;
        } else if (run.stream === PaymentReconciliationStream.CAPTURE) {
          summary.captureCount = run.scannedCount;
        } else if (run.stream === PaymentReconciliationStream.REFUND) {
          summary.refundCount = run.scannedCount;
        } else if (run.stream === PaymentReconciliationStream.TRANSFER) {
          summary.transferCount = run.scannedCount;
        }

        summary.mismatchCount += run.mismatchCount;
        if (run.status === PaymentReconciliationRunStatus.FAILED) {
          summary.failedJobCount += 1;
        }

        return summary;
      },
      {
        walletCount: 0,
        captureCount: 0,
        refundCount: 0,
        transferCount: 0,
        mismatchCount: 0,
        failedJobCount: 0,
      },
    );
  }

  private mapPaymentReconciliationRun(run: {
    id: string;
    stream: PaymentReconciliationStream;
    status: PaymentReconciliationRunStatus;
    startedAt: Date;
    finishedAt: Date | null;
    scannedCount: number;
    matchedCount: number;
    mismatchCount: number;
    missingCount: number;
    errorMessage: string | null;
  }): AdminPaymentReconciliationJobRunDto {
    return {
      id: run.id,
      stream: this.formatPaymentReconciliationStream(run.stream),
      status: run.status,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
      scannedCount: run.scannedCount,
      matchedCount: run.matchedCount,
      mismatchCount: run.mismatchCount,
      missingCount: run.missingCount,
      errorMessage: run.errorMessage,
    };
  }

  private mapPaymentReconciliationRecord(
    record: PaymentReconciliationRecordRow,
  ): AdminPaymentReconciliationItemDto {
    return {
      id: record.id,
      stream: this.formatPaymentReconciliationStream(record.stream),
      status: this.formatPaymentReconciliationStatus(record.status),
      currency: record.currency,
      expectedAmount: this.decimalLikeToNumber(record.expectedAmount),
      actualAmount: this.decimalLikeToNumber(record.actualAmount),
      deltaAmount: this.decimalLikeToNumber(record.deltaAmount),
      reference: record.reference,
      externalReference: record.externalReference,
      tripId: record.tripId,
      walletTopUpId: record.walletTopUpId,
      transferId: record.transferId,
      refundId: record.refundId,
      captureId: record.captureId,
      customer: record.customerId || record.customerName || record.customerEmail
        ? {
            id: record.customerId,
            name: record.customerName,
            email: record.customerEmail,
          }
        : null,
      driver: record.driverId || record.driverName || record.driverEmail
        ? {
            id: record.driverId,
            name: record.driverName,
            email: record.driverEmail,
          }
        : null,
      reason: record.reason,
      jobRunId: record.runId,
      detectedAt: record.createdAt.toISOString(),
      resolvedAt: record.resolvedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private mapPaymentReconciliationStreamValue(
    stream: Exclude<AdminPaymentReconciliationStreamFilter, 'all'>,
  ): PaymentReconciliationStream {
    if (stream === 'wallet') {
      return PaymentReconciliationStream.WALLET;
    }

    if (stream === 'captures') {
      return PaymentReconciliationStream.CAPTURE;
    }

    if (stream === 'refunds') {
      return PaymentReconciliationStream.REFUND;
    }

    return PaymentReconciliationStream.TRANSFER;
  }

  private mapPaymentReconciliationStreamFilter(
    stream: AdminPaymentReconciliationStreamFilter,
  ): PaymentReconciliationStream | null {
    if (stream === 'all') {
      return null;
    }

    return this.mapPaymentReconciliationStreamValue(stream);
  }

  private mapPaymentReconciliationStatusFilter(
    status: AdminPaymentReconciliationStatusFilter,
  ): PaymentReconciliationStatus | null {
    if (status === 'all') {
      return null;
    }

    if (status === 'matched') {
      return PaymentReconciliationStatus.MATCHED;
    }

    if (status === 'mismatch') {
      return PaymentReconciliationStatus.MISMATCH;
    }

    if (status === 'missing') {
      return PaymentReconciliationStatus.MISSING;
    }

    return PaymentReconciliationStatus.FAILED;
  }

  private formatPaymentReconciliationStream(
    stream: PaymentReconciliationStream,
  ): Exclude<AdminPaymentReconciliationStreamFilter, 'all'> {
    if (stream === PaymentReconciliationStream.WALLET) {
      return 'wallet';
    }

    if (stream === PaymentReconciliationStream.CAPTURE) {
      return 'captures';
    }

    if (stream === PaymentReconciliationStream.REFUND) {
      return 'refunds';
    }

    return 'transfers';
  }

  private formatPaymentReconciliationStatus(
    status: PaymentReconciliationStatus,
  ): Exclude<AdminPaymentReconciliationStatusFilter, 'all'> {
    if (status === PaymentReconciliationStatus.MATCHED) {
      return 'matched';
    }

    if (status === PaymentReconciliationStatus.MISMATCH) {
      return 'mismatch';
    }

    if (status === PaymentReconciliationStatus.MISSING) {
      return 'missing';
    }

    return 'failed';
  }

  private async loadPaymentReconciliationRecords(input: {
    runIds: string[];
    stream: PaymentReconciliationStream | null;
    status: PaymentReconciliationStatus | null;
    page: number;
    limit: number;
  }): Promise<PaymentReconciliationRecordRow[]> {
    const whereSql = this.buildPaymentReconciliationRecordWhereSql(input);
    const offset = Math.max(input.page - 1, 0) * input.limit;

    return this.prisma.$queryRaw<PaymentReconciliationRecordRow[]>(
      Prisma.sql`
        SELECT
          id,
          "runId",
          stream,
          status,
          currency,
          "expectedAmount",
          "actualAmount",
          "deltaAmount",
          reference,
          "externalReference",
          "tripId",
          "walletTopUpId",
          "transferId",
          "refundId",
          "captureId",
          "customerId",
          "driverId",
          "customerName",
          "customerEmail",
          "driverName",
          "driverEmail",
          reason,
          "resolvedAt",
          "createdAt",
          "updatedAt"
        FROM "payment_reconciliation_records"
        ${whereSql}
        ORDER BY "updatedAt" DESC, "createdAt" DESC
        OFFSET ${offset}
        LIMIT ${input.limit}
      `,
    );
  }

  private async countPaymentReconciliationRecords(input: {
    runIds: string[];
    stream: PaymentReconciliationStream | null;
    status: PaymentReconciliationStatus | null;
  }): Promise<number> {
    const whereSql = this.buildPaymentReconciliationRecordWhereSql(input);
    const rows = await this.prisma.$queryRaw<Array<{ count: bigint | number }>>(
      Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "payment_reconciliation_records"
        ${whereSql}
      `,
    );

    return Number(rows[0]?.count ?? 0);
  }

  private buildPaymentReconciliationRecordWhereSql(input: {
    runIds: string[];
    stream: PaymentReconciliationStream | null;
    status: PaymentReconciliationStatus | null;
  }) {
    const clauses: Prisma.Sql[] = [];

    if (input.runIds.length > 0) {
      clauses.push(
        Prisma.sql`"runId" IN (${Prisma.join(input.runIds.map((runId) => Prisma.sql`${runId}`))})`,
      );
    } else {
      clauses.push(Prisma.sql`1 = 0`);
    }

    if (input.stream) {
      clauses.push(
        Prisma.sql`stream = ${input.stream}::"PaymentReconciliationStream"`,
      );
    }

    if (input.status) {
      clauses.push(
        Prisma.sql`status = ${input.status}::"PaymentReconciliationStatus"`,
      );
    }

    return Prisma.sql`WHERE ${Prisma.join(clauses, ' AND ')}`;
  }

  private async insertPaymentReconciliationRecords(
    runId: string,
    records: PaymentReconciliationRecordDraft[],
  ): Promise<void> {
    if (records.length === 0) {
      return;
    }

    await this.prisma.$transaction(
      records.map((record) =>
        this.prisma.$executeRaw(
          Prisma.sql`
            INSERT INTO "payment_reconciliation_records" (
              id,
              "runId",
              stream,
              status,
              currency,
              "expectedAmount",
              "actualAmount",
              "deltaAmount",
              reference,
              "externalReference",
              "tripId",
              "walletTopUpId",
              "transferId",
              "refundId",
              "captureId",
              "customerId",
              "driverId",
              "customerName",
              "customerEmail",
              "driverName",
              "driverEmail",
              reason,
              "resolvedAt",
              "createdAt",
              "updatedAt"
            )
            VALUES (
              ${this.createCuid()},
              ${runId},
              ${record.stream}::"PaymentReconciliationStream",
              ${record.status}::"PaymentReconciliationStatus",
              ${record.currency},
              ${record.expectedAmount},
              ${record.actualAmount},
              ${record.deltaAmount},
              ${record.reference},
              ${record.externalReference},
              ${record.tripId},
              ${record.walletTopUpId},
              ${record.transferId},
              ${record.refundId},
              ${record.captureId},
              ${record.customerId},
              ${record.driverId},
              ${record.customerName},
              ${record.customerEmail},
              ${record.driverName},
              ${record.driverEmail},
              ${record.reason},
              ${record.resolvedAt},
              NOW(),
              NOW()
            )
          `,
        ),
      ),
    );
  }

  private async updatePaymentReconciliationRun(
    runId: string,
    input: {
      status: PaymentReconciliationRunStatus;
      finishedAt: Date;
      errorMessage: string | null;
      scannedCount?: number;
      matchedCount?: number;
      mismatchCount?: number;
      missingCount?: number;
    },
  ): Promise<PaymentReconciliationRunRow> {
    const rows = await this.prisma.$queryRaw<PaymentReconciliationRunRow[]>(
      Prisma.sql`
        UPDATE "payment_reconciliation_runs"
        SET
          status = ${input.status}::"PaymentReconciliationRunStatus",
          "scannedCount" = ${input.scannedCount ?? 0},
          "matchedCount" = ${input.matchedCount ?? 0},
          "mismatchCount" = ${input.mismatchCount ?? 0},
          "missingCount" = ${input.missingCount ?? 0},
          "finishedAt" = ${input.finishedAt},
          "errorMessage" = ${input.errorMessage},
          "updatedAt" = NOW()
        WHERE id = ${runId}
        RETURNING
          id,
          stream,
          status,
          "scannedCount",
          "matchedCount",
          "mismatchCount",
          "missingCount",
          "errorMessage",
          "startedAt",
          "finishedAt",
          "createdAt",
          "updatedAt"
      `,
    );

    if (!rows[0]) {
      throw new NotFoundException('Payment reconciliation run not found.');
    }

    return rows[0];
  }

  private createCuid(): string {
    return randomUUID().replace(/-/g, '');
  }

  private sumDecimalValues(values: Prisma.Decimal[]): Prisma.Decimal | null {
    if (values.length === 0) {
      return null;
    }

    return values.reduce(
      (total, value) => total.add(value),
      new Prisma.Decimal(0),
    );
  }

  private decimalsEqual(
    left: Prisma.Decimal | null,
    right: Prisma.Decimal | null,
  ): boolean {
    if (left === null || right === null) {
      return false;
    }

    return left.toDecimalPlaces(2).equals(right.toDecimalPlaces(2));
  }

  private calculateDeltaAmount(
    expectedAmount: Prisma.Decimal | null,
    actualAmount: Prisma.Decimal | null,
  ): Prisma.Decimal | null {
    if (expectedAmount === null || actualAmount === null) {
      return null;
    }

    return actualAmount.sub(expectedAmount);
  }

  private decimalLikeToNumber(
    value: Prisma.Decimal | number | string | null,
  ): number | null {
    if (value === null) {
      return null;
    }

    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'string') {
      return Number(value);
    }

    return Number(value);
  }

  private async getDriverReviewProfile(
    id: string,
  ): Promise<ReviewProfileSource> {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { id },
      select: this.driverReviewSelect(),
    });

    if (!profile || !profile.submittedForReviewAt) {
      throw new NotFoundException('Driver review request not found.');
    }

    return profile;
  }

  private buildDeliveryOperationsWhere(
    query: AdminDeliveryOperationsQueryDto,
  ): Prisma.TransportRequestWhereInput {
    const where: Prisma.TransportRequestWhereInput = {};

    if (query.view === 'active') {
      where.status = {
        in: [
          'ACCEPTED',
          'DRIVER_ASSIGNED',
          'DRIVER_GOING_TO_PICKUP',
          'DRIVER_ARRIVED_PICKUP',
          'ITEM_PICKED_UP',
          'PICKUP_IN_PROGRESS',
          'IN_TRANSIT',
          'DRIVER_GOING_TO_DROPOFF',
        ],
      };
    } else if (query.view === 'unassigned') {
      where.assignedDriverId = null;
      where.status = { notIn: ['COMPLETED', 'DELIVERED', 'CANCELLED'] };
    } else if (query.view === 'completed') {
      where.status = { in: ['COMPLETED', 'DELIVERED'] };
    } else if (query.view === 'cancelled') {
      where.status = 'CANCELLED';
    }

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { id: { contains: search, mode: 'insensitive' } },
        { pickupAddress: { contains: search, mode: 'insensitive' } },
        { dropoffAddress: { contains: search, mode: 'insensitive' } },
        { customer: { is: { name: { contains: search, mode: 'insensitive' } } } },
        { customer: { is: { email: { contains: search, mode: 'insensitive' } } } },
        {
          assignedDriver: {
            is: { user: { is: { name: { contains: search, mode: 'insensitive' } } } },
          },
        },
      ];
    }

    return where;
  }

  private async getDeliveryOperationsSummary(): Promise<AdminDeliveryOperationsSummaryDto> {
    const [total, active, unassigned, completed] = await Promise.all([
      this.prisma.transportRequest.count(),
      this.prisma.transportRequest.count({
        where: {
          status: {
            in: [
              'ACCEPTED', 'DRIVER_ASSIGNED', 'DRIVER_GOING_TO_PICKUP',
              'DRIVER_ARRIVED_PICKUP', 'ITEM_PICKED_UP', 'PICKUP_IN_PROGRESS',
              'IN_TRANSIT', 'DRIVER_GOING_TO_DROPOFF',
            ],
          },
        },
      }),
      this.prisma.transportRequest.count({
        where: { assignedDriverId: null, status: { notIn: ['COMPLETED', 'DELIVERED', 'CANCELLED'] } },
      }),
      this.prisma.transportRequest.count({ where: { status: { in: ['COMPLETED', 'DELIVERED'] } } }),
    ]);

    return { total, active, unassigned, completed };
  }

  private deliveryOperationsSelect() {
    return {
      id: true, status: true, createdAt: true, submittedAt: true, scheduledPickupAt: true,
      isImmediate: true, pickupAddress: true, dropoffAddress: true, itemTitle: true,
      itemType: true, itemDescription: true, itemBrand: true, itemModel: true, itemYear: true,
      itemCondition: true, itemWeightKg: true, itemLengthCm: true, itemWidthCm: true,
      itemHeightCm: true, specialInstructions: true, customerNote: true, goodsDescription: true,
      goodsNumberOfPieces: true, goodsIsFragile: true, furnitureDescription: true,
      furnitureApproximateItemCount: true, vehicleVin: true, vehicleBrand: true,
      vehicleModel: true, vehicleManufactureYear: true, acceptedOfferId: true, acceptedAt: true,
      driverArrivedPickupAt: true, itemPickedUpAt: true, driverGoingToDropoffAt: true,
      deliveredAt: true, completedAt: true, pickupNotes: true, deliveryNotes: true,
      pickupProofImageUrl: true, deliveryProofImageUrl: true,
      pickupConfirmedByDriver: true, deliveryConfirmedByDriver: true, finalPrice: true,
      currency: true, paymentStatus: true, paymentMethod: true, heldAmount: true,
      capturedAmount: true,
      service: { select: { nameEn: true } },
      customer: { select: { id: true, name: true, email: true, phoneNumber: true } },
      assignedDriver: {
        select: { id: true, phone: true, user: { select: { name: true, email: true, phoneNumber: true } } },
      },
      offers: {
        orderBy: { createdAt: 'asc' as const },
        select: {
          id: true, price: true, currency: true, status: true, message: true,
          estimatedPickupAt: true, estimatedDeliveryAt: true, estimatedDurationMinutes: true,
          createdAt: true, acceptedAt: true, rejectedAt: true, cancelledAt: true,
          driver: { select: { id: true, phone: true, user: { select: { name: true, email: true, phoneNumber: true } } } },
        },
      },
      photos: { orderBy: { sortOrder: 'asc' as const }, select: { id: true, url: true, originalName: true, createdAt: true } },
      proofPhotos: { orderBy: { createdAt: 'asc' as const }, select: { id: true, type: true, url: true, originalName: true, createdAt: true } },
    };
  }

  private mapDeliveryOperationsRecord(record: DeliveryOperationsSource): AdminDeliveryOperationsItemDto {
    return {
      id: record.id,
      status: record.status,
      service: record.service.nameEn,
      createdAt: record.createdAt.toISOString(),
      submittedAt: record.submittedAt?.toISOString() ?? null,
      scheduledPickupAt: record.scheduledPickupAt?.toISOString() ?? null,
      isImmediate: record.isImmediate,
      customer: this.deliveryOperationsCustomer(record.customer),
      assignedDriver: record.assignedDriver ? this.deliveryOperationsDriver(record.assignedDriver) : null,
      acceptedOfferId: record.acceptedOfferId,
      route: { pickupAddress: record.pickupAddress, dropoffAddress: record.dropoffAddress },
      item: {
        title: record.itemTitle,
        type: record.itemType,
        description: record.itemDescription,
        details: {
          brand: record.itemBrand ?? record.vehicleBrand, model: record.itemModel ?? record.vehicleModel,
          year: record.itemYear ?? record.vehicleManufactureYear, condition: record.itemCondition,
          weightKg: record.itemWeightKg, dimensionsCm: [record.itemLengthCm, record.itemWidthCm, record.itemHeightCm].every((value) => value !== null) ? `${record.itemLengthCm} × ${record.itemWidthCm} × ${record.itemHeightCm}` : null,
          vin: record.vehicleVin, goodsDescription: record.goodsDescription, pieces: record.goodsNumberOfPieces,
          fragile: record.goodsIsFragile || null, furnitureDescription: record.furnitureDescription,
          furnitureItemCount: record.furnitureApproximateItemCount, instructions: record.specialInstructions,
          customerNote: record.customerNote,
        },
      },
      offers: record.offers.map((offer) => this.mapDeliveryOperationsOffer(offer)),
      delivery: {
        acceptedAt: record.acceptedAt?.toISOString() ?? null,
        driverArrivedPickupAt: record.driverArrivedPickupAt?.toISOString() ?? null,
        itemPickedUpAt: record.itemPickedUpAt?.toISOString() ?? null,
        driverGoingToDropoffAt: record.driverGoingToDropoffAt?.toISOString() ?? null,
        deliveredAt: record.deliveredAt?.toISOString() ?? null,
        completedAt: (record.completedAt ?? record.deliveredAt)?.toISOString() ?? null,
        pickupNotes: record.pickupNotes, deliveryNotes: record.deliveryNotes,
        pickupConfirmedByDriver: record.pickupConfirmedByDriver,
        deliveryConfirmedByDriver: record.deliveryConfirmedByDriver,
      },
      payment: {
        finalPrice: this.decimalLikeToNumber(record.finalPrice), currency: record.currency,
        status: record.paymentStatus, method: record.paymentMethod,
        heldAmount: this.decimalLikeToNumber(record.heldAmount), capturedAmount: this.decimalLikeToNumber(record.capturedAmount),
      },
      photos: record.photos.map((photo): AdminDeliveryOperationsPhotoDto => ({ id: photo.id, url: photo.url, type: null, originalName: photo.originalName, createdAt: photo.createdAt.toISOString() })),
      proofPhotos: [
        ...record.proofPhotos.map((photo): AdminDeliveryOperationsPhotoDto => ({ id: photo.id, url: photo.url, type: photo.type, originalName: photo.originalName, createdAt: photo.createdAt.toISOString() })),
        ...(record.pickupProofImageUrl ? [{ id: `legacy-pickup-${record.id}`, url: record.pickupProofImageUrl, type: 'PICKUP', originalName: null, createdAt: record.itemPickedUpAt?.toISOString() ?? record.createdAt.toISOString() }] : []),
        ...(record.deliveryProofImageUrl ? [{ id: `legacy-delivery-${record.id}`, url: record.deliveryProofImageUrl, type: 'DELIVERY', originalName: null, createdAt: record.deliveredAt?.toISOString() ?? record.createdAt.toISOString() }] : []),
      ],
    };
  }

  private deliveryOperationsCustomer(customer: DeliveryOperationsSource['customer']): AdminDeliveryOperationsPartyDto {
    return { id: customer.id, name: customer.name, email: customer.email, phone: customer.phoneNumber };
  }

  private deliveryOperationsDriver(driver: NonNullable<DeliveryOperationsSource['assignedDriver']>): AdminDeliveryOperationsPartyDto {
    return { id: driver.id, name: driver.user.name, email: driver.user.email, phone: driver.phone || driver.user.phoneNumber };
  }

  private mapDeliveryOperationsOffer(offer: DeliveryOperationsSource['offers'][number]): AdminDeliveryOperationsOfferDto {
    const respondedAt = offer.acceptedAt ?? offer.rejectedAt ?? offer.cancelledAt;
    return {
      id: offer.id, driver: this.deliveryOperationsDriver(offer.driver), price: this.decimalLikeToNumber(offer.price) ?? 0,
      currency: offer.currency, status: offer.status, message: offer.message,
      estimatedPickupAt: offer.estimatedPickupAt?.toISOString() ?? null,
      estimatedDeliveryAt: offer.estimatedDeliveryAt?.toISOString() ?? null,
      estimatedDurationMinutes: offer.estimatedDurationMinutes, sentAt: offer.createdAt.toISOString(),
      respondedAt: respondedAt?.toISOString() ?? null,
    };
  }

  private localUploadImage(
    storageKeyOrUrl: string,
    mimeType?: string,
  ): { path: string; mimeType: string } {
    const storageKey = storageKeyOrUrl.replace(/^\/+/, '');
    const uploadsRoot = resolve(process.cwd(), 'uploads');
    const path = resolve(process.cwd(), storageKey);

    if (
      !storageKey.startsWith('uploads/') ||
      !(path === uploadsRoot || path.startsWith(`${uploadsRoot}${sep}`)) ||
      !existsSync(path)
    ) {
      throw new NotFoundException('Delivery proof image not found.');
    }

    const inferredMimeType = {
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
    }[extname(path).toLowerCase()] ?? 'image/jpeg';

    return { path, mimeType: mimeType ?? inferredMimeType };
  }

  private adminUserSelect() {
    return {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
    };
  }

  private driverReviewSelect() {
    return {
      id: true,
      userId: true,
      firstName: true,
      lastName: true,
      phone: true,
      city: true,
      coverageAreas: true,
      identityDocumentKind: true,
      status: true,
      submittedForReviewAt: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: {
          name: true,
          email: true,
        },
      },
      documents: {
        where: {
          vehicleId: null,
        },
        orderBy: { createdAt: 'desc' as const },
        select: this.driverReviewDocumentSelect(),
      },
      vehicles: {
        orderBy: [
          { isActive: 'desc' as const },
          { updatedAt: 'desc' as const },
        ],
        select: {
          id: true,
          vehicleType: true,
          make: true,
          model: true,
          year: true,
          plateNumber: true,
          status: true,
          rejectionReason: true,
          isActive: true,
          capacityKg: true,
          lengthCm: true,
          widthCm: true,
          heightCm: true,
          allowedCargoTypes: true,
          workingSchedule: true,
          createdAt: true,
          updatedAt: true,
          documents: {
            orderBy: { createdAt: 'desc' as const },
            select: this.driverReviewDocumentSelect(),
          },
        },
      },
    };
  }

  private driverReviewDocumentSelect() {
    return {
      id: true,
      vehicleId: true,
      type: true,
      url: true,
      mimeType: true,
      sizeBytes: true,
      status: true,
      rejectionReason: true,
      expiresAt: true,
      reviewedAt: true,
      createdAt: true,
    };
  }

  private mapToResponse(user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
  }): AdminUserResponseDto {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as 'ADMIN',
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      deletedAt: user.deletedAt ? user.deletedAt.toISOString() : null,
    };
  }

  private mapDriverReview(
    profile: ReviewProfileSource,
  ): AdminDriverReviewResponseDto {
    const onboardingDocuments = this.uniqueLatestDocumentsByType(
      profile.documents,
    ).map((document) => this.mapReviewDocument(document));
    const reviewVehicle = this.pickReviewVehicle(profile.vehicles);

    return {
      id: profile.id,
      userId: profile.userId,
      name:
        profile.user.name.trim() ||
        `${profile.firstName} ${profile.lastName}`.trim(),
      email: profile.user.email,
      phone: profile.phone,
      city: profile.city,
      coverageAreas: profile.coverageAreas,
      identityDocumentKind: profile.identityDocumentKind,
      status: profile.status,
      submittedForReviewAt: profile.submittedForReviewAt
        ? profile.submittedForReviewAt.toISOString()
        : null,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
      onboardingDocuments,
      vehicles: profile.vehicles.map((vehicle) => this.mapReviewVehicle(vehicle)),
      vehicle: reviewVehicle ? this.mapReviewVehicle(reviewVehicle) : null,
    };
  }

  private mapReviewVehicle(
    vehicle: ReviewVehicleSource,
  ): AdminDriverReviewVehicleDto {
    const documents = this.uniqueLatestDocumentsByType(vehicle.documents).map(
      (document) => this.mapReviewDocument(document),
    );

    return {
      id: vehicle.id,
      vehicleType: vehicle.vehicleType,
      brand: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      licensePlateNumber: vehicle.plateNumber,
      status: vehicle.status,
      rejectionReason: vehicle.rejectionReason,
      isActive: vehicle.isActive,
      hasRequiredDocuments: this.hasRequiredVehicleDocuments(vehicle.documents),
      hasLoadCapacityProfile: this.hasVehicleLoadCapacityProfile(vehicle),
      createdAt: vehicle.createdAt.toISOString(),
      updatedAt: vehicle.updatedAt.toISOString(),
      documents,
    };
  }

  private mapReviewDocument(
    document: ReviewDocumentSource,
  ): AdminDriverReviewDocumentDto {
    return {
      id: document.id,
      type: document.type,
      url: document.url,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      status: document.status,
      rejectionReason: document.rejectionReason,
      expiresAt: document.expiresAt ? document.expiresAt.toISOString() : null,
      reviewedAt: document.reviewedAt
        ? document.reviewedAt.toISOString()
        : null,
      uploadedAt: document.createdAt.toISOString(),
    };
  }

  private uniqueLatestDocumentsByType(
    documents: ReviewDocumentSource[],
  ): ReviewDocumentSource[] {
    const byType = new Map<DriverDocumentType, ReviewDocumentSource>();

    for (const document of documents) {
      if (!byType.has(document.type)) {
        byType.set(document.type, document);
      }
    }

    return [...byType.values()];
  }

  private pickReviewVehicle(
    vehicles: ReviewVehicleSource[],
  ): ReviewVehicleSource | null {
    if (vehicles.length === 0) {
      return null;
    }

    const hasReviewEvidence = (vehicle: ReviewVehicleSource): boolean =>
      vehicle.documents.some(
        (document) =>
          DRIVER_CANONICAL_VEHICLE_DOCUMENT_TYPES.includes(document.type) ||
          document.status === DocumentStatus.UNDER_REVIEW,
      );

    return (
      vehicles.find(
        (vehicle) =>
          vehicle.status === DriverVehicleReviewStatus.PENDING_REVIEW &&
          hasReviewEvidence(vehicle),
      ) ??
      vehicles.find(hasReviewEvidence) ??
      vehicles.find(
        (vehicle) =>
          vehicle.status === DriverVehicleReviewStatus.PENDING_REVIEW,
      ) ??
      vehicles[0]
    );
  }

  private hasRequiredVehicleDocuments(
    documents: Array<{ type: DriverDocumentType; status: DocumentStatus }>,
  ): boolean {
    const latestDocuments = this.uniqueLatestDocumentsByType(
      documents as ReviewDocumentSource[],
    ).filter((document) => document.status !== DocumentStatus.REJECTED);
    const documentTypes = new Set(
      latestDocuments.map((document) => document.type),
    );

    return DRIVER_CANONICAL_VEHICLE_DOCUMENT_TYPES.every((type) =>
      documentTypes.has(type),
    );
  }

  private hasVehicleLoadCapacityProfile(
    vehicle: Pick<
      ReviewVehicleSource,
      | 'vehicleType'
      | 'capacityKg'
      | 'lengthCm'
      | 'widthCm'
      | 'heightCm'
      | 'allowedCargoTypes'
    >,
  ): boolean {
    if (!vehicle.allowedCargoTypes.length) {
      return false;
    }

    if (
      vehicle.vehicleType === VehicleType.FLATBED_OPEN ||
      vehicle.vehicleType === VehicleType.FLATBED_ENCLOSED
    ) {
      return true;
    }

    return (
      vehicle.capacityKg !== null &&
      vehicle.capacityKg > 0 &&
      vehicle.lengthCm !== null &&
      vehicle.lengthCm > 0 &&
      vehicle.widthCm !== null &&
      vehicle.widthCm > 0 &&
      vehicle.heightCm !== null &&
      vehicle.heightCm > 0
    );
  }
}
