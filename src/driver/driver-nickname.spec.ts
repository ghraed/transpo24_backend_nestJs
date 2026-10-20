import { Prisma } from '@prisma/client';
import { normalizeDriverBusiness } from './driver-business';
import { CustomerRequestsService } from '../customer-requests/customer-requests.service';

describe('driver business identity', () => {
  it('requires a valid TRN for companies', () => {
    for (const trn of [undefined, null, '', '   ', 'x'.repeat(101), 'ab\ncd']) {
      expect(() => normalizeDriverBusiness('COMPANY', trn)).toThrow('TRN');
    }
    expect(normalizeDriverBusiness('COMPANY', '  123456  ')).toEqual({
      driverType: 'COMPANY',
      trn: '123456',
    });
  });
  it('clears the TRN for personal accounts and rejects unknown types', () => {
    expect(normalizeDriverBusiness('PERSONAL', '123')).toEqual({
      driverType: 'PERSONAL',
      trn: null,
    });
    expect(() => normalizeDriverBusiness('OTHER')).toThrow('Choose');
  });
  it('exposes company status before payment and names after payment without exposing TRN', () => {
    const service = new CustomerRequestsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const mapper = service as unknown as {
      toCustomerRequestOfferSummary: (
        offer: unknown,
        details?: boolean,
      ) => { driverName: string | null; driverType: string };
    };
    const offer = {
      price: new Prisma.Decimal(100),
      createdAt: new Date(),
      driver: {
        firstName: 'Alex',
        lastName: 'Smith',
        nickname: 'Old nickname',
        driverType: 'COMPANY',
        trn: 'SECRET-TRN',
        vehicles: [],
        averageRating: null,
      },
    };
    expect(mapper.toCustomerRequestOfferSummary(offer)).toMatchObject({
      driverName: null,
      driverType: 'COMPANY',
    });
    const result = mapper.toCustomerRequestOfferSummary(offer, true);
    expect(result).toMatchObject({
      driverName: 'Alex Smith',
      driverType: 'COMPANY',
    });
    expect(JSON.stringify(result)).not.toContain('SECRET-TRN');
    expect(
      mapper.toCustomerRequestOfferSummary({
        ...offer,
        driver: { ...offer.driver, driverType: 'PERSONAL' },
      }).driverType,
    ).toBe('PERSONAL');
  });
});
