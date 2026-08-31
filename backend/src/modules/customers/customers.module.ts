import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DistributionDay } from '../zones/entities/distribution-day.entity';
import { Zone } from '../zones/entities/zone.entity';
import { CustomerAddress } from './entities/customer-address.entity';
import { Customer } from './entities/customer.entity';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  imports: [TypeOrmModule.forFeature([Customer, CustomerAddress, Zone, DistributionDay])],
  controllers: [CustomersController],
  providers: [CustomersService],
})
export class CustomersModule {}

