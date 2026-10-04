import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DistributionDay } from '../zones/entities/distribution-day.entity';
import { Zone } from '../zones/entities/zone.entity';
import { Role } from '../access-control/entities/role.entity';
import { UserSession } from '../auth/entities/user-session.entity';
import { User } from '../users/entities/user.entity';
import { CustomerAddress } from './entities/customer-address.entity';
import { Customer } from './entities/customer.entity';
import { CustomerUser } from './entities/customer-user.entity';
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
