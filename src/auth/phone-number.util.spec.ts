import { BadRequestException } from '@nestjs/common';

import { normalizePhoneNumber } from './phone-number.util';

describe('normalizePhoneNumber', () => {
  it('normalizes a valid number to E.164', () => {
    expect(normalizePhoneNumber('+961 70 123 456')).toBe('+96170123456');
  });

  it('rejects invalid numbers', () => {
    expect(() => normalizePhoneNumber('123')).toThrow(BadRequestException);
  });
});
