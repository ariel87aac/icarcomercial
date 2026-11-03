import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { AuditEvent } from '../seguridad/auditoria/entidades/audit-event.entity';
import { UserType } from '../seguridad/usuarios/entidades/user-type.enum';
import { DistributionRoute } from './entidades/distribution-route.entity';
import { VehicleDispatchStatus } from './entidades/distribution.enums';
import { VehicleDispatch } from './entidades/vehicle-dispatch.entity';
import { VehicleDispatchService } from './vehicle-dispatch.service';

const actor = {
  id: 'actor-1', sessionId: 'session-1', name: 'Distribución', email: null, username: 'dist',
  mustChangePassword: false, type: UserType.INTERNAL, customerId: null, roles: ['DISTRIBUCION'],
  permissions: [], productionAreaIds: [],
} satisfies AuthenticatedUser;

function setup(status = VehicleDispatchStatus.PENDING, unfinishedRoutes = 0) {
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
  const auditRepository = {
    create: vi.fn().mockImplementation((value) => value),
    save: vi.fn().mockResolvedValue(undefined),
  };
  const repository = (entity: unknown) => entity === VehicleDispatch ? dispatchRepository : entity === DistributionRoute ? routeRepository : entity === AuditEvent ? auditRepository : {};
  const manager = { getRepository: vi.fn(repository) };
  const dataSource = {
    transaction: vi.fn(async (work) => work(manager)),
    getRepository: vi.fn(repository),
  };
  return { service: new VehicleDispatchService(dataSource as never), dispatch, dispatchRepository, routeRepository, auditRepository };
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
      .rejects.toThrow(new ConflictException('Existen 2 ruta(s) sin finalizar o cancelar para esta asignación'));
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
