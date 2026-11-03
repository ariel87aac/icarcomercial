import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { AuthenticatedUser } from '../../../compartido/interfaces/authenticated-user.interface';
import { UserType } from '../../seguridad/usuarios/entidades/user-type.enum';
import { OrderAuditPort } from './puertos/order-audit.port';
import { OrderTrackingPort } from './puertos/order-tracking.port';
import { Order } from '../entidades/order.entity';
import { OrderReadPort } from './puertos/order-read.port';
import { OrderAccessService } from './order-access.service';
import { OrderQueriesService } from './order-queries.service';

const customer: AuthenticatedUser = {
  id: 'user',
  sessionId: 'session',
  name: 'Cliente',
  email: null,
  username: 'customer',
  mustChangePassword: false,
  type: UserType.CUSTOMER,
  customerId: 'own-customer',
  roles: [],
  permissions: [],
  productionAreaIds: [],
};

async function setup() {
  const orders = {
    findAll: vi.fn().mockResolvedValue({ data: [], total: 41 }),
    statusSummary: vi.fn().mockResolvedValue({}),
    loadOrder: vi.fn().mockResolvedValue(null),
    findDraftId: vi.fn().mockResolvedValue(null),
    latestDraft: vi.fn().mockResolvedValue(null),
    enrichWorkflow: vi.fn().mockResolvedValue(undefined),
    history: vi.fn().mockResolvedValue([]),
  } satisfies Record<keyof OrderReadPort, unknown>;
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const tracking = { orderSnapshot: vi.fn().mockResolvedValue({}) };
  const module = await Test.createTestingModule({
    providers: [
      OrderQueriesService,
      OrderAccessService,
      { provide: OrderReadPort, useValue: orders },
      { provide: OrderAuditPort, useValue: audit },
      { provide: OrderTrackingPort, useValue: tracking },
    ],
  }).compile();
  return { module, service: module.get(OrderQueriesService), orders, audit, tracking };
}

describe('consultas de Pedidos a través del puerto de lectura', () => {
  it('impone el cliente autenticado y conserva la paginación aunque se solicite otro cliente', async () => {
    const { module, service, orders } = await setup();
    try {
      const result = await service.findAll({ page: 2, limit: 20, customerId: 'other', q: '42' }, customer);
      expect(orders.findAll).toHaveBeenCalledWith({ page: 2, limit: 20, customerId: 'own-customer', q: '42' });
      expect(result.meta).toEqual({ page: 2, limit: 20, total: 41, totalPages: 3 });
    } finally {
      await module.close();
    }
  });

  it('no convierte un cliente sin cuenta asociada en una consulta interna sin filtro', async () => {
    const { module, service, orders } = await setup();
    try {
      const unlinked = { ...customer, customerId: null };
      await service.findAll({ page: 1, limit: 20 }, unlinked);
      await service.statusSummary(unlinked);
      expect(orders.findAll).toHaveBeenCalledWith(expect.objectContaining({ customerId: null }));
      expect(orders.statusSummary).toHaveBeenCalledWith(null);
      await expect(service.draftCart('other', unlinked)).rejects.toThrow('Debe seleccionar un cliente');
      expect(orders.latestDraft).not.toHaveBeenCalled();
    } finally {
      await module.close();
    }
  });

  it('permite al operador interno seleccionar un cliente y consultar el resumen global', async () => {
    const { module, service, orders } = await setup();
    try {
      const operator = { ...customer, type: UserType.INTERNAL, customerId: null };
      await service.findAll({ page: 1, limit: 20, customerId: 'selected' }, operator);
      await service.statusSummary(operator);
      expect(orders.findAll).toHaveBeenCalledWith(expect.objectContaining({ customerId: 'selected' }));
      expect(orders.statusSummary).toHaveBeenCalledWith(undefined);
    } finally {
      await module.close();
    }
  });

  it('bloquea historial y seguimiento ajenos antes de enriquecer o consultar esos datos', async () => {
    const { module, service, orders, audit, tracking } = await setup();
    try {
      orders.loadOrder.mockResolvedValue({ id: 'order', customerId: 'other' } as Order);
      await expect(service.history('order', customer)).rejects.toThrow('Pedido no encontrado');
      await expect(service.workflow('order', customer)).rejects.toThrow('Pedido no encontrado');
      expect(orders.enrichWorkflow).not.toHaveBeenCalled();
      expect(orders.history).not.toHaveBeenCalled();
      expect(tracking.orderSnapshot).not.toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledTimes(2);
    } finally {
      await module.close();
    }
  });

  it('devuelve no encontrado sin consultar historial cuando el pedido no existe', async () => {
    const { module, service, orders } = await setup();
    try {
      await expect(service.history('missing', customer)).rejects.toThrow('Pedido no encontrado');
      expect(orders.history).not.toHaveBeenCalled();
      expect(orders.enrichWorkflow).not.toHaveBeenCalled();
    } finally {
      await module.close();
    }
  });

  it('consulta el historial autorizado y selecciona el borrador del propio cliente', async () => {
    const { module, service, orders } = await setup();
    try {
      const order = { id: 'order', customerId: customer.customerId } as Order;
      orders.loadOrder.mockResolvedValue(order);
      expect(await service.history('order', customer)).toEqual([]);
      expect(orders.enrichWorkflow).toHaveBeenCalledWith(order);
      expect(orders.history).toHaveBeenCalledWith('order');
      expect(await service.draftCart('other', customer)).toBeNull();
      expect(orders.latestDraft).toHaveBeenCalledWith('own-customer');
    } finally {
      await module.close();
    }
  });
});
