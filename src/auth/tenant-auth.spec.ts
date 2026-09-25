import { createHmac } from 'node:crypto';
import { DriverStatus, UserRole } from '@prisma/client';
import { AuthService } from './auth.service';
import { TenantsService } from '../tenants/tenants.service';
import { hashPassword } from '../common/security/password.util';

const fr = {
  id: 'tenant-fr',
  code: 'FR',
  countryCode: 'FR',
  name: 'France',
  defaultCurrency: 'EUR',
  timezone: 'Europe/Paris',
  defaultLocale: 'fr-FR',
  isActive: true,
};
const lb = { ...fr, id: 'tenant-lb', code: 'LB', countryCode: 'LB' };
const customer = {
  id: 'customer',
  name: 'Customer',
  email: 'customer@example.com',
  phoneNumber: '+33612345678',
  countryCode: 'CH',
  role: UserRole.CUSTOMER,
  deletedAt: null,
  isProfileCompleted: true,
  tenantId: fr.id,
  tenant: fr,
  passwordHash: hashPassword('password-123'),
  driverProfile: null,
};
const driver = {
  ...customer,
  id: 'driver',
  role: UserRole.DRIVER,
  driverProfile: {
    id: 'profile',
    firstName: 'Driver',
    lastName: 'Account',
    phone: customer.phoneNumber,
    countryCode: 'CH',
    countryCodes: ['CH'],
    city: null,
    cities: [],
    status: DriverStatus.APPROVED,
    isProfileCompleted: true,
  },
};

