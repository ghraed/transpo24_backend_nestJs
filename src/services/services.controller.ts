import { Controller, Get, UseGuards } from '@nestjs/common';

import { CustomerAuthGuard } from '../auth/guards/customer-auth.guard';
import { ServiceResponseDto } from './dto/service-response.dto';
import { ServicesService } from './services.service';

@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @UseGuards(CustomerAuthGuard)
  @Get()
  async getServices(): Promise<{ services: ServiceResponseDto[] }> {
    const services = await this.servicesService.listActiveServices();
    return { services };
  }
}
