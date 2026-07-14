import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DocumentStatus,
  DriverDocumentType,
  DriverStatus,
  DriverVehicleReviewStatus,
  UserRole,
  VehicleType,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { hashPassword } from '../common/security/password.util';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { AdminUserResponseDto } from './dto/admin-user-response.dto';
import {
  AdminDriverReviewDocumentDto,
  AdminDriverReviewResponseDto,
  AdminDriverReviewVehicleDto,
} from './dto/admin-driver-review-response.dto';

const DRIVER_ONBOARDING_REQUIRED_DOCUMENT_TYPES: DriverDocumentType[] = [
  DriverDocumentType.PERSONAL_SELFIE,
  DriverDocumentType.ID_FRONT,
  DriverDocumentType.ID_BACK,
  DriverDocumentType.DRIVING_LICENSE,
];

const DRIVER_CANONICAL_VEHICLE_DOCUMENT_TYPES: DriverDocumentType[] = [
  DriverDocumentType.VEHICLE_FRONT_PHOTO,
  DriverDocumentType.VEHICLE_REAR_PHOTO,
  DriverDocumentType.VEHICLE_SIDE_PHOTO,
  DriverDocumentType.VEHICLE_LICENSE_PLATE_PHOTO,
  DriverDocumentType.VEHICLE_REGISTRATION_FRONT,
  DriverDocumentType.VEHICLE_REGISTRATION_BACK,
  DriverDocumentType.VEHICLE_INSURANCE_DOCUMENT,
];

type ReviewDocumentSource = {
  id: string;
  vehicleId: string | null;
  type: DriverDocumentType;
  url: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus;
  rejectionReason: string | null;
  expiresAt: Date | null;
  reviewedAt: Date | null;
  createdAt: Date;
};

type ReviewVehicleSource = {
  id: string;
  vehicleType: VehicleType;
  make: string;
  model: string;
  year: number;
  plateNumber: string;
  status: DriverVehicleReviewStatus;
  rejectionReason: string | null;
  isActive: boolean;
  capacityKg: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  allowedCargoTypes: string[];
  workingSchedule: unknown;
  createdAt: Date;
  updatedAt: Date;
  documents: ReviewDocumentSource[];
};

