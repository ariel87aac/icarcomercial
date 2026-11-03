import { UseFilters } from "@nestjs/common";
import { ProductionErrorFilter } from "../presentacion/production-error.filter";
import { Controller, Get, Query, Res } from "@nestjs/common";
import { Response } from "express";
import { CurrentUser } from "../../../compartido/decoradores/current-user.decorator";
import { RequirePermissions } from "../../../compartido/decoradores/permissions.decorator";
import { AuthenticatedUser } from "../../../compartido/interfaces/authenticated-user.interface";
import {
  ProductionDailyReportExportQueryDto,
  ProductionDailyReportQueryDto,
  ProductionOrderReportExportQueryDto,
  ProductionOrderReportQueryDto,
  ProductionPlanningReportQueryDto,
} from "./production-report.dto";
import { ProductionOrderReportService } from "./production-order-report.service";
import { ProductionPlanningReportService } from "./production-planning-report.service";
import { ProductionReportService } from "./production-report.service";

@UseFilters(ProductionErrorFilter)
@Controller("production-reports")
export class ProductionReportController {
  constructor(
    private readonly reports: ProductionReportService,
    private readonly planningReports: ProductionPlanningReportService,
    private readonly orderReports: ProductionOrderReportService,
  ) {}

  @Get("planning/export")
  @RequirePermissions("production.consolidations.read")
  async exportPlanning(
    @Query() query: ProductionPlanningReportQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Res() response: Response,
  ) {
    const file = await this.planningReports.export(query, actor);
    response.setHeader("Content-Type", file.mime);
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${file.filename}"`,
    );
    response.send(file.content);
  }

  @Get("areas")
  @RequirePermissions("production.summary.read")
  areas(@CurrentUser() actor: AuthenticatedUser) {
    return this.reports.areas(actor);
  }

  @Get("daily")
  @RequirePermissions("production.summary.read")
  daily(
    @Query() query: ProductionDailyReportQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.reports.daily(query, actor);
  }

  @Get("daily/export")
  @RequirePermissions("production.summary.read")
  async export(
    @Query() query: ProductionDailyReportExportQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Res() response: Response,
  ) {
    const file = await this.reports.export(query, query.format, actor);
    response.setHeader("Content-Type", file.mime);
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${file.filename}"`,
    );
    response.send(file.content);
  }

  @Get("orders")
  @RequirePermissions("production.summary.read")
  orders(@CurrentUser() actor: AuthenticatedUser) {
    return this.orderReports.options(actor);
  }

  @Get("order")
  @RequirePermissions("production.summary.read")
  order(
    @Query() query: ProductionOrderReportQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.orderReports.report(query, actor);
  }

  @Get("order/export")
  @RequirePermissions("production.summary.read")
  async exportOrder(
    @Query() query: ProductionOrderReportExportQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Res() response: Response,
  ) {
    const file = await this.orderReports.export(query, query.format, actor);
    response.setHeader("Content-Type", file.mime);
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${file.filename}"`,
    );
    response.send(file.content);
  }
}
