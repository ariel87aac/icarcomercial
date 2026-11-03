import 'reflect-metadata';
import { Provider } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AuditService } from '../seguridad/auditoria/audit.service';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { UserType } from '../seguridad/usuarios/entidades/user-type.enum';
import { TrackingService } from '../seguimiento-mensajeria/tracking.service';
import { ProductionModule } from './production.module';
import { ProductionService } from './production.service';
import { ProductionAccessPolicy } from './aplicacion/production-access.policy';
import { ProductionQueriesPort } from './aplicacion/puertos/production-queries-read.port';
import { GenerateProductionWritePort } from './aplicacion/puertos/generate-production-write.port';
import { ReceiveProductionWritePort } from './aplicacion/puertos/receive-production-write.port';
import { ProductionDeliveriesReadPort } from './aplicacion/puertos/production-deliveries-read.port';
import { ProductionDelivery } from './entidades/production-delivery.entity';
import { ProductionConsolidationDetail } from './entidades/production-consolidation-detail.entity';

const actor: AuthenticatedUser = {
  id: 'operator',
  sessionId: 'session',
  name: 'Operador',
  email: null,
  username: 'operator',
  mustChangePassword: false,
  type: UserType.INTERNAL,
  customerId: null,
  roles: ['PRODUCCION'],
  permissions: [],
  productionAreaIds: ['area-a'],
};
const modules: TestingModule[] = [];
async function setup() {
  const providers: Provider[] = Reflect.getMetadata('providers', ProductionModule);
  const module = await Test.createTestingModule({ providers })
    .useMocker((token) => {
      if (token === AuditService) return {};
      if (token === DataSource || (typeof token === 'string' && token.endsWith('Repository'))) return {};
      if (token === TrackingService) return { refreshStock: vi.fn().mockResolvedValue(undefined) };
      return undefined;
    })
    .compile();
  modules.push(module);
  return module;
}
afterEach(async () => {
  for (const module of modules.splice(0)) await module.close();
});

describe('composición y límites de Producción', () => {
  it('resuelve los proveedores reales sin herencia ni ciclos', async () => {
    const module = await setup();
    expect(module.get(ProductionService)).toBeInstanceOf(ProductionService);
  });
  it('no consulta un consolidado cuando su generación falla', async () => {
    const module = await setup();
    vi.spyOn(module.get(GenerateProductionWritePort), 'generate').mockRejectedValue(new Error('rollback'));
    const read = vi.spyOn(module.get(ProductionQueriesPort), 'findOne');
    await expect(module.get(ProductionService).generate({ deliveryDate: '2026-11-03' }, actor, false)).rejects.toThrow(
      'rollback',
    );
    expect(read).not.toHaveBeenCalled();
  });
  it('no actualiza seguimiento ni consulta la entrega si la recepción falla', async () => {
    const module = await setup();
    vi.spyOn(module.get(ReceiveProductionWritePort), 'receiveDelivery').mockRejectedValue(new Error('rollback'));
    const read = vi.spyOn(module.get(ProductionDeliveriesReadPort), 'findReceived');
    await expect(
      module.get(ProductionService).receiveDelivery('delivery', { receivedQuantity: 2 }, actor),
    ).rejects.toThrow('rollback');
    expect(module.get(TrackingService).refreshStock).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });
  it('refresca existencias después de completar la recepción y devuelve la entrega actualizada', async () => {
    const module = await setup();
    const events: string[] = [];
    const delivery = { id: 'delivery' } as ProductionDelivery;
    vi.spyOn(module.get(ReceiveProductionWritePort), 'receiveDelivery').mockImplementation(async () => {
      events.push('commit');
    });
    vi.spyOn(module.get(TrackingService), 'refreshStock').mockImplementation(async () => {
      events.push('tracking');
    });
    vi.spyOn(module.get(ProductionDeliveriesReadPort), 'findReceived').mockImplementation(async () => {
      events.push('read');
      return delivery;
    });
    expect(await module.get(ProductionService).receiveDelivery('delivery', { receivedQuantity: 2 }, actor)).toBe(
      delivery,
    );
    expect(events).toEqual(['commit', 'tracking', 'read']);
    expect(module.get(TrackingService).refreshStock).toHaveBeenCalledWith('stock.production:delivery');
  });
});

describe('políticas de acceso de Producción', () => {
  const policy = new ProductionAccessPolicy();
  it('rechaza áreas ajenas y usuarios de Producción sin áreas', () => {
    expect(() => policy.assertProductionAreaAccess(actor, 'area-a')).not.toThrow();
    expect(() => policy.assertProductionAreaAccess(actor, 'area-b')).toThrow();
    expect(() => policy.assertProductionAreaAccess({ ...actor, productionAreaIds: [] }, 'area-a')).toThrow();
    expect(policy.productionAreaScope({ ...actor, roles: ['PRODUCCION', 'ADMINISTRADOR'] })).toBeNull();
  });
  it('exige acceso a todas las áreas para cancelar o cerrar una orden completa', () => {
    const details = ['area-a', 'area-b'].map(
      (productionAreaId) => ({ productionAreaId }) as ProductionConsolidationDetail,
    );
    expect(() => policy.assertWholeOrderAccess(actor, details)).toThrow();
    expect(() =>
      policy.assertWholeOrderAccess({ ...actor, productionAreaIds: ['area-a', 'area-b'] }, details),
    ).not.toThrow();
  });
  it('mantiene motivos obligatorios y normalizados', () => {
    expect(() => policy.requiredReason('    ')).toThrow();
    expect(() => policy.requiredReason(' abcd ')).toThrow();
    expect(policy.requiredReason('  Lote dañado  ')).toBe('Lote dañado');
  });
  it('distingue la consulta de requerimientos de la planificación', () => {
    expect(policy.isRequirementsOnly({ ...actor, permissions: ['production.requirements.read'] })).toBe(true);
    expect(
      policy.isRequirementsOnly({ ...actor, permissions: ['production.requirements.read', 'production.plan.adjust'] }),
    ).toBe(false);
  });
});
