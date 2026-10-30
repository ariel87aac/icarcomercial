import { workflowLabel } from '../../../../pedidos/dominio/order-workflow';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, input, signal } from '@angular/core';
import { FormArray, FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { PaginatorModule, PaginatorState } from 'primeng/paginator';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import * as L from 'leaflet';
import { AuthService } from '../../../../../nucleo/autenticacion/auth.service';
import {
  DistributionRoute,
  DistributionRouteStatus,
  EligibleOrder,
  FactoryDeliveryCompletion,
  OrderPreparation,
  OrderPreparationDetail,
  Paginated,
  PendingDistributionPreparation,
  PreparationWorkOrder,
  PreparationStatus,
  ProductPresentation,
  RouteDelivery,
  User,
  Vehicle,
  VisitResultType,
  Zone,
} from '../../../../../compartido/modelos';

type DistributionView = 'preparations' | 'pending' | 'vehicles' | 'weights' | 'routes' | 'assigned' | 'summary';
import { DistributionBase } from './distribution.base';

import { Directive } from '@angular/core';

@Directive()
export abstract class DistributionParte03 extends DistributionBase {
  protected override preparationSeverity(status: PreparationStatus): 'info'|'warn'|'success'|'secondary'|'danger' { return status==='CANCELADA'?'danger':status==='PREPARADA'||status==='DESPACHADA'?'success':status==='OBSERVADA'?'warn':status==='ASIGNADA'?'info':'secondary'; }

  protected override routeSeverity(status: DistributionRouteStatus): 'info'|'warn'|'success'|'secondary'|'danger' { return status==='CANCELADA'?'danger':status==='LIQUIDADA'?'success':status==='EN_REPARTO'?'warn':status==='PLANIFICADA'||status==='FINALIZADA'?'info':'secondary'; }

  protected override visitSeverity(result: VisitResultType): 'success'|'warn'|'danger' { return result==='ENTREGADA'?'success':result==='ENTREGA_PARCIAL'?'warn':'danger'; }

  protected override formatDate(value: string): string { return new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium' }).format(new Date(`${value.slice(0,10)}T12:00:00`)); }

  protected override formatDateTime(value: string): string { return new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }

  protected override number(value: string|number): string { return new Intl.NumberFormat('es-BO', { maximumFractionDigits: 3 }).format(Number(value)); }

  protected override money(value: string|number): string { return new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value)); }

  protected override numberValue(value: string|number): number { return Number(value); }

  protected override applyPageSize(event: PaginatorState): void {
      const rows = event.rows ?? this.pageSize();
      if (rows !== this.pageSize()) {
        this.pageSize.set(rows);
        this.pendingPage.set(1); this.eligiblePage.set(1); this.preparationPage.set(1); this.vehiclePage.set(1); this.routePage.set(1); this.summaryPage.set(1); this.weightPage.set(1);
      }
    }

  protected override saved(summary: string, detail: string): void { this.messages.add({ severity: 'success', summary, detail }); }

  protected override fail(error: unknown): void { this.loading.set(false); this.messages.add({ severity: 'error', summary: 'No se pudo cargar Distribución', detail: this.error(error) }); }

  protected override failSave(error: unknown): void { this.saving.set(false); this.messages.add({ severity: 'error', summary: 'No se pudo completar la operación', detail: this.error(error) }); }

  protected override error(error: unknown): string { if (!(error instanceof HttpErrorResponse)) return 'Error inesperado'; const message = error.error?.message; return Array.isArray(message) ? message.join('. ') : message || 'La solicitud no pudo completarse'; }
}
