import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  forwardRef,
} from '@nestjs/common';
type MulterFile = Express.Multer.File;
import { unlink } from 'node:fs/promises';
import { relative } from 'node:path';
import {
  AdditionalChargeStatus,
  CustomerWalletTopUpStatus,
  DriverPayoutState,
  DriverEarningStatus,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  PaymentTransactionType,
  Prisma,
  TripPaymentSettlementStatus,
  TransportRequestStatus,
} from '@prisma/client';

import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { DriverPayoutQueueService } from './driver-payout-queue.service';
import {
  AdditionalChargeResponseDto,
  CancelTripPaymentResponseDto,
  CustomerWalletSummaryDto,
  CustomerWalletTopUpDto,
  CustomerWalletTopUpResponseDto,
  CustomerWalletTransactionDto,
  PaymentSummaryDto,
  SavedPaymentMethodSummaryDto,
  TripPaymentSettlementDto,
} from './dto/request-payment.dto';
import {
  StripeCardPaymentMethodSummary,
  StripeService,
} from './stripe.service';

type CreateHoldInput = {
  customerId: string;
  requestId: string;
  acceptedOfferId: string;
  driverId: string;
  amount: Prisma.Decimal;
  currency: string;
  paymentMethod: PaymentMethod;
  stripePaymentMethodId?: string;
};

type CancelPaymentInput = {
  customerId: string;
  requestId: string;
};

type CancelTripInput = {
  customerId: string;
  requestId: string;
};

type CreateAdditionalChargeInput = {
  driverUserId: string;
  requestId: string;
  amount: number;
  currency: string;
  reason: string;
  equipmentType?: string;
  invoiceFile: MulterFile;
};

type ApproveAdditionalChargeInput = {
  customerId: string;
  requestId: string;
  chargeId: string;
  confirmationLocale: string;
  confirmationText: string;
  paymentOption: 'SAVED_CARD' | 'CASH_ON_DELIVERY';
};

type SaveDefaultPaymentMethodInput = {
  customerId: string;
  stripePaymentMethodId: string;
};

type CreateWalletTopUpInput = {
  customerId: string;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
};

type GetWalletTopUpInput = {
  customerId: string;
  topUpId: string;
};

type WalletRecord = {
  id: string;
  customerId: string;
  currency: string;
  balance: Prisma.Decimal;
  reservedBalance: Prisma.Decimal;
};

type WalletTransactionRecord = {
  id: string;
  amount: Prisma.Decimal;
  currency: string;
  type: PaymentTransactionType;
  description: string | null;
  paymentHoldId: string | null;
  walletTopUpId: string | null;
  additionalChargeId: string | null;
  createdAt: Date;
};

