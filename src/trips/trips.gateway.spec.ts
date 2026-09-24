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
      role: UserRole.CUSTOMER as UserRole,
      hasDriverProfile: false,
      tenantId: 'fr',
    };
    const auth = {
      getUserFromAccessToken: jest.fn().mockReturnValue(user),
      isUserActive: jest.fn().mockResolvedValue(true),
    };
    const prisma = {
      driverProfile: {
        findUnique: jest.fn().mockResolvedValue({ id: 'profile-id' }),
      },
    };
    const gateway = new TripsGateway(
      auth as never,
      {} as never,
      {} as never,
      prisma as never,
    );
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
    return { gateway, auth, socket, user, connect, prisma };
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
  it('joins the server-resolved driver profile room, not the account or supplied room', async () => {
    const { user, socket, connect, prisma } = setup();
    user.role = UserRole.DRIVER;
    await connect();
    expect(prisma.driverProfile.findUnique).toHaveBeenCalledWith({
      where: { userId: 'customer' },
      select: { id: true },
    });
    expect(socket.join).toHaveBeenCalledTimes(1);
    expect(socket.join).toHaveBeenCalledWith('driver_profile-id');
  });
  it('rejects a driver without a server profile', async () => {
    const { user, socket, connect, prisma } = setup();
    user.role = UserRole.DRIVER;
    prisma.driverProfile.findUnique.mockResolvedValue(null);
    await expect(connect()).rejects.toThrow('Unauthorized socket connection.');
    expect(socket.join).not.toHaveBeenCalled();
  });
  it('revalidates a reconnect and does not restore revoked rooms', async () => {
    const { auth, socket, connect } = setup();
    await connect();
    socket.join.mockClear();
    auth.isUserActive.mockResolvedValue(false);
    await expect(connect()).rejects.toThrow();
    expect(socket.join).not.toHaveBeenCalled();
  });
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

describe('candidate event delivery', () => {
  it('targets only the authorized driver profile and suppresses stale or failed authorization', async () => {
    const matching = { canNotify: jest.fn().mockResolvedValue(true) };
    const gateway = new TripsGateway(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      matching as never,
    );
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    gateway.server = { to } as unknown as Server;
    const payload = { requestId: 'swiss-request' } as never;
    await gateway.emitRequestNew('french-profile', payload);
    expect(matching.canNotify).toHaveBeenCalledWith(
      'swiss-request',
      'french-profile',
    );
    expect(to).toHaveBeenCalledWith('driver_french-profile');
    expect(emit).toHaveBeenCalledWith('requestNew', payload);
    matching.canNotify.mockResolvedValue(false);
    await gateway.emitRequestNew('unrelated-profile', payload);
    matching.canNotify.mockRejectedValue(new Error('Database unavailable'));
    await gateway.emitRequestNew('french-profile', payload);
    expect(emit).toHaveBeenCalledTimes(1);
  });
  it('denies arbitrary trip/chat joins before subscribing', async () => {
    const denied = jest.fn().mockRejectedValue(new Error('Access denied'));
    const gateway = new TripsGateway(
      {} as never,
      { joinTripRoom: denied } as never,
      { assertCanAccessRoom: denied } as never,
      {} as never,
    );
    const socket = {
      data: { user: { id: 'account', role: UserRole.DRIVER } },
      join: jest.fn(),
    };
    await expect(
      gateway.joinTripRoom(socket as never, { tripId: 'foreign-job' }),
    ).rejects.toThrow('Access denied');
    await expect(
      gateway.joinChatRoom(socket as never, { roomId: 'foreign-chat' }),
    ).rejects.toThrow('Access denied');
    expect(socket.join).not.toHaveBeenCalled();
    expect(denied).toHaveBeenCalledWith({
      userId: 'account',
      role: UserRole.DRIVER,
      tripId: 'foreign-job',
    });
  });
  it('preserves participant targets for offer and selection events', () => {
    const gateway = new TripsGateway(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const deliveries: unknown[] = [];
    gateway.server = {
      to: (room: string) => ({
        emit: (event: string, payload: unknown) =>
          deliveries.push({ room, event, payload }),
      }),
    } as unknown as Server;
    const offer = { driverId: 'profile', requestId: 'job' } as never;
    gateway.emitOfferNew('owner', offer);
    gateway.emitOfferRejected(offer);
    gateway.emitRequestDriverSelected('owner', offer);
    expect(deliveries).toEqual([
      { room: 'customer_owner', event: 'offerNew', payload: offer },
      { room: 'driver_profile', event: 'offerRejected', payload: offer },
      {
        room: 'customer_owner',
        event: 'requestDriverSelected',
        payload: offer,
      },
    ]);
  });
});
