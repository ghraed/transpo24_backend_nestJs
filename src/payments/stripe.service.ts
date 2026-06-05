import { BadRequestException, Injectable } from '@nestjs/common';
import Stripe from 'stripe';

type EnsureStripeCustomerInput = {
  stripeCustomerId?: string | null;
  customerId: string;
  email: string;
  name: string;
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
    if (!secretKey) {
      throw new BadRequestException('Stripe is not configured.');
    }

    this.stripeClient = new Stripe(secretKey);
    return this.stripeClient;
  }

  async ensureCustomer(input: EnsureStripeCustomerInput): Promise<string> {
    if (input.stripeCustomerId?.trim()) {
      return input.stripeCustomerId.trim();
    }

    const customer = await this.getClient().customers.create({
      email: input.email,
      name: input.name,
      metadata: {
        customerId: input.customerId,
      },
    });

    return customer.id;
  }

  async createManualCaptureIntent(
    input: CreateManualCaptureIntentInput,
  ) {
    const client = this.getClient();

    if (input.stripePaymentMethodId?.trim()) {
      return client.paymentIntents.create({
        amount: input.amount,
        currency: input.currency,
        customer: input.customerId,
        payment_method: input.stripePaymentMethodId.trim(),
        confirm: true,
        capture_method: 'manual',
        confirmation_method: 'automatic',
        metadata: input.metadata,
      });
    }

    return client.paymentIntents.create({
      amount: input.amount,
      currency: input.currency,
      customer: input.customerId,
      capture_method: 'manual',
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: input.metadata,
    });
  }

  async capturePaymentIntent(
    paymentIntentId: string,
  ) {
    return this.getClient().paymentIntents.capture(paymentIntentId);
  }

  async cancelPaymentIntent(
    paymentIntentId: string,
  ) {
    return this.getClient().paymentIntents.cancel(paymentIntentId);
  }

  constructWebhookEvent(
    rawBody: Buffer,
    signature: string,
  ) {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (!webhookSecret) {
      throw new BadRequestException('Stripe webhook secret is not configured.');
    }

    return this.getClient().webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret,
    );
  }
}
