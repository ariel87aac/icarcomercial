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
import { AplicacionParte04 } from './aplicacion.04-saveDay';

import { Directive } from '@angular/core';

@Directive()
export abstract class AplicacionParte03 extends AplicacionParte04 {
  protected override isProductionUserForm(): boolean {
      const productionRole = this.roles().find((role) => role.name === 'PRODUCCION');
      return !!productionRole && this.userForm.controls.roleIds.value.includes(productionRole.id);
    }

  protected override onUserRoleSelection(): void {
      if (!this.isProductionUserForm()) {
        this.userForm.controls.productionAreaIds.setValue([]);
        this.userForm.controls.productionAreaIds.setErrors(null);
      }
    }

  protected override loadUserProductionAreas(): void {
      if (!this.can('users.read')) return;
      this.http.get<ProductionArea[]>('/api/users/production-areas/available').subscribe({
        next: (areas) => this.productionAreas.set(areas),
        error: (error) => this.handleLoadError(error),
      });
    }

  protected override requestUserDeletion(user: User): void {
      this.userToDelete.set(user);
      this.userDeleteDialog.set(true);
    }

  protected override closeUserDeletion(visible = false): void {
      if (this.saving()) return;
      this.userDeleteDialog.set(visible);
      if (!visible) this.userToDelete.set(null);
    }

  protected override confirmUserDeletion(): void {
      const user = this.userToDelete();
      if (!user) return;
      this.saving.set(true);
      this.http.delete<{ id: string; code: number; deleted: true }>(`/api/users/${user.id}`).subscribe({
        next: () => {
          this.saving.set(false);
          this.userDeleteDialog.set(false);
          this.userToDelete.set(null);
          this.toast('success', 'Usuario eliminado', `${user.code} · ${user.name}`);
          this.loadUsers(this.userMeta().page);
        },
        error: (error) => this.handleSaveError(error),
      });
    }

  protected override openPasswordReset(user: User): void {
      this.editingUserId.set(user.id);
      this.passwordForm.reset({ newPassword: '' });
      this.passwordDialog.set(true);
    }

  protected override resetPassword(): void {
      if (this.passwordForm.invalid || !this.editingUserId()) return this.passwordForm.markAllAsTouched();
      this.saving.set(true);
      this.http.patch(`/api/users/${this.editingUserId()}/password`, this.passwordForm.getRawValue()).subscribe({
        next: () => {
          this.saving.set(false);
          this.passwordDialog.set(false);
          this.toast('success', 'Contraseña restablecida', 'Las sesiones anteriores fueron invalidadas.');
        },
        error: (error) => this.handleSaveError(error),
      });
    }

  protected override loadRoles(): void {
      this.http.get<Role[]>('/api/roles').subscribe({
        next: (items) => this.roles.set(items),
        error: (error) => this.handleLoadError(error),
      });
    }

  protected override openRole(role?: Role): void {
      this.editingRoleId.set(role?.id ?? null);
      this.roleForm.reset({
        name: role?.name ?? '',
        description: role?.description ?? '',
        permissionIds: role?.permissions.map((permission) => permission.id) ?? [],
        status: role?.status ?? 'ACTIVO',
      });
      this.roleDialog.set(true);
    }

  protected override saveRole(): void {
      if (this.roleForm.invalid) return this.roleForm.markAllAsTouched();
      this.saving.set(true);
      const id = this.editingRoleId();
      const raw = this.roleForm.getRawValue();
      const payload: Record<string, unknown> = { ...raw, description: raw.description || undefined };
      if (!id) delete payload['status'];
      const request = id
        ? this.http.patch<Role>(`/api/roles/${id}`, payload)
        : this.http.post<Role>('/api/roles', payload);
      request.subscribe({
        next: (role) => {
          this.saving.set(false);
          this.roleDialog.set(false);
          this.toast('success', id ? 'Rol actualizado' : 'Rol creado', role.name);
          this.loadRoles();
        },
        error: (error) => this.handleSaveError(error),
      });
    }

  protected override loadZones(): void {
      this.http.get<Zone[]>('/api/zones').subscribe({
        next: (items) => this.zones.set(items),
        error: (error) => this.handleLoadError(error),
      });
    }

  protected override openZone(zone?: Zone): void {
      this.editingZoneId.set(zone?.id ?? null);
      this.zoneForm.reset({
        name: zone?.name ?? '',
        description: zone?.description ?? '',
        status: zone?.status ?? 'ACTIVO',
      });
      this.zoneDialog.set(true);
    }

  protected override saveZone(): void {
      if (this.zoneForm.invalid) return this.zoneForm.markAllAsTouched();
      this.saving.set(true);
      const id = this.editingZoneId();
      const raw = this.zoneForm.getRawValue();
      const payload: Record<string, unknown> = { ...raw, description: raw.description || undefined };
      if (!id) delete payload['status'];
      const request = id
        ? this.http.patch<Zone>(`/api/zones/${id}`, payload)
        : this.http.post<Zone>('/api/zones', payload);
      request.subscribe({
        next: (zone) => {
          this.saving.set(false);
          this.zoneDialog.set(false);
          this.toast('success', id ? 'Zona actualizada' : 'Zona creada', zone.name);
          this.loadZones();
        },
        error: (error) => this.handleSaveError(error),
      });
    }

  protected override openDay(zone: Zone): void {
      this.selectedZone.set(zone);
      this.dayForm.reset({ weekday: 1, startTime: '08:00', endTime: '17:00' });
      this.dayDialog.set(true);
    }
}
