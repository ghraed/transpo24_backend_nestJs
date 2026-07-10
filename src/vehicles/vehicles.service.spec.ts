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
    delete process.env.NHTSA_VPIC_BASE_URL;
    delete process.env.NHTSA_VPIC_TIMEOUT_MS;
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

  it('normalizes a successful NHTSA DecodeVinValuesExtended response', async () => {
    const service = createService();
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        Count: 1,
        Results: [
          {
            VIN: '1HGCM82633A004352',
            Make: 'HONDA',
            Model: 'Accord',
            ModelYear: '2003',
            Trim: 'EX',
            VehicleType: 'PASSENGER CAR',
            BodyClass: 'Sedan/Saloon',
            Manufacturer: 'HONDA OF AMERICA MFG., INC.',
            PlantCountry: 'UNITED STATES (USA)',
            EngineCylinders: '4',
            DisplacementL: '2.4',
            FuelTypePrimary: 'Gasoline',
            TransmissionStyle: 'Automatic',
            DriveType: '4x2',
            Doors: '4',
            Series: 'CM5',
            ErrorCode: '0',
            ErrorText: '0 - VIN decoded clean. Check Digit (9th position) is correct',
            CurbWeightPounds: '3200',
          },
        ],
      }),
    });
    global.fetch = fetchMock as typeof global.fetch;

    const result = await service.decodeVin('1hgcm82633a004352');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/1HGCM82633A004352?format=json',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result).toEqual({
      success: true,
      source: 'NHTSA_VPIC',
      requiresManualSelection: false,
      message: undefined,
      data: {
        vin: '1HGCM82633A004352',
        brand: 'HONDA',
        model: 'Accord',
        series: 'CM5',
        variant: 'EX',
        manufactureYear: 2003,
        estimatedWeightKg: 1451,
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
        errorCode: '0',
        errorText:
          '0 - VIN decoded clean. Check Digit (9th position) is correct',
        source: 'NHTSA_VPIC',
      },
    });
  });

  it('returns the existing controlled fallback when NHTSA has no useful vehicle details', async () => {
    const service = createService();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        Count: 1,
        Results: [{ VIN: '1HGCM82633A004352', ErrorCode: '1', ErrorText: 'Invalid VIN' }],
      }),
    }) as typeof global.fetch;

    await expect(service.decodeVin('1HGCM82633A004352')).resolves.toEqual({
      success: false,
      source: 'NHTSA_VPIC',
      requiresManualSelection: true,
      message:
        'Vehicle details could not be fetched from the VIN. Please select vehicle details manually.',
      data: null,
    });
  });

  it('throws ServiceUnavailableException when the provider is unavailable', async () => {
    const service = createService();
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
    }) as typeof global.fetch;

    await expect(service.decodeVin('1HGCM82633A004352')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
