import { Customer, CustomerAccount, CustomerAddress, Role, User, Zone } from './compartido/modelos';

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
  | 'audit'
  | 'vehicles'
  | 'message-templates'
  | 'message-channel';

type OperationalStageKey = 'orders' | 'production' | 'preparation' | 'distribution';

import { Directive } from '@angular/core';

@Directive()
export abstract class AplicacionContratos01 {
  abstract ngOnInit(): void;

  abstract ngOnDestroy(): void;

  protected abstract submitLogin(): void;

  protected abstract changeRequiredPassword(): void;

  protected abstract logout(): void;

  protected abstract can(permission?: string): boolean;

  protected abstract selectSection(section: Section): void;

  protected abstract sectionTitle(): string;

  protected abstract readPublicTrackingToken(): string | null;

  protected abstract readPublicOrderConfirmationToken(): string | null;

  protected abstract loadReferenceData(): void;

  protected abstract loadDashboard(): void;

  protected abstract loadOperationalSummary(): void;

  protected abstract openOperationalStage(stage: OperationalStageKey): void;

  protected abstract loadCustomers(page: number): void;

  protected abstract onCustomerSearch(value: string): void;

  protected abstract applyCustomerFilter(filter: 'type' | 'status' | 'zone', value: string | null): void;

  protected abstract clearCustomerFilters(): void;

  protected abstract openCustomer(customer?: Customer): void;

  protected abstract openCustomerInfo(customer: Customer): void;

  protected abstract requestCustomerDeletion(customer: Customer): void;

  protected abstract closeCustomerDeletion(visible: boolean): void;

  protected abstract confirmCustomerDeletion(): void;

  protected abstract saveCustomer(): void;

  protected abstract loadUsers(page: number): void;

  protected abstract openUser(user?: User): void;

  protected abstract saveUser(): void;

  protected abstract isProductionUserForm(): boolean;

  protected abstract onUserRoleSelection(): void;

  protected abstract loadUserProductionAreas(): void;

  protected abstract requestUserDeletion(user: User): void;

  protected abstract closeUserDeletion(visible: boolean): void;

  protected abstract confirmUserDeletion(): void;

  protected abstract openPasswordReset(user: User): void;

  protected abstract resetPassword(): void;

  protected abstract loadRoles(): void;

  protected abstract openRole(role?: Role): void;

  protected abstract saveRole(): void;

  protected abstract loadZones(): void;

  protected abstract openZone(zone?: Zone): void;

  protected abstract saveZone(): void;

  protected abstract requestZoneDeletion(zone: Zone): void;

  protected abstract closeZoneDeletion(visible: boolean): void;

  protected abstract confirmZoneDeletion(): void;

  protected abstract openDay(zone: Zone): void;

  protected abstract saveDay(): void;

  protected abstract openAddress(customer: Customer, address?: CustomerAddress): void;

  protected abstract addressDays(): {
      label: string;
      value: string;
  }[];

  protected abstract onAddressZoneChange(): void;

  protected abstract saveAddress(): void;

  protected abstract setPrimaryAddress(customer: Customer, address: CustomerAddress): void;

  protected abstract inactivateAddress(customer: Customer, address: CustomerAddress): void;

  protected abstract openAccount(customer: Customer, account?: CustomerAccount): void;

  protected abstract saveAccount(): void;

  protected abstract setAccountStatus(customer: Customer, account: CustomerAccount): void;

  protected abstract openCustomerPasswordReset(customer: Customer, account: CustomerAccount): void;

  protected abstract closeAddressDialog(): void;

  protected abstract initializeMap(): void;

  protected abstract setMapCoordinates(latitude: number, longitude: number): void;

  protected abstract destroyMap(): void;

  protected abstract loadAudit(page: number): void;

  protected abstract weekdayName(weekday: number): string;

  protected abstract timeRange(start: string | null, end: string | null): string;

  protected abstract formatDate(value: string | null): string;

  protected abstract statusSeverity(status: string): 'success' | 'danger' | 'warn' | 'info';

  protected abstract customerTypeLabel(type: string): string;

  protected abstract jsonPreview(value: Record<string, unknown>): string;

  protected abstract handleLoadError(error: unknown): void;

  protected abstract handleSaveError(error: unknown): void;

  protected abstract errorMessage(error: unknown): string;

  protected abstract toast(severity: 'success' | 'error' | 'info', summary: string, detail: string): void;
}
