import { BadRequestException } from '@nestjs/common';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

export function normalizePhoneNumber(value: string): string {
  const phone = parsePhoneNumberFromString(value.trim());
  if (!phone?.isValid()) {
    throw new BadRequestException('Enter a valid international phone number.');
  }

  return phone.number;
}

export function maskPhoneNumber(phoneNumber: string): string {
  if (phoneNumber.length <= 7) {
    return '***';
  }

  return `${phoneNumber.slice(0, 4)}••••${phoneNumber.slice(-3)}`;
}
