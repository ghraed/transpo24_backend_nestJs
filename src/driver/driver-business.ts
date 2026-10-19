import { BadRequestException } from '@nestjs/common';

export function normalizeDriverBusiness(
  driverType: string,
  trn?: string | null,
): { driverType: 'PERSONAL' | 'COMPANY'; trn: string | null } {
  if (driverType !== 'PERSONAL' && driverType !== 'COMPANY') {
    throw new BadRequestException('Choose Personal or Company.');
  }
  const value = typeof trn === 'string' ? trn.trim() : '';
  if (
    driverType === 'COMPANY' &&
    (!value ||
      value.length > 100 ||
      Array.from(value).some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127;
      }))
  ) {
    throw new BadRequestException(
      'A valid TRN is required for company drivers.',
    );
  }
  return { driverType, trn: driverType === 'COMPANY' ? value : null };
}
