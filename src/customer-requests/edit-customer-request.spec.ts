import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ValidationPipe,
} from '@nestjs/common';
import { CustomerRequestsService } from './customer-requests.service';
import { EditCustomerRequestDto } from './dto/edit-customer-request.dto';

const version = '2026-09-21T10:00:00.000Z';
const payload = (): EditCustomerRequestDto => ({
  updatedAt: version,
  serviceId: 'goods',
  retainedPhotoIds: [],
  pickupLocation: { latitude: 47, longitude: 8, address: 'New pickup' },
  dropoffLocation: { latitude: 48, longitude: 9, address: 'New dropoff' },
  isImmediate: true,
  requiresLoadingHelp: false,
  itemTitle: 'Boxes',
  goodsShipmentSize: 'S',
  goodsDescription: 'Updated goods',
  goodsApproximateWeightKg: 20,
  goodsNumberOfPieces: 2,
  goodsIsFragile: true,
  goodsRequiresRefrigeration: false,
  requiresSpecialWrapping: false,
  requiresDedicatedCarrier: false,
  furnitureNeedsHelpers: false,
  furnitureCustomerCanHelpLoading: false,
});
function setup() {
  let row: Record<string, unknown> = {
    id: 'request',
    serviceId: 'goods',
    customerId: 'customer',
    status: 'PENDING_QUOTES',
    createdAt: new Date(version),
    updatedAt: new Date(version),
    photos: [],
    submittedAt: new Date(version),
    assignedDriverId: null,
    acceptedOfferId: null,
    itemType: 'GOODS',
  };
  const serviceRow = {
    id: 'goods',
    key: 'GOODS_TRANSPORT',
    isActive: true,
    nameEn: 'Goods',
    nameAr: 'Goods',
    icon: null,
  };
  const db = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    transportRequest: {
      findUnique: jest.fn().mockImplementation(() => Promise.resolve(row)),
      count: jest.fn().mockResolvedValue(1),
      update: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          row = { ...row, ...data };
          return Promise.resolve(row);
        }),
      findUniqueOrThrow: jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve({ ...row, service: serviceRow }),
        ),
    },
    service: { findUnique: jest.fn().mockResolvedValue(serviceRow) },
    transportRequestPhoto: { deleteMany: jest.fn(), createMany: jest.fn() },
    driverProfile: { findMany: jest.fn().mockResolvedValue([]) },
    driverRequestAlert: {
      updateMany: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation(
    async (fn: (tx: typeof db) => Promise<unknown>) => {
      const before = { ...row };
      try {
        return await fn(db);
      } catch (error) {
        row = before;
        throw error;
      }
    },
  );
  const notifications = {
    notifyDriversAboutNewTransportRequest: jest
      .fn()
      .mockResolvedValue(undefined),
  };
  const gateway = {
    getDriverConnectionCount: jest.fn().mockReturnValue(1),
    emitRequestNew: jest.fn(),
  };
  const instance = new CustomerRequestsService(
    db as never,
    {} as never,
    {} as never,
    gateway as never,
    notifications as never,
  );
  Object.assign(instance, { toResponseDto: (value: unknown) => value });
  return { db, instance, notifications, gateway, row: () => row };
}

