import { DriverStatus, UserRole } from '@prisma/client';
import { assertDriverApproved } from './driver-approval';
import { DriverService } from '../driver/driver.service';
import { ChatService } from '../chat/chat.service';
import { TripsService } from '../trips/trips.service';
import { AuthController } from './auth.controller';
import { ApprovedDriverGuard } from './guards/approved-driver.guard';
import { AuthService } from './auth.service';
import type { ExecutionContext } from '@nestjs/common';

const unapproved = [
  'PENDING_PROFILE',
  'PENDING_DOCUMENTS',
  'PENDING_REVIEW',
  'SUSPENDED',
  'REJECTED',
] as const;
describe('browse-only driver access', () => {
  it.each(unapproved)(
    'blocks %s drivers even with completed profiles',
    (status) => {
      expect(() =>
        assertDriverApproved({ status, isProfileCompleted: true }),
      ).toThrow('admin approval');
    },
  );
  it('fails closed for missing or incomplete profiles and allows approved completed profiles', () => {
    expect(() => assertDriverApproved(null)).toThrow();
    expect(() =>
      assertDriverApproved({ status: 'APPROVED', isProfileCompleted: false }),
    ).toThrow();
    expect(() =>
      assertDriverApproved({ status: 'APPROVED', isProfileCompleted: true }),
    ).not.toThrow();
  });
  it.each(unapproved)(
    'returns an empty browse state for %s without querying client requests',
    async (status) => {
      const findUnique = jest.fn().mockResolvedValue({
        driverProfile: { id: 'driver', status, isProfileCompleted: true },
      });
      const findMany = jest.fn();
      const service = new DriverService(
        { user: { findUnique }, transportRequest: { findMany } } as never,
        {} as never,
        {} as never,
      );
      expect(await service.getDriverRequestAlerts({ userId: 'user' })).toEqual({
        alerts: [],
        locationReference: 'NONE',
      });
      expect(findMany).not.toHaveBeenCalled();
    },
  );
  it.each(unapproved)(
    'rejects offers and chat messages for %s before any client mutation',
    async (status) => {
      const findUnique = jest.fn().mockResolvedValue({
        driverProfile: { id: 'driver', status, isProfileCompleted: true },
      });
      const create = jest.fn();
      const service = new DriverService(
        { user: { findUnique }, driverOffer: { create } } as never,
        {} as never,
        {} as never,
      );
      await expect(
        service.sendDriverPriceOffer({
          userId: 'user',
          requestId: 'request',
          requestVersion: 'version',
          price: 50,
          currency: 'USD',
        }),
      ).rejects.toThrow('admin approval');
      expect(create).not.toHaveBeenCalled();
      const chatRoomLookup = jest.fn().mockResolvedValue({});
      const chat = new ChatService(
        {
          driverProfile: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'driver',
              status,
              isProfileCompleted: true,
            }),
          },
          chatRoom: { findUnique: chatRoomLookup },
          chatMessage: { create },
        } as never,
        {} as never,
      );
      await expect(
        chat.sendTextMessage({
          user: { id: 'user', role: UserRole.DRIVER } as never,
          roomId: 'room',
          body: 'Hello',
        }),
      ).rejects.toThrow('admin approval');
      expect(create).not.toHaveBeenCalled();
    },
  );
  it('rejects socket trip access for an unapproved driver', async () => {
    const tripLookup = jest.fn();
    const service = new TripsService(
      {
        driverProfile: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'driver',
            status: DriverStatus.PENDING_REVIEW,
            isProfileCompleted: true,
          }),
        },
        transportRequest: { findUnique: tripLookup },
      } as never,
      {} as never,
    );
    await expect(
      service.validateDriverCanAccessTrip('user', 'trip'),
    ).rejects.toThrow('admin approval');
    expect(tripLookup).not.toHaveBeenCalled();
  });
  it('blocks email driver registration and login endpoints', () => {
    const service = { registerDriver: jest.fn(), loginDriver: jest.fn() };
    const controller = new AuthController(service as never);
    expect(() => controller.registerDriver()).toThrow('phone verification');
    expect(() => controller.loginDriver()).toThrow('phone verification');
    expect(service.registerDriver).not.toHaveBeenCalled();
    expect(service.loginDriver).not.toHaveBeenCalled();
  });
  it('checks current database approval on every guarded interaction', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValue({ status: 'APPROVED', isProfileCompleted: true });
    const service = new AuthService(
      { driverProfile: { findUnique } } as never,
      {} as never,
      {} as never,
    );
    const guard = new ApprovedDriverGuard(service);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: 'user', role: UserRole.DRIVER } }),
      }),
    } as ExecutionContext;
    await expect(guard.canActivate(context)).resolves.toBe(true);
    findUnique.mockResolvedValue({
      status: 'PENDING_REVIEW',
      isProfileCompleted: true,
    });
    await expect(guard.canActivate(context)).rejects.toThrow('admin approval');
  });
});
