// Run only against a disposable database after prisma migrate deploy.
const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const { Test } = require('@nestjs/testing');
const http = require('supertest');
const { AuthController } = require('../dist/src/auth/auth.controller');
const {
  CustomerAuthGuard,
} = require('../dist/src/auth/guards/customer-auth.guard');
const {
  AuthenticatedUserGuard,
} = require('../dist/src/auth/guards/authenticated-user.guard');
const {
  TestingOnlyGuard,
} = require('../dist/src/auth/guards/testing-only.guard');
const { configureHttpApplication } = require('../dist/src/config/http');
let app;
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { applyPlan, validatePlan } = require('./tenant-backfill.cjs');
const { AuthService } = require('../dist/src/auth/auth.service.js');
const { TenantsService } = require('../dist/src/tenants/tenants.service.js');
const {
  hashPassword,
} = require('../dist/src/common/security/password.util.js');
const plan = require('../prisma/fixtures/tenants.development.json');
const connectionString = process.env.TENANT_TEST_DATABASE_URL;
if (!connectionString)
  throw new Error(
    'Set TENANT_TEST_DATABASE_URL to a disposable migrated database.',
  );
const url = new URL(connectionString);
if (
  !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
  !url.pathname.endsWith('_test')
)
  throw new Error(
    'Tenant integration tests require a local database ending in _test.',
  );
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});
const tenants = new TenantsService(prisma);
const auth = new AuthService(
  prisma,
  { verifyCode: async () => 'approved' },
  { assertCanVerify: async () => undefined },
  tenants,
);
const prefix = `tenant-test-${randomUUID()}`;
const userIds = [];
let fr;
let ch;
const originalFormat = process.env.ACCESS_TOKEN_FORMAT;
const originalRequired = process.env.TENANT_AUTH_REQUIRED;
const originalLegacy = process.env.LEGACY_REGISTRATION_MARKET_CODE;
async function user(data = {}) {
  const account = await prisma.user.create({
    data: {
      name: 'Tenant test',
      nickname: 'Test',
      email: `${prefix}-${randomUUID()}@example.invalid`,
      passwordHash: hashPassword('password-123'),
      ...data,
    },
  });
  userIds.push(account.id);
  return account;
}
const errorCode = (expected) => (error) =>
  error?.getResponse?.().code === expected;
before(async () => {
  delete process.env.ACCESS_TOKEN_FORMAT;
  const module = await Test.createTestingModule({
    controllers: [AuthController],
    providers: [
      CustomerAuthGuard,
      AuthenticatedUserGuard,
      TestingOnlyGuard,
      { provide: AuthService, useValue: auth },
    ],
  }).compile();
  app = module.createNestApplication({ bodyParser: false });
  configureHttpApplication(app);
  await app.init();
  delete process.env.TENANT_AUTH_REQUIRED;
  delete process.env.LEGACY_REGISTRATION_MARKET_CODE;
  await applyPlan(prisma, plan, true);
  fr = await prisma.tenant.findUniqueOrThrow({ where: { code: 'FR' } });
  ch = await prisma.tenant.findUniqueOrThrow({ where: { code: 'CH' } });
});
after(async () => {
  if (app) await app.close();
  if (originalFormat === undefined) delete process.env.ACCESS_TOKEN_FORMAT;
  else process.env.ACCESS_TOKEN_FORMAT = originalFormat;
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
  if (originalRequired === undefined) delete process.env.TENANT_AUTH_REQUIRED;
  else process.env.TENANT_AUTH_REQUIRED = originalRequired;
  if (originalLegacy === undefined)
    delete process.env.LEGACY_REGISTRATION_MARKET_CODE;
  else process.env.LEGACY_REGISTRATION_MARKET_CODE = originalLegacy;
});

