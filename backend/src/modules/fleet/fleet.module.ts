import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { Vehicle } from './entities/vehicle.entity';
import { FleetController } from './fleet.controller';
import { FleetService } from './fleet.service';

@Module({
  imports: [TypeOrmModule.forFeature([Vehicle]), AuditModule],
  controllers: [FleetController],
  providers: [FleetService],
  exports: [FleetService, TypeOrmModule],
})
export class FleetModule {}
