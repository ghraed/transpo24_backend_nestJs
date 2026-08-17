import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export type HealthStatus = {
  status: 'ok';
  timestamp: string;
};

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  liveness(): HealthStatus {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  async readiness(): Promise<HealthStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('Database is unavailable.');
    }

    return this.liveness();
  }
}
