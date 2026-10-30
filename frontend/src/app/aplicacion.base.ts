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
import { Directive } from '@angular/core';
import { AplicacionContratos01 } from './aplicacion.contratos-01';

@Directive()
export abstract class AplicacionBase extends AplicacionContratos01 {
protected readonly http = inject(HttpClient);

  protected readonly fb = inject(FormBuilder);

  protected readonly messages = inject(MessageService);

  protected readonly auth = inject(AuthService);

  protected initializedUserId: string | null = null;

  protected customerSearchTimer: number | null = null;

  protected map: L.Map | null = null;

  protected coordinateMarker: L.CircleMarker | null = null;

  protected readonly publicTrackingToken = this.readPublicTrackingToken();

  protected readonly publicOrderConfirmationToken = this.readPublicOrderConfirmationToken();

  protected readonly activeSection = signal<Section>('dashboard');

  protected readonly sidebarOpen = signal(false);

  protected readonly loading = signal(false);

  protected readonly saving = signal(false);

  protected readonly loginError = signal('');

  protected readonly loginBusy = signal(false);

  protected readonly customers = signal<Customer[]>([]);

  protected readonly customerMeta = signal({ page: 1, total: 0, totalPages: 1 });

  protected readonly users = signal<User[]>([]);

  protected readonly userMeta = signal({ page: 1, total: 0, totalPages: 1 });

  protected readonly roles = signal<Role[]>([]);

  protected readonly productionAreas = signal<ProductionArea[]>([]);

  protected readonly permissions = signal<Permission[]>([]);

  protected readonly zones = signal<Zone[]>([]);

  protected readonly auditEvents = signal<AuditEvent[]>([]);

  protected readonly auditMeta = signal({ page: 1, total: 0, totalPages: 1 });

  protected readonly operationalSummary = signal<OperationalDashboardSummary>(EMPTY_OPERATIONAL_SUMMARY);

  protected readonly operationalLoading = signal(false);

  protected readonly customerDialog = signal(false);

  protected readonly customerInfoDialog = signal(false);

  protected readonly customerDeleteDialog = signal(false);

  protected readonly userDialog = signal(false);

  protected readonly userDeleteDialog = signal(false);

  protected readonly roleDialog = signal(false);

  protected readonly zoneDialog = signal(false);

  protected readonly dayDialog = signal(false);

  protected readonly addressDialog = signal(false);

  protected readonly accountDialog = signal(false);

  protected readonly passwordDialog = signal(false);

  protected readonly editingCustomerId = signal<string | null>(null);

  protected readonly editingUserId = signal<string | null>(null);

  protected readonly editingRoleId = signal<string | null>(null);

  protected readonly editingZoneId = signal<string | null>(null);

  protected readonly selectedCustomer = signal<Customer | null>(null);

  protected readonly customerToDelete = signal<Customer | null>(null);

  protected readonly userToDelete = signal<User | null>(null);

  protected readonly selectedZone = signal<Zone | null>(null);

  protected readonly editingAddressId = signal<string | null>(null);

  protected readonly customerSearch = signal('');

  protected readonly customerTypeFilter = signal<string | null>(null);

  protected readonly customerStatusFilter = signal<string | null>(null);

  protected readonly customerZoneFilter = signal<string | null>(null);

  protected readonly userSearch = signal('');

  protected readonly userStatusFilter = signal<string | null>(null);

  protected readonly auditModuleFilter = signal('');

  protected readonly auditActionFilter = signal('');

  protected readonly auditUserFilter = signal<string | null>(null);

  protected readonly auditEntityFilter = signal('');

  protected readonly auditResultFilter = signal<string | null>(null);

  protected readonly auditFromFilter = signal('');

  protected readonly auditToFilter = signal('');
}
