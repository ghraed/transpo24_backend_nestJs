import { ServiceKey } from '@prisma/client';
import { RoutePolicyService } from './route-policy.service';

describe('RoutePolicyService', () => {
  const db = { routeBlock: { findFirst: jest.fn() } };
  const service = new RoutePolicyService(db as never);
  const route = {
    fromCountryCode: ' fr ',
    toCountryCode: 'ch',
    transportType: ServiceKey.FURNITURE_TRANSPORT,
  };
  beforeEach(() => {
    jest.clearAllMocks();
    db.routeBlock.findFirst.mockResolvedValue(null);
  });
  it('normalizes ISO codes and checks active all-type or exact-type blocks in one lookup', async () => {
    await expect(service.isBlocked(route)).resolves.toBe(false);
    expect(db.routeBlock.findFirst).toHaveBeenCalledWith({
      where: {
        fromCountryCode: 'FR',
        toCountryCode: 'CH',
        isActive: true,
        OR: [
          { transportType: null },
          { transportType: ServiceKey.FURNITURE_TRANSPORT },
        ],
      },
      select: { id: true },
    });
  });
  it('rejects a matching block without exposing its reason', async () => {
    db.routeBlock.findFirst.mockResolvedValue({
      id: 'block',
      reason: 'internal',
    });
    await expect(service.assertAllowed(route)).rejects.toMatchObject({
      response: {
        code: 'ROUTE_BLOCKED',
        message: 'Transport on this route is currently unavailable.',
      },
    });
  });
  it('reads policy again after activation and deactivation', async () => {
    db.routeBlock.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'block' })
      .mockResolvedValueOnce(null);
    await expect(service.isBlocked(route)).resolves.toBe(false);
    await expect(service.isBlocked(route)).resolves.toBe(true);
    await expect(service.isBlocked(route)).resolves.toBe(false);
  });
  it.each([null, '', 'ZZ', 'France'])(
    'rejects unresolved/invalid country %s before lookup',
    async (fromCountryCode) => {
      await expect(
        service.isBlocked({ ...route, fromCountryCode }),
      ).rejects.toMatchObject({
        response: { code: 'REQUEST_COUNTRY_UNRESOLVED' },
      });
      expect(db.routeBlock.findFirst).not.toHaveBeenCalled();
    },
  );
  it('fails closed on database errors', async () => {
    db.routeBlock.findFirst.mockRejectedValue(
      new Error('database unavailable'),
    );
    await expect(service.assertAllowed(route)).rejects.toThrow(
      'database unavailable',
    );
  });
});
