import { HttpParams } from '@angular/common/http';
import { Customer, Paginated, User } from './compartido/modelos';
import { AplicacionParte03 } from './aplicacion.03-isProductionUserForm';

import { Directive } from '@angular/core';

@Directive()
export abstract class AplicacionParte02 extends AplicacionParte03 {
  protected override openCustomer(customer?: Customer): void {
      this.editingCustomerId.set(customer?.id ?? null);
      this.customerForm.reset({
        type: customer?.type ?? 'MINORISTA',
        businessName: customer?.businessName ?? '',
        taxId: customer?.taxId ?? '',
        contactName: customer?.contactName ?? '',
        phone: customer?.phone ?? '',
        countryCode: customer?.countryCode ?? '+591',
        whatsapp: customer?.whatsapp ?? '',
        email: customer?.email ?? '',
        paymentCondition: customer?.paymentCondition ?? 'CONTADO',
        creditLimit: Number(customer?.creditLimit ?? 0),
        creditDays: customer?.creditDays ?? 0,
        status: customer?.status ?? 'ACTIVO',
      });
      this.customerDialog.set(true);
    }

  protected override openCustomerInfo(customer: Customer): void {
      this.selectedCustomer.set(customer);
      this.customerInfoDialog.set(true);
    }

  protected override requestCustomerDeletion(customer: Customer): void {
      this.customerToDelete.set(customer);
      this.customerDeleteDialog.set(true);
    }

  protected override closeCustomerDeletion(visible = false): void {
      if (this.saving()) return;
      this.customerDeleteDialog.set(visible);
      if (!visible) this.customerToDelete.set(null);
    }

  protected override confirmCustomerDeletion(): void {
      const customer = this.customerToDelete();
      if (!customer) return;
      this.saving.set(true);
      this.http
        .delete<{ id: string; code: number; status: 'INACTIVO'; deactivated: true }>(
          `/api/customers/${customer.id}`,
        )
        .subscribe({
          next: () => {
            this.saving.set(false);
            this.customerDeleteDialog.set(false);
            this.customerToDelete.set(null);
            this.toast(
              'success',
              'Cliente inactivo',
              `${customer.code} · ${customer.businessName}`,
            );
            this.loadCustomers(1);
          },
          error: (error) => this.handleSaveError(error),
        });
    }

  protected override saveCustomer(): void {
      if (this.customerForm.invalid) return this.customerForm.markAllAsTouched();
      this.saving.set(true);
      const id = this.editingCustomerId();
      const raw = this.customerForm.getRawValue();
      const payload: Record<string, unknown> = {
        ...raw,
        taxId: raw.taxId || undefined,
        contactName: raw.contactName || undefined,
        whatsapp: raw.whatsapp || undefined,
        email: raw.email || undefined,
      };
      if (!id) delete payload['status'];
      const request = id
        ? this.http.patch<Customer>(`/api/customers/${id}`, payload)
        : this.http.post<Customer>('/api/customers', payload);
      request.subscribe({
        next: (customer) => {
          this.saving.set(false);
          this.customerDialog.set(false);
          this.toast('success', id ? 'Cliente actualizado' : 'Cliente registrado', customer.businessName);
          this.loadCustomers(id ? this.customerMeta().page : 1);
        },
        error: (error) => this.handleSaveError(error),
      });
    }

  protected override loadUsers(page = this.userMeta().page): void {
      this.loading.set(true);
      let params = new HttpParams().set('page', page).set('limit', 20);
      if (this.userSearch().trim()) params = params.set('q', this.userSearch().trim());
      if (this.userStatusFilter()) params = params.set('status', this.userStatusFilter()!);
      this.http.get<Paginated<User>>('/api/users', { params }).subscribe({
        next: (response) => {
          this.users.set(response.data);
          this.userMeta.set({ page: response.meta.page, total: response.meta.total, totalPages: response.meta.totalPages });
          this.loading.set(false);
        },
        error: (error) => this.handleLoadError(error),
      });
    }

  protected override openUser(user?: User): void {
      this.editingUserId.set(user?.id ?? null);
      this.userForm.reset({
        name: user?.name ?? '',
        username: user?.username ?? '',
        email: user?.email ?? '',
        phone: user?.phone ?? '',
        countryCode: user?.countryCode ?? '+591',
        password: user ? '' : '123456',
        roleIds: user?.roles.map((role) => role.id) ?? [],
        productionAreaIds: user?.productionAreas.map((area) => area.id) ?? [],
        status: user?.status ?? 'ACTIVO',
      });
      this.userDialog.set(true);
    }

  protected override saveUser(): void {
      const id = this.editingUserId();
      if (!id && (this.userForm.value.password?.length ?? 0) < 6) {
        this.userForm.controls.password.setErrors({ minlength: { requiredLength: 6 } });
      }
      if (this.isProductionUserForm() && !this.userForm.value.productionAreaIds?.length) {
        this.userForm.controls.productionAreaIds.setErrors({ required: true });
      }
      if (this.userForm.invalid || !this.userForm.value.roleIds?.length) return this.userForm.markAllAsTouched();
      this.saving.set(true);
      const raw = this.userForm.getRawValue();
      const payload: Record<string, unknown> = {
        ...raw,
        email: raw.email.trim() || (id ? null : undefined),
        phone: raw.phone || undefined,
      };
      if (id) delete payload['password'];
      else delete payload['status'];
      const request = id
        ? this.http.patch<User>(`/api/users/${id}`, payload)
        : this.http.post<User>('/api/users', payload);
      request.subscribe({
        next: (user) => {
          this.saving.set(false);
          this.userDialog.set(false);
          this.toast('success', id ? 'Usuario actualizado' : 'Usuario creado', user.name);
          this.loadUsers(id ? this.userMeta().page : 1);
        },
        error: (error) => this.handleSaveError(error),
      });
    }
}
