import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DistributionDay } from './entidades/distribution-day.entity';
import { Zone } from './entidades/zone.entity';
import { ZonesController } from './zones.controller';
import { ZonesService } from './zones.service';

@Module({
  imports: [TypeOrmModule.forFeature([Zone, DistributionDay])],
  controllers: [ZonesController],
  providers: [ZonesService],
  exports: [ZonesService, TypeOrmModule],
})
export class ZonesModule {}

