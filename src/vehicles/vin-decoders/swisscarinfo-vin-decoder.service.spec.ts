import { ServiceUnavailableException } from '@nestjs/common';

import { SwissCarInfoVinDecoder } from './swisscarinfo-vin-decoder.service';

describe('SwissCarInfoVinDecoder', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.SWISSCARINFO_API_KEY = 'swiss-test-key';
    process.env.SWISSCARINFO_API_URL = 'https://api.swisscarinfo.ch/v3/search';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    delete process.env.SWISSCARINFO_API_KEY;
    delete process.env.SWISSCARINFO_API_URL;
    delete process.env.SWISSCARINFO_TIMEOUT_MS;
  });

  it('maps the documented VIN payload into every supported app field', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          {
            make: 'BMW',
            commercial_name: 'X5 M60i xDrive',
            type: 'G5X',
            variant: '31EU',
            version: 'EAE500MA',
            vehicle_identification_number: 'WBA31EU0X0A123456',
            date_of_manufacture_veh: '09.08.2024',
            stage_manufacturer_name_and_adress: 'Bayerische Motoren Werke AG',
            number_of_cylinders: '8',
            engine_capacity: '4395',
            fuel_code_label: 'Petrol',
            gearbox_type_code_label: 'Automatic',
            code_for_bodywork_label: 'Estate',
            vehicle_category_code_label: 'Passenger car',
            number_of_doors: '4',
            mass_of_the_vehicle_in_running_order: '2420',
          },
        ],
      }),
    });
    global.fetch = fetchMock as typeof global.fetch;

    await expect(
      new SwissCarInfoVinDecoder().decode('WBA31EU0X0A123456'),
    ).resolves.toEqual({
      kind: 'found',
      data: {
        vin: 'WBA31EU0X0A123456',
        make: 'BMW',
        model: 'X5 M60i xDrive',
        year: '2024',
        trim: '31EU',
        vehicleType: 'Passenger car',
        bodyClass: 'Estate',
        manufacturer: 'Bayerische Motoren Werke AG',
        plantCountry: null,
        engineCylinders: '8',
        displacementL: '4.395',
        fuelTypePrimary: 'Petrol',
        transmissionStyle: 'Automatic',
        driveType: null,
        doors: '4',
        series: 'G5X',
        estimatedWeightKg: 2420,
        source: 'swisscarinfo',
      },
    });
    const requestedUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestedUrl.searchParams.get('q')).toBe('WBA31EU0X0A123456');
    expect(requestedUrl.searchParams.get('type')).toBe('vin');
    expect(fetchMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        headers: { 'X-API-Key': 'swiss-test-key' },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('maps the documented v3 nested identification, engine, and fuel fields', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          {
            identification: {
              make: 'PEUGEOT',
              commercial_name: '307 2.0i',
            },
            engine: { displacement_cc: 1997 },
            fuel: { type_label: 'Petrol' },
          },
        ],
      }),
    }) as typeof global.fetch;

    const result = await new SwissCarInfoVinDecoder().decode(
      'VF33CRFJC12345678',
    );
    expect(result).toEqual(
      expect.objectContaining({
        kind: 'found',
        data: expect.objectContaining({
          make: 'PEUGEOT',
          model: '307 2.0i',
          displacementL: '1.997',
          fuelTypePrimary: 'Petrol',
        }),
      }),
    );
  });

  it('returns not-found only for empty or explicit no-result responses', async () => {
    const decoder = new SwissCarInfoVinDecoder();
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: { code: 'VEHICLE_NOT_FOUND', message: 'Vehicle not found' },
        }),
      }) as typeof global.fetch;

    await expect(decoder.decode('1HGCM82633A004352')).resolves.toEqual({
      kind: 'not-found',
    });
    await expect(decoder.decode('1HGCM82633A004352')).resolves.toEqual({
      kind: 'not-found',
    });
  });

  it('treats quota and malformed-response failures as technical errors', async () => {
    const decoder = new SwissCarInfoVinDecoder();
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ foo: 'bar' }),
      }) as typeof global.fetch;

    await expect(decoder.decode('1HGCM82633A004352')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(decoder.decode('1HGCM82633A004352')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('fails safely when configuration is missing or invalid', () => {
    const decoder = new SwissCarInfoVinDecoder();
    delete process.env.SWISSCARINFO_API_KEY;
    expect(() => decoder.assertConfigured()).toThrow(
      ServiceUnavailableException,
    );

    process.env.SWISSCARINFO_API_KEY = 'test-key';
    process.env.SWISSCARINFO_API_URL = 'not-a-url';
    expect(() => decoder.assertConfigured()).toThrow(
      ServiceUnavailableException,
    );
  });
});
