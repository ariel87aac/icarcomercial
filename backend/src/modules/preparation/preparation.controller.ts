import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { ConfirmPreparationDto, CreatePreparationDto, PreparationQueryDto, RegisterPreparationProgressDto } from './dto/preparation.dto';
import { PreparationService } from './preparation.service';

@Controller('preparations')
export class PreparationController {
  constructor(private readonly preparations: PreparationService) {}

  @Get('eligible')
  @RequirePermissions('preparations.read')
  eligible(@Query() query: PreparationQueryDto) { return this.preparations.eligible(query); }

  @Get()
  @RequirePermissions('preparations.read')
  findAll(@Query() query: PreparationQueryDto) { return this.preparations.findAll(query); }

  @Post()
  @RequirePermissions('preparations.create')
  create(@Body() dto: CreatePreparationDto, @CurrentUser() actor: AuthenticatedUser) { return this.preparations.create(dto, actor); }

  @Get(':id')
  @RequirePermissions('preparations.read')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.preparations.findOne(id); }

  @Post(':id/progress')
  @RequirePermissions('preparations.progress')
  progress(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RegisterPreparationProgressDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.preparations.progress(id, dto, actor);
  }

  @Post(':id/confirm')
  @RequirePermissions('preparations.confirm')
  confirm(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmPreparationDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.preparations.confirm(id, dto, actor);
  }

  @Get(':id/history')
  @RequirePermissions('preparations.read')
  history(@Param('id', ParseUUIDPipe) id: string) { return this.preparations.history(id); }
}
