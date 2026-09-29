import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDriverRatingDto } from './create-driver-rating.dto';
import { DriverLocationUpdateDto } from './driver-location-update.dto';

async function invalidProperties<T extends object>(
  type: new () => T,
  input: object,
) {
  return (await validate(plainToInstance(type, input))).map(
    (error) => error.property,
  );
}

describe('trip input validation', () => {
  it.each([1, 4.5, 5])('accepts rating %s', async (rating) => {
    expect(await invalidProperties(CreateDriverRatingDto, { rating })).toEqual(
      [],
    );
  });

  it.each([0, 5.1, 6, '5', null])(
    'rejects invalid rating %s',
    async (rating) => {
      expect(
        await invalidProperties(CreateDriverRatingDto, { rating }),
      ).toContain('rating');
    },
  );

  it('allows an optional comment but caps it at 500 characters', async () => {
    expect(
      await invalidProperties(CreateDriverRatingDto, {
        rating: 5,
        comment: 'x'.repeat(500),
      }),
    ).toEqual([]);
    expect(
      await invalidProperties(CreateDriverRatingDto, {
        rating: 5,
        comment: 'x'.repeat(501),
      }),
    ).toContain('comment');
  });

  it('accepts coordinate and heading boundaries', async () => {
    expect(
      await invalidProperties(DriverLocationUpdateDto, {
        tripId: 'trip-1',
        latitude: -90,
        longitude: 180,
        heading: 360,
        speed: 0,
        accuracy: 0,
      }),
    ).toEqual([]);
  });

  it('rejects empty trip ID and out-of-range location values', async () => {
    expect(
      await invalidProperties(DriverLocationUpdateDto, {
        tripId: '',
        latitude: 90.01,
        longitude: -180.01,
        heading: 361,
        speed: -1,
        accuracy: -1,
      }),
    ).toEqual(
      expect.arrayContaining([
        'tripId',
        'latitude',
        'longitude',
        'heading',
        'speed',
        'accuracy',
      ]),
    );
  });
});