type ReviewProfileSource = {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  phone: string;
  city: string | null;
  coverageAreas: string[];
  identityDocumentKind: 'NATIONAL_ID' | 'RESIDENCY_CARD' | null;
  status: DriverStatus;
  submittedForReviewAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  user: {
    name: string;
    email: string;
  };
  documents: ReviewDocumentSource[];
  vehicles: ReviewVehicleSource[];
};

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

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

  async findDriverReviews(): Promise<AdminDriverReviewResponseDto[]> {
    const profiles = await this.prisma.driverProfile.findMany({
      where: {
        submittedForReviewAt: {
          not: null,
        },
      },
      orderBy: [{ status: 'asc' }, { submittedForReviewAt: 'desc' }],
      select: this.driverReviewSelect(),
    });

    return profiles.map((profile) => this.mapDriverReview(profile));
  }

  async findDriverReviewById(
    id: string,
  ): Promise<AdminDriverReviewResponseDto> {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { id },
      select: this.driverReviewSelect(),
    });

    if (!profile || !profile.submittedForReviewAt) {
      throw new NotFoundException('Driver review request not found.');
    }

    return this.mapDriverReview(profile);
  }

  async approveDriverReview(id: string): Promise<AdminDriverReviewResponseDto> {
    const profile = await this.getDriverReviewProfile(id);
    const reviewVehicle = this.pickReviewVehicle(profile.vehicles);

    if (!reviewVehicle) {
      throw new BadRequestException(
        'Driver review cannot be approved without a submitted vehicle.',
      );
    }

    if (!this.hasRequiredVehicleDocuments(reviewVehicle.documents)) {
      throw new BadRequestException(
        'The selected vehicle does not have all required documents.',
      );
    }

    if (!this.hasVehicleLoadCapacityProfile(reviewVehicle)) {
      throw new BadRequestException(
        'The selected vehicle does not have a complete load-capacity profile.',
      );
    }

    const reviewedAt = new Date();

    await this.prisma.$transaction([
      this.prisma.driverProfile.update({
        where: { id: profile.id },
        data: {
          status: DriverStatus.APPROVED,
        },
      }),
      this.prisma.driverDocument.updateMany({
        where: {
          driverId: profile.id,
          vehicleId: null,
          type: { in: DRIVER_ONBOARDING_REQUIRED_DOCUMENT_TYPES },
          status: {
            in: [
              DocumentStatus.UPLOADED,
              DocumentStatus.PENDING_REVIEW,
              DocumentStatus.UNDER_REVIEW,
              DocumentStatus.REJECTED,
            ],
          },
        },
        data: {
          status: DocumentStatus.APPROVED,
          rejectionReason: null,
          reviewedAt,
        },
      }),
      this.prisma.driverVehicle.update({
        where: { id: reviewVehicle.id },
        data: {
          status: DriverVehicleReviewStatus.APPROVED,
          rejectionReason: null,
          isActive: true,
        },
      }),
      this.prisma.driverDocument.updateMany({
        where: {
          driverId: profile.id,
          vehicleId: reviewVehicle.id,
          status: {
            in: [
              DocumentStatus.UPLOADED,
              DocumentStatus.PENDING_REVIEW,
              DocumentStatus.UNDER_REVIEW,
              DocumentStatus.REJECTED,
            ],
          },
        },
        data: {
          status: DocumentStatus.APPROVED,
          rejectionReason: null,
          reviewedAt,
        },
      }),
    ]);

    void this.notificationsService
      .notifyDriverApproved({
        driverUserId: profile.userId,
        driverName: profile.user.name,
      })
      .catch((notificationError: unknown) => {
        this.logger.error(
          `Failed to notify approved driver ${profile.id}: ${notificationError instanceof Error ? notificationError.message : 'Unexpected error'}`,
        );
      });

    return this.findDriverReviewById(id);
  }

  async declineDriverReview(
    id: string,
    reason?: string,
  ): Promise<AdminDriverReviewResponseDto> {
    const profile = await this.getDriverReviewProfile(id);
    const reviewVehicle = this.pickReviewVehicle(profile.vehicles);
    const normalizedReason = reason?.trim() || 'Declined by admin review.';
    const reviewedAt = new Date();

    await this.prisma.$transaction([
      this.prisma.driverProfile.update({
        where: { id: profile.id },
        data: {
          status: DriverStatus.REJECTED,
        },
      }),
      this.prisma.driverDocument.updateMany({
        where: {
          driverId: profile.id,
          vehicleId: null,
          type: { in: DRIVER_ONBOARDING_REQUIRED_DOCUMENT_TYPES },
          status: {
            in: [
              DocumentStatus.UPLOADED,
              DocumentStatus.PENDING_REVIEW,
              DocumentStatus.UNDER_REVIEW,
              DocumentStatus.APPROVED,
            ],
          },
        },
        data: {
          status: DocumentStatus.REJECTED,
          rejectionReason: normalizedReason,
          reviewedAt,
        },
      }),
      ...(reviewVehicle
        ? [
            this.prisma.driverVehicle.update({
              where: { id: reviewVehicle.id },
              data: {
                status: DriverVehicleReviewStatus.REJECTED,
                rejectionReason: normalizedReason,
                isActive: false,
              },
            }),
            this.prisma.driverDocument.updateMany({
              where: {
                driverId: profile.id,
                vehicleId: reviewVehicle.id,
                status: {
                  in: [
                    DocumentStatus.UPLOADED,
                    DocumentStatus.PENDING_REVIEW,
                    DocumentStatus.UNDER_REVIEW,
                    DocumentStatus.APPROVED,
                  ],
                },
              },
              data: {
                status: DocumentStatus.REJECTED,
                rejectionReason: normalizedReason,
                reviewedAt,
              },
            }),
          ]
        : []),
    ]);

    return this.findDriverReviewById(id);
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

  private async getDriverReviewProfile(
    id: string,
  ): Promise<ReviewProfileSource> {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { id },
      select: this.driverReviewSelect(),
    });

    if (!profile || !profile.submittedForReviewAt) {
      throw new NotFoundException('Driver review request not found.');
    }

    return profile;
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

  private driverReviewSelect() {
    return {
      id: true,
      userId: true,
      firstName: true,
      lastName: true,
      phone: true,
      city: true,
      coverageAreas: true,
      identityDocumentKind: true,
      status: true,
      submittedForReviewAt: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: {
          name: true,
          email: true,
        },
      },
      documents: {
        where: {
          vehicleId: null,
        },
        orderBy: { createdAt: 'desc' as const },
        select: this.driverReviewDocumentSelect(),
      },
      vehicles: {
        orderBy: [
          { isActive: 'desc' as const },
          { updatedAt: 'desc' as const },
        ],
        select: {
          id: true,
          vehicleType: true,
          make: true,
          model: true,
          year: true,
          plateNumber: true,
          status: true,
          rejectionReason: true,
          isActive: true,
          capacityKg: true,
          lengthCm: true,
          widthCm: true,
          heightCm: true,
          allowedCargoTypes: true,
          workingSchedule: true,
          createdAt: true,
          updatedAt: true,
          documents: {
            orderBy: { createdAt: 'desc' as const },
            select: this.driverReviewDocumentSelect(),
          },
        },
      },
    };
  }

  private driverReviewDocumentSelect() {
    return {
      id: true,
      vehicleId: true,
      type: true,
      url: true,
      mimeType: true,
      sizeBytes: true,
      status: true,
      rejectionReason: true,
      expiresAt: true,
      reviewedAt: true,
      createdAt: true,
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

  private mapDriverReview(
    profile: ReviewProfileSource,
  ): AdminDriverReviewResponseDto {
    const onboardingDocuments = this.uniqueLatestDocumentsByType(
      profile.documents,
    ).map((document) => this.mapReviewDocument(document));
    const reviewVehicle = this.pickReviewVehicle(profile.vehicles);

    return {
      id: profile.id,
      userId: profile.userId,
      name:
        profile.user.name.trim() ||
        `${profile.firstName} ${profile.lastName}`.trim(),
      email: profile.user.email,
      phone: profile.phone,
      city: profile.city,
      coverageAreas: profile.coverageAreas,
      identityDocumentKind: profile.identityDocumentKind,
      status: profile.status,
      submittedForReviewAt: profile.submittedForReviewAt
        ? profile.submittedForReviewAt.toISOString()
        : null,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
      onboardingDocuments,
      vehicle: reviewVehicle ? this.mapReviewVehicle(reviewVehicle) : null,
    };
  }

  private mapReviewVehicle(
    vehicle: ReviewVehicleSource,
  ): AdminDriverReviewVehicleDto {
    const documents = this.uniqueLatestDocumentsByType(vehicle.documents).map(
      (document) => this.mapReviewDocument(document),
    );

    return {
      id: vehicle.id,
      vehicleType: vehicle.vehicleType,
      brand: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      licensePlateNumber: vehicle.plateNumber,
      status: vehicle.status,
      rejectionReason: vehicle.rejectionReason,
      isActive: vehicle.isActive,
      hasRequiredDocuments: this.hasRequiredVehicleDocuments(vehicle.documents),
      hasLoadCapacityProfile: this.hasVehicleLoadCapacityProfile(vehicle),
      createdAt: vehicle.createdAt.toISOString(),
      updatedAt: vehicle.updatedAt.toISOString(),
      documents,
    };
  }

  private mapReviewDocument(
    document: ReviewDocumentSource,
  ): AdminDriverReviewDocumentDto {
    return {
      id: document.id,
      type: document.type,
      url: document.url,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      status: document.status,
      rejectionReason: document.rejectionReason,
      expiresAt: document.expiresAt ? document.expiresAt.toISOString() : null,
      reviewedAt: document.reviewedAt
        ? document.reviewedAt.toISOString()
        : null,
      uploadedAt: document.createdAt.toISOString(),
    };
  }

  private uniqueLatestDocumentsByType(
    documents: ReviewDocumentSource[],
  ): ReviewDocumentSource[] {
    const byType = new Map<DriverDocumentType, ReviewDocumentSource>();

    for (const document of documents) {
      if (!byType.has(document.type)) {
        byType.set(document.type, document);
      }
    }

    return [...byType.values()];
  }

  private pickReviewVehicle(
    vehicles: ReviewVehicleSource[],
  ): ReviewVehicleSource | null {
    if (vehicles.length === 0) {
      return null;
    }

    const hasReviewEvidence = (vehicle: ReviewVehicleSource): boolean =>
      vehicle.documents.some(
        (document) =>
          DRIVER_CANONICAL_VEHICLE_DOCUMENT_TYPES.includes(document.type) ||
          document.status === DocumentStatus.UNDER_REVIEW,
      );

    return (
      vehicles.find(
        (vehicle) =>
          vehicle.status === DriverVehicleReviewStatus.PENDING_REVIEW &&
          hasReviewEvidence(vehicle),
      ) ??
      vehicles.find(hasReviewEvidence) ??
      vehicles.find(
        (vehicle) =>
          vehicle.status === DriverVehicleReviewStatus.PENDING_REVIEW,
      ) ??
      vehicles[0]
    );
  }

  private hasRequiredVehicleDocuments(
    documents: Array<{ type: DriverDocumentType; status: DocumentStatus }>,
  ): boolean {
    const latestDocuments = this.uniqueLatestDocumentsByType(
      documents as ReviewDocumentSource[],
    ).filter((document) => document.status !== DocumentStatus.REJECTED);
    const documentTypes = new Set(
      latestDocuments.map((document) => document.type),
    );

    return DRIVER_CANONICAL_VEHICLE_DOCUMENT_TYPES.every((type) =>
      documentTypes.has(type),
    );
  }

  private hasVehicleLoadCapacityProfile(
    vehicle: Pick<
      ReviewVehicleSource,
      | 'vehicleType'
      | 'capacityKg'
      | 'lengthCm'
      | 'widthCm'
      | 'heightCm'
      | 'allowedCargoTypes'
    >,
  ): boolean {
    if (!vehicle.allowedCargoTypes.length) {
      return false;
    }

    if (
      vehicle.vehicleType === VehicleType.FLATBED_OPEN ||
      vehicle.vehicleType === VehicleType.FLATBED_ENCLOSED
    ) {
      return true;
    }

    return (
      vehicle.capacityKg !== null &&
      vehicle.capacityKg > 0 &&
      vehicle.lengthCm !== null &&
      vehicle.lengthCm > 0 &&
      vehicle.widthCm !== null &&
      vehicle.widthCm > 0 &&
      vehicle.heightCm !== null &&
      vehicle.heightCm > 0
    );
  }
}
