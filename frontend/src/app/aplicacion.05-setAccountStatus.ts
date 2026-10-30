import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { MultiSelectModule } from 'primeng/multiselect';
import { PasswordModule } from 'primeng/password';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import * as L from 'leaflet';
import { AuthService } from './nucleo/autenticacion/auth.service';
import { CatalogAdminComponent } from './modulos/productos/presentacion/paginas/administracion/catalog-admin.component';
import { CommercialCatalogComponent } from './modulos/productos/presentacion/paginas/catalogo/commercial-catalog.component';
import { InventoryComponent } from './modulos/almacen/presentacion/paginas/gestion/inventory.component';
import { OrdersComponent } from './modulos/pedidos/presentacion/paginas/gestion/orders.component';
import { PublicOrderConfirmationComponent } from './modulos/pedidos/presentacion/paginas/confirmacion-publica/public-order-confirmation.component';
import { ProductionComponent } from './modulos/produccion/presentacion/paginas/planificacion/production.component';
import { DistributionComponent } from './modulos/distribucion/presentacion/paginas/gestion/distribution.component';
import { MessagingComponent } from './modulos/seguimiento-mensajeria/presentacion/paginas/configuracion/messaging.component';
import { PublicTrackingComponent } from './modulos/seguimiento-mensajeria/presentacion/paginas/seguimiento-publico/public-tracking.component';
import { CommercialComponent } from './modulos/ventas-cobranzas/presentacion/paginas/gestion/commercial.component';
import {
  AuditEvent,
  Customer,
  CustomerAccount,
  CustomerAddress,
  Paginated,
  Permission,
  ProductionArea,
  Role,
  User,
  Zone,
} from './compartido/modelos';

type Section =
  | 'dashboard'
  | 'catalog'
  | 'catalog-admin'
  | 'orders'
  | 'inventory'
  | 'production'
  | 'distribution'
  | 'messaging'
  | 'commercial'
  | 'customers'
  | 'users'
  | 'roles'
  | 'zones'
  | 'audit';

interface NavigationItem {
  id: Section;
  label: string;
  icon: string;
  permission?: string;
}

type OperationalStageKey = 'orders' | 'production' | 'preparation' | 'distribution';

interface OperationalDashboardSummary {
  pendingTotal: number;
  generatedAt: string;
  stages: {
    orders: { available: boolean; pending: number; breakdown: { draft: number; received: number } };
    production: { available: boolean; pending: number; breakdown: { draft: number; issued: number; inProgress: number } };
    preparation: { available: boolean; pending: number; breakdown: { waitingStock: number; readyToPrepare: number; verified: number } };
    distribution: { available: boolean; pending: number; breakdown: { readyForRoute: number; scheduled: number; inDelivery: number } };
  };
}

const EMPTY_OPERATIONAL_SUMMARY: OperationalDashboardSummary = {
  pendingTotal: 0,
  generatedAt: '',
  stages: {
    orders: { available: false, pending: 0, breakdown: { draft: 0, received: 0 } },
    production: { available: false, pending: 0, breakdown: { draft: 0, issued: 0, inProgress: 0 } },
    preparation: { available: false, pending: 0, breakdown: { waitingStock: 0, readyToPrepare: 0, verified: 0 } },
    distribution: { available: false, pending: 0, breakdown: { readyForRoute: 0, scheduled: 0, inDelivery: 0 } },
  },
};
import { AplicacionEstado03 } from './aplicacion.estado-03';

import { Directive } from '@angular/core';

@Directive()
export abstract class AplicacionParte05 extends AplicacionEstado03 {
  protected override setAccountStatus(
      customer: Customer,
      account: CustomerAccount,
    ): void {
      const status = account.status === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
      this.saving.set(true);
      this.http
        .patch<CustomerAccount>(
          `/api/customers/${customer.id}/users/${account.userId}`,
          { status },
        )
        .subscribe({
          next: () => {
            this.saving.set(false);
            this.toast(
              'success',
              status === 'ACTIVO' ? 'Cuenta habilitada' : 'Cuenta deshabilitada',
              account.user.email ?? account.user.username,
            );
            this.loadCustomers(this.customerMeta().page);
          },
          error: (error) => this.handleSaveError(error),
        });
    }

  protected override closeAddressDialog(): void {
      this.addressDialog.set(false);
      this.destroyMap();
    }

