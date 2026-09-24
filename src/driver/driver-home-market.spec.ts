import { DriverStatus, UserRole } from '@prisma/client';
import { DriverService } from './driver.service';

it('reloads home tenant from the database independently of driver location preferences', async () => {
  const tenant = { id: 'tenant-fr', code: 'FR', name: 'France', countryCode: 'FR', defaultCurrency: 'EUR', timezone: 'Europe/Paris', defaultLocale: 'fr', isActive: true };
  const findUnique = jest.fn().mockResolvedValue({
    id: 'user', email: 'driver@example.com', role: UserRole.DRIVER, tenantId: tenant.id, tenant,
    driverProfile: {
      id: 'driver', userId: 'user', countryCode: 'CH', countryCodes: ['CH'], cities: [], coverageAreas: [],
      status: DriverStatus.PENDING_PROFILE, isProfileCompleted: false,
      createdAt: new Date(), updatedAt: new Date(),
    },
  });
  const service = new DriverService({ user: { findUnique }, driverAvailability: { findUnique: jest.fn().mockResolvedValue(null) } } as never, {} as never, {} as never);
  const response = await service.getMe({ userId: 'user' });
  expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ tenantId: true, tenant: true }) }));
  expect(response.user.tenantId).toBe('tenant-fr');
  expect(response.user.tenant).toEqual({ id: tenant.id, code: 'FR', name: 'France', countryCode: 'FR', defaultCurrency: 'EUR', timezone: 'Europe/Paris', defaultLocale: 'fr' });
  expect(response.driver.countryCode).toBe('CH');
});
