import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../../compartido/decoradores/current-user.decorator';
import { RequirePermissions } from '../../../compartido/decoradores/permissions.decorator';
import { AuthenticatedUser } from '../../../compartido/interfaces/authenticated-user.interface';
import { AccessControlService } from './access-control.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Controller()
export class AccessControlController {
  constructor(private readonly accessControlService: AccessControlService) {}

  @Get('roles')
  @RequirePermissions('roles.read')
  roles() {
    return this.accessControlService.findRoles();
  }

  @Post('roles')
  @RequirePermissions('roles.create')
  createRole(@Body() dto: CreateRoleDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.accessControlService.createRole(dto, actor);
  }

  @Patch('roles/:id')
  @RequirePermissions('roles.update')
  updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.accessControlService.updateRole(id, dto, actor);
  }

  @Get('permissions')
  @RequirePermissions('roles.read')
  permissions() {
    return this.accessControlService.findPermissions();
  }
}