  protected override initializeMap(): void {
      this.destroyMap();
      const element = document.getElementById('address-map');
      if (!element) return;
      const latitude = this.addressForm.controls.latitude.value ?? -16.5;
      const longitude = this.addressForm.controls.longitude.value ?? -68.15;
      const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      });
      const satelliteLayer = L.tileLayer(
        'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          maxZoom: 19,
          attribution: '&copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community',
        },
      );
      this.map = L.map(element, { zoomControl: true, layers: [streetLayer] })
        .setView([latitude, longitude], this.addressForm.controls.latitude.value ? 16 : 12);
      L.control.layers(
        { 'Mapa OpenStreetMap': streetLayer, 'Vista satelital': satelliteLayer },
        undefined,
        { collapsed: false, position: 'topright' },
      ).addTo(this.map);
      if (this.addressForm.controls.latitude.value !== null) this.setMapCoordinates(latitude, longitude);
      this.map.on('click', (event: L.LeafletMouseEvent) => this.setMapCoordinates(event.latlng.lat, event.latlng.lng));
      window.setTimeout(() => this.map?.invalidateSize(), 50);
    }

  protected override setMapCoordinates(latitude: number, longitude: number): void {
      const roundedLat = Number(latitude.toFixed(6));
      const roundedLon = Number(longitude.toFixed(6));
      this.addressForm.patchValue({ latitude: roundedLat, longitude: roundedLon });
      if (this.coordinateMarker) this.coordinateMarker.setLatLng([roundedLat, roundedLon]);
      else if (this.map) {
        this.coordinateMarker = L.circleMarker([roundedLat, roundedLon], {
          radius: 9,
          color: '#003f7d',
          fillColor: '#ed1c24',
          fillOpacity: 1,
          weight: 3,
        }).addTo(this.map);
      }
    }

  protected override destroyMap(): void {
      this.map?.remove();
      this.map = null;
      this.coordinateMarker = null;
    }

  protected override loadAudit(page = this.auditMeta().page): void {
      this.loading.set(true);
      let params = new HttpParams().set('page', page).set('limit', 20);
      if (this.auditModuleFilter().trim()) params = params.set('module', this.auditModuleFilter().trim());
      if (this.auditActionFilter().trim()) params = params.set('action', this.auditActionFilter().trim());
      if (this.auditUserFilter()) params = params.set('userId', this.auditUserFilter()!);
      if (this.auditEntityFilter().trim()) params = params.set('entity', this.auditEntityFilter().trim());
      if (this.auditResultFilter()) params = params.set('result', this.auditResultFilter()!);
      if (this.auditFromFilter()) params = params.set('from', new Date(`${this.auditFromFilter()}T00:00:00`).toISOString());
      if (this.auditToFilter()) params = params.set('to', new Date(`${this.auditToFilter()}T23:59:59.999`).toISOString());
      this.http.get<Paginated<AuditEvent>>('/api/audit-events', { params }).subscribe({
        next: (response) => {
          this.auditEvents.set(response.data);
          this.auditMeta.set({ page: response.meta.page, total: response.meta.total, totalPages: response.meta.totalPages });
          this.loading.set(false);
        },
        error: (error) => this.handleLoadError(error),
      });
    }

  protected override weekdayName(weekday: number): string {
      return this.weekdayOptions.find((item) => item.value === weekday)?.label ?? `Día ${weekday}`;
    }

  protected override timeRange(start: string | null, end: string | null): string {
      if (!start && !end) return 'Horario abierto';
      return `${start?.slice(0, 5) ?? '—'}–${end?.slice(0, 5) ?? '—'}`;
    }

  protected override formatDate(value: string | null): string {
      if (!value) return 'Sin registro';
      return new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
    }

  protected override statusSeverity(status: string): 'success' | 'danger' | 'warn' | 'info' {
      if (status === 'ACTIVO' || status === 'EXITOSO') return 'success';
      if (status === 'INACTIVO' || status === 'RECHAZADO' || status === 'ERROR') return 'danger';
      return 'info';
    }

  protected override customerTypeLabel(type: string): string {
      return this.customerTypeOptions.find((item) => item.value === type)?.label ?? type;
    }

  protected override jsonPreview(value: Record<string, unknown>): string {
      const text = JSON.stringify(value);
      return text.length > 90 ? `${text.slice(0, 87)}…` : text;
    }

  protected override handleLoadError(error: unknown): void {
      this.loading.set(false);
      this.toast('error', 'No se pudo cargar la información', this.errorMessage(error));
    }

  protected override handleSaveError(error: unknown): void {
      this.saving.set(false);
      this.toast('error', 'No se pudo guardar', this.errorMessage(error));
    }

  protected override errorMessage(error: unknown): string {
      if (!(error instanceof HttpErrorResponse)) return 'Error inesperado';
      const message = error.error?.message;
      return Array.isArray(message) ? message.join('. ') : message || 'La solicitud no pudo completarse';
    }

  protected override toast(severity: 'success' | 'error' | 'info', summary: string, detail: string): void {
      this.messages.add({ severity, summary, detail, life: 4500 });
    }
}