function token(tenantId?: string | null, role: UserRole = UserRole.CUSTOMER) {
  const payload = Buffer.from(
    JSON.stringify({
      sub: role === UserRole.DRIVER ? driver.id : customer.id,
      name: customer.name,
      email: customer.email,
      role,
      hasDriverProfile: role === UserRole.DRIVER,
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...(tenantId === undefined ? {} : { tenantId }),
    }),
  ).toString('base64url');
  return `${payload}.${createHmac(
    'sha256',
    process.env.ACCESS_TOKEN_SECRET ?? 'transpo24-dev-access-token-secret',
  )
    .update(payload)
    .digest('base64url')}`;
}
function setup(user = customer as typeof customer | typeof driver) {
  const prisma = {
    tenant: {
      findUnique: jest.fn(({ where }) =>
        Promise.resolve(
          where.code === 'FR' ? fr : where.code === 'LB' ? lb : null,
        ),
      ),
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
      findFirst: jest.fn().mockResolvedValue(user),
      create: jest.fn().mockResolvedValue(user),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    driverProfile: { findUnique: jest.fn() },
    refreshSession: {
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((callback) =>
    typeof callback === 'function' ? callback(prisma) : Promise.all(callback),
  );
  const twilio = {
    verifyCode: jest.fn().mockResolvedValue('approved'),
    sendCode: jest.fn(),
  };
  const rateLimit = { assertCanVerify: jest.fn(), assertCanSend: jest.fn() };
  const tenants = new TenantsService(prisma as never);
  const service = new AuthService(
    prisma as never,
    twilio as never,
    rateLimit as never,
    tenants,
  );
  return { prisma, service, tenants, twilio };
}
const code = (value: string) =>
  expect.objectContaining({
    response: expect.objectContaining({ code: value }),
  });
const originalTokenFormat = process.env.ACCESS_TOKEN_FORMAT;
const originalRequired = process.env.TENANT_AUTH_REQUIRED;
const originalLegacy = process.env.LEGACY_REGISTRATION_MARKET_CODE;
beforeEach(() => {
  delete process.env.ACCESS_TOKEN_FORMAT;
  delete process.env.TENANT_AUTH_REQUIRED;
  delete process.env.LEGACY_REGISTRATION_MARKET_CODE;
});
afterAll(() => {
  if (originalTokenFormat === undefined) delete process.env.ACCESS_TOKEN_FORMAT;
  else process.env.ACCESS_TOKEN_FORMAT = originalTokenFormat;
  if (originalRequired === undefined) delete process.env.TENANT_AUTH_REQUIRED;
  else process.env.TENANT_AUTH_REQUIRED = originalRequired;
  if (originalLegacy === undefined)
    delete process.env.LEGACY_REGISTRATION_MARKET_CODE;
  else process.env.LEGACY_REGISTRATION_MARKET_CODE = originalLegacy;
});

describe('tenant authentication', () => {
  it('logs an FR account in through FR and signs its home tenant', async () => {
    const { service } = setup();
    const response = await service.login({
      email: customer.email,
      password: 'password-123',
      marketCode: ' fr ',
    });
    expect(response.user.tenantId).toBe(fr.id);
    expect(response.user.tenant).toMatchObject({
      code: 'FR',
      countryCode: 'FR',
    });
    expect(response.user.tenant).not.toHaveProperty('isActive');
    expect(service.getUserFromAccessToken(response.accessToken)).toMatchObject({
      tenantId: fr.id,
      tenantCode: 'FR',
    });
  });
  it.each(['login', 'loginDriver'] as const)(
    'rejects FR through LB on %s',
    async (method) => {
      const { service } = setup(driver);
      await expect(
        service[method]({
          email: driver.email,
          password: 'password-123',
          marketCode: 'LB',
        }),
      ).rejects.toEqual(code('TENANT_MISMATCH'));
    },
  );
  it('can issue tenant-bearing HS256 JWTs after compatible apps are deployed', async () => {
    process.env.ACCESS_TOKEN_FORMAT = 'jwt';
    const { service } = setup();
    const response = await service.login({
      email: customer.email,
      password: 'password-123',
      marketCode: 'FR',
    });
    const [header, payload, signature] = response.accessToken.split('.');
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
      alg: 'HS256',
      typ: 'JWT',
    });
    expect(
      JSON.parse(Buffer.from(payload, 'base64url').toString()),
    ).toMatchObject({ sub: customer.id, tenantId: fr.id, tenantCode: 'FR' });
    expect(signature).toBe(
      createHmac(
        'sha256',
        process.env.ACCESS_TOKEN_SECRET ?? 'transpo24-dev-access-token-secret',
      )
        .update(`${header}.${payload}`)
        .digest('base64url'),
    );
    expect(service.getUserFromAccessToken(response.accessToken)?.tenantId).toBe(
      fr.id,
    );
    // Existing legacy tokens remain usable through the staged transition.
    expect(service.getUserFromAccessToken(token(fr.id))?.tenantId).toBe(fr.id);
    for (const alg of ['none', 'HS512']) {
      const altered = Buffer.from(JSON.stringify({ alg, typ: 'JWT' })).toString(
        'base64url',
      );
      expect(
        service.getUserFromAccessToken(`${altered}.${payload}.${signature}`),
      ).toBeNull();
    }
  });
  it('checks password before disclosing a market mismatch', async () => {
    const { service, prisma } = setup();
    await expect(
      service.login({
        email: customer.email,
        password: 'invalid-pass',
        marketCode: 'LB',
      }),
    ).rejects.toThrow('Invalid email or password');
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });
  it.each(['verifyPhoneCode', 'verifyDriverPhoneCode'] as const)(
    'enforces selected market on %s after OTP approval',
    async (method) => {
      const { service, prisma } = setup(
        method === 'verifyPhoneCode' ? customer : driver,
      );
      await expect(
        service[method](
          {
            phoneNumber: customer.phoneNumber,
            code: '123456',
            marketCode: 'LB',
          },
          'ip',
        ),
      ).rejects.toEqual(code('TENANT_MISMATCH'));
      expect(prisma.refreshSession.create).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
    },
  );
  it.each(['verifyPhoneCode', 'verifyDriverPhoneCode'] as const)(
    'assigns the server-resolved tenant during new %s registration',
    async (method) => {
      const { service, prisma } = setup(
        method === 'verifyPhoneCode' ? customer : driver,
      );
      prisma.user.findUnique.mockResolvedValueOnce(null);
      prisma.user.findFirst.mockResolvedValueOnce(null);
      const response = await service[method](
        { phoneNumber: customer.phoneNumber, code: '123456', marketCode: 'FR' },
        'ip',
      );
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: fr.id }),
        }),
      );
      expect(
        service.getUserFromAccessToken(response.accessToken)?.tenantId,
      ).toBe(fr.id);
    },
  );
  it('assigns the tenant on password registration without trusting a raw tenant ID', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValueOnce(null);
    await service.register({
      nickname: 'Customer',
      name: 'Customer',
      email: customer.email,
      password: 'password-123',
      marketCode: 'FR',
      tenantId: lb.id,
    } as never);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: fr.id }),
      }),
    );
  });
  it('preserves legacy login payloads but derives tenant from the account', async () => {
    const { service } = setup();
    const response = await service.login({
      email: customer.email,
      password: 'password-123',
    });
    expect(response.user.tenantId).toBe(fr.id);
  });
  it('uses the account market for login even when enforcement is enabled', async () => {
    process.env.TENANT_AUTH_REQUIRED = 'true';
    const { service } = setup();
    await expect(
      service.login({ email: customer.email, password: 'password-123' }),
    ).resolves.toMatchObject({ user: { tenantId: fr.id } });
  });
  it('preserves global ADMIN login with enforcement enabled', async () => {
    process.env.TENANT_AUTH_REQUIRED = 'true';
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({
      ...customer,
      role: UserRole.ADMIN,
      tenantId: null,
      tenant: null,
    });
    await expect(
      service.loginAdmin({ email: customer.email, password: 'password-123' }),
    ).resolves.toMatchObject({ user: { role: 'ADMIN' } });
  });
  it('rejects a supplied market for an unassigned legacy user instead of guessing ownership', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({
      ...customer,
      tenantId: null,
      tenant: null,
    });
    await expect(
      service.login({
        email: customer.email,
        password: 'password-123',
        marketCode: 'FR',
      }),
    ).rejects.toEqual(code('TENANT_ASSIGNMENT_REQUIRED'));
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
  it('rejects inactive home tenants even with legacy payloads', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({
      ...customer,
      tenant: { ...fr, isActive: false },
    });
    await expect(
      service.login({ email: customer.email, password: 'password-123' }),
    ).rejects.toEqual(code('TENANT_INACTIVE'));
  });
  it('rejects deleted accounts before token issuance', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({
      ...customer,
      deletedAt: new Date(),
    });
    await expect(
      service.login({
        email: customer.email,
        password: 'password-123',
        marketCode: 'FR',
      }),
    ).rejects.toThrow('Invalid email or password');
  });
  it('hydrates old signed tokens from DB without trusting profile country', async () => {
    const { service } = setup();
    const identity = service.getUserFromAccessToken(token())!;
    expect(await service.isUserActive(identity)).toBe(true);
    expect(identity).toMatchObject({ tenantId: fr.id, tenantCode: 'FR' });
  });
  it('rejects a signed token bound to a different tenant', async () => {
    const { service } = setup();
    await expect(
      service.isUserActive(service.getUserFromAccessToken(token(lb.id))!),
    ).rejects.toEqual(code('TENANT_MISMATCH'));
  });
  it('rejects modified token payloads and trailing token segments', () => {
    const { service } = setup();
    const signed = token(fr.id);
    expect(service.getUserFromAccessToken(`${signed}.extra`)).toBeNull();
    const payload = JSON.parse(
      Buffer.from(signed.split('.')[0], 'base64url').toString(),
    );
    payload.tenantId = lb.id;
    expect(
      service.getUserFromAccessToken(
        `${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${signed.split('.')[1]}`,
      ),
    ).toBeNull();
  });
  it('revalidates tenant binding when continuing a driver session', async () => {
    const { service } = setup(driver);
    await expect(
      service.continueDriverSession(token(lb.id, UserRole.DRIVER)),
    ).rejects.toEqual(code('TENANT_MISMATCH'));
    await expect(
      service.continueDriverSession(token(fr.id, UserRole.DRIVER), 'LB'),
    ).rejects.toEqual(code('TENANT_MISMATCH'));
    expect(
      (await service.continueDriverSession(token(fr.id, UserRole.DRIVER))).user
        .tenantId,
    ).toBe(fr.id);
  });
  it('rotates and binds a legacy refresh session to the authoritative home tenant', async () => {
    const { service, prisma } = setup();
    prisma.refreshSession.findUnique.mockResolvedValue({
      id: 'session',
      userId: customer.id,
      tenantId: null,
      user: customer,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const response = await service.refreshCustomerSession('refresh');
    expect(prisma.refreshSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: fr.id }),
      }),
    );
    expect(service.getUserFromAccessToken(response.accessToken)?.tenantId).toBe(
      fr.id,
    );
  });
  it.each(['mismatch', 'inactive'])(
    'rejects %s on refresh before rotation',
    async (failure) => {
      const { service, prisma } = setup();
      prisma.refreshSession.findUnique.mockResolvedValue({
        id: 'session',
        tenantId: failure === 'mismatch' ? lb.id : fr.id,
        user: {
          ...customer,
          tenant: { ...fr, isActive: failure !== 'inactive' },
        },
        expiresAt: new Date(Date.now() + 60_000),
      });
      await expect(service.refreshCustomerSession('refresh')).rejects.toEqual(
        code(failure === 'mismatch' ? 'TENANT_MISMATCH' : 'TENANT_INACTIVE'),
      );
      expect(prisma.refreshSession.updateMany).not.toHaveBeenCalled();
    },
  );
  it('profile country edits never write tenant ownership', async () => {
    const { service, prisma } = setup();
    prisma.user.update.mockResolvedValue(customer);
    await service.updateCustomerProfile(
      customer.id,
      'New name',
      'LB',
      'Nickname',
    );
    expect(prisma.user.updateMany.mock.calls[0][0].data).not.toHaveProperty(
      'tenantId',
    );
    expect(prisma.user.updateMany.mock.calls[0][0].data).not.toHaveProperty(
      'tenant',
    );
  });
});

