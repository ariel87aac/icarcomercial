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
import { DistributionParte03 } from './distribution.03-preparationSeverity';
import { DistributionOperacionesRutaB } from './distribution.02b-operaciones-ruta';

import { Directive } from '@angular/core';

@Directive()
export abstract class DistributionOperacionesRutaA extends DistributionOperacionesRutaB {
  protected override loadVehicleOptions(): void { this.http.get<Paginated<Vehicle>>('/api/vehicles', { params: new HttpParams().set('limit', 100) }).subscribe({ next: (response) => this.allVehicles.set(response.data) }); }

  protected override activeVehicles(): Vehicle[] { return this.allVehicles().filter((item) => item.status === 'ACTIVO'); }

  protected override vehicleOptions(): Array<{ id: string; label: string }> {
        return this.activeVehicles().map((item) => ({ id: item.id, label: `${item.plate} · ${item.capacityKg ? `${this.number(item.capacityKg)} kg` : 'sin capacidad'}` }));
      }

  protected override openVehicle(item?: Vehicle): void {
        this.editingVehicleId.set(item?.id ?? null);
        this.vehicleForm.reset({ plate: item?.plate ?? '', description: item?.description ?? '', capacityKg: item?.capacityKg ? Number(item.capacityKg) : null, status: item?.status ?? 'ACTIVO' });
        this.vehicleDialog.set(true);
      }

  protected override saveVehicle(): void {
        if (this.vehicleForm.invalid) return this.vehicleForm.markAllAsTouched();
        const value = this.vehicleForm.getRawValue();
        const id = this.editingVehicleId();
        const basePayload = { plate: value.plate, description: value.description, capacityKg: value.capacityKg! };
        const payload = id ? { ...basePayload, status: value.status } : basePayload;
        this.saving.set(true);
        const request = id ? this.http.patch<Vehicle>(`/api/vehicles/${id}`, payload) : this.http.post<Vehicle>('/api/vehicles', payload);
        request.subscribe({ next: () => { this.saving.set(false); this.vehicleDialog.set(false); this.saved(id ? 'Vehículo actualizado' : 'Vehículo registrado', value.plate || ''); this.loadVehicles(); this.loadVehicleOptions(); }, error: (error) => this.failSave(error) });
      }

  protected override loadWeights(): void {
        this.loading.set(true);
        let params = new HttpParams().set('page', this.weightPage()).set('limit', this.pageSize()).set('missingOnly', this.missingWeightsOnly());
        if (this.weightSearch().trim()) params = params.set('q', this.weightSearch().trim());
        this.http.get<Paginated<ProductPresentation>>('/api/distribution-routes/weight-readiness', { params }).subscribe({
          next: (response) => {
            this.weightItems.set(response.data);
            this.weightMeta.set(response.meta);
            this.weightDrafts.set(Object.fromEntries(response.data.map((item) => [item.id, item.weightKg ? Number(item.weightKg) : null])));
            this.loading.set(false);
          },
          error: (error) => this.fail(error),
        });
      }

  protected override onWeightSearch(value: string): void { this.weightSearch.set(value); this.weightPage.set(1); if (this.weightSearchTimer) clearTimeout(this.weightSearchTimer); this.weightSearchTimer = setTimeout(() => this.loadWeights(), 250); }

  protected override changeWeightPage(event: PaginatorState): void { this.applyPageSize(event); this.weightPage.set((event.page ?? 0) + 1); this.loadWeights(); }

  protected override setWeightDraft(id: string, value: number | null): void { this.weightDrafts.set({ ...this.weightDrafts(), [id]: value === null ? null : Number(value) }); }

  protected override pendingWeightItems(): Array<{ presentationId: string; weightKg: number }> {
        return this.weightItems().flatMap((item) => {
          const value = this.weightDrafts()[item.id];
          return value && value > 0 && Math.abs(value - Number(item.weightKg ?? 0)) > 0.0000005 ? [{ presentationId: item.id, weightKg: value }] : [];
        });
      }

  protected override saveWeights(): void {
        const items = this.pendingWeightItems();
        if (!items.length) return;
        this.saving.set(true);
        this.http.put<{ updated: number }>('/api/distribution-routes/presentation-weights', { items }).subscribe({
          next: (response) => { this.saving.set(false); this.saved('Pesos actualizados', `${response.updated} presentación(es)`); this.loadWeights(); },
          error: (error) => this.failSave(error),
        });
      }

  protected override routeParams(page: number): HttpParams {
        let params = new HttpParams().set('page', page).set('limit', this.pageSize());
        if (this.dateFilter()) params = params.set('date', this.dateFilter());
        if (this.zoneFilter()) params = params.set('zoneId', this.zoneFilter()!);
        if (this.routeStatusFilter()) params = params.set('status', this.routeStatusFilter()!);
        if (this.searchFilter().trim()) params = params.set('q', this.searchFilter().trim());
        return params;
      }

