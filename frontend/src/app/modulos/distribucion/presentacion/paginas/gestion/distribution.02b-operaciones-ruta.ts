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
import { distributionStatusLabel } from './distribution-labels';

import { Directive } from '@angular/core';

@Directive()
export abstract class DistributionOperacionesRutaB extends DistributionParte03 {
  protected override closeAssignedDialog(visible: boolean): void { this.assignedDialog.set(visible); if (!visible) this.destroyMap(); }

  protected override openVisit(delivery: RouteDelivery): void {
        this.selectedDelivery.set(delivery);
        this.visitForm.reset({ result: 'ENTREGADA', observation: '' });
        this.visitDetails.clear();
        for (const detail of delivery.preparation.details) {
          const maximum = Number(detail.preparedQuantity);
          this.visitDetails.push(this.fb.nonNullable.group({
            id: [detail.id],
            deliveredQuantity: [maximum, [Validators.required, Validators.min(0), Validators.max(maximum)]],
          }));
        }
        this.visitDialog.set(true);
      }

  protected override registerVisit(rejected = false): void {
        const delivery = this.selectedDelivery();
        if (!delivery || this.visitForm.invalid) return this.visitForm.markAllAsTouched();
        if (rejected) this.visitDetails.controls.forEach((control) => control.get('deliveredQuantity')?.setValue(0));
        const raw = this.visitForm.getRawValue();
        const deliveredTotal = this.deliveredVisitTotal();
        const preparedTotal = this.preparedVisitTotal();
        if (!rejected && deliveredTotal <= 0) return this.messages.add({ severity: 'warn', summary: 'Use Rechazar pedido', detail: 'Una entrega sin cantidades debe registrarse con el botón Rechazar pedido.' });
        const result: VisitResultType = rejected ? 'NO_ENTREGADA' : deliveredTotal < preparedTotal - 0.0005 ? 'ENTREGA_PARCIAL' : 'ENTREGADA';
        if (result !== 'ENTREGADA' && !raw.observation.trim()) return this.messages.add({ severity: 'warn', summary: 'Observación requerida', detail: 'Explique la entrega parcial o el rechazo del cliente.' });
        this.saving.set(true);
        const details = this.visitDetails.getRawValue().map((item, index) => {
          const prepared = Number(delivery.preparation.details[index].preparedQuantity);
          const delivered = Number(item.deliveredQuantity);
          return { preparationDetailId: item.id, deliveredQuantity: delivered, returnedQuantity: Math.max(0, prepared - delivered) };
        });
        const payload = { result, observation: raw.observation || undefined, details };
        if (delivery.deliveryType === 'FABRICA') {
          this.http.post<FactoryDeliveryCompletion>('/api/entregas-fabrica', { preparationId: delivery.preparationId, ...payload }).subscribe({
            next: (response) => {
              this.saving.set(false);
              this.visitDialog.set(false);
              this.selectedDelivery.set(response.delivery);
              this.clearPendingSelection();
              this.loadPendingDeliveries();
              this.saved(response.generatedSale ? 'Entrega en fábrica y nota de venta registradas' : 'Pedido rechazado en fábrica', response.generatedSale ? `Venta ${response.generatedSale.code} · Bs ${response.generatedSale.total} · vence ${response.generatedSale.dueDate}` : delivery.order.code);
            },
            error: (error) => this.failSave(error),
          });
          return;
        }
        this.http.post<DistributionRoute>(`/api/route-deliveries/${delivery.id}/result`, payload).subscribe({
          next: (route) => {
            this.saving.set(false);
            this.visitDialog.set(false);
            this.selectedRoute.set(route);
            this.assignedRoutes.update((items) => items.map((item) => item.id === route.id ? route : item));
            this.saved(route.generatedSale ? 'Entrega y nota de venta registradas' : 'Pedido rechazado', route.generatedSale ? `Venta ${route.generatedSale.code} · Bs ${route.generatedSale.total} · vence ${route.generatedSale.dueDate}` : delivery.order.code);
            this.renderMapSoon('assigned-route-map');
          },
          error: (error) => this.failSave(error),
        });
      }

  protected override returnedFor(index: number): number {
        const delivery = this.selectedDelivery();
        if (!delivery) return 0;
        return Math.max(0, Number(delivery.preparation.details[index].preparedQuantity) - Number(this.visitDetails.at(index).get('deliveredQuantity')?.value ?? 0));
      }

