import { DriverService } from './driver.service';
import { CustomerRequestsService } from '../customer-requests/customer-requests.service';

describe('driver nicknames', () => {
  function harness() {
    const prisma = {
      driverProfile: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      user: { findUnique: jest.fn() },
    };
    const service = new DriverService(
      prisma as never,
      {} as never,
      {} as never,
    );
    return { prisma, service };
  }

  it('rejects blank, short, long and multiline nicknames before writing', async () => {
    const { prisma, service } = harness();
    for (const nickname of ['', '  ', 'a', 'x'.repeat(41), 'ab\ncd']) {
      await expect(
        service.updateNickname('driver-user', nickname),
      ).rejects.toThrow('Nickname');
    }
    expect(prisma.driverProfile.updateMany).not.toHaveBeenCalled();
  });

  it('updates only the nickname, leaving approval and legal identity unchanged', async () => {
    const { prisma, service } = harness();
    const response = {
      driver: {
        nickname: 'Night Rider',
        status: 'APPROVED',
        firstName: 'Private',
        lastName: 'Name',
      },
    };
    jest.spyOn(service, 'getMe').mockResolvedValue(response as never);
    expect(await service.updateNickname('driver-user', '  Night Rider  ')).toBe(
      response,
    );
    expect(prisma.driverProfile.updateMany).toHaveBeenCalledWith({
      where: { userId: 'driver-user', user: { deletedAt: null } },
      data: { nickname: 'Night Rider' },
    });
  });

  it('requires a nickname when completing a new driver profile', async () => {
    const { prisma, service } = harness();
    prisma.user.findUnique.mockResolvedValue({
      driverProfile: { nickname: null },
    });
    await expect(
      service.updateProfile({
        userId: 'driver-user',
        nickname: '',
        firstName: 'Private',
        lastName: 'Name',
        phone: '+96170123456',
      }),
    ).rejects.toThrow('Nickname');
  });

  it('shows only the nickname in client offers, with a neutral legacy fallback', () => {
    const service = new CustomerRequestsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const mapper = service as unknown as {
      toCustomerRequestOfferSummary: (offer: unknown) => { driverName: string };
    };
    const offer = {
      createdAt: new Date(),
      driver: {
        nickname: 'Night Rider',
        firstName: 'Private',
        lastName: 'Name',
        vehicles: [],
        averageRating: null,
      },
    };
    const result = mapper.toCustomerRequestOfferSummary(offer);
    expect(result.driverName).toBe('Night Rider');
    expect(JSON.stringify(result)).not.toContain('Private');
    expect(
      mapper.toCustomerRequestOfferSummary({
        ...offer,
        driver: { ...offer.driver, nickname: null },
      }).driverName,
    ).toBe('Driver');
  });
});
