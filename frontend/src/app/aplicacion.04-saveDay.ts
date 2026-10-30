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
import { AplicacionParte05 } from './aplicacion.05-setAccountStatus';

import { Directive } from '@angular/core';

@Directive()
export abstract class AplicacionParte04 extends AplicacionParte05 {
  protected override saveDay(): void {
      if (this.dayForm.invalid || !this.selectedZone()) return this.dayForm.markAllAsTouched();
      this.saving.set(true);
      this.http.post(`/api/zones/${this.selectedZone()!.id}/distribution-days`, this.dayForm.getRawValue()).subscribe({
        next: () => {
          this.saving.set(false);
          this.dayDialog.set(false);
          this.toast('success', 'Día programado', this.selectedZone()!.name);
          this.loadZones();
        },
        error: (error) => this.handleSaveError(error),
      });
    }

  protected override openAddress(customer: Customer, address?: CustomerAddress): void {
      this.selectedCustomer.set(customer);
      this.editingAddressId.set(address?.id ?? null);
      this.addressForm.reset({
        label: address?.label ?? (customer.addresses.length ? 'Sucursal' : 'Principal'),
        address: address?.address ?? '',
        reference: address?.reference ?? '',
        zoneId: address?.zoneId ?? '',
        distributionDayId: address?.distributionDayId ?? '',
        latitude: address?.latitude ? Number(address.latitude) : null,
        longitude: address?.longitude ? Number(address.longitude) : null,
        isPrimary: address?.isPrimary ?? !customer.addresses.length,
        status: address?.status ?? 'ACTIVO',
      });
      this.addressDialog.set(true);
      window.setTimeout(() => this.initializeMap(), 120);
    }

  protected override addressDays(): { label: string; value: string }[] {
      const zone = this.zones().find((item) => item.id === this.addressForm.controls.zoneId.value);
      return (zone?.distributionDays ?? [])
        .filter((day) => day.status === 'ACTIVO')
        .map((day) => ({ label: `${this.weekdayName(day.weekday)} · ${this.timeRange(day.startTime, day.endTime)}`, value: day.id }));
    }

  protected override onAddressZoneChange(): void {
      const current = this.addressForm.controls.distributionDayId.value;
      if (!this.addressDays().some((item) => item.value === current)) {
        this.addressForm.controls.distributionDayId.setValue('');
      }
    }

  protected override saveAddress(): void {
      if (this.addressForm.invalid || !this.selectedCustomer()) return this.addressForm.markAllAsTouched();
      this.saving.set(true);
      const customer = this.selectedCustomer()!;
      const addressId = this.editingAddressId();
      const raw = this.addressForm.getRawValue();
      const payload: Record<string, unknown> = {
        ...raw,
        reference: raw.reference || undefined,
        zoneId: raw.zoneId || undefined,
        distributionDayId: raw.distributionDayId || undefined,
      };
      if (!addressId) delete payload['status'];
      const request = addressId
        ? this.http.patch<CustomerAddress>(`/api/customers/${customer.id}/addresses/${addressId}`, payload)
        : this.http.post<CustomerAddress>(`/api/customers/${customer.id}/addresses`, payload);
      request.subscribe({
        next: () => {
          this.saving.set(false);
          this.addressDialog.set(false);
          this.destroyMap();
          this.toast('success', addressId ? 'Domicilio actualizado' : 'Domicilio agregado', customer.businessName);
          this.loadCustomers(this.customerMeta().page);
        },
        error: (error) => this.handleSaveError(error),
      });
    }

  protected override openAccount(customer: Customer): void {
      if (customer.userLinks.length) {
        this.toast(
          'info',
          'Cuenta ya habilitada',
          'Este cliente ya tiene una cuenta de acceso. Puede habilitarla o deshabilitarla desde la misma fila.',
        );
        return;
      }
      if (!customer.taxId?.trim()) {
        this.toast(
          'info',
          'Falta NIT / CI',
          'Registre el NIT o carnet del cliente antes de habilitar su cuenta.',
        );
        return;
      }
      if (!customer.email?.trim()) {
        this.toast(
          'info',
          'Falta correo',
          'Registre el correo del cliente antes de habilitar su cuenta.',
        );
        return;
      }
      this.selectedCustomer.set(customer);
      this.accountForm.reset({ password: '' });
      this.accountDialog.set(true);
    }

  protected override saveAccount(): void {
      if (this.accountForm.invalid || !this.selectedCustomer()) {
        return this.accountForm.markAllAsTouched();
      }
      this.saving.set(true);
      this.http
        .post<CustomerAccount>(
          `/api/customers/${this.selectedCustomer()!.id}/users`,
          this.accountForm.getRawValue(),
        )
        .subscribe({
          next: () => {
            this.saving.set(false);
            this.accountDialog.set(false);
            this.toast(
              'success',
              'Cuenta de cliente creada',
              this.selectedCustomer()!.businessName,
            );
            this.loadCustomers(this.customerMeta().page);
          },
          error: (error) => this.handleSaveError(error),
        });
    }
}
