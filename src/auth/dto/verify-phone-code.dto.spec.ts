import { validateSync } from 'class-validator';
import { VerifyPhoneCodeDto } from './verify-phone-code.dto';

it('allows the mobile consent version in a phone verification request', () => {
  const dto = Object.assign(new VerifyPhoneCodeDto(), {
    phoneNumber: '+41791234666',
    code: '123456',
    acceptedTermsVersion: '2026-08-25',
  });
  expect(
    validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }),
  ).toEqual([]);
});
