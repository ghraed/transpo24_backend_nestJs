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
        trim: 'EAE500MA',
        variant: '31EU',
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
              type: 'T5RFJ',
              variant: '3CRFJC',
              version: 'Premium',
              date_of_manufacture: '2006-04-12',
              vin_prefix: 'VF33CRFJC........',
              vehicle_category_label: 'Passenger car',
            },
            manufacturer: { name: 'Peugeot SA', country: 'France' },
            engine: {
              cylinders: 4,
              displacement_cc: 1997,
              power_kw: 103,
              power_hp: 140,
              max_torque_nm: 200,
            },
            fuel: { type_label: 'Petrol' },
            dimensions: {
              length_mm: 4212,
              width_mm: 1762,
              height_mm: 1530,
              wheelbase_mm: 2608,
            },
            masses: {
              curb_weight_kg: 1421,
              gross_weight_kg: 1780,
              payload_kg: 359,
            },
            towing: { braked_kg: 1500, unbraked_kg: 680 },
            transmission: {
              gearbox_detail_label: 'Automatic 4-speed',
              drive_type_label: 'Front-wheel drive',
              max_speed_kmh: 200,
            },
            body: {
              type_label: 'Sedan',
              doors: 4,
              seats: 5,
              color_label: 'Blue',
            },
            emissions: { euro_standard_short: 'Euro 4' },
            consumption_wltp: {
              co2_combined_gkm: 184,
              fuel_combined_l100km: 7.7,
            },
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
          year: '2006',
          trim: 'Premium',
          variant: '3CRFJC',
          series: 'T5RFJ',
          vehicleType: 'Passenger car',
          bodyClass: 'Sedan',
          manufacturer: 'Peugeot SA',
          plantCountry: 'France',
          engineCylinders: '4',
          displacementL: '1.997',
          fuelTypePrimary: 'Petrol',
          transmissionStyle: 'Automatic 4-speed',
          driveType: 'Front-wheel drive',
          doors: '4',
          estimatedWeightKg: 1421,
          grossWeightKg: 1780,
          payloadKg: 359,
          enginePowerKw: 103,
          enginePowerHp: 140,
          engineTorqueNm: 200,
          lengthMm: 4212,
          widthMm: 1762,
          heightMm: 1530,
          wheelbaseMm: 2608,
          seats: 5,
          maxSpeedKmh: 200,
          brakedTowingKg: 1500,
          unbrakedTowingKg: 680,
          co2CombinedGKm: 184,
          fuelConsumptionCombinedL100Km: 7.7,
          euroStandard: 'Euro 4',
          color: 'Blue',
        }),
      }),
    );
  });

  it('rejects ambiguous manufacturer-only VIN matches', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          {
            identification: {
              make: 'FORD',
              commercial_name: 'Fiesta 1.4 16V',
              vin_prefix: 'WF0..............',
            },
          },
        ],
      }),
    }) as typeof global.fetch;

    await expect(
      new SwissCarInfoVinDecoder().decode('WF0WXXTACWKJ75955'),
    ).resolves.toEqual({ kind: 'not-found' });
  });

  it('rejects equally specific VIN masks instead of guessing a variant', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          {
            identification: {
              make: 'FORD',
              commercial_name: 'Transit Courier',
              variant: 'FIRST',
              vin_prefix: 'WF0WXXTACWK......',
            },
          },
          {
            identification: {
              make: 'FORD',
              commercial_name: 'Transit Courier',
              variant: 'SECOND',
              vin_prefix: 'WF0WXXTACWK......',
            },
          },
        ],
      }),
    }) as typeof global.fetch;

    await expect(
      new SwissCarInfoVinDecoder().decode('WF0WXXTACWKJ75955'),
    ).resolves.toEqual({ kind: 'not-found' });
  });

  it('uses a matching Swiss registration record and its first-registration year', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          {
            identification: {
              make: 'FORD',
              commercial_name: 'Transit Courier',
              type: 'JN8',
              variant: 'XWCA1WX',
              vin_prefix: 'WF0WXXTACWK......',
            },
            plate: { first_registration: '2019-12-30' },
            masses: { curb_weight_kg: 1394, gross_weight_kg: 1840 },
            body: { type_label: 'Fourgon', seats: 2 },
            engine: { displacement_cc: 1499, power_kw: 55.2 },
          },
        ],
      }),
    });
    global.fetch = fetchMock as typeof global.fetch;

    const result = await new SwissCarInfoVinDecoder().decodeRegistrationNumber(
      'WF0WXXTACWKJ75955',
      '671912676',
    );

    expect(result).toEqual(
      expect.objectContaining({
        kind: 'found',
        data: expect.objectContaining({
          make: 'FORD',
          model: 'Transit Courier',
          year: '2019',
          series: 'JN8',
          variant: 'XWCA1WX',
          estimatedWeightKg: 1394,
          grossWeightKg: 1840,
          bodyClass: 'Fourgon',
          seats: 2,
          displacementL: '1.499',
          enginePowerKw: 55.2,
        }),
      }),
    );
    const requestedUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestedUrl.searchParams.get('q')).toBe('671912676');
    expect(requestedUrl.searchParams.get('type')).toBe('matricule');
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