test('development seed is idempotent and public markets expose only safe active fields', async () => {
  await applyPlan(prisma, plan, true);
  const markets = await tenants.listPublic();
  assert.equal(markets.filter((m) => m.code === 'FR').length, 1);
  assert.equal(markets.find((m) => m.code === 'FR').defaultCurrency, 'EUR');
  assert.equal(Object.hasOwn(markets[0], 'users'), false);
  assert.equal(Object.hasOwn(markets[0], 'isActive'), false);
});
test('legacy users remain unassigned until explicit backfill; dry run does not mutate', async () => {
  const account = await user({ countryCode: 'CH' });
  assert.equal(account.tenantId, null);
  const mapping = {
    tenants: [],
    assignments: [{ userId: account.id, marketCode: 'FR' }],
  };
  assert.equal((await applyPlan(prisma, mapping)).assignments, 1);
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { id: account.id } }))
      .tenantId,
    null,
  );
  await applyPlan(prisma, mapping, true);
  const assigned = await prisma.user.findUniqueOrThrow({
    where: { id: account.id },
  });
  assert.equal(assigned.tenantId, fr.id);
  assert.equal(assigned.countryCode, 'CH');
  assert.equal((await applyPlan(prisma, mapping, true)).assignments, 0);
  await assert.rejects(
    applyPlan(
      prisma,
      { tenants: [], assignments: [{ userId: account.id, marketCode: 'CH' }] },
      true,
    ),
    /transfer is not supported/,
  );
});
test('backfill rolls back all assignments when any mapping is invalid', async () => {
  const account = await user();
  await assert.rejects(
    applyPlan(
      prisma,
      {
        tenants: [],
        assignments: [
          { userId: account.id, marketCode: 'FR' },
          { userId: 'does-not-exist', marketCode: 'FR' },
        ],
      },
      true,
    ),
    /unknown user/,
  );
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { id: account.id } }))
      .tenantId,
    null,
  );
});
test('backfill validates country, currency, timezone and duplicate assignments', () => {
  for (const changes of [
    { countryCode: 'ZZ' },
    { defaultCurrency: 'ZZZ' },
    { timezone: 'Invalid/Zone' },
  ]) {
    assert.throws(() =>
      validatePlan({
        tenants: [{ ...plan.tenants[0], ...changes }],
        assignments: [],
      }),
    );
  }
  assert.throws(
    () =>
      validatePlan({
        tenants: [],
        assignments: [
          { userId: 'one', marketCode: 'FR' },
          { userId: 'one', marketCode: 'CH' },
        ],
      }),
    /duplicate/,
  );
});
test('FR through FR succeeds; FR through LB fails against real persisted ownership', async () => {
  const account = await user({ tenantId: fr.id, countryCode: 'CH' });
  const response = await auth.login({
    email: account.email,
    password: 'password-123',
    marketCode: 'FR',
  });
  assert.equal(response.user.tenantId, fr.id);
  assert.equal(
    auth.getUserFromAccessToken(response.accessToken).tenantId,
    fr.id,
  );
  await assert.rejects(
    auth.login({
      email: account.email,
      password: 'password-123',
      marketCode: 'LB',
    }),
    errorCode('TENANT_MISMATCH'),
  );
  await auth.updateCustomerProfile(
    account.id,
    'Updated profile',
    'LB',
    'Nickname',
  );
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { id: account.id } }))
      .tenantId,
    fr.id,
  );
});
test('password customer and driver registration both persist their selected market', async () => {
  const email = `${prefix}-register@example.invalid`;
  const response = await auth.register({
    name: 'New customer',
    nickname: 'Customer',
    email,
    password: 'password-123',
    marketCode: 'FR',
  });
  userIds.push(response.user.id);
  assert.equal(response.user.tenantId, fr.id);
  const driver = await auth.registerDriver({
    firstName: 'Driver',
    lastName: 'Test',
    nickname: 'Driver',
    email: `${prefix}-driver@example.invalid`,
    phone: prefix,
    password: 'password-123',
    countryCodes: ['CH'],
    marketCode: 'FR',
  });
  userIds.push(driver.user.id);
  assert.equal(driver.user.tenantId, fr.id);
  assert.equal(auth.getUserFromAccessToken(driver.accessToken).tenantId, fr.id);
  assert.deepEqual(driver.driver.countryCodes, ['CH']);
});
test('attaching a driver profile preserves an existing customer home tenant and denies a wrong market', async () => {
  const account = await user({ tenantId: fr.id });
  const input = {
    firstName: 'Driver',
    lastName: 'Test',
    nickname: 'Driver',
    email: account.email,
    phone: `${prefix}-attach`,
    password: 'password-123',
  };
  await assert.rejects(
    auth.registerDriver({ ...input, marketCode: 'CH' }),
    errorCode('TENANT_MISMATCH'),
  );
  assert.equal(
    await prisma.driverProfile.count({ where: { userId: account.id } }),
    0,
  );
  const response = await auth.registerDriver({ ...input, marketCode: 'FR' });
  assert.equal(response.user.tenantId, fr.id);
});
test('phone session refresh persists home tenant and is single-use', async () => {
  const account = await user({ tenantId: fr.id, phoneNumber: '+33600000123' });
  const response = await auth.verifyPhoneCode(
    { phoneNumber: account.phoneNumber, code: '123456', marketCode: 'FR' },
    'local',
  );
  const session = await prisma.refreshSession.findFirstOrThrow({
    where: { userId: account.id },
  });
  assert.equal(session.tenantId, fr.id);
  const next = await auth.refreshCustomerSession(response.refreshToken);
  assert.equal(next.user.tenantId, fr.id);
  await assert.rejects(
    auth.refreshCustomerSession(response.refreshToken),
    /invalid or expired/,
  );
});
test('FK and uniqueness constraints reject unknown ownership and duplicate tenant countries', async () => {
  await assert.rejects(
    user({ tenantId: 'unknown-tenant' }),
    (error) => error.code === 'P2003',
  );
  await assert.rejects(
    prisma.tenant.create({
      data: { ...plan.tenants[0], code: `${prefix.toUpperCase()}` },
    }),
    (error) => error.code === 'P2002',
  );
});
test('strict enforcement leaves global admin access intact and rejects unassigned customers', async () => {
  process.env.TENANT_AUTH_REQUIRED = 'true';
  try {
    const admin = await user({ role: 'ADMIN' });
    assert.equal(
      (await auth.loginAdmin({ email: admin.email, password: 'password-123' }))
        .user.role,
      'ADMIN',
    );
    const account = await user();
    await assert.rejects(
      auth.login({
        email: account.email,
        password: 'password-123',
        marketCode: 'CH',
      }),
      errorCode('TENANT_ASSIGNMENT_REQUIRED'),
    );
    await assert.rejects(
      auth.login({ email: account.email, password: 'password-123' }),
      errorCode('MARKET_REQUIRED'),
    );
  } finally {
    delete process.env.TENANT_AUTH_REQUIRED;
  }
});

