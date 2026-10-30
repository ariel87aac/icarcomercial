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
import { DistributionParte02 } from './distribution.02-loadVehicleOptions';

import { Directive } from '@angular/core';

@Directive()
export abstract class DistributionParte01 extends DistributionParte02 {
  protected override get preparationDetails(): FormArray { return this.preparationForm.controls.details; }

  protected override get visitDetails(): FormArray { return this.visitForm.controls.details; }

  protected override get settlementReturns(): FormArray { return this.settlementForm.controls.returns; }

  override ngOnInit(): void {
      this.selectInitialView();
      this.loadReferences();
      this.reload();
    }

  override ngOnDestroy(): void {
      this.destroyMap();
      if (this.searchTimer) clearTimeout(this.searchTimer);
      if (this.weightSearchTimer) clearTimeout(this.weightSearchTimer);
    }

  protected override selectInitialView(): void {
      if (this.mode() === 'warehouse') { this.view.set('preparations'); return; }
      if (this.auth.can('distribution.routes.read')) this.view.set('pending');
      else if (this.auth.can('vehicles.read')) this.view.set('vehicles');
      else if (this.auth.can('distribution.routes.assigned.read')) this.view.set('assigned');
      else if (this.auth.can('distribution.routes.read')) this.view.set('routes');
      else if (this.auth.can('distribution.weights.read')) this.view.set('weights');
      else this.view.set('summary');
    }

  protected override setView(view: DistributionView): void { this.view.set(view); this.reload(); }

  protected override reload(): void {
      if (this.view() === 'pending') this.loadPendingDeliveries();
      if (this.view() === 'preparations') this.loadPreparations();
      if (this.view() === 'vehicles') this.loadVehicles();
      if (this.view() === 'weights') this.loadWeights();
      if (this.view() === 'routes') this.loadRoutes();
      if (this.view() === 'assigned') this.loadAssigned();
      if (this.view() === 'summary') this.loadSummary();
    }

  protected override loadReferences(): void {
      if (this.auth.can('zones.read')) this.http.get<Zone[]>('/api/zones').subscribe({ next: (items) => this.zones.set(items.filter((item) => item.status === 'ACTIVO')) });
      if (this.mode() === 'distribution' && this.auth.can('vehicles.read')) { this.loadVehicles(); this.loadVehicleOptions(); }
      if (this.auth.can('distribution.routes.create')) this.http.get<User[]>('/api/distribution-routes/responsible-options').subscribe({ next: (items) => this.responsibles.set(items) });
    }

  protected override loadPendingDeliveries(): void {
      this.loading.set(true);
      let params = new HttpParams().set('page', this.pendingPage()).set('limit', this.pageSize());
      if (this.dateFilter()) params = params.set('deliveryDate', this.dateFilter());
      if (this.zoneFilter()) params = params.set('zoneId', this.zoneFilter()!);
      if (this.searchFilter().trim()) params = params.set('q', this.searchFilter().trim());
      this.http.get<Paginated<PendingDistributionPreparation>>('/api/distribution-routes/pending-deliveries', { params }).subscribe({
        next: (response) => { this.pendingPreparations.set(response.data); this.pendingMeta.set(response.meta); this.loading.set(false); },
        error: (error) => this.fail(error),
      });
    }

