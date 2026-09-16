import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CustomerAuthGuard } from '../auth/guards/customer-auth.guard';
import { CustomerPlacesService } from './customer-places.service';
import { SavePlaceDto } from './dto/save-place.dto';

type CustomerRequest = { user: { id: string } };

@Controller('customer/places')
@UseGuards(CustomerAuthGuard)
export class CustomerPlacesController {
  constructor(private readonly places: CustomerPlacesService) {}

  @Get()
  list(@Req() request: CustomerRequest) {
    return this.places.list(request.user.id);
  }

  @Get('routes')
  routes(@Req() request: CustomerRequest) {
    return this.places.routes(request.user.id);
  }

  @Post()
  save(@Req() request: CustomerRequest, @Body() dto: SavePlaceDto) {
    return this.places.save(request.user.id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Req() request: CustomerRequest, @Param('id') id: string) {
    return this.places.remove(request.user.id, id);
  }
}
