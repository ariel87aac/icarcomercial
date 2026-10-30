import { workflowLabel } from '../../../../pedidos/dominio/order-workflow';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, input, signal } from '@angular/core';
import { FormArray, FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { PaginatorModule, PaginatorState } from 'primeng/paginator';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import * as L from 'leaflet';
import { AuthService } from '../../../../../nucleo/autenticacion/auth.service';
import {
  DistributionRoute,
  DistributionRouteStatus,
  EligibleOrder,
  FactoryDeliveryCompletion,
  OrderPreparation,
  OrderPreparationDetail,
  Paginated,
  PendingDistributionPreparation,
  PreparationWorkOrder,
  PreparationStatus,
  ProductPresentation,
  RouteDelivery,
  User,
  Vehicle,
  VisitResultType,
  Zone,
} from '../../../../../compartido/modelos';

type DistributionView = 'preparations' | 'pending' | 'vehicles' | 'weights' | 'routes' | 'assigned' | 'summary';

import { Directive } from '@angular/core';
import { DistributionContratos02 } from './distribution.contratos-02';

@Directive()
export abstract class DistributionBase extends DistributionContratos02 {
protected readonly http = inject(HttpClient);

  protected readonly fb = inject(FormBuilder);

  protected readonly messages = inject(MessageService);

  protected readonly auth = inject(AuthService);

  readonly mode = input<'warehouse'|'distribution'>('distribution');

  protected map: L.Map | null = null;

  protected searchTimer?: ReturnType<typeof setTimeout>;

  protected weightSearchTimer?: ReturnType<typeof setTimeout>;

  protected readonly view = signal<DistributionView>('preparations');

  protected readonly loading = signal(false);

  protected readonly saving = signal(false);

  protected readonly dateFilter = signal('');

  protected readonly zoneFilter = signal<string | null>(null);

  protected readonly routeStatusFilter = signal<DistributionRouteStatus | null>(null);

  protected readonly searchFilter = signal('');

  protected readonly pendingPage = signal(1);

  protected readonly eligiblePage = signal(1);

  protected readonly preparationPage = signal(1);

  protected readonly vehiclePage = signal(1);

  protected readonly routePage = signal(1);

  protected readonly summaryPage = signal(1);

  protected readonly weightPage = signal(1);

  protected readonly pageSize = signal(25);

  protected readonly pendingMeta = signal({ page: 1, limit: 25, total: 0, totalPages: 1 });

  protected readonly eligibleMeta = signal({ page: 1, limit: 25, total: 0, totalPages: 1 });

  protected readonly preparationMeta = signal({ page: 1, limit: 25, total: 0, totalPages: 1 });

  protected readonly vehicleMeta = signal({ page: 1, limit: 25, total: 0, totalPages: 1 });

  protected readonly routeMeta = signal({ page: 1, limit: 25, total: 0, totalPages: 1 });

  protected readonly summaryMeta = signal({ page: 1, limit: 25, total: 0, totalPages: 1 });

  protected readonly weightMeta = signal({ page: 1, limit: 25, total: 0, totalPages: 1 });

  protected readonly workOrders = signal<PreparationWorkOrder[]>([]);

  protected readonly pendingPreparations = signal<PendingDistributionPreparation[]>([]);

  protected readonly selectedPendingPreparations = signal<PendingDistributionPreparation[]>([]);

  protected readonly preparations = signal<OrderPreparation[]>([]);

  protected readonly vehicles = signal<Vehicle[]>([]);

  protected readonly allVehicles = signal<Vehicle[]>([]);

  protected readonly zones = signal<Zone[]>([]);

  protected readonly responsibles = signal<User[]>([]);

  protected readonly routes = signal<DistributionRoute[]>([]);

  protected readonly assignedRoutes = signal<DistributionRoute[]>([]);

  protected readonly summaryRoutes = signal<DistributionRoute[]>([]);

  protected readonly weightItems = signal<ProductPresentation[]>([]);

  protected readonly weightDrafts = signal<Record<string, number | null>>({});

  protected readonly weightSearch = signal('');

  protected readonly missingWeightsOnly = signal(true);

  protected readonly preparedOptions = signal<Array<{ id: string; label: string }>>([]);

  protected readonly selectedPreparationIds = signal<string[]>([]);

  protected readonly selectedPreparation = signal<OrderPreparation | null>(null);

  protected readonly selectedRoute = signal<DistributionRoute | null>(null);

  protected readonly selectedDelivery = signal<RouteDelivery | null>(null);

  protected readonly preparationDialog = signal(false);

  protected readonly vehicleDialog = signal(false);

  protected readonly routeDialog = signal(false);

  protected readonly routeDetailDialog = signal(false);

  protected readonly assignedDialog = signal(false);

  protected readonly visitDialog = signal(false);

  protected readonly settlementDialog = signal(false);

  protected readonly preparationCancelDialog = signal(false);

  protected readonly routeRescheduleDialog = signal(false);

  protected readonly routeCancelDialog = signal(false);

  protected readonly editingVehicleId = signal<string | null>(null);

  protected readonly settlementLabels = signal<string[]>([]);

  protected readonly settlementMaximums = signal<number[]>([]);

  protected readonly routeVehicleId = signal<string | null>(null);

  protected readonly routeDraftPreparations = signal<PendingDistributionPreparation[]>([]);

  protected readonly preparationStatuses = [
      { label: 'Pendiente', value: 'PENDIENTE' }, { label: 'En preparación', value: 'EN_PREPARACION' },
      { label: 'Observada', value: 'OBSERVADA' }, { label: 'Preparada', value: 'PREPARADA' },
      { label: 'Asignada', value: 'ASIGNADA' }, { label: 'Despachada', value: 'DESPACHADA' },
      { label: 'Cancelada', value: 'CANCELADA' },
    ];

  protected readonly routeStatuses = [
      { label: 'Borrador', value: 'BORRADOR' }, { label: 'Planificada', value: 'PLANIFICADA' },
      { label: 'En reparto', value: 'EN_REPARTO' }, { label: 'Finalizada', value: 'FINALIZADA' },
      { label: 'Liquidada', value: 'LIQUIDADA' }, { label: 'Cancelada', value: 'CANCELADA' },
    ];

  protected readonly visitResults = [
      { label: 'Entregada', value: 'ENTREGADA' }, { label: 'Entrega parcial', value: 'ENTREGA_PARCIAL' },
      { label: 'No entregada', value: 'NO_ENTREGADA' },
    ];

  protected readonly recordStatuses = [{ label: 'Activo', value: 'ACTIVO' }, { label: 'Inactivo', value: 'INACTIVO' }];

  protected readonly preparationForm = this.fb.nonNullable.group({ details: this.fb.array([]) });

  protected readonly vehicleForm = this.fb.group({
      plate: ['', [Validators.required, Validators.minLength(3)]],
      description: ['', [Validators.required, Validators.minLength(3)]],
      capacityKg: [null as number | null, [Validators.required, Validators.min(0.001)]],
      status: ['ACTIVO'],
    });

  protected readonly routeForm = this.fb.nonNullable.group({
      date: ['', Validators.required], zoneId: ['', Validators.required], vehicleId: ['', Validators.required],
      responsibleIds: [[] as string[], Validators.required], principalResponsibleId: ['', Validators.required], observation: [''],
    });

  protected readonly visitForm = this.fb.nonNullable.group({ result: ['ENTREGADA' as VisitResultType, Validators.required], observation: [''], details: this.fb.array([]) });

  protected readonly settlementForm = this.fb.nonNullable.group({ observation: [''], returns: this.fb.array([]) });

  protected readonly reasonForm = this.fb.nonNullable.group({ reason: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(1000)]] });

  protected readonly rescheduleForm = this.fb.nonNullable.group({ date: ['', Validators.required], reason: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(1000)]] });

  protected readonly workflowLabel=workflowLabel;
}
