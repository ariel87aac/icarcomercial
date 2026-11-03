import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { AuditEvent } from '../seguridad/auditoria/entidades/audit-event.entity';
import { UserType } from '../seguridad/usuarios/entidades/user-type.enum';
import { Zone } from '../zonas-reparto/entidades/zone.entity';
import { DistributionRoute } from './entidades/distribution-route.entity';
import { VehicleDispatchStatus } from './entidades/distribution.enums';
import { VehicleDispatch } from './entidades/vehicle-dispatch.entity';
import { WarehouseReturnOrder } from './entidades/warehouse-return-order.entity';
import { VehicleDispatchService } from './vehicle-dispatch.service';

const actor = {
  id: 'actor-1', sessionId: 'session-1', name: 'Distribución', email: null, username: 'dist',
  mustChangePassword: false, type: UserType.INTERNAL, customerId: null, roles: ['DISTRIBUCION'],
  permissions: [], productionAreaIds: [],
} satisfies AuthenticatedUser;

function setup(status = VehicleDispatchStatus.PENDING, unfinishedRoutes = 0, pendingReturns = 0) {
  const dispatch = {
    id: 'dispatch-1', code: 1, vehicleId: 'vehicle-1', responsibleId: 'user-1', status,
    initialOdometer: status === VehicleDispatchStatus.PENDING ? null : '1000.0',
    vehicle: { plate: 'ABC-123', status: 'ACTIVO' }, responsible: { name: 'Repartidor', status: 'ACTIVO' }, zones: [{ id: 'zone-1', status: 'ACTIVO' }],
  } as unknown as VehicleDispatch;
  const lockBuilder = {
    setLock: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    getOne: vi.fn().mockResolvedValue(dispatch),
  };
  const dispatchRepository = {
    createQueryBuilder: vi.fn().mockReturnValue(lockBuilder),
    save: vi.fn().mockImplementation(async (value) => value),
    findOne: vi.fn().mockResolvedValue(dispatch),
  };
  const routeRepository = { count: vi.fn().mockResolvedValue(unfinishedRoutes) };
  const returnBuilder = {
    innerJoin: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(), getCount: vi.fn().mockResolvedValue(pendingReturns),
  };
  const returnRepository = { createQueryBuilder: vi.fn().mockReturnValue(returnBuilder) };
  const zoneRepository = { find: vi.fn().mockResolvedValue(dispatch.zones) };
  const auditRepository = {
    create: vi.fn().mockImplementation((value) => value),
    save: vi.fn().mockResolvedValue(undefined),
  };
  const repository = (entity: unknown) => entity === VehicleDispatch ? dispatchRepository : entity === DistributionRoute ? routeRepository : entity === WarehouseReturnOrder ? returnRepository : entity === Zone ? zoneRepository : entity === AuditEvent ? auditRepository : {};
  const manager = { getRepository: vi.fn(repository) };
  const dataSource = {
    transaction: vi.fn(async (work) => work(manager)),
    getRepository: vi.fn(repository),
    query: vi.fn().mockResolvedValue([{ dispatch_id: dispatch.id, route_count: '0', assigned_orders: '0', delivered_orders: '0', pending_orders: '0', pending_returns: '0', open_routes: '0' }]),
  };
  return { service: new VehicleDispatchService(dataSource as never), dispatch, dispatchRepository, routeRepository, returnBuilder, zoneRepository, auditRepository };
}

describe('VehicleDispatchService', () => {
  it('activa la asignación al entregar el vehículo con kilometraje inicial', async () => {
    const { service, dispatch, auditRepository } = setup();

    await service.handover(dispatch.id, { initialOdometer: 1250.5, observation: 'Sin novedad' }, actor);

    expect(dispatch.status).toBe(VehicleDispatchStatus.ACTIVE);
    expect(dispatch.initialOdometer).toBe('1250.5');
    expect(dispatch.handedOverById).toBe(actor.id);
    expect(auditRepository.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'ENTREGAR_VEHICULO_DISTRIBUCION' }));
  });

  it('impide devolver el vehículo mientras existan rutas abiertas', async () => {
    const { service, dispatch } = setup(VehicleDispatchStatus.ACTIVE, 2);

    await expect(service.returnVehicle(dispatch.id, { finalOdometer: 1300 }, actor))
      .rejects.toThrow(new ConflictException('Existen 2 ruta(s) que aún no fueron liquidadas o canceladas'));
  });

  it('impide cerrar el despacho mientras Almacén tenga devoluciones pendientes', async () => {
    const { service, dispatch } = setup(VehicleDispatchStatus.ACTIVE, 0, 1);

    await expect(service.returnVehicle(dispatch.id, { finalOdometer: 1300 }, actor))
      .rejects.toThrow(new ConflictException('Almacén debe recibir 1 retorno(s) antes de devolver el vehículo'));
  });

  it('permite agregar zonas sin modificar vehículo ni distribuidor', async () => {
    const { service, dispatch, zoneRepository, auditRepository } = setup();
    const newZone = { id: 'zone-2', status: 'ACTIVO' };
    zoneRepository.find.mockResolvedValue([dispatch.zones[0], newZone]);

    const result = await service.updateZones(dispatch.id, { zoneIds: ['zone-1', 'zone-2'] }, actor);

    expect(result.vehicleId).toBe('vehicle-1');
    expect(result.responsibleId).toBe('user-1');
    expect(result.zones.map((zone) => zone.id)).toEqual(['zone-1', 'zone-2']);
    expect(auditRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      action: 'ACTUALIZAR_ZONAS_DESPACHO_VEHICULO',
      metadata: expect.objectContaining({ addedZoneIds: ['zone-2'] }),
    }));
  });

  it('impide quitar una zona que todavía tiene rutas abiertas', async () => {
    const { service, dispatch, zoneRepository } = setup(VehicleDispatchStatus.ACTIVE, 1);
    const secondZone = { id: 'zone-2', status: 'ACTIVO' };
    dispatch.zones.push(secondZone as never);
    zoneRepository.find.mockResolvedValue([secondZone] as never);

    await expect(service.updateZones(dispatch.id, { zoneIds: ['zone-2'] }, actor))
      .rejects.toThrow(new ConflictException('No puede quitar una zona que tiene rutas abiertas en este despacho'));
  });

  it('conserva sin edición las zonas de un vehículo ya devuelto', async () => {
    const { service, dispatch } = setup(VehicleDispatchStatus.RETURNED);

    await expect(service.updateZones(dispatch.id, { zoneIds: ['zone-1'] }, actor))
      .rejects.toThrow(new ConflictException('No se pueden modificar las zonas de un vehículo devuelto'));
  });

  it('registra kilometraje final y libera la asignación', async () => {
    const { service, dispatch, auditRepository } = setup(VehicleDispatchStatus.ACTIVE);

    await service.returnVehicle(dispatch.id, { finalOdometer: 1325.7, observation: 'Retorno normal' }, actor);

    expect(dispatch.status).toBe(VehicleDispatchStatus.RETURNED);
    expect(dispatch.finalOdometer).toBe('1325.7');
    expect(dispatch.returnRegisteredById).toBe(actor.id);
    expect(auditRepository.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'REGISTRAR_DEVOLUCION_VEHICULO' }));
  });
});