  protected override loadRoutes(): void { this.loading.set(true); this.http.get<Paginated<DistributionRoute>>('/api/distribution-routes', { params: this.routeParams(this.routePage()) }).subscribe({ next: (response) => { this.routes.set(response.data); this.routeMeta.set(response.meta); this.loading.set(false); }, error: (error) => this.fail(error) }); }

  protected override loadSummary(): void { this.loading.set(true); this.http.get<Paginated<DistributionRoute>>('/api/distribution-routes/summary', { params: this.routeParams(this.summaryPage()) }).subscribe({ next: (response) => { this.summaryRoutes.set(response.data); this.summaryMeta.set(response.meta); this.loading.set(false); }, error: (error) => this.fail(error) }); }

  protected override loadAssigned(): void { this.loading.set(true); this.http.get<DistributionRoute[]>('/api/distribution-routes/my-route').subscribe({ next: (items) => { this.assignedRoutes.set(items); this.loading.set(false); }, error: (error) => this.fail(error) }); }

  protected override resetRoutePages(): void { this.routePage.set(1); this.summaryPage.set(1); }

  protected override onRouteSearch(value: string): void { this.searchFilter.set(value); this.resetRoutePages(); if (this.searchTimer) clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => this.reload(), 250); }

  protected override changeRoutePage(event: PaginatorState): void { this.applyPageSize(event); this.routePage.set((event.page ?? 0) + 1); this.loadRoutes(); }

  protected override changeSummaryPage(event: PaginatorState): void { this.applyPageSize(event); this.summaryPage.set((event.page ?? 0) + 1); this.loadSummary(); }

  protected override openRoute(): void { this.routeDraftPreparations.set([]); this.routeForm.reset({ date: this.dateFilter(), zoneId: this.zoneFilter() ?? '', vehicleId: '', responsibleIds: [], principalResponsibleId: '', observation: '' }); this.routeDialog.set(true); }

  protected override createRoute(): void {
        if (this.routeForm.invalid) return this.routeForm.markAllAsTouched();
        const raw = this.routeForm.getRawValue();
        if (!raw.responsibleIds.includes(raw.principalResponsibleId)) return this.messages.add({ severity: 'warn', summary: 'Asignación incompleta', detail: 'El responsable principal debe estar incluido en los responsables asignados.' });
        if (this.routeDraftCapacityExceeded()) return this.messages.add({ severity: 'warn', summary: 'Capacidad excedida', detail: 'Seleccione un vehículo con capacidad suficiente para la carga.' });
        this.saving.set(true);
        const preparationIds = this.routeDraftPreparations().map((item) => item.id);
        this.http.post<DistributionRoute>('/api/distribution-routes', { ...raw, preparationIds: preparationIds.length ? preparationIds : undefined, observation: raw.observation || undefined }).subscribe({ next: (route) => { this.saving.set(false); this.routeDialog.set(false); this.routeDraftPreparations.set([]); this.clearPendingSelection(); this.saved(preparationIds.length ? 'Ruta creada y pedidos asignados' : 'Ruta creada', route.code); this.loadPendingDeliveries(); this.loadRoutes(); this.openRouteDetail(route); }, error: (error) => this.failSave(error) });
      }

  protected override openRouteDetail(route: DistributionRoute): void { this.http.get<DistributionRoute>(`/api/distribution-routes/${route.id}`).subscribe({ next: (value) => { this.selectedRoute.set(value); this.routeVehicleId.set(value.vehicleId); this.routeDetailDialog.set(true); this.loadPreparedOptions(value); setTimeout(() => this.renderMap('distribution-route-map', value), 80); }, error: (error) => this.fail(error) }); }

  protected override closeRouteDetail(visible: boolean): void { this.routeDetailDialog.set(visible); if (!visible) this.destroyMap(); }

  protected override loadPreparedOptions(route: DistributionRoute): void {
        const params = new HttpParams().set('limit', 100).set('stage', 'HANDED_OFF').set('zoneId', route.zoneId);
        this.http.get<Paginated<OrderPreparation>>('/api/preparations', { params }).subscribe({ next: (response) => this.preparedOptions.set(response.data.map((item) => ({ id: item.id, label: `${item.order.code} · ${item.order.customerNameSnapshot || item.order.customer.businessName} · compromiso ${this.formatDate(item.order.requestedDate)}` }))) });
      }

  protected override addDeliveries(): void { const route = this.selectedRoute(); if (!route || !this.selectedPreparationIds().length) return; this.saving.set(true); this.http.post<DistributionRoute>(`/api/distribution-routes/${route.id}/deliveries`, { preparationIds: this.selectedPreparationIds() }).subscribe({ next: (value) => { this.saving.set(false); this.selectedPreparationIds.set([]); this.updateSelectedRoute(value); this.loadPreparedOptions(value); this.saved('Pedidos agregados', value.code); }, error: (error) => this.failSave(error) }); }

  protected override removeRouteDelivery(delivery: RouteDelivery): void { const route = this.selectedRoute(); if (!route) return; this.saving.set(true); this.http.delete<DistributionRoute>(`/api/distribution-routes/${route.id}/deliveries/${delivery.id}`).subscribe({ next: (value) => { this.saving.set(false); this.updateSelectedRoute(value); this.loadPreparedOptions(value); this.saved('Pedido retirado', delivery.order.code); }, error: (error) => this.failSave(error) }); }

  protected override moveDelivery(index: number, offset: number): void { const route = this.selectedRoute(); if (!route) return; const target = index + offset; if (target < 0 || target >= route.deliveries.length) return; const deliveries = [...route.deliveries]; [deliveries[index], deliveries[target]] = [deliveries[target], deliveries[index]]; deliveries.forEach((delivery, position) => delivery.position = position + 1); this.selectedRoute.set({ ...route, deliveries }); this.renderMapSoon('distribution-route-map'); }

  protected override saveSequence(): void { const route = this.selectedRoute(); if (!route) return; this.saving.set(true); this.http.put<DistributionRoute>(`/api/distribution-routes/${route.id}/sequence`, { deliveries: route.deliveries.map((delivery, index) => ({ routeDeliveryId: delivery.id, position: index + 1 })) }).subscribe({ next: (value) => { this.saving.set(false); this.updateSelectedRoute(value); this.saved('Secuencia guardada', value.code); }, error: (error) => this.failSave(error) }); }

  protected override changeRouteVehicle(): void { const route = this.selectedRoute(); const vehicleId = this.routeVehicleId(); if (!route || !vehicleId || vehicleId === route.vehicleId) return; this.saving.set(true); this.http.put<DistributionRoute>(`/api/distribution-routes/${route.id}/vehicle`, { vehicleId }).subscribe({ next: (value) => { this.saving.set(false); this.updateSelectedRoute(value); this.saved('Vehículo actualizado', value.vehicle.plate); this.loadRoutes(); }, error: (error) => this.failSave(error) }); }

  protected override routeAction(action: 'plan'|'departure'|'finish'): void { const route = this.selectedRoute(); if (!route) return; this.saving.set(true); this.http.post<DistributionRoute>(`/api/distribution-routes/${route.id}/${action}`, {}).subscribe({ next: (value) => { this.saving.set(false); this.updateSelectedRoute(value); this.saved(action==='plan'?'Ruta planificada':action==='departure'?'Salida registrada':'Recorrido finalizado', value.code); this.loadRoutes(); }, error: (error) => this.failSave(error) }); }

  protected override openRouteReschedule(): void { const route = this.selectedRoute(); if (!route) return; this.rescheduleForm.reset({ date: route.date, reason: '' }); this.routeRescheduleDialog.set(true); }

  protected override rescheduleRoute(): void { const route = this.selectedRoute(); if (!route || this.rescheduleForm.invalid) return this.rescheduleForm.markAllAsTouched(); this.saving.set(true); this.http.put<DistributionRoute>(`/api/distribution-routes/${route.id}/reschedule`, this.rescheduleForm.getRawValue()).subscribe({ next: (value) => { this.saving.set(false); this.routeRescheduleDialog.set(false); this.updateSelectedRoute(value); this.saved('Ruta reprogramada', this.formatDate(value.date)); this.loadRoutes(); }, error: (error) => this.failSave(error) }); }

  protected override openRouteCancellation(): void { this.reasonForm.reset({ reason: '' }); this.routeCancelDialog.set(true); }

  protected override cancelRoute(): void { const route = this.selectedRoute(); if (!route || this.reasonForm.invalid) return this.reasonForm.markAllAsTouched(); this.saving.set(true); this.http.post<DistributionRoute>(`/api/distribution-routes/${route.id}/cancel`, this.reasonForm.getRawValue()).subscribe({ next: (value) => { this.saving.set(false); this.routeCancelDialog.set(false); this.updateSelectedRoute(value); this.saved('Ruta cancelada', value.code); this.loadRoutes(); }, error: (error) => this.failSave(error) }); }

  protected override updateSelectedRoute(route: DistributionRoute): void { this.selectedRoute.set(route); this.routeVehicleId.set(route.vehicleId); this.renderMapSoon('distribution-route-map'); }

  protected override openAssignedRoute(route: DistributionRoute): void { this.selectedRoute.set(route); this.assignedDialog.set(true); setTimeout(() => this.renderMap('assigned-route-map', route), 80); }
}
