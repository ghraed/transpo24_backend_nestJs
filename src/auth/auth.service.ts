import { createHmac, timingSafeEqual } from 'crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { DriverStatus, UserRole } from '@prisma/client';

import { hashPassword, verifyPassword } from '../common/security/password.util';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RegisterDriverResponseDto } from './dto/register-driver-response.dto';
import { RegisterDriverDto } from './dto/register-driver.dto';
import { RegisterDto } from './dto/register.dto';
import { RegisterResponseDto } from './dto/register-response.dto';

type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

type AccessTokenPayload = {
  sub: string;
  name: string;
  email: string;
  role: UserRole;
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

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

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
    const input: RegisterDriverInput = {
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
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
        select: { id: true },
      }),
      this.prisma.driverProfile.findUnique({
        where: { phone: input.phone },
        select: { id: true },
      }),
    ]);

    if (existingUser) {
      throw new ConflictException('Email is already in use.');
    }

    if (existingDriverPhone) {
      throw new ConflictException('Phone is already in use.');
    }

    const created = await this.prisma.user.create({
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

    if (!created.driverProfile) {
      throw new BadRequestException('Unable to create driver profile.');
    }

    const accessToken = this.createAccessToken({
      id: created.id,
      name: `${created.driverProfile.firstName} ${created.driverProfile.lastName}`.trim(),
      email: created.email,
      role: created.role,
    });

    return {
      accessToken,
      user: {
        id: created.id,
        email: created.email,
        role: 'DRIVER',
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
    });

    const driverProfile =
      user.role === UserRole.DRIVER ? user.driverProfile : null;
    const nextStep = driverProfile
      ? driverProfile.isProfileCompleted
        ? 'ADD_VEHICLE_DOCUMENTS'
        : 'COMPLETE_PROFILE'
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

    if (response.user.role !== UserRole.DRIVER || !response.driver) {
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
      new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)),
    );
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
      };
    } catch {
      return null;
    }
  }

  private createAccessToken(user: AuthenticatedUser): string {
    const payload: AccessTokenPayload = {
      sub: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS,
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
