import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AdminResetPasswordDto } from './dto/admin-reset-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateOwnProfileDto } from './dto/update-own-profile.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { UsersService } from './users.service';

@Controller(['users', 'usuarios'])
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions('users.read')
  findAll(@Query() query: UserQueryDto) {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('users.read')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  @RequirePermissions('users.create')
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.usersService.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions('users.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.update(id, dto, actor);
  }

  @Patch(':id/password')
  @RequirePermissions('users.update')
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminResetPasswordDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.adminResetPassword(id, dto, actor);
  }
}

@Controller('me')
export class ProfileController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  profile(@CurrentUser() actor: AuthenticatedUser) {
    return this.usersService.findOwnProfile(actor);
  }

  @Patch()
  updateProfile(
    @Body() dto: UpdateOwnProfileDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.updateOwnProfile(actor, dto);
  }
}
