import { HttpParams } from '@angular/common/http';
import { Directive } from '@angular/core';
import { PaginatorState } from 'primeng/paginator';
import { Paginated, Vehicle, VehicleDispatch } from '../../../../../compartido/modelos';
import { DistributionParte01 } from './distribution.01-preparationDetails';

type RouteVehicleDispatchOption = VehicleDispatch & { zoneUnavailable: boolean };

@Directive()
export abstract class DistributionVehicleDispatches extends DistributionParte01 {
  protected downloadVehicleReport(vehicle: Vehicle): void {
    this.reportVehicleId.set(vehicle.id);
    this.http.get(`/api/vehicle-dispatches/vehicle/${vehicle.id}/report`, { observe: 'response', responseType: 'blob' }).subscribe({
      next: (response) => {
        const disposition = response.headers.get('content-disposition') ?? '';
        const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? `icar-vehiculo-${vehicle.plate}.pdf`;
        const url = URL.createObjectURL(response.body ?? new Blob([], { type: 'application/pdf' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
        this.reportVehicleId.set(null);
        this.messages.add({ severity: 'success', summary: 'Reporte generado', detail: `Historial del vehículo ${vehicle.plate}.` });
      },
      error: (error) => { this.reportVehicleId.set(null); this.fail(error); },
    });
  }

  protected override loadVehicleDispatches(): void {
    this.loading.set(true);
    let params = new HttpParams().set('page', this.dispatchPage()).set('limit', this.pageSize());
    if (this.dispatchSearch().trim()) params = params.set('q', this.dispatchSearch().trim());
    if (this.dispatchStatusFilter()) params = params.set('status', this.dispatchStatusFilter()!);
    this.http.get<Paginated<VehicleDispatch>>('/api/vehicle-dispatches', { params }).subscribe({
      next: (response) => { this.vehicleDispatches.set(response.data); this.dispatchMeta.set(response.meta); this.loading.set(false); },
      error: (error) => this.fail(error),
    });
  }

  protected override loadActiveVehicleDispatches(): void {
    this.http.get<VehicleDispatch[]>('/api/vehicle-dispatches/active-options').subscribe({
      next: (items) => this.activeVehicleDispatches.set(items),
      error: (error) => this.fail(error),
    });
  }

  protected override openVehicleDispatch(): void {
    this.dispatchForm.reset({ vehicleId: '', responsibleId: '', zoneIds: [] });
    this.dispatchDialog.set(true);
  }

  protected override createVehicleDispatch(): void {
    if (this.dispatchForm.invalid) return this.dispatchForm.markAllAsTouched();
    this.saving.set(true);
    this.http.post<VehicleDispatch>('/api/vehicle-dispatches', this.dispatchForm.getRawValue()).subscribe({
      next: (item) => { this.saving.set(false); this.dispatchDialog.set(false); this.saved('Asignación creada', `Despacho ${item.code}`); this.loadVehicleDispatches(); },
      error: (error) => this.failSave(error),
    });
  }

  protected override openDispatchZones(item: VehicleDispatch): void {
    this.selectedVehicleDispatch.set(item);
    this.dispatchZonesForm.reset({ zoneIds: item.zones.map((zone) => zone.id) });
    this.dispatchZonesDialog.set(true);
  }

  protected override saveDispatchZones(): void {
    const item = this.selectedVehicleDispatch();
    if (!item || this.dispatchZonesForm.invalid) return this.dispatchZonesForm.markAllAsTouched();
    this.saving.set(true);
    this.http.put<VehicleDispatch>(`/api/vehicle-dispatches/${item.id}/zones`, this.dispatchZonesForm.getRawValue()).subscribe({
      next: (value) => {
        this.saving.set(false);
        this.dispatchZonesDialog.set(false);
        this.selectedVehicleDispatch.set(value);
        this.saved('Zonas actualizadas', `Despacho ${value.code}`);
        this.loadVehicleDispatches();
        this.loadActiveVehicleDispatches();
      },
      error: (error) => this.failSave(error),
    });
  }

  protected override openDispatchHandover(item: VehicleDispatch): void {
    this.selectedVehicleDispatch.set(item);
    this.dispatchHandoverForm.reset({ initialOdometer: null, observation: '' });
    this.dispatchHandoverDialog.set(true);
  }

  protected override handoverVehicleDispatch(): void {
    const item = this.selectedVehicleDispatch();
    if (!item || this.dispatchHandoverForm.invalid) return this.dispatchHandoverForm.markAllAsTouched();
    this.saving.set(true);
    this.http.post<VehicleDispatch>(`/api/vehicle-dispatches/${item.id}/handover`, this.dispatchHandoverForm.getRawValue()).subscribe({
      next: (value) => { this.saving.set(false); this.dispatchHandoverDialog.set(false); this.saved('Vehículo entregado', `${value.vehicle.plate} · ${value.responsible.name}`); this.loadVehicleDispatches(); this.loadActiveVehicleDispatches(); },
      error: (error) => this.failSave(error),
    });
  }

  protected override openDispatchReturn(item: VehicleDispatch): void {
    if (!item.canClose) {
      return this.messages.add({ severity: 'warn', summary: 'Devolución pendiente', detail: item.closeBlockReason || 'Complete todas las rutas antes de devolver el vehículo.' });
    }
    this.selectedVehicleDispatch.set(item);
    this.dispatchReturnForm.reset({ finalOdometer: item.initialOdometer ? Number(item.initialOdometer) : null, observation: '' });
    this.dispatchReturnDialog.set(true);
  }

  protected override returnVehicleDispatch(): void {
    const item = this.selectedVehicleDispatch();
    const raw = this.dispatchReturnForm.getRawValue();
    if (!item || this.dispatchReturnForm.invalid) return this.dispatchReturnForm.markAllAsTouched();
    if (Number(raw.finalOdometer) < Number(item.initialOdometer)) return this.messages.add({ severity: 'warn', summary: 'Kilometraje inválido', detail: 'El kilometraje final no puede ser menor al inicial.' });
    this.saving.set(true);
    this.http.post<VehicleDispatch>(`/api/vehicle-dispatches/${item.id}/return`, raw).subscribe({
      next: (value) => { this.saving.set(false); this.dispatchReturnDialog.set(false); this.saved('Vehículo devuelto', `${this.number(Number(value.finalOdometer)-Number(value.initialOdometer))} km recorridos`); this.loadVehicleDispatches(); this.loadActiveVehicleDispatches(); },
      error: (error) => this.failSave(error),
    });
  }

  protected override availableVehicleDispatches(): VehicleDispatch[] {
    const zoneId = this.routeForm.controls.zoneId.value;
    return this.activeVehicleDispatches().filter((item) => !zoneId || item.zones.some((zone) => zone.id === zoneId));
  }

  protected routeVehicleDispatchOptions(): RouteVehicleDispatchOption[] {
    const availableIds = new Set(this.availableVehicleDispatches().map((item) => item.id));
    return this.activeVehicleDispatches().map((item) => ({ ...item, zoneUnavailable: !availableIds.has(item.id) }));
  }

  protected selectedRouteZoneName(): string {
    const zoneId = this.routeForm.controls.zoneId.value;
    return this.zones().find((zone) => zone.id === zoneId)?.name ?? 'seleccionada';
  }

  protected override onRouteZoneChange(): void {
    const current = this.routeForm.controls.vehicleDispatchId.value;
    if (!this.availableVehicleDispatches().some((item) => item.id === current)) this.onRouteDispatchChange(null);
  }

  protected override onRouteDispatchChange(id: string | null): void {
    this.routeForm.controls.vehicleDispatchId.setValue(id ?? '');
  }

  protected override dispatchStatusLabel(value: string): string {
    return value === 'PENDIENTE' ? 'Pendiente de entrega' : value === 'ACTIVO' ? 'En custodia' : 'Devuelto';
  }

  protected override dispatchStatusSeverity(value: string): 'info'|'warn'|'success'|'secondary' {
    return value === 'ACTIVO' ? 'success' : value === 'PENDIENTE' ? 'warn' : 'secondary';
  }

  protected override changeDispatchPage(event: PaginatorState): void {
    this.applyPageSize(event);
    this.dispatchPage.set((event.page ?? 0) + 1);
    this.loadVehicleDispatches();
  }
}