  protected override preparedVisitTotal(): number { return this.selectedDelivery()?.preparation.details.reduce((sum, detail) => sum + Number(detail.preparedQuantity), 0) ?? 0; }

  protected override deliveredVisitTotal(): number { return this.visitDetails.controls.reduce((sum, control) => sum + Number(control.get('deliveredQuantity')?.value ?? 0), 0); }

  protected override returnedVisitTotal(): number { return Math.max(0, this.preparedVisitTotal() - this.deliveredVisitTotal()); }

  protected override deliveryLineTotal(index: number): number { const delivery = this.selectedDelivery(); return delivery ? Number(this.visitDetails.at(index).get('deliveredQuantity')?.value ?? 0) * Number(delivery.preparation.details[index].orderDetail.unitPrice) : 0; }

  protected override deliveredVisitAmount(): number { return this.visitDetails.controls.reduce((sum, _control, index) => sum + this.deliveryLineTotal(index), 0); }

  protected override routeHasReturns(route: DistributionRoute): boolean { return route.deliveries.some((delivery) => delivery.result?.details.some((detail) => Number(detail.returnedQuantity) > 0)); }

  protected override openSettlement(): void { const route = this.selectedRoute(); if (!route) return; this.settlementReturns.clear(); const labels: string[] = []; const maximums: number[] = []; for (const delivery of route.deliveries) for (const detail of delivery.result?.details ?? []) if (Number(detail.returnedQuantity) > 0) { this.settlementReturns.push(this.fb.nonNullable.group({ id: [detail.id], quantity: [0, [Validators.required, Validators.min(0), Validators.max(Number(detail.returnedQuantity))]] })); labels.push(`${delivery.order.code} · ${detail.preparationDetail.orderDetail.productDescriptionSnapshot}`); maximums.push(Number(detail.returnedQuantity)); } this.settlementLabels.set(labels); this.settlementMaximums.set(maximums); this.settlementForm.controls.observation.setValue(''); this.settlementDialog.set(true); }

  protected override settleRoute(): void { const route = this.selectedRoute(); if (!route || this.settlementForm.invalid) return this.settlementForm.markAllAsTouched(); this.saving.set(true); const raw = this.settlementForm.getRawValue(); this.http.post<DistributionRoute>(`/api/distribution-routes/${route.id}/settlement`, { observation: raw.observation || undefined, acceptedReturns: this.settlementReturns.getRawValue().map((item) => ({ visitDetailId: item.id, quantity: item.quantity })) }).subscribe({ next: (value) => { this.saving.set(false); this.settlementDialog.set(false); this.updateSelectedRoute(value); this.saved('Ruta liquidada', value.code); this.loadRoutes(); }, error: (error) => this.failSave(error) }); }

  protected override renderMap(elementId: string, route: DistributionRoute): void {
        this.destroyMap();
        const element = document.getElementById(elementId);
        if (!element) return;
        const points = route.deliveries.filter((delivery) => this.hasCoordinates(delivery));
        const fallback: L.LatLngExpression = [-16.4897, -68.1193];
        this.map = L.map(element, { center: fallback, zoom: 12, zoomControl: true });
        const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(this.map);
        const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles &copy; Esri' });
        L.control.layers({ OpenStreetMap: streets, 'Vista satélite': satellite }, undefined, { position: 'topright' }).addTo(this.map);
        const bounds: L.LatLngExpression[] = [];
        for (const delivery of points) {
          const coordinate: L.LatLngExpression = [Number(delivery.address.latitude), Number(delivery.address.longitude)];
          bounds.push(coordinate);
          const color = delivery.status === 'VISITADA' ? '#168354' : '#ed1c24';
          L.circleMarker(coordinate, { radius: 10, color: '#fff', weight: 3, fillColor: color, fillOpacity: 1 }).addTo(this.map).bindTooltip(`${delivery.position ?? '—'}. ${delivery.order.code}<br>${delivery.address.address}`);
        }
        if (bounds.length) this.map.fitBounds(L.latLngBounds(bounds), { padding: [35, 35], maxZoom: 15 });
        setTimeout(() => this.map?.invalidateSize(), 120);
      }

