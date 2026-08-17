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

type CreateCustomerFundingIntentInput = {
  customerId: string;
  amount: number;
  currency: string;
  metadata: Record<string, string>;
};

type CreateImmediateCaptureIntentInput = {
  customerId: string;
  amount: number;
  currency: string;
  metadata: Record<string, string>;
  stripePaymentMethodId?: string;
};

export type StripeCardPaymentMethodSummary = {
  id: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
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
    const existingCustomerId = input.stripeCustomerId?.trim();
    if (existingCustomerId) {
      const existingCustomer =
        await this.tryRetrieveCustomer(existingCustomerId);
      if (
        existingCustomer &&
        !('deleted' in existingCustomer && existingCustomer.deleted)
      ) {
        return existingCustomerId;
      }
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

  private async tryRetrieveCustomer(customerId: string) {
    try {
      return await this.runStripe(() =>
        this.getClient().customers.retrieve(customerId),
      );
    } catch (error) {
      if (this.isMissingCustomerError(error)) {
        return null;
      }
      throw error;
    }
  }

  async createCustomerFundingIntent(input: CreateCustomerFundingIntentInput) {
    return this.runStripe(() =>
      this.getClient().paymentIntents.create({
        amount: input.amount,
        currency: input.currency,
        customer: input.customerId,
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'never',
        },
        metadata: input.metadata,
      }),
    );
  }

  async createImmediateCaptureIntent(input: CreateImmediateCaptureIntentInput) {
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
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'never',
        },
        metadata: input.metadata,
      }),
    );
  }

  async getCustomerDefaultPaymentMethod(
    customerId: string,
  ): Promise<StripeCardPaymentMethodSummary | null> {
    const customer = await this.runStripe(() =>
      this.getClient().customers.retrieve(customerId, {
        expand: ['invoice_settings.default_payment_method'],
      }),
    );

    if ('deleted' in customer && customer.deleted) {
      return null;
    }

    const defaultPaymentMethod =
      customer.invoice_settings.default_payment_method;
    if (!defaultPaymentMethod) {
      return null;
    }

    if (typeof defaultPaymentMethod === 'string') {
      const paymentMethod = await this.runStripe(() =>
        this.getClient().paymentMethods.retrieve(defaultPaymentMethod),
      );
      return this.toCardPaymentMethodSummary(paymentMethod);
    }

    return this.toCardPaymentMethodSummary(defaultPaymentMethod);
  }

  async attachCustomerDefaultPaymentMethod(input: {
    customerId: string;
    paymentMethodId: string;
  }): Promise<StripeCardPaymentMethodSummary> {
    const client = this.getClient();
    const paymentMethodId = input.paymentMethodId.trim();

    const existing = await this.runStripe(() =>
      client.paymentMethods.retrieve(paymentMethodId),
    );

    if (existing.type !== 'card') {
      throw new BadRequestException('Only card payment methods can be saved.');
    }

    let attached = existing;
    if (!existing.customer) {
      attached = await this.runStripe(() =>
        client.paymentMethods.attach(paymentMethodId, {
          customer: input.customerId,
        }),
      );
    } else if (existing.customer !== input.customerId) {
      throw new BadRequestException(
        'This payment method belongs to another customer profile.',
      );
    }

    await this.runStripe(() =>
      client.customers.update(input.customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      }),
    );

    return this.toCardPaymentMethodSummary(attached);
  }

  async createOffSessionCharge(input: {
    customerId: string;
    paymentMethodId: string;
    amount: number;
    currency: string;
    metadata: Record<string, string>;
    idempotencyKey: string;
  }) {
    return this.runStripe(() =>
      this.getClient().paymentIntents.create(
        {
          amount: input.amount,
          currency: input.currency,
          customer: input.customerId,
          payment_method: input.paymentMethodId,
          payment_method_types: ['card'],
          confirm: true,
          off_session: true,
          metadata: input.metadata,
        },
        {
          idempotencyKey: input.idempotencyKey,
        },
      ),
    );
  }

  async retrievePaymentIntent(paymentIntentId: string) {
    return this.runStripe(() =>
      this.getClient().paymentIntents.retrieve(paymentIntentId),
    );
  }

  async retrievePaymentIntentIfExists(paymentIntentId: string) {
    try {
      return await this.retrievePaymentIntent(paymentIntentId);
    } catch (error) {
      if (this.isMissingPaymentIntentError(error)) {
        return null;
      }
      throw error;
    }
  }

  async cancelPaymentIntent(paymentIntentId: string) {
    return this.runStripe(() =>
      this.getClient().paymentIntents.cancel(paymentIntentId),
    );
  }

  async cancelPaymentIntentIfExists(paymentIntentId: string) {
    try {
      return await this.cancelPaymentIntent(paymentIntentId);
    } catch (error) {
      if (this.isMissingPaymentIntentError(error)) {
        return null;
      }
      throw error;
    }
  }

  async createRefund(input: {
    paymentIntentId: string;
    amount?: number;
    metadata?: Record<string, string>;
    idempotencyKey: string;
  }) {
    return this.runStripe(() =>
      this.getClient().refunds.create(
        {
          payment_intent: input.paymentIntentId,
          ...(typeof input.amount === 'number' ? { amount: input.amount } : {}),
          ...(input.metadata ? { metadata: input.metadata } : {}),
        },
        {
          idempotencyKey: input.idempotencyKey,
        },
      ),
    );
  }

  async createExpressAccount(input: {
    driverId: string;
    email: string;
    name?: string | null;
    country?: string;
  }) {
    return this.runStripe(() =>
      this.getClient().accounts.create({
        type: 'express',
        email: input.email,
        capabilities: {
          transfers: { requested: true },
        },
        metadata: {
          driverId: input.driverId,
        },
        ...(input.name?.trim()
          ? { business_profile: { name: input.name.trim() } }
          : {}),
        ...(input.country?.trim() ? { country: input.country.trim() } : {}),
      }),
    );
  }

  async createAccountLink(input: {
    accountId: string;
    refreshUrl: string;
    returnUrl: string;
  }) {
    return this.runStripe(() =>
      this.getClient().accountLinks.create({
        account: input.accountId,
        refresh_url: input.refreshUrl,
        return_url: input.returnUrl,
        type: 'account_onboarding',
      }),
    );
  }

  async retrieveAccount(accountId: string) {
    return this.runStripe(() => this.getClient().accounts.retrieve(accountId));
  }

  async createExpressLoginLink(accountId: string) {
    return this.runStripe(() =>
      this.getClient().accountLinks.create({
        account: accountId,
        refresh_url:
          process.env.DRIVER_APP_BASE_URL?.trim() || 'http://localhost:8081',
        return_url:
          process.env.DRIVER_APP_BASE_URL?.trim() || 'http://localhost:8081',
        type: 'account_onboarding',
      }),
    );
  }

  async createTransfer(input: {
    amount: number;
    currency: string;
    destination: string;
    transferGroup: string;
    metadata?: Record<string, string>;
  }) {
    return this.runStripe(() =>
      this.getClient().transfers.create({
        amount: input.amount,
        currency: input.currency,
        destination: input.destination,
        transfer_group: input.transferGroup,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      }),
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
      const message =
        error.userMessage?.trim() ||
        error.message?.trim() ||
        'Stripe request failed.';

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

  private isStripeError(error: unknown): error is {
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

  private isMissingCustomerError(error: unknown): boolean {
    if (
      error instanceof BadRequestException &&
      typeof error.message === 'string' &&
      /no such customer/i.test(error.message)
    ) {
      return true;
    }

    return (
      this.isStripeError(error) &&
      error.type === 'StripeInvalidRequestError' &&
      typeof error.message === 'string' &&
      /no such customer/i.test(error.message)
    );
  }

  private isMissingPaymentIntentError(error: unknown): boolean {
    if (
      error instanceof BadRequestException &&
      typeof error.message === 'string' &&
      /no such payment_intent/i.test(error.message)
    ) {
      return true;
    }

    return (
      this.isStripeError(error) &&
      error.type === 'StripeInvalidRequestError' &&
      typeof error.message === 'string' &&
      /no such payment_intent/i.test(error.message)
    );
  }

  private toCardPaymentMethodSummary(paymentMethod: {
    id: string;
    type: string;
    card?: {
      brand?: string | null;
      last4?: string | null;
      exp_month?: number | null;
      exp_year?: number | null;
    } | null;
  }): StripeCardPaymentMethodSummary {
    if (paymentMethod.type !== 'card') {
      throw new BadRequestException('Only card payment methods are supported.');
    }

    return {
      id: paymentMethod.id,
      brand: paymentMethod.card?.brand ?? null,
      last4: paymentMethod.card?.last4 ?? null,
      expMonth: paymentMethod.card?.exp_month ?? null,
      expYear: paymentMethod.card?.exp_year ?? null,
    };
  }
}
