import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser } from '../../../compartido/decoradores/current-user.decorator';
import { RequirePermissions } from '../../../compartido/decoradores/permissions.decorator';
import { AuthenticatedUser } from '../../../compartido/interfaces/authenticated-user.interface';
import { InventoryKardexExportQueryDto, InventoryKardexQueryDto } from './inventory-kardex.dto';
import { InventoryKardexService } from './inventory-kardex.service';

@Controller(['inventory/kardex', 'inventario/kardex'])
export class InventoryKardexController {
  constructor(private readonly kardex: InventoryKardexService) {}

  @Get('options')
  @RequirePermissions('inventory.read')
  options() { return this.kardex.options(); }

  @Get()
  @RequirePermissions('inventory.read')
  report(@Query() query: InventoryKardexQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.kardex.report(query, actor);
  }

  @Get('export')
  @RequirePermissions('inventory.read')
  async export(@Query() query: InventoryKardexExportQueryDto, @CurrentUser() actor: AuthenticatedUser, @Res() response: Response) {
    const file = await this.kardex.export(query, query.format, actor);
    response.setHeader('Content-Type', file.mime);
    response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    response.send(file.content);
  }
}
