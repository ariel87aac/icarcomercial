import { TableLazyLoadEvent } from 'primeng/types/table';
import {
  ProductionConsolidation,
  ProductionConsolidationDetail,
  ProductionConsolidationStatus,
  ProductionDetailStage,
  ProductionHistory,
  ProductionTrackingOrder,
} from '../../../../../compartido/modelos';

import { Directive } from '@angular/core';

@Directive()
export abstract class ProductionTrackingContratos01 {
  abstract ngOnInit(): void;

  protected abstract applyFilters(): void;

  protected abstract onPage(event: TableLazyLoadEvent): void;

  protected abstract refresh(): void;

  protected abstract open(order: ProductionTrackingOrder): void;

  protected abstract close(): void;

  protected abstract statusLabel(status: ProductionConsolidationStatus): string;

  protected abstract eventLabel(event: ProductionHistory["event"]): string;

  protected abstract severity(status: ProductionConsolidationStatus): "success" | "danger" | "warn" | "info" | "secondary";

  protected abstract stageLabel(stage: ProductionDetailStage): string;

  protected abstract stageSeverity(stage: ProductionDetailStage): "success" | "danger" | "warn" | "info" | "secondary";

  protected abstract nextAction(order: ProductionTrackingOrder): string;

  protected abstract percent(value: number | null): string;

  protected abstract number(value: number | string): string;

  protected abstract pending(detail: ProductionConsolidationDetail): number;

  protected abstract completedProducts(order: ProductionConsolidation): number;

  protected abstract pendingReceipts(order: ProductionConsolidation): number;

  protected abstract detailProgress(detail: ProductionConsolidationDetail): number;

  protected abstract date(value: string | null, time: boolean): string;

  protected abstract milestones(order: ProductionConsolidation): {
      label: string;
      at: string | null;
      current: boolean;
  }[];

  protected abstract errorMessage(error: unknown): string;
}
