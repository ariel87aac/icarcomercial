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
import { AplicacionBase } from './aplicacion.base';

import { Directive } from '@angular/core';

@Directive()
export abstract class AplicacionEstado02 extends AplicacionBase {
  protected readonly navigation: NavigationItem[] = [
        { id: 'dashboard', label: 'Resumen', icon: 'pi pi-home' },
        { id: 'catalog', label: 'Catálogo', icon: 'pi pi-shopping-bag', permission: 'catalog.read' },
        { id: 'orders', label: 'Pedidos', icon: 'pi pi-shopping-cart', permission: 'orders.read' },
        { id: 'catalog-admin', label: 'Productos', icon: 'pi pi-box', permission: 'catalog.manage' },
        { id: 'inventory', label: 'Almacén', icon: 'pi pi-warehouse', permission: 'inventory.read' },
        {
          id: 'production',
          label: 'Producción',
          icon: 'pi pi-chart-bar',
          permission: 'production.consolidations.read',
        },
        {
          id: 'distribution',
          label: 'Distribución',
          icon: 'pi pi-truck',
          permission: 'distribution.summary.read',
        },
        {
          id: 'messaging',
          label: 'Seguimiento y mensajería',
          icon: 'pi pi-whatsapp',
          permission: 'notifications.read',
        },
        {
          id: 'commercial',
          label: 'Ventas y cobranza',
          icon: 'pi pi-credit-card',
          permission: 'commercial.sales.read',
        },
        { id: 'customers', label: 'Clientes', icon: 'pi pi-users', permission: 'customers.read' },
        { id: 'zones', label: 'Zonas y reparto', icon: 'pi pi-map', permission: 'zones.read' },
        { id: 'users', label: 'Usuarios', icon: 'pi pi-user-edit', permission: 'users.read' },
        { id: 'roles', label: 'Roles y permisos', icon: 'pi pi-shield', permission: 'roles.read' },
        { id: 'audit', label: 'Auditoría', icon: 'pi pi-history', permission: 'audit.read' },
      ];

  protected readonly statusOptions = [
        { label: 'Activo', value: 'ACTIVO' },
        { label: 'Inactivo', value: 'INACTIVO' },
      ];

  protected readonly zoneStatusOptions = [
        { label: 'Activas', value: 'ACTIVO' },
        { label: 'Inactivas', value: 'INACTIVO' },
        { label: 'Todas', value: null },
      ];

  protected readonly customerTypeOptions = [
        { label: 'Público', value: 'PUBLICO' },
        { label: 'Minorista', value: 'MINORISTA' },
        { label: 'Distribuidor', value: 'DISTRIBUIDOR' },
        { label: 'Mayorista', value: 'MAYORISTA' },
      ];

  protected readonly paymentOptions = [
        { label: 'Contado', value: 'CONTADO' },
        { label: 'Crédito', value: 'CREDITO' },
      ];

  protected readonly auditResultOptions = [
        { label: 'Exitoso', value: 'EXITOSO' },
        { label: 'Rechazado', value: 'RECHAZADO' },
        { label: 'Error', value: 'ERROR' },
      ];

  protected readonly countryCodeOptions = [
        { label: 'Bolivia (+591)', value: '+591' },
        { label: 'Argentina (+54)', value: '+54' },
        { label: 'Brasil (+55)', value: '+55' },
        { label: 'Chile (+56)', value: '+56' },
        { label: 'Colombia (+57)', value: '+57' },
        { label: 'Costa Rica (+506)', value: '+506' },
        { label: 'Cuba (+53)', value: '+53' },
        { label: 'Ecuador (+593)', value: '+593' },
        { label: 'El Salvador (+503)', value: '+503' },
        { label: 'España (+34)', value: '+34' },
        { label: 'Estados Unidos / Canadá (+1)', value: '+1' },
        { label: 'Guatemala (+502)', value: '+502' },
        { label: 'Haití (+509)', value: '+509' },
        { label: 'Honduras (+504)', value: '+504' },
        { label: 'México (+52)', value: '+52' },
        { label: 'Nicaragua (+505)', value: '+505' },
        { label: 'Panamá (+507)', value: '+507' },
        { label: 'Paraguay (+595)', value: '+595' },
        { label: 'Perú (+51)', value: '+51' },
        { label: 'Puerto Rico (+1)', value: '+1' },
        { label: 'República Dominicana (+1)', value: '+1' },
        { label: 'Uruguay (+598)', value: '+598' },
        { label: 'Venezuela (+58)', value: '+58' },
      ];

  protected readonly weekdayOptions = [
        { label: 'Lunes', value: 1 },
        { label: 'Martes', value: 2 },
        { label: 'Miércoles', value: 3 },
        { label: 'Jueves', value: 4 },
        { label: 'Viernes', value: 5 },
        { label: 'Sábado', value: 6 },
        { label: 'Domingo', value: 7 },
      ];

  protected readonly loginForm = this.fb.nonNullable.group({
        identifier: ['', [Validators.required, Validators.minLength(3)]],
        password: ['', Validators.required],
      });

  protected readonly requiredPasswordForm = this.fb.nonNullable.group({
        currentPassword: ['', Validators.required],
        newPassword: ['', [Validators.required, Validators.minLength(6)]],
        confirmPassword: ['', [Validators.required, Validators.minLength(6)]],
      });
}
