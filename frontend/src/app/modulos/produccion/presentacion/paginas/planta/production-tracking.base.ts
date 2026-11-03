import { HttpClient, HttpParams } from '@angular/common/http';
import { DestroyRef, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { AuthService } from '../../../../../nucleo/autenticacion/auth.service';
import {
  ProductionConsolidation,
  ProductionConsolidationStatus,
  ProductionHistory,
  ProductionTrackingOrder,
} from '../../../../../compartido/modelos';

const STATUS_LABELS: Record<ProductionConsolidationStatus, string> = {
  BORRADOR: "Borrador",
  EMITIDA: "Emitida",
  EN_PROCESO: "En proceso",
  CERRADA: "Completada",
  CERRADA_INCOMPLETA: "Completada con faltantes",
  CANCELADA: "Cancelada",
};
const DEFAULT_TRACKING_STATUSES: ProductionConsolidationStatus[] = [
  "BORRADOR",
  "EMITIDA",
  "EN_PROCESO",
];

import { Directive } from '@angular/core';
import { ProductionTrackingContratos01 } from './production-tracking.contratos-01';

@Directive()
export abstract class ProductionTrackingBase extends ProductionTrackingContratos01 {
protected readonly http = inject(HttpClient);

  protected readonly destroyRef = inject(DestroyRef);

  protected readonly auth = inject(AuthService);

  protected readonly refreshList = new Subject<void>();

  protected readonly refreshDetail = new Subject<void>();

  protected selectedId: string | null = null;

  protected appliedParams = new HttpParams().set(
    "statuses",
    DEFAULT_TRACKING_STATUSES.join(","),
  );

  protected readonly orders = signal<ProductionTrackingOrder[]>([]);

  protected readonly selected = signal<ProductionConsolidation | null>(null);

  protected readonly history = signal<ProductionHistory[]>([]);

  protected readonly loading = signal(false);

  protected readonly detailLoading = signal(false);

  protected readonly dialog = signal(false);

  protected readonly listError = signal("");

  protected readonly detailError = signal("");

  protected readonly historyError = signal("");

  protected readonly updatedAt = signal<string | null>(null);

  protected readonly detailUpdatedAt = signal<string | null>(null);

  protected readonly page = signal(1);

  protected readonly pageSize = signal(30);

  protected readonly total = signal(0);

  protected readonly statusOptions = Object.entries(STATUS_LABELS).map(
      ([value, label]) => ({ value, label }),
    );

  protected code: number | null = null;

  protected deliveryDate = "";

  protected statuses: ProductionConsolidationStatus[] = [
    ...DEFAULT_TRACKING_STATUSES,
  ];
}