describe('editing submitted requests', () => {
  it('saves the original request atomically and synchronizes matching fields', async () => {
    const { instance, db, row } = setup();
    await instance.editCustomerRequest('customer', 'request', payload(), []);
    expect(db.$queryRaw).toHaveBeenCalled();
    expect(db.transportRequest.update.mock.calls[0][0].data).not.toHaveProperty(
      'serviceId',
    );
    expect(row()).toMatchObject({
      id: 'request',
      pickupAddress: 'New pickup',
      dropoffAddress: 'New dropoff',
      itemDescription: 'Updated goods',
      itemWeightKg: 20,
      itemCondition: 'FRAGILE',
      scheduledPickupAt: null,
    });
    expect(db.driverRequestAlert.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'EXPIRED' }),
      }),
    );
  });
  it('rejects changing service type before writing or notifying drivers', async () => {
    const { instance, db, notifications } = setup();
    await expect(
      instance.editCustomerRequest(
        'customer',
        'request',
        { ...payload(), serviceId: 'furniture' },
        [],
      ),
    ).rejects.toThrow('The service type cannot be changed');
    expect(db.transportRequest.update).not.toHaveBeenCalled();
    expect(db.service.findUnique).not.toHaveBeenCalled();
    expect(
      notifications.notifyDriversAboutNewTransportRequest,
    ).not.toHaveBeenCalled();
  });

  it('forbids another customer before any write', async () => {
    const { instance, db } = setup();
    await expect(
      instance.editCustomerRequest('other', 'request', payload(), []),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.transportRequest.update).not.toHaveBeenCalled();
  });
  it('checks offers, assignment and status while holding the request lock', async () => {
    const { instance, db, notifications } = setup();
    db.transportRequest.count.mockResolvedValue(0);
    await expect(
      instance.editCustomerRequest('customer', 'request', payload(), []),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.transportRequest.count).toHaveBeenCalledWith({
      where: {
        id: 'request',
        status: 'PENDING_QUOTES',
        assignedDriverId: null,
        acceptedOfferId: null,
        acceptedAt: null,
        offers: { none: {} },
      },
    });
    expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      db.transportRequest.count.mock.invocationCallOrder[0],
    );
    expect(db.transportRequest.update).not.toHaveBeenCalled();
    expect(
      notifications.notifyDriversAboutNewTransportRequest,
    ).not.toHaveBeenCalled();
  });
  it('allows editing after alert acceptance if no driver has sent an offer', async () => {
    const { instance, db, row } = setup();
    row().driverAlerts = [
      { status: 'ACCEPTED', acceptedAt: new Date(version) },
    ];
    await expect(
      instance.getRequestForEdit('customer', 'request'),
    ).resolves.toBeDefined();
    await instance.editCustomerRequest('customer', 'request', payload(), []);
    expect(db.transportRequest.count.mock.calls[0][0].where).not.toHaveProperty(
      'driverAlerts',
    );
    expect(db.transportRequest.update).toHaveBeenCalled();
    expect(db.driverRequestAlert.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ acceptedAt: null }),
      }),
    );
  });
  it.each(['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED'])(
    'keeps all details locked after an offer was sent, including %s offers',
    async (status) => {
      const { instance, db, row } = setup();
      row().offers = [{ status }];
      db.transportRequest.count.mockImplementation(({ where }) =>
        Promise.resolve(
          where.offers?.none && (row().offers as unknown[]).length ? 0 : 1,
        ),
      );
      await expect(
        instance.getRequestForEdit('customer', 'request'),
      ).rejects.toMatchObject({ response: { code: 'REQUEST_EDIT_LOCKED' } });
      await expect(
        instance.editCustomerRequest('customer', 'request', payload(), []),
      ).rejects.toMatchObject({ response: { code: 'REQUEST_EDIT_LOCKED' } });
      expect(db.transportRequest.update).not.toHaveBeenCalled();
      expect(db.transportRequestPhoto.deleteMany).not.toHaveBeenCalled();
    },
  );
  it('rejects an edit if an offer is committed while waiting for the request lock', async () => {
    const { instance, db } = setup();
    db.$queryRaw.mockImplementation(async () => {
      db.transportRequest.count.mockResolvedValue(0);
      return [];
    });
    await expect(
      instance.editCustomerRequest('customer', 'request', payload(), []),
    ).rejects.toMatchObject({ response: { code: 'REQUEST_EDIT_LOCKED' } });
    expect(db.transportRequest.update).not.toHaveBeenCalled();
  });
  it('rejects an old edit version without overwriting newer changes', async () => {
    const { instance, db } = setup();
    await expect(
      instance.editCustomerRequest(
        'customer',
        'request',
        { ...payload(), updatedAt: '2020-01-01T00:00:00.000Z' },
        [],
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.transportRequest.update).not.toHaveBeenCalled();
  });
  it('rejects photos belonging to another request', async () => {
    const { instance, db } = setup();
    await expect(
      instance.editCustomerRequest(
        'customer',
        'request',
        { ...payload(), retainedPhotoIds: ['foreign'] },
        [],
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.transportRequest.update).not.toHaveBeenCalled();
  });
  it('rolls back an invalid service payload without dispatching', async () => {
    const { instance, row, db, notifications } = setup();
    await expect(
      instance.editCustomerRequest(
        'customer',
        'request',
        { ...payload(), goodsDescription: '' },
        [],
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(row().pickupAddress).toBeUndefined();
    expect(db.driverRequestAlert.updateMany).not.toHaveBeenCalled();
    expect(
      notifications.notifyDriversAboutNewTransportRequest,
    ).not.toHaveBeenCalled();
  });
  it('refreshes existing matches, creates new matches, and notifies only eligible drivers after commit', async () => {
    const { instance, db, notifications, gateway } = setup();
    db.driverProfile.findMany.mockResolvedValue([
      { id: 'existing', userId: 'user1', availability: null },
      { id: 'new', userId: 'user2', availability: null },
      { id: 'ineligible', userId: 'user3', availability: null },
    ]);
    Object.assign(instance, {
      isEligibleForRealtimeDispatch: (
        _request: unknown,
        driver: { id: string },
      ) => driver.id !== 'ineligible',
    });
    db.driverRequestAlert.findMany.mockResolvedValue([
      {
        id: 'old-alert',
        driverId: 'existing',
        status: 'EXPIRED',
        createdAt: new Date(version),
      },
    ]);
    db.driverRequestAlert.update.mockResolvedValue({
      id: 'old-alert',
      driverId: 'existing',
      status: 'NEW',
      createdAt: new Date(),
    });
    db.driverRequestAlert.create.mockResolvedValue({
      id: 'new-alert',
      driverId: 'new',
      status: 'NEW',
      createdAt: new Date(),
    });
    const transaction = db.$transaction.getMockImplementation()!;
    db.$transaction.mockImplementation(async (...args: unknown[]) => {
      const result: unknown = await transaction(...args);
      expect(gateway.emitRequestNew).not.toHaveBeenCalled();
      expect(
        notifications.notifyDriversAboutNewTransportRequest,
      ).not.toHaveBeenCalled();
      return result;
    });
    await instance.editCustomerRequest('customer', 'request', payload(), []);
    expect(db.driverRequestAlert.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'NEW',
          seenAt: null,
          ignoredAt: null,
        }),
      }),
    );
    expect(gateway.emitRequestNew).toHaveBeenCalledTimes(2);
    expect(
      notifications.notifyDriversAboutNewTransportRequest,
    ).toHaveBeenCalledWith({
      updated: true,
      drivers: [
        expect.objectContaining({ userId: 'user1', requestId: 'request' }),
        expect.objectContaining({ userId: 'user2', requestId: 'request' }),
      ],
    });
  });
  it('does not expose an editable form after an offer', async () => {
    const { instance, db } = setup();
    db.transportRequest.count.mockResolvedValue(0);
    await expect(
      instance.getRequestForEdit('customer', 'request'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('edit request input validation', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const validate = (value: unknown) =>
    pipe.transform(value, { type: 'body', metatype: EditCustomerRequestDto });
  it('accepts optional cleared values and full edit details', async () => {
    await expect(
      validate({
        ...payload(),
        itemYear: null,
        vehicleVin: null,
        scheduledPickupAt: null,
      }),
    ).resolves.toBeInstanceOf(EditCustomerRequestDto);
  });
  it.each([
    { assignedDriverId: 'driver' },
    { status: 'DRAFT' },
    { finalPrice: 1 },
    { pickupLocation: { latitude: 91, longitude: 8 } },
    { goodsNumberOfPieces: 1.5 },
    { vehicleManufactureYear: 2020.5 },
    { loadingWorkersCount: 1.5 },
    { retainedPhotoIds: ['duplicate', 'duplicate'] },
    { pickupLocation: null },
  ])('rejects unsafe or invalid input: %j', async (extra) => {
    await expect(validate({ ...payload(), ...extra })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
