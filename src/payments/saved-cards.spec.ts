import { BadRequestException } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { PaymentsService } from './payments.service';

describe('Saved card security', () => {
  const card = {
    id: 'pm_owned',
    type: 'card',
    customer: 'cus_owner',
    card: {
      brand: 'visa',
      last4: '4242',
      exp_month: 12,
      exp_year: 2030,
      fingerprint: 'private',
    },
    billing_details: {
      name: 'Private name',
      address: { line1: 'Private address' },
    },
  };
  const summary = {
    id: 'pm_owned',
    brand: 'visa',
    last4: '4242',
    expMonth: 12,
    expYear: 2030,
  };
  let stripe: StripeService;
  let client: {
    paymentMethods: { retrieve: jest.Mock; list: jest.Mock; detach: jest.Mock };
    setupIntents: { create: jest.Mock };
    customers: { update: jest.Mock };
    paymentIntents: { create: jest.Mock };
  };

  beforeEach(() => {
    client = {
      paymentMethods: {
        retrieve: jest.fn().mockResolvedValue(card),
        list: jest.fn().mockResolvedValue({ data: [card], has_more: false }),
        detach: jest.fn().mockResolvedValue({}),
      },
      setupIntents: {
        create: jest.fn().mockResolvedValue({
          client_secret: 'setup_secret',
          internal: 'private',
        }),
      },
      customers: { update: jest.fn().mockResolvedValue({}) },
      paymentIntents: { create: jest.fn().mockResolvedValue({}) },
    };
    stripe = new StripeService();
    (stripe as unknown as { getClient: () => typeof client }).getClient = () =>
      client;
  });

  it('lists only the authenticated customer cards and exposes only masked summaries', async () => {
    await expect(stripe.listCustomerCards('cus_owner')).resolves.toEqual([
      summary,
    ]);
    expect(client.paymentMethods.list).toHaveBeenCalledWith({
      customer: 'cus_owner',
      type: 'card',
      limit: 100,
    });
  });

  it('keeps the customer restriction when paginating saved cards', async () => {
    client.paymentMethods.list.mockResolvedValueOnce({
      data: [card],
      has_more: true,
    });
    await stripe.listCustomerCards('cus_owner');
    expect(client.paymentMethods.list).toHaveBeenNthCalledWith(2, {
      customer: 'cus_owner',
      type: 'card',
      limit: 100,
      starting_after: 'pm_owned',
    });
  });

  it('binds card verification to the server-resolved customer', async () => {
    await expect(stripe.createCardSetupIntent('cus_owner')).resolves.toEqual({
      clientSecret: 'setup_secret',
    });
    expect(client.setupIntents.create).toHaveBeenCalledWith({
      customer: 'cus_owner',
      payment_method_types: ['card'],
      usage: 'off_session',
    });
  });

  it.each(['cus_other', null])(
    'rejects saving, deleting and charging cards owned by %s',
    async (owner) => {
      client.paymentMethods.retrieve.mockResolvedValue({
        ...card,
        customer: owner,
      });
      await expect(
        stripe.attachCustomerDefaultPaymentMethod({
          customerId: 'cus_owner',
          paymentMethodId: 'pm_owned',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        stripe.removeCustomerCard('cus_owner', 'pm_owned'),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        stripe.createImmediateCaptureIntent({
          customerId: 'cus_owner',
          stripePaymentMethodId: 'pm_owned',
          amount: 100,
          currency: 'usd',
          idempotencyKey: 'test',
          transferGroup: 'test',
          metadata: {},
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(client.customers.update).not.toHaveBeenCalled();
      expect(client.paymentMethods.detach).not.toHaveBeenCalled();
      expect(client.paymentIntents.create).not.toHaveBeenCalled();
    },
  );

  it('allows the owner to select and remove a verified card, including expanded customer objects', async () => {
    client.paymentMethods.retrieve.mockResolvedValue({
      ...card,
      customer: { id: 'cus_owner' },
    });
    await expect(
      stripe.attachCustomerDefaultPaymentMethod({
        customerId: 'cus_owner',
        paymentMethodId: 'pm_owned',
      }),
    ).resolves.toEqual(summary);
    expect(client.customers.update).toHaveBeenCalledWith('cus_owner', {
      invoice_settings: { default_payment_method: 'pm_owned' },
    });
    await stripe.removeCustomerCard('cus_owner', 'pm_owned');
    expect(client.paymentMethods.detach).toHaveBeenCalledWith('pm_owned');
  });

  it('resolves card access through the application account instead of trusting a supplied Stripe customer', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValue({ stripeCustomerId: 'cus_owner' });
    const service = new PaymentsService(
      { user: { findUnique } } as never,
      stripe,
      {} as never,
    );
    await expect(service.getCustomerSavedCards('user_owner')).resolves.toEqual([
      summary,
    ]);
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'user_owner' },
      select: { stripeCustomerId: true },
    });
    await service.removeCustomerSavedCard('user_owner', 'pm_owned');
    expect(client.paymentMethods.detach).toHaveBeenCalledWith('pm_owned');
    findUnique.mockResolvedValue(null);
    await expect(
      service.getCustomerSavedCards('user_without_cards'),
    ).resolves.toEqual([]);
  });
});
