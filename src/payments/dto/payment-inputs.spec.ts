import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaymentMethod } from '@prisma/client';
import { CreateWalletTopUpDto } from './create-wallet-top-up.dto';
import { CreateAdditionalChargeDto } from './create-additional-charge.dto';
import { ApproveAdditionalChargeDto } from './approve-additional-charge.dto';

async function invalidProperties<T extends object>(
  type: new () => T,
  input: object,
) {
  return (await validate(plainToInstance(type, input))).map(
    (error) => error.property,
  );
}

describe('payment input validation', () => {
  it('accepts the minimum wallet top-up and supported card methods', async () => {
    expect(
      await invalidProperties(CreateWalletTopUpDto, {
        amount: '0.01',
        currency: 'USD',
        paymentMethod: PaymentMethod.CREDIT_CARD,
      }),
    ).toEqual([]);
    expect(
      await invalidProperties(CreateWalletTopUpDto, {
        amount: 10,
        currency: 'USD',
        paymentMethod: PaymentMethod.APPLE_PAY,
      }),
    ).toEqual([]);
  });

  it.each(['0', '-1', '', 'not-a-number', null])(
    'rejects invalid top-up amount %s',
    async (amount) => {
      expect(
        await invalidProperties(CreateWalletTopUpDto, {
          amount,
          currency: 'USD',
          paymentMethod: PaymentMethod.DEBIT_CARD,
        }),
      ).toContain('amount');
    },
  );

  it('rejects wallet payment, missing currency, and unsupported methods', async () => {
    expect(
      await invalidProperties(CreateWalletTopUpDto, {
        amount: 1,
        currency: 'USD',
        paymentMethod: PaymentMethod.APP_WALLET,
      }),
    ).toContain('paymentMethod');
    expect(
      await invalidProperties(CreateWalletTopUpDto, {
        amount: 1,
        paymentMethod: 'CASH',
      }),
    ).toEqual(expect.arrayContaining(['currency', 'paymentMethod']));
  });

  it('accepts an additional charge with optional equipment and rejects bad amounts or reason', async () => {
    expect(
      await invalidProperties(CreateAdditionalChargeDto, {
        amount: '0.01',
        currency: 'USD',
        reason: 'Extra equipment',
        equipmentType: 'Winch',
      }),
    ).toEqual([]);
    expect(
      await invalidProperties(CreateAdditionalChargeDto, {
        amount: 0,
        currency: 'USD',
        reason: 7,
        equipmentType: 3,
      }),
    ).toEqual(expect.arrayContaining(['amount', 'reason', 'equipmentType']));
  });

  it('restricts approval option and confirmation field lengths', async () => {
    expect(
      await invalidProperties(ApproveAdditionalChargeDto, {
        confirmationLocale: 'en',
        confirmationText: 'I approve',
        paymentOption: 'SAVED_CARD',
      }),
    ).toEqual([]);
    expect(
      await invalidProperties(ApproveAdditionalChargeDto, {
        confirmationLocale: 'x'.repeat(17),
        confirmationText: 'x'.repeat(65),
        paymentOption: 'INVALID',
      }),
    ).toEqual(
      expect.arrayContaining([
        'confirmationLocale',
        'confirmationText',
        'paymentOption',
      ]),
    );
  });
});
