import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from '../access-control/entities/role.entity';
import { UserSession } from '../auth/entities/user-session.entity';
import { User } from './entities/user.entity';
import { InitialDataService } from './initial-data.service';
import { ProfileController, UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Role, UserSession])],
  controllers: [UsersController, ProfileController],
  providers: [UsersService, InitialDataService],
  exports: [UsersService, TypeOrmModule],
})
export class UsersModule {}
