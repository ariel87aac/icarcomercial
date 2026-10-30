import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from '../roles-permisos/entidades/role.entity';
import { UserSession } from '../autenticacion/entidades/user-session.entity';
import { ProductionArea } from '../../produccion/entidades/production-area.entity';
import { User } from './entidades/user.entity';
import { InitialDataService } from './initial-data.service';
import { ProfileController, UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Role, UserSession, ProductionArea])],
  controllers: [UsersController, ProfileController],
  providers: [UsersService, InitialDataService],
  exports: [UsersService, TypeOrmModule],
})
export class UsersModule {}
