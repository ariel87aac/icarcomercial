import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { CustomersService } from './customers.service';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @RequirePermissions('customers.read')
  findAll(@Query() query: CustomerQueryDto) {
    return this.customersService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('customers.read')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.customersService.findOne(id);
  }

  @Post()
  @RequirePermissions('customers.create')
  create(@Body() dto: CreateCustomerDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.customersService.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions('customers.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.customersService.update(id, dto, actor);
  }

  @Get(':id/addresses')
  @RequirePermissions('customers.read')
  addresses(@Param('id', ParseUUIDPipe) id: string) {
    return this.customersService.addresses(id);
  }

  @Post(':id/addresses')
  @RequirePermissions('customers.update')
  addAddress(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAddressDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.customersService.addAddress(id, dto, actor);
  }

  @Patch(':id/addresses/:addressId')
  @RequirePermissions('customers.update')
  updateAddress(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('addressId', ParseUUIDPipe) addressId: string,
    @Body() dto: UpdateAddressDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.customersService.updateAddress(id, addressId, dto, actor);
  }
}

