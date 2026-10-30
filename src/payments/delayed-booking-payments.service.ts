import { directChargesEnabled } from './payment-policy';
import { directApplicationFee } from './customer-pricing';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  DriverEarningStatus,
  PaymentHold,
  PaymentMethod,
  Prisma,
  TransportRequest,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StripeService } from './stripe.service';
import {
  BANK_APPROVAL_MS,
  PAYMENT_POLICY_VERSION,
  RENEWAL_LEAD_MS,
  heldCancellationRate,
  requirePaymentPolicy,
} from './payment-policy';
import { APPROVED_MATCHING_VEHICLE_WHERE } from '../driver/request-eligibility';
import { FREE_CANCELLATION_MS } from './booking-policy';

const zero = () => new Prisma.Decimal(0);
const minor = (amount: Prisma.Decimal) =>
  Number(amount.mul(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP));
const pickedUp = (r: TransportRequest) =>
  Boolean(r.itemPickedUpAt) ||
  [
    'ITEM_PICKED_UP',
    'PICKUP_IN_PROGRESS',
    'IN_TRANSIT',
    'DRIVER_GOING_TO_DROPOFF',
    'DELIVERED',
    'COMPLETED',
  ].includes(r.status);

// The reservation exception sends its own payment-confirmed notifications.
const fundsSecuredForAssignedBooking = (
  hold: PaymentHold,
  request: TransportRequest,
) =>
  hold.confirmationState === 'CONFIRMED' &&
  hold.status === 'PAYMENT_HELD' &&
  Boolean(hold.authorizedAt && request.assignedDriverId) &&
  request.status !== 'CANCELLED' &&
  request.status !== 'RESERVED' &&
  !request.deferredPaymentState;

