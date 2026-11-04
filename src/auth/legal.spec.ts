import { AuthService } from './auth.service';
import { TERMS_VERSION, TERMS_HASH } from './legal';
import { UserRole } from '@prisma/client';

function harness() {
  const db: any = {
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    legalAcceptance: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    },
  };
  const verify = { verifyCode: jest.fn().mockResolvedValue('approved') };
  return {
    db,
    auth: new AuthService(
      db,
      verify as any,
      { assertCanVerify: async () => {} } as any,
    ),
  };
}
test.each(['verifyPhoneCode', 'verifyDriverPhoneCode'] as const)(
  '%s cannot create an identity without explicit versioned acceptance',
  async (method) => {
    const { db, auth } = harness();
    await expect(
      auth[method]({ phoneNumber: '+12025550101', code: '123456' }, 'test'),
    ).rejects.toMatchObject({
      response: { code: 'TERMS_ACCEPTANCE_REQUIRED' },
    });
    expect(db.user.create).not.toHaveBeenCalled();
  },
);
test('legacy email creation also requires consent', async () => {
  const { db, auth } = harness();
  await expect(
    auth.register({
      name: 'Test',
      email: 'test@example.invalid',
      password: 'synthetic-password',
    }),
  ).rejects.toThrow();
  expect(db.user.create).not.toHaveBeenCalled();
});
test('existing users are not grandfathered or backfilled', async () => {
  const { db, auth } = harness();
  await expect(
    auth.assertTermsAccepted(
      { id: 'user', role: UserRole.CUSTOMER } as any,
      '/customer/requests',
    ),
  ).rejects.toThrow();
  expect(db.legalAcceptance.upsert).not.toHaveBeenCalled();
  await expect(
    auth.assertTermsAccepted(
      { id: 'user', role: UserRole.CUSTOMER } as any,
      '/auth/legal',
    ),
  ).resolves.toBeUndefined();
});
test('acceptance is bound to the authenticated user, version, document hash and server clock', async () => {
  const { db, auth } = harness();
  await auth.acceptTerms('actor', TERMS_VERSION);
  expect(db.legalAcceptance.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { userId_version: { userId: 'actor', version: TERMS_VERSION } },
      create: expect.objectContaining({
        userId: 'actor',
        documentHash: TERMS_HASH,
        acceptedAt: expect.any(Date),
        method: 'AUTHENTICATED_ACCEPTANCE',
      }),
      update: {},
    }),
  );
  await expect(auth.acceptTerms('actor', 'stale-version')).rejects.toThrow();
  expect(db.legalAcceptance.upsert).toHaveBeenCalledTimes(1);
});
test.each(['completeCustomerProfile', 'updateCustomerProfile'] as const)(
  '%s rejects trimmed empty names before writing',
  async (method) => {
    const { db, auth } = harness();
    await expect(auth[method]('actor', '   ', 'CH')).rejects.toThrow('name');
    expect(db.user.updateMany).not.toHaveBeenCalled();
  },
);
