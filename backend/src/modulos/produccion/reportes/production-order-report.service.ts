import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { join } from "node:path";
import { Repository } from "typeorm";
import { createIcarPdfReport } from "../../../compartido/reportes/icar-pdf-report";
import { createIcarXlsxReport } from "../../../compartido/reportes/icar-xlsx-report";
import { AuthenticatedUser } from "../../../compartido/interfaces/authenticated-user.interface";
import { AuditService } from "../../seguridad/auditoria/audit.service";
import { ProductionAccessPolicy } from "../aplicacion/production-access.policy";
import { ProductionConsolidation } from "../entidades/production-consolidation.entity";
import {
  buildProductionOrderReport,
  buildProductionOrderReportOptions,
  ProductionOrderReportRawRow,
} from "./production-order-report";
import {
  ProductionOrderReportQueryDto,
  ProductionReportFormat,
} from "./production-report.dto";

export interface ProductionOrderOption {
  id: string;
  code: number;
  status: string;
  deliveryDate: string;
}

@Injectable()
export class ProductionOrderReportService {
  constructor(
    @InjectRepository(ProductionConsolidation)
    private readonly consolidations: Repository<ProductionConsolidation>,
    private readonly accessPolicy: ProductionAccessPolicy,
    private readonly audit: AuditService,
  ) {}

  async options(actor: AuthenticatedUser): Promise<ProductionOrderOption[]> {
    const builder = this.consolidations
      .createQueryBuilder("consolidation")
      .innerJoin("consolidation.details", "detail")
      .select("consolidation.id", "id")
      .addSelect("consolidation.code", "code")
      .addSelect("consolidation.status", "status")
      .addSelect("consolidation.deliveryDate", "deliveryDate")
      .distinct(true)
      .orderBy("consolidation.code", "DESC");
    this.applyAreaScope(builder, actor);
    const rows = await builder.getRawMany<{
      id: string;
      code: string;
      status: string;
      deliveryDate: string | Date;
    }>();
    return rows.map((row) => ({
      id: row.id,
      code: Number(row.code),
      status: row.status,
      deliveryDate: dateKey(row.deliveryDate),
    }));
  }

  async report(query: ProductionOrderReportQueryDto, actor: AuthenticatedUser) {
    const rows = await this.queryRows(query.orderId, actor);
    if (!rows.length)
      throw new NotFoundException(
        "Orden de Producción no encontrada o sin productos autorizados",
      );
    return buildProductionOrderReport(rows, actor.name, new Date());
  }

  async export(
    query: ProductionOrderReportQueryDto,
    format: ProductionReportFormat,
    actor: AuthenticatedUser,
  ) {
    const report = await this.report(query, actor);
    const options = buildProductionOrderReportOptions(
      report,
      join(process.cwd(), "assets", "icar-logo.jpg"),
    );
    const content =
      format === ProductionReportFormat.PDF
        ? await createIcarPdfReport(options)
        : await createIcarXlsxReport(options);
    await this.audit.record({
      userId: actor.id,
      module: "production",
      action: "EXPORTAR_REPORTE_ORDEN_PRODUCCION",
      entity: "reporte_orden_produccion",
      entityId: query.orderId,
      result: "EXITOSO",
      metadata: {
        format,
        orderId: query.orderId,
        orderCode: report.order.code,
      },
    });
    const extension = format === ProductionReportFormat.PDF ? "pdf" : "xlsx";
    return {
      filename: `icar-produccion-op-${report.order.code}.${extension}`,
      mime:
        format === ProductionReportFormat.PDF
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      content,
    };
  }

  private async queryRows(
    orderId: string,
    actor: AuthenticatedUser,
  ): Promise<ProductionOrderReportRawRow[]> {
    const builder = this.consolidations
      .createQueryBuilder("consolidation")
      .innerJoin("consolidation.details", "detail")
      .innerJoin("detail.product", "product")
      .leftJoin("detail.presentation", "presentation")
      .leftJoin("detail.category", "category")
      .leftJoin("detail.productionArea", "area")
      .innerJoin("detail.baseUnit", "unit")
      .select("consolidation.id", "orderId")
      .addSelect("consolidation.code", "orderCode")
      .addSelect("consolidation.status", "orderStatus")
      .addSelect("consolidation.deliveryDate", "deliveryDate")
      .addSelect("area.id", "areaId")
      .addSelect("area.name", "areaName")
      .addSelect("category.name", "categoryName")
      .addSelect("product.code", "productCode")
      .addSelect("product.name", "productName")
      .addSelect("presentation.description", "presentationDescription")
      .addSelect("unit.abbreviation", "unitAbbreviation")
      .addSelect("detail.plannedQuantity", "plannedQuantity")
      .addSelect("detail.preparedQuantity", "preparedQuantity")
      .addSelect("detail.stage", "stage")
      .where("consolidation.id = :orderId", { orderId })
      .orderBy("area.name", "ASC", "NULLS LAST")
      .addOrderBy("category.name", "ASC", "NULLS LAST")
      .addOrderBy("product.code", "ASC");
    this.applyAreaScope(builder, actor);
    return builder.getRawMany<ProductionOrderReportRawRow>();
  }

  private applyAreaScope(
    builder: ReturnType<
      Repository<ProductionConsolidation>["createQueryBuilder"]
    >,
    actor: AuthenticatedUser,
  ) {
    const areaIds = this.accessPolicy.productionAreaScope(actor);
    if (areaIds?.length)
      builder.andWhere("detail.productionAreaId IN (:...areaIds)", { areaIds });
    else if (areaIds) builder.andWhere("1 = 0");
  }
}

function dateKey(value: string | Date): string {
  if (typeof value === "string") return value.slice(0, 10);
  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, "0"),
    String(value.getUTCDate()).padStart(2, "0"),
  ].join("-");
}