  protected override renderMapSoon(elementId: string): void { const route = this.selectedRoute(); if (route) setTimeout(() => this.renderMap(elementId, route), 50); }

  protected override destroyMap(): void { this.map?.remove(); this.map = null; }

  protected override hasCoordinates(delivery: RouteDelivery): boolean { const lat = Number(delivery.address.latitude); const lng = Number(delivery.address.longitude); return delivery.address.latitude !== null && delivery.address.longitude !== null && Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180; }

  protected override canEditPreparation(status: PreparationStatus): boolean { return ['PENDIENTE','EN_PREPARACION','OBSERVADA'].includes(status); }

  protected override canConfirmPreparation(status: PreparationStatus): boolean { return ['EN_PREPARACION','OBSERVADA'].includes(status); }

  protected override canCancelPreparation(status: PreparationStatus): boolean { return ['PENDIENTE','EN_PREPARACION','OBSERVADA','PREPARADA'].includes(status); }

  protected override detailDifference(index: number): number { const preparation = this.selectedPreparation(); return Number(this.preparationDetails.at(index).get('preparedQuantity')?.value ?? 0) - Number(preparation?.details[index].requestedQuantity ?? 0); }

  protected override preparationQuantityLimit(detail: OrderPreparationDetail): number { return Math.min(Number(detail.requestedQuantity), Number(detail.pickableQuantityCurrent)); }

  protected override productionOrderLabels(detail: OrderPreparationDetail): string { return detail.relatedProductionOrders.map((item) => `${item.code} (${distributionStatusLabel(item.status)})`).join(', '); }

  protected override preparationTitle(): string { return this.selectedPreparation() ? `Preparación · ${this.selectedPreparation()!.order.code}` : 'Preparación'; }

  protected override routeTitle(): string { return this.selectedRoute() ? `${this.selectedRoute()!.code} · ${distributionStatusLabel(this.selectedRoute()!.status)}` : 'Ruta'; }

  protected override principal(route: DistributionRoute): string { return route.responsibles.find((item) => item.isPrincipal)?.user.name ?? 'Sin principal'; }

  protected override controlsAllDeliveries(): boolean { return this.auth.user()?.roles.some((role) => role === 'ADMINISTRADOR' || role === 'COMERCIALIZACION') ?? false; }

  protected override orderTotal(order: EligibleOrder, key: 'reservedQuantity'): string { return this.number(order.details.reduce((sum, detail) => sum + Number(detail[key]), 0)); }

  protected override availableLines(order:EligibleOrder):number{return order.details.filter(detail=>detail.availability==='DISPONIBLE').length;}

  protected override availableTotal(order: EligibleOrder): string { return this.number(order.details.reduce((sum, detail) => sum + Number(detail.availableQuantity), 0)); }

  protected override availableTotalNumber(order: EligibleOrder): number { return order.details.reduce((sum, detail) => sum + Number(detail.availableQuantity), 0); }

  protected override summaryTotal(key: 'complete'|'partial'|'notDelivered'): number { return this.summaryRoutes().reduce((sum, route) => sum + Number(route.metrics?.[key] ?? 0), 0); }

  protected override routeRemainingCapacity(route: DistributionRoute): number { return Math.max(0, Number(route.vehicle.capacityKg ?? 0) - Number(route.loadWeightKg ?? 0)); }

  protected override prospectiveExcess(route: DistributionRoute): number { const vehicle = this.activeVehicles().find((item) => item.id === this.routeVehicleId()); return Math.max(0, Number(route.loadWeightKg ?? 0) - Number(vehicle?.capacityKg ?? 0)); }

  protected override prospectiveCapacityLabel(route: DistributionRoute): string { const vehicle = this.activeVehicles().find((item) => item.id === this.routeVehicleId()); if (!vehicle?.capacityKg) return 'Capacidad no configurada'; if (route.missingWeightPresentations.length) return 'Peso incompleto'; const excess = this.prospectiveExcess(route); return excess > 0 ? `Excede por ${this.number(excess)} kg` : `${this.number(Number(vehicle.capacityKg) - Number(route.loadWeightKg ?? 0))} kg disponibles`; }

  protected override statusLabel(value: string): string { return distributionStatusLabel(value); }
}
