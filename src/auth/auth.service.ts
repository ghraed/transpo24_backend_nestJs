import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { DriverStatus, Prisma, UserRole } from '@prisma/client';

import type { AuthenticatedUser } from './auth.types';
import { hashPassword, verifyPassword } from '../common/security/password.util';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RegisterDriverResponseDto } from './dto/register-driver-response.dto';
import { RegisterDriverDto } from './dto/register-driver.dto';
import { RegisterDto } from './dto/register.dto';
import { RegisterResponseDto } from './dto/register-response.dto';
import { PhoneAuthResponseDto } from './dto/phone-auth-response.dto';
import { SendPhoneCodeDto } from './dto/send-phone-code.dto';
import { VerifyPhoneCodeDto } from './dto/verify-phone-code.dto';
import { normalizePhoneNumber } from './phone-number.util';
import { PhoneAuthRateLimitService } from './phone-auth-rate-limit.service';
import { TwilioVerifyService } from './twilio-verify.service';

type AccessTokenPayload = {
  sub: string;
  name: string;
  email: string;
  role: UserRole;
  hasDriverProfile: boolean;
  exp: number;
};

interface RegisterDriverInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  countryCode?: string;
  countryCodes?: string[];
  city?: string;
  cities?: string[];
}

const ACCESS_TOKEN_SECRET =
  process.env.ACCESS_TOKEN_SECRET ?? 'transpo24-dev-access-token-secret';
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
const CUSTOMER_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_DRIVER_FIRST_NAME = 'Driver';
const DEFAULT_DRIVER_LAST_NAME = 'Account';

@Injectable()
export class AuthService {
  private readonly customerSessionUserSelect = {
    id: true,
    name: true,
    email: true,
    phoneNumber: true,
    role: true,
    deletedAt: true,
    isProfileCompleted: true,
  } as const;

