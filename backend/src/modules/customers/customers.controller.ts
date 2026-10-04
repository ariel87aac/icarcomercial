import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';
import {
  CreateCustomerAccountDto,
  UpdateCustomerAccountDto,
} from './dto/customer-account.dto';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { CustomersService } from './customers.service';

@Controller(['customers', 'clientes'])
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @RequirePermissions('customers.read')
  findAll(
    @Query() query: CustomerQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.customersService.findAll(query, actor);
  }

  @Get(':id')
  @RequirePermissions('customers.read')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.customersService.findOne(id, actor);
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

  @Get([':id/addresses', ':id/domicilios'])
  @RequirePermissions('customers.read')
  addresses(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.customersService.addresses(id, actor);
  }

  @Post([':id/addresses', ':id/domicilios'])
  @RequirePermissions('customers.update')
  addAddress(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAddressDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.customersService.addAddress(id, dto, actor);
  }

  @Patch([':id/addresses/:addressId', ':id/domicilios/:addressId'])
  @RequirePermissions('customers.update')
  updateAddress(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('addressId', ParseUUIDPipe) addressId: string,
    @Body() dto: UpdateAddressDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.customersService.updateAddress(id, addressId, dto, actor);
  }

  @Post([':id/users', ':id/usuarios'])
  @RequirePermissions('customer_accounts.create')
  createAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCustomerAccountDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.customersService.createAccount(id, dto, actor);
  }

  @Patch([':id/users/:userId', ':id/usuarios/:userId'])
  @RequirePermissions('customer_accounts.create')
  updateAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateCustomerAccountDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.customersService.updateAccount(id, userId, dto, actor);
  }
}

@Controller(['addresses', 'domicilios'])
export class CustomerAddressesController {
  constructor(private readonly customersService: CustomersService) {}

  @Patch(':id')
  @RequirePermissions('customers.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAddressDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.customersService.updateAddressById(id, dto, actor);
  }
}
