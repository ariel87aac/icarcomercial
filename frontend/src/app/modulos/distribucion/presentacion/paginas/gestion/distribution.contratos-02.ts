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
import { DistributionContratos01 } from './distribution.contratos-01';

import { Directive } from '@angular/core';

@Directive()
export abstract class DistributionContratos02 extends DistributionContratos01 {
  protected abstract createRoute(): void;

  protected abstract openRouteDetail(route: DistributionRoute): void;

  protected abstract closeRouteDetail(visible: boolean): void;

  protected abstract loadPreparedOptions(route: DistributionRoute): void;

  protected abstract addDeliveries(): void;

  protected abstract removeRouteDelivery(delivery: RouteDelivery): void;

  protected abstract moveDelivery(index: number, offset: number): void;

  protected abstract saveSequence(): void;

  protected abstract changeRouteVehicle(): void;

  protected abstract routeAction(action: 'plan' | 'departure' | 'finish'): void;

  protected abstract openRouteReschedule(): void;

  protected abstract rescheduleRoute(): void;

  protected abstract openRouteCancellation(): void;

  protected abstract cancelRoute(): void;

  protected abstract updateSelectedRoute(route: DistributionRoute): void;

  protected abstract openAssignedRoute(route: DistributionRoute): void;

  protected abstract closeAssignedDialog(visible: boolean): void;

  protected abstract openVisit(delivery: RouteDelivery): void;

  protected abstract registerVisit(rejected: boolean): void;

  protected abstract returnedFor(index: number): number;

  protected abstract preparedVisitTotal(): number;

  protected abstract deliveredVisitTotal(): number;

  protected abstract returnedVisitTotal(): number;

  protected abstract deliveryLineTotal(index: number): number;

  protected abstract deliveredVisitAmount(): number;

  protected abstract routeHasReturns(route: DistributionRoute): boolean;

  protected abstract openSettlement(): void;

  protected abstract settleRoute(): void;

  protected abstract renderMap(elementId: string, route: DistributionRoute): void;

  protected abstract renderMapSoon(elementId: string): void;

  protected abstract destroyMap(): void;

  protected abstract hasCoordinates(delivery: RouteDelivery): boolean;

  protected abstract canEditPreparation(status: PreparationStatus): boolean;

  protected abstract canConfirmPreparation(status: PreparationStatus): boolean;

  protected abstract canCancelPreparation(status: PreparationStatus): boolean;

  protected abstract detailDifference(index: number): number;

  protected abstract preparationQuantityLimit(detail: OrderPreparationDetail): number;

  protected abstract productionOrderLabels(detail: OrderPreparationDetail): string;

  protected abstract preparationTitle(): string;

  protected abstract routeTitle(): string;

  protected abstract principal(route: DistributionRoute): string;

  protected abstract controlsAllDeliveries(): boolean;

  protected abstract orderTotal(order: EligibleOrder, key: 'reservedQuantity'): string;

  protected abstract availableLines(order: EligibleOrder): number;

  protected abstract availableTotal(order: EligibleOrder): string;

  protected abstract availableTotalNumber(order: EligibleOrder): number;

  protected abstract summaryTotal(key: 'complete' | 'partial' | 'notDelivered'): number;

  protected abstract routeRemainingCapacity(route: DistributionRoute): number;

  protected abstract prospectiveExcess(route: DistributionRoute): number;

  protected abstract prospectiveCapacityLabel(route: DistributionRoute): string;

  protected abstract statusLabel(value: string): string;

  protected abstract preparationSeverity(status: PreparationStatus): 'info' | 'warn' | 'success' | 'secondary' | 'danger';

  protected abstract routeSeverity(status: DistributionRouteStatus): 'info' | 'warn' | 'success' | 'secondary' | 'danger';

  protected abstract visitSeverity(result: VisitResultType): 'success' | 'warn' | 'danger';

  protected abstract formatDate(value: string): string;

  protected abstract formatDateTime(value: string): string;

  protected abstract number(value: string | number): string;

  protected abstract money(value: string | number): string;

  protected abstract numberValue(value: string | number): number;

  protected abstract applyPageSize(event: PaginatorState): void;

  protected abstract saved(summary: string, detail: string): void;

  protected abstract fail(error: unknown): void;

  protected abstract failSave(error: unknown): void;

  protected abstract error(error: unknown): string;
}
