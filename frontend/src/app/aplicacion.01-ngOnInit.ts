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
import { AplicacionParte02 } from './aplicacion.02-openCustomer';

import { Directive } from '@angular/core';

@Directive()
export abstract class AplicacionParte01 extends AplicacionParte02 {
  override ngOnInit(): void {
      if (!this.publicTrackingToken) this.auth.restore();
    }

  override ngOnDestroy(): void {
      if (this.customerSearchTimer !== null) window.clearTimeout(this.customerSearchTimer);
      this.destroyMap();
    }

  protected override submitLogin(): void {
      if (this.loginForm.invalid) {
        this.loginForm.markAllAsTouched();
        return;
      }
      this.loginBusy.set(true);
      this.loginError.set('');
      this.auth.login(this.loginForm.value.identifier!, this.loginForm.value.password!).subscribe({
        next: () => {
          this.loginBusy.set(false);
          this.loginForm.controls.password.reset();
        },
        error: (error) => {
          this.loginBusy.set(false);
          this.loginError.set(this.errorMessage(error));
        },
      });
    }

  protected override logout(): void {
      this.auth.logout().subscribe({
        next: () => this.activeSection.set('dashboard'),
        error: () => {
          this.auth.clear();
          this.activeSection.set('dashboard');
        },
      });
    }

  protected override can(permission?: string): boolean {
      return !permission || this.auth.can(permission);
    }

  protected override selectSection(section: Section): void {
      this.activeSection.set(section);
      this.sidebarOpen.set(false);
      if (section === 'dashboard') this.loadOperationalSummary();
      if (section === 'customers') this.loadCustomers(1);
      if (section === 'users') { this.loadUsers(1); this.loadUserProductionAreas(); }
      if (section === 'roles') this.loadRoles();
      if (section === 'zones') this.loadZones();
      if (section === 'audit') this.loadAudit(1);
    }

  protected override sectionTitle(): string {
      return this.navigation.find((item) => item.id === this.activeSection())?.label ?? 'Sistema comercial';
    }

  protected override readPublicTrackingToken(): string | null {
      const match = globalThis.location?.pathname.match(/^\/seguimiento\/([^/]+)\/?$/);
      return match ? decodeURIComponent(match[1]) : null;
    }

  protected override readPublicOrderConfirmationToken(): string | null {
      const match = globalThis.location?.pathname.match(/^\/confirmar-pedido\/([^/]+)\/?$/);
      return match ? decodeURIComponent(match[1]) : null;
    }

  protected override loadReferenceData(): void {
      if (this.can('roles.read')) {
        this.loadRoles();
        this.http.get<Permission[]>('/api/permissions').subscribe({ next: (items) => this.permissions.set(items) });
      }
      if (this.can('zones.read')) this.loadZones();
    }

  protected override loadDashboard(): void {
      this.loadOperationalSummary();
      if (this.can('customers.read')) this.loadCustomers(1);
      if (this.can('users.read')) { this.loadUsers(1); this.loadUserProductionAreas(); }
      if (this.can('audit.read')) this.loadAudit(1);
    }

  protected override loadOperationalSummary(): void {
      this.operationalLoading.set(true);
      this.http.get<OperationalDashboardSummary>('/api/dashboard/operational-summary').subscribe({
        next: (summary) => {
          this.operationalSummary.set(summary);
          this.operationalLoading.set(false);
        },
        error: (error) => {
          this.operationalLoading.set(false);
          this.handleLoadError(error);
        },
      });
    }

  protected override openOperationalStage(stage: OperationalStageKey): void {
      if (!this.operationalSummary().stages[stage].available) return;
      const section: Record<OperationalStageKey, Section> = {
        orders: 'orders',
        production: 'production',
        preparation: 'inventory',
        distribution: 'distribution',
      };
      this.selectSection(section[stage]);
    }

  protected override loadCustomers(page = this.customerMeta().page): void {
      this.loading.set(true);
      let params = new HttpParams().set('page', page).set('limit', 20);
      if (this.customerSearch().trim()) params = params.set('q', this.customerSearch().trim());
      if (this.customerTypeFilter()) params = params.set('type', this.customerTypeFilter()!);
      if (this.customerStatusFilter()) params = params.set('status', this.customerStatusFilter()!);
      if (this.customerZoneFilter()) params = params.set('zoneId', this.customerZoneFilter()!);
      this.http.get<Paginated<Customer>>('/api/customers', { params }).subscribe({
        next: (response) => {
          this.customers.set(response.data);
          this.customerMeta.set({ page: response.meta.page, total: response.meta.total, totalPages: response.meta.totalPages });
          this.loading.set(false);
        },
        error: (error) => this.handleLoadError(error),
      });
    }

  protected override onCustomerSearch(value: string): void {
      this.customerSearch.set(value);
      if (this.customerSearchTimer !== null) window.clearTimeout(this.customerSearchTimer);
      this.customerSearchTimer = window.setTimeout(() => {
        this.customerSearchTimer = null;
        this.loadCustomers(1);
      }, 300);
    }

  protected override applyCustomerFilter(filter: 'type' | 'status' | 'zone', value: string | null): void {
      if (filter === 'type') this.customerTypeFilter.set(value);
      if (filter === 'status') this.customerStatusFilter.set(value);
      if (filter === 'zone') this.customerZoneFilter.set(value);
      this.loadCustomers(1);
    }

  protected override clearCustomerFilters(): void {
      this.customerSearch.set('');
      this.customerTypeFilter.set(null);
      this.customerStatusFilter.set(null);
      this.customerZoneFilter.set(null);
      this.loadCustomers(1);
    }
}
