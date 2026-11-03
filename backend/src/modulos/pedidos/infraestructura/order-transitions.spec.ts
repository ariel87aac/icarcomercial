import { TypeOrmOrderValidationAdapter } from './typeorm-order-validation.adapter';
import { describe, expect, it, vi } from 'vitest';
import { DataSource, EntityManager } from 'typeorm';
import { TypeOrmOrderSubmissionAdapter } from './typeorm-order-submission.adapter';
import { TypeOrmOrderRescheduleAdapter } from './typeorm-order-reschedule.adapter';
import { TypeOrmOrderCancellationAdapter } from './typeorm-order-cancellation.adapter';
import { OrderDetailsService } from '../aplicacion/order-details.service';
import { Order } from '../entidades/order.entity';
import { OrderDetail } from '../entidades/order-detail.entity';
import { OrderHistory } from '../entidades/order-history.entity';
import { OrderConfirmationLink } from '../entidades/order-confirmation-link.entity';
import { OrderStatus, OrderOrigin, OrderConfirmationLinkStatus } from '../entidades/order.enums';
import { AuditEvent } from '../../seguridad/auditoria/entidades/audit-event.entity';
import { Stock } from '../../almacen/entidades/stock.entity';
import { InventoryReservation } from '../../almacen/entidades/inventory-reservation.entity';
import { InventoryReservationStatus } from '../../almacen/entidades/inventory.enums';

const actorInput = { actorId: 'actor', origin: OrderOrigin.INTERNAL, reason: 'Solicitud del cliente' };
const sendInput = {
  actorId: 'actor',
  origin: OrderOrigin.INTERNAL,
  observation: 'Revisar',
  tokenHash: 'hashed-token',
  total: '10.00',
  expiresAt: new Date('2030-01-01'),
  details: [],
};

function setup(status: OrderStatus = OrderStatus.CONFIRMED) {
  const order = {
    id: 'order',
    status,
    customerId: 'customer',
    addressId: 'address',
    requestedDate: '2020-01-01',
    orderCutoffAt: new Date('2020-01-01'),
    preparationAt: new Date('2020-01-01'),
  };
  const stock = { id: 'stock', physicalQuantity: '20.000', reservedQuantity: '7.000' };
  const reservation = {
    id: 'reservation',
    stockId: 'stock',
    quantity: '3.000',
    status: InventoryReservationStatus.ACTIVE,
  };
  const downstream = { has_preparation: false, has_delivery: false, has_sale: false };
  function repository(value: object) {
    const builder = {
      setLock: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      getOne: vi.fn().mockResolvedValue(value),
      getOneOrFail: vi.fn().mockResolvedValue(value),
      getMany: vi.fn().mockResolvedValue([reservation]),
    };
    return {
      builder,
      createQueryBuilder: vi.fn().mockReturnValue(builder),
      create: vi.fn((input: object) => input),
      save: vi.fn().mockResolvedValue(value),
      update: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      softDelete: vi.fn().mockResolvedValue(undefined),
      find: vi.fn().mockResolvedValue([{ presentationId: 'presentation', requestedQuantity: '2.000' }]),
    };
  }
  const orders = repository(order),
    stocks = repository(stock),
    reservations = repository(reservation);
  const details = repository({}),
    history = repository({}),
    links = repository({}),
    audit = repository({});
  const repositories = new Map<unknown, ReturnType<typeof repository>>([
    [Order, orders],
    [Stock, stocks],
    [InventoryReservation, reservations],
    [OrderDetail, details],
    [OrderHistory, history],
    [OrderConfirmationLink, links],
    [AuditEvent, audit],
  ]);
  const manager = {
    getRepository: (entity: unknown) => {
      const result = repositories.get(entity);
      if (!result) throw new Error('Repositorio inesperado');
      return result;
    },
    query: vi.fn(async (sql: string) => (sql.includes('has_preparation') ? [downstream] : [])),
  };
  const dataSource = {
    transaction: vi.fn(async (work: (m: EntityManager) => Promise<unknown>) =>
      work(manager as unknown as EntityManager),
    ),
  } as unknown as DataSource;
  return {
    order,
    stock,
    reservation,
    downstream,
    orders,
    stocks,
    reservations,
    details,
    history,
    links,
    audit,
    dataSource,
    manager,
    cancel: new TypeOrmOrderCancellationAdapter(dataSource),
    submit: new TypeOrmOrderSubmissionAdapter(dataSource),
  };
}