  private readonly driverSessionUserSelect = {
    id: true,
    name: true,
    email: true,
    role: true,
    deletedAt: true,
    driverProfile: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        countryCode: true,
        countryCodes: true,
        city: true,
        cities: true,
        status: true,
        isProfileCompleted: true,
      },
    },
  } as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly twilioVerify: TwilioVerifyService,
    private readonly phoneRateLimit: PhoneAuthRateLimitService,
  ) {}

  async sendPhoneCode(
    dto: SendPhoneCodeDto,
    ipAddress: string,
  ): Promise<{ success: true; message: string }> {
    const phoneNumber = normalizePhoneNumber(dto.phoneNumber);
    await this.phoneRateLimit.assertCanSend(phoneNumber, ipAddress);
    await this.twilioVerify.sendCode(phoneNumber);

    return { success: true, message: 'Verification code sent' };
  }

  async sendDriverPhoneCode(
    dto: SendPhoneCodeDto,
    ipAddress: string,
  ): Promise<{ success: true; message: string }> {
    return this.sendPhoneCode(dto, ipAddress);
  }

  async verifyPhoneCode(
    dto: VerifyPhoneCodeDto,
    ipAddress: string,
  ): Promise<PhoneAuthResponseDto> {
    const phoneNumber = normalizePhoneNumber(dto.phoneNumber);
    await this.assertApprovedPhoneVerification(phoneNumber, dto.code, ipAddress);
    let existing = await this.prisma.user.findUnique({
      where: { phoneNumber },
      select: this.customerSessionUserSelect,
    });

    if (existing?.role === UserRole.DRIVER && !existing.deletedAt) {
      const driverProfile = await this.prisma.driverProfile.findUnique({
        where: { userId: existing.id },
        select: { phone: true },
      });

      if (driverProfile?.phone === phoneNumber) {
        await this.prisma.user.update({
          where: { id: existing.id },
          data: { phoneNumber: null },
        });
        existing = null;
      }
    }

    if (existing?.role === UserRole.CUSTOMER && existing.deletedAt) {
      existing = await this.prisma.user.update({
        where: { id: existing.id },
        data: { deletedAt: null },
        select: this.customerSessionUserSelect,
      });
    }

    if (
      existing &&
      (existing.role !== UserRole.CUSTOMER || existing.deletedAt)
    ) {
      throw new ForbiddenException(
        'This phone number cannot be used in the customer application.',
      );
    }

    let user = existing;
    let isNewUser = false;
    if (!user) {
      try {
        user = await this.prisma.user.create({
          data: {
            name: 'Customer',
            email: this.createCustomerPlaceholderEmail(phoneNumber),
            passwordHash: hashPassword(randomBytes(32).toString('base64url')),
            phoneNumber,
            role: UserRole.CUSTOMER,
            isProfileCompleted: false,
          },
          select: this.customerSessionUserSelect,
        });
        isNewUser = true;
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2002'
        ) {
          throw error;
        }
        user = await this.prisma.user.findUnique({
          where: { phoneNumber },
          select: this.customerSessionUserSelect,
        });
      }
    }

    if (!user || user.role !== UserRole.CUSTOMER || user.deletedAt) {
      throw new ForbiddenException('Customer access is required.');
    }

    return this.issueCustomerSession(user, isNewUser);
  }

  async verifyDriverPhoneCode(
    dto: VerifyPhoneCodeDto,
    ipAddress: string,
  ): Promise<LoginResponseDto> {
    const phoneNumber = normalizePhoneNumber(dto.phoneNumber);
    await this.assertApprovedPhoneVerification(phoneNumber, dto.code, ipAddress);

    let user = await this.prisma.user.findFirst({
      where: {
        role: UserRole.DRIVER,
        driverProfile: {
          is: { phone: phoneNumber },
        },
      },
      select: this.driverSessionUserSelect,
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          name: 'Driver',
          email: this.createDriverPlaceholderEmail(phoneNumber),
          passwordHash: hashPassword(randomBytes(32).toString('base64url')),
          role: UserRole.DRIVER,
          driverProfile: {
            create: {
              firstName: '',
              lastName: '',
              phone: phoneNumber,
              countryCode: null,
              countryCodes: [],
              city: null,
              cities: [],
              status: DriverStatus.PENDING_PROFILE,
              isProfileCompleted: false,
            },
          },
        },
        select: this.driverSessionUserSelect,
      });
    }

    return this.buildDriverAuthResponse(user);
  }

  async refreshCustomerSession(
    refreshToken: string,
  ): Promise<PhoneAuthResponseDto> {
    const tokenHash = this.hashRefreshToken(refreshToken);
    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash },
      include: { user: { select: this.customerSessionUserSelect } },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now() ||
      session.user.role !== UserRole.CUSTOMER ||
      session.user.deletedAt ||
      !session.user.phoneNumber
    ) {
      throw new UnauthorizedException('Refresh session is invalid or expired.');
    }

    const replacement = this.createRefreshToken();
    const replacementId = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      const rotated = await tx.refreshSession.updateMany({
        where: {
          id: session.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: {
          revokedAt: new Date(),
          lastUsedAt: new Date(),
          replacedById: replacementId,
        },
      });
      if (rotated.count !== 1) {
        throw new UnauthorizedException(
          'Refresh session is invalid or expired.',
        );
      }
      await tx.refreshSession.create({
        data: {
          id: replacementId,
          userId: session.userId,
          tokenHash: this.hashRefreshToken(replacement),
          expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        },
      });
    });

    return this.buildCustomerSessionResponse(session.user, replacement, false);
  }

  async logoutCustomer(refreshToken: string): Promise<{ success: true }> {
    await this.prisma.refreshSession.updateMany({
      where: {
        tokenHash: this.hashRefreshToken(refreshToken),
        revokedAt: null,
      },
      data: { revokedAt: new Date(), lastUsedAt: new Date() },
    });
    return { success: true };
  }

  async completeCustomerProfile(
    userId: string,
    name: string,
  ): Promise<{ success: true; name: string }> {
    const normalizedName = name.trim();
    const updated = await this.prisma.user.updateMany({
      where: { id: userId, role: UserRole.CUSTOMER, deletedAt: null },
      data: { name: normalizedName, isProfileCompleted: true },
    });
    if (updated.count !== 1) {
      throw new ForbiddenException('Customer access is required.');
    }
    return { success: true, name: normalizedName };
  }

  async resetUsersForTesting(): Promise<{
    deletedUsers: number;
    keptEmail: string;
  }> {
    const result = await this.resetDriversForTesting();

    return {
      deletedUsers: result.deletedDrivers,
      keptEmail: result.keptEmail,
    };
  }

  async resetDriversForTesting(): Promise<{
    deletedDrivers: number;
    keptEmail: string;
  }> {
    const keptEmail = 'driver@test.com';
    const deleted = await this.prisma.user.deleteMany({
      where: {
        role: UserRole.DRIVER,
        email: {
          not: keptEmail,
        },
      },
    });

    return {
      deletedDrivers: deleted.count,
      keptEmail,
    };
  }

  async register(dto: RegisterDto): Promise<RegisterResponseDto> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (existingUser) {
      throw new BadRequestException('Email is already in use.');
    }

    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email: normalizedEmail,
        passwordHash: hashPassword(dto.password),
        role: UserRole.CUSTOMER,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    return {
      message: 'Registration successful.',
      user,
    };
  }

  async registerDriver(
    dto: RegisterDriverDto,
  ): Promise<RegisterDriverResponseDto> {
    const normalizedCountryCodes = this.normalizeCountryCodes(
      dto.countryCodes ?? (dto.countryCode ? [dto.countryCode] : []),
    );
    const normalizedCities = this.normalizeCities(
      dto.cities ?? (dto.city ? [dto.city] : []),
    );
    const normalizedNames = this.normalizeDriverRegistrationNames(
      dto.firstName,
      dto.lastName,
    );
    const input: RegisterDriverInput = {
      firstName: normalizedNames.firstName,
      lastName: normalizedNames.lastName,
      email: dto.email.trim().toLowerCase(),
      phone: dto.phone.trim(),
      password: dto.password,
      countryCode: normalizedCountryCodes[0] ?? dto.countryCode?.trim(),
      countryCodes: normalizedCountryCodes,
      city: normalizedCities[0] ?? dto.city?.trim(),
      cities: normalizedCities,
    };

    const [existingUser, existingDriverPhone] = await this.prisma.$transaction([
      this.prisma.user.findUnique({
        where: { email: input.email },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          passwordHash: true,
          driverProfile: {
            select: {
              id: true,
            },
          },
        },
      }),
      this.prisma.driverProfile.findUnique({
        where: { phone: input.phone },
        select: { id: true, userId: true },
      }),
    ]);

    if (
      existingDriverPhone &&
      existingDriverPhone.userId !== existingUser?.id
    ) {
      throw new ConflictException('Phone is already in use.');
    }

    let created: {
      id: string;
      email: string;
      role: UserRole;
      driverProfile: {
        id: string;
        firstName: string;
        lastName: string;
        phone: string;
        countryCode: string | null;
        countryCodes: string[];
        city: string | null;
        cities: string[];
        status: DriverStatus;
        isProfileCompleted: boolean;
      } | null;
    } | null = null;

    if (existingUser) {
      if (existingUser.driverProfile) {
        throw new ConflictException(
          'Driver profile already exists for this account. Log in instead.',
        );
      }

      if (!verifyPassword(input.password, existingUser.passwordHash)) {
        throw new ConflictException(
          'Email is already in use. Use the existing account password to continue driver setup.',
        );
      }

      created = await this.prisma.user.update({
        where: { id: existingUser.id },
        data: {
          name:
            `${input.firstName} ${input.lastName}`.trim() || existingUser.name,
          driverProfile: {
            create: {
              firstName: input.firstName,
              lastName: input.lastName,
              phone: input.phone,
              countryCode: input.countryCode || null,
              countryCodes: input.countryCodes ?? [],
              city: input.city || null,
              cities: input.cities ?? [],
              status: DriverStatus.PENDING_PROFILE,
              isProfileCompleted: false,
            },
          },
        },
        select: {
          id: true,
          email: true,
          role: true,
          driverProfile: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              countryCode: true,
              countryCodes: true,
              city: true,
              cities: true,
              status: true,
              isProfileCompleted: true,
            },
          },
        },
      });
    } else {
      created = await this.prisma.user.create({
        data: {
          name: `${input.firstName} ${input.lastName}`.trim(),
          email: input.email,
          passwordHash: hashPassword(input.password),
          role: UserRole.DRIVER,
          driverProfile: {
            create: {
              firstName: input.firstName,
              lastName: input.lastName,
              phone: input.phone,
              countryCode: input.countryCode || null,
              countryCodes: input.countryCodes ?? [],
              city: input.city || null,
              cities: input.cities ?? [],
              status: DriverStatus.PENDING_PROFILE,
              isProfileCompleted: false,
            },
          },
        },
        select: {
          id: true,
          email: true,
          role: true,
          driverProfile: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              countryCode: true,
              countryCodes: true,
              city: true,
              cities: true,
              status: true,
              isProfileCompleted: true,
            },
          },
        },
      });
    }

    if (!created.driverProfile) {
      throw new BadRequestException('Unable to create driver profile.');
    }

    const accessToken = this.createAccessToken({
      id: created.id,
      name: `${created.driverProfile.firstName} ${created.driverProfile.lastName}`.trim(),
      email: created.email,
      role: created.role,
      hasDriverProfile: true,
    });

    return {
      accessToken,
      user: {
        id: created.id,
        email: created.email,
        role: created.role,
      },
      driver: {
        id: created.driverProfile.id,
        firstName: created.driverProfile.firstName,
        lastName: created.driverProfile.lastName,
        phone: created.driverProfile.phone,
        countryCode: created.driverProfile.countryCode,
        countryCodes: created.driverProfile.countryCodes,
        city: created.driverProfile.city,
        cities: created.driverProfile.cities,
        status: created.driverProfile.status,
        isProfileCompleted: created.driverProfile.isProfileCompleted,
      },
      nextStep: 'COMPLETE_PROFILE',
    };
  }

  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        passwordHash: true,
        driverProfile: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            countryCode: true,
            countryCodes: true,
            city: true,
            cities: true,
            status: true,
            isProfileCompleted: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const isValidPassword = verifyPassword(dto.password, user.passwordHash);

    if (!isValidPassword) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const accessToken = this.createAccessToken({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      hasDriverProfile: Boolean(user.driverProfile),
    });

    const driverProfile = user.driverProfile;
    const nextStep = driverProfile
      ? this.getDriverLoginNextStep({
          status: driverProfile.status,
          isProfileCompleted: driverProfile.isProfileCompleted,
        })
      : undefined;

    return {
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      driver: driverProfile
        ? {
            id: driverProfile.id,
            firstName: driverProfile.firstName,
            lastName: driverProfile.lastName,
            phone: driverProfile.phone,
            countryCode: driverProfile.countryCode,
            countryCodes: driverProfile.countryCodes,
            city: driverProfile.city,
            cities: driverProfile.cities,
            status: driverProfile.status,
            isProfileCompleted: driverProfile.isProfileCompleted,
          }
        : undefined,
      nextStep,
    };
  }

  async loginDriver(dto: LoginDto): Promise<LoginResponseDto> {
    const response = await this.login(dto);

    if (!response.driver) {
      throw new ForbiddenException('Driver access is required.');
    }

    return {
      ...response,
      nextStep:
        response.nextStep === 'ADD_VEHICLE_DOCUMENTS'
          ? 'UPLOAD_DOCUMENTS'
          : response.nextStep,
    };
  }

  private getDriverLoginNextStep(profile: {
    status: DriverStatus;
    isProfileCompleted: boolean;
  }):
    | 'COMPLETE_PROFILE'
    | 'ADD_VEHICLE_DOCUMENTS'
    | 'WAITING_APPROVAL'
    | 'HOME' {
    if (
      !profile.isProfileCompleted ||
      profile.status === DriverStatus.PENDING_PROFILE
    ) {
      return 'COMPLETE_PROFILE';
    }

    if (profile.status === DriverStatus.PENDING_DOCUMENTS) {
      return 'ADD_VEHICLE_DOCUMENTS';
    }

    if (
      profile.status === DriverStatus.PENDING_REVIEW ||
      profile.status === DriverStatus.SUSPENDED ||
      profile.status === DriverStatus.REJECTED
    ) {
      return 'WAITING_APPROVAL';
    }

    if (profile.status === DriverStatus.APPROVED) {
      return 'HOME';
    }

    return 'COMPLETE_PROFILE';
  }

  async loginAdmin(dto: LoginDto): Promise<LoginResponseDto> {
    const response = await this.login(dto);

    if (response.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin access is required.');
    }

    return {
      accessToken: response.accessToken,
      user: response.user,
    };
  }

  private async issueCustomerSession(
    user: {
      id: string;
      name: string;
      email: string;
      phoneNumber: string | null;
      role: UserRole;
      deletedAt: Date | null;
      isProfileCompleted: boolean;
    },
    isNewUser: boolean,
  ): Promise<PhoneAuthResponseDto> {
    const refreshToken = this.createRefreshToken();
    await this.prisma.refreshSession.create({
      data: {
        userId: user.id,
        tokenHash: this.hashRefreshToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });
    return this.buildCustomerSessionResponse(user, refreshToken, isNewUser);
  }

  private buildCustomerSessionResponse(
    user: {
      id: string;
      name: string;
      email: string;
      phoneNumber: string | null;
      role: UserRole;
      isProfileCompleted: boolean;
    },
    refreshToken: string,
    isNewUser: boolean,
  ): PhoneAuthResponseDto {
    if (!user.phoneNumber || user.role !== UserRole.CUSTOMER) {
      throw new ForbiddenException(
        'Customer phone authentication is required.',
      );
    }

    return {
      accessToken: this.createAccessToken(
        {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          hasDriverProfile: false,
        },
        CUSTOMER_ACCESS_TOKEN_TTL_SECONDS,
      ),
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: UserRole.CUSTOMER,
      },
      isNewUser,
      profileCompleted: user.isProfileCompleted,
    };
  }

  private createCustomerPlaceholderEmail(phoneNumber: string): string {
    const identifier = createHash('sha256')
      .update(phoneNumber)
      .digest('hex')
      .slice(0, 32);
    return `phone-${identifier}@customers.transpo24.local`;
  }

  private createDriverPlaceholderEmail(phoneNumber: string): string {
    const identifier = createHash('sha256')
      .update(phoneNumber)
      .digest('hex')
      .slice(0, 32);
    return `phone-${identifier}@drivers.transpo24.local`;
  }

  private async assertApprovedPhoneVerification(
    phoneNumber: string,
    code: string,
    ipAddress: string,
  ): Promise<void> {
    await this.phoneRateLimit.assertCanVerify(phoneNumber, ipAddress);
    const verification = await this.twilioVerify.verifyCode(phoneNumber, code);

    if (verification === 'invalid') {
      throw new UnauthorizedException('The verification code is incorrect.');
    }

    if (verification !== 'approved') {
      throw new UnauthorizedException(
        'The verification code has expired. Request a new code.',
      );
    }
  }

  private buildDriverAuthResponse(user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    deletedAt: Date | null;
    driverProfile: {
      id: string;
      firstName: string;
      lastName: string;
      phone: string;
      countryCode: string | null;
      countryCodes: string[];
      city: string | null;
      cities: string[];
      status: DriverStatus;
      isProfileCompleted: boolean;
    } | null;
  }): LoginResponseDto {
    if (
      user.role !== UserRole.DRIVER ||
      user.deletedAt ||
      !user.driverProfile
    ) {
      throw new ForbiddenException('Driver access is required.');
    }

    const nextStep = this.getDriverLoginNextStep({
      status: user.driverProfile.status,
      isProfileCompleted: user.driverProfile.isProfileCompleted,
    });

    return {
      accessToken: this.createAccessToken({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        hasDriverProfile: true,
      }),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      driver: {
        id: user.driverProfile.id,
        firstName: user.driverProfile.firstName,
        lastName: user.driverProfile.lastName,
        phone: user.driverProfile.phone,
        countryCode: user.driverProfile.countryCode,
        countryCodes: user.driverProfile.countryCodes,
        city: user.driverProfile.city,
        cities: user.driverProfile.cities,
        status: user.driverProfile.status,
        isProfileCompleted: user.driverProfile.isProfileCompleted,
      },
      nextStep:
        nextStep === 'ADD_VEHICLE_DOCUMENTS' ? 'UPLOAD_DOCUMENTS' : nextStep,
    };
  }

  private createRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private normalizeCountryCodes(values: string[]): string[] {
    return Array.from(
      new Set(
        values
          .map((value) => value.trim().toUpperCase())
          .filter((value) => value.length > 0),
      ),
    );
  }

  private normalizeCities(values: string[]): string[] {
    return Array.from(
      new Set(
        values.map((value) => value.trim()).filter((value) => value.length > 0),
      ),
    );
  }

  private normalizeDriverRegistrationNames(
    firstName?: string,
    lastName?: string,
  ): { firstName: string; lastName: string } {
    const normalizedFirstName = firstName?.trim() || DEFAULT_DRIVER_FIRST_NAME;
    const normalizedLastName = lastName?.trim() || DEFAULT_DRIVER_LAST_NAME;

    return {
      firstName: normalizedFirstName,
      lastName: normalizedLastName,
    };
  }

  getUserFromAccessToken(token: string): AuthenticatedUser | null {
    const [encodedPayload, providedSignature] = token.split('.');
    if (!encodedPayload || !providedSignature) {
      return null;
    }

    const expectedSignature = createHmac('sha256', ACCESS_TOKEN_SECRET)
      .update(encodedPayload)
      .digest('base64url');

    const providedBuffer = Buffer.from(providedSignature);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (
      providedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      return null;
    }

    try {
      const payload = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8'),
      ) as Partial<AccessTokenPayload>;

      if (
        typeof payload.sub !== 'string' ||
        typeof payload.name !== 'string' ||
        typeof payload.email !== 'string' ||
        typeof payload.role !== 'string' ||
        typeof payload.exp !== 'number'
      ) {
        return null;
      }

      if (!Object.values(UserRole).includes(payload.role)) {
        return null;
      }

      if (payload.exp * 1000 <= Date.now()) {
        return null;
      }

      return {
        id: payload.sub,
        name: payload.name,
        email: payload.email,
        role: payload.role,
        hasDriverProfile:
          typeof payload.hasDriverProfile === 'boolean'
            ? payload.hasDriverProfile
            : false,
      };
    } catch {
      return null;
    }
  }

  private createAccessToken(
    user: AuthenticatedUser,
    ttlSeconds = ACCESS_TOKEN_TTL_SECONDS,
  ): string {
    const payload: AccessTokenPayload = {
      sub: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      hasDriverProfile: user.hasDriverProfile,
      exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    };

    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );
    const signature = createHmac('sha256', ACCESS_TOKEN_SECRET)
      .update(encodedPayload)
      .digest('base64url');

    return `${encodedPayload}.${signature}`;
  }
}
