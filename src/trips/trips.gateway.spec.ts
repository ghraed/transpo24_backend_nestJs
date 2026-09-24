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

describe('socket tenant identity', () => {
  function setup() {
    const user = {
      id: 'customer',
      name: 'Customer',
      email: 'customer@example.com',
      role: UserRole.CUSTOMER,
      hasDriverProfile: false,
      tenantId: 'fr',
    };
    const auth = {
      getUserFromAccessToken: jest.fn().mockReturnValue(user),
      isUserActive: jest.fn().mockResolvedValue(true),
    };
    const gateway = new TripsGateway(auth as never, {} as never, {} as never);
    const socket = {
      id: 'socket',
      handshake: {
        auth: {
          token: 'signed-token',
          tenantId: 'lb',
          userId: 'victim',
          room: 'customer_victim',
        },
        headers: {},
      },
      data: {},
      join: jest.fn(),
      disconnect: jest.fn(),
    };
    let middleware!: (socket: Socket, next: (error?: Error) => void) => void;
    gateway.afterInit({
      use: (handler: typeof middleware) => {
        middleware = handler;
      },
    } as unknown as Server);
    const connect = () =>
      new Promise<void>((resolve, reject) =>
        middleware(socket as unknown as Socket, (error) => {
          if (error) reject(error);
          else {
            gateway.handleConnection(socket as unknown as Socket);
            resolve();
          }
        }),
      );
    return { gateway, auth, socket, user, connect };
  }
  it('uses the DB-verified identity and ignores handshake room/tenant spoofing', async () => {
    const { auth, socket, user, connect } = setup();
    await connect();
    expect(auth.isUserActive).toHaveBeenCalledWith(user);
    expect(socket.join).toHaveBeenCalledWith('customer_customer');
    expect(socket.data).toEqual({ user });
  });
  it.each(['deleted', 'inactive-tenant', 'mismatch'])(
    'rejects %s before acknowledging a connection or joining any room',
    async (reason) => {
      const { auth, socket, connect } = setup();
      if (reason === 'deleted') auth.isUserActive.mockResolvedValue(false);
      else auth.isUserActive.mockRejectedValue(new Error(reason));
      await expect(connect()).rejects.toThrow(
        'Unauthorized socket connection.',
      );
      expect(socket.join).not.toHaveBeenCalled();
      expect(socket.data).not.toHaveProperty('user');
    },
  );
  it('waits for the database check before acknowledging the connection', async () => {
    const { auth, socket, connect } = setup();
    let approve!: (value: boolean) => void;
    auth.isUserActive.mockImplementation(
      () =>
        new Promise((resolve) => {
          approve = resolve;
        }),
    );
    const pending = connect();
    expect(socket.data).not.toHaveProperty('user');
    expect(socket.join).not.toHaveBeenCalled();
    approve(true);
    await pending;
    expect(socket.join).toHaveBeenCalledWith('customer_customer');
  });
});
