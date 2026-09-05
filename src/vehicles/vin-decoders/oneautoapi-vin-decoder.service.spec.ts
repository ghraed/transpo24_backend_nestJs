import { ServiceUnavailableException } from '@nestjs/common';

import { OneAutoApiVinDecoder } from './oneautoapi-vin-decoder.service';

describe('OneAutoApiVinDecoder', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.ONEAUTOAPI_API_KEY = 'oneauto-test-key';
    process.env.ONEAUTOAPI_API_URL =
      'https://api.oneautoapi.com/oneauto/vindecodebasic/us/v2';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    delete process.env.ONEAUTOAPI_API_KEY;
    delete process.env.ONEAUTOAPI_API_URL;
    delete process.env.ONEAUTOAPI_TIMEOUT_MS;
  });

  it('maps the documented basic VIN response into the shared DTO', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        result: {
          vehicle_data: {
            vehicle_identification_number: 'WP1AG2A55HLB12345',
            model_year: 2017,
            manufacturer_desc: 'Porsche',
            model_range_desc: 'Macan',
            trim_desc: 'GTS',
            body_type_desc: 'SUV',
            vehicle_type: 'Truck',
            transmission_desc: 'Automatic',
            drivetrain_desc: '4WD',
            engine_badged_size_litres: 3,
            number_cylinders: 6,
            fuel_type_desc: 'Premium Unleaded',
            number_doors: 5,
          },
        },
      }),
    });
    global.fetch = fetchMock as typeof global.fetch;

    await expect(
      new OneAutoApiVinDecoder().decode('WP1AG2A55HLB12345'),
    ).resolves.toEqual({
      kind: 'found',
      data: {
        vin: 'WP1AG2A55HLB12345',
        make: 'Porsche',
        model: 'Macan',
        year: '2017',
        trim: 'GTS',
        variant: 'GTS',
        vehicleType: 'Truck',
        bodyClass: 'SUV',
        manufacturer: 'Porsche',
        plantCountry: null,
        engineCylinders: '6',
        displacementL: '3',
        fuelTypePrimary: 'Premium Unleaded',
        transmissionStyle: 'Automatic',
        driveType: '4WD',
        doors: '5',
        series: 'GTS',
        estimatedWeightKg: null,
        grossWeightKg: null,
        payloadKg: null,
        enginePowerKw: null,
        enginePowerHp: null,
        engineTorqueNm: null,
        lengthMm: null,
        widthMm: null,
        heightMm: null,
        wheelbaseMm: null,
        seats: null,
        maxSpeedKmh: null,
        brakedTowingKg: null,
        unbrakedTowingKg: null,
        co2CombinedGKm: null,
        fuelConsumptionCombinedL100Km: null,
        euroStandard: null,
        color: null,
        source: 'oneautoapi',
      },
    });
    const requestedUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestedUrl.searchParams.get('vehicle_identification_number')).toBe(
      'WP1AG2A55HLB12345',
    );
    expect(fetchMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        headers: { 'x-api-key': 'oneauto-test-key' },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('returns not-found for empty and explicit no-result responses', async () => {
    const decoder = new OneAutoApiVinDecoder();
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, result: {} }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: false, error: 'Vehicle not found' }),
      }) as typeof global.fetch;

    await expect(decoder.decode('1HGCM82633A004352')).resolves.toEqual({
      kind: 'not-found',
    });
    await expect(decoder.decode('1HGCM82633A004352')).resolves.toEqual({
      kind: 'not-found',
    });
  });

  it('returns a controlled error for a technical failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
    }) as typeof global.fetch;

    await expect(
      new OneAutoApiVinDecoder().decode('1HGCM82633A004352'),
    ).rejects.toThrow(
      'Fallback VIN decoding service is temporarily unavailable.',
    );
  });

  it('fails safely when configuration is missing or invalid', () => {
    const decoder = new OneAutoApiVinDecoder();
    delete process.env.ONEAUTOAPI_API_KEY;
    expect(() => decoder.assertConfigured()).toThrow(
      ServiceUnavailableException,
    );

    process.env.ONEAUTOAPI_API_KEY = 'test-key';
    process.env.ONEAUTOAPI_API_URL = 'http://insecure.example.test';
    expect(() => decoder.assertConfigured()).toThrow(
      ServiceUnavailableException,
    );
  });
});