describe('market resolution and rollout compatibility', () => {
  it('uses only active public fields and a deterministic order', async () => {
    const { tenants, prisma } = setup();
    await tenants.listPublic();
    expect(prisma.tenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true },
        orderBy: { code: 'asc' },
        select: expect.objectContaining({ code: true, defaultCurrency: true }),
      }),
    );
    expect(prisma.tenant.findMany.mock.calls[0][0].select).not.toHaveProperty(
      'users',
    );
  });
  it('does not infer a market when legacy registration has no configured default', async () => {
    expect(await setup().tenants.registrationTenant()).toBeNull();
  });
  it('uses only an explicitly configured legacy registration market', async () => {
    process.env.LEGACY_REGISTRATION_MARKET_CODE = 'FR';
    expect((await setup().tenants.registrationTenant())?.id).toBe(fr.id);
  });
  it('strict registration rejects missing market even when a legacy default exists', async () => {
    process.env.TENANT_AUTH_REQUIRED = 'true';
    process.env.LEGACY_REGISTRATION_MARKET_CODE = 'FR';
    await expect(setup().tenants.registrationTenant()).rejects.toEqual(
      code('MARKET_REQUIRED'),
    );
  });
  it('rejects unknown and inactive selected markets', async () => {
    const { tenants, prisma } = setup();
    await expect(tenants.resolveMarket('ZZ')).rejects.toEqual(
      code('TENANT_NOT_FOUND'),
    );
    prisma.tenant.findUnique.mockResolvedValueOnce({ ...fr, isActive: false });
    await expect(tenants.resolveMarket('FR')).rejects.toEqual(
      code('TENANT_INACTIVE'),
    );
  });
});

