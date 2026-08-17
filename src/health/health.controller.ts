import { Controller, Get } from '@nestjs/common';

import { HealthService } from './health.service';
import type { HealthStatus } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  liveness(): HealthStatus {
    return this.healthService.liveness();
  }

  @Get('ready')
  readiness(): Promise<HealthStatus> {
    return this.healthService.readiness();
  }
}
