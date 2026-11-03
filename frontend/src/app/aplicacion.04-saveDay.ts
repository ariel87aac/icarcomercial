import { Customer, CustomerAccount, CustomerAddress } from './compartido/modelos';
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
        isPrimary: address?.isPrimary ?? !customer.addresses.some((item) => item.status === 'ACTIVO'),
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
        isPrimary: raw.status === 'INACTIVO' ? false : raw.isPrimary,
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

  protected override setPrimaryAddress(customer: Customer, address: CustomerAddress): void {
      if (address.status !== 'ACTIVO' || address.isPrimary) return;
      this.updateAddressFromInfo(customer, address, { isPrimary: true }, 'Domicilio predeterminado');
    }

  protected override inactivateAddress(customer: Customer, address: CustomerAddress): void {
      if (address.status !== 'ACTIVO') return;
      this.updateAddressFromInfo(customer, address, { status: 'INACTIVO' }, 'Domicilio inactivado');
    }

  private updateAddressFromInfo(
      customer: Customer,
      address: CustomerAddress,
      payload: { isPrimary?: boolean; status?: 'INACTIVO' },
      summary: string,
    ): void {
      this.saving.set(true);
      this.http.patch(`/api/customers/${customer.id}/addresses/${address.id}`, payload).subscribe({
        next: () => this.http.get<Customer>(`/api/customers/${customer.id}`).subscribe({
          next: (updated) => {
            this.saving.set(false);
            this.selectedCustomer.set(updated);
            this.toast('success', summary, address.label);
            this.loadCustomers(this.customerMeta().page);
          },
          error: (error) => this.handleSaveError(error),
        }),
        error: (error) => this.handleSaveError(error),
      });
    }

  protected override openAccount(customer: Customer, account?: CustomerAccount): void {
      if (!account && customer.userLinks.length) {
        this.toast(
          'info',
          'Usuario ya asignado',
          'Este cliente ya tiene un usuario del sistema. Puede modificarlo desde la misma fila.',
        );
        return;
      }
      this.selectedCustomer.set(customer);
      const taxId = customer.taxId?.trim() ?? '';
      const suggestedUsername = taxId.length >= 4 ? taxId : `cliente${customer.code}`;
      this.editingAccountUserId.set(account?.userId ?? null);
      this.accountForm.reset({
        username: account?.user.username ?? suggestedUsername,
        password: account ? '' : '123456',
      });
      this.accountDialog.set(true);
    }

  protected override saveAccount(): void {
      const editingAccountUserId = this.editingAccountUserId();
      if (!editingAccountUserId && this.accountForm.controls.password.value.length < 6) {
        this.accountForm.controls.password.setErrors({ minlength: { requiredLength: 6 } });
      }
      if (this.accountForm.invalid || !this.selectedCustomer()) {
        return this.accountForm.markAllAsTouched();
      }
      this.saving.set(true);
      const customerId = this.selectedCustomer()!.id;
      const raw = this.accountForm.getRawValue();
      const request = editingAccountUserId
        ? this.http.patch<CustomerAccount>(
            `/api/customers/${customerId}/users/${editingAccountUserId}`,
            { username: raw.username },
          )
        : this.http.post<CustomerAccount>(`/api/customers/${customerId}/users`, raw);
      request.subscribe({
          next: () => {
            this.saving.set(false);
            this.accountDialog.set(false);
            this.customerInfoDialog.set(false);
            this.toast(
              'success',
              editingAccountUserId ? 'Usuario del sistema actualizado' : 'Usuario del sistema asignado',
              this.selectedCustomer()!.businessName,
            );
            this.loadCustomers(this.customerMeta().page);
          },
          error: (error) => this.handleSaveError(error),
        });
    }
}
