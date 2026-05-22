import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';

import { CustomerAuthGuard } from '../auth/guards/customer-auth.guard';
import { CustomerHomeResponseDto } from './dto/customer-request-response.dto';
import { CustomerRequestsService } from './customer-requests.service';

type AuthenticatedRequest = Request & {
  user: {
    id: string;
    email: string;
    name: string;
  };
};

@Controller('customer')
@UseGuards(CustomerAuthGuard)
export class CustomerHomeController {
  constructor(
    private readonly customerRequestsService: CustomerRequestsService,
  ) {}

  @Get('home')
  async getCustomerHome(
    @Req() request: AuthenticatedRequest,
  ): Promise<CustomerHomeResponseDto> {
    return this.customerRequestsService.getCustomerHome({
      customerId: request.user.id,
    });
  }
}
