import { ProductionArea, Role, User, Zone } from './compartido/modelos';
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
      this.passwordResetTarget.set('USER');
      this.passwordResetLabel.set(`${user.code} · ${user.name}`);
      this.passwordDialog.set(true);
    }

  protected override resetPassword(): void {
      if (!this.editingUserId()) return;
      this.saving.set(true);
      const target = this.passwordResetTarget();
      const customerId = this.selectedCustomer()?.id;
      const url = target === 'CUSTOMER' && customerId
        ? `/api/customers/${customerId}/users/${this.editingUserId()}/password`
        : `/api/users/${this.editingUserId()}/password`;
      this.http.patch(url, {}).subscribe({
        next: () => {
          this.saving.set(false);
          this.passwordDialog.set(false);
          if (target === 'CUSTOMER') this.customerInfoDialog.set(false);
          this.toast(
            'success',
            'Contraseña restablecida',
            'La contraseña temporal es 123456 y deberá cambiarse en el próximo acceso.',
          );
          if (target === 'CUSTOMER') this.loadCustomers(this.customerMeta().page);
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

  protected override requestZoneDeletion(zone: Zone): void {
      this.zoneToDelete.set(zone);
      this.zoneDeleteDialog.set(true);
    }

  protected override closeZoneDeletion(visible = false): void {
      if (this.saving()) return;
      this.zoneDeleteDialog.set(visible);
      if (!visible) this.zoneToDelete.set(null);
    }

  protected override confirmZoneDeletion(): void {
      const zone = this.zoneToDelete();
      if (!zone) return;
      this.saving.set(true);
      this.http.delete<{ id: string; name: string; status: 'INACTIVO' }>(`/api/zones/${zone.id}`).subscribe({
        next: () => {
          this.saving.set(false);
          this.zoneDeleteDialog.set(false);
          this.zoneToDelete.set(null);
          this.toast('success', 'Zona inactivada', zone.name);
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
