import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser } from '../../../compartido/decoradores/current-user.decorator';
import { RequirePermissions } from '../../../compartido/decoradores/permissions.decorator';
import { AuthenticatedUser } from '../../../compartido/interfaces/authenticated-user.interface';
import { ProductionDailyReportExportQueryDto, ProductionDailyReportQueryDto } from './production-report.dto';
import { ProductionReportService } from './production-report.service';

@Controller('production-reports')
export class ProductionReportController {
  constructor(private readonly reports: ProductionReportService) {}

  @Get('areas')
  @RequirePermissions('production.summary.read')
  areas(@CurrentUser() actor: AuthenticatedUser) {
    return this.reports.areas(actor);
  }

  @Get('daily')
  @RequirePermissions('production.summary.read')
  daily(@Query() query: ProductionDailyReportQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.reports.daily(query, actor);
  }

  @Get('daily/export')
  @RequirePermissions('production.summary.read')
  async export(@Query() query: ProductionDailyReportExportQueryDto, @CurrentUser() actor: AuthenticatedUser, @Res() response: Response) {
    const file = await this.reports.export(query, query.format, actor);
    response.setHeader('Content-Type', file.mime);
    response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    response.send(file.content);
  }
}
