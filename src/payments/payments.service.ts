import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { File as MulterFile } from 'multer';
import { unlink } from 'node:fs/promises';
import { relative } from 'node:path';
import {
  AdditionalChargeStatus,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  PaymentTransactionType,
  Prisma,
  TransportRequestStatus,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  AdditionalChargeResponseDto,
  PaymentSummaryDto,
} from './dto/request-payment.dto';
import { StripeService } from './stripe.service';

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

type CapturePaymentInput = {
  requestId: string;
  customerId?: string;
};

type CreateAdditionalChargeInput = {
  driverUserId: string;
  requestId: string;
  amount: number;
  reason: string;
  equipmentType?: string;
  invoiceFile: MulterFile;
};

type WalletRecord = {
  id: string;
  customerId: string;
  currency: string;
  balance: Prisma.Decimal;
  reservedBalance: Prisma.Decimal;
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

type StripePaymentIntentRecord = {
  id: string;
  status: string;
  latest_charge?: string | { id: string } | null;
  client_secret?: string | null;
};

const ACTIVE_PAYMENT_STATUSES = new Set<PaymentStatus>([
  PaymentStatus.PAYMENT_HOLD_PENDING,
  PaymentStatus.PAYMENT_HELD,
  PaymentStatus.PAYMENT_CAPTURE_PENDING,
]);

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
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
      const paymentIntent = await this.stripeService.retrievePaymentIntent(
        request.paymentHold.stripePaymentIntentId,
      );
      await this.syncStripePaymentIntent(
        paymentIntent,
        'payment_intent.status_checked',
      );

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
      await this.stripeService.cancelPaymentIntent(hold.stripePaymentIntentId);
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

  async captureRequestPayment(
    input: CapturePaymentInput,
  ): Promise<PaymentSummaryDto> {
    return this.prisma.$transaction((tx) =>
      this.captureRequestPaymentTx(tx, input),
    );
  }

  async captureRequestPaymentTx(
    tx: Prisma.TransactionClient,
    input: CapturePaymentInput,
  ): Promise<PaymentSummaryDto> {
    const hold = await tx.paymentHold.findUnique({
      where: { requestId: input.requestId },
      select: PAYMENT_HOLD_SELECT,
    });

    if (!hold) {
      throw new NotFoundException('Payment hold not found.');
    }

    if (input.customerId && hold.customerId !== input.customerId) {
      throw new ForbiddenException(
        'You are not allowed to capture this payment.',
      );
    }

    if (hold.status === PaymentStatus.PAYMENT_CAPTURED) {
      return this.toPaymentSummaryDto(hold);
    }

    if (
      hold.status === PaymentStatus.PAYMENT_RELEASED ||
      hold.status === PaymentStatus.PAYMENT_CANCELLED ||
      hold.status === PaymentStatus.PAYMENT_FAILED
    ) {
      throw new ConflictException('This payment can no longer be captured.');
    }

    if (hold.provider === PaymentProvider.APP_WALLET) {
      await this.captureWalletReservation(tx, hold);

      const updated = await tx.paymentHold.update({
        where: { id: hold.id },
        data: {
          status: PaymentStatus.PAYMENT_CAPTURED,
          capturedAt: new Date(),
        },
        select: PAYMENT_HOLD_SELECT,
      });

      await tx.transportRequest.update({
        where: { id: input.requestId },
        data: {
          paymentStatus: PaymentStatus.PAYMENT_CAPTURED,
          capturedAmount: hold.amount,
        },
      });

      return this.toPaymentSummaryDto(updated);
    }

    if (!hold.stripePaymentIntentId) {
      throw new BadRequestException('Stripe payment intent is missing.');
    }

    const capturedIntent = await this.stripeService.capturePaymentIntent(
      hold.stripePaymentIntentId,
    );

    const updated = await tx.paymentHold.update({
      where: { id: hold.id },
      data: {
        status: PaymentStatus.PAYMENT_CAPTURED,
        capturedAt: new Date(),
        stripeChargeId: this.getStripeChargeId(capturedIntent),
      },
      select: PAYMENT_HOLD_SELECT,
    });

    await tx.transportRequest.update({
      where: { id: input.requestId },
      data: {
        paymentStatus: PaymentStatus.PAYMENT_CAPTURED,
        capturedAmount: hold.amount,
      },
    });

    return this.toPaymentSummaryDto(updated);
  }

  async createAdditionalCharge(
    input: CreateAdditionalChargeInput,
  ): Promise<AdditionalChargeResponseDto> {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { userId: input.driverUserId },
      select: { id: true },
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
      request.status === TransportRequestStatus.CANCELLED ||
      request.status === TransportRequestStatus.COMPLETED
    ) {
      await this.cleanupFile(input.invoiceFile);
      throw new BadRequestException(
        'Additional charges are not allowed for closed requests.',
      );
    }

    const currency = this.normalizeCurrency(request.currency);
    const amount = this.toMoneyDecimal(input.amount);
    const wallet = await this.ensureWallet(
      this.prisma,
      request.customerId,
      currency,
    );

    if (this.getAvailableBalance(wallet).lt(amount)) {
      await this.cleanupFile(input.invoiceFile);
      throw new BadRequestException(
        'Customer wallet balance is insufficient for this additional charge.',
      );
    }

    const storageKey = relative(process.cwd(), input.invoiceFile.path).replace(
      /\\/g,
      '/',
    );
    const invoiceUrl = `/${storageKey}`;

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.customerWallet.update({
        where: { id: wallet.id },
        data: {
          balance: wallet.balance.sub(amount),
        },
      });

      const charge = await tx.additionalCharge.create({
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
          status: AdditionalChargeStatus.CAPTURED,
        },
        select: ADDITIONAL_CHARGE_SELECT,
      });

      await tx.customerWalletTransaction.create({
        data: {
          walletId: wallet.id,
          customerId: request.customerId,
          additionalChargeId: charge.id,
          amount,
          currency,
          type: PaymentTransactionType.ADDITIONAL_CHARGE,
          description: input.reason.trim(),
          metadata: {
            requestId: request.id,
            driverId: profile.id,
          },
        },
      });

      return charge;
    });

    return this.toAdditionalChargeResponseDto(created);
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
      default:
        break;
    }

    return {
      received: true,
      type: event.type,
    };
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
    });
  }

  private async createWalletHold(
    tx: Prisma.TransactionClient,
    input: CreateHoldInput & { amount: Prisma.Decimal; currency: string },
  ): Promise<PaymentSummaryDto> {
    const wallet = await this.ensureWallet(
      tx,
      input.customerId,
      input.currency,
    );
    const availableBalance = this.getAvailableBalance(wallet);

    if (availableBalance.lt(input.amount)) {
      throw new BadRequestException('Customer wallet balance is insufficient.');
    }

    await tx.customerWallet.update({
      where: { id: wallet.id },
      data: {
        reservedBalance: wallet.reservedBalance.add(input.amount),
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
        status: PaymentStatus.PAYMENT_HELD,
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
        type: PaymentTransactionType.HOLD,
        description: 'Reserved wallet funds for accepted driver offer.',
        metadata: {
          requestId: input.requestId,
          acceptedOfferId: input.acceptedOfferId,
        },
      },
    });

    await tx.transportRequest.update({
      where: { id: input.requestId },
      data: {
        paymentStatus: PaymentStatus.PAYMENT_HELD,
        paymentMethod: input.paymentMethod,
        heldAmount: input.amount,
        capturedAmount: new Prisma.Decimal(0),
        paymentHoldId: hold.id,
      },
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

    const paymentIntent = await this.stripeService.createManualCaptureIntent({
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
    });

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
          heldAmount: input.amount,
          capturedAmount: new Prisma.Decimal(0),
          paymentHoldId: hold.id,
          stripePaymentIntentId: paymentIntent.id,
        },
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

  private toStripeMinorUnit(amount: Prisma.Decimal): number {
    return Number(
      amount.mul(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP),
    );
  }

  private mapStripeIntentStatus(
    paymentIntent: StripePaymentIntentRecord,
  ): PaymentStatus {
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
      capturedAmount:
        hold.status === PaymentStatus.PAYMENT_CAPTURED
          ? Number(hold.amount)
          : 0,
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
    status: AdditionalChargeStatus;
    createdAt: Date;
    updatedAt: Date;
  }): AdditionalChargeResponseDto {
    return {
      id: charge.id,
      requestId: charge.requestId,
      driverId: charge.driverId,
      customerId: charge.customerId,
      amount: Number(charge.amount),
      currency: charge.currency,
      reason: charge.reason,
      equipmentType: charge.equipmentType,
      invoiceUrl: charge.invoiceUrl,
      status: charge.status,
      createdAt: charge.createdAt.toISOString(),
      updatedAt: charge.updatedAt.toISOString(),
    };
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

  private maxDecimalZero(value: Prisma.Decimal): Prisma.Decimal {
    return value.lt(0) ? new Prisma.Decimal(0) : value;
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
