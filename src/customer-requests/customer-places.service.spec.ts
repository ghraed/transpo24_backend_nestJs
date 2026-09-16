import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerPlacesService } from './customer-places.service';
import { SavePlaceDto } from './dto/save-place.dto';

const row = (id: string, latitude = 48) => ({
  id,
  pickupAddress: 'Home',
  pickupLatitude: latitude,
  pickupLongitude: 8,
  pickupPlaceId: 'home',
  dropoffAddress: 'Work',
  dropoffLatitude: 49,
  dropoffLongitude: 9,
  dropoffPlaceId: 'work',
});
describe('Customer places', () => {
  const db = {
    savedPlace: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    transportRequest: { findMany: jest.fn() },
  };
  const service = new CustomerPlacesService(db as unknown as PrismaService);
  beforeEach(() => jest.resetAllMocks());

  it('lists only the authenticated customer’s saved places and submitted addresses', async () => {
    db.savedPlace.findMany.mockResolvedValue([{ id: 'saved' }]);
    db.transportRequest.findMany.mockResolvedValue([row('new'), row('old')]);
    const result = await service.list('customer-a');
    expect(result.saved).toEqual([{ id: 'saved' }]);
    expect(result.recent.map((place) => place.address)).toEqual([
      'Home',
      'Work',
    ]);
    expect(db.savedPlace.findMany.mock.calls[0][0].where).toEqual({
      customerId: 'customer-a',
    });
    expect(db.transportRequest.findMany.mock.calls[0][0].where).toEqual({
      customerId: 'customer-a',
      submittedAt: { not: null },
    });
  });

  it('pages past duplicate routes and returns five unique addresses in newest-first order', async () => {
    db.transportRequest.findMany
      .mockResolvedValueOnce(
        Array.from({ length: 50 }, (_, i) => row(String(i))),
      )
      .mockResolvedValueOnce([
        row('older1', 50),
        row('older2', 51),
        row('older3', 52),
        row('older4', 53),
      ]);
    const recent = await service.recent('customer-a');
    expect(recent.map((place) => place.latitude)).toEqual([48, 49, 50, 51, 52]);
    expect(db.transportRequest.findMany.mock.calls[1][0]).toMatchObject({
      cursor: { id: '49' },
      skip: 1,
    });
  });

  it('ignores incomplete or invalid historical addresses and accepts zero coordinates', async () => {
    db.transportRequest.findMany.mockResolvedValue([
      { ...row('missing'), pickupLatitude: null, dropoffAddress: ' ' },
      { ...row('invalid'), pickupLatitude: 91, dropoffLongitude: NaN },
      {
        ...row('zero'),
        pickupLatitude: 0,
        pickupLongitude: 0,
        dropoffAddress: null,
      },
    ]);
    expect(await service.recent('customer-a')).toEqual([
      { latitude: 0, longitude: 0, address: 'Home', placeId: 'home' },
    ]);
  });

  it('upserts a location within the owner account so repeated saves rename it', async () => {
    const dto = {
      label: 'Warehouse',
      address: 'Street',
      latitude: 48,
      longitude: 8,
    };
    await service.save('customer-a', dto);
    expect(db.savedPlace.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          customerId_locationKey: {
            customerId: 'customer-a',
            locationKey: '48.000000,8.000000',
          },
        },
        create: {
          ...dto,
          customerId: 'customer-a',
          locationKey: '48.000000,8.000000',
        },
        update: { ...dto, placeId: null },
      }),
    );
  });

  it('cannot delete a place belonging to another customer', async () => {
    db.savedPlace.deleteMany.mockResolvedValue({ count: 0 });
    await expect(
      service.remove('customer-a', 'someone-elses-place'),
    ).rejects.toThrow('Saved place not found');
    expect(db.savedPlace.deleteMany).toHaveBeenCalledWith({
      where: { customerId: 'customer-a', id: 'someone-elses-place' },
    });
  });

  it('validates names, address lengths and numeric coordinate bounds', async () => {
    const valid = {
      label: ' Home ',
      address: ' Street ',
      latitude: 0,
      longitude: 0,
    };
    const dto = plainToInstance(SavePlaceDto, valid);
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.label).toBe('Home');
    for (const invalid of [
      { label: ' ' },
      { label: 'a'.repeat(81) },
      { address: '' },
      { latitude: 91 },
      { longitude: -181 },
      { latitude: '48' },
      { latitude: NaN },
    ]) {
      expect(
        (
          await validate(
            plainToInstance(SavePlaceDto, { ...valid, ...invalid }),
          )
        ).length,
      ).toBeGreaterThan(0);
    }
  });
});
