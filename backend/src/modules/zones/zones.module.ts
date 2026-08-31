import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DistributionDay } from './entities/distribution-day.entity';
import { Zone } from './entities/zone.entity';
import { ZonesController } from './zones.controller';
import { ZonesService } from './zones.service';

@Module({
  imports: [TypeOrmModule.forFeature([Zone, DistributionDay])],
  controllers: [ZonesController],
  providers: [ZonesService],
  exports: [ZonesService, TypeOrmModule],
})
export class ZonesModule {}