describe('transacciones de cancelación', () => {
  it.each(['has_preparation', 'has_delivery', 'has_sale'] as const)('rechaza un pedido con %s', async (field) => {
    const fixture = setup();
    fixture.downstream[field] = true;
    await expect(fixture.cancel.cancel('order', actorInput)).rejects.toThrow('asociada');
    expect(fixture.stocks.save).not.toHaveBeenCalled();
    expect(fixture.orders.save).not.toHaveBeenCalled();
    expect(fixture.audit.save).not.toHaveBeenCalled();
  });

  it('rechaza inventario ya despachado', async () => {
    const fixture = setup();
    fixture.reservation.status = InventoryReservationStatus.CONSUMED;
    await expect(fixture.cancel.cancel('order', actorInput)).rejects.toThrow('inventario despachado');
    expect(fixture.stocks.save).not.toHaveBeenCalled();
    expect(fixture.orders.save).not.toHaveBeenCalled();
  });

  it('rechaza una liberación que produciría saldo reservado negativo', async () => {
    const fixture = setup();
    fixture.stock.reservedQuantity = '1.000';
    await expect(fixture.cancel.cancel('order', actorInput)).rejects.toThrow('saldo reservado cambió');
    expect(fixture.stocks.save).not.toHaveBeenCalled();
    expect(fixture.reservations.save).not.toHaveBeenCalled();
  });

  it('libera la reserva sin modificar el stock físico y registra la cancelación', async () => {
    const fixture = setup();
    await fixture.cancel.cancel('order', actorInput);
    expect(fixture.stock).toMatchObject({ physicalQuantity: '20.000', reservedQuantity: '4.000' });
    expect(fixture.reservation.status).toBe(InventoryReservationStatus.RELEASED);
    expect(fixture.order.status).toBe(OrderStatus.CANCELED);
    expect(fixture.details.update).toHaveBeenCalledWith(
      { orderId: 'order' },
      {
        reservedQuantity: '0.000',
        pendingQuantity: '0.000',
      },
    );
    expect(fixture.audit.save).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ releasedQuantity: '3.000' }),
      }),
    );
    expect(fixture.orders.builder.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(fixture.stocks.builder.setLock).toHaveBeenCalledWith('pessimistic_write');
  });

  it('cancela un borrador sin tocar reservas', async () => {
    const fixture = setup(OrderStatus.DRAFT);
    await fixture.cancel.cancel('order', actorInput);
    expect(fixture.order.status).toBe(OrderStatus.CANCELED);
    expect(fixture.reservations.createQueryBuilder).not.toHaveBeenCalled();
    expect(fixture.stocks.save).not.toHaveBeenCalled();
  });

  it('no elimina un pedido que ya no está cancelado al adquirir el bloqueo', async () => {
    const fixture = setup(OrderStatus.RECEIVED);
    await expect(
      fixture.cancel.remove('order', {
        actorId: 'actor',
        reason: 'Eliminar',
        snapshot: {
          code: '42',
          customerId: 'customer',
          status: OrderStatus.CANCELED,
          total: '10.00',
          reason: 'Eliminar',
        },
      }),
    ).rejects.toThrow('primero debe cancelarlo');
    expect(fixture.orders.softDelete).not.toHaveBeenCalled();
  });
});