@Injectable()
export class DelayedBookingPaymentsService {
  readonly logger = new Logger(DelayedBookingPaymentsService.name);
  ready = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly notifications: NotificationsService,
  ) {}

  async stage(
    tx: Prisma.TransactionClient,
    input: {
      customerId: string;
      requestId: string;
      acceptedOfferId: string;
      driverId: string;
      amount: Prisma.Decimal;
      customerPlatformFeeAmount: Prisma.Decimal;
      currency: string;
      paymentMethod: PaymentMethod;
      stripePaymentMethodId?: string;
      policyVersion?: string;
    },
  ) {
    requirePaymentPolicy(input.policyVersion, true);
    if (!this.ready)
      throw new ConflictException(
        'Booking confirmation is temporarily unavailable. Please retry later.',
      );
    if (input.paymentMethod !== 'APP_WALLET') {
      const customer = await tx.user.findUniqueOrThrow({
        where: { id: input.customerId },
      });
      if (!customer.stripeCustomerId || !input.stripePaymentMethodId)
        throw new BadRequestException(
          'Complete payment-method setup before confirming this offer.',
        );
      await this.stripe.validateOwnedCard(
        customer.stripeCustomerId,
        input.stripePaymentMethodId,
      );
    }
    let stripeAccountId: string | null = null;
    if (directChargesEnabled()) {
      if (input.paymentMethod === 'APP_WALLET')
        throw new BadRequestException(
          'Direct driver payments require a card. Existing wallet funds remain available.',
        );
      const driver = await tx.driverProfile.findUniqueOrThrow({
        where: { id: input.driverId },
      });
      if (!driver.stripeAccountId)
        throw new BadRequestException(
          'The driver must connect Stripe before accepting payment.',
        );
      const account = await this.stripe.retrieveAccount(driver.stripeAccountId);
      if (!account.payouts_enabled)
        throw new BadRequestException(
          'The driver must complete Stripe onboarding before accepting payment.',
        );
      stripeAccountId = driver.stripeAccountId;
    }
    const now = new Date();
    const hold = await tx.paymentHold.create({
      data: {
        customerId: input.customerId,
        requestId: input.requestId,
        acceptedOfferId: input.acceptedOfferId,
        driverId: input.driverId,
        amount: input.amount,
        customerPlatformFeeAmount: input.customerPlatformFeeAmount,
        currency: input.currency,
        paymentMethod: input.paymentMethod,
        provider:
          input.paymentMethod === 'APP_WALLET' ? 'APP_WALLET' : 'STRIPE',
        status: 'PAYMENT_HOLD_PENDING',
        stripePaymentMethodId: input.stripePaymentMethodId,
        stripeAccountId,
        policyVersion: PAYMENT_POLICY_VERSION,
        confirmationState: 'GRACE_PERIOD',
        confirmationStartedAt: now,
        authorizationDueAt: new Date(now.getTime() + FREE_CANCELLATION_MS),
      },
    });
    await tx.transportRequest.update({
      where: { id: input.requestId },
      data: {
        paymentHoldId: hold.id,
        paymentMethod: input.paymentMethod,
        paymentStatus: 'PAYMENT_HOLD_PENDING',
        heldAmount: zero(),
        capturedAmount: zero(),
      },
    });
    return hold;
  }

  async notifyState(requestId: string) {
    // Commit each recipient separately: retrying a failed driver push must not
    // roll back the customer's successful notification marker (or vice versa).
    const errors: unknown[] = [];
    try {
      await this.notifyCustomerState(requestId);
    } catch (error) {
      errors.push(error);
    }
    try {
      await this.notifyDriverAcceptance(requestId);
    } catch (error) {
      errors.push(error);
    }
    if (errors.length) throw errors[0];
  }

  private async notifyCustomerState(requestId: string) {
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM transport_requests WHERE id = ${requestId} FOR UPDATE`;
        const hold = await tx.paymentHold.findUnique({ where: { requestId } });
        if (!hold?.confirmationStartedAt) return;
        const request = await tx.transportRequest.findUniqueOrThrow({
          where: { id: requestId },
        });
        const event =
          hold.confirmationState === 'ACTION_REQUIRED'
            ? 'BOOKING_BANK_APPROVAL_REQUIRED'
            : hold.confirmationState === 'CANCELLED'
              ? 'TRIP_CANCELLED'
              : hold.confirmationState === 'MANUAL_REVIEW'
                ? 'BOOKING_PAYMENT_REVIEW'
                : null;
        if (
          event &&
          hold.confirmationNotifiedState !== hold.confirmationState
        ) {
          await this.notifications.notifyCustomerTripUpdate(
            requestId,
            event,
            true,
          );
          await tx.paymentHold.update({
            where: { id: hold.id },
            data: { confirmationNotifiedState: hold.confirmationState },
          });
        }
        if (
          fundsSecuredForAssignedBooking(hold, request) &&
          !hold.clientFundsReservedNotifiedAt
        ) {
          await this.notifications.notifyCustomerTripUpdate(
            requestId,
            'BOOKING_FUNDS_RESERVED',
            true,
          );
          await tx.paymentHold.update({
            where: { id: hold.id },
            data: { clientFundsReservedNotifiedAt: new Date() },
          });
        }
      },
      { timeout: 30000 },
    );
  }

  private async notifyDriverAcceptance(requestId: string) {
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM transport_requests WHERE id = ${requestId} FOR UPDATE`;
        const hold = await tx.paymentHold.findUnique({ where: { requestId } });
        if (!hold?.confirmationStartedAt) return;
        const request = await tx.transportRequest.findUniqueOrThrow({
          where: { id: requestId },
          include: { assignedDriver: true, service: true },
        });
        if (
          fundsSecuredForAssignedBooking(hold, request) &&
          request.assignedDriver &&
          !hold.driverAcceptanceNotifiedAt
        ) {
          await this.notifications.notifyDriverSelected({
            driverUserId: request.assignedDriver.userId,
            requestId,
            serviceType: request.service.nameEn,
            retryPersistedEvent: true,
          });
          await tx.paymentHold.update({
            where: { id: hold.id },
            data: { driverAcceptanceNotifiedAt: new Date() },
          });
        }
      },
      { timeout: 30000 },
    );
  }

  async process(requestId: string) {
    try {
      return await this.processLocked(requestId);
    } catch (error) {
      if (
        error instanceof BadRequestException &&
        /saved card is not available|no such payment.?method/i.test(
          error.message,
        )
      ) {
        await this.prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT id FROM transport_requests WHERE id = ${requestId} FOR UPDATE`;
            const hold = await tx.paymentHold.findUnique({
              where: { requestId },
            });
            const request = await tx.transportRequest.findUnique({
              where: { id: requestId },
            });
            if (
              hold?.confirmationStartedAt &&
              request &&
              request.status !== 'CANCELLED'
            )
              await this.authorizationFailed(
                tx,
                hold,
                request,
                'The selected payment method is no longer available.',
              );
          },
          { timeout: 30000 },
        );
        return null;
      }
      throw error;
    }
  }

  private async processLocked(requestId: string) {
    // Each Stripe mutation has a stable key and a persisted intent/operation. Holding the
    // request lock also serializes this worker with cancellation and delivery confirmation.
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM transport_requests WHERE id = ${requestId} FOR UPDATE`;
        let hold = await tx.paymentHold.findUnique({ where: { requestId } });
        const request = await tx.transportRequest.findUnique({
          where: { id: requestId },
        });
        if (!hold?.confirmationStartedAt || !request) return null;
        if (
          hold.previousStripePaymentIntentId &&
          ['CONFIRMED', 'CAPTURED'].includes(hold.confirmationState ?? '')
        ) {
          await this.releaseStripeIntent(
            hold.previousStripePaymentIntentId,
            hold.stripeAccountId,
          );
          hold = await tx.paymentHold.update({
            where: { id: hold.id },
            data: { previousStripePaymentIntentId: null },
          });
        }
        if (hold.operationKind) {
          await this.finishOperation(tx, hold, request);
          return null;
        }
        if (
          request.status === 'CANCELLED' ||
          hold.confirmationState === 'CANCELLED'
        ) {
          if (hold.confirmationState !== 'CANCELLED')
            await this.cancelTx(
              tx,
              hold,
              request,
              hold.failureReason ??
                'The booking was cancelled before confirmation.',
            );
          return null;
        }
        if (
          hold.confirmationState === 'MANUAL_REVIEW' ||
          hold.status === 'PAYMENT_CAPTURED'
        )
          return null;
        const now = new Date();
        if (
          request.status === 'RESERVED' &&
          request.paymentDeadlineAt &&
          now >= request.paymentDeadlineAt &&
          !hold.authorizedAt
        ) {
          await this.cancelTx(
            tx,
            hold,
            request,
            'The reservation payment deadline passed.',
          );
          return null;
        }
        if (
          (!request.assignedDriverId || request.status === 'RESERVED') &&
          (!hold.authorizationDueAt || now >= hold.authorizationDueAt)
        ) {
          const offer = await tx.driverOffer.findUnique({
            where: { id: hold.acceptedOfferId },
            include: {
              driver: {
                include: {
                  vehicles: { where: APPROVED_MATCHING_VEHICLE_WHERE, take: 1 },
                },
              },
            },
          });
          if (
            !offer ||
            ![
              'PENDING',
              ...(request.status === 'RESERVED' ? ['ACCEPTED'] : []),
            ].includes(offer.status) ||
            offer.driver.status !== 'APPROVED' ||
            !offer.driver.isProfileCompleted ||
            !offer.driver.vehicles.length
          ) {
            await this.cancelTx(
              tx,
              hold,
              request,
              'The selected offer or driver is no longer available.',
            );
            return null;
          }
        }
        if (hold.confirmationState === 'CONFIRMED') {
          if (hold.provider === 'STRIPE' && hold.stripePaymentIntentId) {
            const current = await this.stripe.inspectAuthorization(
              hold.stripePaymentIntentId,
              hold.stripeAccountId,
            );
            if (current.status !== 'requires_capture') {
              await this.authorizationFailed(
                tx,
                hold,
                request,
                'The booking authorization is no longer available.',
              );
              return null;
            }
          }
          if (
            hold.provider === 'STRIPE' &&
            hold.authorizationExpiresAt &&
            hold.authorizationExpiresAt.getTime() - now.getTime() <=
              RENEWAL_LEAD_MS
          ) {
            // Persist renewal generation before the next worker creates a new authorization.
            // The old hold stays valid until the replacement succeeds or failure is handled.
            await tx.paymentHold.update({
              where: { id: hold.id },
              data: {
                confirmationState: 'RENEWING',
                confirmationNotifiedState: null,
                previousStripePaymentIntentId: hold.stripePaymentIntentId,
                stripePaymentIntentId: null,
                stripeClientSecret: null,
                approvalDeadlineAt: null,
                authorizationAttempt: { increment: 1 },
              },
            });
            return null;
          }
          return hold;
        }
        if (hold.authorizationDueAt && now < hold.authorizationDueAt)
          return null;
        if (hold.provider === 'APP_WALLET') {
          await tx.$queryRaw`SELECT id FROM customer_wallets WHERE "customerId" = ${hold.customerId} FOR UPDATE`;
          const wallet = await tx.customerWallet.findUnique({
            where: { customerId: hold.customerId },
          });
          if (
            !wallet ||
            wallet.currency !== hold.currency ||
            wallet.balance.sub(wallet.reservedBalance).lt(hold.amount)
          ) {
            await this.cancelTx(
              tx,
              hold,
              request,
              'Wallet funds are insufficient.',
            );
            return null;
          }
          await tx.customerWallet.update({
            where: { id: wallet.id },
            data: { reservedBalance: { increment: hold.amount } },
          });
          await tx.customerWalletTransaction.create({
            data: {
              walletId: wallet.id,
              customerId: hold.customerId,
              paymentHoldId: hold.id,
              amount: hold.amount,
              currency: hold.currency,
              type: 'HOLD',
              description:
                'Reserved booking funds after the free cancellation window.',
            },
          });
          return this.markHeld(tx, hold, now);
        }
        if (!hold.stripePaymentIntentId) {
          const user = await tx.user.findUniqueOrThrow({
            where: { id: hold.customerId },
          });
          const intent = await this.stripe.createManualAuthorization({
            customerId: user.stripeCustomerId!,
            stripeAccountId: hold.stripeAccountId,
            applicationFeeAmount: hold.stripeAccountId
              ? minor(
                  directApplicationFee(
                    hold.amount,
                    hold.customerPlatformFeeAmount,
                  ),
                )
              : undefined,
            amount: minor(hold.amount),
            currency: hold.currency.toLowerCase(),
            stripePaymentMethodId: hold.stripePaymentMethodId!,
            transferGroup: `trip_${request.id}`,
            idempotencyKey: `booking_${hold.id}_${hold.authorizationAttempt}`,
            metadata: {
              requestId,
              paymentHoldId: hold.id,
              policyVersion: hold.policyVersion!,
              authorizationAttempt: String(hold.authorizationAttempt),
            },
          });
          await tx.paymentHold.update({
            where: { id: hold.id },
            data: {
              stripePaymentIntentId: intent.id,
              stripeClientSecret: intent.client_secret,
              confirmationState: hold.authorizationAttempt
                ? 'RENEWING'
                : 'AUTHORIZING',
            },
          });
          return null;
        }
        let intent = await this.stripe.inspectAuthorization(
          hold.stripePaymentIntentId,
          hold.stripeAccountId,
        );
        if (intent.status === 'requires_confirmation')
          intent = await this.stripe.confirmManualAuthorization(
            intent.id,
            `booking_confirm_${hold.id}_${hold.authorizationAttempt}`,
            hold.stripeAccountId,
          );
        if (
          intent.amount !== minor(hold.amount) ||
          intent.currency.toUpperCase() !== hold.currency.toUpperCase()
        )
          throw new ConflictException(
            'Authorization amount or currency does not match the booking.',
          );
        if (intent.status === 'requires_capture') {
          if (hold.approvalDeadlineAt && now >= hold.approvalDeadlineAt) {
            await this.authorizationFailed(
              tx,
              hold,
              request,
              'Bank approval was not completed in time.',
            );
            return null;
          }
          const charge =
            typeof intent.latest_charge === 'object'
              ? intent.latest_charge
              : null;
          const expires = charge?.payment_method_details?.card?.capture_before;
          if (!expires)
            throw new ConflictException(
              'Stripe did not provide the authorization expiry.',
            );
          const previous = hold.previousStripePaymentIntentId;
          const confirmed = await this.markHeld(tx, hold, now, {
            stripeChargeId: charge?.id,
            authorizationExpiresAt: new Date(expires * 1000),
          });
          if (previous)
            await this.releaseStripeIntent(previous, hold.stripeAccountId);
          await tx.paymentHold.update({
            where: { id: hold.id },
            data: { previousStripePaymentIntentId: null },
          });
          return confirmed;
        }
        if (intent.status === 'requires_action') {
          if (hold.approvalDeadlineAt && now >= hold.approvalDeadlineAt) {
            await this.authorizationFailed(
              tx,
              hold,
              request,
              'Bank approval was not completed in time.',
            );
            return null;
          }
          await tx.paymentHold.update({
            where: { id: hold.id },
            data: {
              confirmationState: 'ACTION_REQUIRED',
              approvalDeadlineAt:
                hold.approvalDeadlineAt ??
                new Date(now.getTime() + BANK_APPROVAL_MS),
            },
          });
          return null;
        }
        if (
          intent.status === 'requires_payment_method' ||
          intent.status === 'canceled'
        ) {
          await this.authorizationFailed(
            tx,
            hold,
            request,
            intent.last_payment_error?.message ??
              'The bank could not reserve the payment.',
          );
        }
        return null;
      },
      { timeout: 30000 },
    );
  }

  private async markHeld(
    tx: Prisma.TransactionClient,
    hold: PaymentHold,
    now: Date,
    extra: Prisma.PaymentHoldUpdateInput = {},
  ) {
    const updated = await tx.paymentHold.update({
      where: { id: hold.id },
      data: {
        ...extra,
        status: 'PAYMENT_HELD',
        confirmationState: 'CONFIRMED',
        authorizedAt: hold.authorizedAt ?? now,
        approvalDeadlineAt: null,
        failureReason: null,
      },
    });
    await tx.transportRequest.update({
      where: { id: hold.requestId },
      data: {
        paymentStatus: 'PAYMENT_HELD',
        heldAmount: hold.amount,
        capturedAmount: zero(),
        stripePaymentIntentId: updated.stripePaymentIntentId,
      },
    });
    await tx.tripPaymentSettlement.upsert({
      where: { requestId: hold.requestId },
      update: { status: 'AUTHORIZED', requiresManualReview: false },
      create: {
        requestId: hold.requestId,
        paymentHoldId: hold.id,
        customerId: hold.customerId,
        driverId: hold.driverId,
        currency: hold.currency,
        collectedAmount: zero(),
        refundableAmount: zero(),
        status: 'AUTHORIZED',
      },
    });
    return updated;
  }

  private async authorizationFailed(
    tx: Prisma.TransactionClient,
    hold: PaymentHold,
    request: TransportRequest,
    reason: string,
  ) {
    this.logger.warn(
      `Booking authorization failed: request=${request.id}, state=${hold.confirmationState}, afterPickup=${pickedUp(request)}`,
    );
    if (pickedUp(request)) {
      await tx.paymentHold.update({
        where: { id: hold.id },
        data: { confirmationState: 'MANUAL_REVIEW', failureReason: reason },
      });
      await tx.tripPaymentSettlement.updateMany({
        where: { requestId: request.id },
        data: {
          requiresManualReview: true,
          status: 'MANUAL_REVIEW',
          payoutFailureReason: reason,
        },
      });
    } else await this.cancelTx(tx, hold, request, reason);
  }

  async cancel(
    customerId: string,
    requestId: string,
    free = false,
    quote?: { expectedRetainedAmount: number; policyVersion?: string },
  ) {
    // Persist the operation before contacting Stripe. A timeout/crash can then be retried
    // with the same capture key even when Stripe succeeded but the response was lost.
    const initial = await this.prisma.transportRequest.findUniqueOrThrow({
      where: { id: requestId },
    });
    if (initial.customerId !== customerId)
      throw new BadRequestException('This payment does not belong to you.');
    if (pickedUp(initial)) {
      await this.prisma.tripPaymentSettlement.updateMany({
        where: { requestId },
        data: { requiresManualReview: true, status: 'MANUAL_REVIEW' },
      });
      throw new ConflictException(
        'Automatic cancellation after pickup requires manual review.',
      );
    }
    await this.prisma
      .$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM transport_requests WHERE id = ${requestId} FOR UPDATE`;
        const request = await tx.transportRequest.findUniqueOrThrow({
          where: { id: requestId },
          include: { paymentHold: true },
        });
        if (request.customerId !== customerId)
          throw new BadRequestException('This payment does not belong to you.');
        let hold = request.paymentHold!;
        if (!hold?.confirmationStartedAt)
          throw new ConflictException('This is not a delayed booking.');
        if (hold.operationKind === 'CANCEL') return;
        if (hold.operationKind)
          throw new ConflictException(
            'A payment operation is already in progress.',
          );
        if (hold.confirmationState === 'CANCELLED') return;
        if (
          !hold.authorizedAt &&
          hold.provider === 'STRIPE' &&
          hold.stripePaymentIntentId
        ) {
          const intent = await this.stripe.inspectAuthorization(
            hold.stripePaymentIntentId,
            hold.stripeAccountId,
          );
          if (intent.status === 'requires_capture')
            hold = await tx.paymentHold.update({
              where: { id: hold.id },
              data: { authorizedAt: new Date() },
            });
        }
        if (pickedUp(request))
          throw new ConflictException(
            'Automatic cancellation after pickup requires manual review.',
          );
        const fee = hold.amount
          .mul(
            free
              ? 0
              : heldCancellationRate(
                  hold,
                  Boolean(request.assignedDriverId) &&
                    request.status !== 'RESERVED' &&
                    (!request.deferredPaymentState ||
                      request.deferredPaymentState === 'PAID'),
                ),
          )
          .toDecimalPlaces(2);
        if (
          (!free && fee.gt(0) && !quote) ||
          (quote &&
            (!fee.eq(
              new Prisma.Decimal(quote.expectedRetainedAmount).toDecimalPlaces(
                2,
              ),
            ) ||
              quote.policyVersion !== hold.policyVersion))
        )
          throw new ConflictException(
            'The cancellation fee changed. Refresh and review the current fee before confirming.',
          );
        await tx.paymentHold.update({
          where: { id: hold.id },
          data: {
            operationKind: 'CANCEL',
            operationAmount: fee,
            confirmationState: 'CANCELLING',
          },
        });
      })
      .catch(async (error: unknown) => {
        if (
          error instanceof ConflictException &&
          error.message.includes('after pickup')
        )
          await this.prisma.tripPaymentSettlement.updateMany({
            where: { requestId },
            data: { requiresManualReview: true, status: 'MANUAL_REVIEW' },
          });
        throw error;
      });
    await this.process(requestId);
    const hold = await this.prisma.paymentHold.findUniqueOrThrow({
      where: { requestId },
    });
    const fee = Number(hold.operationAmount ?? 0);
    return {
      requestStatus: 'CANCELLED' as const,
      currency: hold.currency,
      retainedAmount: fee,
      refundedAmount: 0,
      releasedAmount: Number(hold.authorizedAt ? hold.amount.sub(fee) : 0),
      nothingCharged: fee === 0,
    };
  }

  private async cancelTx(
    tx: Prisma.TransactionClient,
    hold: PaymentHold,
    request: TransportRequest,
    reason: string,
  ) {
    await this.release(tx, hold);
    await tx.paymentHold.update({
      where: { id: hold.id },
      data: {
        confirmationState: 'CANCELLED',
        status: 'PAYMENT_RELEASED',
        cancelledAt: new Date(),
        failureReason: reason,
      },
    });
    await tx.tripPaymentSettlement.updateMany({
      where: { requestId: request.id },
      data: {
        status: 'RELEASED',
        refundableAmount: zero(),
        requiresManualReview: false,
      },
    });
    await tx.transportRequest.update({
      where: { id: request.id },
      data: {
        status: 'CANCELLED',
        ...(request.deferredPaymentState
          ? { deferredPaymentState: 'CANCELLED' as const }
          : {}),
        heldAmount: zero(),
        paymentStatus: 'PAYMENT_RELEASED',
      },
    });
  }

  private async releaseStripeIntent(id: string, accountId?: string | null) {
    const intent = await this.stripe.inspectAuthorization(id, accountId);
    if (intent.status === 'canceled' || intent.status === 'succeeded') return;
    try {
      await this.stripe.cancelPaymentIntentIfExists(id, accountId);
    } catch (error) {
      if (
        (await this.stripe.inspectAuthorization(id, accountId)).status !==
        'canceled'
      )
        throw error;
    }
  }

  private async release(tx: Prisma.TransactionClient, hold: PaymentHold) {
    if (hold.provider === 'APP_WALLET' && hold.status === 'PAYMENT_HELD') {
      await tx.customerWallet.update({
        where: { customerId: hold.customerId },
        data: { reservedBalance: { decrement: hold.amount } },
      });
      const wallet = await tx.customerWallet.findUniqueOrThrow({
        where: { customerId: hold.customerId },
      });
      await tx.customerWalletTransaction.create({
        data: {
          walletId: wallet.id,
          customerId: hold.customerId,
          paymentHoldId: hold.id,
          amount: hold.amount,
          currency: hold.currency,
          type: 'RELEASE',
        },
      });
    }
    if (hold.provider === 'STRIPE') {
      for (const id of [
        hold.stripePaymentIntentId,
        hold.previousStripePaymentIntentId,
      ])
        if (id) {
          await this.releaseStripeIntent(id, hold.stripeAccountId);
        }
    }
  }

  async captureDelivery(
    customerId: string,
    requestId: string,
    releaseNow = false,
  ) {
    const original = await this.prisma.paymentHold.findUnique({
      where: { requestId },
    });
    if (!original?.confirmationStartedAt) return; // Historical captured bookings retain their flow.
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM transport_requests WHERE id = ${requestId} FOR UPDATE`;
      const request = await tx.transportRequest.findUniqueOrThrow({
        where: { id: requestId },
        include: { paymentHold: true },
      });
      if (
        request.customerId !== customerId ||
        request.status !== 'DELIVERED' ||
        !request.deliveryConfirmedByCustomerAt
      )
        throw new ConflictException(
          'Client-confirmed delivery is required before charging.',
        );
      const hold = request.paymentHold!;
      if (hold.status === 'PAYMENT_CAPTURED') return;
      if (hold.stripeAccountId) {
        // Customer confirmation records eligibility. Only the payout worker may
        // capture after the existing availability delay and review checks.
        if (!releaseNow) return;
        const settlement = await tx.tripPaymentSettlement.findUniqueOrThrow({
          where: { requestId },
        });
        const earning = await tx.driverEarning.findUniqueOrThrow({
          where: { tripId: requestId },
        });
        if (
          settlement.requiresManualReview ||
          settlement.status !== 'AUTHORIZED' ||
          (earning.availableAt && earning.availableAt.getTime() > Date.now())
        )
          throw new ConflictException(
            'This trip is not yet eligible for payment release.',
          );
      }
      if (
        hold.confirmationState !== 'CONFIRMED' &&
        hold.operationKind !== 'DELIVERY'
      )
        throw new ConflictException(
          'Payment requires review before it can be charged.',
        );
      await tx.paymentHold.update({
        where: { id: hold.id },
        data: { operationKind: 'DELIVERY', operationAmount: hold.amount },
      });
    });
    await this.process(requestId);
  }

  async failApproval(customerId: string, requestId: string) {
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM transport_requests WHERE id = ${requestId} FOR UPDATE`;
        const hold = await tx.paymentHold.findUniqueOrThrow({
          where: { requestId },
        });
        const request = await tx.transportRequest.findUniqueOrThrow({
          where: { id: requestId },
        });
        if (hold.customerId !== customerId)
          throw new BadRequestException('This payment does not belong to you.');
        if (hold.confirmationState !== 'ACTION_REQUIRED') return;
        if (hold.stripePaymentIntentId) {
          const intent = await this.stripe.inspectAuthorization(
            hold.stripePaymentIntentId,
            hold.stripeAccountId,
          );
          // Do not cancel a successful approval just because the SDK lost its response.
          if (intent.status === 'requires_capture') return;
        }
        await this.authorizationFailed(
          tx,
          hold,
          request,
          'Bank approval failed.',
        );
      },
      { timeout: 30000 },
    );
  }

  private async finishOperation(
    tx: Prisma.TransactionClient,
    hold: PaymentHold,
    request: TransportRequest,
  ) {
    const amount = hold.operationAmount ?? zero();
    if (amount.gt(0)) {
      if (hold.provider === 'STRIPE') {
        let intent = await this.stripe.inspectAuthorization(
          hold.stripePaymentIntentId ?? hold.previousStripePaymentIntentId!,
          hold.stripeAccountId,
        );
        if (
          !['requires_capture', 'succeeded'].includes(intent.status) &&
          hold.previousStripePaymentIntentId
        )
          intent = await this.stripe.inspectAuthorization(
            hold.previousStripePaymentIntentId,
            hold.stripeAccountId,
          );
        const captured =
          intent.status === 'succeeded'
            ? intent
            : await this.stripe.captureAuthorization(
                intent.id,
                minor(amount),
                `booking_${hold.operationKind}_${hold.id}`,
                hold.stripeAccountId,
                hold.stripeAccountId
                  ? minor(
                      hold.operationKind === 'CANCEL'
                        ? amount.sub(
                            request.assignedDriverId
                              ? amount.mul(0.5).toDecimalPlaces(2)
                              : zero(),
                          )
                        : directApplicationFee(
                            hold.amount,
                            hold.customerPlatformFeeAmount,
                          ),
                    )
                  : undefined,
              );
        if (
          captured.status !== 'succeeded' ||
          captured.amount_received !== minor(amount)
        )
          throw new ConflictException(
            'Payment capture is still pending. Please refresh.',
          );
        if (hold.operationKind === 'CANCEL') await this.release(tx, hold);
        await tx.paymentHold.update({
          where: { id: hold.id },
          data: {
            stripePaymentIntentId: captured.id,
            stripeChargeId:
              typeof captured.latest_charge === 'string'
                ? captured.latest_charge
                : captured.latest_charge?.id,
            previousStripePaymentIntentId: null,
          },
        });
      } else {
        await tx.$queryRaw`SELECT id FROM customer_wallets WHERE "customerId" = ${hold.customerId} FOR UPDATE`;
        await tx.customerWallet.update({
          where: { customerId: hold.customerId },
          data: {
            balance: { decrement: amount },
            reservedBalance: { decrement: hold.amount },
          },
        });
        const wallet = await tx.customerWallet.findUniqueOrThrow({
          where: { customerId: hold.customerId },
        });
        await tx.customerWalletTransaction.create({
          data: {
            walletId: wallet.id,
            customerId: hold.customerId,
            paymentHoldId: hold.id,
            amount,
            currency: hold.currency,
            type: 'CAPTURE',
          },
        });
        if (hold.operationKind === 'CANCEL' && hold.amount.gt(amount))
          await tx.customerWalletTransaction.create({
            data: {
              walletId: wallet.id,
              customerId: hold.customerId,
              paymentHoldId: hold.id,
              amount: hold.amount.sub(amount),
              currency: hold.currency,
              type: 'RELEASE',
              description:
                'Released the unused booking reservation after cancellation.',
            },
          });
      }
    } else await this.release(tx, hold);
    const cancelling = hold.operationKind === 'CANCEL';
    const driverShare =
      cancelling && request.assignedDriverId
        ? amount.mul(0.5).toDecimalPlaces(2)
        : zero();
    await tx.tripPaymentSettlement.upsert({
      where: { requestId: request.id },
      update: {
        collectedAmount: amount,
        refundableAmount: cancelling ? zero() : amount,
        ...(cancelling
          ? {
              retainedAmount: amount,
              driverShareAmount: driverShare,
              platformShareAmount: amount.sub(driverShare),
              driverPayoutState: driverShare.gt(0)
                ? ('EARNING_CREATED' as const)
                : ('NOT_EARNED' as const),
              nextPayoutRetryAt: driverShare.gt(0) ? new Date() : null,
            }
          : {}),
        status: cancelling
          ? amount.gt(0)
            ? 'CANCELLED_WITH_FEE'
            : 'RELEASED'
          : 'COLLECTED',
        requiresManualReview: false,
      },
      create: {
        requestId: request.id,
        paymentHoldId: hold.id,
        customerId: hold.customerId,
        driverId: hold.driverId,
        currency: hold.currency,
        collectedAmount: amount,
        refundableAmount: cancelling ? zero() : amount,
        retainedAmount: cancelling ? amount : zero(),
        driverShareAmount: driverShare,
        platformShareAmount: cancelling ? amount.sub(driverShare) : zero(),
        status: cancelling
          ? amount.gt(0)
            ? 'CANCELLED_WITH_FEE'
            : 'RELEASED'
          : 'COLLECTED',
        driverPayoutState: driverShare.gt(0) ? 'EARNING_CREATED' : 'NOT_EARNED',
        nextPayoutRetryAt: driverShare.gt(0) ? new Date() : null,
      },
    });
    if (driverShare.gt(0))
      await tx.driverEarning.upsert({
        where: { tripId: request.id },
        update: {
          grossAmount: driverShare,
          platformFeeAmount: zero(),
          netAmount: driverShare,
        },
        create: {
          tripId: request.id,
          driverId: hold.driverId,
          grossAmount: driverShare,
          platformFeeAmount: zero(),
          netAmount: driverShare,
          currency: hold.currency,
          status: DriverEarningStatus.PENDING,
          availableAt: new Date(),
        },
      });
    await tx.paymentHold.update({
      where: { id: hold.id },
      data: {
        status: amount.gt(0) ? 'PAYMENT_CAPTURED' : 'PAYMENT_RELEASED',
        confirmationState: cancelling ? 'CANCELLED' : 'CAPTURED',
        capturedAt: amount.gt(0) ? new Date() : null,
        cancelledAt: cancelling ? new Date() : null,
        operationKind: null,
      },
    });
    await tx.transportRequest.update({
      where: { id: request.id },
      data: {
        ...(cancelling ? { status: 'CANCELLED' } : {}),
        heldAmount: zero(),
        capturedAmount: amount,
        paymentStatus: amount.gt(0) ? 'PAYMENT_CAPTURED' : 'PAYMENT_RELEASED',
      },
    });
  }
}
