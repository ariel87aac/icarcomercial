import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessControlController } from './access-control.controller';
import { AccessControlService } from './access-control.service';
import { Permission } from './entidades/permission.entity';
import { Role } from './entidades/role.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Role, Permission])],
  controllers: [AccessControlController],
  providers: [AccessControlService],
  exports: [AccessControlService, TypeOrmModule],
})
export class AccessControlModule {}