describe('transacciones de envío y devolución', () => {
  it('envía el borrador, revoca enlaces previos y guarda solamente el hash del nuevo enlace', async () => {
    const fixture = setup(OrderStatus.DRAFT);
    await fixture.submit.send('order', sendInput);
    expect(fixture.order.status).toBe(OrderStatus.RECEIVED);
    expect(fixture.links.update).toHaveBeenCalledWith(
      { orderId: 'order', status: OrderConfirmationLinkStatus.ACTIVE },
      expect.objectContaining({ status: OrderConfirmationLinkStatus.REVOKED }),
    );
    expect(fixture.links.save).toHaveBeenCalledWith(
      expect.objectContaining({ tokenHash: 'hashed-token', expiresAt: sendInput.expiresAt, createdById: 'actor' }),
    );
  });

  it('rechaza envío y devolución cuando el estado cambió antes del bloqueo', async () => {
    const fixture = setup();
    await expect(fixture.submit.send('order', sendInput)).rejects.toThrow('cambió de estado');
    await expect(fixture.submit.returnToDraft('order', sendInput)).rejects.toThrow('cambió de estado');
    expect(fixture.orders.save).not.toHaveBeenCalled();
    expect(fixture.links.save).not.toHaveBeenCalled();
  });

  it('devuelve el pedido a borrador y revoca su enlace activo', async () => {
    const fixture = setup(OrderStatus.RECEIVED);
    await fixture.submit.returnToDraft('order', { actorId: 'actor', observation: 'Corregir' });
    expect(fixture.order.status).toBe(OrderStatus.DRAFT);
    expect(fixture.links.update).toHaveBeenCalled();
    expect(fixture.history.save).toHaveBeenCalledWith(
      expect.objectContaining({
        previousStatus: OrderStatus.RECEIVED,
        newStatus: OrderStatus.DRAFT,
        observation: 'Corregir',
      }),
    );
  });
});

describe('transacción de reprogramación', () => {
  it('revalida detalles usando el administrador de la transacción y conserva el estado', async () => {
    const fixture = setup(OrderStatus.RECEIVED);
    const schedule = { orderCutoffAt: new Date('2030-01-01'), preparationAt: new Date('2030-01-02') };
    const validation = { validateOrder: vi.fn().mockResolvedValue({ items: [], schedule }) };
    const adapter = new TypeOrmOrderRescheduleAdapter(
      fixture.dataSource,
      validation as unknown as OrderDetailsService,
      { forTransaction: () => fixture.manager } as unknown as TypeOrmOrderValidationAdapter,
    );
    await adapter.reschedule('order', { actorId: 'actor', origin: OrderOrigin.INTERNAL, deliveryDate: '2030-01-03' });
    expect(validation.validateOrder).toHaveBeenCalledWith(
      'customer',
      'address',
      '2030-01-03',
      [{ presentationId: 'presentation', quantity: 2 }],
      fixture.manager,
    );
    expect(fixture.order.status).toBe(OrderStatus.RECEIVED);
    expect(fixture.order.requestedDate).toBe('2030-01-03');
    expect(fixture.links.update).toHaveBeenCalledWith(
      { orderId: 'order', status: OrderConfirmationLinkStatus.ACTIVE },
      { expiresAt: schedule.orderCutoffAt },
    );
  });

  it('rechaza una reprogramación concurrente cuando el plazo ya está abierto', async () => {
    const fixture = setup(OrderStatus.DRAFT);
    fixture.order.orderCutoffAt = new Date(Date.now() + 60_000);
    const validation = { validateOrder: vi.fn() };
    const adapter = new TypeOrmOrderRescheduleAdapter(
      fixture.dataSource,
      validation as unknown as OrderDetailsService,
      { forTransaction: () => fixture.manager } as unknown as TypeOrmOrderValidationAdapter,
    );
    await expect(
      adapter.reschedule('order', { actorId: 'actor', origin: OrderOrigin.INTERNAL, deliveryDate: '2030-01-03' }),
    ).rejects.toThrow('ya fue reprogramado');
    expect(validation.validateOrder).not.toHaveBeenCalled();
    expect(fixture.orders.save).not.toHaveBeenCalled();
  });
});
