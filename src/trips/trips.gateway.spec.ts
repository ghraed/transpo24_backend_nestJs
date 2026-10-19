import { UserRole } from '@prisma/client';
import type { Server, Socket } from 'socket.io';
import { TripsGateway } from './trips.gateway';

describe('driver location acknowledgement', () => {
  const payload = { tripId: 'trip', latitude: 47.5, longitude: 7.6 };

  function setup() {
    const location = { ...payload, recordedAt: new Date().toISOString() };
    const service = {
      updateDriverLocation: jest
        .fn()
        .mockResolvedValue({ location, nearDelivery: null }),
    };
    const emit = jest.fn();
    const gateway = new TripsGateway(
      {} as never,
      service as never,
      {} as never,
    );
    gateway.server = { to: jest.fn(() => ({ emit })) } as unknown as Server;
    const socket = {
      data: { user: { id: 'driver', role: UserRole.DRIVER } },
    } as unknown as Socket;
    return { gateway, service, emit, socket, location };
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
});
