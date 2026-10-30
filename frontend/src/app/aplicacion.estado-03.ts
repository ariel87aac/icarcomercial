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
import { AplicacionEstado02 } from './aplicacion.estado-02';

import { Directive } from '@angular/core';

@Directive()
export abstract class AplicacionEstado03 extends AplicacionEstado02 {
  protected readonly customerForm = this.fb.nonNullable.group({
        type: ['MINORISTA', Validators.required],
        businessName: ['', [Validators.required, Validators.minLength(2)]],
        taxId: [''],
        contactName: [''],
        phone: ['', [Validators.required, Validators.minLength(6)]],
        whatsapp: [''],
        email: ['', Validators.email],
        paymentCondition: ['CONTADO', Validators.required],
        creditLimit: [0, [Validators.required, Validators.min(0)]],
        creditDays: [0, [Validators.required, Validators.min(0), Validators.max(365)]],
        status: ['ACTIVO'],
      });

  protected readonly userForm = this.fb.nonNullable.group({
        name: ['', [Validators.required, Validators.minLength(3)]],
        username: ['', [Validators.required, Validators.pattern(/^[a-zA-Z0-9._-]{4,80}$/)]],
        email: ['', Validators.email],
        phone: [''],
        password: [''],
        roleIds: [[] as string[], Validators.required],
        productionAreaIds: [[] as string[]],
        status: ['ACTIVO'],
      });

  protected readonly roleForm = this.fb.nonNullable.group({
        name: ['', [Validators.required, Validators.minLength(3)]],
        description: [''],
        permissionIds: [[] as string[]],
        status: ['ACTIVO'],
      });

  protected readonly zoneForm = this.fb.nonNullable.group({
        name: ['', [Validators.required, Validators.minLength(2)]],
        description: [''],
        status: ['ACTIVO'],
      });

  protected readonly dayForm = this.fb.nonNullable.group({
        weekday: [1, Validators.required],
        startTime: ['08:00'],
        endTime: ['17:00'],
      });

  protected readonly addressForm = this.fb.nonNullable.group({
        label: ['Principal', Validators.required],
        address: ['', [Validators.required, Validators.minLength(5)]],
        reference: [''],
        zoneId: [''],
        distributionDayId: [''],
        latitude: [null as number | null],
        longitude: [null as number | null],
        isPrimary: [false],
        status: ['ACTIVO'],
      });

  protected readonly passwordForm = this.fb.nonNullable.group({
        newPassword: ['', [Validators.required, Validators.minLength(6)]],
      });

  protected readonly accountForm = this.fb.nonNullable.group({
        password: [
          '',
          [Validators.required, Validators.minLength(8), Validators.maxLength(8)],
        ],
      });

  constructor() {
        super();
        effect(() => {
          const userId = this.auth.user()?.id ?? null;
          if (userId && this.initializedUserId !== userId) {
            this.initializedUserId = userId;
            queueMicrotask(() => {
              this.loadReferenceData();
              this.loadDashboard();
            });
          }
          if (!userId) this.initializedUserId = null;
        });
      }
}
