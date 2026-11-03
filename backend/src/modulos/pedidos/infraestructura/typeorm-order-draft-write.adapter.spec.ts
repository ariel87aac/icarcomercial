import { describe, expect, it, vi } from 'vitest';
import { DataSource, EntityManager } from 'typeorm';
import { TypeOrmOrderDraftWriteAdapter } from './typeorm-order-draft-write.adapter';
import { Order } from '../entidades/order.entity';
import { OrderDetail } from '../entidades/order-detail.entity';
import { OrderHistory } from '../entidades/order-history.entity';
import { OrderConfirmationLink } from '../entidades/order-confirmation-link.entity';
import { OrderOrigin, OrderStatus, OrderConfirmationLinkStatus } from '../entidades/order.enums';
import { UpdateDraftInput } from '../aplicacion/puertos/order-draft-write.port';

const input: UpdateDraftInput = {
  addressId: 'address',
  requestedDate: '2026-11-10',
  scheduleChanged: false,
  orderCutoffAt: new Date('2026-11-09T13:00:00Z'),
  preparationAt: new Date('2026-11-09T18:00:00Z'),
  total: '12.50',
  details: [
    {
      presentationId: 'presentation',
      requestedQuantity: '1.000',
      reservedQuantity: '0.000',
      pendingQuantity: '0.000',
      unitPrice: '12.50',
      subtotal: '12.50',
      productDescriptionSnapshot: 'Producto',
      presentationDescriptionSnapshot: 'Bolsa',
      unitAbbreviationSnapshot: 'kg',
    },
  ],
};

function setup(status = OrderStatus.DRAFT) {
  const order = {
    id: 'order',
    status,
    observations: 'Conservar',
    orderCutoffAt: new Date('2026-11-08T13:00:00Z'),
    preparationAt: new Date('2026-11-08T18:00:00Z'),
  };
  const builder = {
    setLock: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    getOneOrFail: vi.fn().mockResolvedValue(order),
  };
  const orders = {
    createQueryBuilder: vi.fn().mockReturnValue(builder),
    create: vi.fn((value: object) => value),
    save: vi.fn(async (value: object) => ({ id: 'order', ...value })),
  };
  const details = {
    create: vi.fn((value: object) => value),
    save: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  const history = { create: vi.fn((value: object) => value), save: vi.fn().mockResolvedValue(undefined) };
  const links = { update: vi.fn().mockResolvedValue(undefined) };
  const repositories = new Map<unknown, object>([
    [Order, orders],
    [OrderDetail, details],
    [OrderHistory, history],
    [OrderConfirmationLink, links],
  ]);
  const manager = {
    query: vi.fn(async (sql: string) => (sql.includes('nextval') ? [{ nextval: '42' }] : [])),
    getRepository: (entity: unknown) => {
      const repository = repositories.get(entity);
      if (!repository) throw new Error('Repositorio inesperado');
      return repository;
    },
  };
  // Execute the actual transaction callback and workflow helper; no PostgreSQL is involved.
  const dataSource = {
    transaction: vi.fn(async (work: (manager: EntityManager) => Promise<unknown>) =>
      work(manager as unknown as EntityManager),
    ),
  };
  return {
    service: new TypeOrmOrderDraftWriteAdapter(dataSource as unknown as DataSource),
    order,
    builder,
    orders,
    details,
    history,
    links,
    dataSource,
  };
}

describe('persistencia atómica de borradores', () => {
  it('crea cabecera, detalle e historial dentro de la misma transacción', async () => {
    const { service, orders, details, history, dataSource } = setup();
    const id = await service.create({
      ...input,
      customerId: 'customer',
      actorId: 'actor',
      origin: OrderOrigin.INTERNAL,
      observations: null,
    });
    expect(id).toBe('order');
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(orders.save).toHaveBeenCalledWith(
      expect.objectContaining({
        code: '42',
        status: OrderStatus.DRAFT,
        customerId: 'customer',
        createdById: 'actor',
        total: '12.50',
        observations: null,
      }),
    );
    expect(details.save).toHaveBeenCalledWith([{ orderId: 'order', ...input.details[0] }]);
    expect(history.save).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order',
        previousStatus: null,
        newStatus: OrderStatus.DRAFT,
        userId: 'actor',
        origin: OrderOrigin.INTERNAL,
      }),
    );
  });

  it.each([OrderStatus.CONFIRMED, OrderStatus.CANCELED])(
    'rechaza el estado %s observado bajo bloqueo',
    async (status) => {
      const { service, builder, orders, details, links } = setup(status);
      await expect(service.update('order', input)).rejects.toThrow('inmutable');
      expect(builder.setLock).toHaveBeenCalledWith('pessimistic_write');
      expect(orders.save).not.toHaveBeenCalled();
      expect(details.delete).not.toHaveBeenCalled();
      expect(details.save).not.toHaveBeenCalled();
      expect(links.update).not.toHaveBeenCalled();
    },
  );

  it('conserva observación y plazos cuando no se modifican', async () => {
    const { service, order, links, details } = setup();
    const originalCutoff = order.orderCutoffAt;
    await service.update('order', input);
    expect(order.observations).toBe('Conservar');
    expect(order.orderCutoffAt).toBe(originalCutoff);
    expect(links.update).not.toHaveBeenCalled();
    expect(details.delete).toHaveBeenCalledWith({ orderId: 'order' });
    expect(details.save).toHaveBeenCalledWith([{ orderId: 'order', ...input.details[0] }]);
  });

  it('actualiza los enlaces activos al cambiar la programación y permite limpiar observaciones', async () => {
    const { service, order, links } = setup(OrderStatus.RECEIVED);
    await service.update('order', { ...input, scheduleChanged: true, observations: null });
    expect(order.observations).toBeNull();
    expect(order.orderCutoffAt).toEqual(input.orderCutoffAt);
    expect(order.preparationAt).toEqual(input.preparationAt);
    expect(links.update).toHaveBeenCalledWith(
      { orderId: 'order', status: OrderConfirmationLinkStatus.ACTIVE },
      { expiresAt: input.orderCutoffAt },
    );
  });
});
