import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { hashPassword } from '../common/security/password.util';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { AdminUserResponseDto } from './dto/admin-user-response.dto';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<AdminUserResponseDto[]> {
    const users = await this.prisma.user.findMany({
      where: {
        role: UserRole.ADMIN,
      },
      orderBy: [{ deletedAt: 'asc' }, { createdAt: 'desc' }],
      select: this.adminUserSelect(),
    });

    return users.map((user) => this.mapToResponse(user));
  }

  async findById(id: string): Promise<AdminUserResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        role: UserRole.ADMIN,
      },
      select: this.adminUserSelect(),
    });

    if (!user) {
      throw new NotFoundException('Admin user not found.');
    }

    return this.mapToResponse(user);
  }

  async create(dto: CreateAdminUserDto): Promise<AdminUserResponseDto> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, deletedAt: true },
    });

    if (existingUser) {
      if (existingUser.deletedAt) {
        throw new ConflictException(
          'Email is associated with a deactivated account.',
        );
      }
      throw new ConflictException('Email is already in use.');
    }

    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email: normalizedEmail,
        passwordHash: hashPassword(dto.password),
        role: UserRole.ADMIN,
      },
      select: this.adminUserSelect(),
    });

    return this.mapToResponse(user);
  }

  async update(
    id: string,
    dto: UpdateAdminUserDto,
  ): Promise<AdminUserResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        role: UserRole.ADMIN,
        deletedAt: null,
      },
      select: { id: true, email: true },
    });

    if (!user) {
      throw new NotFoundException('Admin user not found.');
    }

    const normalizedEmail = dto.email?.trim().toLowerCase();

    if (normalizedEmail && normalizedEmail !== user.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true, deletedAt: true },
      });

      if (existingUser) {
        if (existingUser.deletedAt) {
          throw new ConflictException(
            'Email is associated with a deactivated account.',
          );
        }
        throw new ConflictException('Email is already in use.');
      }
    }

    const updateData: {
      name?: string;
      email?: string;
      passwordHash?: string;
    } = {};

    if (dto.name !== undefined) {
      updateData.name = dto.name.trim();
    }

    if (normalizedEmail !== undefined) {
      updateData.email = normalizedEmail;
    }

    if (dto.password !== undefined && dto.password.length > 0) {
      updateData.passwordHash = hashPassword(dto.password);
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: updateData,
      select: this.adminUserSelect(),
    });

    return this.mapToResponse(updated);
  }

  async reactivate(id: string): Promise<AdminUserResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        role: UserRole.ADMIN,
      },
      select: { id: true, deletedAt: true },
    });

    if (!user) {
      throw new NotFoundException('Admin user not found.');
    }

    if (!user.deletedAt) {
      throw new BadRequestException('Admin user is already active.');
    }

    const restored = await this.prisma.user.update({
      where: { id: user.id },
      data: { deletedAt: null },
      select: this.adminUserSelect(),
    });

    return this.mapToResponse(restored);
  }

  async softDelete(id: string, actorId: string): Promise<void> {
    if (id === actorId) {
      throw new ForbiddenException('You cannot delete your own admin account.');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id,
        role: UserRole.ADMIN,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('Admin user not found.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { deletedAt: new Date() },
    });
  }

  private adminUserSelect() {
    return {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
    };
  }

  private mapToResponse(user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
  }): AdminUserResponseDto {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as 'ADMIN',
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      deletedAt: user.deletedAt ? user.deletedAt.toISOString() : null,
    };
  }
}