describe('account-owned login market', () => {
  it.each(['customer', 'driver'])(
    'allows %s OTP login without a market in strict mode',
    async (role) => {
      process.env.TENANT_AUTH_REQUIRED = 'true';
      const { service } = setup(role === 'driver' ? driver : customer);
      const verify =
        role === 'driver'
          ? service.verifyDriverPhoneCode.bind(service)
          : service.verifyPhoneCode.bind(service);
      await expect(
        verify(
          { phoneNumber: customer.phoneNumber, code: '123456' },
          '127.0.0.1',
        ),
      ).resolves.toMatchObject({ user: { tenantId: fr.id } });
    },
  );
  it('sends OTP without a market in strict mode', async () => {
    process.env.TENANT_AUTH_REQUIRED = 'true';
    const { service } = setup();
    await expect(
      service.sendPhoneCode({ phoneNumber: customer.phoneNumber }, '127.0.0.1'),
    ).resolves.toMatchObject({ success: true });
  });
  it.each(['customer', 'driver'])(
    'does not create a %s from login without a market',
    async (role) => {
      const { service, prisma } = setup();
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.findFirst.mockResolvedValue(null);
      const verify =
        role === 'driver'
          ? service.verifyDriverPhoneCode.bind(service)
          : service.verifyPhoneCode.bind(service);
      await expect(
        verify(
          { phoneNumber: customer.phoneNumber, code: '123456' },
          '127.0.0.1',
        ),
      ).rejects.toEqual(code('MARKET_REQUIRED'));
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    },
  );
});
