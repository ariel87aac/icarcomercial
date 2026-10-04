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
import { AuthService } from './core/auth.service';
import {
  AuditEvent,
  Customer,
  CustomerAccount,
  CustomerAddress,
  Paginated,
  Permission,
  Role,
  User,
  Zone,
} from './core/models';

type Section =
  | 'dashboard'
  | 'customers'
  | 'accounts'
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

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    FormsModule,
    ButtonModule,
    CheckboxModule,
    DialogModule,
    InputNumberModule,
    InputTextModule,
    MessageModule,
    MultiSelectModule,
    PasswordModule,
    SelectModule,
    TableModule,
    TagModule,
    TextareaModule,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly messages = inject(MessageService);
  protected readonly auth = inject(AuthService);
  private initializedUserId: string | null = null;
  private map: L.Map | null = null;
  private coordinateMarker: L.CircleMarker | null = null;

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
  protected readonly permissions = signal<Permission[]>([]);
  protected readonly zones = signal<Zone[]>([]);
  protected readonly auditEvents = signal<AuditEvent[]>([]);
  protected readonly auditMeta = signal({ page: 1, total: 0, totalPages: 1 });

  protected readonly customerDialog = signal(false);
  protected readonly userDialog = signal(false);
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
  protected readonly selectedZone = signal<Zone | null>(null);
  protected readonly editingAddressId = signal<string | null>(null);

  protected readonly customerSearch = signal('');
  protected readonly customerTypeFilter = signal<string | null>(null);
  protected readonly customerStatusFilter = signal<string | null>(null);
  protected readonly customerZoneFilter = signal<string | null>(null);
  protected readonly customerDayFilter = signal<number | null>(null);
  protected readonly userSearch = signal('');
  protected readonly userStatusFilter = signal<string | null>(null);
  protected readonly auditModuleFilter = signal('');
  protected readonly auditActionFilter = signal('');
  protected readonly auditUserFilter = signal<string | null>(null);
  protected readonly auditEntityFilter = signal('');
  protected readonly auditResultFilter = signal<string | null>(null);
  protected readonly auditFromFilter = signal('');
  protected readonly auditToFilter = signal('');

  protected readonly navigation: NavigationItem[] = [
    { id: 'dashboard', label: 'Resumen', icon: 'pi pi-home' },
    { id: 'customers', label: 'Clientes', icon: 'pi pi-users', permission: 'customers.read' },
    {
      id: 'accounts',
      label: 'Cuentas de clientes',
      icon: 'pi pi-address-book',
      permission: 'customer_accounts.create',
    },
    { id: 'zones', label: 'Zonas y reparto', icon: 'pi pi-map', permission: 'zones.read' },
    { id: 'users', label: 'Usuarios', icon: 'pi pi-user-edit', permission: 'users.read' },
    { id: 'roles', label: 'Roles y permisos', icon: 'pi pi-shield', permission: 'roles.read' },
    { id: 'audit', label: 'Auditoría', icon: 'pi pi-history', permission: 'audit.read' },
  ];

  protected readonly statusOptions = [
    { label: 'Activo', value: 'ACTIVO' },
    { label: 'Inactivo', value: 'INACTIVO' },
  ];
  protected readonly customerTypeOptions = [
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
    username: ['', [Validators.required, Validators.pattern(/^[a-zA-Z0-9._-]{3,80}$/)]],
    email: ['', [Validators.required, Validators.email]],
    phone: [''],
    password: [''],
    roleIds: [[] as string[], Validators.required],
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
    newPassword: ['', [Validators.required, Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,72}$/)]],
  });
  protected readonly accountForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    username: [
      '',
      [Validators.required, Validators.pattern(/^[a-zA-Z0-9._-]{3,80}$/)],
    ],
    email: ['', [Validators.required, Validators.email]],
    phone: [''],
    password: [
      '',
      [
        Validators.required,
        Validators.pattern(
          /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,72}$/,
        ),
      ],
    ],
    isPrimary: [false],
  });

  constructor() {
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

  ngOnInit(): void {
    this.auth.restore();
  }

  ngOnDestroy(): void {
    this.destroyMap();
  }

  protected submitLogin(): void {
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

  protected logout(): void {
    this.auth.logout().subscribe({
      next: () => this.activeSection.set('dashboard'),
      error: () => {
        this.auth.clear();
        this.activeSection.set('dashboard');
      },
    });
  }

  protected can(permission?: string): boolean {
    return !permission || this.auth.can(permission);
  }

  protected selectSection(section: Section): void {
    this.activeSection.set(section);
    this.sidebarOpen.set(false);
    if (section === 'customers') this.loadCustomers(1);
    if (section === 'accounts') this.loadCustomers(1);
    if (section === 'users') this.loadUsers(1);
    if (section === 'roles') this.loadRoles();
    if (section === 'zones') this.loadZones();
    if (section === 'audit') this.loadAudit(1);
  }

  protected sectionTitle(): string {
    return this.navigation.find((item) => item.id === this.activeSection())?.label ?? 'Sistema comercial';
  }

  private loadReferenceData(): void {
    if (this.can('roles.read')) {
      this.loadRoles();
      this.http.get<Permission[]>('/api/permissions').subscribe({ next: (items) => this.permissions.set(items) });
    }
    if (this.can('zones.read')) this.loadZones();
  }

  private loadDashboard(): void {
    if (this.can('customers.read')) this.loadCustomers(1);
    if (this.can('users.read')) this.loadUsers(1);
    if (this.can('audit.read')) this.loadAudit(1);
  }

  protected loadCustomers(page = this.customerMeta().page): void {
    this.loading.set(true);
    let params = new HttpParams().set('page', page).set('limit', 20);
    if (this.customerSearch().trim()) params = params.set('q', this.customerSearch().trim());
    if (this.customerTypeFilter()) params = params.set('type', this.customerTypeFilter()!);
    if (this.customerStatusFilter()) params = params.set('status', this.customerStatusFilter()!);
    if (this.customerZoneFilter()) params = params.set('zoneId', this.customerZoneFilter()!);
    if (this.customerDayFilter()) params = params.set('weekday', this.customerDayFilter()!);
    this.http.get<Paginated<Customer>>('/api/customers', { params }).subscribe({
      next: (response) => {
        this.customers.set(response.data);
        this.customerMeta.set({ page: response.meta.page, total: response.meta.total, totalPages: response.meta.totalPages });
        this.loading.set(false);
      },
      error: (error) => this.handleLoadError(error),
    });
  }

  protected clearCustomerFilters(): void {
    this.customerSearch.set('');
    this.customerTypeFilter.set(null);
    this.customerStatusFilter.set(null);
    this.customerZoneFilter.set(null);
    this.customerDayFilter.set(null);
    this.loadCustomers(1);
  }

  protected openCustomer(customer?: Customer): void {
    this.editingCustomerId.set(customer?.id ?? null);
    this.customerForm.reset({
      type: customer?.type ?? 'MINORISTA',
      businessName: customer?.businessName ?? '',
      taxId: customer?.taxId ?? '',
      contactName: customer?.contactName ?? '',
      phone: customer?.phone ?? '',
      whatsapp: customer?.whatsapp ?? '',
      email: customer?.email ?? '',
      paymentCondition: customer?.paymentCondition ?? 'CONTADO',
      creditLimit: Number(customer?.creditLimit ?? 0),
      creditDays: customer?.creditDays ?? 0,
      status: customer?.status ?? 'ACTIVO',
    });
    this.customerDialog.set(true);
  }

  protected saveCustomer(): void {
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

  protected loadUsers(page = this.userMeta().page): void {
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

  protected openUser(user?: User): void {
    this.editingUserId.set(user?.id ?? null);
    this.userForm.reset({
      name: user?.name ?? '',
      username: user?.username ?? '',
      email: user?.email ?? '',
      phone: user?.phone ?? '',
      password: '',
      roleIds: user?.roles.map((role) => role.id) ?? [],
      status: user?.status ?? 'ACTIVO',
    });
    this.userDialog.set(true);
  }

  protected saveUser(): void {
    const id = this.editingUserId();
    if (!id && !this.userForm.value.password?.match(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,72}$/)) {
      this.userForm.controls.password.setErrors({ strongPassword: true });
    }
    if (this.userForm.invalid || !this.userForm.value.roleIds?.length) return this.userForm.markAllAsTouched();
    this.saving.set(true);
    const raw = this.userForm.getRawValue();
    const payload: Record<string, unknown> = { ...raw, phone: raw.phone || undefined };
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

  protected openPasswordReset(user: User): void {
    this.editingUserId.set(user.id);
    this.passwordForm.reset({ newPassword: '' });
    this.passwordDialog.set(true);
  }

  protected resetPassword(): void {
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

  protected loadRoles(): void {
    this.http.get<Role[]>('/api/roles').subscribe({
      next: (items) => this.roles.set(items),
      error: (error) => this.handleLoadError(error),
    });
  }

  protected openRole(role?: Role): void {
    this.editingRoleId.set(role?.id ?? null);
    this.roleForm.reset({
      name: role?.name ?? '',
      description: role?.description ?? '',
      permissionIds: role?.permissions.map((permission) => permission.id) ?? [],
      status: role?.status ?? 'ACTIVO',
    });
    this.roleDialog.set(true);
  }

  protected saveRole(): void {
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

  protected loadZones(): void {
    this.http.get<Zone[]>('/api/zones').subscribe({
      next: (items) => this.zones.set(items),
      error: (error) => this.handleLoadError(error),
    });
  }

  protected openZone(zone?: Zone): void {
    this.editingZoneId.set(zone?.id ?? null);
    this.zoneForm.reset({
      name: zone?.name ?? '',
      description: zone?.description ?? '',
      status: zone?.status ?? 'ACTIVO',
    });
    this.zoneDialog.set(true);
  }

  protected saveZone(): void {
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

  protected openDay(zone: Zone): void {
    this.selectedZone.set(zone);
    this.dayForm.reset({ weekday: 1, startTime: '08:00', endTime: '17:00' });
    this.dayDialog.set(true);
  }

  protected saveDay(): void {
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

  protected openAddress(customer: Customer, address?: CustomerAddress): void {
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

  protected addressDays(): { label: string; value: string }[] {
    const zone = this.zones().find((item) => item.id === this.addressForm.controls.zoneId.value);
    return (zone?.distributionDays ?? [])
      .filter((day) => day.status === 'ACTIVO')
      .map((day) => ({ label: `${this.weekdayName(day.weekday)} · ${this.timeRange(day.startTime, day.endTime)}`, value: day.id }));
  }

  protected onAddressZoneChange(): void {
    const current = this.addressForm.controls.distributionDayId.value;
    if (!this.addressDays().some((item) => item.value === current)) {
      this.addressForm.controls.distributionDayId.setValue('');
    }
  }

  protected saveAddress(): void {
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

  protected openAccount(customer: Customer): void {
    this.selectedCustomer.set(customer);
    this.accountForm.reset({
      name: customer.contactName ?? customer.businessName,
      username: '',
      email: customer.email ?? '',
      phone: customer.phone,
      password: '',
      isPrimary: customer.userLinks.length === 0,
    });
    this.accountDialog.set(true);
  }

  protected saveAccount(): void {
    if (this.accountForm.invalid || !this.selectedCustomer()) {
      return this.accountForm.markAllAsTouched();
    }
    this.saving.set(true);
    const raw = this.accountForm.getRawValue();
    const payload = { ...raw, phone: raw.phone || undefined };
    this.http
      .post<CustomerAccount>(
        `/api/customers/${this.selectedCustomer()!.id}/users`,
        payload,
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

  protected setAccountStatus(
    customer: Customer,
    account: CustomerAccount,
  ): void {
    const status = account.status === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
    this.saving.set(true);
    this.http
      .patch<CustomerAccount>(
        `/api/customers/${customer.id}/users/${account.userId}`,
        { status },
      )
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.toast(
            'success',
            status === 'ACTIVO' ? 'Cuenta habilitada' : 'Cuenta deshabilitada',
            account.user.email,
          );
          this.loadCustomers(this.customerMeta().page);
        },
        error: (error) => this.handleSaveError(error),
      });
  }

  protected closeAddressDialog(): void {
    this.addressDialog.set(false);
    this.destroyMap();
  }

  private initializeMap(): void {
    this.destroyMap();
    const element = document.getElementById('address-map');
    if (!element) return;
    const latitude = this.addressForm.controls.latitude.value ?? -16.5;
    const longitude = this.addressForm.controls.longitude.value ?? -68.15;
    this.map = L.map(element, { zoomControl: true }).setView([latitude, longitude], this.addressForm.controls.latitude.value ? 16 : 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(this.map);
    if (this.addressForm.controls.latitude.value !== null) this.setMapCoordinates(latitude, longitude);
    this.map.on('click', (event: L.LeafletMouseEvent) => this.setMapCoordinates(event.latlng.lat, event.latlng.lng));
    window.setTimeout(() => this.map?.invalidateSize(), 50);
  }

  private setMapCoordinates(latitude: number, longitude: number): void {
    const roundedLat = Number(latitude.toFixed(6));
    const roundedLon = Number(longitude.toFixed(6));
    this.addressForm.patchValue({ latitude: roundedLat, longitude: roundedLon });
    if (this.coordinateMarker) this.coordinateMarker.setLatLng([roundedLat, roundedLon]);
    else if (this.map) {
      this.coordinateMarker = L.circleMarker([roundedLat, roundedLon], {
        radius: 9,
        color: '#003f7d',
        fillColor: '#ed1c24',
        fillOpacity: 1,
        weight: 3,
      }).addTo(this.map);
    }
  }

  private destroyMap(): void {
    this.map?.remove();
    this.map = null;
    this.coordinateMarker = null;
  }

  protected loadAudit(page = this.auditMeta().page): void {
    this.loading.set(true);
    let params = new HttpParams().set('page', page).set('limit', 20);
    if (this.auditModuleFilter().trim()) params = params.set('module', this.auditModuleFilter().trim());
    if (this.auditActionFilter().trim()) params = params.set('action', this.auditActionFilter().trim());
    if (this.auditUserFilter()) params = params.set('userId', this.auditUserFilter()!);
    if (this.auditEntityFilter().trim()) params = params.set('entity', this.auditEntityFilter().trim());
    if (this.auditResultFilter()) params = params.set('result', this.auditResultFilter()!);
    if (this.auditFromFilter()) params = params.set('from', new Date(`${this.auditFromFilter()}T00:00:00`).toISOString());
    if (this.auditToFilter()) params = params.set('to', new Date(`${this.auditToFilter()}T23:59:59.999`).toISOString());
    this.http.get<Paginated<AuditEvent>>('/api/audit-events', { params }).subscribe({
      next: (response) => {
        this.auditEvents.set(response.data);
        this.auditMeta.set({ page: response.meta.page, total: response.meta.total, totalPages: response.meta.totalPages });
        this.loading.set(false);
      },
      error: (error) => this.handleLoadError(error),
    });
  }

  protected weekdayName(weekday: number): string {
    return this.weekdayOptions.find((item) => item.value === weekday)?.label ?? `Día ${weekday}`;
  }

  protected timeRange(start: string | null, end: string | null): string {
    if (!start && !end) return 'Horario abierto';
    return `${start?.slice(0, 5) ?? '—'}–${end?.slice(0, 5) ?? '—'}`;
  }

  protected formatDate(value: string | null): string {
    if (!value) return 'Sin registro';
    return new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  }

  protected statusSeverity(status: string): 'success' | 'danger' | 'warn' | 'info' {
    if (status === 'ACTIVO' || status === 'EXITOSO') return 'success';
    if (status === 'INACTIVO' || status === 'RECHAZADO' || status === 'ERROR') return 'danger';
    return 'info';
  }

  protected customerTypeLabel(type: string): string {
    return this.customerTypeOptions.find((item) => item.value === type)?.label ?? type;
  }

  protected jsonPreview(value: Record<string, unknown>): string {
    const text = JSON.stringify(value);
    return text.length > 90 ? `${text.slice(0, 87)}…` : text;
  }

  private handleLoadError(error: unknown): void {
    this.loading.set(false);
    this.toast('error', 'No se pudo cargar la información', this.errorMessage(error));
  }

  private handleSaveError(error: unknown): void {
    this.saving.set(false);
    this.toast('error', 'No se pudo guardar', this.errorMessage(error));
  }

  private errorMessage(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) return 'Error inesperado';
    const message = error.error?.message;
    return Array.isArray(message) ? message.join('. ') : message || 'La solicitud no pudo completarse';
  }

  private toast(severity: 'success' | 'error' | 'info', summary: string, detail: string): void {
    this.messages.add({ severity, summary, detail, life: 4500 });
  }
}
