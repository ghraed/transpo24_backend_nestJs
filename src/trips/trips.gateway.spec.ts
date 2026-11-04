import { UserRole } from '@prisma/client';
import type { Server, Socket } from 'socket.io';
import { TripsGateway } from './trips.gateway';

describe('driver location acknowledgement', () => {
  const payload = {
    measuredAt: '2026-11-04T12:00:00Z',
    tripId: 'trip',
    latitude: 47.5,
    longitude: 7.6,
  };

  function setup() {
    const location = { ...payload, recordedAt: new Date().toISOString() };
    const service = {
      updateDriverLocation: jest
        .fn()
        .mockResolvedValue({ location, nearDelivery: null }),
    };
    const emit = jest.fn();
    const auth = {
      getUserFromAccessToken: jest.fn(() => ({
        id: 'driver',
        role: UserRole.DRIVER,
      })),
      isUserActive: jest.fn().mockResolvedValue(true),
      assertDriverApproved: jest.fn().mockResolvedValue(undefined),
    };
    const gateway = new TripsGateway(
      auth as never,
      service as never,
      {} as never,
    );
    gateway.server = { to: jest.fn(() => ({ emit })) } as unknown as Server;
    const socket = {
      data: { user: { id: 'driver', role: UserRole.DRIVER } },
      handshake: { auth: { token: 'token' } },
      disconnect: jest.fn(),
    } as unknown as Socket;
    return { gateway, service, emit, socket, location, auth };
  }

  it('removes driver identity and contact text from new-offer socket events', () => {
    const { gateway, emit } = setup();
    const offer = {
      id: 'offer',
      price: 100,
      driverName: 'Private Driver',
      driverVehiclePhoto: 'private-photo',
      message: 'Call +12345678',
    };
    gateway.emitOfferNew('customer', {
      requestId: 'request',
      requestStatus: 'QUOTED',
      offer,
    } as never);
    expect(emit).toHaveBeenCalledWith(
      'offerNew',
      expect.objectContaining({
        offer: expect.objectContaining({
          id: 'offer',
          price: 100,
          driverName: null,
          driverVehiclePhoto: null,
          message: null,
        }),
      }),
    );
    expect(offer.driverName).toBe('Private Driver');
  });

  it('acknowledges only after saving and emitting the existing customer update', async () => {
    const { gateway, service, emit, socket, location } = setup();
    await expect(
      gateway.driverLocationUpdate(socket, payload),
    ).resolves.toEqual({ ok: true });
    expect(service.updateDriverLocation).toHaveBeenCalledWith(
      expect.objectContaining({ driverId: 'driver', ...payload }),
    );
    expect(emit).toHaveBeenCalledWith('driverLocationUpdated', location);
  });

  it('does not acknowledge or emit a rejected update', async () => {
    const { gateway, service, emit, socket } = setup();
    service.updateDriverLocation.mockRejectedValue(
      new Error('Trip is already closed.'),
    );
    await expect(
      gateway.driverLocationUpdate(socket, payload),
    ).rejects.toThrow();
    expect(emit).not.toHaveBeenCalled();
  });

  it('keeps the existing driver authorization requirement', async () => {
    const { gateway, service } = setup();
    const socket = {
      data: { user: { id: 'customer', role: UserRole.CUSTOMER } },
    } as unknown as Socket;
    await expect(
      gateway.driverLocationUpdate(socket, payload),
    ).rejects.toThrow();
    expect(service.updateDriverLocation).not.toHaveBeenCalled();
  });
  it.each(['expired', 'deleted', 'suspended'])(
    'rejects an already connected %s actor before writing a location',
    async (reason) => {
      const { gateway, service, socket, auth } = setup();
      if (reason === 'expired')
        auth.getUserFromAccessToken.mockReturnValue(null as never);
      if (reason === 'deleted') auth.isUserActive.mockResolvedValue(false);
      if (reason === 'suspended')
        auth.assertDriverApproved.mockRejectedValue(new Error('Suspended'));
      await expect(
        gateway.driverLocationUpdate(socket, payload),
      ).rejects.toThrow();
      expect(service.updateDriverLocation).not.toHaveBeenCalled();
      expect(socket.disconnect).toHaveBeenCalled();
    },
  );
});
