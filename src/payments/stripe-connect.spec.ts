jest.mock('../notifications/notifications.service', () => ({
  NotificationsService: class NotificationsServiceMock {},
}));

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateStripeConnectAccountDto } from '../driver/dto/create-stripe-connect-account.dto';
import { PaymentsService } from './payments.service';

describe('Stripe Connect removal and reconnection', () => {
  const makeService = () => {
    const profile = {
      id: 'driver-profile',
      userId: 'driver-user',
      firstName: 'Test',
      lastName: 'Driver',
      countryCode: 'CH',
      stripeAccountId: 'acct_old' as string | null,
    };
    const prisma = {
      driverProfile: {
        findUnique: jest
          .fn()
          .mockImplementation(() => Promise.resolve({ ...profile })),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          email: 'original@example.com',
          name: 'Test Driver',
        }),
      },
    };
    const stripe = {
      createExpressAccount: jest.fn().mockResolvedValue({
        id: 'acct_new',
        details_submitted: false,
        payouts_enabled: false,
      }),
      createAccountLink: jest
        .fn()
        .mockResolvedValue({ url: 'https://connect.stripe.com/setup' }),
      retrieveAccount: jest
        .fn()
        .mockResolvedValue({ details_submitted: true, payouts_enabled: true }),
    };
    return {
      prisma,
      stripe,
      profile,
      service: new PaymentsService(
        prisma as never,
        stripe as never,
        {} as never,
      ),
    };
  };

  it('unlinks only the authenticated driver and clears all cached readiness flags', async () => {
    const { service, prisma, stripe } = makeService();
    await expect(
      service.removeDriverConnectAccount({ driverUserId: 'driver-user' }),
    ).resolves.toEqual({
      stripeAccountId: null,
      accountStatus: null,
      detailsSubmitted: false,
      payoutsEnabled: false,
    });
    expect(prisma.driverProfile.update).toHaveBeenCalledWith({
      where: { userId: 'driver-user' },
      data: {
        stripeAccountId: null,
        stripeAccountStatus: null,
        stripeDetailsSubmitted: false,
        stripePayoutsEnabled: false,
      },
    });
    expect(stripe.createExpressAccount).not.toHaveBeenCalled();
  });

  it.each([undefined, 'original@example.com', 'different@example.com'])(
    'creates a fresh payout account after removal using email %s',
    async (email) => {
      const { service, prisma, stripe, profile } = makeService();
      prisma.driverProfile.update.mockImplementation(() => {
        profile.stripeAccountId = null;
        return Promise.resolve({});
      });
      try {
        await service.removeDriverConnectAccount({
          driverUserId: 'driver-user',
        });
        await service.createDriverConnectAccount({
          driverUserId: 'driver-user',
          email,
        });
        expect(stripe.createExpressAccount).toHaveBeenCalledWith({
          driverId: 'driver-profile',
          country: 'CH',
          name: 'Test Driver',
          email: email ?? 'original@example.com',
        });
        expect(stripe.createAccountLink).toHaveBeenCalledWith(
          expect.objectContaining({ accountId: 'acct_new' }),
        );
      } finally {
        profile.stripeAccountId = 'acct_old';
      }
    },
  );

  it('resumes existing onboarding without creating a replacement account', async () => {
    const { service, stripe } = makeService();
    await service.createDriverConnectAccount({ driverUserId: 'driver-user' });
    expect(stripe.createExpressAccount).not.toHaveBeenCalled();
    expect(stripe.createAccountLink).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'acct_old' }),
    );
  });

  it('requires the saved driver country before creating a merchant account', async () => {
    const { service, prisma, stripe, profile } = makeService();
    prisma.driverProfile.findUnique.mockResolvedValue({
      ...profile,
      stripeAccountId: null,
      countryCode: '',
    });
    await expect(
      service.createDriverConnectAccount({ driverUserId: 'driver-user' }),
    ).rejects.toThrow(
      'Set your country in your driver profile before connecting Stripe.',
    );
    expect(stripe.createExpressAccount).not.toHaveBeenCalled();
    expect(prisma.driverProfile.update).not.toHaveBeenCalled();
  });

  it('restricts a delayed status sync to the original account', async () => {
    const { service, prisma } = makeService();
    await service.syncDriverConnectAccount({ driverUserId: 'driver-user' });
    expect(prisma.driverProfile.updateMany).toHaveBeenCalledWith({
      where: { id: 'driver-profile', stripeAccountId: 'acct_old' },
      data: {
        stripeAccountStatus: 'details_submitted',
        stripeDetailsSubmitted: true,
        stripePayoutsEnabled: true,
      },
    });
    expect(prisma.driverProfile.update).not.toHaveBeenCalled();
  });

  it('accepts omitted email, trims an email override, and rejects malformed email', async () => {
    for (const email of [undefined, '', '  ', ' different@example.com ']) {
      const dto = plainToInstance(CreateStripeConnectAccountDto, { email });
      expect(await validate(dto)).toHaveLength(0);
      expect(dto.email).toBe(email?.trim() || undefined);
    }
    expect(
      await validate(
        plainToInstance(CreateStripeConnectAccountDto, { email: 'invalid' }),
      ),
    ).not.toHaveLength(0);
  });
});
