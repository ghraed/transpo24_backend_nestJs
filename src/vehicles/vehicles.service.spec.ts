import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { VehiclesService } from './vehicles.service';

describe('VehiclesService', () => {
  const originalFetch = global.fetch;

  const createService = () =>
    new VehiclesService({
      vehicleBrand: { findFirst: jest.fn() },
      vehicleModel: { findFirst: jest.fn() },
      vehicleSeries: { findFirst: jest.fn() },
    } as never);

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    delete process.env.VEHICLE_DATABASES_API_KEY;
    delete process.env.VEHICLE_DATABASES_BASE_URL;
    delete process.env.VEHICLE_DATABASES_TIMEOUT_MS;
  });

  it('rejects VINs that are not exactly 17 characters', async () => {
    const service = createService();

    await expect(service.decodeVin('abc123')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects VINs containing I, O, or Q', async () => {
    const service = createService();

    await expect(service.decodeVin('1HGCM82633A00435I')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('normalizes a successful Vehicle Databases basic VIN decode response', async () => {
    const service = createService();
    process.env.VEHICLE_DATABASES_API_KEY = 'test-key';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'success',
        data: {
          intro: { vin: '1HGCM82633A004352' },
          basic: {
            make: 'HONDA',
            model: 'Accord',
            year: '2003',
            trim: 'EX',
            vehicle_type: 'PASSENGER CAR',
            body_type: 'Sedan/Saloon',
            doors: '4',
          },
          engine: {
            cylinders: '4',
            engine_size: '2.4',
          },
          manufacturer: {
            manufacturer: 'HONDA OF AMERICA MFG., INC.',
            country: 'UNITED STATES (USA)',
          },
          transmission: {
            transmission_style: 'Automatic',
          },
          drivetrain: {
            drive_type: '4x2',
          },
          fuel: {
            fuel_type: 'Gasoline',
          },
          dimensions: {
            gvwr: 'Class 1C: 4,001 - 5,000 lb (1,814 - 2,268 kg)',
          },
        },
      }),
    });
    global.fetch = fetchMock as typeof global.fetch;

    const result = await service.decodeVin('1hgcm82633a004352');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.vehicledatabases.com/vin-decode/1HGCM82633A004352',
      expect.objectContaining({
        headers: { 'x-authkey': 'test-key' },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(result).toEqual({
      success: true,
      source: 'VEHICLE_DATABASES',
      requiresManualSelection: false,
      message: undefined,
      data: {
        vin: '1HGCM82633A004352',
        brand: 'HONDA',
        model: 'Accord',
        variant: 'EX',
        series: 'EX',
        manufactureYear: 2003,
        estimatedWeightKg: 2268,
        bodyType: 'Sedan/Saloon',
        make: 'HONDA',
        year: '2003',
        trim: 'EX',
        vehicleType: 'PASSENGER CAR',
        bodyClass: 'Sedan/Saloon',
        manufacturer: 'HONDA OF AMERICA MFG., INC.',
        plantCountry: 'UNITED STATES (USA)',
        engineCylinders: '4',
        displacementL: '2.4',
        fuelTypePrimary: 'Gasoline',
        transmissionStyle: 'Automatic',
        driveType: '4x2',
        doors: '4',
        errorCode: null,
        errorText: null,
        source: 'VEHICLE_DATABASES',
      },
    });
  });

  it('returns the existing controlled fallback when Vehicle Databases has no useful vehicle details', async () => {
    const service = createService();
    process.env.VEHICLE_DATABASES_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'error',
        code: 400,
        message: 'Record(s) were not found for this vehicle.',
        data: null,
      }),
    }) as typeof global.fetch;

    await expect(service.decodeVin('1HGCM82633A004352')).resolves.toEqual({
      success: false,
      source: 'VEHICLE_DATABASES',
      requiresManualSelection: true,
      message:
        'Vehicle details could not be fetched from the VIN. Please select vehicle details manually.',
      data: null,
    });
  });

  it('throws ServiceUnavailableException when the provider is unavailable', async () => {
    const service = createService();
    process.env.VEHICLE_DATABASES_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
    }) as typeof global.fetch;

    await expect(service.decodeVin('1HGCM82633A004352')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('throws ServiceUnavailableException when the Vehicle Databases API key is missing', async () => {
    const service = createService();

    await expect(service.decodeVin('1HGCM82633A004352')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
