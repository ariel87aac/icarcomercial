import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessControlController } from './access-control.controller';
import { AccessControlService } from './access-control.service';
import { Permission } from './entities/permission.entity';
import { Role } from './entities/role.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Role, Permission])],
  controllers: [AccessControlController],
  providers: [AccessControlService],
  exports: [AccessControlService, TypeOrmModule],
})
export class AccessControlModule {}