  protected override onPendingSearch(value: string): void { this.searchFilter.set(value); this.pendingPage.set(1); this.clearPendingSelection(); if (this.searchTimer) clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => this.loadPendingDeliveries(), 250); }

  protected override changePendingPage(event: PaginatorState): void { this.applyPageSize(event); this.pendingPage.set((event.page ?? 0) + 1); this.loadPendingDeliveries(); }

  protected override isPendingSelected(id: string): boolean { return this.selectedPendingPreparations().some((item) => item.id === id); }

  protected override allPendingPageSelected(): boolean { return this.pendingPreparations().length > 0 && this.pendingPreparations().every((item) => this.isPendingSelected(item.id)); }

  protected override togglePendingPreparation(item: PendingDistributionPreparation, selected: boolean): void {
      this.selectedPendingPreparations.update((items) => selected
        ? items.some((candidate) => candidate.id === item.id) ? items : [...items, item]
        : items.filter((candidate) => candidate.id !== item.id));
    }

  protected override togglePendingPage(selected: boolean): void {
      const pageIds = new Set(this.pendingPreparations().map((item) => item.id));
      this.selectedPendingPreparations.update((items) => selected
        ? [...items, ...this.pendingPreparations().filter((item) => !items.some((candidate) => candidate.id === item.id))]
        : items.filter((item) => !pageIds.has(item.id)));
    }

  protected override clearPendingSelection(): void { this.selectedPendingPreparations.set([]); }

  protected override selectedPendingZoneIds(): string[] { return [...new Set(this.selectedPendingPreparations().map((item) => item.order.address.zoneId).filter((id): id is string => Boolean(id)))]; }

  protected override selectedPendingWeight(): number { return this.selectedPendingPreparations().reduce((total, item) => total + Number(item.loadWeightKg), 0); }

  protected override selectedPendingProductCount(): number { return this.selectedPendingPreparations().reduce((total, item) => total + Number(item.detailCount ?? 0), 0); }

  protected override selectedPendingMissingWeights(): string[] { return [...new Set(this.selectedPendingPreparations().flatMap((item) => item.missingWeightPresentations))]; }

  protected override openRouteFromPending(): void {
      const selected = this.selectedPendingPreparations();
      const zoneIds = this.selectedPendingZoneIds();
      if (!selected.length) return;
      if (zoneIds.length !== 1) return this.messages.add({ severity: 'warn', summary: 'Selección incompatible', detail: 'Seleccione pedidos pertenecientes a una sola zona.' });
      const deliveryDate = [...selected].sort((a, b) => a.order.requestedDate.localeCompare(b.order.requestedDate))[0].order.requestedDate;
      this.routeDraftPreparations.set(selected);
      this.routeForm.reset({ date: deliveryDate, zoneId: zoneIds[0], vehicleId: '', responsibleIds: [], principalResponsibleId: '', observation: '' });
      this.routeDialog.set(true);
    }

  protected override openFactoryDelivery(): void {
      const selected = this.selectedPendingPreparations();
      if (selected.length !== 1) {
        return this.messages.add({ severity: 'warn', summary: 'Seleccione un pedido', detail: 'La entrega en fábrica se registra para un pedido a la vez.' });
      }
      this.loading.set(true);
      this.http.get<OrderPreparation>(`/api/preparations/${selected[0].id}`).subscribe({
        next: (preparation) => {
          this.loading.set(false);
          this.openVisit({
            id: '',
            routeId: null,
            deliveryType: 'FABRICA',
            preparationId: preparation.id,
            preparation,
            orderId: preparation.orderId,
            order: preparation.order,
            addressId: preparation.order.addressId,
            address: preparation.order.address,
            position: null,
            status: 'PENDIENTE',
            result: null,
          });
        },
        error: (error) => this.fail(error),
      });
    }

  protected override routeDraftWeight(): number { return this.routeDraftPreparations().reduce((total, item) => total + Number(item.loadWeightKg), 0); }

  protected override routeDraftMissingWeights(): string[] { return [...new Set(this.routeDraftPreparations().flatMap((item) => item.missingWeightPresentations))]; }

  protected override routeDraftCapacityExceeded(): boolean { const vehicle = this.activeVehicles().find((item) => item.id === this.routeForm.controls.vehicleId.value); return Boolean(vehicle?.capacityKg) && this.routeDraftWeight() > Number(vehicle!.capacityKg) + 0.0005; }

  protected override routeDraftCapacityLabel(): string {
      const vehicle = this.activeVehicles().find((item) => item.id === this.routeForm.controls.vehicleId.value);
      if (!vehicle) return 'Seleccione un vehículo';
      if (!vehicle.capacityKg) return 'Sin capacidad configurada';
      const difference = Number(vehicle.capacityKg) - this.routeDraftWeight();
      return difference < -0.0005 ? `Excede por ${this.number(Math.abs(difference))} kg` : `${this.number(difference)} kg disponibles`;
    }

  protected override filterParams(page: number): HttpParams {
      let params = new HttpParams().set('page', page).set('limit', this.pageSize());
      if (this.dateFilter()) params = params.set('deliveryDate', this.dateFilter());
      if (this.zoneFilter()) params = params.set('zoneId', this.zoneFilter()!);
      if (this.searchFilter().trim()) params = params.set('q', this.searchFilter().trim());
      return params;
    }

  protected override loadPreparations(): void {
      this.loading.set(true);
      const preparationParams = this.filterParams(this.preparationPage()).set('stage', 'READY');
      if (this.auth.can('preparations.create')) {
        this.http.get<Paginated<PreparationWorkOrder>>('/api/preparations/work-queue', { params: this.filterParams(this.eligiblePage()) }).subscribe({ next: (response) => { this.workOrders.set(response.data); this.eligibleMeta.set(response.meta); }, error: (error) => this.fail(error) });
      }
      this.http.get<Paginated<OrderPreparation>>('/api/preparations', { params: preparationParams }).subscribe({ next: (response) => { this.preparations.set(response.data); this.preparationMeta.set(response.meta); this.loading.set(false); }, error: (error) => this.fail(error) });
    }

  protected override resetPreparationPages(): void { this.eligiblePage.set(1); this.preparationPage.set(1); }

  protected override onPreparationSearch(value: string): void { this.searchFilter.set(value); this.resetPreparationPages(); if (this.searchTimer) clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => this.loadPreparations(), 250); }

  protected override changeEligiblePage(event: PaginatorState): void { this.applyPageSize(event); this.eligiblePage.set((event.page ?? 0) + 1); this.loadPreparations(); }

  protected override changePreparationPage(event: PaginatorState): void { this.applyPageSize(event); this.preparationPage.set((event.page ?? 0) + 1); this.loadPreparations(); }

  protected override prepareWorkOrder(order: PreparationWorkOrder): void {
      if (order.preparation) return this.openPreparation(order.preparation);
      this.saving.set(true);
      this.http.post<OrderPreparation>('/api/preparations', { orderId: order.id }).subscribe({
        next: (item) => { this.saving.set(false); this.saved('Preparación iniciada', order.code); this.loadPreparations(); this.openPreparation(item); },
        error: (error) => this.failSave(error),
      });
    }

  protected override openPreparation(item: OrderPreparation): void {
      this.http.get<OrderPreparation>(`/api/preparations/${item.id}`).subscribe({
        next: (value) => { this.selectedPreparation.set(value); this.buildPreparationForm(value); this.preparationDialog.set(true); },
        error: (error) => this.fail(error),
      });
    }

  protected override buildPreparationForm(preparation: OrderPreparation): void {
      this.preparationDetails.clear();
      for (const detail of preparation.details) {
        const preparedQuantity = preparation.status === 'PENDIENTE' && !detail.verifiedAt
          ? Number(detail.requestedQuantity)
          : Number(detail.preparedQuantity);
        this.preparationDetails.push(this.fb.nonNullable.group({
          id: [detail.id], preparedQuantity: [preparedQuantity, [Validators.required, Validators.min(0), Validators.max(this.preparationQuantityLimit(detail))]],
          verified: [Boolean(detail.verifiedAt)], observation: [detail.observation ?? ''],
        }));
      }
    }

  protected override canSubmitPreparation(): boolean {
      const preparation = this.selectedPreparation();
      if (!preparation || this.preparationForm.invalid || !this.canEditPreparation(preparation.status)) return false;
      const details = this.preparationDetails.getRawValue();
      return details.length > 0 && details.every((detail) => detail.verified && detail.preparedQuantity === Number(preparation.details.find((item) => item.id === detail.id)?.requestedQuantity) && Number(preparation.details.find((item) => item.id === detail.id)?.pickableQuantityCurrent ?? 0) >= detail.preparedQuantity);
    }

  protected override prepareCurrent(): void {
      const preparation = this.selectedPreparation();
      if (!preparation || !this.canSubmitPreparation()) return this.preparationForm.markAllAsTouched();
      const details = this.preparationDetails.getRawValue();
      this.saving.set(true);
      const savePayload = { details: details.map((detail) => ({ preparationDetailId: detail.id, preparedQuantity: detail.preparedQuantity, verified: detail.verified, observation: detail.observation || undefined })) };
      this.http.post<OrderPreparation>(`/api/preparations/${preparation.id}/progress`, savePayload).subscribe({
        next: () => this.http.post<OrderPreparation>(`/api/preparations/${preparation.id}/confirm`, {}).subscribe({ next: (value) => { this.saving.set(false); this.preparationDialog.set(false); this.selectedPreparation.set(value); this.saved('Verificación terminada; pendiente de entregar a Distribución', preparation.order.code); this.loadPreparations(); }, error: (error) => this.failSave(error) }),
        error: (error) => this.failSave(error),
      });
    }

  protected override openPreparationCancellation(): void { this.reasonForm.reset({ reason: '' }); this.preparationCancelDialog.set(true); }

  protected override requestPreparationCancellation(item: OrderPreparation): void { this.selectedPreparation.set(item); this.openPreparationCancellation(); }

  protected override editPrepared(item: OrderPreparation): void {
      this.saving.set(true);
      this.http.post<OrderPreparation>(`/api/preparations/${item.id}/reopen`, {}).subscribe({
        next: (value) => { this.saving.set(false); this.selectedPreparation.set(value); this.buildPreparationForm(value); this.preparationDialog.set(true); this.loadPreparations(); },
        error: (error) => this.failSave(error),
      });
    }

  protected override handoffPreparation(item: OrderPreparation): void {
      this.saving.set(true);
      this.http.post<OrderPreparation>(`/api/preparations/${item.id}/handoff`, {}).subscribe({
        next: () => { this.saving.set(false); this.saved('Pedido entregado a Distribución', item.order.code); this.loadPreparations(); },
        error: (error) => this.failSave(error),
      });
    }

  protected override cancelPreparation(): void {
      const preparation = this.selectedPreparation();
      if (!preparation || this.reasonForm.invalid) return this.reasonForm.markAllAsTouched();
      this.saving.set(true);
      this.http.post<OrderPreparation>(`/api/preparations/${preparation.id}/cancel`, this.reasonForm.getRawValue()).subscribe({
        next: (value) => { this.saving.set(false); this.preparationCancelDialog.set(false); this.preparationDialog.set(false); this.selectedPreparation.set(value); this.saved('Preparación cancelada', preparation.order.code); this.loadPreparations(); },
        error: (error) => this.failSave(error),
      });
    }

  protected override loadVehicles(): void {
      this.loading.set(true);
      this.http.get<Paginated<Vehicle>>('/api/vehicles', { params: new HttpParams().set('page', this.vehiclePage()).set('limit', this.pageSize()) }).subscribe({ next: (response) => { this.vehicles.set(response.data); this.vehicleMeta.set(response.meta); this.loading.set(false); }, error: (error) => this.fail(error) });
    }

  protected override changeVehiclePage(event: PaginatorState): void { this.applyPageSize(event); this.vehiclePage.set((event.page ?? 0) + 1); this.loadVehicles(); }
}