for (const role of ['CUSTOMER', 'DRIVER']) {
  test(`legacy ${role} HTTP login and session survive explicit backfill without a market payload`, async () => {
    const isDriver = role === 'DRIVER';
    const account = await user({
      role,
      email: `${randomUUID()}@example.invalid`,
      phoneNumber: isDriver ? '+33600000402' : '+33600000401',
      ...(isDriver
        ? {
            driverProfile: {
              create: {
                firstName: 'Legacy',
                lastName: 'Driver',
                phone: '+33600000402',
                status: 'APPROVED',
                isProfileCompleted: true,
              },
            },
          }
        : {}),
    });
    const base = isDriver ? '/auth/driver' : '/auth';
    const password = await http(app.getHttpServer())
      .post(`${base}/login`)
      .send({
        email: account.email,
        password: 'password-123',
      })
      .expect(201);
    assert.equal(password.body.user.tenantId, null);
    // Released customer decoder reads expiry from segment zero.
    assert.equal(password.body.accessToken.split('.').length, 2);
    const payload = JSON.parse(
      Buffer.from(
        password.body.accessToken.split('.')[0],
        'base64url',
      ).toString(),
    );
    assert.ok(payload.exp > Date.now() / 1000);
    const otp = await http(app.getHttpServer())
      .post(`${base}/phone/verify-code`)
      .send({
        phoneNumber: account.phoneNumber,
        code: '123456',
      })
      .expect(201);
    if (otp.body.user.id !== account.id) userIds.push(otp.body.user.id);
    assert.equal(otp.body.user.id, account.id);
    assert.equal(otp.body.user.tenantId, null);
    await applyPlan(
      prisma,
      { tenants: [], assignments: [{ userId: account.id, marketCode: 'FR' }] },
      true,
    );
    const identity = auth.getUserFromAccessToken(password.body.accessToken);
    assert.equal(await auth.isUserActive(identity), true);
    assert.equal(identity.tenantId, fr.id);
    const next = isDriver
      ? await http(app.getHttpServer())
          .post('/auth/driver/session/continue')
          .send({ accessToken: otp.body.accessToken })
          .expect(201)
      : await http(app.getHttpServer())
          .post('/auth/refresh')
          .send({ refreshToken: otp.body.refreshToken })
          .expect(201);
    assert.equal(next.body.user.tenantId, fr.id);
    assert.equal(next.body.accessToken.split('.').length, 2);
    const mismatch = await http(app.getHttpServer())
      .post(`${base}/login`)
      .send({
        email: account.email,
        password: 'password-123',
        marketCode: 'LB',
      })
      .expect(403);
    assert.equal(mismatch.body.code, 'TENANT_MISMATCH');
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: account.id } }))
        .tenantId,
      fr.id,
    );
  });
}
