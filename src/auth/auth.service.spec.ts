import {
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { DriverStatus, Prisma, UserRole } from '@prisma/client';

import { AuthService } from './auth.service';

const customer = {
  id: 'customer-1',
  name: 'Customer',
  email: 'customer@example.com',
  phoneNumber: '+96170123456',
  role: UserRole.CUSTOMER,
  deletedAt: null,
  isProfileCompleted: true,
};

function createHarness() {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    driverProfile: { findUnique: jest.fn() },
    refreshSession: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const twilio = { sendCode: jest.fn(), verifyCode: jest.fn() };
  const rateLimit = {
    assertCanSend: jest.fn(),
    assertCanVerify: jest.fn(),
  };
  const service = new AuthService(
    prisma as never,
    twilio as never,
    rateLimit as never,
  );
  return { prisma, twilio, rateLimit, service };
}

describe('AuthService phone authentication', () => {
  it('returns the same generic send-code response', async () => {
    const { service, twilio } = createHarness();
    twilio.sendCode.mockResolvedValue(undefined);

    await expect(
      service.sendPhoneCode({ phoneNumber: '+96170123456' }, '127.0.0.1'),
    ).resolves.toEqual({ success: true, message: 'Verification code sent' });
  });

  it('sanely propagates a sanitized Twilio delivery failure', async () => {
    const { service, twilio } = createHarness();
    twilio.sendCode.mockRejectedValue(
      new ServiceUnavailableException(
        'Unable to send an SMS verification code. Check that Twilio Verify SMS is enabled for this project and that the destination number can receive SMS, then try again.',
      ),
    );
    await expect(
      service.sendPhoneCode({ phoneNumber: '+96170123456' }, '127.0.0.1'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('logs an existing customer in without creating a duplicate', async () => {
    const { service, prisma, twilio } = createHarness();
    twilio.verifyCode.mockResolvedValue('approved');
    prisma.driverProfile.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(customer);

    const response = await service.verifyPhoneCode(
      { phoneNumber: customer.phoneNumber, code: '123456' },
      '127.0.0.1',
    );

    expect(response.isNewUser).toBe(false);
    expect(response.user.phoneNumber).toBe(customer.phoneNumber);
    expect(response.accessToken).toBeTruthy();
    expect(response.refreshToken).toBeTruthy();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('logs the temporary test customer in without SMS verification', async () => {
    const { service, prisma, twilio } = createHarness();
    const testCustomer = { ...customer, phoneNumber: '+96171251044' };
    prisma.user.findUnique.mockResolvedValue(testCustomer);

    const response = await service.loginTemporaryTestCustomer();

    expect(response.user.phoneNumber).toBe('+96171251044');
    expect(response.isNewUser).toBe(false);
    expect(twilio.verifyCode).not.toHaveBeenCalled();
  });

  it('creates a new customer only after Twilio approval', async () => {
    const { service, prisma, twilio } = createHarness();
    let createInput:
      | { data: { role: UserRole; isProfileCompleted: boolean } }
      | undefined;
    twilio.verifyCode.mockResolvedValue('approved');
    prisma.driverProfile.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation((input: unknown) => {
      createInput = input as { data: { role: UserRole } };
      return Promise.resolve(customer);
    });

    const response = await service.verifyPhoneCode(
      { phoneNumber: customer.phoneNumber, code: '123456' },
      '127.0.0.1',
    );

    expect(response.isNewUser).toBe(true);
    expect(createInput?.data.role).toBe(UserRole.CUSTOMER);
    expect(createInput?.data.isProfileCompleted).toBe(false);
  });

  it('recovers from a concurrent unique-phone insert without duplicating the customer', async () => {
    const { service, prisma, twilio } = createHarness();
    twilio.verifyCode.mockResolvedValue('approved');
    prisma.driverProfile.findUnique.mockResolvedValue(null);
    prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(customer);
    prisma.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.8.0',
        meta: { target: ['phoneNumber'] },
      }),
    );

    const response = await service.verifyPhoneCode(
      { phoneNumber: customer.phoneNumber, code: '123456' },
      '127.0.0.1',
    );

    expect(response.isNewUser).toBe(false);
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['invalid', 'incorrect'],
    ['expired', 'expired'],
  ])('rejects a %s verification', async (status, message) => {
    const { service, twilio } = createHarness();
    twilio.verifyCode.mockResolvedValue(status);
    await expect(
      service.verifyPhoneCode(
        { phoneNumber: customer.phoneNumber, code: '000000' },
        '127.0.0.1',
      ),
    ).rejects.toThrow(message);
  });

  it('allows the same phone number to be used by a customer and a driver', async () => {
    const { service, prisma, twilio } = createHarness();
    twilio.verifyCode.mockResolvedValue('approved');
    prisma.driverProfile.findUnique.mockResolvedValue({ userId: 'driver-1' });
    prisma.user.findUnique.mockResolvedValue(customer);

    const response = await service.verifyPhoneCode(
      { phoneNumber: customer.phoneNumber, code: '123456' },
      '127.0.0.1',
    );

    expect(response.user.phoneNumber).toBe(customer.phoneNumber);
    expect(response.isNewUser).toBe(false);
  });

  it('creates a new customer even when the phone already belongs to a driver profile', async () => {
    const { service, prisma, twilio } = createHarness();
    twilio.verifyCode.mockResolvedValue('approved');
    prisma.driverProfile.findUnique.mockResolvedValue({ userId: 'driver-1' });
    prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(customer);
    prisma.user.create.mockResolvedValue(customer);

    const response = await service.verifyPhoneCode(
      { phoneNumber: customer.phoneNumber, code: '123456' },
      '127.0.0.1',
    );

    expect(response.isNewUser).toBe(true);
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
  });

  it('releases a legacy driver user phone number for a customer account', async () => {
    const { service, prisma, twilio } = createHarness();
    const legacyDriver = {
      ...customer,
      id: 'driver-1',
      role: UserRole.DRIVER,
    };
    twilio.verifyCode.mockResolvedValue('approved');
    prisma.user.findUnique
      .mockResolvedValueOnce(legacyDriver)
      .mockResolvedValueOnce(customer);
    prisma.driverProfile.findUnique.mockResolvedValue({
      phone: customer.phoneNumber,
    });
    prisma.user.create.mockResolvedValue(customer);

    const response = await service.verifyPhoneCode(
      { phoneNumber: customer.phoneNumber, code: '123456' },
      '127.0.0.1',
    );

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'driver-1' },
      data: { phoneNumber: null },
    });
    expect(response.isNewUser).toBe(true);
  });

  it('creates a fresh customer account instead of reactivating a deleted one', async () => {
    const { service, prisma, twilio } = createHarness();
    const deletedCustomer = {
      ...customer,
      deletedAt: new Date('2026-08-06T08:51:25.305Z'),
    };
    twilio.verifyCode.mockResolvedValue('approved');
    prisma.user.findUnique.mockResolvedValue(deletedCustomer);
    prisma.user.update.mockResolvedValue({});
    prisma.user.create.mockResolvedValue(customer);

    const response = await service.verifyPhoneCode(
      { phoneNumber: customer.phoneNumber, code: '123456' },
      '127.0.0.1',
    );

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: customer.id },
      data: {
        name: 'Deleted account',
        email: `deleted-${customer.id}@deleted.transpo24.invalid`,
        phoneNumber: null,
        countryCode: null,
        isProfileCompleted: false,
      },
    });
    expect(response.isNewUser).toBe(true);
  });

  it('keeps a newly registered driver in the onboarding flow', async () => {
    const { service, prisma } = createHarness();
    prisma.$transaction.mockResolvedValue([null, null]);
    prisma.user.create.mockResolvedValue({
      id: 'driver-user-1',
      email: 'driver@example.com',
      role: UserRole.DRIVER,
      driverProfile: {
        id: 'driver-profile-1',
        firstName: 'New',
        lastName: 'Driver',
        phone: '+96170123457',
        countryCode: 'LB',
        countryCodes: ['LB'],
        city: 'Beirut',
        cities: ['Beirut'],
        status: DriverStatus.PENDING_PROFILE,
        isProfileCompleted: false,
      },
    });

    const response = await service.registerDriver({
      firstName: 'New',
      lastName: 'Driver',
      email: 'driver@example.com',
      phone: '+96170123457',
      password: 'driver@test.com',
      countryCode: 'LB',
      countryCodes: ['LB'],
      city: 'Beirut',
      cities: ['Beirut'],
    });

    expect(response.nextStep).toBe('COMPLETE_PROFILE');
    expect(response.driver.status).toBe(DriverStatus.PENDING_PROFILE);
    expect(response.driver.isProfileCompleted).toBe(false);
  });

  it('creates a new driver account through phone verification', async () => {
    const { service, prisma, twilio } = createHarness();
    twilio.verifyCode.mockResolvedValue('approved');
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'driver-user-2',
      name: 'Driver',
      email: 'phone-driver@example.com',
      role: UserRole.DRIVER,
      deletedAt: null,
      driverProfile: {
        id: 'driver-profile-2',
        firstName: '',
        lastName: '',
        phone: '+96170123458',
        countryCode: null,
        countryCodes: [],
        city: null,
        cities: [],
        status: DriverStatus.PENDING_PROFILE,
        isProfileCompleted: false,
      },
    });

    const response = await service.verifyDriverPhoneCode(
      { phoneNumber: '+96170123458', code: '123456' },
      '127.0.0.1',
    );

    expect(response.user.role).toBe(UserRole.DRIVER);
    expect(response.driver?.phone).toBe('+96170123458');
    expect(response.nextStep).toBe('COMPLETE_PROFILE');
  });

  it('logs an existing driver in through phone verification', async () => {
    const { service, prisma, twilio } = createHarness();
    twilio.verifyCode.mockResolvedValue('approved');
    prisma.user.findFirst.mockResolvedValue({
      id: 'driver-user-3',
      name: 'Existing Driver',
      email: 'existing-driver@example.com',
      role: UserRole.DRIVER,
      deletedAt: null,
      driverProfile: {
        id: 'driver-profile-3',
        firstName: 'Existing',
        lastName: 'Driver',
        phone: '+96170123459',
        countryCode: 'LB',
        countryCodes: ['LB'],
        city: 'Beirut',
        cities: ['Beirut'],
        status: DriverStatus.PENDING_DOCUMENTS,
        isProfileCompleted: true,
      },
    });

    const response = await service.verifyDriverPhoneCode(
      { phoneNumber: '+96170123459', code: '123456' },
      '127.0.0.1',
    );

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(response.nextStep).toBe('UPLOAD_DOCUMENTS');
  });

  it('continues a trusted driver session after the normal access token expires', async () => {
    const { service, prisma } = createHarness();
    const driver = {
      id: 'driver-user-trusted',
      name: 'Trusted Driver',
      email: 'trusted-driver@example.com',
      role: UserRole.DRIVER,
      deletedAt: null,
      driverProfile: {
        id: 'driver-profile-trusted',
        firstName: 'Trusted',
        lastName: 'Driver',
        phone: '+96171251044',
        countryCode: 'LB',
        countryCodes: ['LB'],
        city: 'Beirut',
        cities: ['Beirut'],
        status: DriverStatus.PENDING_DOCUMENTS,
        isProfileCompleted: true,
      },
    };
    prisma.user.findUnique.mockResolvedValue(driver);

    const expiredAccessToken = (
      service as unknown as {
        createAccessToken: (
          user: {
            id: string;
            name: string;
            email: string;
            role: UserRole;
            hasDriverProfile: boolean;
          },
          ttlSeconds: number,
        ) => string;
      }
    ).createAccessToken(
      {
        id: driver.id,
        name: driver.name,
        email: driver.email,
        role: driver.role,
        hasDriverProfile: true,
      },
      -1,
    );

    expect(service.getUserFromAccessToken(expiredAccessToken)).toBeNull();

    await expect(
      service.continueDriverSession(expiredAccessToken),
    ).resolves.toMatchObject({
      user: { id: driver.id, role: UserRole.DRIVER },
      driver: { phone: '+96171251044' },
      nextStep: 'UPLOAD_DOCUMENTS',
    });
  });

  it('rotates a valid refresh session', async () => {
    const { service, prisma } = createHarness();
    prisma.refreshSession.findUnique.mockResolvedValue({
      id: 'session-1',
      userId: customer.id,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: customer,
    });
    prisma.$transaction.mockImplementation(
      (callback: (tx: unknown) => unknown) =>
        Promise.resolve(
          callback({
            refreshSession: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
              create: jest.fn().mockResolvedValue({}),
            },
          }),
        ),
    );

    const response = await service.refreshCustomerSession(
      'valid-refresh-token',
    );
    expect(response.refreshToken).not.toBe('valid-refresh-token');
    expect(response.accessToken).toBeTruthy();
  });

  it('rejects an expired refresh session', async () => {
    const { service, prisma } = createHarness();
    prisma.refreshSession.findUnique.mockResolvedValue({
      revokedAt: null,
      expiresAt: new Date(0),
      user: customer,
    });
    await expect(
      service.refreshCustomerSession('expired'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('revokes the refresh session on logout', async () => {
    const { service, prisma } = createHarness();
    let logoutInput: { data: { revokedAt: Date } } | undefined;
    prisma.refreshSession.updateMany.mockImplementation((input: unknown) => {
      logoutInput = input as { data: { revokedAt: Date } };
      return Promise.resolve({ count: 1 });
    });
    await expect(service.logoutCustomer('refresh-token')).resolves.toEqual({
      success: true,
    });
    expect(logoutInput?.data.revokedAt).toBeInstanceOf(Date);
  });

  it('allows an admin to log out', async () => {
    const { service } = createHarness();

    await expect(
      service.logoutAdmin({
        id: 'admin-1',
        name: 'Admin',
        email: 'admin@example.com',
        role: UserRole.ADMIN,
        hasDriverProfile: false,
      }),
    ).resolves.toEqual({ success: true });
  });

  it('rejects logout requests from non-admin users', async () => {
    const { service } = createHarness();

    await expect(
      service.logoutAdmin({
        id: customer.id,
        name: customer.name,
        email: customer.email,
        role: UserRole.CUSTOMER,
        hasDriverProfile: false,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
