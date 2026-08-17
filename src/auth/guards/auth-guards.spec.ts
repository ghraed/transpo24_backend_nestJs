import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { AdminRoleGuard } from '../../admin/guards/admin-role.guard';
import type { AuthenticatedUser } from '../auth.types';
import { AuthenticatedUserGuard } from './authenticated-user.guard';
import { CustomerAuthGuard } from './customer-auth.guard';
import { DriverAuthGuard } from './driver-auth.guard';
import { TestingOnlyGuard } from './testing-only.guard';

function createContext(authorization?: string, user?: AuthenticatedUser) {
  const request = { headers: { authorization }, user };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;

  return { context, request };
}

const users: Record<'customer' | 'driver' | 'admin', AuthenticatedUser> = {
  customer: {
    id: 'customer-1',
    name: 'Customer',
    email: 'customer@example.com',
    role: UserRole.CUSTOMER,
    hasDriverProfile: false,
  },
  driver: {
    id: 'driver-1',
    name: 'Driver',
    email: 'driver@example.com',
    role: UserRole.DRIVER,
    hasDriverProfile: true,
  },
  admin: {
    id: 'admin-1',
    name: 'Admin',
    email: 'admin@example.com',
    role: UserRole.ADMIN,
    hasDriverProfile: false,
  },
};

describe('HTTP authentication guards', () => {
  const authService = { getUserFromAccessToken: jest.fn() };

  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['authenticated', () => new AuthenticatedUserGuard(authService as never)],
    ['customer', () => new CustomerAuthGuard(authService as never)],
    ['driver', () => new DriverAuthGuard(authService as never)],
  ])('rejects a missing bearer token in the %s guard', (_name, factory) => {
    expect(() => factory().canActivate(createContext().context)).toThrow(
      UnauthorizedException,
    );
    expect(authService.getUserFromAccessToken).not.toHaveBeenCalled();
  });

  it('rejects an invalid token', () => {
    authService.getUserFromAccessToken.mockReturnValue(null);
    const { context } = createContext('Bearer invalid');

    expect(() =>
      new AuthenticatedUserGuard(authService as never).canActivate(context),
    ).toThrow(UnauthorizedException);
  });

  it('attaches an authenticated user to the request', () => {
    authService.getUserFromAccessToken.mockReturnValue(users.customer);
    const { context, request } = createContext('Bearer valid');

    expect(
      new AuthenticatedUserGuard(authService as never).canActivate(context),
    ).toBe(true);
    expect(request.user).toBe(users.customer);
  });

  it('allows only customers through the customer guard', () => {
    const guard = new CustomerAuthGuard(authService as never);
    authService.getUserFromAccessToken.mockReturnValue(users.customer);
    expect(guard.canActivate(createContext('Bearer customer').context)).toBe(
      true,
    );

    authService.getUserFromAccessToken.mockReturnValue(users.driver);
    expect(() =>
      guard.canActivate(createContext('Bearer driver').context),
    ).toThrow(ForbiddenException);
  });

  it('allows only a driver role with a driver profile', () => {
    const guard = new DriverAuthGuard(authService as never);
    authService.getUserFromAccessToken.mockReturnValue(users.driver);
    expect(guard.canActivate(createContext('Bearer driver').context)).toBe(
      true,
    );

    authService.getUserFromAccessToken.mockReturnValue({
      ...users.customer,
      hasDriverProfile: true,
    });
    expect(() =>
      guard.canActivate(createContext('Bearer customer-driver').context),
    ).toThrow(ForbiddenException);

    authService.getUserFromAccessToken.mockReturnValue({
      ...users.driver,
      hasDriverProfile: false,
    });
    expect(() =>
      guard.canActivate(createContext('Bearer incomplete-driver').context),
    ).toThrow(ForbiddenException);
  });

  it('allows only admins through the admin role guard', () => {
    const guard = new AdminRoleGuard();
    expect(
      guard.canActivate(createContext(undefined, users.admin).context),
    ).toBe(true);
    expect(() =>
      guard.canActivate(createContext(undefined, users.customer).context),
    ).toThrow(ForbiddenException);
  });
});

describe('TestingOnlyGuard', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalEnabled = process.env.ENABLE_TEST_ENDPOINTS;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.ENABLE_TEST_ENDPOINTS = originalEnabled;
  });

  it('requires an explicit opt-in outside production', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.ENABLE_TEST_ENDPOINTS;
    expect(() => new TestingOnlyGuard().canActivate()).toThrow(
      NotFoundException,
    );

    process.env.ENABLE_TEST_ENDPOINTS = 'true';
    expect(new TestingOnlyGuard().canActivate()).toBe(true);
  });

  it('can never be enabled in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_TEST_ENDPOINTS = 'true';
    expect(() => new TestingOnlyGuard().canActivate()).toThrow(
      NotFoundException,
    );
  });
});
