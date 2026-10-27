import { ValidationPipe } from '@nestjs/common';
import { UpdateDriverProfileDto } from './dto/update-driver-profile.dto';
import { UpsertDriverPersonalInfoDto } from './dto/upsert-driver-personal-info.dto';
import { CompleteCustomerProfileDto } from '../auth/dto/complete-customer-profile.dto';
import { UpdateCustomerProfileDto } from '../auth/dto/update-customer-profile.dto';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
describe('mobile profile contracts', () => {
  it.each(['PERSONAL', 'COMPANY'])(
    'accepts the complete driver profile for %s accounts',
    async (driverType) => {
      const payload = {
        firstName: 'Alex',
        lastName: 'Smith',
        phone: '+41791234567',
        driverType,
        trn: driverType === 'COMPANY' ? 'TRN-123' : '',
        fullNameOnId: 'Alex Smith',
        dateOfBirth: '1983-08-30',
        idOrResidencyNumber: 'ID123',
        addressLine1: 'Riehenring 32',
        addressLine2: '',
        postalCode: '4058',
        preferredLanguages: ['de'],
        emergencyContactName: 'Contact Person',
        emergencyContactPhone: '+41797654321',
      };
      await expect(
        pipe.transform(payload, {
          type: 'body',
          metatype: UpdateDriverProfileDto,
        }),
      ).resolves.toMatchObject(payload);
      await expect(
        pipe.transform(
          {
            driverType,
            trn: payload.trn,
            fullNameOnId: payload.fullNameOnId,
            dateOfBirth: payload.dateOfBirth,
            idOrResidencyNumber: payload.idOrResidencyNumber,
          },
          { type: 'body', metatype: UpsertDriverPersonalInfoDto },
        ),
      ).resolves.toMatchObject({ driverType });
    },
  );
  it.each([CompleteCustomerProfileDto, UpdateCustomerProfileDto])(
    'accepts a customer full name and country only',
    async (metatype) => {
      await expect(
        pipe.transform(
          { name: 'Alex Smith', countryCode: 'CH' },
          { type: 'body', metatype },
        ),
      ).resolves.toEqual({ name: 'Alex Smith', countryCode: 'CH' });
    },
  );
});
