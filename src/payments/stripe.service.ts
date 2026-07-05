import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import Stripe from 'stripe';

type EnsureStripeCustomerInput = {
  stripeCustomerId?: string | null;
  customerId: string;
  email?: string | null;
  name?: string | null;
};

type CreateManualCaptureIntentInput = {
  customerId: string;
  amount: number;
  currency: string;
  metadata: Record<string, string>;
  stripePaymentMethodId?: string;
};

@Injectable()
export class StripeService {
  private stripeClient: InstanceType<typeof Stripe> | null = null;

  private getClient(): InstanceType<typeof Stripe> {
    if (this.stripeClient) {
      return this.stripeClient;
    }

    const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
    if (
      !secretKey ||
      secretKey.startsWith('replace_') ||
      (!secretKey.startsWith('sk_test_') && !secretKey.startsWith('sk_live_'))
    ) {
      throw new BadRequestException(
        'Stripe is not configured. Set STRIPE_SECRET_KEY to a real sk_test_ or sk_live_ key.',
      );
    }

    this.stripeClient = new Stripe(secretKey);
    return this.stripeClient;
  }

  async ensureCustomer(input: EnsureStripeCustomerInput): Promise<string> {
    if (input.stripeCustomerId?.trim()) {
      return input.stripeCustomerId.trim();
    }

    const customer = await this.runStripe(() =>
      this.getClient().customers.create({
        ...(input.email?.trim() ? { email: input.email.trim() } : {}),
        name: input.name?.trim() || `Customer ${input.customerId}`,
        metadata: {
          customerId: input.customerId,
        },
      }),
    );

    return customer.id;
  }

  async createManualCaptureIntent(input: CreateManualCaptureIntentInput) {
    const client = this.getClient();
    const stripePaymentMethodId = input.stripePaymentMethodId?.trim();

    if (stripePaymentMethodId) {
      return this.runStripe(() =>
        client.paymentIntents.create({
          amount: input.amount,
          currency: input.currency,
          customer: input.customerId,
          payment_method: stripePaymentMethodId,
          payment_method_types: ['card'],
          confirm: true,
          capture_method: 'manual',
          confirmation_method: 'automatic',
          metadata: input.metadata,
        }),
      );
    }

    return this.runStripe(() =>
      client.paymentIntents.create({
        amount: input.amount,
        currency: input.currency,
        customer: input.customerId,
        capture_method: 'manual',
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'never',
        },
        metadata: input.metadata,
      }),
    );
  }

  async capturePaymentIntent(paymentIntentId: string) {
    return this.runStripe(() =>
      this.getClient().paymentIntents.capture(paymentIntentId),
    );
  }

  async retrievePaymentIntent(paymentIntentId: string) {
    return this.runStripe(() =>
      this.getClient().paymentIntents.retrieve(paymentIntentId),
    );
  }

  async cancelPaymentIntent(paymentIntentId: string) {
    return this.runStripe(() =>
      this.getClient().paymentIntents.cancel(paymentIntentId),
    );
  }

  constructWebhookEvent(rawBody: Buffer, signature: string) {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (!webhookSecret) {
      throw new BadRequestException('Stripe webhook secret is not configured.');
    }

    return this.runStripeSync(() =>
      this.getClient().webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret,
      ),
    );
  }

  private async runStripe<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw this.toStripeException(error);
    }
  }

  private runStripeSync<T>(operation: () => T): T {
    try {
      return operation();
    } catch (error) {
      throw this.toStripeException(error);
    }
  }

  private toStripeException(error: unknown): Error {
    if (
      error instanceof BadRequestException ||
      error instanceof ServiceUnavailableException ||
      error instanceof BadGatewayException
    ) {
      return error;
    }

    if (this.isStripeError(error)) {
      const message = error.userMessage?.trim() || error.message?.trim() || 'Stripe request failed.';

      switch (error.type) {
        case 'StripeCardError':
        case 'StripeInvalidRequestError':
        case 'StripeAuthenticationError':
        case 'StripePermissionError':
        case 'StripeIdempotencyError':
        case 'StripeInvalidGrantError':
          return new BadRequestException(message);
        case 'StripeRateLimitError':
        case 'StripeConnectionError':
          return new ServiceUnavailableException(message);
        default:
          return new BadGatewayException(message);
      }
    }

    return error instanceof Error
      ? error
      : new BadGatewayException('Stripe request failed.');
  }

  private isStripeError(
    error: unknown,
  ): error is {
    type?: string;
    message?: string;
    userMessage?: string;
  } {
    return (
      !!error &&
      typeof error === 'object' &&
      'type' in error &&
      'message' in error
    );
  }
}
