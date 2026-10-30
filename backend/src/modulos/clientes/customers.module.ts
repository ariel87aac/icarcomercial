import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DistributionDay } from '../zonas-reparto/entidades/distribution-day.entity';
import { Zone } from '../zonas-reparto/entidades/zone.entity';
import { Role } from '../seguridad/roles-permisos/entidades/role.entity';
import { UserSession } from '../seguridad/autenticacion/entidades/user-session.entity';
import { User } from '../seguridad/usuarios/entidades/user.entity';
import { CustomerAddress } from './entidades/customer-address.entity';
import { Customer } from './entidades/customer.entity';
import { CustomerUser } from './entidades/customer-user.entity';
import {
  CustomerAddressesController,
  CustomersController,
} from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Customer,
      CustomerAddress,
      CustomerUser,
      User,
      Role,
      UserSession,
      Zone,
      DistributionDay,
    ]),
  ],
  controllers: [CustomersController, CustomerAddressesController],
  providers: [CustomersService],
})
export class CustomersModule {}
