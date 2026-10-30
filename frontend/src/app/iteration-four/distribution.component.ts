import { workflowLabel } from '../core/order-workflow';
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
import { AuthService } from '../core/auth.service';
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
} from '../core/models';

type DistributionView = 'preparations' | 'pending' | 'vehicles' | 'weights' | 'routes' | 'assigned' | 'summary';

@Component({
  selector: 'app-distribution',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    CheckboxModule,
    DialogModule,
    InputNumberModule,
    InputTextModule,
    MultiSelectModule,
    PaginatorModule,
    SelectModule,
    TableModule,
    TagModule,
    TextareaModule,
  ],
  template: `
    @if (mode()==='distribution') {
      <header class="page-toolbar">
        <div><span class="eyebrow">Operación de reparto</span><h2>Distribución</h2><p>Vehículos, pesos de carga, rutas, visitas y liquidación operativa.</p></div>
        <p-button icon="pi pi-refresh" label="Actualizar" [outlined]="true" (onClick)="reload()" />
      </header>
      <nav class="view-tabs" aria-label="Vistas de distribución">
        @if (auth.can('distribution.routes.read')) { <button type="button" [class.active]="view()==='pending'" (click)="setView('pending')"><i class="pi pi-inbox"></i> Pedidos pendientes @if (pendingMeta().total) { <span class="tab-count">{{ pendingMeta().total }}</span> }</button> }
        @if (auth.can('vehicles.read')) { <button type="button" [class.active]="view()==='vehicles'" (click)="setView('vehicles')"><i class="pi pi-truck"></i> Vehículos</button> }
        @if (auth.can('distribution.weights.read')) { <button type="button" [class.active]="view()==='weights'" (click)="setView('weights')"><i class="pi pi-gauge"></i> Pesos de carga</button> }
        @if (auth.can('distribution.routes.read')) { <button type="button" [class.active]="view()==='routes'" (click)="setView('routes')"><i class="pi pi-map"></i> Rutas</button> }
        @if (auth.can('distribution.routes.assigned.read')) { <button type="button" [class.active]="view()==='assigned'" (click)="setView('assigned')"><i class="pi pi-directions"></i> {{ controlsAllDeliveries() ? 'Repartos activos' : 'Mi reparto' }}</button> }
        @if (auth.can('distribution.summary.read')) { <button type="button" [class.active]="view()==='summary'" (click)="setView('summary')"><i class="pi pi-chart-bar"></i> Resumen</button> }
      </nav>
    } @else {
      <div class="embedded-toolbar"><div><span class="eyebrow">Almacén → Distribución</span><h3>Preparación de pedidos</h3><p>Separa existencias recibidas, identifica faltantes y entrega pedidos preparados a Distribución.</p></div><p-button icon="pi pi-refresh" label="Actualizar" [outlined]="true" (onClick)="reload()" /></div>
    }

    @if (view()==='pending') {
      <section class="filters pending-filters">
        <label><span>Buscar</span><input pInputText [ngModel]="searchFilter()" (ngModelChange)="onPendingSearch($event)" placeholder="Código de pedido o cliente" /></label>
        <label><span>Fecha comprometida</span><input pInputText type="date" [ngModel]="dateFilter()" (ngModelChange)="dateFilter.set($event);pendingPage.set(1);clearPendingSelection();loadPendingDeliveries()" /></label>
        <label><span>Zona</span><p-select [options]="zones()" optionLabel="name" optionValue="id" [showClear]="true" placeholder="Todas" [ngModel]="zoneFilter()" (ngModelChange)="zoneFilter.set($event);pendingPage.set(1);clearPendingSelection();loadPendingDeliveries()" /></label>
      </section>
      <section class="pending-overview">
        <article><span>Recibidos de Almacén</span><strong>{{ pendingMeta().total }}</strong><small>Pendientes de modalidad de entrega</small></article>
        <article><span>Seleccionados</span><strong>{{ selectedPendingPreparations().length }}</strong><small>{{ selectedPendingProductCount() }} producto(s)</small></article>
        <article [class.warning]="selectedPendingMissingWeights().length>0"><span>Peso seleccionado</span><strong>{{ number(selectedPendingWeight()) }} kg</strong><small>{{ selectedPendingMissingWeights().length ? selectedPendingMissingWeights().length+' peso(s) pendiente(s)' : 'Carga calculada' }}</small></article>
        <div class="pending-delivery-actions">
          @if (auth.can('distribution.routes.create')) { <p-button label="Enviar a reparto" icon="pi pi-truck" [disabled]="!selectedPendingPreparations().length || selectedPendingZoneIds().length!==1" (onClick)="openRouteFromPending()" /> }
          @if (auth.can('distribution.visits.create')) { <p-button label="Entrega en fábrica" icon="pi pi-building" severity="success" [outlined]="true" [disabled]="selectedPendingPreparations().length!==1" (onClick)="openFactoryDelivery()" /> }
        </div>
      </section>
      @if (selectedPendingZoneIds().length>1) { <div class="capacity-alert warning"><i class="pi pi-exclamation-triangle"></i><div><strong>Seleccione pedidos de una sola zona</strong><span>Cada ruta pertenece a una zona. Quite los pedidos de otras zonas para continuar.</span></div></div> }
      <div class="table-card"><p-table styleClass="mobile-data-table pending-table" [value]="pendingPreparations()" [loading]="loading()" responsiveLayout="scroll">
        <ng-template #header><tr><th class="selection-cell"><p-checkbox [binary]="true" [ngModel]="allPendingPageSelected()" (ngModelChange)="togglePendingPage($event)" /></th><th>Pedido</th><th>Cliente</th><th>Fecha comprometida</th><th>Zona</th><th>Productos</th><th>Peso</th><th>Recibido de Almacén</th><th>Estado</th></tr></ng-template>
        <ng-template #body let-item><tr>
          <td data-label="Seleccionar" class="selection-cell"><p-checkbox [binary]="true" [ngModel]="isPendingSelected(item.id)" (ngModelChange)="togglePendingPreparation(item,$event)" /></td>
          <td data-label="Pedido"><strong>{{ item.order.code }}</strong></td><td data-label="Cliente">{{ item.order.customerNameSnapshot || item.order.customer.businessName }}</td><td data-label="Compromiso">{{ formatDate(item.order.requestedDate) }}</td><td data-label="Zona">{{ item.order.address.zone?.name || 'Sin zona' }}</td>
          <td data-label="Productos">{{ item.detailCount }}</td><td data-label="Peso"><div class="stack" [class.negative]="item.missingWeightPresentations.length"><strong>{{ number(item.loadWeightKg) }} kg</strong><small>{{ item.missingWeightPresentations.length ? 'Peso incompleto' : 'Calculado' }}</small></div></td>
          <td data-label="Recibido">{{ item.handedOffAt ? formatDateTime(item.handedOffAt) : '—' }}</td><td data-label="Estado"><p-tag value="PREPARADO" severity="success" /></td>
        </tr></ng-template>
        <ng-template #emptymessage><tr><td colspan="9" class="empty-row">No existen pedidos entregados por Almacén pendientes de distribución.</td></tr></ng-template>
      </p-table><p-paginator [first]="(pendingMeta().page-1)*pendingMeta().limit" [rows]="pendingMeta().limit" [totalRecords]="pendingMeta().total" [rowsPerPageOptions]="[25,50,100]" (onPageChange)="changePendingPage($event)" /></div>
    }

    @if (view()==='preparations') {
      <section class="filters preparation-filters">
        <label><span>Buscar</span><input pInputText [ngModel]="searchFilter()" (ngModelChange)="onPreparationSearch($event)" placeholder="Pedido o cliente" /></label>
        <label><span>Fecha de entrega</span><input pInputText type="date" [ngModel]="dateFilter()" (ngModelChange)="dateFilter.set($event);resetPreparationPages();loadPreparations()" /></label>
        <label><span>Zona</span><p-select [options]="zones()" optionLabel="name" optionValue="id" [showClear]="true" placeholder="Todas" [ngModel]="zoneFilter()" (ngModelChange)="zoneFilter.set($event);resetPreparationPages();loadPreparations()" /></label>
      </section>

      @if (auth.can('preparations.create')) {
        <section class="section-block">
          <div class="section-heading"><div><span>Trabajo pendiente</span><h3>Preparar</h3><p>Atención por fecha del pedido, del más antiguo al más reciente. Los faltantes permanecen En preparación.</p></div><small>{{ eligibleMeta().total }} pedido(s)</small></div>
          <div class="table-card">
            <p-table styleClass="mobile-data-table" [value]="workOrders()" [loading]="loading()" responsiveLayout="scroll">
              <ng-template #header><tr><th>Pedido</th><th>Cliente</th><th>Entrega</th><th>Zona</th><th>Productos</th><th>Estado</th><th>Acción</th></tr></ng-template>
              <ng-template #body let-order><tr>
                <td data-label="Pedido"><strong>{{ order.code }}</strong></td>
                <td data-label="Cliente">{{ order.customerNameSnapshot || order.customer.businessName }}</td>
                <td data-label="Entrega">{{ formatDate(order.requestedDate) }}</td><td data-label="Zona">{{ order.address.zone?.name || 'Sin zona' }}</td>
                <td data-label="Productos"><div class="stack"><strong>{{ order.details.length }}</strong><small>{{ availableLines(order) }} / {{ order.details.length }} disponibles</small></div></td>
                <td data-label="Estado"><p-tag [value]="workflowLabel(order.operationalStatus)" [severity]="order.preparation ? preparationSeverity(order.preparation.status) : 'secondary'" /></td>
                <td data-label="Acción"><p-button [label]="order.operationalStatus==='DISPONIBLE_PARA_PREPARAR' ? 'Preparar' : 'Ver faltantes'" icon="pi pi-box" size="small" [loading]="saving()" (onClick)="prepareWorkOrder(order)" /></td>
              </tr></ng-template>
              <ng-template #emptymessage><tr><td colspan="7" class="empty-row">No existen pedidos pendientes de preparación.</td></tr></ng-template>
            </p-table>
            <p-paginator [first]="(eligibleMeta().page-1)*eligibleMeta().limit" [rows]="eligibleMeta().limit" [totalRecords]="eligibleMeta().total" [rowsPerPageOptions]="[25,50,100]" (onPageChange)="changeEligiblePage($event)" />
          </div>
        </section>
      }

      <section class="section-block">
        <div class="section-heading"><div><span>Verificación terminada</span><h3>Entregar a Distribución</h3><p>Pedidos verificados y listos para entregar a Distribución.</p></div><small>{{ preparationMeta().total }} listo(s)</small></div>
        <div class="table-card">
          <p-table styleClass="mobile-data-table" [value]="preparations()" [loading]="loading()" responsiveLayout="scroll">
            <ng-template #header><tr><th>Pedido</th><th>Cliente</th><th>Entrega</th><th>Zona</th><th>Productos</th><th>Responsable</th><th>Acciones</th></tr></ng-template>
            <ng-template #body let-item><tr>
              <td data-label="Pedido"><strong>{{ item.order.code }}</strong></td><td data-label="Cliente">{{ item.order.customerNameSnapshot || item.order.customer.businessName }}</td><td data-label="Entrega">{{ formatDate(item.order.requestedDate) }}</td>
              <td data-label="Zona">{{ item.order.address.zone?.name || 'Sin zona' }}</td><td data-label="Productos">{{ item.detailCount || 0 }}</td><td data-label="Responsable">{{ item.responsible.name }}</td>
              <td data-label="Acciones"><div class="dispatch-actions"><p-button label="Editar" icon="pi pi-pencil" size="small" [outlined]="true" (onClick)="editPrepared(item)" /><p-button label="Entregar" icon="pi pi-send" size="small" severity="success" (onClick)="handoffPreparation(item)" /><p-button label="Cancelar" icon="pi pi-times" size="small" severity="danger" [outlined]="true" (onClick)="requestPreparationCancellation(item)" /></div></td>
            </tr></ng-template>
            <ng-template #emptymessage><tr><td colspan="7" class="empty-row">No existen pedidos preparados pendientes de entrega.</td></tr></ng-template>
          </p-table>
          <p-paginator [first]="(preparationMeta().page-1)*preparationMeta().limit" [rows]="preparationMeta().limit" [totalRecords]="preparationMeta().total" [rowsPerPageOptions]="[25,50,100]" (onPageChange)="changePreparationPage($event)" />
        </div>
      </section>
    }

    @if (view()==='vehicles') {
      <div class="section-heading"><div><span>Recursos de distribución</span><h3>Vehículos</h3></div>@if (auth.can('vehicles.manage')) { <p-button label="Registrar vehículo" icon="pi pi-plus" (onClick)="openVehicle()" /> }</div>
      <div class="table-card"><p-table [value]="vehicles()" [loading]="loading()" responsiveLayout="scroll">
        <ng-template #header><tr><th>Placa</th><th>Descripción</th><th>Capacidad máxima</th><th>Estado</th><th>Acción</th></tr></ng-template>
        <ng-template #body let-item><tr><td><strong>{{ item.plate }}</strong></td><td>{{ item.description }}</td><td><strong>{{ item.capacityKg ? number(item.capacityKg) + ' kg' : 'Sin configurar' }}</strong></td><td><p-tag [value]="item.status" [severity]="item.status==='ACTIVO'?'success':'secondary'" /></td><td>@if (auth.can('vehicles.manage')) { <p-button label="Editar" icon="pi pi-pencil" size="small" [outlined]="true" (onClick)="openVehicle(item)" /> }</td></tr></ng-template>
        <ng-template #emptymessage><tr><td colspan="5" class="empty-row">No existen vehículos registrados.</td></tr></ng-template>
      </p-table><p-paginator [first]="(vehicleMeta().page-1)*vehicleMeta().limit" [rows]="vehicleMeta().limit" [totalRecords]="vehicleMeta().total" [rowsPerPageOptions]="[25,50,100]" (onPageChange)="changeVehiclePage($event)" /></div>
    }

    @if (view()==='weights') {
      <div class="section-heading"><div><span>Integridad de carga</span><h3>Pesos de presentaciones</h3><p>Registre el peso real indicado en la ficha técnica; el sistema no asigna valores estimados.</p></div>@if (auth.can('distribution.weights.manage')) { <p-button label="Guardar pesos" icon="pi pi-save" [disabled]="!pendingWeightItems().length" [loading]="saving()" (onClick)="saveWeights()" /> }</div>
      <section class="filters weight-filters"><label><span>Buscar</span><input pInputText [ngModel]="weightSearch()" (ngModelChange)="onWeightSearch($event)" placeholder="Código, producto o presentación" /></label><label class="checkbox-filter"><p-checkbox [binary]="true" [ngModel]="missingWeightsOnly()" (ngModelChange)="missingWeightsOnly.set($event);weightPage.set(1);loadWeights()" /><span>Mostrar solo pesos faltantes</span></label></section>
      @if (weightMeta().total>0 && missingWeightsOnly()) { <div class="capacity-alert warning"><i class="pi pi-exclamation-triangle"></i><div><strong>{{ weightMeta().total }} presentación(es) sin peso</strong><span>Las rutas que las incluyan no podrán planificarse hasta registrar su peso real en kilogramos.</span></div></div> }
      <div class="table-card"><p-table [value]="weightItems()" [loading]="loading()" responsiveLayout="scroll">
        <ng-template #header><tr><th>Código</th><th>Producto</th><th>Categoría / línea</th><th>Presentación</th><th>Peso actual</th><th>Nuevo peso (kg)</th></tr></ng-template>
        <ng-template #body let-item><tr><td><strong>{{ item.product?.code }}</strong></td><td>{{ item.product?.name }}</td><td><div class="stack"><strong>{{ item.product?.category?.name }}</strong><small>{{ item.product?.productLine?.name }}</small></div></td><td><div class="stack"><strong>{{ item.description }}</strong><small>{{ item.unit.abbreviation }}</small></div></td><td>{{ item.weightKg ? number(item.weightKg)+' kg' : 'Faltante' }}</td><td><p-inputnumber [ngModel]="weightDrafts()[item.id]" (ngModelChange)="setWeightDraft(item.id,$event)" [min]="0.000001" [maxFractionDigits]="6" suffix=" kg" [disabled]="!auth.can('distribution.weights.manage')" /></td></tr></ng-template>
        <ng-template #emptymessage><tr><td colspan="6" class="empty-row">No existen presentaciones con el criterio seleccionado.</td></tr></ng-template>
      </p-table><p-paginator [first]="(weightMeta().page-1)*weightMeta().limit" [rows]="weightMeta().limit" [totalRecords]="weightMeta().total" [rowsPerPageOptions]="[25,50,100]" (onPageChange)="changeWeightPage($event)" /></div>
    }

    @if (view()==='routes' || view()==='summary') {
      <section class="filters route-filters">
        <label><span>Buscar</span><input pInputText [ngModel]="searchFilter()" (ngModelChange)="onRouteSearch($event)" placeholder="Ruta, zona o placa" /></label>
        <label><span>Fecha</span><input pInputText type="date" [ngModel]="dateFilter()" (ngModelChange)="dateFilter.set($event);resetRoutePages();reload()" /></label>
        <label><span>Zona</span><p-select [options]="zones()" optionLabel="name" optionValue="id" [showClear]="true" placeholder="Todas" [ngModel]="zoneFilter()" (ngModelChange)="zoneFilter.set($event);resetRoutePages();reload()" /></label>
        <label><span>Estado</span><p-select [options]="routeStatuses" optionLabel="label" optionValue="value" [showClear]="true" placeholder="Todos" [ngModel]="routeStatusFilter()" (ngModelChange)="routeStatusFilter.set($event);resetRoutePages();reload()" /></label>
      </section>

      @if (view()==='routes') {
        <div class="section-heading"><div><span>Planificación operativa</span><h3>Rutas de distribución</h3></div>@if (auth.can('distribution.routes.create')) { <p-button label="Crear ruta" icon="pi pi-plus" (onClick)="openRoute()" /> }</div>
        <div class="table-card"><p-table [value]="routes()" [loading]="loading()" responsiveLayout="scroll">
          <ng-template #header><tr><th>Ruta</th><th>Fecha / zona</th><th>Vehículo</th><th>Carga / capacidad</th><th>Responsable</th><th>Entregas</th><th>Estado</th><th>Acción</th></tr></ng-template>
          <ng-template #body let-route><tr><td><strong>{{ route.code }}</strong></td><td><div class="stack"><strong>{{ formatDate(route.date) }}</strong><small>{{ route.zone.name }}</small></div></td><td>{{ route.vehicle.plate }}</td><td><div class="stack" [class.negative]="route.capacityExceeded"><strong>{{ number(route.loadWeightKg || 0) }} / {{ number(route.vehicle.capacityKg || 0) }} kg</strong><small>{{ route.capacityExceeded ? 'Capacidad excedida' : route.missingWeightPresentations?.length ? 'Peso incompleto' : 'Dentro de capacidad' }}</small></div></td><td>{{ principal(route) }}</td><td>{{ route.deliveryCount || 0 }}</td><td><p-tag [value]="statusLabel(route.status)" [severity]="routeSeverity(route.status)" /></td><td><p-button label="Gestionar" icon="pi pi-arrow-right" size="small" [outlined]="true" (onClick)="openRouteDetail(route)" /></td></tr></ng-template>
          <ng-template #emptymessage><tr><td colspan="8" class="empty-row">No existen rutas registradas.</td></tr></ng-template>
        </p-table><p-paginator [first]="(routeMeta().page-1)*routeMeta().limit" [rows]="routeMeta().limit" [totalRecords]="routeMeta().total" [rowsPerPageOptions]="[25,50,100]" (onPageChange)="changeRoutePage($event)" /></div>
      } @else {
        <div class="metrics">
          <article><span>Rutas consultadas</span><strong>{{ summaryMeta().total }}</strong></article>
          <article><span>Entregas completas</span><strong>{{ summaryTotal('complete') }}</strong></article>
          <article><span>Entregas parciales</span><strong>{{ summaryTotal('partial') }}</strong></article>
          <article><span>No entregadas</span><strong>{{ summaryTotal('notDelivered') }}</strong></article>
        </div>
        <div class="table-card"><p-table [value]="summaryRoutes()" [loading]="loading()" responsiveLayout="scroll">
          <ng-template #header><tr><th>Ruta</th><th>Fecha / zona</th><th>Estado</th><th>Visitas</th><th>Completas</th><th>Parciales</th><th>No entregadas</th><th>Devuelto</th><th>Aceptado</th></tr></ng-template>
          <ng-template #body let-route><tr><td><strong>{{ route.code }}</strong></td><td>{{ formatDate(route.date) }} · {{ route.zone.name }}</td><td><p-tag [value]="statusLabel(route.status)" [severity]="routeSeverity(route.status)" /></td><td>{{ route.metrics?.total || 0 }}</td><td>{{ route.metrics?.complete || 0 }}</td><td>{{ route.metrics?.partial || 0 }}</td><td>{{ route.metrics?.notDelivered || 0 }}</td><td>{{ number(route.metrics?.returnedQuantity || 0) }}</td><td>{{ number(route.metrics?.acceptedReturnQuantity || 0) }}</td></tr></ng-template>
        </p-table><p-paginator [first]="(summaryMeta().page-1)*summaryMeta().limit" [rows]="summaryMeta().limit" [totalRecords]="summaryMeta().total" [rowsPerPageOptions]="[25,50,100]" (onPageChange)="changeSummaryPage($event)" /></div>
      }
    }

    @if (view()==='assigned') {
      <div class="section-heading"><div><span>{{ controlsAllDeliveries() ? 'Control comercial de entregas' : 'Responsable de reparto' }}</span><h3>{{ controlsAllDeliveries() ? 'Todos los repartos activos' : 'Rutas asignadas' }}</h3></div><small>{{ controlsAllDeliveries() ? 'Seleccione una ruta y registre cada entrega' : 'Solo recorridos autorizados' }}</small></div>
      <div class="assigned-grid">
        @for (route of assignedRoutes(); track route.id) {
          <article class="route-card"><header><div><span>{{ route.code }}</span><h3>{{ route.zone.name }}</h3></div><p-tag [value]="statusLabel(route.status)" [severity]="routeSeverity(route.status)" /></header><div class="route-card__facts"><span><i class="pi pi-calendar"></i>{{ formatDate(route.date) }}</span><span><i class="pi pi-truck"></i>{{ route.vehicle.plate }}</span><span><i class="pi pi-map-marker"></i>{{ route.deliveries.length }} paradas</span></div><p-button label="Abrir recorrido" icon="pi pi-directions" styleClass="route-card__button" (onClick)="openAssignedRoute(route)" /></article>
        } @empty { <div class="empty"><i class="pi pi-map"></i><strong>{{ controlsAllDeliveries() ? 'No existen repartos activos.' : 'No tienes rutas activas asignadas.' }}</strong></div> }
      </div>
    }

    <p-dialog [visible]="preparationDialog()" (visibleChange)="preparationDialog.set($event)" [modal]="true" [style]="{width:'min(980px,100vw)'}" [header]="preparationTitle()" [draggable]="false" styleClass="preparation-dialog">
      @if (selectedPreparation(); as preparation) {
        <div class="detail-summary"><div><span>Pedido</span><strong>{{ preparation.order.code }}</strong></div><div><span>Cliente</span><strong>{{ preparation.order.customerNameSnapshot || preparation.order.customer.businessName }}</strong></div><div><span>Entrega</span><strong>{{ formatDate(preparation.order.requestedDate) }}</strong></div><div><span>Estado</span><strong>{{ statusLabel(preparation.status) }}</strong></div></div>
        <p class="operational-note"><i class="pi pi-info-circle"></i> La cantidad debe cubrir el pedido completo. Si falta stock, el pedido permanece En preparación hasta completar todos sus productos.</p>
        <form [formGroup]="preparationForm" (ngSubmit)="prepareCurrent()">
          <div class="detail-table preparation-detail-table" formArrayName="details"><table><thead><tr><th>Cod-Producto</th><th>Nombre</th><th>Cubierto para este pedido</th><th>Solicitado</th><th>Cantidad a entregar</th><th>Diferencia</th><th>Verificado</th><th>Observación</th></tr></thead><tbody>
            @for (control of preparationDetails.controls; track control; let index=$index) { <tr [formGroupName]="index"><td data-label="Cod-Producto"><strong>{{ preparation.details[index].orderDetail.presentation.product?.code || '—' }}</strong></td><td data-label="Nombre"><strong>{{ preparation.details[index].orderDetail.productDescriptionSnapshot }}</strong><small>{{ preparation.details[index].orderDetail.presentationDescriptionSnapshot }}</small></td><td data-label="Stock disponible" [class.negative]="numberValue(preparation.details[index].pickableQuantityCurrent)<numberValue(preparation.details[index].requestedQuantity)"><strong>{{ number(preparation.details[index].pickableQuantityCurrent) }}</strong><small>{{ numberValue(preparation.details[index].pickableQuantityCurrent)>=numberValue(preparation.details[index].requestedQuantity) ? 'Disponible' : numberValue(preparation.details[index].pickableQuantityCurrent)>0 ? 'Stock parcial' : 'Pendiente de stock' }}</small></td><td data-label="Solicitado">{{ number(preparation.details[index].requestedQuantity) }}</td><td data-label="Cantidad a entregar"><p-inputnumber formControlName="preparedQuantity" [min]="0" [max]="preparationQuantityLimit(preparation.details[index])" [maxFractionDigits]="3" [showButtons]="true" buttonLayout="horizontal" incrementButtonIcon="pi pi-plus" decrementButtonIcon="pi pi-minus" /></td><td data-label="Diferencia" [class.negative]="detailDifference(index)<0">{{ number(detailDifference(index)) }}</td><td data-label="Verificado"><p-checkbox formControlName="verified" [binary]="true" /></td><td data-label="Observación"><input pInputText formControlName="observation" placeholder="Obligatoria si hay diferencia" /></td></tr> }
          </tbody></table></div>
          <div class="dialog-footer preparation-actions">
            @if (auth.can('preparations.confirm') && canEditPreparation(preparation.status)) { <p-button type="submit" label="Preparar" icon="pi pi-check" severity="success" [loading]="saving()" [disabled]="!canSubmitPreparation()" /> }
            @if (auth.can('preparations.cancel') && canCancelPreparation(preparation.status)) { <p-button type="button" label="Cancelar preparación" icon="pi pi-times" severity="danger" [outlined]="true" (onClick)="openPreparationCancellation()" /> }
            <p-button type="button" label="Cerrar" [outlined]="true" severity="secondary" (onClick)="preparationDialog.set(false)" />
          </div>
        </form>
        <details class="history-details"><summary>Ver historial</summary><div class="timeline compact">@for (event of preparation.history; track event.id) { <div><span class="dot"></span><article><header><strong>{{ event.event }}</strong><small>{{ formatDateTime(event.occurredAt) }}</small></header><p>{{ event.observation || 'Sin observación' }}</p><footer>{{ event.user.name }} · {{ event.previousStatus || 'INICIO' }} → {{ event.newStatus }}</footer></article></div> }</div></details>
      }
    </p-dialog>

    <p-dialog [visible]="vehicleDialog()" (visibleChange)="vehicleDialog.set($event)" [modal]="true" [style]="{width:'min(520px,96vw)'}" [header]="editingVehicleId()?'Editar vehículo':'Registrar vehículo'" [draggable]="false">
      <form [formGroup]="vehicleForm" (ngSubmit)="saveVehicle()"><div class="form-grid"><label><span>Placa *</span><input pInputText formControlName="plate" /></label><label><span>Capacidad máxima (kg) *</span><p-inputnumber formControlName="capacityKg" [min]="0.001" [maxFractionDigits]="3" suffix=" kg" /></label><label class="wide"><span>Descripción *</span><input pInputText formControlName="description" /></label>@if (editingVehicleId()) { <label><span>Estado</span><p-select formControlName="status" [options]="recordStatuses" optionLabel="label" optionValue="value" appendTo="body" /></label> }</div><p class="operational-note"><i class="pi pi-info-circle"></i> La capacidad es obligatoria y se comparará con el peso total de las presentaciones cargadas en la ruta.</p><div class="dialog-footer"><p-button type="button" label="Cancelar" [text]="true" severity="secondary" (onClick)="vehicleDialog.set(false)" /><p-button type="submit" label="Guardar vehículo" icon="pi pi-save" [loading]="saving()" /></div></form>
    </p-dialog>

    <p-dialog [visible]="routeDialog()" (visibleChange)="routeDialog.set($event)" [modal]="true" [style]="{width:'min(650px,96vw)'}" header="Crear ruta de distribución" [draggable]="false">
      <form [formGroup]="routeForm" (ngSubmit)="createRoute()">
        @if (routeDraftPreparations().length) { <div class="route-selection-summary"><div><span>Pedidos seleccionados</span><strong>{{ routeDraftPreparations().length }}</strong></div><div><span>Peso calculado</span><strong>{{ number(routeDraftWeight()) }} kg</strong></div><div [class.negative]="routeDraftMissingWeights().length"><span>Integridad del peso</span><strong>{{ routeDraftMissingWeights().length ? routeDraftMissingWeights().length+' pendiente(s)' : 'Completa' }}</strong></div><div [class.negative]="routeDraftCapacityExceeded()"><span>Capacidad del vehículo</span><strong>{{ routeDraftCapacityLabel() }}</strong></div></div> }
        <div class="form-grid"><label><span>Fecha *</span><input pInputText type="date" formControlName="date" /></label><label><span>Zona *</span><p-select formControlName="zoneId" [options]="zones()" optionLabel="name" optionValue="id" placeholder="Seleccione" [disabled]="routeDraftPreparations().length>0" appendTo="body" /></label><label><span>Vehículo activo *</span><p-select formControlName="vehicleId" [options]="vehicleOptions()" optionLabel="label" optionValue="id" placeholder="Seleccione" appendTo="body" /></label><label><span>Responsable principal *</span><p-select formControlName="principalResponsibleId" [options]="responsibles()" optionLabel="name" optionValue="id" placeholder="Seleccione" appendTo="body" /></label><label class="wide"><span>Responsables asignados *</span><p-multiselect formControlName="responsibleIds" [options]="responsibles()" optionLabel="name" optionValue="id" placeholder="Seleccione uno o más" display="chip" appendTo="body" /></label><label class="wide"><span>Observación</span><textarea pTextarea formControlName="observation" rows="3"></textarea></label></div>
        @if (routeDraftMissingWeights().length) { <div class="capacity-alert warning"><i class="pi pi-exclamation-triangle"></i><div><strong>Hay presentaciones sin peso configurado</strong><span>La ruta podrá guardarse, pero no podrá planificarse hasta completar los pesos.</span></div></div> }
        @if (routeDraftCapacityExceeded()) { <div class="capacity-alert danger"><i class="pi pi-exclamation-circle"></i><div><strong>La selección supera la capacidad del vehículo</strong><span>Elija un vehículo con mayor capacidad antes de crear la ruta.</span></div></div> }
        <div class="dialog-footer"><p-button type="button" label="Cancelar" [text]="true" severity="secondary" (onClick)="routeDialog.set(false)" /><p-button type="submit" [label]="routeDraftPreparations().length?'Crear ruta y asignar':'Crear ruta'" icon="pi pi-plus" [disabled]="routeDraftCapacityExceeded()" [loading]="saving()" /></div>
      </form>
    </p-dialog>

    <p-dialog [visible]="routeDetailDialog()" (visibleChange)="closeRouteDetail($event)" [modal]="true" [style]="{width:'min(1180px,99vw)'}" [header]="routeTitle()" [draggable]="false">
      @if (selectedRoute(); as route) {
        <div class="detail-summary route-summary"><div><span>Fecha</span><strong>{{ formatDate(route.date) }}</strong></div><div><span>Zona</span><strong>{{ route.zone.name }}</strong></div><div><span>Vehículo</span><strong>{{ route.vehicle.plate }}</strong></div><div><span>Carga / capacidad</span><strong>{{ number(route.loadWeightKg || 0) }} / {{ number(route.vehicle.capacityKg || 0) }} kg</strong></div><div><span>Estado</span><strong>{{ statusLabel(route.status) }}</strong></div><div><span>Principal</span><strong>{{ principal(route) }}</strong></div></div>
        @if (route.missingWeightPresentations.length) { <div class="capacity-alert warning"><i class="pi pi-exclamation-triangle"></i><div><strong>No se puede completar el cálculo de carga</strong><span>Configure el peso en kg de: {{ route.missingWeightPresentations.join(', ') }}.</span></div></div> }
        @if (route.capacityExceeded) { <div class="capacity-alert danger"><i class="pi pi-exclamation-circle"></i><div><strong>Capacidad del vehículo sobrepasada por {{ number(route.excessWeightKg) }} kg</strong><span>La carga es {{ number(route.loadWeightKg) }} kg y {{ route.vehicle.plate }} admite {{ number(route.vehicle.capacityKg || 0) }} kg. Cambie a un vehículo con mayor capacidad antes de planificar.</span></div></div> }
        @if (!route.capacityExceeded && !route.missingWeightPresentations.length) { <div class="capacity-alert success"><i class="pi pi-check-circle"></i><div><strong>Carga dentro de capacidad</strong><span>Quedan {{ number(routeRemainingCapacity(route)) }} kg disponibles.</span></div></div> }
        @if (route.status==='BORRADOR' && auth.can('distribution.routes.create')) { <div class="vehicle-change"><label><span>Cambiar vehículo</span><p-select [options]="vehicleOptions()" optionLabel="label" optionValue="id" [ngModel]="routeVehicleId()" (ngModelChange)="routeVehicleId.set($event)" appendTo="body" /></label><div [class.negative]="prospectiveExcess(route)>0"><span>Con el vehículo seleccionado</span><strong>{{ prospectiveCapacityLabel(route) }}</strong></div><p-button label="Aplicar cambio" icon="pi pi-truck" [outlined]="true" [disabled]="!routeVehicleId() || routeVehicleId()===route.vehicleId" [loading]="saving()" (onClick)="changeRouteVehicle()" /></div> }
        <div class="route-layout">
          <section><div class="map-heading"><div><span>Cartografía</span><strong>Puntos de entrega</strong></div><small>OpenStreetMap · Vista satélite disponible</small></div><div id="distribution-route-map" class="route-map" aria-label="Mapa de puntos de entrega"></div></section>
          <section class="sequence-panel"><div class="section-heading small"><div><span>Orden manual</span><h3>Secuencia de visitas</h3></div></div>
            @if (route.status==='BORRADOR' && auth.can('distribution.routes.create')) { <div class="add-deliveries"><p-multiselect [options]="preparedOptions()" optionLabel="label" optionValue="id" placeholder="Agregar pedidos preparados" [ngModel]="selectedPreparationIds()" (ngModelChange)="selectedPreparationIds.set($event)" /><p-button icon="pi pi-plus" label="Agregar" [disabled]="!selectedPreparationIds().length" (onClick)="addDeliveries()" /></div> }
            <ol class="delivery-list">@for (delivery of route.deliveries; track delivery.id; let index=$index) { <li><span class="position">{{ index+1 }}</span><div><strong>{{ delivery.order.code }} · {{ delivery.order.customerNameSnapshot || delivery.order.customer.businessName }}</strong><small>Compromiso {{ formatDate(delivery.order.requestedDate) }} · {{ delivery.address.address }}</small>@if (!hasCoordinates(delivery)) { <em>Faltan coordenadas válidas</em> }</div>@if (route.status==='BORRADOR' && auth.can('distribution.routes.plan')) { <div class="order-actions"><button type="button" title="Subir" [disabled]="index===0" (click)="moveDelivery(index,-1)"><i class="pi pi-angle-up"></i></button><button type="button" title="Bajar" [disabled]="index===route.deliveries.length-1" (click)="moveDelivery(index,1)"><i class="pi pi-angle-down"></i></button>@if (auth.can('distribution.routes.create')) { <button type="button" title="Retirar de la ruta" class="danger-action" (click)="removeRouteDelivery(delivery)"><i class="pi pi-times"></i></button> }</div> }@if (delivery.result) { <p-tag [value]="statusLabel(delivery.result.result)" [severity]="visitSeverity(delivery.result.result)" /> }</li> } @empty { <li class="empty-row">Agregue preparaciones confirmadas de esta zona para construir la ruta.</li> }</ol>
            @if (route.status==='BORRADOR' && auth.can('distribution.routes.plan') && route.deliveries.length) { <p-button label="Guardar secuencia" icon="pi pi-sort-alt" [outlined]="true" (onClick)="saveSequence()" /> }
          </section>
        </div>
        <div class="route-actions">
          @if ((route.status==='BORRADOR'||route.status==='PLANIFICADA') && auth.can('distribution.routes.reschedule')) { <p-button label="Reprogramar" icon="pi pi-calendar" [outlined]="true" (onClick)="openRouteReschedule()" /> }
          @if ((route.status==='BORRADOR'||route.status==='PLANIFICADA') && auth.can('distribution.routes.cancel')) { <p-button label="Cancelar ruta" icon="pi pi-times" severity="danger" [outlined]="true" (onClick)="openRouteCancellation()" /> }
          @if (route.status==='BORRADOR' && auth.can('distribution.routes.plan')) { <p-button label="Planificar ruta" icon="pi pi-check-circle" [disabled]="route.capacityExceeded || !!route.missingWeightPresentations.length" (onClick)="routeAction('plan')" /> }
          @if (route.status==='PLANIFICADA' && auth.can('distribution.routes.departure')) { <p-button label="Registrar salida" icon="pi pi-send" severity="success" (onClick)="routeAction('departure')" /> }
          @if (route.status==='EN_REPARTO' && auth.can('distribution.routes.finish')) { <p-button label="Finalizar recorrido" icon="pi pi-flag" (onClick)="routeAction('finish')" /> }
          @if (route.status==='FINALIZADA' && routeHasReturns(route)) { <p-tag value="Retorno pendiente en Almacén" severity="warn" /> }
          @if (route.status==='FINALIZADA' && !routeHasReturns(route) && auth.can('distribution.routes.settle')) { <p-button label="Liquidar ruta" icon="pi pi-verified" severity="success" (onClick)="openSettlement()" /> }
        </div>
        <div class="timeline compact">@for (event of route.history; track event.id) { <div><span class="dot"></span><article><header><strong>{{ event.event }}</strong><small>{{ formatDateTime(event.occurredAt) }}</small></header><p>{{ event.observation || 'Sin observación' }}</p><footer>{{ event.user.name }} · {{ event.previousStatus || 'INICIO' }} → {{ event.newStatus }}</footer></article></div> }</div>
      }
    </p-dialog>

    <p-dialog [visible]="assignedDialog()" (visibleChange)="closeAssignedDialog($event)" [modal]="true" [style]="{width:'min(1050px,98vw)'}" [header]="routeTitle()" [draggable]="false">
      @if (selectedRoute(); as route) { <div class="assigned-route"><div id="assigned-route-map" class="route-map assigned-map"></div><div class="delivery-cards">@for (delivery of route.deliveries; track delivery.id) { <article [class.done]="delivery.status==='VISITADA'"><span class="stop-number">{{ delivery.position }}</span><div><strong>{{ delivery.order.customerNameSnapshot || delivery.order.customer.businessName }}</strong><p>{{ delivery.address.address }}</p><small>{{ delivery.address.reference || 'Sin referencia' }}</small></div>@if (delivery.result) { <p-tag [value]="statusLabel(delivery.result.result)" [severity]="visitSeverity(delivery.result.result)" /> } @else if (route.status==='EN_REPARTO' && auth.can('distribution.visits.create')) { <p-button label="Registrar visita" icon="pi pi-map-marker" size="small" (onClick)="openVisit(delivery)" /> }</article> }</div></div> }
    </p-dialog>

    <p-dialog [visible]="visitDialog()" (visibleChange)="visitDialog.set($event)" [modal]="true" [style]="{width:'min(1040px,99vw)'}" [header]="selectedDelivery()?.deliveryType==='FABRICA' ? 'Nota de entrega en fábrica' : 'Nota de entrega'" [draggable]="false" styleClass="delivery-note-dialog">
      @if (selectedDelivery(); as delivery) {
        <div class="delivery-note-head"><div><span>Pedido</span><strong>{{ delivery.order.code }}</strong></div><div><span>Cliente</span><strong>{{ delivery.order.customerNameSnapshot || delivery.order.customer.businessName }}</strong></div><div><span>{{ delivery.deliveryType==='FABRICA' ? 'Modalidad' : 'Dirección' }}</span><strong>{{ delivery.deliveryType==='FABRICA' ? 'Entrega directa en planta ICAR' : delivery.address.address }}</strong></div><div><span>Fecha de entrega</span><strong>{{ formatDate(delivery.order.requestedDate) }}</strong></div><div><span>Condición</span><strong>{{ delivery.order.customer.paymentCondition }}{{ delivery.order.customer.paymentCondition==='CREDITO' ? ' · '+delivery.order.customer.creditDays+' días' : ' · vencimiento inmediato' }}</strong></div></div>
        <p class="operational-note"><i class="pi pi-info-circle"></i> {{ delivery.deliveryType==='FABRICA' ? 'El pedido se entrega en planta y no se asigna a vehículo ni recorrido. Solo se descuenta lo efectivamente retirado; cualquier diferencia permanece disponible en Almacén.' : 'Revise la nota completa. Puede confirmar las cantidades preparadas o reducir la cantidad entregada; la diferencia quedará en la orden de retorno a Almacén.' }}</p>
        <form [formGroup]="visitForm" (ngSubmit)="registerVisit(false)">
          <div class="detail-table visit-table" formArrayName="details"><table><thead><tr><th>Cod-Producto</th><th>Producto / presentación</th><th>Solicitado</th><th>Preparado</th><th>Precio</th><th>A entregar</th><th>{{ delivery.deliveryType==='FABRICA' ? 'No retirado' : 'Retorna' }}</th><th>Subtotal entrega</th></tr></thead><tbody>@for (control of visitDetails.controls; track $index; let index=$index) { <tr [formGroupName]="index"><td data-label="Cod-Producto"><strong>{{ delivery.preparation.details[index].orderDetail.presentation.product?.code || '—' }}</strong></td><td data-label="Producto"><strong>{{ delivery.preparation.details[index].orderDetail.productDescriptionSnapshot }}</strong><small>{{ delivery.preparation.details[index].orderDetail.presentationDescriptionSnapshot }}</small></td><td data-label="Solicitado">{{ number(delivery.preparation.details[index].requestedQuantity) }}</td><td data-label="Preparado">{{ number(delivery.preparation.details[index].preparedQuantity) }}</td><td data-label="Precio">Bs {{ number(delivery.preparation.details[index].orderDetail.unitPrice) }}</td><td data-label="A entregar"><p-inputnumber formControlName="deliveredQuantity" [min]="0" [max]="numberValue(delivery.preparation.details[index].preparedQuantity)" [maxFractionDigits]="3" [showButtons]="true" buttonLayout="horizontal" incrementButtonIcon="pi pi-plus" decrementButtonIcon="pi pi-minus" /></td><td [attr.data-label]="delivery.deliveryType==='FABRICA' ? 'No retirado' : 'Retorna'"><strong [class.negative]="returnedFor(index)>0">{{ number(returnedFor(index)) }}</strong></td><td data-label="Subtotal"><strong>Bs {{ money(deliveryLineTotal(index)) }}</strong></td></tr> }</tbody></table></div>
          <div class="delivery-note-totals"><div><span>Cantidad preparada</span><strong>{{ number(preparedVisitTotal()) }}</strong></div><div><span>Cantidad entregada</span><strong>{{ number(deliveredVisitTotal()) }}</strong></div><div><span>Cantidad de retorno</span><strong>{{ number(returnedVisitTotal()) }}</strong></div><div><span>Nota de venta</span><strong>Bs {{ money(deliveredVisitAmount()) }}</strong></div></div>
          <label class="single-field"><span>Observación {{ deliveredVisitTotal() < preparedVisitTotal() ? '(obligatoria)' : '' }}</span><textarea pTextarea formControlName="observation" rows="3" placeholder="Motivo de diferencia o rechazo del cliente"></textarea></label>
          <div class="dialog-footer delivery-note-actions"><p-button type="button" label="Cerrar" [text]="true" severity="secondary" (onClick)="visitDialog.set(false)" /><p-button type="button" label="Rechazar pedido" icon="pi pi-times-circle" severity="danger" [outlined]="true" [loading]="saving()" (onClick)="registerVisit(true)" /><p-button type="submit" label="Confirmar entrega" icon="pi pi-check" severity="success" [loading]="saving()" /></div>
        </form>
      }
    </p-dialog>

    <p-dialog [visible]="settlementDialog()" (visibleChange)="settlementDialog.set($event)" [modal]="true" [style]="{width:'min(720px,96vw)'}" header="Liquidación operativa" [draggable]="false">
      <p class="intro">Registre únicamente devoluciones aceptadas por Almacén. Esta liquidación no incluye cobros, pagos ni saldos.</p><form [formGroup]="settlementForm" (ngSubmit)="settleRoute()"><div class="detail-table settlement-table" formArrayName="returns"><table><thead><tr><th>Pedido / producto</th><th>Devuelto</th><th>Aceptado</th></tr></thead><tbody>@for (control of settlementReturns.controls; track $index; let index=$index) { <tr [formGroupName]="index"><td>{{ settlementLabels()[index] }}</td><td>{{ number(settlementMaximums()[index]) }}</td><td><p-inputnumber formControlName="quantity" [min]="0" [max]="settlementMaximums()[index]" [maxFractionDigits]="3" /></td></tr> } @empty { <tr><td colspan="3" class="empty-row">No existen cantidades devueltas.</td></tr> }</tbody></table></div><label class="single-field"><span>Observación</span><textarea pTextarea formControlName="observation" rows="3"></textarea></label><div class="dialog-footer"><p-button type="button" label="Cancelar" [text]="true" severity="secondary" (onClick)="settlementDialog.set(false)" /><p-button type="submit" label="Liquidar operativamente" icon="pi pi-verified" severity="success" [loading]="saving()" /></div></form>
    </p-dialog>

    <p-dialog [visible]="preparationCancelDialog()" (visibleChange)="preparationCancelDialog.set($event)" [modal]="true" [style]="{width:'min(520px,96vw)'}" header="Cancelar preparación" [draggable]="false">
      <form [formGroup]="reasonForm" (ngSubmit)="cancelPreparation()"><p class="operational-note"><i class="pi pi-info-circle"></i> La reserva del pedido se conserva. El pedido volverá a la cola para iniciar una nueva preparación.</p><label class="single-field"><span>Motivo obligatorio</span><textarea pTextarea formControlName="reason" rows="4"></textarea></label><div class="dialog-footer"><p-button type="button" label="Volver" [text]="true" (onClick)="preparationCancelDialog.set(false)" /><p-button type="submit" label="Cancelar preparación" icon="pi pi-times" severity="danger" [loading]="saving()" /></div></form>
    </p-dialog>

    <p-dialog [visible]="routeRescheduleDialog()" (visibleChange)="routeRescheduleDialog.set($event)" [modal]="true" [style]="{width:'min(520px,96vw)'}" header="Reprogramar ruta" [draggable]="false">
      <form [formGroup]="rescheduleForm" (ngSubmit)="rescheduleRoute()"><div class="form-grid"><label><span>Nueva fecha operativa *</span><input pInputText type="date" formControlName="date" /></label><label class="wide"><span>Motivo obligatorio</span><textarea pTextarea formControlName="reason" rows="4"></textarea></label></div><p class="operational-note"><i class="pi pi-info-circle"></i> La fecha comprometida de cada pedido no se altera y continuará visible para comparar la demora o el adelanto.</p><div class="dialog-footer"><p-button type="button" label="Volver" [text]="true" (onClick)="routeRescheduleDialog.set(false)" /><p-button type="submit" label="Guardar reprogramación" icon="pi pi-calendar" [loading]="saving()" /></div></form>
    </p-dialog>

    <p-dialog [visible]="routeCancelDialog()" (visibleChange)="routeCancelDialog.set($event)" [modal]="true" [style]="{width:'min(520px,96vw)'}" header="Cancelar ruta" [draggable]="false">
      <form [formGroup]="reasonForm" (ngSubmit)="cancelRoute()"><p class="operational-note"><i class="pi pi-info-circle"></i> Las preparaciones regresarán a estado Preparada y podrán asignarse a otra ruta. Se conservará el motivo en historial y auditoría.</p><label class="single-field"><span>Motivo obligatorio</span><textarea pTextarea formControlName="reason" rows="4"></textarea></label><div class="dialog-footer"><p-button type="button" label="Volver" [text]="true" (onClick)="routeCancelDialog.set(false)" /><p-button type="submit" label="Cancelar ruta" icon="pi pi-times" severity="danger" [loading]="saving()" /></div></form>
    </p-dialog>
  `,
  styles: [`
    .page-toolbar{display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;margin-bottom:1rem}.page-toolbar h2{margin:.35rem 0;font-size:clamp(1.8rem,3vw,2.7rem);letter-spacing:-.05em}.page-toolbar p,.intro{margin:0;color:var(--text-muted);font-size:.75rem;line-height:1.55}.embedded-toolbar{display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;margin:0 0 1rem;padding:.9rem 1rem;border:1px solid var(--surface-border);border-radius:.9rem;background:#f8fbfd}.embedded-toolbar h3{margin:.2rem 0}.embedded-toolbar p,.section-heading p{margin:.2rem 0 0;color:var(--text-muted);font-size:.68rem}.eyebrow{color:var(--accent);font-size:.68rem;font-weight:850;letter-spacing:.14em;text-transform:uppercase}.view-tabs{display:flex;flex-wrap:wrap;gap:.35rem;margin-bottom:1rem;padding:.3rem;border:1px solid var(--surface-border);border-radius:.8rem;background:#fff;width:max-content;max-width:100%}.view-tabs button{display:flex;align-items:center;gap:.45rem;padding:.55rem .85rem;border:0;border-radius:.6rem;background:transparent;color:#566b7e;font-size:.7rem;font-weight:750;cursor:pointer}.view-tabs button.active{background:var(--brand-900);color:#fff}.tab-count{display:grid;place-items:center;min-width:1.2rem;height:1.2rem;padding:0 .25rem;border-radius:1rem;color:#fff;background:var(--accent);font-size:.58rem}.pending-filters{grid-template-columns:minmax(15rem,1fr) minmax(11rem,.55fr) minmax(11rem,.55fr)}.pending-overview{display:grid;grid-template-columns:repeat(3,minmax(8rem,1fr)) auto;align-items:stretch;gap:.65rem;margin-bottom:.8rem}.pending-overview article,.route-selection-summary>div{padding:.75rem .85rem;border:1px solid var(--surface-border);border-radius:.75rem;background:#fff}.pending-overview span,.pending-overview strong,.pending-overview small,.route-selection-summary span,.route-selection-summary strong{display:block}.pending-overview span,.route-selection-summary span{color:var(--text-muted);font-size:.58rem}.pending-overview strong,.route-selection-summary strong{margin-top:.2rem;font-size:1rem}.pending-overview small{margin-top:.15rem;color:var(--text-muted);font-size:.58rem}.pending-overview article.warning{border-color:#f0c36d;background:#fff8e8}.pending-delivery-actions{display:flex;align-self:center;flex-wrap:wrap;gap:.45rem}.selection-cell{width:3rem;text-align:center!important}.route-selection-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:.55rem;margin-bottom:1rem}.filters{display:grid;grid-template-columns:repeat(4,minmax(9rem,1fr));align-items:end;gap:.65rem;margin-bottom:1rem}.filters label,.form-grid label,.single-field{display:grid;gap:.35rem}.filters span,.form-grid span,.single-field span{color:#344b61;font-size:.65rem;font-weight:750}.filters input,.single-field textarea{width:100%}.weight-filters{grid-template-columns:minmax(16rem,1fr) auto}.checkbox-filter{display:flex!important;align-items:center;align-self:center;grid-template-columns:auto 1fr!important}.section-block{margin-top:1.4rem}.section-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;margin-bottom:.75rem}.section-heading span,.map-heading span{color:var(--brand-700);font-size:.62rem;font-weight:850;letter-spacing:.09em;text-transform:uppercase}.section-heading h3{margin:.2rem 0 0;font-size:1.05rem}.section-heading small,.map-heading small{color:var(--text-muted);font-size:.62rem}.table-card{overflow:hidden;border:1px solid var(--surface-border);border-radius:1rem;background:#fff}.stack strong,.stack small,.detail-table td small{display:block}.stack small,.detail-table td small{margin-top:.2rem;color:var(--text-muted);font-size:.62rem}.shortage-text{display:block;margin-top:.25rem;color:#b4232b;font-size:.58rem;font-weight:800}.empty-row{text-align:center!important;color:var(--text-muted)}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-top:.5rem}.form-grid .wide{grid-column:1/-1}.dialog-footer,.route-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:.5rem;margin-top:1.25rem;padding-top:1rem;border-top:1px solid var(--surface-border)}.detail-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:.65rem;margin-bottom:1rem}.detail-summary>div{padding:.8rem;border-radius:.7rem;background:#f4f8fb}.detail-summary span,.detail-summary strong{display:block}.detail-summary span{color:var(--text-muted);font-size:.6rem}.detail-summary strong{margin-top:.25rem;font-size:.72rem}.route-summary{grid-template-columns:repeat(6,1fr)}.capacity-alert{display:flex;align-items:flex-start;gap:.7rem;margin:.75rem 0;padding:.8rem;border:1px solid;border-radius:.75rem;font-size:.7rem}.capacity-alert i{margin-top:.1rem;font-size:1rem}.capacity-alert strong,.capacity-alert span{display:block}.capacity-alert span{margin-top:.2rem}.capacity-alert.warning{border-color:#f0c36d;background:#fff8e8;color:#7a4e00}.capacity-alert.danger{border-color:#ef9a9a;background:#fff0f0;color:#9f1d25}.capacity-alert.success{border-color:#93d7b8;background:#effaf5;color:#12633f}.vehicle-change{display:grid;grid-template-columns:minmax(15rem,1fr) minmax(12rem,.7fr) auto;align-items:end;gap:.75rem;margin:1rem 0;padding:.8rem;border:1px solid var(--surface-border);border-radius:.75rem;background:#f8fbfd}.vehicle-change label,.vehicle-change>div{display:grid;gap:.3rem}.vehicle-change span{color:var(--text-muted);font-size:.62rem}.vehicle-change strong{font-size:.72rem}.detail-table{overflow:auto;border:1px solid var(--surface-border);border-radius:.8rem}.detail-table table{width:100%;min-width:82rem;border-collapse:collapse}.detail-table th,.detail-table td{padding:.65rem .7rem;border-bottom:1px solid var(--surface-border);font-size:.68rem;text-align:left;vertical-align:middle}.detail-table th{color:#5f7285;background:#f7fafc;font-size:.58rem;text-transform:uppercase}.detail-table .p-inputnumber,.detail-table input{min-width:7rem}.negative{color:#b4232b;font-weight:800}.timeline{display:grid;margin-top:1.25rem}.timeline>div{position:relative;display:grid;grid-template-columns:1.2rem 1fr;gap:.7rem;padding-bottom:.8rem}.timeline>div:before{content:'';position:absolute;left:.36rem;top:.8rem;bottom:-.2rem;width:1px;background:#b7d3e3}.timeline>div:last-child:before{display:none}.dot{position:relative;z-index:1;width:.75rem;height:.75rem;margin-top:.25rem;border:3px solid #dceef8;border-radius:50%;background:var(--brand-700)}.timeline article{padding:.7rem;border:1px solid var(--surface-border);border-radius:.7rem}.timeline header{display:flex;justify-content:space-between;gap:1rem}.timeline header small,.timeline footer{color:var(--text-muted);font-size:.6rem}.timeline p{margin:.35rem 0;font-size:.68rem}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:.8rem;margin-bottom:1rem}.metrics article{padding:1rem;border:1px solid var(--surface-border);border-radius:.85rem;background:#fff}.metrics span,.metrics strong{display:block}.metrics span{color:var(--text-muted);font-size:.62rem}.metrics strong{margin-top:.35rem;font-size:1.35rem}.assigned-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(16rem,1fr));gap:1rem}.route-card{padding:1rem;border:1px solid var(--surface-border);border-radius:1rem;background:#fff;box-shadow:0 10px 30px rgb(0 45 90 / 6%)}.route-card header{display:flex;justify-content:space-between;gap:1rem}.route-card header span{color:var(--brand-700);font-size:.62rem;font-weight:800}.route-card h3{margin:.25rem 0}.route-card__facts{display:grid;gap:.5rem;margin:1rem 0;color:var(--text-muted);font-size:.7rem}.route-card__facts span{display:flex;align-items:center;gap:.45rem}.route-card__button{width:100%}.empty{min-height:12rem;display:grid;place-items:center;align-content:center;gap:.5rem;color:var(--text-muted)}.empty i{font-size:2rem}.route-layout{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(20rem,.85fr);gap:1rem}.route-layout>section{min-width:0}.map-heading{display:flex;justify-content:space-between;gap:1rem;margin-bottom:.5rem}.map-heading strong{display:block;margin-top:.15rem;font-size:.78rem}.route-map{height:31rem;border:1px solid var(--surface-border);border-radius:.85rem;background:#e8f0f5;overflow:hidden}.assigned-map{height:18rem}.sequence-panel{padding:.8rem;border:1px solid var(--surface-border);border-radius:.85rem}.section-heading.small{margin-bottom:.55rem}.add-deliveries{display:grid;grid-template-columns:1fr auto;gap:.5rem;margin-bottom:.7rem}.delivery-list{display:grid;gap:.45rem;max-height:24rem;margin:0 0 .7rem;padding:0;overflow:auto;list-style:none}.delivery-list li{display:flex;align-items:center;gap:.6rem;padding:.65rem;border:1px solid var(--surface-border);border-radius:.65rem;background:#fff}.delivery-list li>div:nth-child(2){min-width:0;flex:1}.delivery-list strong,.delivery-list small,.delivery-list em{display:block}.delivery-list strong{font-size:.68rem}.delivery-list small{margin-top:.2rem;color:var(--text-muted);font-size:.6rem}.delivery-list em{margin-top:.2rem;color:#b4232b;font-size:.58rem}.position,.stop-number{display:grid;place-items:center;flex:0 0 1.6rem;height:1.6rem;border-radius:50%;background:var(--brand-900);color:#fff;font-size:.64rem;font-weight:850}.order-actions{display:flex;gap:.2rem}.order-actions button{display:grid;place-items:center;width:1.6rem;height:1.6rem;border:1px solid var(--surface-border);border-radius:.4rem;background:#f5f8fa;color:var(--brand-900);cursor:pointer}.order-actions button.danger-action{color:#b4232b;background:#fff2f1}.order-actions button:disabled{opacity:.35}.assigned-route{display:grid;gap:1rem}.delivery-cards{display:grid;gap:.6rem}.delivery-cards article{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:.8rem;padding:.8rem;border:1px solid var(--surface-border);border-radius:.75rem}.delivery-cards article.done{background:#f2faf6}.delivery-cards strong,.delivery-cards small{display:block}.delivery-cards p{margin:.25rem 0;color:#40576e;font-size:.72rem}.delivery-cards small{color:var(--text-muted);font-size:.62rem}.visit-table,.settlement-table{margin-top:1rem}.visit-table table,.settlement-table table{min-width:36rem}.single-field{margin-top:1rem}@media(max-width:900px){.route-layout,.vehicle-change,.pending-overview{grid-template-columns:1fr 1fr}.pending-delivery-actions{align-self:stretch}.route-map{height:22rem}.route-summary,.route-selection-summary{grid-template-columns:repeat(2,1fr)}}@media(max-width:760px){.page-toolbar,.embedded-toolbar{align-items:flex-start;flex-direction:column}.filters,.metrics,.form-grid,.detail-summary,.weight-filters,.pending-filters,.pending-overview,.route-selection-summary{grid-template-columns:1fr}.pending-delivery-actions{display:grid;grid-template-columns:1fr}.form-grid .wide{grid-column:auto}.view-tabs{width:100%}.view-tabs button{flex:1;justify-content:center}.delivery-cards article{grid-template-columns:auto 1fr}.delivery-cards article>:last-child{grid-column:1/-1}.route-map{height:19rem}}
    .preparation-filters{grid-template-columns:repeat(3,minmax(10rem,1fr))}
    .dispatch-actions{display:flex;flex-wrap:wrap;gap:.35rem}
    .preparation-detail-table table{min-width:62rem}
    .preparation-actions{position:sticky;z-index:2;bottom:0;margin-top:.75rem;padding:.75rem;background:#fff;box-shadow:0 -8px 18px rgb(0 45 90 / 7%)}
    .history-details{margin-top:1rem}.history-details summary{cursor:pointer;color:var(--brand-700);font-size:.7rem;font-weight:800}
    .delivery-note-head,.delivery-note-totals{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:.55rem}.delivery-note-head>div,.delivery-note-totals>div{padding:.7rem;border:1px solid var(--surface-border);border-radius:.7rem;background:#f8fbfd}.delivery-note-head span,.delivery-note-totals span,.delivery-note-head strong,.delivery-note-totals strong{display:block}.delivery-note-head span,.delivery-note-totals span{color:var(--text-muted);font-size:.56rem}.delivery-note-head strong,.delivery-note-totals strong{margin-top:.2rem;font-size:.68rem}.delivery-note-totals{grid-template-columns:repeat(4,1fr);margin-top:.7rem}.delivery-note-totals strong{font-size:.86rem}.delivery-note-actions{position:sticky;z-index:3;bottom:0;background:#fff}.visit-table table{min-width:58rem!important}
    @media(max-width:760px){
      .preparation-filters{grid-template-columns:1fr}
      .dispatch-actions{display:grid;grid-template-columns:repeat(3,1fr);width:100%}
      :host ::ng-deep .dispatch-actions .p-button{width:100%;padding:.45rem .35rem;font-size:.62rem}
      :host ::ng-deep .mobile-data-table .p-datatable-thead{display:none}
      :host ::ng-deep .mobile-data-table .p-datatable-tbody{display:grid;gap:.65rem;padding:.65rem;background:#f5f8fa}
      :host ::ng-deep .mobile-data-table .p-datatable-tbody>tr{display:grid;padding:.7rem;border:1px solid var(--surface-border);border-radius:.8rem;background:#fff;box-shadow:0 4px 14px rgb(0 45 90 / 5%)}
      :host ::ng-deep .mobile-data-table .p-datatable-tbody>tr>td{display:grid;grid-template-columns:7.5rem minmax(0,1fr);align-items:center;gap:.5rem;padding:.42rem .2rem;border:0;border-bottom:1px dashed #e5edf2;text-align:right}
      :host ::ng-deep .mobile-data-table .p-datatable-tbody>tr>td:last-child{border-bottom:0}
      :host ::ng-deep .mobile-data-table .p-datatable-tbody>tr>td:before{content:attr(data-label);color:#66798a;font-size:.58rem;font-weight:800;letter-spacing:.03em;text-align:left;text-transform:uppercase}
      .preparation-detail-table{overflow:visible;border:0}
      .preparation-detail-table table,.preparation-detail-table tbody,.preparation-detail-table tr,.preparation-detail-table td{display:block;width:100%;min-width:0}
      .preparation-detail-table thead{display:none}
      .preparation-detail-table tbody{display:grid;gap:.75rem}
      .preparation-detail-table tr{padding:.75rem;border:1px solid var(--surface-border);border-radius:.8rem;background:#fff}
      .preparation-detail-table td{display:grid;grid-template-columns:7.4rem minmax(0,1fr);align-items:center;gap:.5rem;padding:.45rem 0;border-bottom:1px dashed #e5edf2;text-align:right}
      .preparation-detail-table td:last-child{border-bottom:0}.preparation-detail-table td:before{content:attr(data-label);color:#66798a;font-size:.58rem;font-weight:800;text-align:left;text-transform:uppercase}
      .preparation-detail-table td strong,.preparation-detail-table td small{text-align:right}
      :host ::ng-deep .preparation-detail-table .p-inputnumber,:host ::ng-deep .preparation-detail-table .p-inputnumber-input,.preparation-detail-table input{width:100%;min-width:0}
      .preparation-actions{display:grid;grid-template-columns:1fr;margin-left:-.5rem;margin-right:-.5rem}
      :host ::ng-deep .preparation-actions .p-button{width:100%}
      .delivery-note-head,.delivery-note-totals{grid-template-columns:1fr 1fr}.delivery-note-actions{position:static}.delivery-note-actions p-button{flex:1}:host ::ng-deep .delivery-note-dialog .p-dialog-content{padding:.75rem}
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DistributionComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly messages = inject(MessageService);
  protected readonly auth = inject(AuthService);
  readonly mode = input<'warehouse'|'distribution'>('distribution');
  private map: L.Map | null = null;
  private searchTimer?: ReturnType<typeof setTimeout>;
  private weightSearchTimer?: ReturnType<typeof setTimeout>;

  protected readonly view = signal<DistributionView>('preparations');
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly dateFilter = signal('');
  protected readonly zoneFilter = signal<string | null>(null);
  protected readonly routeStatusFilter = signal<DistributionRouteStatus | null>(null);
  protected readonly searchFilter = signal('');
  protected readonly pendingPage = signal(1);
  protected readonly eligiblePage = signal(1);
  protected readonly preparationPage = signal(1);
  protected readonly vehiclePage = signal(1);
  protected readonly routePage = signal(1);
  protected readonly summaryPage = signal(1);
  protected readonly weightPage = signal(1);
  protected readonly pageSize = signal(25);
  protected readonly pendingMeta = signal({ page: 1, limit: 25, total: 0, totalPages: 1 });
  protected readonly eligibleMeta = signal({ page: 1, limit: 25, total: 0, totalPages: 1 });
  protected readonly preparationMeta = signal({ page: 1, limit: 25, total: 0, totalPages: 1 });
  protected readonly vehicleMeta = signal({ page: 1, limit: 25, total: 0, totalPages: 1 });
  protected readonly routeMeta = signal({ page: 1, limit: 25, total: 0, totalPages: 1 });
  protected readonly summaryMeta = signal({ page: 1, limit: 25, total: 0, totalPages: 1 });
  protected readonly weightMeta = signal({ page: 1, limit: 25, total: 0, totalPages: 1 });
  protected readonly workOrders = signal<PreparationWorkOrder[]>([]);
  protected readonly pendingPreparations = signal<PendingDistributionPreparation[]>([]);
  protected readonly selectedPendingPreparations = signal<PendingDistributionPreparation[]>([]);
  protected readonly preparations = signal<OrderPreparation[]>([]);
  protected readonly vehicles = signal<Vehicle[]>([]);
  protected readonly allVehicles = signal<Vehicle[]>([]);
  protected readonly zones = signal<Zone[]>([]);
  protected readonly responsibles = signal<User[]>([]);
  protected readonly routes = signal<DistributionRoute[]>([]);
  protected readonly assignedRoutes = signal<DistributionRoute[]>([]);
  protected readonly summaryRoutes = signal<DistributionRoute[]>([]);
  protected readonly weightItems = signal<ProductPresentation[]>([]);
  protected readonly weightDrafts = signal<Record<string, number | null>>({});
  protected readonly weightSearch = signal('');
  protected readonly missingWeightsOnly = signal(true);
  protected readonly preparedOptions = signal<Array<{ id: string; label: string }>>([]);
  protected readonly selectedPreparationIds = signal<string[]>([]);
  protected readonly selectedPreparation = signal<OrderPreparation | null>(null);
  protected readonly selectedRoute = signal<DistributionRoute | null>(null);
  protected readonly selectedDelivery = signal<RouteDelivery | null>(null);
  protected readonly preparationDialog = signal(false);
  protected readonly vehicleDialog = signal(false);
  protected readonly routeDialog = signal(false);
  protected readonly routeDetailDialog = signal(false);
  protected readonly assignedDialog = signal(false);
  protected readonly visitDialog = signal(false);
  protected readonly settlementDialog = signal(false);
  protected readonly preparationCancelDialog = signal(false);
  protected readonly routeRescheduleDialog = signal(false);
  protected readonly routeCancelDialog = signal(false);
  protected readonly editingVehicleId = signal<string | null>(null);
  protected readonly settlementLabels = signal<string[]>([]);
  protected readonly settlementMaximums = signal<number[]>([]);
  protected readonly routeVehicleId = signal<string | null>(null);
  protected readonly routeDraftPreparations = signal<PendingDistributionPreparation[]>([]);

  protected readonly preparationStatuses = [
    { label: 'Pendiente', value: 'PENDIENTE' }, { label: 'En preparación', value: 'EN_PREPARACION' },
    { label: 'Observada', value: 'OBSERVADA' }, { label: 'Preparada', value: 'PREPARADA' },
    { label: 'Asignada', value: 'ASIGNADA' }, { label: 'Despachada', value: 'DESPACHADA' },
    { label: 'Cancelada', value: 'CANCELADA' },
  ];
  protected readonly routeStatuses = [
    { label: 'Borrador', value: 'BORRADOR' }, { label: 'Planificada', value: 'PLANIFICADA' },
    { label: 'En reparto', value: 'EN_REPARTO' }, { label: 'Finalizada', value: 'FINALIZADA' },
    { label: 'Liquidada', value: 'LIQUIDADA' }, { label: 'Cancelada', value: 'CANCELADA' },
  ];
  protected readonly visitResults = [
    { label: 'Entregada', value: 'ENTREGADA' }, { label: 'Entrega parcial', value: 'ENTREGA_PARCIAL' },
    { label: 'No entregada', value: 'NO_ENTREGADA' },
  ];
  protected readonly recordStatuses = [{ label: 'Activo', value: 'ACTIVO' }, { label: 'Inactivo', value: 'INACTIVO' }];

  protected readonly preparationForm = this.fb.nonNullable.group({ details: this.fb.array([]) });
  protected readonly vehicleForm = this.fb.group({
    plate: ['', [Validators.required, Validators.minLength(3)]],
    description: ['', [Validators.required, Validators.minLength(3)]],
    capacityKg: [null as number | null, [Validators.required, Validators.min(0.001)]],
    status: ['ACTIVO'],
  });
  protected readonly routeForm = this.fb.nonNullable.group({
    date: ['', Validators.required], zoneId: ['', Validators.required], vehicleId: ['', Validators.required],
    responsibleIds: [[] as string[], Validators.required], principalResponsibleId: ['', Validators.required], observation: [''],
  });
  protected readonly visitForm = this.fb.nonNullable.group({ result: ['ENTREGADA' as VisitResultType, Validators.required], observation: [''], details: this.fb.array([]) });
  protected readonly settlementForm = this.fb.nonNullable.group({ observation: [''], returns: this.fb.array([]) });
  protected readonly reasonForm = this.fb.nonNullable.group({ reason: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(1000)]] });
  protected readonly rescheduleForm = this.fb.nonNullable.group({ date: ['', Validators.required], reason: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(1000)]] });

  protected get preparationDetails(): FormArray { return this.preparationForm.controls.details; }
  protected get visitDetails(): FormArray { return this.visitForm.controls.details; }
  protected get settlementReturns(): FormArray { return this.settlementForm.controls.returns; }

  ngOnInit(): void {
    this.selectInitialView();
    this.loadReferences();
    this.reload();
  }

  ngOnDestroy(): void {
    this.destroyMap();
    if (this.searchTimer) clearTimeout(this.searchTimer);
    if (this.weightSearchTimer) clearTimeout(this.weightSearchTimer);
  }

  private selectInitialView(): void {
    if (this.mode() === 'warehouse') { this.view.set('preparations'); return; }
    if (this.auth.can('distribution.routes.read')) this.view.set('pending');
    else if (this.auth.can('vehicles.read')) this.view.set('vehicles');
    else if (this.auth.can('distribution.routes.assigned.read')) this.view.set('assigned');
    else if (this.auth.can('distribution.routes.read')) this.view.set('routes');
    else if (this.auth.can('distribution.weights.read')) this.view.set('weights');
    else this.view.set('summary');
  }

  protected setView(view: DistributionView): void { this.view.set(view); this.reload(); }
  protected reload(): void {
    if (this.view() === 'pending') this.loadPendingDeliveries();
    if (this.view() === 'preparations') this.loadPreparations();
    if (this.view() === 'vehicles') this.loadVehicles();
    if (this.view() === 'weights') this.loadWeights();
    if (this.view() === 'routes') this.loadRoutes();
    if (this.view() === 'assigned') this.loadAssigned();
    if (this.view() === 'summary') this.loadSummary();
  }

  private loadReferences(): void {
    if (this.auth.can('zones.read')) this.http.get<Zone[]>('/api/zones').subscribe({ next: (items) => this.zones.set(items.filter((item) => item.status === 'ACTIVO')) });
    if (this.mode() === 'distribution' && this.auth.can('vehicles.read')) { this.loadVehicles(); this.loadVehicleOptions(); }
    if (this.auth.can('distribution.routes.create')) this.http.get<User[]>('/api/distribution-routes/responsible-options').subscribe({ next: (items) => this.responsibles.set(items) });
  }

  protected loadPendingDeliveries(): void {
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
  protected onPendingSearch(value: string): void { this.searchFilter.set(value); this.pendingPage.set(1); this.clearPendingSelection(); if (this.searchTimer) clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => this.loadPendingDeliveries(), 250); }
  protected changePendingPage(event: PaginatorState): void { this.applyPageSize(event); this.pendingPage.set((event.page ?? 0) + 1); this.loadPendingDeliveries(); }
  protected isPendingSelected(id: string): boolean { return this.selectedPendingPreparations().some((item) => item.id === id); }
  protected allPendingPageSelected(): boolean { return this.pendingPreparations().length > 0 && this.pendingPreparations().every((item) => this.isPendingSelected(item.id)); }
  protected togglePendingPreparation(item: PendingDistributionPreparation, selected: boolean): void {
    this.selectedPendingPreparations.update((items) => selected
      ? items.some((candidate) => candidate.id === item.id) ? items : [...items, item]
      : items.filter((candidate) => candidate.id !== item.id));
  }
  protected togglePendingPage(selected: boolean): void {
    const pageIds = new Set(this.pendingPreparations().map((item) => item.id));
    this.selectedPendingPreparations.update((items) => selected
      ? [...items, ...this.pendingPreparations().filter((item) => !items.some((candidate) => candidate.id === item.id))]
      : items.filter((item) => !pageIds.has(item.id)));
  }
  protected clearPendingSelection(): void { this.selectedPendingPreparations.set([]); }
  protected selectedPendingZoneIds(): string[] { return [...new Set(this.selectedPendingPreparations().map((item) => item.order.address.zoneId).filter((id): id is string => Boolean(id)))]; }
  protected selectedPendingWeight(): number { return this.selectedPendingPreparations().reduce((total, item) => total + Number(item.loadWeightKg), 0); }
  protected selectedPendingProductCount(): number { return this.selectedPendingPreparations().reduce((total, item) => total + Number(item.detailCount ?? 0), 0); }
  protected selectedPendingMissingWeights(): string[] { return [...new Set(this.selectedPendingPreparations().flatMap((item) => item.missingWeightPresentations))]; }
  protected openRouteFromPending(): void {
    const selected = this.selectedPendingPreparations();
    const zoneIds = this.selectedPendingZoneIds();
    if (!selected.length) return;
    if (zoneIds.length !== 1) return this.messages.add({ severity: 'warn', summary: 'Selección incompatible', detail: 'Seleccione pedidos pertenecientes a una sola zona.' });
    const deliveryDate = [...selected].sort((a, b) => a.order.requestedDate.localeCompare(b.order.requestedDate))[0].order.requestedDate;
    this.routeDraftPreparations.set(selected);
    this.routeForm.reset({ date: deliveryDate, zoneId: zoneIds[0], vehicleId: '', responsibleIds: [], principalResponsibleId: '', observation: '' });
    this.routeDialog.set(true);
  }
  protected openFactoryDelivery(): void {
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
  protected routeDraftWeight(): number { return this.routeDraftPreparations().reduce((total, item) => total + Number(item.loadWeightKg), 0); }
  protected routeDraftMissingWeights(): string[] { return [...new Set(this.routeDraftPreparations().flatMap((item) => item.missingWeightPresentations))]; }
  protected routeDraftCapacityExceeded(): boolean { const vehicle = this.activeVehicles().find((item) => item.id === this.routeForm.controls.vehicleId.value); return Boolean(vehicle?.capacityKg) && this.routeDraftWeight() > Number(vehicle!.capacityKg) + 0.0005; }
  protected routeDraftCapacityLabel(): string {
    const vehicle = this.activeVehicles().find((item) => item.id === this.routeForm.controls.vehicleId.value);
    if (!vehicle) return 'Seleccione un vehículo';
    if (!vehicle.capacityKg) return 'Sin capacidad configurada';
    const difference = Number(vehicle.capacityKg) - this.routeDraftWeight();
    return difference < -0.0005 ? `Excede por ${this.number(Math.abs(difference))} kg` : `${this.number(difference)} kg disponibles`;
  }

  private filterParams(page: number): HttpParams {
    let params = new HttpParams().set('page', page).set('limit', this.pageSize());
    if (this.dateFilter()) params = params.set('deliveryDate', this.dateFilter());
    if (this.zoneFilter()) params = params.set('zoneId', this.zoneFilter()!);
    if (this.searchFilter().trim()) params = params.set('q', this.searchFilter().trim());
    return params;
  }

  protected loadPreparations(): void {
    this.loading.set(true);
    const preparationParams = this.filterParams(this.preparationPage()).set('stage', 'READY');
    if (this.auth.can('preparations.create')) {
      this.http.get<Paginated<PreparationWorkOrder>>('/api/preparations/work-queue', { params: this.filterParams(this.eligiblePage()) }).subscribe({ next: (response) => { this.workOrders.set(response.data); this.eligibleMeta.set(response.meta); }, error: (error) => this.fail(error) });
    }
    this.http.get<Paginated<OrderPreparation>>('/api/preparations', { params: preparationParams }).subscribe({ next: (response) => { this.preparations.set(response.data); this.preparationMeta.set(response.meta); this.loading.set(false); }, error: (error) => this.fail(error) });
  }

  protected resetPreparationPages(): void { this.eligiblePage.set(1); this.preparationPage.set(1); }
  protected onPreparationSearch(value: string): void { this.searchFilter.set(value); this.resetPreparationPages(); if (this.searchTimer) clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => this.loadPreparations(), 250); }
  protected changeEligiblePage(event: PaginatorState): void { this.applyPageSize(event); this.eligiblePage.set((event.page ?? 0) + 1); this.loadPreparations(); }
  protected changePreparationPage(event: PaginatorState): void { this.applyPageSize(event); this.preparationPage.set((event.page ?? 0) + 1); this.loadPreparations(); }

  protected prepareWorkOrder(order: PreparationWorkOrder): void {
    if (order.preparation) return this.openPreparation(order.preparation);
    this.saving.set(true);
    this.http.post<OrderPreparation>('/api/preparations', { orderId: order.id }).subscribe({
      next: (item) => { this.saving.set(false); this.saved('Preparación iniciada', order.code); this.loadPreparations(); this.openPreparation(item); },
      error: (error) => this.failSave(error),
    });
  }

  protected openPreparation(item: OrderPreparation): void {
    this.http.get<OrderPreparation>(`/api/preparations/${item.id}`).subscribe({
      next: (value) => { this.selectedPreparation.set(value); this.buildPreparationForm(value); this.preparationDialog.set(true); },
      error: (error) => this.fail(error),
    });
  }

  private buildPreparationForm(preparation: OrderPreparation): void {
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

  protected canSubmitPreparation(): boolean {
    const preparation = this.selectedPreparation();
    if (!preparation || this.preparationForm.invalid || !this.canEditPreparation(preparation.status)) return false;
    const details = this.preparationDetails.getRawValue();
    return details.length > 0 && details.every((detail) => detail.verified && detail.preparedQuantity === Number(preparation.details.find((item) => item.id === detail.id)?.requestedQuantity) && Number(preparation.details.find((item) => item.id === detail.id)?.pickableQuantityCurrent ?? 0) >= detail.preparedQuantity);
  }

  protected prepareCurrent(): void {
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

  protected openPreparationCancellation(): void { this.reasonForm.reset({ reason: '' }); this.preparationCancelDialog.set(true); }
  protected requestPreparationCancellation(item: OrderPreparation): void { this.selectedPreparation.set(item); this.openPreparationCancellation(); }
  protected editPrepared(item: OrderPreparation): void {
    this.saving.set(true);
    this.http.post<OrderPreparation>(`/api/preparations/${item.id}/reopen`, {}).subscribe({
      next: (value) => { this.saving.set(false); this.selectedPreparation.set(value); this.buildPreparationForm(value); this.preparationDialog.set(true); this.loadPreparations(); },
      error: (error) => this.failSave(error),
    });
  }
  protected handoffPreparation(item: OrderPreparation): void {
    this.saving.set(true);
    this.http.post<OrderPreparation>(`/api/preparations/${item.id}/handoff`, {}).subscribe({
      next: () => { this.saving.set(false); this.saved('Pedido entregado a Distribución', item.order.code); this.loadPreparations(); },
      error: (error) => this.failSave(error),
    });
  }
  protected cancelPreparation(): void {
    const preparation = this.selectedPreparation();
    if (!preparation || this.reasonForm.invalid) return this.reasonForm.markAllAsTouched();
    this.saving.set(true);
    this.http.post<OrderPreparation>(`/api/preparations/${preparation.id}/cancel`, this.reasonForm.getRawValue()).subscribe({
      next: (value) => { this.saving.set(false); this.preparationCancelDialog.set(false); this.preparationDialog.set(false); this.selectedPreparation.set(value); this.saved('Preparación cancelada', preparation.order.code); this.loadPreparations(); },
      error: (error) => this.failSave(error),
    });
  }

  protected loadVehicles(): void {
    this.loading.set(true);
    this.http.get<Paginated<Vehicle>>('/api/vehicles', { params: new HttpParams().set('page', this.vehiclePage()).set('limit', this.pageSize()) }).subscribe({ next: (response) => { this.vehicles.set(response.data); this.vehicleMeta.set(response.meta); this.loading.set(false); }, error: (error) => this.fail(error) });
  }
  protected changeVehiclePage(event: PaginatorState): void { this.applyPageSize(event); this.vehiclePage.set((event.page ?? 0) + 1); this.loadVehicles(); }
  private loadVehicleOptions(): void { this.http.get<Paginated<Vehicle>>('/api/vehicles', { params: new HttpParams().set('limit', 100) }).subscribe({ next: (response) => this.allVehicles.set(response.data) }); }
  protected activeVehicles(): Vehicle[] { return this.allVehicles().filter((item) => item.status === 'ACTIVO'); }
  protected vehicleOptions(): Array<{ id: string; label: string }> {
    return this.activeVehicles().map((item) => ({ id: item.id, label: `${item.plate} · ${item.capacityKg ? `${this.number(item.capacityKg)} kg` : 'sin capacidad'}` }));
  }
  protected openVehicle(item?: Vehicle): void {
    this.editingVehicleId.set(item?.id ?? null);
    this.vehicleForm.reset({ plate: item?.plate ?? '', description: item?.description ?? '', capacityKg: item?.capacityKg ? Number(item.capacityKg) : null, status: item?.status ?? 'ACTIVO' });
    this.vehicleDialog.set(true);
  }
  protected saveVehicle(): void {
    if (this.vehicleForm.invalid) return this.vehicleForm.markAllAsTouched();
    const value = this.vehicleForm.getRawValue();
    const id = this.editingVehicleId();
    const basePayload = { plate: value.plate, description: value.description, capacityKg: value.capacityKg! };
    const payload = id ? { ...basePayload, status: value.status } : basePayload;
    this.saving.set(true);
    const request = id ? this.http.patch<Vehicle>(`/api/vehicles/${id}`, payload) : this.http.post<Vehicle>('/api/vehicles', payload);
    request.subscribe({ next: () => { this.saving.set(false); this.vehicleDialog.set(false); this.saved(id ? 'Vehículo actualizado' : 'Vehículo registrado', value.plate || ''); this.loadVehicles(); this.loadVehicleOptions(); }, error: (error) => this.failSave(error) });
  }

  protected loadWeights(): void {
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
  protected onWeightSearch(value: string): void { this.weightSearch.set(value); this.weightPage.set(1); if (this.weightSearchTimer) clearTimeout(this.weightSearchTimer); this.weightSearchTimer = setTimeout(() => this.loadWeights(), 250); }
  protected changeWeightPage(event: PaginatorState): void { this.applyPageSize(event); this.weightPage.set((event.page ?? 0) + 1); this.loadWeights(); }
  protected setWeightDraft(id: string, value: number | null): void { this.weightDrafts.set({ ...this.weightDrafts(), [id]: value === null ? null : Number(value) }); }
  protected pendingWeightItems(): Array<{ presentationId: string; weightKg: number }> {
    return this.weightItems().flatMap((item) => {
      const value = this.weightDrafts()[item.id];
      return value && value > 0 && Math.abs(value - Number(item.weightKg ?? 0)) > 0.0000005 ? [{ presentationId: item.id, weightKg: value }] : [];
    });
  }
  protected saveWeights(): void {
    const items = this.pendingWeightItems();
    if (!items.length) return;
    this.saving.set(true);
    this.http.put<{ updated: number }>('/api/distribution-routes/presentation-weights', { items }).subscribe({
      next: (response) => { this.saving.set(false); this.saved('Pesos actualizados', `${response.updated} presentación(es)`); this.loadWeights(); },
      error: (error) => this.failSave(error),
    });
  }

  private routeParams(page: number): HttpParams {
    let params = new HttpParams().set('page', page).set('limit', this.pageSize());
    if (this.dateFilter()) params = params.set('date', this.dateFilter());
    if (this.zoneFilter()) params = params.set('zoneId', this.zoneFilter()!);
    if (this.routeStatusFilter()) params = params.set('status', this.routeStatusFilter()!);
    if (this.searchFilter().trim()) params = params.set('q', this.searchFilter().trim());
    return params;
  }
  protected loadRoutes(): void { this.loading.set(true); this.http.get<Paginated<DistributionRoute>>('/api/distribution-routes', { params: this.routeParams(this.routePage()) }).subscribe({ next: (response) => { this.routes.set(response.data); this.routeMeta.set(response.meta); this.loading.set(false); }, error: (error) => this.fail(error) }); }
  protected loadSummary(): void { this.loading.set(true); this.http.get<Paginated<DistributionRoute>>('/api/distribution-routes/summary', { params: this.routeParams(this.summaryPage()) }).subscribe({ next: (response) => { this.summaryRoutes.set(response.data); this.summaryMeta.set(response.meta); this.loading.set(false); }, error: (error) => this.fail(error) }); }
  protected loadAssigned(): void { this.loading.set(true); this.http.get<DistributionRoute[]>('/api/distribution-routes/my-route').subscribe({ next: (items) => { this.assignedRoutes.set(items); this.loading.set(false); }, error: (error) => this.fail(error) }); }
  protected resetRoutePages(): void { this.routePage.set(1); this.summaryPage.set(1); }
  protected onRouteSearch(value: string): void { this.searchFilter.set(value); this.resetRoutePages(); if (this.searchTimer) clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => this.reload(), 250); }
  protected changeRoutePage(event: PaginatorState): void { this.applyPageSize(event); this.routePage.set((event.page ?? 0) + 1); this.loadRoutes(); }
  protected changeSummaryPage(event: PaginatorState): void { this.applyPageSize(event); this.summaryPage.set((event.page ?? 0) + 1); this.loadSummary(); }

  protected openRoute(): void { this.routeDraftPreparations.set([]); this.routeForm.reset({ date: this.dateFilter(), zoneId: this.zoneFilter() ?? '', vehicleId: '', responsibleIds: [], principalResponsibleId: '', observation: '' }); this.routeDialog.set(true); }
  protected createRoute(): void {
    if (this.routeForm.invalid) return this.routeForm.markAllAsTouched();
    const raw = this.routeForm.getRawValue();
    if (!raw.responsibleIds.includes(raw.principalResponsibleId)) return this.messages.add({ severity: 'warn', summary: 'Asignación incompleta', detail: 'El responsable principal debe estar incluido en los responsables asignados.' });
    if (this.routeDraftCapacityExceeded()) return this.messages.add({ severity: 'warn', summary: 'Capacidad excedida', detail: 'Seleccione un vehículo con capacidad suficiente para la carga.' });
    this.saving.set(true);
    const preparationIds = this.routeDraftPreparations().map((item) => item.id);
    this.http.post<DistributionRoute>('/api/distribution-routes', { ...raw, preparationIds: preparationIds.length ? preparationIds : undefined, observation: raw.observation || undefined }).subscribe({ next: (route) => { this.saving.set(false); this.routeDialog.set(false); this.routeDraftPreparations.set([]); this.clearPendingSelection(); this.saved(preparationIds.length ? 'Ruta creada y pedidos asignados' : 'Ruta creada', route.code); this.loadPendingDeliveries(); this.loadRoutes(); this.openRouteDetail(route); }, error: (error) => this.failSave(error) });
  }
  protected openRouteDetail(route: DistributionRoute): void { this.http.get<DistributionRoute>(`/api/distribution-routes/${route.id}`).subscribe({ next: (value) => { this.selectedRoute.set(value); this.routeVehicleId.set(value.vehicleId); this.routeDetailDialog.set(true); this.loadPreparedOptions(value); setTimeout(() => this.renderMap('distribution-route-map', value), 80); }, error: (error) => this.fail(error) }); }
  protected closeRouteDetail(visible: boolean): void { this.routeDetailDialog.set(visible); if (!visible) this.destroyMap(); }
  private loadPreparedOptions(route: DistributionRoute): void {
    const params = new HttpParams().set('limit', 100).set('stage', 'HANDED_OFF').set('zoneId', route.zoneId);
    this.http.get<Paginated<OrderPreparation>>('/api/preparations', { params }).subscribe({ next: (response) => this.preparedOptions.set(response.data.map((item) => ({ id: item.id, label: `${item.order.code} · ${item.order.customerNameSnapshot || item.order.customer.businessName} · compromiso ${this.formatDate(item.order.requestedDate)}` }))) });
  }
  protected addDeliveries(): void { const route = this.selectedRoute(); if (!route || !this.selectedPreparationIds().length) return; this.saving.set(true); this.http.post<DistributionRoute>(`/api/distribution-routes/${route.id}/deliveries`, { preparationIds: this.selectedPreparationIds() }).subscribe({ next: (value) => { this.saving.set(false); this.selectedPreparationIds.set([]); this.updateSelectedRoute(value); this.loadPreparedOptions(value); this.saved('Pedidos agregados', value.code); }, error: (error) => this.failSave(error) }); }
  protected removeRouteDelivery(delivery: RouteDelivery): void { const route = this.selectedRoute(); if (!route) return; this.saving.set(true); this.http.delete<DistributionRoute>(`/api/distribution-routes/${route.id}/deliveries/${delivery.id}`).subscribe({ next: (value) => { this.saving.set(false); this.updateSelectedRoute(value); this.loadPreparedOptions(value); this.saved('Pedido retirado', delivery.order.code); }, error: (error) => this.failSave(error) }); }
  protected moveDelivery(index: number, offset: number): void { const route = this.selectedRoute(); if (!route) return; const target = index + offset; if (target < 0 || target >= route.deliveries.length) return; const deliveries = [...route.deliveries]; [deliveries[index], deliveries[target]] = [deliveries[target], deliveries[index]]; deliveries.forEach((delivery, position) => delivery.position = position + 1); this.selectedRoute.set({ ...route, deliveries }); this.renderMapSoon('distribution-route-map'); }
  protected saveSequence(): void { const route = this.selectedRoute(); if (!route) return; this.saving.set(true); this.http.put<DistributionRoute>(`/api/distribution-routes/${route.id}/sequence`, { deliveries: route.deliveries.map((delivery, index) => ({ routeDeliveryId: delivery.id, position: index + 1 })) }).subscribe({ next: (value) => { this.saving.set(false); this.updateSelectedRoute(value); this.saved('Secuencia guardada', value.code); }, error: (error) => this.failSave(error) }); }
  protected changeRouteVehicle(): void { const route = this.selectedRoute(); const vehicleId = this.routeVehicleId(); if (!route || !vehicleId || vehicleId === route.vehicleId) return; this.saving.set(true); this.http.put<DistributionRoute>(`/api/distribution-routes/${route.id}/vehicle`, { vehicleId }).subscribe({ next: (value) => { this.saving.set(false); this.updateSelectedRoute(value); this.saved('Vehículo actualizado', value.vehicle.plate); this.loadRoutes(); }, error: (error) => this.failSave(error) }); }
  protected routeAction(action: 'plan'|'departure'|'finish'): void { const route = this.selectedRoute(); if (!route) return; this.saving.set(true); this.http.post<DistributionRoute>(`/api/distribution-routes/${route.id}/${action}`, {}).subscribe({ next: (value) => { this.saving.set(false); this.updateSelectedRoute(value); this.saved(action==='plan'?'Ruta planificada':action==='departure'?'Salida registrada':'Recorrido finalizado', value.code); this.loadRoutes(); }, error: (error) => this.failSave(error) }); }
  protected openRouteReschedule(): void { const route = this.selectedRoute(); if (!route) return; this.rescheduleForm.reset({ date: route.date, reason: '' }); this.routeRescheduleDialog.set(true); }
  protected rescheduleRoute(): void { const route = this.selectedRoute(); if (!route || this.rescheduleForm.invalid) return this.rescheduleForm.markAllAsTouched(); this.saving.set(true); this.http.put<DistributionRoute>(`/api/distribution-routes/${route.id}/reschedule`, this.rescheduleForm.getRawValue()).subscribe({ next: (value) => { this.saving.set(false); this.routeRescheduleDialog.set(false); this.updateSelectedRoute(value); this.saved('Ruta reprogramada', this.formatDate(value.date)); this.loadRoutes(); }, error: (error) => this.failSave(error) }); }
  protected openRouteCancellation(): void { this.reasonForm.reset({ reason: '' }); this.routeCancelDialog.set(true); }
  protected cancelRoute(): void { const route = this.selectedRoute(); if (!route || this.reasonForm.invalid) return this.reasonForm.markAllAsTouched(); this.saving.set(true); this.http.post<DistributionRoute>(`/api/distribution-routes/${route.id}/cancel`, this.reasonForm.getRawValue()).subscribe({ next: (value) => { this.saving.set(false); this.routeCancelDialog.set(false); this.updateSelectedRoute(value); this.saved('Ruta cancelada', value.code); this.loadRoutes(); }, error: (error) => this.failSave(error) }); }
  private updateSelectedRoute(route: DistributionRoute): void { this.selectedRoute.set(route); this.routeVehicleId.set(route.vehicleId); this.renderMapSoon('distribution-route-map'); }

  protected openAssignedRoute(route: DistributionRoute): void { this.selectedRoute.set(route); this.assignedDialog.set(true); setTimeout(() => this.renderMap('assigned-route-map', route), 80); }
  protected closeAssignedDialog(visible: boolean): void { this.assignedDialog.set(visible); if (!visible) this.destroyMap(); }
  protected openVisit(delivery: RouteDelivery): void {
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

  protected registerVisit(rejected = false): void {
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

  protected returnedFor(index: number): number {
    const delivery = this.selectedDelivery();
    if (!delivery) return 0;
    return Math.max(0, Number(delivery.preparation.details[index].preparedQuantity) - Number(this.visitDetails.at(index).get('deliveredQuantity')?.value ?? 0));
  }

  protected preparedVisitTotal(): number { return this.selectedDelivery()?.preparation.details.reduce((sum, detail) => sum + Number(detail.preparedQuantity), 0) ?? 0; }
  protected deliveredVisitTotal(): number { return this.visitDetails.controls.reduce((sum, control) => sum + Number(control.get('deliveredQuantity')?.value ?? 0), 0); }
  protected returnedVisitTotal(): number { return Math.max(0, this.preparedVisitTotal() - this.deliveredVisitTotal()); }
  protected deliveryLineTotal(index: number): number { const delivery = this.selectedDelivery(); return delivery ? Number(this.visitDetails.at(index).get('deliveredQuantity')?.value ?? 0) * Number(delivery.preparation.details[index].orderDetail.unitPrice) : 0; }
  protected deliveredVisitAmount(): number { return this.visitDetails.controls.reduce((sum, _control, index) => sum + this.deliveryLineTotal(index), 0); }
  protected routeHasReturns(route: DistributionRoute): boolean { return route.deliveries.some((delivery) => delivery.result?.details.some((detail) => Number(detail.returnedQuantity) > 0)); }

  protected openSettlement(): void { const route = this.selectedRoute(); if (!route) return; this.settlementReturns.clear(); const labels: string[] = []; const maximums: number[] = []; for (const delivery of route.deliveries) for (const detail of delivery.result?.details ?? []) if (Number(detail.returnedQuantity) > 0) { this.settlementReturns.push(this.fb.nonNullable.group({ id: [detail.id], quantity: [0, [Validators.required, Validators.min(0), Validators.max(Number(detail.returnedQuantity))]] })); labels.push(`${delivery.order.code} · ${detail.preparationDetail.orderDetail.productDescriptionSnapshot}`); maximums.push(Number(detail.returnedQuantity)); } this.settlementLabels.set(labels); this.settlementMaximums.set(maximums); this.settlementForm.controls.observation.setValue(''); this.settlementDialog.set(true); }
  protected settleRoute(): void { const route = this.selectedRoute(); if (!route || this.settlementForm.invalid) return this.settlementForm.markAllAsTouched(); this.saving.set(true); const raw = this.settlementForm.getRawValue(); this.http.post<DistributionRoute>(`/api/distribution-routes/${route.id}/settlement`, { observation: raw.observation || undefined, acceptedReturns: this.settlementReturns.getRawValue().map((item) => ({ visitDetailId: item.id, quantity: item.quantity })) }).subscribe({ next: (value) => { this.saving.set(false); this.settlementDialog.set(false); this.updateSelectedRoute(value); this.saved('Ruta liquidada', value.code); this.loadRoutes(); }, error: (error) => this.failSave(error) }); }

  private renderMap(elementId: string, route: DistributionRoute): void {
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
  private renderMapSoon(elementId: string): void { const route = this.selectedRoute(); if (route) setTimeout(() => this.renderMap(elementId, route), 50); }
  private destroyMap(): void { this.map?.remove(); this.map = null; }

  protected hasCoordinates(delivery: RouteDelivery): boolean { const lat = Number(delivery.address.latitude); const lng = Number(delivery.address.longitude); return delivery.address.latitude !== null && delivery.address.longitude !== null && Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180; }
  protected canEditPreparation(status: PreparationStatus): boolean { return ['PENDIENTE','EN_PREPARACION','OBSERVADA'].includes(status); }
  protected readonly workflowLabel=workflowLabel;
  protected canConfirmPreparation(status: PreparationStatus): boolean { return ['EN_PREPARACION','OBSERVADA'].includes(status); }
  protected canCancelPreparation(status: PreparationStatus): boolean { return ['PENDIENTE','EN_PREPARACION','OBSERVADA','PREPARADA'].includes(status); }
  protected detailDifference(index: number): number { const preparation = this.selectedPreparation(); return Number(this.preparationDetails.at(index).get('preparedQuantity')?.value ?? 0) - Number(preparation?.details[index].requestedQuantity ?? 0); }
  protected preparationQuantityLimit(detail: OrderPreparationDetail): number { return Math.min(Number(detail.requestedQuantity), Number(detail.pickableQuantityCurrent)); }
  protected productionOrderLabels(detail: OrderPreparationDetail): string { return detail.relatedProductionOrders.map((item) => `${item.code} (${statusLabel(item.status)})`).join(', '); }
  protected preparationTitle(): string { return this.selectedPreparation() ? `Preparación · ${this.selectedPreparation()!.order.code}` : 'Preparación'; }
  protected routeTitle(): string { return this.selectedRoute() ? `${this.selectedRoute()!.code} · ${statusLabel(this.selectedRoute()!.status)}` : 'Ruta'; }
  protected principal(route: DistributionRoute): string { return route.responsibles.find((item) => item.isPrincipal)?.user.name ?? 'Sin principal'; }
  protected controlsAllDeliveries(): boolean { return this.auth.user()?.roles.some((role) => role === 'ADMINISTRADOR' || role === 'COMERCIALIZACION') ?? false; }
  protected orderTotal(order: EligibleOrder, key: 'reservedQuantity'): string { return this.number(order.details.reduce((sum, detail) => sum + Number(detail[key]), 0)); }
  protected availableLines(order:EligibleOrder):number{return order.details.filter(detail=>detail.availability==='DISPONIBLE').length;}
  protected availableTotal(order: EligibleOrder): string { return this.number(order.details.reduce((sum, detail) => sum + Number(detail.availableQuantity), 0)); }
  protected availableTotalNumber(order: EligibleOrder): number { return order.details.reduce((sum, detail) => sum + Number(detail.availableQuantity), 0); }
  protected summaryTotal(key: 'complete'|'partial'|'notDelivered'): number { return this.summaryRoutes().reduce((sum, route) => sum + Number(route.metrics?.[key] ?? 0), 0); }
  protected routeRemainingCapacity(route: DistributionRoute): number { return Math.max(0, Number(route.vehicle.capacityKg ?? 0) - Number(route.loadWeightKg ?? 0)); }
  protected prospectiveExcess(route: DistributionRoute): number { const vehicle = this.activeVehicles().find((item) => item.id === this.routeVehicleId()); return Math.max(0, Number(route.loadWeightKg ?? 0) - Number(vehicle?.capacityKg ?? 0)); }
  protected prospectiveCapacityLabel(route: DistributionRoute): string { const vehicle = this.activeVehicles().find((item) => item.id === this.routeVehicleId()); if (!vehicle?.capacityKg) return 'Capacidad no configurada'; if (route.missingWeightPresentations.length) return 'Peso incompleto'; const excess = this.prospectiveExcess(route); return excess > 0 ? `Excede por ${this.number(excess)} kg` : `${this.number(Number(vehicle.capacityKg) - Number(route.loadWeightKg ?? 0))} kg disponibles`; }
  protected statusLabel(value: string): string { return statusLabel(value); }
  protected preparationSeverity(status: PreparationStatus): 'info'|'warn'|'success'|'secondary'|'danger' { return status==='CANCELADA'?'danger':status==='PREPARADA'||status==='DESPACHADA'?'success':status==='OBSERVADA'?'warn':status==='ASIGNADA'?'info':'secondary'; }
  protected routeSeverity(status: DistributionRouteStatus): 'info'|'warn'|'success'|'secondary'|'danger' { return status==='CANCELADA'?'danger':status==='LIQUIDADA'?'success':status==='EN_REPARTO'?'warn':status==='PLANIFICADA'||status==='FINALIZADA'?'info':'secondary'; }
  protected visitSeverity(result: VisitResultType): 'success'|'warn'|'danger' { return result==='ENTREGADA'?'success':result==='ENTREGA_PARCIAL'?'warn':'danger'; }
  protected formatDate(value: string): string { return new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium' }).format(new Date(`${value.slice(0,10)}T12:00:00`)); }
  protected formatDateTime(value: string): string { return new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
  protected number(value: string|number): string { return new Intl.NumberFormat('es-BO', { maximumFractionDigits: 3 }).format(Number(value)); }
  protected money(value: string|number): string { return new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value)); }
  protected numberValue(value: string|number): number { return Number(value); }
  private applyPageSize(event: PaginatorState): void {
    const rows = event.rows ?? this.pageSize();
    if (rows !== this.pageSize()) {
      this.pageSize.set(rows);
      this.pendingPage.set(1); this.eligiblePage.set(1); this.preparationPage.set(1); this.vehiclePage.set(1); this.routePage.set(1); this.summaryPage.set(1); this.weightPage.set(1);
    }
  }
  private saved(summary: string, detail: string): void { this.messages.add({ severity: 'success', summary, detail }); }
  private fail(error: unknown): void { this.loading.set(false); this.messages.add({ severity: 'error', summary: 'No se pudo cargar Distribución', detail: this.error(error) }); }
  private failSave(error: unknown): void { this.saving.set(false); this.messages.add({ severity: 'error', summary: 'No se pudo completar la operación', detail: this.error(error) }); }
  private error(error: unknown): string { if (!(error instanceof HttpErrorResponse)) return 'Error inesperado'; const message = error.error?.message; return Array.isArray(message) ? message.join('. ') : message || 'La solicitud no pudo completarse'; }
}

function statusLabel(value: string): string {
  const labels: Record<string,string> = { EN_PREPARACION:'EN PREPARACIÓN', EN_REPARTO:'EN REPARTO', ENTREGA_PARCIAL:'ENTREGA PARCIAL', NO_ENTREGADA:'NO ENTREGADA' };
  return labels[value] ?? value;
}
