import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
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
  OrderPreparation,
  Paginated,
  PreparationStatus,
  RouteDelivery,
  User,
  Vehicle,
  VisitResultType,
  Zone,
} from '../core/models';

type DistributionView = 'preparations' | 'vehicles' | 'routes' | 'assigned' | 'summary';

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
    SelectModule,
    TableModule,
    TagModule,
    TextareaModule,
  ],
  template: `
    <header class="page-toolbar">
      <div><span class="eyebrow">Cuarta iteración</span><h2>Preparación y distribución</h2><p>Separación por pedido, despacho, rutas y liquidación operativa.</p></div>
      <p-button icon="pi pi-refresh" label="Actualizar" [outlined]="true" (onClick)="reload()" />
    </header>

    <nav class="view-tabs" aria-label="Vistas de distribución">
      @if (auth.can('preparations.read')) { <button type="button" [class.active]="view()==='preparations'" (click)="setView('preparations')"><i class="pi pi-box"></i> Preparación</button> }
      @if (auth.can('vehicles.read')) { <button type="button" [class.active]="view()==='vehicles'" (click)="setView('vehicles')"><i class="pi pi-truck"></i> Vehículos</button> }
      @if (auth.can('distribution.routes.read')) { <button type="button" [class.active]="view()==='routes'" (click)="setView('routes')"><i class="pi pi-map"></i> Rutas</button> }
      @if (auth.can('distribution.routes.assigned.read')) { <button type="button" [class.active]="view()==='assigned'" (click)="setView('assigned')"><i class="pi pi-directions"></i> Mi reparto</button> }
      @if (auth.can('distribution.summary.read')) { <button type="button" [class.active]="view()==='summary'" (click)="setView('summary')"><i class="pi pi-chart-bar"></i> Resumen</button> }
    </nav>

    @if (view()==='preparations') {
      <section class="filters">
        <label><span>Fecha de entrega</span><input pInputText type="date" [ngModel]="dateFilter()" (ngModelChange)="dateFilter.set($event)" /></label>
        <label><span>Zona</span><p-select [options]="zones()" optionLabel="name" optionValue="id" [showClear]="true" placeholder="Todas" [ngModel]="zoneFilter()" (ngModelChange)="zoneFilter.set($event)" /></label>
        <label><span>Estado de preparación</span><p-select [options]="preparationStatuses" optionLabel="label" optionValue="value" [showClear]="true" placeholder="Todos" [ngModel]="preparationStatusFilter()" (ngModelChange)="preparationStatusFilter.set($event)" /></label>
        <p-button label="Aplicar filtros" icon="pi pi-filter" (onClick)="loadPreparations()" />
      </section>

      @if (auth.can('preparations.create')) {
        <section class="section-block">
          <div class="section-heading"><div><span>Pedidos confirmados</span><h3>Pedidos elegibles</h3></div><small>{{ eligibleOrders().length }} disponibles</small></div>
          <div class="table-card">
            <p-table [value]="eligibleOrders()" [loading]="loading()" responsiveLayout="scroll">
              <ng-template #header><tr><th>Pedido</th><th>Cliente</th><th>Entrega</th><th>Zona</th><th>Reserva</th><th>Disponible</th><th>Acción</th></tr></ng-template>
              <ng-template #body let-order><tr>
                <td><div class="stack"><strong>{{ order.code }}</strong><small>{{ order.details.length }} productos</small></div></td>
                <td>{{ order.customerNameSnapshot || order.customer.businessName }}</td>
                <td>{{ formatDate(order.requestedDate) }}</td><td>{{ order.address.zone?.name || 'Sin zona' }}</td>
                <td>{{ orderTotal(order, 'reservedQuantity') }}</td><td>{{ availableTotal(order) }}</td>
                <td><p-button label="Iniciar" icon="pi pi-play" size="small" [loading]="saving()" (onClick)="startPreparation(order)" /></td>
              </tr></ng-template>
              <ng-template #emptymessage><tr><td colspan="7" class="empty-row">No existen pedidos elegibles con los filtros seleccionados.</td></tr></ng-template>
            </p-table>
          </div>
        </section>
      }

      <section class="section-block">
        <div class="section-heading"><div><span>Trazabilidad individual</span><h3>Preparaciones</h3></div><small>{{ preparations().length }} registros</small></div>
        <div class="table-card">
          <p-table [value]="preparations()" [loading]="loading()" responsiveLayout="scroll">
            <ng-template #header><tr><th>Pedido</th><th>Cliente</th><th>Entrega</th><th>Responsable</th><th>Estado</th><th>Detalles</th><th>Acción</th></tr></ng-template>
            <ng-template #body let-item><tr>
              <td><strong>{{ item.order.code }}</strong></td><td>{{ item.order.customerNameSnapshot || item.order.customer.businessName }}</td><td>{{ formatDate(item.order.requestedDate) }}</td>
              <td>{{ item.responsible.name }}</td><td><p-tag [value]="statusLabel(item.status)" [severity]="preparationSeverity(item.status)" /></td><td>{{ item.detailCount || 0 }}</td>
              <td><p-button label="Abrir" icon="pi pi-eye" size="small" [outlined]="true" (onClick)="openPreparation(item)" /></td>
            </tr></ng-template>
            <ng-template #emptymessage><tr><td colspan="7" class="empty-row">No existen preparaciones registradas.</td></tr></ng-template>
          </p-table>
        </div>
      </section>
    }

    @if (view()==='vehicles') {
      <div class="section-heading"><div><span>Recursos de distribución</span><h3>Vehículos</h3></div>@if (auth.can('vehicles.manage')) { <p-button label="Registrar vehículo" icon="pi pi-plus" (onClick)="openVehicle()" /> }</div>
      <div class="table-card"><p-table [value]="vehicles()" [loading]="loading()" responsiveLayout="scroll">
        <ng-template #header><tr><th>Placa</th><th>Descripción</th><th>Capacidad referencial</th><th>Estado</th><th>Acción</th></tr></ng-template>
        <ng-template #body let-item><tr><td><strong>{{ item.plate }}</strong></td><td>{{ item.description }}</td><td>{{ item.referenceCapacity ? number(item.referenceCapacity) : '—' }}</td><td><p-tag [value]="item.status" [severity]="item.status==='ACTIVO'?'success':'secondary'" /></td><td>@if (auth.can('vehicles.manage')) { <p-button label="Editar" icon="pi pi-pencil" size="small" [outlined]="true" (onClick)="openVehicle(item)" /> }</td></tr></ng-template>
        <ng-template #emptymessage><tr><td colspan="5" class="empty-row">No existen vehículos registrados.</td></tr></ng-template>
      </p-table></div>
    }

    @if (view()==='routes' || view()==='summary') {
      <section class="filters route-filters">
        <label><span>Fecha</span><input pInputText type="date" [ngModel]="dateFilter()" (ngModelChange)="dateFilter.set($event)" /></label>
        <label><span>Zona</span><p-select [options]="zones()" optionLabel="name" optionValue="id" [showClear]="true" placeholder="Todas" [ngModel]="zoneFilter()" (ngModelChange)="zoneFilter.set($event)" /></label>
        <label><span>Estado</span><p-select [options]="routeStatuses" optionLabel="label" optionValue="value" [showClear]="true" placeholder="Todos" [ngModel]="routeStatusFilter()" (ngModelChange)="routeStatusFilter.set($event)" /></label>
        <p-button label="Aplicar filtros" icon="pi pi-filter" (onClick)="view()==='summary'?loadSummary():loadRoutes()" />
      </section>

      @if (view()==='routes') {
        <div class="section-heading"><div><span>Planificación operativa</span><h3>Rutas de distribución</h3></div>@if (auth.can('distribution.routes.create')) { <p-button label="Crear ruta" icon="pi pi-plus" (onClick)="openRoute()" /> }</div>
        <div class="table-card"><p-table [value]="routes()" [loading]="loading()" responsiveLayout="scroll">
          <ng-template #header><tr><th>Ruta</th><th>Fecha / zona</th><th>Vehículo</th><th>Responsable</th><th>Entregas</th><th>Estado</th><th>Acción</th></tr></ng-template>
          <ng-template #body let-route><tr><td><strong>{{ route.code }}</strong></td><td><div class="stack"><strong>{{ formatDate(route.date) }}</strong><small>{{ route.zone.name }}</small></div></td><td>{{ route.vehicle.plate }}</td><td>{{ principal(route) }}</td><td>{{ route.deliveryCount || 0 }}</td><td><p-tag [value]="statusLabel(route.status)" [severity]="routeSeverity(route.status)" /></td><td><p-button label="Gestionar" icon="pi pi-arrow-right" size="small" [outlined]="true" (onClick)="openRouteDetail(route)" /></td></tr></ng-template>
          <ng-template #emptymessage><tr><td colspan="7" class="empty-row">No existen rutas registradas.</td></tr></ng-template>
        </p-table></div>
      } @else {
        <div class="metrics">
          <article><span>Rutas consultadas</span><strong>{{ summaryRoutes().length }}</strong></article>
          <article><span>Entregas completas</span><strong>{{ summaryTotal('complete') }}</strong></article>
          <article><span>Entregas parciales</span><strong>{{ summaryTotal('partial') }}</strong></article>
          <article><span>No entregadas</span><strong>{{ summaryTotal('notDelivered') }}</strong></article>
        </div>
        <div class="table-card"><p-table [value]="summaryRoutes()" [loading]="loading()" responsiveLayout="scroll">
          <ng-template #header><tr><th>Ruta</th><th>Fecha / zona</th><th>Estado</th><th>Visitas</th><th>Completas</th><th>Parciales</th><th>No entregadas</th><th>Devuelto</th><th>Aceptado</th></tr></ng-template>
          <ng-template #body let-route><tr><td><strong>{{ route.code }}</strong></td><td>{{ formatDate(route.date) }} · {{ route.zone.name }}</td><td><p-tag [value]="statusLabel(route.status)" [severity]="routeSeverity(route.status)" /></td><td>{{ route.metrics?.total || 0 }}</td><td>{{ route.metrics?.complete || 0 }}</td><td>{{ route.metrics?.partial || 0 }}</td><td>{{ route.metrics?.notDelivered || 0 }}</td><td>{{ number(route.metrics?.returnedQuantity || 0) }}</td><td>{{ number(route.metrics?.acceptedReturnQuantity || 0) }}</td></tr></ng-template>
        </p-table></div>
      }
    }

    @if (view()==='assigned') {
      <div class="section-heading"><div><span>Responsable de reparto</span><h3>Rutas asignadas</h3></div><small>Solo recorridos autorizados</small></div>
      <div class="assigned-grid">
        @for (route of assignedRoutes(); track route.id) {
          <article class="route-card"><header><div><span>{{ route.code }}</span><h3>{{ route.zone.name }}</h3></div><p-tag [value]="statusLabel(route.status)" [severity]="routeSeverity(route.status)" /></header><div class="route-card__facts"><span><i class="pi pi-calendar"></i>{{ formatDate(route.date) }}</span><span><i class="pi pi-truck"></i>{{ route.vehicle.plate }}</span><span><i class="pi pi-map-marker"></i>{{ route.deliveries.length }} paradas</span></div><p-button label="Abrir recorrido" icon="pi pi-directions" styleClass="route-card__button" (onClick)="openAssignedRoute(route)" /></article>
        } @empty { <div class="empty"><i class="pi pi-map"></i><strong>No tienes rutas activas asignadas.</strong></div> }
      </div>
    }

    <p-dialog [visible]="preparationDialog()" (visibleChange)="preparationDialog.set($event)" [modal]="true" [style]="{width:'min(1050px,98vw)'}" [header]="preparationTitle()" [draggable]="false">
      @if (selectedPreparation(); as preparation) {
        <div class="detail-summary"><div><span>Pedido</span><strong>{{ preparation.order.code }}</strong></div><div><span>Cliente</span><strong>{{ preparation.order.customerNameSnapshot || preparation.order.customer.businessName }}</strong></div><div><span>Entrega</span><strong>{{ formatDate(preparation.order.requestedDate) }}</strong></div><div><span>Estado</span><strong>{{ statusLabel(preparation.status) }}</strong></div></div>
        <form [formGroup]="preparationForm" (ngSubmit)="savePreparationProgress()">
          <div class="detail-table" formArrayName="details"><table><thead><tr><th>Producto</th><th>Solicitado</th><th>Reservado</th><th>Disponible al iniciar</th><th>Preparado</th><th>Diferencia</th><th>Verificado</th><th>Observación</th></tr></thead><tbody>
            @for (control of preparationDetails.controls; track $index; let index=$index) { <tr [formGroupName]="index"><td><strong>{{ preparation.details[index].orderDetail.productDescriptionSnapshot }}</strong><small>{{ preparation.details[index].orderDetail.presentationDescriptionSnapshot }}</small></td><td>{{ number(preparation.details[index].requestedQuantity) }}</td><td>{{ number(preparation.details[index].reservedQuantity) }}</td><td>{{ number(preparation.details[index].availableSnapshot) }}</td><td><p-inputnumber formControlName="preparedQuantity" [min]="0" [max]="numberValue(preparation.details[index].requestedQuantity)" [maxFractionDigits]="3" /></td><td [class.negative]="detailDifference(index)<0">{{ number(detailDifference(index)) }}</td><td><p-checkbox formControlName="verified" [binary]="true" /></td><td><input pInputText formControlName="observation" placeholder="Obligatoria si hay diferencia" /></td></tr> }
          </tbody></table></div>
          <div class="dialog-footer">
            <p-button type="button" label="Cerrar" [text]="true" severity="secondary" (onClick)="preparationDialog.set(false)" />
            @if (auth.can('preparations.progress') && canEditPreparation(preparation.status)) { <p-button type="submit" label="Guardar avance" icon="pi pi-save" [outlined]="true" [loading]="saving()" /> }
            @if (auth.can('preparations.confirm') && canConfirmPreparation(preparation.status)) { <p-button type="button" label="Confirmar preparación" icon="pi pi-check" severity="success" [loading]="saving()" (onClick)="confirmPreparation()" /> }
          </div>
        </form>
        <div class="timeline compact">@for (event of preparation.history; track event.id) { <div><span class="dot"></span><article><header><strong>{{ event.event }}</strong><small>{{ formatDateTime(event.occurredAt) }}</small></header><p>{{ event.observation || 'Sin observación' }}</p><footer>{{ event.user.name }} · {{ event.previousStatus || 'INICIO' }} → {{ event.newStatus }}</footer></article></div> }</div>
      }
    </p-dialog>

    <p-dialog [visible]="vehicleDialog()" (visibleChange)="vehicleDialog.set($event)" [modal]="true" [style]="{width:'min(520px,96vw)'}" [header]="editingVehicleId()?'Editar vehículo':'Registrar vehículo'" [draggable]="false">
      <form [formGroup]="vehicleForm" (ngSubmit)="saveVehicle()"><div class="form-grid"><label><span>Placa *</span><input pInputText formControlName="plate" /></label><label><span>Capacidad referencial</span><p-inputnumber formControlName="referenceCapacity" [min]="0.001" [maxFractionDigits]="3" /></label><label class="wide"><span>Descripción *</span><input pInputText formControlName="description" /></label>@if (editingVehicleId()) { <label><span>Estado</span><p-select formControlName="status" [options]="recordStatuses" optionLabel="label" optionValue="value" /></label> }</div><div class="dialog-footer"><p-button type="button" label="Cancelar" [text]="true" severity="secondary" (onClick)="vehicleDialog.set(false)" /><p-button type="submit" label="Guardar vehículo" icon="pi pi-save" [loading]="saving()" /></div></form>
    </p-dialog>

    <p-dialog [visible]="routeDialog()" (visibleChange)="routeDialog.set($event)" [modal]="true" [style]="{width:'min(650px,96vw)'}" header="Crear ruta de distribución" [draggable]="false">
      <form [formGroup]="routeForm" (ngSubmit)="createRoute()"><div class="form-grid"><label><span>Fecha *</span><input pInputText type="date" formControlName="date" /></label><label><span>Zona *</span><p-select formControlName="zoneId" [options]="zones()" optionLabel="name" optionValue="id" placeholder="Seleccione" /></label><label><span>Vehículo activo *</span><p-select formControlName="vehicleId" [options]="activeVehicles()" optionLabel="plate" optionValue="id" placeholder="Seleccione" /></label><label><span>Responsable principal *</span><p-select formControlName="principalResponsibleId" [options]="responsibles()" optionLabel="name" optionValue="id" placeholder="Seleccione" /></label><label class="wide"><span>Responsables asignados *</span><p-multiselect formControlName="responsibleIds" [options]="responsibles()" optionLabel="name" optionValue="id" placeholder="Seleccione uno o más" display="chip" /></label><label class="wide"><span>Observación</span><textarea pTextarea formControlName="observation" rows="3"></textarea></label></div><div class="dialog-footer"><p-button type="button" label="Cancelar" [text]="true" severity="secondary" (onClick)="routeDialog.set(false)" /><p-button type="submit" label="Crear ruta" icon="pi pi-plus" [loading]="saving()" /></div></form>
    </p-dialog>

    <p-dialog [visible]="routeDetailDialog()" (visibleChange)="closeRouteDetail($event)" [modal]="true" [style]="{width:'min(1180px,99vw)'}" [header]="routeTitle()" [draggable]="false">
      @if (selectedRoute(); as route) {
        <div class="detail-summary route-summary"><div><span>Fecha</span><strong>{{ formatDate(route.date) }}</strong></div><div><span>Zona</span><strong>{{ route.zone.name }}</strong></div><div><span>Vehículo</span><strong>{{ route.vehicle.plate }}</strong></div><div><span>Estado</span><strong>{{ statusLabel(route.status) }}</strong></div><div><span>Principal</span><strong>{{ principal(route) }}</strong></div></div>
        <div class="route-layout">
          <section><div class="map-heading"><div><span>Cartografía</span><strong>Puntos de entrega</strong></div><small>OpenStreetMap · Vista satélite disponible</small></div><div id="distribution-route-map" class="route-map" aria-label="Mapa de puntos de entrega"></div></section>
          <section class="sequence-panel"><div class="section-heading small"><div><span>Orden manual</span><h3>Secuencia de visitas</h3></div></div>
            @if (route.status==='BORRADOR' && auth.can('distribution.routes.create')) { <div class="add-deliveries"><p-multiselect [options]="preparedOptions()" optionLabel="label" optionValue="id" placeholder="Agregar pedidos preparados" [ngModel]="selectedPreparationIds()" (ngModelChange)="selectedPreparationIds.set($event)" /><p-button icon="pi pi-plus" label="Agregar" [disabled]="!selectedPreparationIds().length" (onClick)="addDeliveries()" /></div> }
            <ol class="delivery-list">@for (delivery of route.deliveries; track delivery.id; let index=$index) { <li><span class="position">{{ index+1 }}</span><div><strong>{{ delivery.order.code }} · {{ delivery.order.customerNameSnapshot || delivery.order.customer.businessName }}</strong><small>{{ delivery.address.address }}</small>@if (!hasCoordinates(delivery)) { <em>Faltan coordenadas válidas</em> }</div>@if (route.status==='BORRADOR' && auth.can('distribution.routes.plan')) { <div class="order-actions"><button type="button" title="Subir" [disabled]="index===0" (click)="moveDelivery(index,-1)"><i class="pi pi-angle-up"></i></button><button type="button" title="Bajar" [disabled]="index===route.deliveries.length-1" (click)="moveDelivery(index,1)"><i class="pi pi-angle-down"></i></button></div> }@if (delivery.result) { <p-tag [value]="statusLabel(delivery.result.result)" [severity]="visitSeverity(delivery.result.result)" /> }</li> } @empty { <li class="empty-row">Agregue preparaciones confirmadas para construir la ruta.</li> }</ol>
            @if (route.status==='BORRADOR' && auth.can('distribution.routes.plan') && route.deliveries.length) { <p-button label="Guardar secuencia" icon="pi pi-sort-alt" [outlined]="true" (onClick)="saveSequence()" /> }
          </section>
        </div>
        <div class="route-actions">
          @if (route.status==='BORRADOR' && auth.can('distribution.routes.plan')) { <p-button label="Planificar ruta" icon="pi pi-check-circle" (onClick)="routeAction('plan')" /> }
          @if (route.status==='PLANIFICADA' && auth.can('distribution.routes.departure')) { <p-button label="Registrar salida" icon="pi pi-send" severity="success" (onClick)="routeAction('departure')" /> }
          @if (route.status==='EN_REPARTO' && auth.can('distribution.routes.finish')) { <p-button label="Finalizar recorrido" icon="pi pi-flag" (onClick)="routeAction('finish')" /> }
          @if (route.status==='FINALIZADA' && auth.can('distribution.routes.settle')) { <p-button label="Liquidar ruta" icon="pi pi-verified" severity="success" (onClick)="openSettlement()" /> }
        </div>
        <div class="timeline compact">@for (event of route.history; track event.id) { <div><span class="dot"></span><article><header><strong>{{ event.event }}</strong><small>{{ formatDateTime(event.occurredAt) }}</small></header><p>{{ event.observation || 'Sin observación' }}</p><footer>{{ event.user.name }} · {{ event.previousStatus || 'INICIO' }} → {{ event.newStatus }}</footer></article></div> }</div>
      }
    </p-dialog>

    <p-dialog [visible]="assignedDialog()" (visibleChange)="closeAssignedDialog($event)" [modal]="true" [style]="{width:'min(1050px,98vw)'}" [header]="routeTitle()" [draggable]="false">
      @if (selectedRoute(); as route) { <div class="assigned-route"><div id="assigned-route-map" class="route-map assigned-map"></div><div class="delivery-cards">@for (delivery of route.deliveries; track delivery.id) { <article [class.done]="delivery.status==='VISITADA'"><span class="stop-number">{{ delivery.position }}</span><div><strong>{{ delivery.order.customerNameSnapshot || delivery.order.customer.businessName }}</strong><p>{{ delivery.address.address }}</p><small>{{ delivery.address.reference || 'Sin referencia' }}</small></div>@if (delivery.result) { <p-tag [value]="statusLabel(delivery.result.result)" [severity]="visitSeverity(delivery.result.result)" /> } @else if (route.status==='EN_REPARTO' && auth.can('distribution.visits.create')) { <p-button label="Registrar visita" icon="pi pi-map-marker" size="small" (onClick)="openVisit(delivery)" /> }</article> }</div></div> }
    </p-dialog>

    <p-dialog [visible]="visitDialog()" (visibleChange)="visitDialog.set($event)" [modal]="true" [style]="{width:'min(760px,96vw)'}" header="Registrar resultado de visita" [draggable]="false">
      <form [formGroup]="visitForm" (ngSubmit)="registerVisit()"><div class="form-grid"><label><span>Resultado *</span><p-select formControlName="result" [options]="visitResults" optionLabel="label" optionValue="value" (onChange)="applyVisitPreset()" /></label><label class="wide"><span>Observación</span><textarea pTextarea formControlName="observation" rows="3" placeholder="Obligatoria para entrega parcial o no entregada"></textarea></label></div><div class="detail-table visit-table" formArrayName="details"><table><thead><tr><th>Producto</th><th>Preparado</th><th>Entregado</th><th>Devuelto</th></tr></thead><tbody>@for (control of visitDetails.controls; track $index; let index=$index) { <tr [formGroupName]="index"><td>{{ selectedDelivery()?.preparation?.details?.[index]?.orderDetail?.productDescriptionSnapshot }}</td><td>{{ number(selectedDelivery()?.preparation?.details?.[index]?.preparedQuantity || 0) }}</td><td><p-inputnumber formControlName="deliveredQuantity" [min]="0" [maxFractionDigits]="3" /></td><td><p-inputnumber formControlName="returnedQuantity" [min]="0" [maxFractionDigits]="3" /></td></tr> }</tbody></table></div><div class="dialog-footer"><p-button type="button" label="Cancelar" [text]="true" severity="secondary" (onClick)="visitDialog.set(false)" /><p-button type="submit" label="Guardar resultado" icon="pi pi-check" [loading]="saving()" /></div></form>
    </p-dialog>

    <p-dialog [visible]="settlementDialog()" (visibleChange)="settlementDialog.set($event)" [modal]="true" [style]="{width:'min(720px,96vw)'}" header="Liquidación operativa" [draggable]="false">
      <p class="intro">Registre únicamente devoluciones aceptadas por Almacén. Esta liquidación no incluye cobros, pagos ni saldos.</p><form [formGroup]="settlementForm" (ngSubmit)="settleRoute()"><div class="detail-table settlement-table" formArrayName="returns"><table><thead><tr><th>Pedido / producto</th><th>Devuelto</th><th>Aceptado</th></tr></thead><tbody>@for (control of settlementReturns.controls; track $index; let index=$index) { <tr [formGroupName]="index"><td>{{ settlementLabels()[index] }}</td><td>{{ number(settlementMaximums()[index]) }}</td><td><p-inputnumber formControlName="quantity" [min]="0" [max]="settlementMaximums()[index]" [maxFractionDigits]="3" /></td></tr> } @empty { <tr><td colspan="3" class="empty-row">No existen cantidades devueltas.</td></tr> }</tbody></table></div><label class="single-field"><span>Observación</span><textarea pTextarea formControlName="observation" rows="3"></textarea></label><div class="dialog-footer"><p-button type="button" label="Cancelar" [text]="true" severity="secondary" (onClick)="settlementDialog.set(false)" /><p-button type="submit" label="Liquidar operativamente" icon="pi pi-verified" severity="success" [loading]="saving()" /></div></form>
    </p-dialog>
  `,
  styles: [`
    .page-toolbar{display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;margin-bottom:1rem}.page-toolbar h2{margin:.35rem 0;font-size:clamp(1.8rem,3vw,2.7rem);letter-spacing:-.05em}.page-toolbar p,.intro{margin:0;color:var(--text-muted);font-size:.75rem;line-height:1.55}.eyebrow{color:var(--accent);font-size:.68rem;font-weight:850;letter-spacing:.14em;text-transform:uppercase}.view-tabs{display:flex;flex-wrap:wrap;gap:.35rem;margin-bottom:1rem;padding:.3rem;border:1px solid var(--surface-border);border-radius:.8rem;background:#fff;width:max-content;max-width:100%}.view-tabs button{display:flex;align-items:center;gap:.45rem;padding:.55rem .85rem;border:0;border-radius:.6rem;background:transparent;color:#566b7e;font-size:.7rem;font-weight:750;cursor:pointer}.view-tabs button.active{background:var(--brand-900);color:#fff}.filters{display:grid;grid-template-columns:repeat(3,minmax(10rem,1fr)) auto;align-items:end;gap:.65rem;margin-bottom:1rem}.filters label,.form-grid label,.single-field{display:grid;gap:.35rem}.filters span,.form-grid span,.single-field span{color:#344b61;font-size:.65rem;font-weight:750}.filters input,.single-field textarea{width:100%}.section-block{margin-top:1.4rem}.section-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;margin-bottom:.75rem}.section-heading span,.map-heading span{color:var(--brand-700);font-size:.62rem;font-weight:850;letter-spacing:.09em;text-transform:uppercase}.section-heading h3{margin:.2rem 0 0;font-size:1.05rem}.section-heading small,.map-heading small{color:var(--text-muted);font-size:.62rem}.table-card{overflow:hidden;border:1px solid var(--surface-border);border-radius:1rem;background:#fff}.stack strong,.stack small,.detail-table td small{display:block}.stack small,.detail-table td small{margin-top:.2rem;color:var(--text-muted);font-size:.62rem}.empty-row{text-align:center!important;color:var(--text-muted)}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-top:.5rem}.form-grid .wide{grid-column:1/-1}.dialog-footer,.route-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:.5rem;margin-top:1.25rem;padding-top:1rem;border-top:1px solid var(--surface-border)}.detail-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:.65rem;margin-bottom:1rem}.detail-summary>div{padding:.8rem;border-radius:.7rem;background:#f4f8fb}.detail-summary span,.detail-summary strong{display:block}.detail-summary span{color:var(--text-muted);font-size:.6rem}.detail-summary strong{margin-top:.25rem;font-size:.72rem}.route-summary{grid-template-columns:repeat(5,1fr)}.detail-table{overflow:auto;border:1px solid var(--surface-border);border-radius:.8rem}.detail-table table{width:100%;min-width:62rem;border-collapse:collapse}.detail-table th,.detail-table td{padding:.65rem .7rem;border-bottom:1px solid var(--surface-border);font-size:.68rem;text-align:left;vertical-align:middle}.detail-table th{color:#5f7285;background:#f7fafc;font-size:.58rem;text-transform:uppercase}.detail-table .p-inputnumber,.detail-table input{min-width:7rem}.negative{color:#b4232b;font-weight:800}.timeline{display:grid;margin-top:1.25rem}.timeline>div{position:relative;display:grid;grid-template-columns:1.2rem 1fr;gap:.7rem;padding-bottom:.8rem}.timeline>div:before{content:'';position:absolute;left:.36rem;top:.8rem;bottom:-.2rem;width:1px;background:#b7d3e3}.timeline>div:last-child:before{display:none}.dot{position:relative;z-index:1;width:.75rem;height:.75rem;margin-top:.25rem;border:3px solid #dceef8;border-radius:50%;background:var(--brand-700)}.timeline article{padding:.7rem;border:1px solid var(--surface-border);border-radius:.7rem}.timeline header{display:flex;justify-content:space-between;gap:1rem}.timeline header small,.timeline footer{color:var(--text-muted);font-size:.6rem}.timeline p{margin:.35rem 0;font-size:.68rem}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:.8rem;margin-bottom:1rem}.metrics article{padding:1rem;border:1px solid var(--surface-border);border-radius:.85rem;background:#fff}.metrics span,.metrics strong{display:block}.metrics span{color:var(--text-muted);font-size:.62rem}.metrics strong{margin-top:.35rem;font-size:1.35rem}.assigned-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(16rem,1fr));gap:1rem}.route-card{padding:1rem;border:1px solid var(--surface-border);border-radius:1rem;background:#fff;box-shadow:0 10px 30px rgb(0 45 90 / 6%)}.route-card header{display:flex;justify-content:space-between;gap:1rem}.route-card header span{color:var(--brand-700);font-size:.62rem;font-weight:800}.route-card h3{margin:.25rem 0}.route-card__facts{display:grid;gap:.5rem;margin:1rem 0;color:var(--text-muted);font-size:.7rem}.route-card__facts span{display:flex;align-items:center;gap:.45rem}.route-card__button{width:100%}.empty{min-height:12rem;display:grid;place-items:center;align-content:center;gap:.5rem;color:var(--text-muted)}.empty i{font-size:2rem}.route-layout{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(20rem,.85fr);gap:1rem}.route-layout>section{min-width:0}.map-heading{display:flex;justify-content:space-between;gap:1rem;margin-bottom:.5rem}.map-heading strong{display:block;margin-top:.15rem;font-size:.78rem}.route-map{height:31rem;border:1px solid var(--surface-border);border-radius:.85rem;background:#e8f0f5;overflow:hidden}.assigned-map{height:18rem}.sequence-panel{padding:.8rem;border:1px solid var(--surface-border);border-radius:.85rem}.section-heading.small{margin-bottom:.55rem}.add-deliveries{display:grid;grid-template-columns:1fr auto;gap:.5rem;margin-bottom:.7rem}.delivery-list{display:grid;gap:.45rem;max-height:24rem;margin:0 0 .7rem;padding:0;overflow:auto;list-style:none}.delivery-list li{display:flex;align-items:center;gap:.6rem;padding:.65rem;border:1px solid var(--surface-border);border-radius:.65rem;background:#fff}.delivery-list li>div:nth-child(2){min-width:0;flex:1}.delivery-list strong,.delivery-list small,.delivery-list em{display:block}.delivery-list strong{font-size:.68rem}.delivery-list small{margin-top:.2rem;color:var(--text-muted);font-size:.6rem}.delivery-list em{margin-top:.2rem;color:#b4232b;font-size:.58rem}.position,.stop-number{display:grid;place-items:center;flex:0 0 1.6rem;height:1.6rem;border-radius:50%;background:var(--brand-900);color:#fff;font-size:.64rem;font-weight:850}.order-actions{display:flex;gap:.2rem}.order-actions button{display:grid;place-items:center;width:1.6rem;height:1.6rem;border:1px solid var(--surface-border);border-radius:.4rem;background:#f5f8fa;color:var(--brand-900);cursor:pointer}.order-actions button:disabled{opacity:.35}.assigned-route{display:grid;gap:1rem}.delivery-cards{display:grid;gap:.6rem}.delivery-cards article{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:.8rem;padding:.8rem;border:1px solid var(--surface-border);border-radius:.75rem}.delivery-cards article.done{background:#f2faf6}.delivery-cards strong,.delivery-cards small{display:block}.delivery-cards p{margin:.25rem 0;color:#40576e;font-size:.72rem}.delivery-cards small{color:var(--text-muted);font-size:.62rem}.visit-table,.settlement-table{margin-top:1rem}.visit-table table,.settlement-table table{min-width:36rem}.single-field{margin-top:1rem}@media(max-width:900px){.route-layout{grid-template-columns:1fr}.route-map{height:22rem}.route-summary{grid-template-columns:repeat(2,1fr)}}@media(max-width:760px){.page-toolbar{align-items:flex-start;flex-direction:column}.filters,.metrics,.form-grid,.detail-summary{grid-template-columns:1fr}.form-grid .wide{grid-column:auto}.view-tabs{width:100%}.view-tabs button{flex:1;justify-content:center}.delivery-cards article{grid-template-columns:auto 1fr}.delivery-cards article>:last-child{grid-column:1/-1}.route-map{height:19rem}}
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DistributionComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly messages = inject(MessageService);
  protected readonly auth = inject(AuthService);
  private map: L.Map | null = null;

  protected readonly view = signal<DistributionView>('preparations');
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly dateFilter = signal('');
  protected readonly zoneFilter = signal<string | null>(null);
  protected readonly preparationStatusFilter = signal<PreparationStatus | null>(null);
  protected readonly routeStatusFilter = signal<DistributionRouteStatus | null>(null);
  protected readonly eligibleOrders = signal<EligibleOrder[]>([]);
  protected readonly preparations = signal<OrderPreparation[]>([]);
  protected readonly vehicles = signal<Vehicle[]>([]);
  protected readonly zones = signal<Zone[]>([]);
  protected readonly responsibles = signal<User[]>([]);
  protected readonly routes = signal<DistributionRoute[]>([]);
  protected readonly assignedRoutes = signal<DistributionRoute[]>([]);
  protected readonly summaryRoutes = signal<DistributionRoute[]>([]);
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
  protected readonly editingVehicleId = signal<string | null>(null);
  protected readonly settlementLabels = signal<string[]>([]);
  protected readonly settlementMaximums = signal<number[]>([]);

  protected readonly preparationStatuses = [
    { label: 'Pendiente', value: 'PENDIENTE' }, { label: 'En preparación', value: 'EN_PREPARACION' },
    { label: 'Observada', value: 'OBSERVADA' }, { label: 'Preparada', value: 'PREPARADA' },
    { label: 'Asignada', value: 'ASIGNADA' }, { label: 'Despachada', value: 'DESPACHADA' },
  ];
  protected readonly routeStatuses = [
    { label: 'Borrador', value: 'BORRADOR' }, { label: 'Planificada', value: 'PLANIFICADA' },
    { label: 'En reparto', value: 'EN_REPARTO' }, { label: 'Finalizada', value: 'FINALIZADA' },
    { label: 'Liquidada', value: 'LIQUIDADA' },
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
    referenceCapacity: [null as number | null, Validators.min(0.001)],
    status: ['ACTIVO'],
  });
  protected readonly routeForm = this.fb.nonNullable.group({
    date: ['', Validators.required], zoneId: ['', Validators.required], vehicleId: ['', Validators.required],
    responsibleIds: [[] as string[], Validators.required], principalResponsibleId: ['', Validators.required], observation: [''],
  });
  protected readonly visitForm = this.fb.nonNullable.group({ result: ['ENTREGADA' as VisitResultType, Validators.required], observation: [''], details: this.fb.array([]) });
  protected readonly settlementForm = this.fb.nonNullable.group({ observation: [''], returns: this.fb.array([]) });

  protected get preparationDetails(): FormArray { return this.preparationForm.controls.details; }
  protected get visitDetails(): FormArray { return this.visitForm.controls.details; }
  protected get settlementReturns(): FormArray { return this.settlementForm.controls.returns; }

  ngOnInit(): void {
    this.selectInitialView();
    this.loadReferences();
    this.reload();
  }

  ngOnDestroy(): void { this.destroyMap(); }

  private selectInitialView(): void {
    if (this.auth.can('preparations.read')) return;
    if (this.auth.can('distribution.routes.assigned.read')) this.view.set('assigned');
    else if (this.auth.can('distribution.routes.read')) this.view.set('routes');
    else this.view.set('summary');
  }

  protected setView(view: DistributionView): void { this.view.set(view); this.reload(); }
  protected reload(): void {
    if (this.view() === 'preparations') this.loadPreparations();
    if (this.view() === 'vehicles') this.loadVehicles();
    if (this.view() === 'routes') this.loadRoutes();
    if (this.view() === 'assigned') this.loadAssigned();
    if (this.view() === 'summary') this.loadSummary();
  }

  private loadReferences(): void {
    if (this.auth.can('zones.read')) this.http.get<Zone[]>('/api/zones').subscribe({ next: (items) => this.zones.set(items.filter((item) => item.status === 'ACTIVO')) });
    if (this.auth.can('vehicles.read')) this.loadVehicles();
    if (this.auth.can('distribution.routes.create')) this.http.get<User[]>('/api/distribution-routes/responsible-options').subscribe({ next: (items) => this.responsibles.set(items) });
  }

  private filterParams(): HttpParams {
    let params = new HttpParams().set('limit', 100);
    if (this.dateFilter()) params = params.set('deliveryDate', this.dateFilter());
    if (this.zoneFilter()) params = params.set('zoneId', this.zoneFilter()!);
    return params;
  }

  protected loadPreparations(): void {
    this.loading.set(true);
    const params = this.filterParams();
    const requests = [this.http.get<Paginated<OrderPreparation>>('/api/preparations', { params: this.preparationStatusFilter() ? params.set('status', this.preparationStatusFilter()!) : params })];
    if (this.auth.can('preparations.create')) {
      this.http.get<Paginated<EligibleOrder>>('/api/preparations/eligible', { params }).subscribe({ next: (response) => this.eligibleOrders.set(response.data), error: (error) => this.fail(error) });
    }
    requests[0].subscribe({ next: (response) => { this.preparations.set(response.data); this.loading.set(false); }, error: (error) => this.fail(error) });
  }

  protected startPreparation(order: EligibleOrder): void {
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
    for (const detail of preparation.details) this.preparationDetails.push(this.fb.nonNullable.group({
      id: [detail.id], preparedQuantity: [Number(detail.preparedQuantity), [Validators.required, Validators.min(0), Validators.max(Number(detail.requestedQuantity))]],
      verified: [Boolean(detail.verifiedAt)], observation: [detail.observation ?? ''],
    }));
  }

  protected savePreparationProgress(): void {
    const preparation = this.selectedPreparation();
    if (!preparation || this.preparationForm.invalid) return this.preparationForm.markAllAsTouched();
    this.saving.set(true);
    const details = this.preparationDetails.getRawValue().map((detail) => ({ preparationDetailId: detail.id, preparedQuantity: detail.preparedQuantity, verified: detail.verified, observation: detail.observation || undefined }));
    this.http.post<OrderPreparation>(`/api/preparations/${preparation.id}/progress`, { details }).subscribe({ next: (value) => { this.saving.set(false); this.selectedPreparation.set(value); this.buildPreparationForm(value); this.saved('Avance guardado', preparation.order.code); this.loadPreparations(); }, error: (error) => this.failSave(error) });
  }

  protected confirmPreparation(): void {
    const preparation = this.selectedPreparation();
    if (!preparation) return;
    if (this.preparationForm.invalid) return this.preparationForm.markAllAsTouched();
    const details = this.preparationDetails.getRawValue();
    if (details.some((detail) => !detail.verified || (detail.preparedQuantity !== Number(preparation.details.find((item) => item.id === detail.id)?.requestedQuantity) && !detail.observation.trim()))) {
      return this.messages.add({ severity: 'warn', summary: 'Verificación pendiente', detail: 'Verifique todos los detalles y justifique cada diferencia.' });
    }
    this.saving.set(true);
    const savePayload = { details: details.map((detail) => ({ preparationDetailId: detail.id, preparedQuantity: detail.preparedQuantity, verified: detail.verified, observation: detail.observation || undefined })) };
    this.http.post<OrderPreparation>(`/api/preparations/${preparation.id}/progress`, savePayload).subscribe({
      next: () => this.http.post<OrderPreparation>(`/api/preparations/${preparation.id}/confirm`, {}).subscribe({ next: (value) => { this.saving.set(false); this.selectedPreparation.set(value); this.buildPreparationForm(value); this.saved('Preparación confirmada', preparation.order.code); this.loadPreparations(); }, error: (error) => this.failSave(error) }),
      error: (error) => this.failSave(error),
    });
  }

  protected loadVehicles(): void {
    this.loading.set(true);
    this.http.get<Paginated<Vehicle>>('/api/vehicles', { params: new HttpParams().set('limit', 100) }).subscribe({ next: (response) => { this.vehicles.set(response.data); this.loading.set(false); }, error: (error) => this.fail(error) });
  }
  protected activeVehicles(): Vehicle[] { return this.vehicles().filter((item) => item.status === 'ACTIVO'); }
  protected openVehicle(item?: Vehicle): void {
    this.editingVehicleId.set(item?.id ?? null);
    this.vehicleForm.reset({ plate: item?.plate ?? '', description: item?.description ?? '', referenceCapacity: item?.referenceCapacity ? Number(item.referenceCapacity) : null, status: item?.status ?? 'ACTIVO' });
    this.vehicleDialog.set(true);
  }
  protected saveVehicle(): void {
    if (this.vehicleForm.invalid) return this.vehicleForm.markAllAsTouched();
    const value = this.vehicleForm.getRawValue();
    const payload = { plate: value.plate, description: value.description, referenceCapacity: value.referenceCapacity ?? undefined, status: value.status };
    const id = this.editingVehicleId();
    this.saving.set(true);
    const request = id ? this.http.patch<Vehicle>(`/api/vehicles/${id}`, payload) : this.http.post<Vehicle>('/api/vehicles', payload);
    request.subscribe({ next: () => { this.saving.set(false); this.vehicleDialog.set(false); this.saved(id ? 'Vehículo actualizado' : 'Vehículo registrado', value.plate || ''); this.loadVehicles(); }, error: (error) => this.failSave(error) });
  }

  private routeParams(): HttpParams {
    let params = new HttpParams().set('limit', 100);
    if (this.dateFilter()) params = params.set('date', this.dateFilter());
    if (this.zoneFilter()) params = params.set('zoneId', this.zoneFilter()!);
    if (this.routeStatusFilter()) params = params.set('status', this.routeStatusFilter()!);
    return params;
  }
  protected loadRoutes(): void { this.loading.set(true); this.http.get<Paginated<DistributionRoute>>('/api/distribution-routes', { params: this.routeParams() }).subscribe({ next: (response) => { this.routes.set(response.data); this.loading.set(false); }, error: (error) => this.fail(error) }); }
  protected loadSummary(): void { this.loading.set(true); this.http.get<Paginated<DistributionRoute>>('/api/distribution-routes/summary', { params: this.routeParams() }).subscribe({ next: (response) => { this.summaryRoutes.set(response.data); this.loading.set(false); }, error: (error) => this.fail(error) }); }
  protected loadAssigned(): void { this.loading.set(true); this.http.get<DistributionRoute[]>('/api/distribution-routes/my-route').subscribe({ next: (items) => { this.assignedRoutes.set(items); this.loading.set(false); }, error: (error) => this.fail(error) }); }

  protected openRoute(): void { this.routeForm.reset({ date: this.dateFilter(), zoneId: this.zoneFilter() ?? '', vehicleId: '', responsibleIds: [], principalResponsibleId: '', observation: '' }); this.routeDialog.set(true); }
  protected createRoute(): void {
    if (this.routeForm.invalid) return this.routeForm.markAllAsTouched();
    const raw = this.routeForm.getRawValue();
    if (!raw.responsibleIds.includes(raw.principalResponsibleId)) return this.messages.add({ severity: 'warn', summary: 'Asignación incompleta', detail: 'El responsable principal debe estar incluido en los responsables asignados.' });
    this.saving.set(true);
    this.http.post<DistributionRoute>('/api/distribution-routes', { ...raw, observation: raw.observation || undefined }).subscribe({ next: (route) => { this.saving.set(false); this.routeDialog.set(false); this.saved('Ruta creada', route.code); this.loadRoutes(); this.openRouteDetail(route); }, error: (error) => this.failSave(error) });
  }
  protected openRouteDetail(route: DistributionRoute): void { this.http.get<DistributionRoute>(`/api/distribution-routes/${route.id}`).subscribe({ next: (value) => { this.selectedRoute.set(value); this.routeDetailDialog.set(true); this.loadPreparedOptions(value); setTimeout(() => this.renderMap('distribution-route-map', value), 80); }, error: (error) => this.fail(error) }); }
  protected closeRouteDetail(visible: boolean): void { this.routeDetailDialog.set(visible); if (!visible) this.destroyMap(); }
  private loadPreparedOptions(route: DistributionRoute): void {
    const params = new HttpParams().set('limit', 100).set('status', 'PREPARADA').set('deliveryDate', route.date).set('zoneId', route.zoneId);
    this.http.get<Paginated<OrderPreparation>>('/api/preparations', { params }).subscribe({ next: (response) => this.preparedOptions.set(response.data.map((item) => ({ id: item.id, label: `${item.order.code} · ${item.order.customerNameSnapshot || item.order.customer.businessName}` }))) });
  }
  protected addDeliveries(): void { const route = this.selectedRoute(); if (!route || !this.selectedPreparationIds().length) return; this.saving.set(true); this.http.post<DistributionRoute>(`/api/distribution-routes/${route.id}/deliveries`, { preparationIds: this.selectedPreparationIds() }).subscribe({ next: (value) => { this.saving.set(false); this.selectedPreparationIds.set([]); this.updateSelectedRoute(value); this.loadPreparedOptions(value); this.saved('Pedidos agregados', value.code); }, error: (error) => this.failSave(error) }); }
  protected moveDelivery(index: number, offset: number): void { const route = this.selectedRoute(); if (!route) return; const target = index + offset; if (target < 0 || target >= route.deliveries.length) return; const deliveries = [...route.deliveries]; [deliveries[index], deliveries[target]] = [deliveries[target], deliveries[index]]; deliveries.forEach((delivery, position) => delivery.position = position + 1); this.selectedRoute.set({ ...route, deliveries }); this.renderMapSoon('distribution-route-map'); }
  protected saveSequence(): void { const route = this.selectedRoute(); if (!route) return; this.saving.set(true); this.http.put<DistributionRoute>(`/api/distribution-routes/${route.id}/sequence`, { deliveries: route.deliveries.map((delivery, index) => ({ routeDeliveryId: delivery.id, position: index + 1 })) }).subscribe({ next: (value) => { this.saving.set(false); this.updateSelectedRoute(value); this.saved('Secuencia guardada', value.code); }, error: (error) => this.failSave(error) }); }
  protected routeAction(action: 'plan'|'departure'|'finish'): void { const route = this.selectedRoute(); if (!route) return; this.saving.set(true); this.http.post<DistributionRoute>(`/api/distribution-routes/${route.id}/${action}`, {}).subscribe({ next: (value) => { this.saving.set(false); this.updateSelectedRoute(value); this.saved(action==='plan'?'Ruta planificada':action==='departure'?'Salida registrada':'Recorrido finalizado', value.code); this.loadRoutes(); }, error: (error) => this.failSave(error) }); }
  private updateSelectedRoute(route: DistributionRoute): void { this.selectedRoute.set(route); this.renderMapSoon('distribution-route-map'); }

  protected openAssignedRoute(route: DistributionRoute): void { this.selectedRoute.set(route); this.assignedDialog.set(true); setTimeout(() => this.renderMap('assigned-route-map', route), 80); }
  protected closeAssignedDialog(visible: boolean): void { this.assignedDialog.set(visible); if (!visible) this.destroyMap(); }
  protected openVisit(delivery: RouteDelivery): void { this.selectedDelivery.set(delivery); this.visitForm.reset({ result: 'ENTREGADA', observation: '' }); this.visitDetails.clear(); for (const detail of delivery.preparation.details) this.visitDetails.push(this.fb.nonNullable.group({ id: [detail.id], deliveredQuantity: [Number(detail.preparedQuantity), [Validators.required, Validators.min(0)]], returnedQuantity: [0, [Validators.required, Validators.min(0)]] })); this.visitDialog.set(true); }
  protected applyVisitPreset(): void { const delivery = this.selectedDelivery(); if (!delivery) return; const result = this.visitForm.controls.result.value; this.visitDetails.controls.forEach((control, index) => { const prepared = Number(delivery.preparation.details[index].preparedQuantity); if (result === 'ENTREGADA') control.patchValue({ deliveredQuantity: prepared, returnedQuantity: 0 }); if (result === 'NO_ENTREGADA') control.patchValue({ deliveredQuantity: 0, returnedQuantity: prepared }); }); }
  protected registerVisit(): void { const delivery = this.selectedDelivery(); if (!delivery || this.visitForm.invalid) return this.visitForm.markAllAsTouched(); const raw = this.visitForm.getRawValue(); if (raw.result !== 'ENTREGADA' && !raw.observation.trim()) return this.messages.add({ severity: 'warn', summary: 'Observación requerida', detail: 'Explique la entrega parcial o no realizada.' }); this.saving.set(true); this.http.post<DistributionRoute>(`/api/route-deliveries/${delivery.id}/result`, { result: raw.result, observation: raw.observation || undefined, details: this.visitDetails.getRawValue().map((item) => ({ preparationDetailId: item.id, deliveredQuantity: item.deliveredQuantity, returnedQuantity: item.returnedQuantity })) }).subscribe({ next: (route) => { this.saving.set(false); this.visitDialog.set(false); this.selectedRoute.set(route); this.assignedRoutes.update((items) => items.map((item) => item.id===route.id?route:item)); this.saved('Resultado registrado', delivery.order.code); this.renderMapSoon('assigned-route-map'); }, error: (error) => this.failSave(error) }); }

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
  protected canConfirmPreparation(status: PreparationStatus): boolean { return ['EN_PREPARACION','OBSERVADA'].includes(status); }
  protected detailDifference(index: number): number { const preparation = this.selectedPreparation(); return Number(this.preparationDetails.at(index).get('preparedQuantity')?.value ?? 0) - Number(preparation?.details[index].requestedQuantity ?? 0); }
  protected preparationTitle(): string { return this.selectedPreparation() ? `Preparación · ${this.selectedPreparation()!.order.code}` : 'Preparación'; }
  protected routeTitle(): string { return this.selectedRoute() ? `${this.selectedRoute()!.code} · ${statusLabel(this.selectedRoute()!.status)}` : 'Ruta'; }
  protected principal(route: DistributionRoute): string { return route.responsibles.find((item) => item.isPrincipal)?.user.name ?? 'Sin principal'; }
  protected orderTotal(order: EligibleOrder, key: 'reservedQuantity'): string { return this.number(order.details.reduce((sum, detail) => sum + Number(detail[key]), 0)); }
  protected availableTotal(order: EligibleOrder): string { return this.number(order.details.reduce((sum, detail) => sum + Number(detail.availableQuantity), 0)); }
  protected summaryTotal(key: 'complete'|'partial'|'notDelivered'): number { return this.summaryRoutes().reduce((sum, route) => sum + Number(route.metrics?.[key] ?? 0), 0); }
  protected statusLabel(value: string): string { return statusLabel(value); }
  protected preparationSeverity(status: PreparationStatus): 'info'|'warn'|'success'|'secondary'|'danger' { return status==='PREPARADA'||status==='DESPACHADA'?'success':status==='OBSERVADA'?'warn':status==='ASIGNADA'?'info':'secondary'; }
  protected routeSeverity(status: DistributionRouteStatus): 'info'|'warn'|'success'|'secondary' { return status==='LIQUIDADA'?'success':status==='EN_REPARTO'?'warn':status==='PLANIFICADA'||status==='FINALIZADA'?'info':'secondary'; }
  protected visitSeverity(result: VisitResultType): 'success'|'warn'|'danger' { return result==='ENTREGADA'?'success':result==='ENTREGA_PARCIAL'?'warn':'danger'; }
  protected formatDate(value: string): string { return new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium' }).format(new Date(`${value.slice(0,10)}T12:00:00`)); }
  protected formatDateTime(value: string): string { return new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
  protected number(value: string|number): string { return new Intl.NumberFormat('es-BO', { maximumFractionDigits: 3 }).format(Number(value)); }
  protected numberValue(value: string|number): number { return Number(value); }
  private saved(summary: string, detail: string): void { this.messages.add({ severity: 'success', summary, detail }); }
  private fail(error: unknown): void { this.loading.set(false); this.messages.add({ severity: 'error', summary: 'No se pudo cargar Distribución', detail: this.error(error) }); }
  private failSave(error: unknown): void { this.saving.set(false); this.messages.add({ severity: 'error', summary: 'No se pudo completar la operación', detail: this.error(error) }); }
  private error(error: unknown): string { if (!(error instanceof HttpErrorResponse)) return 'Error inesperado'; const message = error.error?.message; return Array.isArray(message) ? message.join('. ') : message || 'La solicitud no pudo completarse'; }
}

function statusLabel(value: string): string {
  const labels: Record<string,string> = { EN_PREPARACION:'EN PREPARACIÓN', EN_REPARTO:'EN REPARTO', ENTREGA_PARCIAL:'ENTREGA PARCIAL', NO_ENTREGADA:'NO ENTREGADA' };
  return labels[value] ?? value;
}
