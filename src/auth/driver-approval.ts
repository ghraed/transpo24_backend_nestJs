import { ForbiddenException } from '@nestjs/common';

export function assertDriverApproved(
  profile: { status: string; isProfileCompleted: boolean } | null | undefined,
): void {
  if (profile?.status !== 'APPROVED' || !profile.isProfileCompleted) {
    throw new ForbiddenException({
      statusCode: 403,
      code: 'DRIVER_APPROVAL_REQUIRED',
      message:
        'Complete registration and wait for admin approval before interacting with clients.',
    });
  }
}
