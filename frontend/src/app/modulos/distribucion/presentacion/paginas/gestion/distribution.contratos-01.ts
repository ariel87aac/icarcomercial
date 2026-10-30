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

import { Directive } from '@angular/core';

@Directive()
export abstract class DistributionContratos01 {
  protected abstract get preparationDetails(): FormArray;

  protected abstract get visitDetails(): FormArray;

  protected abstract get settlementReturns(): FormArray;

  abstract ngOnInit(): void;

  abstract ngOnDestroy(): void;

  protected abstract selectInitialView(): void;

  protected abstract setView(view: DistributionView): void;

  protected abstract reload(): void;

  protected abstract loadReferences(): void;

  protected abstract loadPendingDeliveries(): void;

  protected abstract onPendingSearch(value: string): void;

  protected abstract changePendingPage(event: PaginatorState): void;

  protected abstract isPendingSelected(id: string): boolean;

  protected abstract allPendingPageSelected(): boolean;

  protected abstract togglePendingPreparation(item: PendingDistributionPreparation, selected: boolean): void;

  protected abstract togglePendingPage(selected: boolean): void;

  protected abstract clearPendingSelection(): void;

  protected abstract selectedPendingZoneIds(): string[];

  protected abstract selectedPendingWeight(): number;

  protected abstract selectedPendingProductCount(): number;

  protected abstract selectedPendingMissingWeights(): string[];

  protected abstract openRouteFromPending(): void;

  protected abstract openFactoryDelivery(): void;

  protected abstract routeDraftWeight(): number;

  protected abstract routeDraftMissingWeights(): string[];

  protected abstract routeDraftCapacityExceeded(): boolean;

  protected abstract routeDraftCapacityLabel(): string;

  protected abstract filterParams(page: number): HttpParams;

  protected abstract loadPreparations(): void;

  protected abstract resetPreparationPages(): void;

  protected abstract onPreparationSearch(value: string): void;

  protected abstract changeEligiblePage(event: PaginatorState): void;

  protected abstract changePreparationPage(event: PaginatorState): void;

  protected abstract prepareWorkOrder(order: PreparationWorkOrder): void;

  protected abstract openPreparation(item: OrderPreparation): void;

  protected abstract buildPreparationForm(preparation: OrderPreparation): void;

  protected abstract canSubmitPreparation(): boolean;

  protected abstract prepareCurrent(): void;

  protected abstract openPreparationCancellation(): void;

  protected abstract requestPreparationCancellation(item: OrderPreparation): void;

  protected abstract editPrepared(item: OrderPreparation): void;

  protected abstract handoffPreparation(item: OrderPreparation): void;

  protected abstract cancelPreparation(): void;

  protected abstract loadVehicles(): void;

  protected abstract changeVehiclePage(event: PaginatorState): void;

  protected abstract loadVehicleOptions(): void;

  protected abstract activeVehicles(): Vehicle[];

  protected abstract vehicleOptions(): Array<{
        id: string;
        label: string;
    }>;

  protected abstract openVehicle(item?: Vehicle): void;

  protected abstract saveVehicle(): void;

  protected abstract loadWeights(): void;

  protected abstract onWeightSearch(value: string): void;

  protected abstract changeWeightPage(event: PaginatorState): void;

  protected abstract setWeightDraft(id: string, value: number | null): void;

  protected abstract pendingWeightItems(): Array<{
        presentationId: string;
        weightKg: number;
    }>;

  protected abstract saveWeights(): void;

  protected abstract routeParams(page: number): HttpParams;

  protected abstract loadRoutes(): void;

  protected abstract loadSummary(): void;

  protected abstract loadAssigned(): void;

  protected abstract resetRoutePages(): void;

  protected abstract onRouteSearch(value: string): void;

  protected abstract changeRoutePage(event: PaginatorState): void;

  protected abstract changeSummaryPage(event: PaginatorState): void;

  protected abstract openRoute(): void;
}
