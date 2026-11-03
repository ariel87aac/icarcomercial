import { describe, expect, it, vi } from 'vitest';
import { RecordStatus } from '../../compartido/enumeraciones/record-status.enum';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { UserType } from '../seguridad/usuarios/entidades/user-type.enum';
import { Zone } from './entidades/zone.entity';
import { ZonesService } from './zones.service';

const actor = {
  id: 'actor-1',
  sessionId: 'session-1',
  name: 'Administrador',
  email: null,
  username: 'admin',
  mustChangePassword: false,
  type: UserType.INTERNAL,
  customerId: null,
  roles: ['ADMINISTRADOR'],
  permissions: ['zones.delete'],
  productionAreaIds: [],
} satisfies AuthenticatedUser;

function setup(status = RecordStatus.ACTIVE) {
  const zone = {
    id: 'zone-1',
    name: 'Zona de prueba',
    status,
    distributionDays: [{ id: 'day-1' }, { id: 'day-2' }],
  } as Zone;
  const zoneRepository = {
    findOne: vi.fn().mockResolvedValue(zone),
    update: vi.fn().mockResolvedValue(undefined),
  };
  const auditService = { record: vi.fn().mockResolvedValue(undefined) };
  const service = new ZonesService(
    zoneRepository as never,
    {} as never,
    auditService as never,
  );
  return { service, zone, zoneRepository, auditService };
}

describe('ZonesService.remove', () => {
  it('inactiva la zona sin eliminar sus relaciones y registra la auditoría', async () => {
    const { service, zone, zoneRepository, auditService } = setup();

    await expect(service.remove(zone.id, actor)).resolves.toEqual({
      id: zone.id,
      name: zone.name,
      status: RecordStatus.INACTIVE,
    });
    expect(zoneRepository.update).toHaveBeenCalledWith(zone.id, {
      status: RecordStatus.INACTIVE,
    });
    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'DESACTIVAR_ZONA',
      entityId: zone.id,
      metadata: expect.objectContaining({
        name: zone.name,
        distributionDays: 2,
        status: RecordStatus.INACTIVE,
      }),
    }));
  });

  it('mantiene idempotente la acción cuando la zona ya está inactiva', async () => {
    const { service, zone, zoneRepository, auditService } = setup(RecordStatus.INACTIVE);

    await expect(service.remove(zone.id, actor)).resolves.toEqual({
      id: zone.id,
      name: zone.name,
      status: RecordStatus.INACTIVE,
    });
    expect(zoneRepository.update).not.toHaveBeenCalled();
    expect(auditService.record).not.toHaveBeenCalled();
  });
});

describe('ZonesService.removeDay', () => {
  it('inactiva el día, conserva el registro y audita la operación', async () => {
    const day = { id: 'day-1', zoneId: 'zone-1', weekday: 2, status: RecordStatus.ACTIVE };
    const dayRepository = {
      findOne: vi.fn().mockResolvedValue(day),
      update: vi.fn().mockResolvedValue(undefined),
    };
    const auditService = { record: vi.fn().mockResolvedValue(undefined) };
    const service = new ZonesService({} as never, dayRepository as never, auditService as never);

    await expect(service.removeDay(day.zoneId, day.id, actor)).resolves.toEqual({
      id: day.id,
      status: RecordStatus.INACTIVE,
    });
    expect(dayRepository.update).toHaveBeenCalledWith(day.id, { status: RecordStatus.INACTIVE });
    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'DESACTIVAR_DIA_DISTRIBUCION',
      entityId: day.id,
      metadata: expect.objectContaining({ zoneId: day.zoneId, weekday: day.weekday }),
    }));
  });

  it('mantiene idempotente la baja si el día ya estaba inactivo', async () => {
    const day = { id: 'day-1', zoneId: 'zone-1', weekday: 2, status: RecordStatus.INACTIVE };
    const dayRepository = {
      findOne: vi.fn().mockResolvedValue(day),
      update: vi.fn(),
    };
    const auditService = { record: vi.fn() };
    const service = new ZonesService({} as never, dayRepository as never, auditService as never);

    await expect(service.removeDay(day.zoneId, day.id, actor)).resolves.toEqual({
      id: day.id,
      status: RecordStatus.INACTIVE,
    });
    expect(dayRepository.update).not.toHaveBeenCalled();
    expect(auditService.record).not.toHaveBeenCalled();
  });
});

describe('ZonesService.addDay', () => {
  it('reactiva el mismo día inactivo con el horario nuevo', async () => {
    const zone = { id: 'zone-1', name: 'Centro', distributionDays: [] } as unknown as Zone;
    const day = {
      id: 'day-1', zoneId: zone.id, weekday: 3, startTime: '08:00', endTime: '12:00', status: RecordStatus.INACTIVE,
    };
    const zoneRepository = { findOne: vi.fn().mockResolvedValue(zone) };
    const dayRepository = {
      findOne: vi.fn().mockResolvedValue(day),
      save: vi.fn().mockImplementation(async (value) => value),
    };
    const auditService = { record: vi.fn().mockResolvedValue(undefined) };
    const service = new ZonesService(zoneRepository as never, dayRepository as never, auditService as never);

    await service.addDay(zone.id, { weekday: 3, startTime: '09:00', endTime: '16:00' }, actor);

    expect(dayRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      id: day.id,
      startTime: '09:00',
      endTime: '16:00',
      status: RecordStatus.ACTIVE,
    }));
    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'REACTIVAR_DIA_DISTRIBUCION',
      entityId: day.id,
    }));
  });
});
