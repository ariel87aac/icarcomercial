import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import type { ProductCategoryView } from './aplicacion/modelos/product-category.view';
import {
  CreateProductionAreaDto,
  ProductionConsolidationQueryDto,
  UpdateProductionAreaDto,
  GenerateProductionConsolidationDto,
  AdjustProductionPlanDto,
  ScheduleProductionDetailDto,
  RegisterProductionDeliveryDto,
  ProductionReasonDto,
  RegisterProductionProgressDto,
  ReceiveProductionDeliveryDto,
  CloseProductionConsolidationDto,
} from './dto/production.dto';
import type { ProductionAreaView } from './aplicacion/modelos/production-area.view';
import type { ProductionConsolidationView } from './aplicacion/modelos/production-consolidation.view';
import type { StockReplenishmentRequestView } from './aplicacion/modelos/stock-replenishment-request.view';
import type { ProductionConsolidationSourceView } from './aplicacion/modelos/production-consolidation-source.view';
import type { ProductionDeliveryView } from './aplicacion/modelos/production-delivery.view';
import type { ProductionConsolidationHistoryView } from './aplicacion/modelos/production-consolidation-history.view';
import { ProductionQueriesService } from './aplicacion/production-queries.service';
import { ProductionAreasService } from './aplicacion/production-areas.service';
import { GenerateProductionUseCase } from './aplicacion/generate-production.use-case';
import { ProductionPlanService } from './aplicacion/production-plan.service';
import { EmitProductionUseCase } from './aplicacion/emit-production.use-case';
import { ProductionExecutionService } from './aplicacion/production-execution.service';
import { ProductionDeliveriesService } from './aplicacion/production-deliveries.service';
import { ReceiveProductionUseCase } from './aplicacion/receive-production.use-case';
import { ProductionStockRequestsService } from './aplicacion/production-stock-requests.service';
import { CancelProductionUseCase } from './aplicacion/cancel-production.use-case';
import { CloseProductionUseCase } from './aplicacion/close-production.use-case';
import { ProductionSummaryService } from './aplicacion/production-summary.service';
@Injectable()
export class ProductionService {
  constructor(
    private readonly productionQueriesService: ProductionQueriesService,
    private readonly productionAreasService: ProductionAreasService,
    private readonly generateProductionUseCase: GenerateProductionUseCase,
    private readonly productionPlanService: ProductionPlanService,
    private readonly emitProductionUseCase: EmitProductionUseCase,
    private readonly productionExecutionService: ProductionExecutionService,
    private readonly productionDeliveriesService: ProductionDeliveriesService,
    private readonly receiveProductionUseCase: ReceiveProductionUseCase,
    private readonly productionStockRequestsService: ProductionStockRequestsService,
    private readonly cancelProductionUseCase: CancelProductionUseCase,
    private readonly closeProductionUseCase: CloseProductionUseCase,
    private readonly productionSummaryService: ProductionSummaryService,
  ) {}
  areas(actor: AuthenticatedUser): Promise<ProductionAreaView[]> {
    return this.productionAreasService.areas(actor);
  }
  productionCategories(): Promise<ProductCategoryView[]> {
    return this.productionAreasService.productionCategories();
  }
  async createArea(dto: CreateProductionAreaDto, actor: AuthenticatedUser): Promise<ProductionAreaView> {
    return this.productionAreasService.createArea(dto, actor);
  }
  async updateArea(id: string, dto: UpdateProductionAreaDto, actor: AuthenticatedUser): Promise<ProductionAreaView> {
    return this.productionAreasService.updateArea(id, dto, actor);
  }
  async findAll(query: ProductionConsolidationQueryDto, actor: AuthenticatedUser) {
    return this.productionQueriesService.findAll(query, actor);
  }
  async requirements(query: ProductionConsolidationQueryDto, actor: AuthenticatedUser) {
    return this.productionQueriesService.requirements(query, actor);
  }
  async tracking(query: ProductionConsolidationQueryDto, actor: AuthenticatedUser) {
    return this.productionQueriesService.tracking(query, actor);
  }
  async findOne(id: string, actor: AuthenticatedUser): Promise<ProductionConsolidationView> {
    return this.productionQueriesService.findOne(id, actor);
  }
  async plantBoard(productionAreaId: string | undefined, actor: AuthenticatedUser): Promise<ProductionConsolidationView[]> {
    return this.productionQueriesService.plantBoard(productionAreaId, actor);
  }
  async generate(
    dto: GenerateProductionConsolidationDto,
    actor: AuthenticatedUser,
    complementary: boolean,
  ): Promise<ProductionConsolidationView> {
    return this.generateProductionUseCase.generate(dto, actor, complementary);
  }
  async recalculate(id: string, actor: AuthenticatedUser): Promise<ProductionConsolidationView> {
    return this.generateProductionUseCase.recalculate(id, actor);
  }
  async adjustPlan(
    id: string,
    detailId: string,
    dto: AdjustProductionPlanDto,
    actor: AuthenticatedUser,
  ): Promise<ProductionConsolidationView> {
    return this.productionPlanService.adjustPlan(id, detailId, dto, actor);
  }
  async scheduleDetail(
    id: string,
    detailId: string,
    dto: ScheduleProductionDetailDto,
    actor: AuthenticatedUser,
  ): Promise<ProductionConsolidationView> {
    return this.productionPlanService.scheduleDetail(id, detailId, dto, actor);
  }
  async emit(id: string, actor: AuthenticatedUser): Promise<ProductionConsolidationView> {
    return this.emitProductionUseCase.emit(id, actor);
  }
  async sources(id: string, actor: AuthenticatedUser): Promise<ProductionConsolidationSourceView[]> {
    return this.productionQueriesService.sources(id, actor);
  }
  async startDetail(id: string, detailId: string, actor: AuthenticatedUser): Promise<ProductionConsolidationView> {
    return this.productionExecutionService.startDetail(id, detailId, actor);
  }
  async registerDelivery(
    id: string,
    detailId: string,
    dto: RegisterProductionDeliveryDto,
    actor: AuthenticatedUser,
  ): Promise<ProductionConsolidationView> {
    return this.productionDeliveriesService.registerDelivery(id, detailId, dto, actor);
  }
  pendingDeliveries(): Promise<ProductionDeliveryView[]> {
    return this.productionDeliveriesService.pendingDeliveries();
  }
  async pendingStockRequests(actor: AuthenticatedUser): Promise<StockReplenishmentRequestView[]> {
    return this.productionStockRequestsService.pendingStockRequests(actor);
  }
  async returnStockRequest(
    id: string,
    dto: ProductionReasonDto,
    actor: AuthenticatedUser,
  ): Promise<StockReplenishmentRequestView> {
    return this.productionStockRequestsService.returnStockRequest(id, dto, actor);
  }
  async receiveDelivery(
    id: string,
    dto: ReceiveProductionDeliveryDto,
    actor: AuthenticatedUser,
  ): Promise<ProductionDeliveryView> {
    return this.receiveProductionUseCase.receiveDelivery(id, dto, actor);
  }
  async registerProgress(
    id: string,
    dto: RegisterProductionProgressDto,
    actor: AuthenticatedUser,
  ): Promise<ProductionConsolidationView> {
    return this.productionExecutionService.registerProgress(id, dto, actor);
  }
  async cancelDetail(
    id: string,
    detailId: string,
    dto: ProductionReasonDto,
    actor: AuthenticatedUser,
  ): Promise<ProductionConsolidationView> {
    return this.cancelProductionUseCase.cancelDetail(id, detailId, dto, actor);
  }
  async cancel(id: string, dto: ProductionReasonDto, actor: AuthenticatedUser): Promise<ProductionConsolidationView> {
    return this.cancelProductionUseCase.cancel(id, dto, actor);
  }
  async closeIncomplete(
    id: string,
    dto: ProductionReasonDto,
    actor: AuthenticatedUser,
  ): Promise<ProductionConsolidationView> {
    return this.closeProductionUseCase.closeIncomplete(id, dto, actor);
  }
  async close(
    id: string,
    dto: CloseProductionConsolidationDto,
    actor: AuthenticatedUser,
  ): Promise<ProductionConsolidationView> {
    return this.closeProductionUseCase.close(id, dto, actor);
  }
  async history(id: string, actor: AuthenticatedUser): Promise<ProductionConsolidationHistoryView[]> {
    return this.productionQueriesService.history(id, actor);
  }
  async summary(query: ProductionConsolidationQueryDto, actor: AuthenticatedUser) {
    return this.productionSummaryService.summary(query, actor);
  }
}
