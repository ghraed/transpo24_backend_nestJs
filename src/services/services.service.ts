import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { ServiceResponseDto } from './dto/service-response.dto';

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async listActiveServices(): Promise<ServiceResponseDto[]> {
    const services = await this.prisma.service.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        key: true,
        nameEn: true,
        nameAr: true,
        descriptionEn: true,
        descriptionAr: true,
        icon: true,
        isActive: true,
        sortOrder: true,
      },
    });

    return services;
  }
}