type PaymentHoldRecord = {
  id: string;
  requestId: string;
  acceptedOfferId: string;
  customerId: string;
  driverId: string;
  amount: Prisma.Decimal;
  currency: string;
  paymentMethod: PaymentMethod;
  provider: PaymentProvider;
  status: PaymentStatus;
  stripePaymentIntentId: string | null;
  stripeClientSecret: string | null;
  stripeChargeId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type WalletTopUpRecord = {
  id: string;
  walletId: string | null;
  customerId: string;
  amount: Prisma.Decimal;
  currency: string;
  paymentMethod: PaymentMethod;
  provider: PaymentProvider;
  status: CustomerWalletTopUpStatus;
  stripePaymentIntentId: string | null;
  stripeClientSecret: string | null;
  stripeChargeId: string | null;
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
  failureReason: string | null;
  completedAt: Date | null;
  failedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type TripPaymentSettlementRecord = {
  id: string;
  requestId: string;
  paymentHoldId: string;
  customerId: string;
  driverId: string | null;
  currency: string;
  collectedAmount: Prisma.Decimal;
  refundableAmount: Prisma.Decimal;
  refundedAmount: Prisma.Decimal;
  retainedAmount: Prisma.Decimal;
  driverShareAmount: Prisma.Decimal;
  platformShareAmount: Prisma.Decimal;
  status: TripPaymentSettlementStatus;
  driverPayoutState: DriverPayoutState;
  requiresManualReview: boolean;
  lastStripeRefundId: string | null;
  disputeReportedAt: Date | null;
  stripeDisputeId: string | null;
  disputeStatus: string | null;
  disputeReason: string | null;
  disputeAmount: Prisma.Decimal | null;
  disputeCurrency: string | null;
  disputeCreatedAt: Date | null;
  disputeUpdatedAt: Date | null;
  disputeClosedAt: Date | null;
  disputeEvidenceDueBy: Date | null;
  payoutFailureReason: string | null;
  payoutAttemptCount: number;
  lastPayoutAttemptAt: Date | null;
  nextPayoutRetryAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type DriverPayoutAttemptResult = {
  transferred: boolean;
  stripeTransferId: string | null;
  reason: string | null;
};

type DriverPayoutContext = {
  settlementId: string;
  tripId: string;
  customerId: string;
  driverUserId: string;
  driverId: string;
  currency: string;
  earningId: string;
  earningStatus: DriverEarningStatus;
  availableAt: Date | null;
  paidOutAt: Date | null;
  netAmount: Prisma.Decimal;
  stripeTransferId: string | null;
  stripeTransferStatus: string | null;
  destinationAccountId: string | null;
  stripePayoutsEnabled: boolean;
  stripeDetailsSubmitted: boolean;
  payoutAttemptCount: number;
  settlementStatus: TripPaymentSettlementStatus;
  requiresManualReview: boolean;
};

type StripePaymentIntentRecord = {
  id: string;
  status: string;
  latest_charge?: string | { id: string } | null;
  client_secret?: string | null;
  cancellation_reason?: string | null;
  last_payment_error?: {
    message?: string | null;
  } | null;
};

type StripeDisputeRecord = {
  id: string;
  amount: number;
  currency: string;
  reason: string | null;
  status: string | null;
  charge?: string | null;
  payment_intent?: string | null;
  created?: number | null;
  evidence_details?: {
    due_by?: number | null;
  } | null;
};

const ACTIVE_PAYMENT_STATUSES = new Set<PaymentStatus>([
  PaymentStatus.PAYMENT_HOLD_PENDING,
  PaymentStatus.PAYMENT_HELD,
  PaymentStatus.PAYMENT_CAPTURE_PENDING,
]);
const SUCCESSFUL_COLLECTION_STATUSES = new Set<PaymentStatus>([
  PaymentStatus.PAYMENT_CAPTURED,
  PaymentStatus.PAYMENT_PARTIALLY_REFUNDED,
  PaymentStatus.PAYMENT_REFUNDED,
]);
const ADDITIONAL_CHARGE_APP_FEE_PERCENTAGE = new Prisma.Decimal(0);
const TRIP_CANCELLATION_FEE_RATE = new Prisma.Decimal(0.15);
const DRIVER_CANCELLATION_SHARE_RATE = new Prisma.Decimal(0.5);
const STALE_PAYOUT_TRANSFER_MINUTES = 15;
const DRIVER_PAYOUT_RETRY_DELAYS_MINUTES = [5, 30, 120, 360, 720, 1440];
const SUPPORTED_ADDITIONAL_CHARGE_CURRENCIES = new Set([
  'CHF',
  'EUR',
  'AED',
  'SAR',
  'QAR',
  'USD',
]);

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
    private readonly notificationsService: NotificationsService,
    @Optional()
    @Inject(forwardRef(() => DriverPayoutQueueService))
    private readonly driverPayoutQueueService?: DriverPayoutQueueService,
  ) {}

  async createHoldForAcceptedOffer(
    tx: Prisma.TransactionClient,
    input: CreateHoldInput,
  ): Promise<PaymentSummaryDto> {
    const existingHold = await tx.paymentHold.findUnique({
      where: { requestId: input.requestId },
      select: { id: true },
    });

    if (existingHold) {
      throw new ConflictException(
        'A payment hold already exists for this request.',
      );
    }

    const normalizedAmount = this.toMoneyDecimal(input.amount);
    const currency = this.normalizeCurrency(input.currency);

    if (input.paymentMethod === PaymentMethod.APP_WALLET) {
      return this.createWalletHold(tx, {
        ...input,
        amount: normalizedAmount,
        currency,
      });
    }

    return this.createStripeHold(tx, {
      ...input,
      amount: normalizedAmount,
      currency,
    });
  }

  async getRequestPayment(input: {
    customerId: string;
    requestId: string;
  }): Promise<PaymentSummaryDto> {
    const request = await this.prisma.transportRequest.findUnique({
      where: { id: input.requestId },
      select: {
        id: true,
        customerId: true,
        paymentHold: {
          select: PAYMENT_HOLD_SELECT,
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Transport request not found.');
    }

    if (request.customerId !== input.customerId) {
      throw new ForbiddenException('You are not allowed to view this payment.');
    }

    if (!request.paymentHold) {
      throw new NotFoundException('Payment hold not found.');
    }

    if (
      request.paymentHold.provider === PaymentProvider.STRIPE &&
      request.paymentHold.stripePaymentIntentId
    ) {
      const paymentIntent =
        await this.stripeService.retrievePaymentIntentIfExists(
          request.paymentHold.stripePaymentIntentId,
        );
      if (!paymentIntent) {
        await this.prisma.$transaction(async (tx) => {
          await tx.paymentHold.update({
            where: { id: request.paymentHold!.id },
            data: {
              status: PaymentStatus.PAYMENT_FAILED,
              failedAt: new Date(),
            },
          });

          await tx.transportRequest.update({
            where: { id: request.id },
            data: {
              paymentStatus: PaymentStatus.PAYMENT_FAILED,
            },
          });
        });
      } else {
        await this.syncStripePaymentIntent(
          paymentIntent,
          'payment_intent.status_checked',
        );
      }

      const refreshedHold = await this.prisma.paymentHold.findUnique({
        where: { id: request.paymentHold.id },
        select: PAYMENT_HOLD_SELECT,
      });

      if (!refreshedHold) {
        throw new NotFoundException('Payment hold not found.');
      }

      return this.toPaymentSummaryDto(refreshedHold);
    }

    return this.toPaymentSummaryDto(request.paymentHold);
  }

  async cancelRequestPayment(
    input: CancelPaymentInput,
  ): Promise<PaymentSummaryDto> {
    const request = await this.prisma.transportRequest.findUnique({
      where: { id: input.requestId },
      select: {
        id: true,
        customerId: true,
        status: true,
      },
    });

    if (!request) {
      throw new NotFoundException('Transport request not found.');
    }

    if (request.customerId !== input.customerId) {
      throw new ForbiddenException(
        'You are not allowed to cancel this payment.',
      );
    }

    if (
      request.status === TransportRequestStatus.DELIVERED ||
      request.status === TransportRequestStatus.COMPLETED
    ) {
      throw new ConflictException(
        'Delivered trips cannot release payment holds.',
      );
    }

    return this.prisma.$transaction((tx) =>
      this.cancelRequestPaymentTx(tx, input.requestId),
    );
  }

  async cancelRequestPaymentTx(
    tx: Prisma.TransactionClient,
    requestId: string,
  ): Promise<PaymentSummaryDto> {
    const hold = await tx.paymentHold.findUnique({
      where: { requestId },
      select: PAYMENT_HOLD_SELECT,
    });

    if (!hold) {
      throw new NotFoundException('Payment hold not found.');
    }

    if (
      hold.status === PaymentStatus.PAYMENT_CAPTURED ||
      hold.status === PaymentStatus.PAYMENT_REFUNDED
    ) {
      throw new ConflictException('Captured payments cannot be cancelled.');
    }

    if (
      hold.status === PaymentStatus.PAYMENT_RELEASED ||
      hold.status === PaymentStatus.PAYMENT_CANCELLED
    ) {
      return this.toPaymentSummaryDto(hold);
    }

    if (hold.provider === PaymentProvider.APP_WALLET) {
      await this.releaseWalletReservation(tx, hold);
    } else if (hold.stripePaymentIntentId) {
      await this.stripeService.cancelPaymentIntentIfExists(
        hold.stripePaymentIntentId,
      );
    }

    const updated = await tx.paymentHold.update({
      where: { id: hold.id },
      data: {
        status: PaymentStatus.PAYMENT_RELEASED,
        releasedAt: new Date(),
        cancelledAt: new Date(),
      },
      select: PAYMENT_HOLD_SELECT,
    });

    await tx.transportRequest.update({
      where: { id: requestId },
      data: {
        paymentStatus: PaymentStatus.PAYMENT_RELEASED,
      },
    });

    return this.toPaymentSummaryDto(updated);
  }

  async cancelCollectedTrip(
    input: CancelTripInput,
  ): Promise<CancelTripPaymentResponseDto> {
    const request = await this.prisma.transportRequest.findUnique({
      where: { id: input.requestId },
      select: {
        id: true,
        customerId: true,
        status: true,
        itemPickedUpAt: true,
      },
    });

    if (!request) {
      throw new NotFoundException('Transport request not found.');
    }

    if (request.customerId !== input.customerId) {
      throw new ForbiddenException('You are not allowed to cancel this trip.');
    }

    if (
      request.itemPickedUpAt ||
      request.status === TransportRequestStatus.ITEM_PICKED_UP ||
      request.status === TransportRequestStatus.DRIVER_GOING_TO_DROPOFF ||
      request.status === TransportRequestStatus.DELIVERED ||
      request.status === TransportRequestStatus.COMPLETED
    ) {
      await this.markSettlementManualReview(input.requestId);
      throw new ConflictException(
        'Automatic cancellation after pickup requires manual review.',
      );
    }

    return this.prisma
      .$transaction((tx) =>
        this.cancelCollectedTripTx(tx, input.requestId, input.customerId),
      )
      .then(async (result) => {
        if (result.driverShareAmount > 0) {
          await this.queueDriverPayoutForTrip(input.requestId);
        }

        return {
          requestStatus: result.requestStatus,
          currency: result.currency,
          refundedAmount: result.refundedAmount,
          retainedAmount: result.retainedAmount,
        };
      });
  }

  private async cancelCollectedTripTx(
    tx: Prisma.TransactionClient,
    requestId: string,
    customerId: string,
  ): Promise<
    CancelTripPaymentResponseDto & {
      driverShareAmount: number;
    }
  > {
    const request = await tx.transportRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        customerId: true,
        status: true,
        acceptedOfferId: true,
        assignedDriverId: true,
        itemPickedUpAt: true,
        paymentHold: {
          select: PAYMENT_HOLD_SELECT,
        },
        paymentSettlement: {
          select: TRIP_PAYMENT_SETTLEMENT_SELECT,
        },
      },
    });

    if (!request || request.customerId !== customerId) {
      throw new NotFoundException('Transport request not found.');
    }

    if (!request.paymentHold || !request.paymentSettlement) {
      throw new ConflictException('Collected trip payment not found.');
    }

    if (request.status === TransportRequestStatus.CANCELLED) {
      return {
        requestStatus: request.status,
        currency: request.paymentSettlement.currency,
        refundedAmount: Number(
          request.paymentSettlement.refundedAmount.toString(),
        ),
        retainedAmount: Number(
          request.paymentSettlement.retainedAmount.toString(),
        ),
        driverShareAmount: Number(
          request.paymentSettlement.driverShareAmount.toString(),
        ),
      };
    }

    if (
      request.itemPickedUpAt ||
      request.status === TransportRequestStatus.ITEM_PICKED_UP ||
      request.status === TransportRequestStatus.DRIVER_GOING_TO_DROPOFF ||
      request.status === TransportRequestStatus.DELIVERED ||
      request.status === TransportRequestStatus.COMPLETED
    ) {
      const settlement = await tx.tripPaymentSettlement.update({
        where: { requestId },
        data: {
          status: TripPaymentSettlementStatus.MANUAL_REVIEW,
          requiresManualReview: true,
        },
        select: TRIP_PAYMENT_SETTLEMENT_SELECT,
      });
      throw new ConflictException(
        `Automatic cancellation after pickup requires manual review. Settlement ${settlement.id} flagged.`,
      );
    }

    if (!SUCCESSFUL_COLLECTION_STATUSES.has(request.paymentHold.status)) {
      throw new ConflictException(
        'This trip has not been collected successfully.',
      );
    }

    const refundableAmount = this.calculateCustomerCancellationRefund(
      request.paymentSettlement.collectedAmount,
    );
    const retainedAmount = request.paymentSettlement.collectedAmount
      .sub(refundableAmount)
      .toDecimalPlaces(2);
    const driverShareAmount =
      request.acceptedOfferId && request.assignedDriverId
        ? retainedAmount.mul(DRIVER_CANCELLATION_SHARE_RATE).toDecimalPlaces(2)
        : new Prisma.Decimal(0);
    const platformShareAmount = retainedAmount
      .sub(driverShareAmount)
      .toDecimalPlaces(2);

    let refundId: string | null = null;
    if (request.paymentHold.provider === PaymentProvider.APP_WALLET) {
      const wallet = await this.ensureWallet(
        tx,
        request.paymentHold.customerId,
        request.paymentHold.currency,
      );
      await tx.customerWallet.update({
        where: { id: wallet.id },
        data: {
          balance: wallet.balance.add(refundableAmount),
        },
      });
      await tx.customerWalletTransaction.create({
        data: {
          walletId: wallet.id,
          customerId: request.paymentHold.customerId,
          paymentHoldId: request.paymentHold.id,
          amount: refundableAmount,
          currency: request.paymentHold.currency,
          type: PaymentTransactionType.REFUND,
          description: 'Refunded cancelled trip amount to app wallet.',
          metadata: {
            requestId,
            kind: 'trip_cancellation_refund',
          },
        },
      });
    } else if (request.paymentHold.stripePaymentIntentId) {
      const refund = await this.stripeService.createRefund({
        paymentIntentId: request.paymentHold.stripePaymentIntentId,
        amount: this.toStripeMinorUnit(refundableAmount),
        metadata: {
          requestId,
          kind: 'trip_cancellation_refund',
        },
        idempotencyKey: `trip_cancel_refund_${requestId}_${request.paymentSettlement.updatedAt.getTime()}`,
      });
      refundId = refund.id;
    }

    if (driverShareAmount.gt(0) && request.assignedDriverId) {
      await tx.driverEarning.upsert({
        where: { tripId: requestId },
        update: {
          grossAmount: driverShareAmount,
          platformFeeAmount: new Prisma.Decimal(0),
          netAmount: driverShareAmount,
          currency: request.paymentSettlement.currency,
          status: DriverEarningStatus.PENDING,
          availableAt: new Date(),
        },
        create: {
          driverId: request.assignedDriverId,
          tripId: requestId,
          grossAmount: driverShareAmount,
          platformFeeAmount: new Prisma.Decimal(0),
          netAmount: driverShareAmount,
          currency: request.paymentSettlement.currency,
          status: DriverEarningStatus.PENDING,
          availableAt: new Date(),
        },
      });
    }

    const settlement = await tx.tripPaymentSettlement.update({
      where: { requestId },
      data: {
        refundableAmount: new Prisma.Decimal(0),
        refundedAmount: refundableAmount,
        retainedAmount,
        driverShareAmount,
        platformShareAmount,
        status: TripPaymentSettlementStatus.PARTIALLY_REFUNDED,
        driverPayoutState: driverShareAmount.gt(0)
          ? DriverPayoutState.EARNING_CREATED
          : DriverPayoutState.NOT_APPLICABLE,
        requiresManualReview: false,
        lastStripeRefundId: refundId,
        payoutFailureReason: null,
        payoutAttemptCount: 0,
        lastPayoutAttemptAt: null,
        nextPayoutRetryAt: driverShareAmount.gt(0) ? new Date() : null,
      },
      select: TRIP_PAYMENT_SETTLEMENT_SELECT,
    });

    await tx.paymentHold.update({
      where: { id: request.paymentHold.id },
      data: {
        status: PaymentStatus.PAYMENT_PARTIALLY_REFUNDED,
      },
      select: PAYMENT_HOLD_SELECT,
    });

    await tx.transportRequest.update({
      where: { id: requestId },
      data: {
        status: TransportRequestStatus.CANCELLED,
        paymentStatus: PaymentStatus.PAYMENT_PARTIALLY_REFUNDED,
        capturedAmount: retainedAmount,
      },
    });

    return {
      requestStatus: TransportRequestStatus.CANCELLED,
      currency: settlement.currency,
      refundedAmount: Number(settlement.refundedAmount.toString()),
      retainedAmount: Number(settlement.retainedAmount.toString()),
      driverShareAmount: Number(driverShareAmount.toString()),
    };
  }

  async createAdditionalCharge(
    input: CreateAdditionalChargeInput,
  ): Promise<AdditionalChargeResponseDto> {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { userId: input.driverUserId },
      select: { id: true, userId: true },
    });

    if (!profile) {
      await this.cleanupFile(input.invoiceFile);
      throw new NotFoundException('Driver profile not found.');
    }

    if (input.amount <= 0) {
      await this.cleanupFile(input.invoiceFile);
      throw new BadRequestException('amount must be greater than 0.');
    }

    const request = await this.prisma.transportRequest.findUnique({
      where: { id: input.requestId },
      select: {
        id: true,
        customerId: true,
        assignedDriverId: true,
        status: true,
        currency: true,
      },
    });

    if (!request) {
      await this.cleanupFile(input.invoiceFile);
      throw new NotFoundException('Transport request not found.');
    }

    if (request.assignedDriverId !== profile.id) {
      await this.cleanupFile(input.invoiceFile);
      throw new ForbiddenException(
        'Only the selected driver can add additional charges.',
      );
    }

    if (
      request.status === TransportRequestStatus.DELIVERED ||
      request.status === TransportRequestStatus.CANCELLED ||
      request.status === TransportRequestStatus.COMPLETED
    ) {
      await this.cleanupFile(input.invoiceFile);
      throw new BadRequestException(
        'Additional charges are not allowed for closed requests.',
      );
    }

    const currency = this.normalizeCurrency(input.currency);
    if (!SUPPORTED_ADDITIONAL_CHARGE_CURRENCIES.has(currency)) {
      await this.cleanupFile(input.invoiceFile);
      throw new BadRequestException(
        `currency must be one of: ${Array.from(SUPPORTED_ADDITIONAL_CHARGE_CURRENCIES).join(', ')}.`,
      );
    }
    const amount = this.toMoneyDecimal(input.amount);

    const storageKey = relative(process.cwd(), input.invoiceFile.path).replace(
      /\\/g,
      '/',
    );
    const invoiceUrl = `/${storageKey}`;

    const created = await this.prisma.$transaction(async (tx) => {
      return tx.additionalCharge.create({
        data: {
          requestId: request.id,
          driverId: profile.id,
          customerId: request.customerId,
          amount,
          currency,
          reason: input.reason.trim(),
          equipmentType: input.equipmentType?.trim() || null,
          invoiceUrl,
          invoiceStorageKey: storageKey,
          invoiceOriginalFilename: input.invoiceFile.originalname || null,
          invoiceMimeType: input.invoiceFile.mimetype || null,
          invoiceSizeBytes: input.invoiceFile.size ?? null,
          status: AdditionalChargeStatus.PENDING,
        },
        select: ADDITIONAL_CHARGE_SELECT,
      });
    });

    const response = this.toAdditionalChargeResponseDto(created);

    await this.notificationsService.notifyCustomerAdditionalChargeAdded({
      customerId: response.customerId,
      requestId: response.requestId,
      amount: response.totalChargeAmount.toFixed(2),
      currency: response.currency,
      reason: response.reason,
    });

    return response;
  }

  async getRequestAdditionalCharges(input: {
    customerId: string;
    requestId: string;
  }): Promise<AdditionalChargeResponseDto[]> {
    if (!input.requestId.trim()) {
      throw new BadRequestException('requestId is required.');
    }

    await this.assertCustomerOwnsRequest(input.customerId, input.requestId);

    const charges = await this.prisma.additionalCharge.findMany({
      where: {
        customerId: input.customerId,
        requestId: input.requestId,
      },
      orderBy: { createdAt: 'desc' },
      select: ADDITIONAL_CHARGE_SELECT,
    });

    return charges.map((charge) => this.toAdditionalChargeResponseDto(charge));
  }

  async getCustomerDefaultPaymentMethodSummary(input: {
    customerId: string;
  }): Promise<SavedPaymentMethodSummaryDto | null> {
    const customer = await this.prisma.user.findUnique({
      where: { id: input.customerId },
      select: {
        stripeCustomerId: true,
      },
    });

    if (!customer?.stripeCustomerId) {
      return null;
    }

    const paymentMethod =
      await this.stripeService.getCustomerDefaultPaymentMethod(
        customer.stripeCustomerId,
      );

    return paymentMethod
      ? this.toSavedPaymentMethodSummary(paymentMethod)
      : null;
  }

  async saveCustomerDefaultPaymentMethod(
    input: SaveDefaultPaymentMethodInput,
  ): Promise<SavedPaymentMethodSummaryDto> {
    const customer = await this.prisma.user.findUnique({
      where: { id: input.customerId },
      select: {
        id: true,
        email: true,
        name: true,
        stripeCustomerId: true,
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer account not found.');
    }

    const stripeCustomerId = await this.stripeService.ensureCustomer({
      customerId: customer.id,
      email: customer.email,
      name: customer.name,
      stripeCustomerId: customer.stripeCustomerId,
    });

    if (stripeCustomerId !== customer.stripeCustomerId) {
      await this.prisma.user.update({
        where: { id: customer.id },
        data: {
          stripeCustomerId,
        },
      });
    }

    const paymentMethod =
      await this.stripeService.attachCustomerDefaultPaymentMethod({
        customerId: stripeCustomerId,
        paymentMethodId: input.stripePaymentMethodId,
      });

    return this.toSavedPaymentMethodSummary(paymentMethod);
  }

  async getCustomerWalletSummary(input: {
    customerId: string;
  }): Promise<CustomerWalletSummaryDto> {
    const [customer, wallet, transactions] = await this.prisma.$transaction([
      this.prisma.user.findUnique({
        where: { id: input.customerId },
        select: { id: true },
      }),
      this.prisma.customerWallet.findUnique({
        where: { customerId: input.customerId },
        select: WALLET_SELECT,
      }),
      this.prisma.customerWalletTransaction.findMany({
        where: { customerId: input.customerId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: WALLET_TRANSACTION_SELECT,
      }),
    ]);

    if (!customer) {
      throw new NotFoundException('Customer account not found.');
    }

    return this.toCustomerWalletSummaryDto(
      input.customerId,
      wallet,
      transactions,
    );
  }

  async createCustomerWalletTopUp(
    input: CreateWalletTopUpInput,
  ): Promise<CustomerWalletTopUpResponseDto> {
    const amount = this.toMoneyDecimal(input.amount);
    if (amount.lte(0)) {
      throw new BadRequestException('Top-up amount must be greater than zero.');
    }

    const currency = this.normalizeCurrency(input.currency);
    const wallet = await this.prisma.customerWallet.findUnique({
      where: { customerId: input.customerId },
      select: WALLET_SELECT,
    });

    if (wallet && wallet.currency !== currency) {
      throw new BadRequestException(
        `Wallet top-ups must use ${wallet.currency}.`,
      );
    }

    const customer = await this.prisma.user.findUnique({
      where: { id: input.customerId },
      select: {
        id: true,
        email: true,
        name: true,
        stripeCustomerId: true,
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer account not found.');
    }

    const stripeCustomerId = await this.stripeService.ensureCustomer({
      customerId: customer.id,
      email: customer.email,
      name: customer.name,
      stripeCustomerId: customer.stripeCustomerId,
    });

    if (stripeCustomerId !== customer.stripeCustomerId) {
      await this.prisma.user.update({
        where: { id: customer.id },
        data: { stripeCustomerId },
      });
    }

    const paymentIntent = await this.stripeService.createCustomerFundingIntent({
      customerId: stripeCustomerId,
      amount: this.toStripeMinorUnit(amount),
      currency: currency.toLowerCase(),
      metadata: {
        customerId: input.customerId,
        walletId: wallet?.id ?? '',
        kind: 'wallet_top_up',
      },
    });

    const topUp = await this.prisma.customerWalletTopUp.create({
      data: {
        walletId: wallet?.id ?? null,
        customerId: input.customerId,
        amount,
        currency,
        paymentMethod: input.paymentMethod,
        provider: PaymentProvider.STRIPE,
        status: CustomerWalletTopUpStatus.PENDING,
        stripePaymentIntentId: paymentIntent.id,
        stripeClientSecret: paymentIntent.client_secret,
        stripeChargeId: this.getStripeChargeId(paymentIntent),
      },
      select: WALLET_TOP_UP_SELECT,
    });

    const transactions = await this.prisma.customerWalletTransaction.findMany({
      where: { customerId: input.customerId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: WALLET_TRANSACTION_SELECT,
    });

    return {
      topUp: this.toCustomerWalletTopUpDto(topUp),
      wallet: this.toCustomerWalletSummaryDto(
        input.customerId,
        wallet,
        transactions,
      ),
    };
  }

  async getCustomerWalletTopUp(
    input: GetWalletTopUpInput,
  ): Promise<CustomerWalletTopUpResponseDto> {
    let topUp = await this.prisma.customerWalletTopUp.findFirst({
      where: {
        id: input.topUpId,
        customerId: input.customerId,
      },
      select: WALLET_TOP_UP_SELECT,
    });

    if (!topUp) {
      throw new NotFoundException('Wallet top-up not found.');
    }

    if (
      topUp.status === CustomerWalletTopUpStatus.PENDING &&
      topUp.stripePaymentIntentId
    ) {
      const paymentIntent =
        await this.stripeService.retrievePaymentIntentIfExists(
          topUp.stripePaymentIntentId,
        );
      if (paymentIntent) {
        await this.syncStripeWalletTopUp(paymentIntent, paymentIntent.status);
        topUp = await this.prisma.customerWalletTopUp.findUnique({
          where: { id: topUp.id },
          select: WALLET_TOP_UP_SELECT,
        });
      }
    }

    if (!topUp) {
      throw new NotFoundException('Wallet top-up not found.');
    }

    const wallet = await this.prisma.customerWallet.findUnique({
      where: { customerId: input.customerId },
      select: WALLET_SELECT,
    });
    const transactions = await this.prisma.customerWalletTransaction.findMany({
      where: { customerId: input.customerId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: WALLET_TRANSACTION_SELECT,
    });

    return {
      topUp: this.toCustomerWalletTopUpDto(topUp),
      wallet: this.toCustomerWalletSummaryDto(
        input.customerId,
        wallet,
        transactions,
      ),
    };
  }

  async approveAdditionalCharge(
    input: ApproveAdditionalChargeInput,
  ): Promise<AdditionalChargeResponseDto> {
    if (!input.requestId.trim()) {
      throw new BadRequestException('requestId is required.');
    }

    if (!input.chargeId.trim()) {
      throw new BadRequestException('chargeId is required.');
    }

    const confirmationLocale = input.confirmationLocale.trim();
    const confirmationText = input.confirmationText.trim();
    const paymentOption = input.paymentOption;

    if (!confirmationLocale) {
      throw new BadRequestException('confirmationLocale is required.');
    }

    if (!confirmationText) {
      throw new BadRequestException('confirmationText is required.');
    }

    if (
      paymentOption !== 'SAVED_CARD' &&
      paymentOption !== 'CASH_ON_DELIVERY'
    ) {
      throw new BadRequestException('paymentOption is invalid.');
    }

    const charge = await this.prisma.additionalCharge.findFirst({
      where: {
        id: input.chargeId,
        requestId: input.requestId,
        customerId: input.customerId,
      },
      select: {
        ...ADDITIONAL_CHARGE_SELECT,
        approvalInFlightAt: true,
      },
    });

    if (!charge) {
      throw new NotFoundException('Additional charge not found.');
    }

    if (charge.status === AdditionalChargeStatus.CAPTURED) {
      throw new ConflictException(
        'This additional charge has already been approved.',
      );
    }

    if (charge.status === AdditionalChargeStatus.CANCELLED) {
      throw new BadRequestException(
        'This additional charge is no longer available.',
      );
    }

    const request = await this.prisma.transportRequest.findUnique({
      where: { id: input.requestId },
      select: {
        id: true,
        customerId: true,
        status: true,
      },
    });

    if (!request || request.customerId !== input.customerId) {
      throw new NotFoundException('Transport request not found.');
    }

    if (
      request.status === TransportRequestStatus.DELIVERED ||
      request.status === TransportRequestStatus.CANCELLED ||
      request.status === TransportRequestStatus.COMPLETED
    ) {
      throw new BadRequestException(
        'This additional charge request has expired.',
      );
    }

    const existingEarning = await this.prisma.driverEarning.findUnique({
      where: { tripId: input.requestId },
      select: {
        id: true,
        status: true,
        stripeTransferId: true,
      },
    });

    if (
      existingEarning &&
      (existingEarning.status === DriverEarningStatus.PAID_OUT ||
        existingEarning.stripeTransferId)
    ) {
      throw new ConflictException(
        'This additional expense can no longer be approved because the driver payout for this trip has already been sent.',
      );
    }

    const customer = await this.prisma.user.findUnique({
      where: { id: input.customerId },
      select: {
        id: true,
        email: true,
        name: true,
        stripeCustomerId: true,
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer account not found.');
    }

    const lockResult = await this.prisma.additionalCharge.updateMany({
      where: {
        id: charge.id,
        status: {
          in: [AdditionalChargeStatus.PENDING, AdditionalChargeStatus.FAILED],
        },
        approvalInFlightAt: null,
      },
      data: {
        approvalInFlightAt: new Date(),
      },
    });

    if (lockResult.count === 0) {
      throw new ConflictException(
        'This additional charge is already being processed. Please refresh and try again.',
      );
    }

    if (paymentOption === 'CASH_ON_DELIVERY') {
      const updatedCharge = await this.prisma.additionalCharge.update({
        where: { id: charge.id },
        data: {
          approvalInFlightAt: null,
          status: AdditionalChargeStatus.CAPTURED,
          approvedAt: new Date(),
          approvedByCustomerId: input.customerId,
          approvalLocale: confirmationLocale,
          approvalConfirmationText: confirmationText,
          stripePaymentIntentId: null,
          stripeChargeId: null,
          savedPaymentMethodId: null,
          savedPaymentMethodBrand: null,
          savedPaymentMethodLast4: null,
          savedPaymentMethodExpMonth: null,
          savedPaymentMethodExpYear: null,
          paymentFailureReason: null,
        },
        select: ADDITIONAL_CHARGE_SELECT,
      });

      const driverProfile = await this.prisma.driverProfile.findUnique({
        where: { id: updatedCharge.driverId },
        select: { userId: true },
      });

      const response = this.toAdditionalChargeResponseDto(updatedCharge);

      if (driverProfile?.userId) {
        await this.notificationsService.notifyDriverAdditionalChargeApproved({
          driverUserId: driverProfile.userId,
          requestId: response.requestId,
          amount: response.totalChargeAmount.toFixed(2),
          currency: response.currency,
          paymentOption: response.payment.paymentOption,
          savedPaymentMethod: response.payment.savedPaymentMethod,
        });
      }

      return response;
    }

    const stripeCustomerId = await this.stripeService.ensureCustomer({
      customerId: customer.id,
      email: customer.email,
      name: customer.name,
      stripeCustomerId: customer.stripeCustomerId,
    });

    if (stripeCustomerId !== customer.stripeCustomerId) {
      await this.prisma.user.update({
        where: { id: customer.id },
        data: {
          stripeCustomerId,
        },
      });
    }

    const savedPaymentMethod =
      await this.stripeService.getCustomerDefaultPaymentMethod(
        stripeCustomerId,
      );

    if (!savedPaymentMethod) {
      await this.prisma.additionalCharge.update({
        where: { id: charge.id },
        data: {
          approvalInFlightAt: null,
          status: AdditionalChargeStatus.FAILED,
          approvedAt: new Date(),
          approvedByCustomerId: input.customerId,
          approvalLocale: confirmationLocale,
          approvalConfirmationText: confirmationText,
          paymentFailureReason:
            'No saved default payment method is available for this customer.',
        },
      });

      throw new BadRequestException(
        'No saved default payment method is available for this customer.',
      );
    }

    const totalChargeAmount = this.calculateAdditionalChargeTotal(
      charge.amount,
    );

    try {
      const paymentIntent = await this.stripeService.createOffSessionCharge({
        customerId: stripeCustomerId,
        paymentMethodId: savedPaymentMethod.id,
        amount: this.toStripeMinorUnit(totalChargeAmount),
        currency: charge.currency.toLowerCase(),
        metadata: {
          requestId: charge.requestId,
          additionalChargeId: charge.id,
          customerId: charge.customerId,
          driverId: charge.driverId,
        },
        idempotencyKey: `additional_charge_${charge.id}_${charge.updatedAt.getTime()}`,
      });

      const updatedCharge = await this.prisma.additionalCharge.update({
        where: { id: charge.id },
        data: {
          approvalInFlightAt: null,
          status: AdditionalChargeStatus.CAPTURED,
          approvedAt: new Date(),
          approvedByCustomerId: input.customerId,
          approvalLocale: confirmationLocale,
          approvalConfirmationText: confirmationText,
          stripePaymentIntentId: paymentIntent.id,
          stripeChargeId: this.getStripeChargeId(paymentIntent),
          savedPaymentMethodId: savedPaymentMethod.id,
          savedPaymentMethodBrand: savedPaymentMethod.brand,
          savedPaymentMethodLast4: savedPaymentMethod.last4,
          savedPaymentMethodExpMonth: savedPaymentMethod.expMonth,
          savedPaymentMethodExpYear: savedPaymentMethod.expYear,
          paymentFailureReason: null,
        },
        select: ADDITIONAL_CHARGE_SELECT,
      });

      if (existingEarning) {
        await this.prisma.driverEarning.update({
          where: { id: existingEarning.id },
          data: {
            grossAmount: {
              increment: charge.amount,
            },
            netAmount: {
              increment: charge.amount,
            },
          },
        });
      }

      const driverProfile = await this.prisma.driverProfile.findUnique({
        where: { id: updatedCharge.driverId },
        select: { userId: true },
      });

      const response = this.toAdditionalChargeResponseDto(updatedCharge);

      if (driverProfile?.userId) {
        await this.notificationsService.notifyDriverAdditionalChargeApproved({
          driverUserId: driverProfile.userId,
          requestId: response.requestId,
          amount: response.totalChargeAmount.toFixed(2),
          currency: response.currency,
          paymentOption: response.payment.paymentOption,
          savedPaymentMethod: response.payment.savedPaymentMethod,
        });
      }

      return response;
    } catch (error) {
      const failureReason =
        error instanceof Error
          ? error.message
          : 'Failed to capture additional charge payment.';

      const updatedCharge = await this.prisma.additionalCharge.update({
        where: { id: charge.id },
        data: {
          approvalInFlightAt: null,
          status: AdditionalChargeStatus.FAILED,
          approvedAt: new Date(),
          approvedByCustomerId: input.customerId,
          approvalLocale: confirmationLocale,
          approvalConfirmationText: confirmationText,
          savedPaymentMethodId: savedPaymentMethod.id,
          savedPaymentMethodBrand: savedPaymentMethod.brand,
          savedPaymentMethodLast4: savedPaymentMethod.last4,
          savedPaymentMethodExpMonth: savedPaymentMethod.expMonth,
          savedPaymentMethodExpYear: savedPaymentMethod.expYear,
          paymentFailureReason: failureReason,
        },
        select: ADDITIONAL_CHARGE_SELECT,
      });

      this.toAdditionalChargeResponseDto(updatedCharge);
      throw new BadRequestException(failureReason);
    }
  }

  async createDriverConnectAccount(input: { driverUserId: string }): Promise<{
    stripeAccountId: string;
    onboardingUrl: string;
    detailsSubmitted: boolean;
    payoutsEnabled: boolean;
  }> {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { userId: input.driverUserId },
      select: {
        id: true,
        userId: true,
        firstName: true,
        lastName: true,
        stripeAccountId: true,
      },
    });

    if (!profile) {
      throw new NotFoundException('Driver profile not found.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: profile.userId },
      select: { email: true, name: true },
    });

    if (!user) {
      throw new NotFoundException('Driver user account not found.');
    }

    let accountId = profile.stripeAccountId?.trim() || '';

    if (!accountId) {
      const account = await this.stripeService.createExpressAccount({
        driverId: profile.id,
        email: user.email,
        name: `${profile.firstName} ${profile.lastName}`.trim() || user.name,
      });

      accountId = account.id;

      await this.prisma.driverProfile.update({
        where: { id: profile.id },
        data: {
          stripeAccountId: accountId,
          stripeAccountStatus: account.details_submitted
            ? 'details_submitted'
            : 'pending',
          stripeDetailsSubmitted: account.details_submitted,
          stripePayoutsEnabled: account.payouts_enabled,
        },
      });
    }

    const appBaseUrl =
      process.env.DRIVER_APP_BASE_URL?.trim() ||
      process.env.APP_BASE_URL?.trim() ||
      'http://localhost:8081';

    const accountLink = await this.stripeService.createAccountLink({
      accountId,
      refreshUrl: `${appBaseUrl}/stripe-connect?refresh=1`,
      returnUrl: `${appBaseUrl}/stripe-connect?return=1`,
    });

    return {
      stripeAccountId: accountId,
      onboardingUrl: accountLink.url,
      detailsSubmitted: false,
      payoutsEnabled: false,
    };
  }

  async getDriverConnectStatus(input: { driverUserId: string }): Promise<{
    stripeAccountId: string | null;
    detailsSubmitted: boolean;
    payoutsEnabled: boolean;
    accountStatus: string | null;
  }> {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { userId: input.driverUserId },
      select: {
        id: true,
        stripeAccountId: true,
        stripeAccountStatus: true,
        stripeDetailsSubmitted: true,
        stripePayoutsEnabled: true,
      },
    });

    if (!profile) {
      throw new NotFoundException('Driver profile not found.');
    }

    if (!profile.stripeAccountId) {
      return {
        stripeAccountId: null,
        detailsSubmitted: false,
        payoutsEnabled: false,
        accountStatus: null,
      };
    }

    return {
      stripeAccountId: profile.stripeAccountId,
      detailsSubmitted: profile.stripeDetailsSubmitted,
      payoutsEnabled: profile.stripePayoutsEnabled,
      accountStatus: profile.stripeAccountStatus,
    };
  }

  async syncDriverConnectAccount(input: { driverUserId: string }): Promise<{
    detailsSubmitted: boolean;
    payoutsEnabled: boolean;
    accountStatus: string;
  }> {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { userId: input.driverUserId },
      select: { id: true, stripeAccountId: true },
    });

    if (!profile) {
      throw new NotFoundException('Driver profile not found.');
    }

    if (!profile.stripeAccountId) {
      throw new BadRequestException(
        'Driver does not have a Stripe Connect account.',
      );
    }

    const account = await this.stripeService.retrieveAccount(
      profile.stripeAccountId,
    );

    await this.prisma.driverProfile.update({
      where: { id: profile.id },
      data: {
        stripeAccountStatus: account.details_submitted
          ? 'details_submitted'
          : 'pending',
        stripeDetailsSubmitted: account.details_submitted,
        stripePayoutsEnabled: account.payouts_enabled,
      },
    });

    return {
      detailsSubmitted: account.details_submitted,
      payoutsEnabled: account.payouts_enabled,
      accountStatus: account.details_submitted
        ? 'details_submitted'
        : 'pending',
    };
  }

  async getDriverConnectDashboardLink(input: {
    driverUserId: string;
  }): Promise<{ url: string }> {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { userId: input.driverUserId },
      select: { id: true, stripeAccountId: true },
    });

    if (!profile) {
      throw new NotFoundException('Driver profile not found.');
    }

    if (!profile.stripeAccountId) {
      throw new BadRequestException(
        'Driver does not have a Stripe Connect account.',
      );
    }

    const link = await this.stripeService.createExpressLoginLink(
      profile.stripeAccountId,
    );

    return { url: link.url };
  }

  async retryTransferForTrip(input: {
    driverUserId: string;
    tripId: string;
  }): Promise<{
    transferred: boolean;
    stripeTransferId: string | null;
    reason: string | null;
  }> {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { userId: input.driverUserId },
      select: { id: true, stripeAccountId: true, stripePayoutsEnabled: true },
    });

    if (!profile) {
      throw new NotFoundException('Driver profile not found.');
    }

    const earning = await this.prisma.driverEarning.findUnique({
      where: { tripId: input.tripId },
      select: {
        id: true,
        driverId: true,
        netAmount: true,
        currency: true,
        status: true,
        stripeTransferId: true,
      },
    });

    if (!earning) {
      throw new NotFoundException('Earning record not found for this trip.');
    }

    if (earning.driverId !== profile.id) {
      throw new ForbiddenException('This earning does not belong to you.');
    }

    return this.attemptDriverPayoutForTrip(input.tripId, {
      requestedBy: 'driver_manual_retry',
    });
  }

  async queueDriverPayoutForTrip(tripId: string): Promise<boolean> {
    const earning = await this.prisma.driverEarning.findUnique({
      where: { tripId },
      select: {
        tripId: true,
        availableAt: true,
        status: true,
        stripeTransferId: true,
      },
    });

    if (!earning) {
      return false;
    }

    if (
      earning.status === DriverEarningStatus.PAID_OUT ||
      earning.stripeTransferId
    ) {
      return false;
    }

    const enqueued = await this.enqueueDriverPayout({
      tripId,
      reason: 'delivery',
      runAt: earning.availableAt ?? new Date(),
      replaceDelayed: true,
    });

    if (!enqueued) {
      throw new ServiceUnavailableException(
        'Driver payout queue is unavailable.',
      );
    }

    return true;
  }

  async queueAdminDriverPayoutRetry(tripId: string): Promise<boolean> {
    const enqueued = await this.enqueueDriverPayout({
      tripId,
      reason: 'admin_manual_retry',
      runAt: new Date(),
      replaceDelayed: true,
    });

    if (!enqueued) {
      throw new ServiceUnavailableException(
        'Driver payout queue is unavailable.',
      );
    }

    return true;
  }

  async transferDriverEarningForTrip(tripId: string): Promise<void> {
    await this.attemptDriverPayoutForTrip(tripId, {
      requestedBy: 'automatic_retry',
    });
  }

  async processQueuedDriverPayoutJob(tripId: string): Promise<void> {
    await this.attemptDriverPayoutForTrip(tripId, {
      requestedBy: 'automatic_retry',
    });
  }

  async sweepQueuedDriverPayouts(): Promise<void> {
    const now = new Date();
    const staleCutoff = new Date(
      now.getTime() - STALE_PAYOUT_TRANSFER_MINUTES * 60 * 1000,
    );
    const candidates = await this.prisma.tripPaymentSettlement.findMany({
      where: {
        OR: [
          {
            driverPayoutState: DriverPayoutState.EARNING_CREATED,
            request: {
              driverEarning: {
                availableAt: { lte: now },
                stripeTransferId: null,
                status: {
                  in: [
                    DriverEarningStatus.PENDING,
                    DriverEarningStatus.AVAILABLE,
                  ],
                },
              },
            },
          },
          {
            driverPayoutState: DriverPayoutState.TRANSFER_FAILED,
            nextPayoutRetryAt: { lte: now },
          },
          {
            driverPayoutState: DriverPayoutState.PENDING_TRANSFER,
            lastPayoutAttemptAt: { lte: staleCutoff },
          },
        ],
      },
      select: {
        requestId: true,
        driverPayoutState: true,
        request: {
          select: {
            driverEarning: {
              select: {
                availableAt: true,
              },
            },
          },
        },
      },
    });

    for (const candidate of candidates) {
      await this.enqueueDriverPayout({
        tripId: candidate.requestId,
        reason: 'sweep',
        runAt:
          candidate.driverPayoutState === DriverPayoutState.EARNING_CREATED
            ? (candidate.request.driverEarning?.availableAt ?? now)
            : now,
        replaceDelayed: true,
      });
    }
  }

  private async attemptDriverPayoutForTrip(
    tripId: string,
    input: {
      requestedBy:
        | 'automatic_retry'
        | 'driver_manual_retry'
        | 'admin_manual_retry';
    },
  ): Promise<DriverPayoutAttemptResult> {
    const context = await this.getDriverPayoutContext(tripId);

    if (!context) {
      return {
        transferred: false,
        stripeTransferId: null,
        reason: 'Earning record not found for this trip.',
      };
    }

    if (
      context.earningStatus === DriverEarningStatus.PAID_OUT ||
      context.stripeTransferId
    ) {
      await this.markSettlementPaidOut(context.tripId);
      return {
        transferred: true,
        stripeTransferId: context.stripeTransferId,
        reason: 'Transfer already completed.',
      };
    }

    const now = new Date();

    if (
      context.settlementStatus !== TripPaymentSettlementStatus.COLLECTED ||
      context.requiresManualReview
    ) {
      await this.prisma.tripPaymentSettlement.update({
        where: { id: context.settlementId },
        data: {
          nextPayoutRetryAt: null,
          payoutFailureReason:
            context.settlementStatus === TripPaymentSettlementStatus.DISPUTED ||
            context.requiresManualReview
              ? 'Stripe dispute requires manual review before payout.'
              : 'Trip settlement is not eligible for payout.',
        },
      });

      return {
        transferred: false,
        stripeTransferId: null,
        reason:
          context.settlementStatus === TripPaymentSettlementStatus.DISPUTED ||
          context.requiresManualReview
            ? 'Stripe dispute requires manual review before payout.'
            : `Trip settlement is in ${context.settlementStatus} state.`,
      };
    }

    if (context.availableAt && context.availableAt.getTime() > now.getTime()) {
      await this.prisma.tripPaymentSettlement.update({
        where: { id: context.settlementId },
        data: {
          driverPayoutState: DriverPayoutState.EARNING_CREATED,
          payoutFailureReason: null,
          nextPayoutRetryAt: context.availableAt,
        },
      });

      if (input.requestedBy === 'automatic_retry') {
        await this.enqueueDriverPayout({
          tripId: context.tripId,
          reason: 'automatic_retry',
          runAt: context.availableAt,
          replaceDelayed: true,
        });
      }

      return {
        transferred: false,
        stripeTransferId: null,
        reason: `Payout is not available before ${context.availableAt.toISOString()}.`,
      };
    }

    if (context.earningStatus === DriverEarningStatus.PENDING) {
      await this.prisma.driverEarning.update({
        where: { id: context.earningId },
        data: {
          status: DriverEarningStatus.AVAILABLE,
        },
      });
    }

    if (!context.destinationAccountId || !context.stripePayoutsEnabled) {
      return this.failDriverPayoutAttempt(context, now, {
        reason:
          'Stripe Connect onboarding is not complete. Payouts are not enabled.',
      });
    }

    const transferAmount = this.toStripeMinorUnit(context.netAmount);
    if (transferAmount <= 0) {
      return this.failDriverPayoutAttempt(context, now, {
        reason: 'Transfer amount is zero or negative.',
      });
    }

    await this.prisma.tripPaymentSettlement.update({
      where: { id: context.settlementId },
      data: {
        driverPayoutState: DriverPayoutState.PENDING_TRANSFER,
        payoutFailureReason: null,
        lastPayoutAttemptAt: now,
        nextPayoutRetryAt: null,
      },
    });

    try {
      const transfer = await this.stripeService.createTransfer({
        amount: transferAmount,
        currency: context.currency.toLowerCase(),
        destination: context.destinationAccountId,
        transferGroup: `trip_${context.tripId}`,
        metadata: {
          tripId: context.tripId,
          driverEarningId: context.earningId,
          driverId: context.driverId,
          source: input.requestedBy,
        },
      });

      await this.prisma.driverEarning.update({
        where: { id: context.earningId },
        data: {
          status: DriverEarningStatus.PAID_OUT,
          paidOutAt: now,
          stripeTransferId: transfer.id,
          stripeTransferStatus: 'paid',
        },
      });

      await this.prisma.tripPaymentSettlement.update({
        where: { id: context.settlementId },
        data: {
          driverPayoutState: DriverPayoutState.PAID_OUT,
          payoutFailureReason: null,
          nextPayoutRetryAt: null,
          lastPayoutAttemptAt: now,
        },
      });

      await this.notificationsService.notifyTripFundsTransferred({
        customerId: context.customerId,
        driverUserId: context.driverUserId,
        tripId: context.tripId,
        amount: context.netAmount.toFixed(2),
        currency: context.currency,
        stripeTransferId: transfer.id,
      });

      return {
        transferred: true,
        stripeTransferId: transfer.id,
        reason: null,
      };
    } catch (error) {
      const reason =
        error instanceof Error
          ? error.message
          : 'Driver payout transfer failed.';

      await this.prisma.driverEarning.update({
        where: { id: context.earningId },
        data: {
          stripeTransferStatus: 'failed',
        },
      });

      return this.failDriverPayoutAttempt(context, now, { reason });
    }
  }

  private async getDriverPayoutContext(
    tripId: string,
  ): Promise<DriverPayoutContext | null> {
    const earning = await this.prisma.driverEarning.findUnique({
      where: { tripId },
      select: {
        id: true,
        tripId: true,
        driverId: true,
        netAmount: true,
        currency: true,
        status: true,
        availableAt: true,
        paidOutAt: true,
        stripeTransferId: true,
        stripeTransferStatus: true,
        driver: {
          select: {
            userId: true,
            stripeAccountId: true,
            stripePayoutsEnabled: true,
            stripeDetailsSubmitted: true,
          },
        },
        trip: {
          select: {
            customerId: true,
            paymentSettlement: {
              select: {
                id: true,
                payoutAttemptCount: true,
                status: true,
                requiresManualReview: true,
              },
            },
          },
        },
      },
    });

    if (!earning?.trip.paymentSettlement) {
      return null;
    }

    return {
      settlementId: earning.trip.paymentSettlement.id,
      tripId: earning.tripId,
      customerId: earning.trip.customerId,
      driverUserId: earning.driver.userId,
      driverId: earning.driverId,
      currency: earning.currency,
      earningId: earning.id,
      earningStatus: earning.status,
      availableAt: earning.availableAt,
      paidOutAt: earning.paidOutAt,
      netAmount: earning.netAmount,
      stripeTransferId: earning.stripeTransferId,
      stripeTransferStatus: earning.stripeTransferStatus,
      destinationAccountId: earning.driver.stripeAccountId,
      stripePayoutsEnabled: earning.driver.stripePayoutsEnabled,
      stripeDetailsSubmitted: earning.driver.stripeDetailsSubmitted,
      payoutAttemptCount: earning.trip.paymentSettlement.payoutAttemptCount,
      settlementStatus: earning.trip.paymentSettlement.status,
      requiresManualReview: earning.trip.paymentSettlement.requiresManualReview,
    };
  }

  private async failDriverPayoutAttempt(
    context: DriverPayoutContext,
    attemptedAt: Date,
    input: {
      reason: string;
    },
  ): Promise<DriverPayoutAttemptResult> {
    const nextAttemptCount = context.payoutAttemptCount + 1;
    const nextRetryAt = this.calculateNextDriverPayoutRetryAt(
      nextAttemptCount,
      attemptedAt,
    );

    await this.prisma.tripPaymentSettlement.update({
      where: { id: context.settlementId },
      data: {
        driverPayoutState: DriverPayoutState.TRANSFER_FAILED,
        payoutFailureReason: input.reason,
        payoutAttemptCount: nextAttemptCount,
        lastPayoutAttemptAt: attemptedAt,
        nextPayoutRetryAt: nextRetryAt,
      },
    });

    if (nextRetryAt) {
      await this.enqueueDriverPayout({
        tripId: context.tripId,
        reason: 'automatic_retry',
        runAt: nextRetryAt,
        replaceDelayed: true,
      });
    }

    return {
      transferred: false,
      stripeTransferId: null,
      reason: input.reason,
    };
  }

  private calculateNextDriverPayoutRetryAt(
    attemptCount: number,
    attemptedAt: Date,
  ): Date | null {
    const retryDelayMinutes =
      DRIVER_PAYOUT_RETRY_DELAYS_MINUTES[attemptCount - 1] ?? null;

    if (retryDelayMinutes === null) {
      return null;
    }

    return new Date(attemptedAt.getTime() + retryDelayMinutes * 60 * 1000);
  }

  private async markSettlementPaidOut(tripId: string): Promise<void> {
    await this.prisma.tripPaymentSettlement.updateMany({
      where: { requestId: tripId },
      data: {
        driverPayoutState: DriverPayoutState.PAID_OUT,
        payoutFailureReason: null,
        nextPayoutRetryAt: null,
        lastPayoutAttemptAt: null,
      },
    });
  }

  private async enqueueDriverPayout(input: {
    tripId: string;
    reason:
      | 'delivery'
      | 'admin_manual_retry'
      | 'driver_manual_retry'
      | 'sweep'
      | 'automatic_retry';
    runAt?: Date | null;
    replaceDelayed?: boolean;
  }): Promise<boolean> {
    if (!this.driverPayoutQueueService) {
      return false;
    }

    return this.driverPayoutQueueService.enqueueDriverPayout(input);
  }

  async handleStripeWebhook(
    rawBody: Buffer,
    signature: string,
  ): Promise<{
    received: true;
    type: string;
  }> {
    const event = this.stripeService.constructWebhookEvent(rawBody, signature);

    switch (event.type) {
      case 'payment_intent.amount_capturable_updated':
      case 'payment_intent.succeeded':
      case 'payment_intent.payment_failed':
      case 'payment_intent.canceled': {
        const paymentIntent = event.data.object as StripePaymentIntentRecord;
        await this.syncStripePaymentIntent(paymentIntent, event.type);
        await this.syncStripeWalletTopUp(paymentIntent, event.type);
        break;
      }
      case 'charge.refunded': {
        const charge = event.data.object as {
          id: string;
          payment_intent: string | null;
        };
        if (typeof charge.payment_intent === 'string') {
          await this.markPaymentRefunded(charge.payment_intent, charge.id);
        }
        break;
      }
      case 'charge.dispute.created':
      case 'charge.dispute.updated':
      case 'charge.dispute.closed': {
        const dispute = event.data.object as StripeDisputeRecord;
        await this.syncStripeDispute(dispute, event.type);
        break;
      }
      case 'account.updated': {
        const account = event.data.object as {
          id: string;
          details_submitted: boolean;
          payouts_enabled: boolean;
        };
        await this.syncDriverConnectAccountFromStripe(account.id, {
          detailsSubmitted: account.details_submitted,
          payoutsEnabled: account.payouts_enabled,
        });
        break;
      }
      default:
        break;
    }

    return {
      received: true,
      type: event.type,
    };
  }

  private async syncDriverConnectAccountFromStripe(
    stripeAccountId: string,
    status: { detailsSubmitted: boolean; payoutsEnabled: boolean },
  ): Promise<void> {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { stripeAccountId },
      select: { id: true },
    });

    if (!profile) {
      return;
    }

    await this.prisma.driverProfile.update({
      where: { id: profile.id },
      data: {
        stripeAccountStatus: status.detailsSubmitted
          ? 'details_submitted'
          : 'pending',
        stripeDetailsSubmitted: status.detailsSubmitted,
        stripePayoutsEnabled: status.payoutsEnabled,
      },
    });
  }

  private async syncStripePaymentIntent(
    paymentIntent: StripePaymentIntentRecord,
    eventType: string,
  ): Promise<void> {
    const nextStatus = this.mapStripeEventToPaymentStatus(
      paymentIntent,
      eventType,
    );
    if (!nextStatus) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      const hold = await tx.paymentHold.findUnique({
        where: { stripePaymentIntentId: paymentIntent.id },
        select: PAYMENT_HOLD_SELECT,
      });

      if (!hold || hold.status === nextStatus) {
        return;
      }

      await tx.paymentHold.update({
        where: { id: hold.id },
        data: {
          status: nextStatus,
          stripeChargeId: this.getStripeChargeId(paymentIntent),
          failedAt:
            nextStatus === PaymentStatus.PAYMENT_FAILED
              ? new Date()
              : undefined,
          cancelledAt:
            nextStatus === PaymentStatus.PAYMENT_CANCELLED
              ? new Date()
              : undefined,
          releasedAt:
            nextStatus === PaymentStatus.PAYMENT_RELEASED
              ? new Date()
              : undefined,
          capturedAt:
            nextStatus === PaymentStatus.PAYMENT_CAPTURED
              ? new Date()
              : undefined,
        },
      });

      await tx.transportRequest.update({
        where: { id: hold.requestId },
        data: {
          paymentStatus: nextStatus,
          capturedAmount:
            nextStatus === PaymentStatus.PAYMENT_CAPTURED
              ? hold.amount
              : undefined,
        },
      });

      if (nextStatus === PaymentStatus.PAYMENT_CAPTURED) {
        await tx.tripPaymentSettlement.upsert({
          where: { requestId: hold.requestId },
          update: {
            paymentHoldId: hold.id,
            customerId: hold.customerId,
            driverId: hold.driverId,
            currency: hold.currency,
            collectedAmount: hold.amount,
            refundableAmount: hold.amount,
            refundedAmount: new Prisma.Decimal(0),
            retainedAmount: new Prisma.Decimal(0),
            driverShareAmount: new Prisma.Decimal(0),
            platformShareAmount: new Prisma.Decimal(0),
            status: TripPaymentSettlementStatus.COLLECTED,
            driverPayoutState: DriverPayoutState.NOT_EARNED,
            requiresManualReview: false,
            lastStripeRefundId: null,
            disputeReportedAt: null,
            stripeDisputeId: null,
            disputeStatus: null,
            disputeReason: null,
            disputeAmount: null,
            disputeCurrency: null,
            disputeCreatedAt: null,
            disputeUpdatedAt: null,
            disputeClosedAt: null,
            disputeEvidenceDueBy: null,
            payoutFailureReason: null,
            payoutAttemptCount: 0,
            lastPayoutAttemptAt: null,
            nextPayoutRetryAt: null,
          },
          create: {
            requestId: hold.requestId,
            paymentHoldId: hold.id,
            customerId: hold.customerId,
            driverId: hold.driverId,
            currency: hold.currency,
            collectedAmount: hold.amount,
            refundableAmount: hold.amount,
            refundedAmount: new Prisma.Decimal(0),
            retainedAmount: new Prisma.Decimal(0),
            driverShareAmount: new Prisma.Decimal(0),
            platformShareAmount: new Prisma.Decimal(0),
            status: TripPaymentSettlementStatus.COLLECTED,
            driverPayoutState: DriverPayoutState.NOT_EARNED,
            requiresManualReview: false,
            lastStripeRefundId: null,
            disputeReportedAt: null,
            stripeDisputeId: null,
            disputeStatus: null,
            disputeReason: null,
            disputeAmount: null,
            disputeCurrency: null,
            disputeCreatedAt: null,
            disputeUpdatedAt: null,
            disputeClosedAt: null,
            disputeEvidenceDueBy: null,
            payoutFailureReason: null,
            payoutAttemptCount: 0,
            lastPayoutAttemptAt: null,
            nextPayoutRetryAt: null,
          },
        });
      }
    });
  }

  private async syncStripeWalletTopUp(
    paymentIntent: StripePaymentIntentRecord,
    eventType: string,
  ): Promise<void> {
    const nextStatus = this.mapStripeEventToWalletTopUpStatus(
      paymentIntent,
      eventType,
    );
    if (!nextStatus) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      const topUp = await tx.customerWalletTopUp.findUnique({
        where: { stripePaymentIntentId: paymentIntent.id },
        select: WALLET_TOP_UP_SELECT,
      });

      if (!topUp || topUp.status === nextStatus) {
        return;
      }

      if (topUp.status !== CustomerWalletTopUpStatus.PENDING) {
        return;
      }

      if (nextStatus === CustomerWalletTopUpStatus.SUCCEEDED) {
        const wallet = await this.findOrCreateWalletForTopUpSuccess(tx, topUp);
        if (wallet.currency !== topUp.currency) {
          await tx.customerWalletTopUp.update({
            where: { id: topUp.id },
            data: {
              status: CustomerWalletTopUpStatus.FAILED,
              failureReason: `Wallet top-ups must use ${wallet.currency}.`,
              failedAt: new Date(),
              stripeChargeId: this.getStripeChargeId(paymentIntent),
            },
          });
          return;
        }

        await tx.customerWallet.update({
          where: { id: wallet.id },
          data: {
            balance: wallet.balance.add(topUp.amount),
          },
        });

        await tx.customerWalletTransaction.create({
          data: {
            walletId: wallet.id,
            customerId: topUp.customerId,
            walletTopUpId: topUp.id,
            amount: topUp.amount,
            currency: topUp.currency,
            type: PaymentTransactionType.TOP_UP,
            description: 'Added funds to app wallet.',
            metadata: {
              stripePaymentIntentId: topUp.stripePaymentIntentId,
            },
          },
        });

        await tx.customerWalletTopUp.update({
          where: { id: topUp.id },
          data: {
            walletId: wallet.id,
            status: CustomerWalletTopUpStatus.SUCCEEDED,
            completedAt: new Date(),
            stripeChargeId: this.getStripeChargeId(paymentIntent),
            requiresManualReview: false,
            stripeDisputeId: null,
            disputeStatus: null,
            disputeReason: null,
            disputeAmount: null,
            disputeCurrency: null,
            disputeCreatedAt: null,
            disputeUpdatedAt: null,
            disputeClosedAt: null,
            disputeEvidenceDueBy: null,
            failureReason: null,
          },
        });
        return;
      }

      await tx.customerWalletTopUp.update({
        where: { id: topUp.id },
        data: {
          status: nextStatus,
          stripeChargeId: this.getStripeChargeId(paymentIntent),
          failureReason: this.getWalletTopUpFailureReason(
            paymentIntent,
            nextStatus,
          ),
          failedAt:
            nextStatus === CustomerWalletTopUpStatus.FAILED
              ? new Date()
              : undefined,
          cancelledAt:
            nextStatus === CustomerWalletTopUpStatus.CANCELLED
              ? new Date()
              : undefined,
        },
      });
    });
  }

  private async markPaymentRefunded(
    paymentIntentId: string,
    chargeId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const hold = await tx.paymentHold.findUnique({
        where: { stripePaymentIntentId: paymentIntentId },
        select: PAYMENT_HOLD_SELECT,
      });

      if (!hold) {
        return;
      }

      await tx.paymentHold.update({
        where: { id: hold.id },
        data: {
          status: PaymentStatus.PAYMENT_REFUNDED,
          stripeChargeId: chargeId,
        },
      });

      await tx.transportRequest.update({
        where: { id: hold.requestId },
        data: {
          paymentStatus: PaymentStatus.PAYMENT_REFUNDED,
        },
      });

      await tx.tripPaymentSettlement.updateMany({
        where: { requestId: hold.requestId },
        data: {
          status: TripPaymentSettlementStatus.REFUNDED,
          refundedAmount: hold.amount,
          refundableAmount: new Prisma.Decimal(0),
          retainedAmount: new Prisma.Decimal(0),
          driverShareAmount: new Prisma.Decimal(0),
          platformShareAmount: new Prisma.Decimal(0),
          lastStripeRefundId: chargeId,
          requiresManualReview: false,
          disputeReportedAt: null,
          stripeDisputeId: null,
          disputeStatus: null,
          disputeReason: null,
          disputeAmount: null,
          disputeCurrency: null,
          disputeCreatedAt: null,
          disputeUpdatedAt: null,
          disputeClosedAt: null,
          disputeEvidenceDueBy: null,
          nextPayoutRetryAt: null,
          payoutFailureReason: null,
        },
      });
    });
  }

  private async syncStripeDispute(
    dispute: StripeDisputeRecord,
    eventType: string,
  ): Promise<void> {
    const paymentIntentId = this.normalizeStripeDisputeReference(
      dispute.payment_intent,
    );
    const chargeId = this.normalizeStripeDisputeReference(dispute.charge);

    if (!paymentIntentId && !chargeId) {
      return;
    }

    await this.syncTripChargeDispute(dispute, eventType, {
      paymentIntentId,
      chargeId,
    });
    await this.syncWalletTopUpDispute(dispute, eventType, {
      paymentIntentId,
      chargeId,
    });
  }

  private async syncTripChargeDispute(
    dispute: StripeDisputeRecord,
    eventType: string,
    input: {
      paymentIntentId: string | null;
      chargeId: string | null;
    },
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const hold = await tx.paymentHold.findFirst({
        where: {
          OR: this.buildPaymentHoldDisputeLookup(input),
        },
        select: PAYMENT_HOLD_SELECT,
      });

      if (!hold) {
        return;
      }

      const nextPaymentStatus = this.getTripDisputePaymentStatus(
        dispute.status,
        eventType,
      );
      const nextSettlementStatus = this.getTripDisputeSettlementStatus(
        dispute.status,
        eventType,
      );
      const disputeData = this.toDisputePersistence(dispute, eventType);
      const requiresManualReview = this.requiresManualReviewForDispute(
        dispute.status,
        eventType,
      );

      await tx.paymentHold.update({
        where: { id: hold.id },
        data: {
          status: nextPaymentStatus,
          stripeChargeId: input.chargeId ?? hold.stripeChargeId,
        },
      });

      await tx.transportRequest.update({
        where: { id: hold.requestId },
        data: {
          paymentStatus: nextPaymentStatus,
        },
      });

      await tx.tripPaymentSettlement.updateMany({
        where: { requestId: hold.requestId },
        data: {
          status: nextSettlementStatus,
          requiresManualReview,
          disputeReportedAt: disputeData.disputeCreatedAt ?? new Date(),
          stripeDisputeId: disputeData.stripeDisputeId,
          disputeStatus: disputeData.disputeStatus,
          disputeReason: disputeData.disputeReason,
          disputeAmount: disputeData.disputeAmount,
          disputeCurrency: disputeData.disputeCurrency,
          disputeCreatedAt: disputeData.disputeCreatedAt,
          disputeUpdatedAt: disputeData.disputeUpdatedAt,
          disputeClosedAt: disputeData.disputeClosedAt,
          disputeEvidenceDueBy: disputeData.disputeEvidenceDueBy,
          payoutFailureReason:
            nextSettlementStatus === TripPaymentSettlementStatus.COLLECTED
              ? null
              : 'Stripe dispute requires payout review.',
          nextPayoutRetryAt: null,
        },
      });
    });
  }

  private async syncWalletTopUpDispute(
    dispute: StripeDisputeRecord,
    eventType: string,
    input: {
      paymentIntentId: string | null;
      chargeId: string | null;
    },
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const topUp = await tx.customerWalletTopUp.findFirst({
        where: {
          OR: this.buildWalletTopUpDisputeLookup(input),
        },
        select: WALLET_TOP_UP_SELECT,
      });

      if (!topUp) {
        return;
      }

      const nextStatus = this.getWalletTopUpDisputeStatus(
        dispute.status,
        eventType,
      );
      const disputeData = this.toDisputePersistence(dispute, eventType);

      await tx.customerWalletTopUp.update({
        where: { id: topUp.id },
        data: {
          status: nextStatus,
          stripeChargeId: input.chargeId ?? topUp.stripeChargeId,
          requiresManualReview:
            nextStatus === CustomerWalletTopUpStatus.DISPUTED ||
            nextStatus === CustomerWalletTopUpStatus.MANUAL_REVIEW,
          stripeDisputeId: disputeData.stripeDisputeId,
          disputeStatus: disputeData.disputeStatus,
          disputeReason: disputeData.disputeReason,
          disputeAmount: disputeData.disputeAmount,
          disputeCurrency: disputeData.disputeCurrency,
          disputeCreatedAt: disputeData.disputeCreatedAt,
          disputeUpdatedAt: disputeData.disputeUpdatedAt,
          disputeClosedAt: disputeData.disputeClosedAt,
          disputeEvidenceDueBy: disputeData.disputeEvidenceDueBy,
          failureReason:
            nextStatus === CustomerWalletTopUpStatus.SUCCEEDED
              ? null
              : topUp.failureReason,
        },
      });
    });
  }

  private async markSettlementManualReview(requestId: string): Promise<void> {
    await this.prisma.tripPaymentSettlement.updateMany({
      where: { requestId },
      data: {
        status: TripPaymentSettlementStatus.MANUAL_REVIEW,
        requiresManualReview: true,
        nextPayoutRetryAt: null,
      },
    });
  }

  private async createTripPaymentSettlement(
    tx: Prisma.TransactionClient,
    hold: PaymentHoldRecord,
    input: {
      collectedAmount: Prisma.Decimal;
      refundableAmount: Prisma.Decimal;
      refundedAmount: Prisma.Decimal;
      retainedAmount: Prisma.Decimal;
      driverShareAmount: Prisma.Decimal;
      platformShareAmount: Prisma.Decimal;
      status: TripPaymentSettlementStatus;
      driverPayoutState: DriverPayoutState;
      requiresManualReview: boolean;
    },
  ): Promise<void> {
    await tx.tripPaymentSettlement.upsert({
      where: { requestId: hold.requestId },
      update: {
        paymentHoldId: hold.id,
        customerId: hold.customerId,
        driverId: hold.driverId,
        currency: hold.currency,
        collectedAmount: input.collectedAmount,
        refundableAmount: input.refundableAmount,
        refundedAmount: input.refundedAmount,
        retainedAmount: input.retainedAmount,
        driverShareAmount: input.driverShareAmount,
        platformShareAmount: input.platformShareAmount,
        status: input.status,
        driverPayoutState: input.driverPayoutState,
        requiresManualReview: input.requiresManualReview,
        lastStripeRefundId: null,
        disputeReportedAt: null,
        stripeDisputeId: null,
        disputeStatus: null,
        disputeReason: null,
        disputeAmount: null,
        disputeCurrency: null,
        disputeCreatedAt: null,
        disputeUpdatedAt: null,
        disputeClosedAt: null,
        disputeEvidenceDueBy: null,
        payoutFailureReason: null,
        payoutAttemptCount: 0,
        lastPayoutAttemptAt: null,
        nextPayoutRetryAt: null,
      },
      create: {
        requestId: hold.requestId,
        paymentHoldId: hold.id,
        customerId: hold.customerId,
        driverId: hold.driverId,
        currency: hold.currency,
        collectedAmount: input.collectedAmount,
        refundableAmount: input.refundableAmount,
        refundedAmount: input.refundedAmount,
        retainedAmount: input.retainedAmount,
        driverShareAmount: input.driverShareAmount,
        platformShareAmount: input.platformShareAmount,
        status: input.status,
        driverPayoutState: input.driverPayoutState,
        requiresManualReview: input.requiresManualReview,
        lastStripeRefundId: null,
        disputeReportedAt: null,
        stripeDisputeId: null,
        disputeStatus: null,
        disputeReason: null,
        disputeAmount: null,
        disputeCurrency: null,
        disputeCreatedAt: null,
        disputeUpdatedAt: null,
        disputeClosedAt: null,
        disputeEvidenceDueBy: null,
        payoutFailureReason: null,
        payoutAttemptCount: 0,
        lastPayoutAttemptAt: null,
        nextPayoutRetryAt: null,
      },
    });
  }

  private async createWalletHold(
    tx: Prisma.TransactionClient,
    input: CreateHoldInput & { amount: Prisma.Decimal; currency: string },
  ): Promise<PaymentSummaryDto> {
    const wallet = await tx.customerWallet.findUnique({
      where: { customerId: input.customerId },
      select: WALLET_SELECT,
    });

    if (!wallet) {
      throw new BadRequestException('Customer wallet balance is insufficient.');
    }

    if (wallet.currency !== input.currency) {
      throw new BadRequestException(
        `Wallet holds must use ${wallet.currency}.`,
      );
    }

    const availableBalance = this.getAvailableBalance(wallet);

    if (availableBalance.lt(input.amount)) {
      throw new BadRequestException('Customer wallet balance is insufficient.');
    }

    await tx.customerWallet.update({
      where: { id: wallet.id },
      data: {
        balance: wallet.balance.sub(input.amount),
      },
    });

    const hold = await tx.paymentHold.create({
      data: {
        customerId: input.customerId,
        requestId: input.requestId,
        acceptedOfferId: input.acceptedOfferId,
        driverId: input.driverId,
        amount: input.amount,
        currency: input.currency,
        paymentMethod: input.paymentMethod,
        provider: PaymentProvider.APP_WALLET,
        status: PaymentStatus.PAYMENT_CAPTURED,
      },
      select: PAYMENT_HOLD_SELECT,
    });

    await tx.customerWalletTransaction.create({
      data: {
        walletId: wallet.id,
        customerId: input.customerId,
        paymentHoldId: hold.id,
        amount: input.amount,
        currency: input.currency,
        type: PaymentTransactionType.CAPTURE,
        description: 'Collected wallet funds for accepted driver offer.',
        metadata: {
          requestId: input.requestId,
          acceptedOfferId: input.acceptedOfferId,
        },
      },
    });

    await tx.transportRequest.update({
      where: { id: input.requestId },
      data: {
        paymentStatus: PaymentStatus.PAYMENT_CAPTURED,
        paymentMethod: input.paymentMethod,
        heldAmount: new Prisma.Decimal(0),
        capturedAmount: input.amount,
        paymentHoldId: hold.id,
      },
    });

    await this.createTripPaymentSettlement(tx, hold, {
      collectedAmount: input.amount,
      refundableAmount: input.amount,
      refundedAmount: new Prisma.Decimal(0),
      retainedAmount: new Prisma.Decimal(0),
      driverShareAmount: new Prisma.Decimal(0),
      platformShareAmount: new Prisma.Decimal(0),
      status: TripPaymentSettlementStatus.COLLECTED,
      driverPayoutState: DriverPayoutState.NOT_EARNED,
      requiresManualReview: false,
    });

    return this.toPaymentSummaryDto(hold);
  }

  private async createStripeHold(
    tx: Prisma.TransactionClient,
    input: CreateHoldInput & { amount: Prisma.Decimal; currency: string },
  ): Promise<PaymentSummaryDto> {
    const customer = await tx.user.findUnique({
      where: { id: input.customerId },
      select: {
        id: true,
        email: true,
        name: true,
        stripeCustomerId: true,
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer account not found.');
    }

    const stripeCustomerId = await this.stripeService.ensureCustomer({
      customerId: customer.id,
      email: customer.email,
      name: customer.name,
      stripeCustomerId: customer.stripeCustomerId,
    });

    if (stripeCustomerId !== customer.stripeCustomerId) {
      await tx.user.update({
        where: { id: customer.id },
        data: {
          stripeCustomerId,
        },
      });
    }

    const paymentIntent = await this.stripeService.createImmediateCaptureIntent(
      {
        customerId: stripeCustomerId,
        amount: this.toStripeMinorUnit(input.amount),
        currency: input.currency.toLowerCase(),
        stripePaymentMethodId: input.stripePaymentMethodId,
        metadata: {
          requestId: input.requestId,
          customerId: input.customerId,
          driverId: input.driverId,
          acceptedOfferId: input.acceptedOfferId,
        },
      },
    );

    try {
      const status = this.mapStripeIntentStatus(paymentIntent);
      const hold = await tx.paymentHold.create({
        data: {
          customerId: input.customerId,
          requestId: input.requestId,
          acceptedOfferId: input.acceptedOfferId,
          driverId: input.driverId,
          amount: input.amount,
          currency: input.currency,
          paymentMethod: input.paymentMethod,
          provider: PaymentProvider.STRIPE,
          status,
          stripePaymentMethodId: input.stripePaymentMethodId?.trim() || null,
          stripePaymentIntentId: paymentIntent.id,
          stripeClientSecret: paymentIntent.client_secret,
          stripeChargeId: this.getStripeChargeId(paymentIntent),
        },
        select: PAYMENT_HOLD_SELECT,
      });

      await tx.transportRequest.update({
        where: { id: input.requestId },
        data: {
          paymentStatus: status,
          paymentMethod: input.paymentMethod,
          heldAmount:
            status === PaymentStatus.PAYMENT_CAPTURED
              ? new Prisma.Decimal(0)
              : input.amount,
          capturedAmount:
            status === PaymentStatus.PAYMENT_CAPTURED
              ? input.amount
              : new Prisma.Decimal(0),
          paymentHoldId: hold.id,
          stripePaymentIntentId: paymentIntent.id,
        },
      });

      await this.createTripPaymentSettlement(tx, hold, {
        collectedAmount:
          status === PaymentStatus.PAYMENT_CAPTURED
            ? input.amount
            : new Prisma.Decimal(0),
        refundableAmount:
          status === PaymentStatus.PAYMENT_CAPTURED
            ? input.amount
            : new Prisma.Decimal(0),
        refundedAmount: new Prisma.Decimal(0),
        retainedAmount: new Prisma.Decimal(0),
        driverShareAmount: new Prisma.Decimal(0),
        platformShareAmount: new Prisma.Decimal(0),
        status:
          status === PaymentStatus.PAYMENT_CAPTURED
            ? TripPaymentSettlementStatus.COLLECTED
            : TripPaymentSettlementStatus.REFUND_PENDING,
        driverPayoutState: DriverPayoutState.NOT_EARNED,
        requiresManualReview: false,
      });

      return this.toPaymentSummaryDto(hold);
    } catch (error) {
      try {
        await this.stripeService.cancelPaymentIntent(paymentIntent.id);
      } catch {
        // Best-effort compensation for an orphaned external hold.
      }
      throw error;
    }
  }

  private async releaseWalletReservation(
    tx: Prisma.TransactionClient,
    hold: PaymentHoldRecord,
  ): Promise<void> {
    const wallet = await this.ensureWallet(tx, hold.customerId, hold.currency);

    await tx.customerWallet.update({
      where: { id: wallet.id },
      data: {
        reservedBalance: this.maxDecimalZero(
          wallet.reservedBalance.sub(hold.amount),
        ),
      },
    });

    await tx.customerWalletTransaction.create({
      data: {
        walletId: wallet.id,
        customerId: hold.customerId,
        paymentHoldId: hold.id,
        amount: hold.amount,
        currency: hold.currency,
        type: PaymentTransactionType.RELEASE,
        description: 'Released reserved wallet funds.',
        metadata: {
          requestId: hold.requestId,
        },
      },
    });
  }

  private async captureWalletReservation(
    tx: Prisma.TransactionClient,
    hold: PaymentHoldRecord,
  ): Promise<void> {
    const wallet = await this.ensureWallet(tx, hold.customerId, hold.currency);

    await tx.customerWallet.update({
      where: { id: wallet.id },
      data: {
        reservedBalance: this.maxDecimalZero(
          wallet.reservedBalance.sub(hold.amount),
        ),
        balance: wallet.balance.sub(hold.amount),
      },
    });

    await tx.customerWalletTransaction.create({
      data: {
        walletId: wallet.id,
        customerId: hold.customerId,
        paymentHoldId: hold.id,
        amount: hold.amount,
        currency: hold.currency,
        type: PaymentTransactionType.CAPTURE,
        description: 'Captured reserved wallet funds.',
        metadata: {
          requestId: hold.requestId,
        },
      },
    });
  }

  private async ensureWallet(
    tx: Prisma.TransactionClient | PrismaService,
    customerId: string,
    currency: string,
  ): Promise<WalletRecord> {
    const existing = await tx.customerWallet.findUnique({
      where: { customerId },
      select: WALLET_SELECT,
    });

    if (existing) {
      return existing;
    }

    return tx.customerWallet.create({
      data: {
        customerId,
        currency,
        balance: new Prisma.Decimal(0),
        reservedBalance: new Prisma.Decimal(0),
      },
      select: WALLET_SELECT,
    });
  }

  private getAvailableBalance(wallet: WalletRecord): Prisma.Decimal {
    return wallet.balance.sub(wallet.reservedBalance);
  }

  private calculateCustomerCancellationRefund(
    collectedAmount: Prisma.Decimal,
  ): Prisma.Decimal {
    return collectedAmount
      .mul(new Prisma.Decimal(1).sub(TRIP_CANCELLATION_FEE_RATE))
      .toDecimalPlaces(2);
  }

  private async findOrCreateWalletForTopUpSuccess(
    tx: Prisma.TransactionClient,
    topUp: WalletTopUpRecord,
  ): Promise<WalletRecord> {
    if (topUp.walletId) {
      const wallet = await tx.customerWallet.findUnique({
        where: { id: topUp.walletId },
        select: WALLET_SELECT,
      });
      if (wallet) {
        return wallet;
      }
    }

    const existing = await tx.customerWallet.findUnique({
      where: { customerId: topUp.customerId },
      select: WALLET_SELECT,
    });
    if (existing) {
      return existing;
    }

    return tx.customerWallet.create({
      data: {
        customerId: topUp.customerId,
        currency: topUp.currency,
        balance: new Prisma.Decimal(0),
        reservedBalance: new Prisma.Decimal(0),
      },
      select: WALLET_SELECT,
    });
  }

  private toStripeMinorUnit(amount: Prisma.Decimal): number {
    return Number(
      amount.mul(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP),
    );
  }

  private mapStripeIntentStatus(
    paymentIntent: StripePaymentIntentRecord,
  ): PaymentStatus {
    // Legacy/manual-capture intents can still surface from older data, but the
    // active trip flow now relies on immediate capture and does not treat them
    // as collected payments.
    if (paymentIntent.status === 'requires_capture') {
      return PaymentStatus.PAYMENT_HELD;
    }

    if (paymentIntent.status === 'succeeded') {
      return PaymentStatus.PAYMENT_CAPTURED;
    }

    if (paymentIntent.status === 'canceled') {
      return PaymentStatus.PAYMENT_CANCELLED;
    }

    if (paymentIntent.status === 'requires_payment_method') {
      return PaymentStatus.PAYMENT_HOLD_PENDING;
    }

    return PaymentStatus.PAYMENT_HOLD_PENDING;
  }

  private mapStripeEventToPaymentStatus(
    paymentIntent: StripePaymentIntentRecord,
    eventType: string,
  ): PaymentStatus {
    switch (eventType) {
      case 'payment_intent.amount_capturable_updated':
        return PaymentStatus.PAYMENT_HELD;
      case 'payment_intent.succeeded':
        return PaymentStatus.PAYMENT_CAPTURED;
      case 'payment_intent.payment_failed':
        return PaymentStatus.PAYMENT_FAILED;
      case 'payment_intent.canceled':
        return PaymentStatus.PAYMENT_CANCELLED;
      default:
        return this.mapStripeIntentStatus(paymentIntent);
    }
  }

  private mapStripeEventToWalletTopUpStatus(
    paymentIntent: StripePaymentIntentRecord,
    eventType: string,
  ): CustomerWalletTopUpStatus | null {
    switch (eventType) {
      case 'payment_intent.succeeded':
      case 'succeeded':
        return CustomerWalletTopUpStatus.SUCCEEDED;
      case 'payment_intent.payment_failed':
      case 'requires_payment_method':
        return CustomerWalletTopUpStatus.FAILED;
      case 'payment_intent.canceled':
      case 'canceled':
        return CustomerWalletTopUpStatus.CANCELLED;
      default:
        if (paymentIntent.status === 'succeeded') {
          return CustomerWalletTopUpStatus.SUCCEEDED;
        }
        if (paymentIntent.status === 'canceled') {
          return CustomerWalletTopUpStatus.CANCELLED;
        }
        if (paymentIntent.status === 'requires_payment_method') {
          return CustomerWalletTopUpStatus.FAILED;
        }
        return null;
    }
  }

  private getWalletTopUpFailureReason(
    paymentIntent: StripePaymentIntentRecord,
    status: CustomerWalletTopUpStatus,
  ): string | null {
    if (status === CustomerWalletTopUpStatus.FAILED) {
      return (
        paymentIntent.last_payment_error?.message?.trim() ||
        'Wallet top-up failed.'
      );
    }

    if (status === CustomerWalletTopUpStatus.CANCELLED) {
      return (
        paymentIntent.cancellation_reason?.trim() ||
        'Wallet top-up was cancelled.'
      );
    }

    return null;
  }

  private getStripeChargeId(
    paymentIntent: StripePaymentIntentRecord,
  ): string | null {
    if (typeof paymentIntent.latest_charge === 'string') {
      return paymentIntent.latest_charge;
    }

    if (
      paymentIntent.latest_charge &&
      typeof paymentIntent.latest_charge === 'object' &&
      'id' in paymentIntent.latest_charge
    ) {
      return paymentIntent.latest_charge.id;
    }

    return null;
  }

  private toPaymentSummaryDto(hold: PaymentHoldRecord): PaymentSummaryDto {
    const capturedAmount =
      hold.status === PaymentStatus.PAYMENT_CAPTURED ||
      hold.status === PaymentStatus.PAYMENT_PARTIALLY_REFUNDED ||
      hold.status === PaymentStatus.PAYMENT_REFUNDED ||
      hold.status === PaymentStatus.PAYMENT_DISPUTED
        ? Number(hold.amount)
        : 0;

    return {
      id: hold.id,
      requestId: hold.requestId,
      acceptedOfferId: hold.acceptedOfferId,
      customerId: hold.customerId,
      driverId: hold.driverId,
      amount: Number(hold.amount),
      heldAmount: ACTIVE_PAYMENT_STATUSES.has(hold.status)
        ? Number(hold.amount)
        : 0,
      capturedAmount,
      currency: hold.currency,
      paymentMethod: hold.paymentMethod,
      provider: hold.provider,
      status: hold.status,
      stripePaymentIntentId: hold.stripePaymentIntentId,
      stripeClientSecret: hold.stripeClientSecret,
      stripeChargeId: hold.stripeChargeId,
      createdAt: hold.createdAt.toISOString(),
      updatedAt: hold.updatedAt.toISOString(),
    };
  }

  private toTripPaymentSettlementDto(
    settlement: TripPaymentSettlementRecord,
  ): TripPaymentSettlementDto {
    return {
      id: settlement.id,
      requestId: settlement.requestId,
      paymentHoldId: settlement.paymentHoldId,
      customerId: settlement.customerId,
      driverId: settlement.driverId,
      currency: settlement.currency,
      collectedAmount: Number(settlement.collectedAmount),
      refundableAmount: Number(settlement.refundableAmount),
      refundedAmount: Number(settlement.refundedAmount),
      retainedAmount: Number(settlement.retainedAmount),
      driverShareAmount: Number(settlement.driverShareAmount),
      platformShareAmount: Number(settlement.platformShareAmount),
      status: settlement.status,
      driverPayoutState: settlement.driverPayoutState,
      requiresManualReview: settlement.requiresManualReview,
      lastStripeRefundId: settlement.lastStripeRefundId,
      disputeReportedAt: settlement.disputeReportedAt
        ? settlement.disputeReportedAt.toISOString()
        : null,
      stripeDisputeId: settlement.stripeDisputeId,
      disputeStatus: settlement.disputeStatus,
      disputeReason: settlement.disputeReason,
      disputeAmount:
        settlement.disputeAmount !== null
          ? Number(settlement.disputeAmount)
          : null,
      disputeCurrency: settlement.disputeCurrency,
      disputeCreatedAt: settlement.disputeCreatedAt
        ? settlement.disputeCreatedAt.toISOString()
        : null,
      disputeUpdatedAt: settlement.disputeUpdatedAt
        ? settlement.disputeUpdatedAt.toISOString()
        : null,
      disputeClosedAt: settlement.disputeClosedAt
        ? settlement.disputeClosedAt.toISOString()
        : null,
      disputeEvidenceDueBy: settlement.disputeEvidenceDueBy
        ? settlement.disputeEvidenceDueBy.toISOString()
        : null,
      payoutFailureReason: settlement.payoutFailureReason,
      createdAt: settlement.createdAt.toISOString(),
      updatedAt: settlement.updatedAt.toISOString(),
    };
  }

  private toCustomerWalletSummaryDto(
    customerId: string,
    wallet: WalletRecord | null,
    transactions: WalletTransactionRecord[],
  ): CustomerWalletSummaryDto {
    const balance = wallet ? Number(wallet.balance) : 0;
    const reservedBalance = wallet ? Number(wallet.reservedBalance) : 0;
    return {
      id: wallet?.id ?? null,
      customerId,
      currency: wallet?.currency ?? null,
      balance,
      reservedBalance,
      availableBalance: balance - reservedBalance,
      recentTransactions: transactions.map((transaction) =>
        this.toCustomerWalletTransactionDto(transaction),
      ),
    };
  }

  private toCustomerWalletTransactionDto(
    transaction: WalletTransactionRecord,
  ): CustomerWalletTransactionDto {
    return {
      id: transaction.id,
      amount: Number(transaction.amount),
      currency: transaction.currency,
      type: transaction.type,
      description: transaction.description,
      paymentHoldId: transaction.paymentHoldId,
      walletTopUpId: transaction.walletTopUpId,
      additionalChargeId: transaction.additionalChargeId,
      createdAt: transaction.createdAt.toISOString(),
    };
  }

  private toCustomerWalletTopUpDto(
    topUp: WalletTopUpRecord,
  ): CustomerWalletTopUpDto {
    return {
      id: topUp.id,
      walletId: topUp.walletId,
      customerId: topUp.customerId,
      amount: Number(topUp.amount),
      currency: topUp.currency,
      paymentMethod: topUp.paymentMethod,
      provider: topUp.provider,
      status: topUp.status,
      stripePaymentIntentId: topUp.stripePaymentIntentId,
      stripeClientSecret: topUp.stripeClientSecret,
      stripeChargeId: topUp.stripeChargeId,
      requiresManualReview: topUp.requiresManualReview,
      stripeDisputeId: topUp.stripeDisputeId,
      disputeStatus: topUp.disputeStatus,
      disputeReason: topUp.disputeReason,
      disputeAmount:
        topUp.disputeAmount !== null ? Number(topUp.disputeAmount) : null,
      disputeCurrency: topUp.disputeCurrency,
      disputeCreatedAt: topUp.disputeCreatedAt
        ? topUp.disputeCreatedAt.toISOString()
        : null,
      disputeUpdatedAt: topUp.disputeUpdatedAt
        ? topUp.disputeUpdatedAt.toISOString()
        : null,
      disputeClosedAt: topUp.disputeClosedAt
        ? topUp.disputeClosedAt.toISOString()
        : null,
      disputeEvidenceDueBy: topUp.disputeEvidenceDueBy
        ? topUp.disputeEvidenceDueBy.toISOString()
        : null,
      failureReason: topUp.failureReason,
      completedAt: topUp.completedAt ? topUp.completedAt.toISOString() : null,
      createdAt: topUp.createdAt.toISOString(),
      updatedAt: topUp.updatedAt.toISOString(),
    };
  }

  private toAdditionalChargeResponseDto(charge: {
    id: string;
    requestId: string;
    driverId: string;
    customerId: string;
    amount: Prisma.Decimal;
    currency: string;
    reason: string;
    equipmentType: string | null;
    invoiceUrl: string;
    invoiceOriginalFilename: string | null;
    invoiceMimeType: string | null;
    invoiceSizeBytes: number | null;
    approvedAt: Date | null;
    approvedByCustomerId: string | null;
    approvalLocale: string | null;
    approvalConfirmationText: string | null;
    stripePaymentIntentId: string | null;
    stripeChargeId: string | null;
    savedPaymentMethodId: string | null;
    savedPaymentMethodBrand: string | null;
    savedPaymentMethodLast4: string | null;
    savedPaymentMethodExpMonth: number | null;
    savedPaymentMethodExpYear: number | null;
    paymentFailureReason: string | null;
    status: AdditionalChargeStatus;
    createdAt: Date;
    updatedAt: Date;
  }): AdditionalChargeResponseDto {
    const paymentOption = this.getAdditionalChargePaymentOption({
      approvedAt: charge.approvedAt,
      stripePaymentIntentId: charge.stripePaymentIntentId,
      stripeChargeId: charge.stripeChargeId,
      savedPaymentMethodId: charge.savedPaymentMethodId,
    });

    return {
      id: charge.id,
      requestId: charge.requestId,
      driverId: charge.driverId,
      customerId: charge.customerId,
      amount: Number(charge.amount),
      appFeeAmount: Number(this.calculateAdditionalChargeAppFee(charge.amount)),
      totalChargeAmount: Number(
        this.calculateAdditionalChargeTotal(charge.amount),
      ),
      currency: charge.currency,
      reason: charge.reason,
      equipmentType: charge.equipmentType,
      invoiceUrl: charge.invoiceUrl,
      invoice: {
        originalFilename: charge.invoiceOriginalFilename,
        mimeType: charge.invoiceMimeType,
        sizeBytes: charge.invoiceSizeBytes,
      },
      approval: {
        approvedAt: charge.approvedAt ? charge.approvedAt.toISOString() : null,
        approvedByCustomerId: charge.approvedByCustomerId,
        confirmationLocale: charge.approvalLocale,
        confirmationText: charge.approvalConfirmationText,
      },
      payment: {
        paymentOption,
        stripePaymentIntentId: charge.stripePaymentIntentId,
        stripeChargeId: charge.stripeChargeId,
        savedPaymentMethod: charge.savedPaymentMethodId
          ? {
              id: charge.savedPaymentMethodId,
              brand: charge.savedPaymentMethodBrand,
              last4: charge.savedPaymentMethodLast4,
              expMonth: charge.savedPaymentMethodExpMonth,
              expYear: charge.savedPaymentMethodExpYear,
            }
          : null,
        failureReason: charge.paymentFailureReason,
      },
      status: charge.status,
      createdAt: charge.createdAt.toISOString(),
      updatedAt: charge.updatedAt.toISOString(),
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

  private toSavedPaymentMethodSummary(
    paymentMethod: StripeCardPaymentMethodSummary,
  ): SavedPaymentMethodSummaryDto {
    return {
      id: paymentMethod.id,
      brand: paymentMethod.brand,
      last4: paymentMethod.last4,
      expMonth: paymentMethod.expMonth,
      expYear: paymentMethod.expYear,
    };
  }

  private async assertCustomerOwnsRequest(
    customerId: string,
    requestId: string,
  ): Promise<void> {
    const request = await this.prisma.transportRequest.findUnique({
      where: { id: requestId },
      select: {
        customerId: true,
      },
    });

    if (!request) {
      throw new NotFoundException('Transport request not found.');
    }

    if (request.customerId !== customerId) {
      throw new ForbiddenException(
        'You are not allowed to view this transport request.',
      );
    }
  }

  private normalizeCurrency(currency?: string | null): string {
    return (
      currency?.trim() ||
      process.env.STRIPE_CURRENCY ||
      'CHF'
    ).toUpperCase();
  }

  private toMoneyDecimal(value: Prisma.Decimal | number): Prisma.Decimal {
    return new Prisma.Decimal(value).toDecimalPlaces(2);
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

  private maxDecimalZero(value: Prisma.Decimal): Prisma.Decimal {
    return value.lt(0) ? new Prisma.Decimal(0) : value;
  }

  private normalizeStripeDisputeReference(
    value?: string | null,
  ): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private buildPaymentHoldDisputeLookup(input: {
    paymentIntentId: string | null;
    chargeId: string | null;
  }): Prisma.PaymentHoldWhereInput[] {
    const filters: Prisma.PaymentHoldWhereInput[] = [];

    if (input.paymentIntentId) {
      filters.push({ stripePaymentIntentId: input.paymentIntentId });
    }

    if (input.chargeId) {
      filters.push({ stripeChargeId: input.chargeId });
    }

    return filters;
  }

  private buildWalletTopUpDisputeLookup(input: {
    paymentIntentId: string | null;
    chargeId: string | null;
  }): Prisma.CustomerWalletTopUpWhereInput[] {
    const filters: Prisma.CustomerWalletTopUpWhereInput[] = [];

    if (input.paymentIntentId) {
      filters.push({ stripePaymentIntentId: input.paymentIntentId });
    }

    if (input.chargeId) {
      filters.push({ stripeChargeId: input.chargeId });
    }

    return filters;
  }

  private toDisputePersistence(
    dispute: StripeDisputeRecord,
    eventType: string,
  ): {
    stripeDisputeId: string;
    disputeStatus: string | null;
    disputeReason: string | null;
    disputeAmount: Prisma.Decimal;
    disputeCurrency: string | null;
    disputeCreatedAt: Date | null;
    disputeUpdatedAt: Date;
    disputeClosedAt: Date | null;
    disputeEvidenceDueBy: Date | null;
  } {
    return {
      stripeDisputeId: dispute.id,
      disputeStatus: dispute.status?.trim() ?? null,
      disputeReason: dispute.reason?.trim() ?? null,
      disputeAmount: this.toMoneyDecimal(dispute.amount / 100),
      disputeCurrency: dispute.currency?.toUpperCase() ?? null,
      disputeCreatedAt:
        typeof dispute.created === 'number'
          ? new Date(dispute.created * 1000)
          : null,
      disputeUpdatedAt: new Date(),
      disputeClosedAt:
        eventType === 'charge.dispute.closed' ? new Date() : null,
      disputeEvidenceDueBy:
        typeof dispute.evidence_details?.due_by === 'number'
          ? new Date(dispute.evidence_details.due_by * 1000)
          : null,
    };
  }

  private getTripDisputePaymentStatus(
    disputeStatus: string | null,
    eventType: string,
  ): PaymentStatus {
    if (eventType === 'charge.dispute.closed' && disputeStatus === 'won') {
      return PaymentStatus.PAYMENT_CAPTURED;
    }

    return PaymentStatus.PAYMENT_DISPUTED;
  }

  private getTripDisputeSettlementStatus(
    disputeStatus: string | null,
    eventType: string,
  ): TripPaymentSettlementStatus {
    if (eventType === 'charge.dispute.closed' && disputeStatus === 'won') {
      return TripPaymentSettlementStatus.COLLECTED;
    }

    if (eventType === 'charge.dispute.closed') {
      return TripPaymentSettlementStatus.MANUAL_REVIEW;
    }

    return TripPaymentSettlementStatus.DISPUTED;
  }

  private getWalletTopUpDisputeStatus(
    disputeStatus: string | null,
    eventType: string,
  ): CustomerWalletTopUpStatus {
    if (eventType === 'charge.dispute.closed' && disputeStatus === 'won') {
      return CustomerWalletTopUpStatus.SUCCEEDED;
    }

    if (eventType === 'charge.dispute.closed') {
      return CustomerWalletTopUpStatus.MANUAL_REVIEW;
    }

    return CustomerWalletTopUpStatus.DISPUTED;
  }

  private requiresManualReviewForDispute(
    disputeStatus: string | null,
    eventType: string,
  ): boolean {
    return !(eventType === 'charge.dispute.closed' && disputeStatus === 'won');
  }

  private async cleanupFile(file: MulterFile): Promise<void> {
    try {
      await unlink(file.path);
    } catch {
      return;
    }
  }
}

const PAYMENT_HOLD_SELECT = {
  id: true,
  requestId: true,
  acceptedOfferId: true,
  customerId: true,
  driverId: true,
  amount: true,
  currency: true,
  paymentMethod: true,
  provider: true,
  status: true,
  stripePaymentIntentId: true,
  stripeClientSecret: true,
  stripeChargeId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PaymentHoldSelect;

const ADDITIONAL_CHARGE_SELECT = {
  id: true,
  requestId: true,
  driverId: true,
  customerId: true,
  amount: true,
  currency: true,
  reason: true,
  equipmentType: true,
  invoiceUrl: true,
  invoiceOriginalFilename: true,
  invoiceMimeType: true,
  invoiceSizeBytes: true,
  approvedAt: true,
  approvedByCustomerId: true,
  approvalLocale: true,
  approvalConfirmationText: true,
  stripePaymentIntentId: true,
  stripeChargeId: true,
  savedPaymentMethodId: true,
  savedPaymentMethodBrand: true,
  savedPaymentMethodLast4: true,
  savedPaymentMethodExpMonth: true,
  savedPaymentMethodExpYear: true,
  paymentFailureReason: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AdditionalChargeSelect;

const WALLET_SELECT = {
  id: true,
  customerId: true,
  currency: true,
  balance: true,
  reservedBalance: true,
} satisfies Prisma.CustomerWalletSelect;

const WALLET_TRANSACTION_SELECT = {
  id: true,
  amount: true,
  currency: true,
  type: true,
  description: true,
  paymentHoldId: true,
  walletTopUpId: true,
  additionalChargeId: true,
  createdAt: true,
} satisfies Prisma.CustomerWalletTransactionSelect;

const WALLET_TOP_UP_SELECT = {
  id: true,
  walletId: true,
  customerId: true,
  amount: true,
  currency: true,
  paymentMethod: true,
  provider: true,
  status: true,
  stripePaymentIntentId: true,
  stripeClientSecret: true,
  stripeChargeId: true,
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
  failureReason: true,
  completedAt: true,
  failedAt: true,
  cancelledAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CustomerWalletTopUpSelect;

const TRIP_PAYMENT_SETTLEMENT_SELECT = {
  id: true,
  requestId: true,
  paymentHoldId: true,
  customerId: true,
  driverId: true,
  currency: true,
  collectedAmount: true,
  refundableAmount: true,
  refundedAmount: true,
  retainedAmount: true,
  driverShareAmount: true,
  platformShareAmount: true,
  status: true,
  driverPayoutState: true,
  requiresManualReview: true,
  lastStripeRefundId: true,
  disputeReportedAt: true,
  stripeDisputeId: true,
  disputeStatus: true,
  disputeReason: true,
  disputeAmount: true,
  disputeCurrency: true,
  disputeCreatedAt: true,
  disputeUpdatedAt: true,
  disputeClosedAt: true,
  disputeEvidenceDueBy: true,
  payoutFailureReason: true,
  payoutAttemptCount: true,
  lastPayoutAttemptAt: true,
  nextPayoutRetryAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TripPaymentSettlementSelect;
