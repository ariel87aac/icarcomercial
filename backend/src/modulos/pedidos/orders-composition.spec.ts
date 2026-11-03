import { Customer } from '../clientes/entidades/customer.entity';
import { CustomerAddress } from '../clientes/entidades/customer-address.entity';
import { NotificationService } from '../seguimiento-mensajeria/notification.service';
import { ConfigOrderPublicUrlAdapter } from './infraestructura/config-order-public-url.adapter';
import { OrderPublicUrlPort } from './aplicacion/puertos/order-public-url.port';
import { OrderSchedulingPort } from './aplicacion/puertos/order-scheduling.port';
import { OrderMessagingPort } from './aplicacion/puertos/order-messaging.port';
import { OrderTrackingPort } from './aplicacion/puertos/order-tracking.port';
import { OrderAuditPort } from './aplicacion/puertos/order-audit.port';
import { OrderLinkPort } from './aplicacion/puertos/order-link.port';
import { TypeOrmOrderLinkAdapter } from './infraestructura/typeorm-order-link.adapter';
import { OrderValidationPort } from './aplicacion/puertos/order-validation.port';
import { TypeOrmOrderValidationAdapter } from './infraestructura/typeorm-order-validation.adapter';
import { OrderCancellationPort } from './aplicacion/puertos/order-cancellation.port';
import { TypeOrmOrderCancellationAdapter } from './infraestructura/typeorm-order-cancellation.adapter';
import { OrderReschedulePort } from './aplicacion/puertos/order-reschedule.port';
import { TypeOrmOrderRescheduleAdapter } from './infraestructura/typeorm-order-reschedule.adapter';
import { OrderSubmissionPort } from './aplicacion/puertos/order-submission.port';
import { TypeOrmOrderSubmissionAdapter } from './infraestructura/typeorm-order-submission.adapter';
import { OrderDraftWritePort } from './aplicacion/puertos/order-draft-write.port';
import { TypeOrmOrderDraftWriteAdapter } from './infraestructura/typeorm-order-draft-write.adapter';
import { OrderDetailsService } from './aplicacion/order-details.service';
import { OrderSchedulingService } from './order-scheduling.service';
import { OrderReadPort } from './aplicacion/puertos/order-read.port';
import { TypeOrmOrderReadAdapter } from './infraestructura/typeorm-order-read.adapter';
import 'reflect-metadata';
import { Provider } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UpdateOrderUseCase } from './aplicacion/update-order.use-case';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { UserType } from '../seguridad/usuarios/entidades/user-type.enum';
import { OrdersModule } from './orders.module';
import { OrdersService } from './orders.service';
import { OrderConfirmationPort } from './aplicacion/puertos/order-confirmation.port';
import { TypeOrmConfirmOrderTransaction } from './infraestructura/typeorm-confirm-order.transaction';
import { OrderQueriesService } from './aplicacion/order-queries.service';
import { OrderAccessService } from './aplicacion/order-access.service';
import { OrderNotificationsService } from './aplicacion/order-notifications.service';
import { OrderLinksService } from './aplicacion/order-links.service';
import { Order } from './entidades/order.entity';
import { OrderConfirmationLink } from './entidades/order-confirmation-link.entity';
import { OrderStatus, OrderOrigin } from './entidades/order.enums';
import { TrackingService } from '../seguimiento-mensajeria/tracking.service';
import { AuditService } from '../seguridad/auditoria/audit.service';

const actor: AuthenticatedUser = {
  id: 'operator',
  sessionId: 'session',
  name: 'Operador',
  email: null,
  username: 'operator',
  mustChangePassword: false,
  type: UserType.INTERNAL,
  customerId: null,
  roles: [],
  permissions: [],
  productionAreaIds: [],
};
const externalProviders = new Set([
  'DataSource',
  'AuditService',
  'PricingService',
  'TrackingService',
  'NotificationService',
  'ConfigService',
]);
const modules: TestingModule[] = [];

async function setup() {
  // Use the actual module registration so missing providers and cycles fail this test.
  const repositories = new Map<string, object>();
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const tracking = { ensureOrderLink: vi.fn().mockResolvedValue('/seguimiento/token') };
  const providers: Provider[] = Reflect.getMetadata('providers', OrdersModule);
  const module = await Test.createTestingModule({ providers })
    .useMocker((token) => {
      if (typeof token === 'string' && token.endsWith('Repository')) {
        if (!repositories.has(token)) repositories.set(token, {});
        return repositories.get(token);
      }
      if (typeof token === 'function' && externalProviders.has(token.name)) {
        if (token === AuditService) return audit;
        if (token === TrackingService) return tracking;
        return {};
      }
      return undefined;
    })
    .compile();
  modules.push(module);
  return module;
}

afterEach(async () => {
  for (const module of modules.splice(0)) await module.close();
});

describe('composición del módulo Pedidos', () => {
  it('resuelve la fachada y conecta el puerto con la transacción TypeORM', async () => {
    const module = await setup();
    expect(module.get(OrdersService)).toBeInstanceOf(OrdersService);
    expect(module.get(OrderAuditPort)).toBe(module.get(AuditService));
    expect(module.get(OrderTrackingPort)).toBe(module.get(TrackingService));
    expect(module.get(OrderMessagingPort)).toBe(module.get(NotificationService));
    expect(module.get(OrderSchedulingPort)).toBe(module.get(OrderSchedulingService));
    expect(module.get(OrderPublicUrlPort)).toBeInstanceOf(ConfigOrderPublicUrlAdapter);
    expect(module.get(OrderLinkPort)).toBeInstanceOf(TypeOrmOrderLinkAdapter);
    expect(module.get(OrderValidationPort)).toBeInstanceOf(TypeOrmOrderValidationAdapter);
    expect(module.get(OrderCancellationPort)).toBeInstanceOf(TypeOrmOrderCancellationAdapter);
    expect(module.get(OrderReschedulePort)).toBeInstanceOf(TypeOrmOrderRescheduleAdapter);
    expect(module.get(OrderSubmissionPort)).toBeInstanceOf(TypeOrmOrderSubmissionAdapter);
    expect(module.get(OrderReadPort)).toBeInstanceOf(TypeOrmOrderReadAdapter);
    expect(module.get(OrderDraftWritePort)).toBeInstanceOf(TypeOrmOrderDraftWriteAdapter);
    expect(module.get(OrderConfirmationPort)).toBeInstanceOf(TypeOrmConfirmOrderTransaction);
  });

  it('reutiliza el borrador del cliente mediante el caso de uso de actualización', async () => {
    const module = await setup();
    const draft = { id: 'draft', status: OrderStatus.DRAFT } as Order;
    const repository = module.get(getRepositoryToken(Order));
    repository.findOne = vi.fn().mockResolvedValue(draft);
    const update = vi.spyOn(module.get(UpdateOrderUseCase), 'update').mockResolvedValue(draft);
    const dto = { customerId: 'customer', addressId: 'address', requestedDate: '2026-11-10', details: [] };
    expect(await module.get(OrdersService).create(dto, actor)).toBe(draft);
    expect(update).toHaveBeenCalledWith(
      'draft',
      {
        addressId: dto.addressId,
        requestedDate: dto.requestedDate,
        observations: undefined,
        details: [],
      },
      actor,
    );
  });

  it.each(['create', 'update'] as const)(
    'no registra éxito ni consulta el resultado cuando falla %s',
    async (operation) => {
      const module = await setup();
      const repository = module.get(getRepositoryToken(Order));
      repository.findOne = vi.fn().mockResolvedValue(null);
      const current = {
        id: 'order',
        status: OrderStatus.DRAFT,
        customerId: 'customer',
        addressId: 'address',
        requestedDate: '2026-11-10',
        details: [],
        orderCutoffAt: new Date('2026-11-09T13:00:00Z'),
      } as unknown as Order;
      const read = vi.spyOn(module.get(OrderQueriesService), 'findOne').mockResolvedValue(current);
      vi.spyOn(module.get(OrderSchedulingService), 'assertOrderOpen').mockImplementation(() => undefined);
      vi.spyOn(module.get(OrderDetailsService), 'validateOrder').mockResolvedValue({
        customer: Object.assign(new Customer(), { id: 'customer' }),
        address: Object.assign(new CustomerAddress(), { id: 'address' }),
        items: [],
        schedule: {
          deliveryDate: '2026-11-10',
          weekday: 2,
          zoneId: 'zone',
          zoneName: 'Zona',
          orderCutoffAt: current.orderCutoffAt,
          preparationAt: current.orderCutoffAt,
        },
      });
      vi.spyOn(module.get(OrderDraftWritePort), operation).mockRejectedValue(new Error('write failed'));
      const facade = module.get(OrdersService);
      const work =
        operation === 'create'
          ? facade.create(
              { customerId: 'customer', addressId: 'address', requestedDate: '2026-11-10', details: [] },
              actor,
            )
          : facade.update('order', {}, actor);
      await expect(work).rejects.toThrow('write failed');
      expect(module.get(AuditService).record).not.toHaveBeenCalled();
      expect(read).toHaveBeenCalledTimes(operation === 'create' ? 0 : 1);
    },
  );

  it('rechaza la confirmación interna de un cliente antes de escribir o notificar', async () => {
    const module = await setup();
    const transaction = vi.spyOn(module.get(OrderConfirmationPort), 'confirmOrder');
    const notify = vi.spyOn(module.get(OrderNotificationsService), 'afterConfirmation');
    await expect(
      module.get(OrdersService).confirm(
        'order',
        {},
        {
          ...actor,
          type: UserType.CUSTOMER,
          customerId: 'customer',
        },
      ),
    ).rejects.toThrow('Pedido no encontrado');
    expect(transaction).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('propaga el fallo transaccional sin consultar el resultado ni enviar notificaciones', async () => {
    const module = await setup();
    vi.spyOn(module.get(OrderConfirmationPort), 'confirmOrder').mockRejectedValue(new Error('rollback'));
    const read = vi.spyOn(module.get(OrderQueriesService), 'findOne');
    const notify = vi.spyOn(module.get(OrderNotificationsService), 'afterConfirmation');
    await expect(module.get(OrdersService).confirm('order', {}, actor)).rejects.toThrow('rollback');
    expect(read).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('notifica solo después de completar la confirmación y cargar el pedido confirmado', async () => {
    const module = await setup();
    const events: string[] = [];
    const order = { id: 'order', status: OrderStatus.CONFIRMED } as Order;
    const transaction = vi.spyOn(module.get(OrderConfirmationPort), 'confirmOrder').mockImplementation(async () => {
      events.push('commit');
    });
    vi.spyOn(module.get(OrderQueriesService), 'findOne').mockImplementation(async () => {
      events.push('read');
      return order;
    });
    vi.spyOn(module.get(OrderNotificationsService), 'afterConfirmation').mockImplementation(async () => {
      events.push('notify');
    });
    expect(await module.get(OrdersService).confirm('order', { observation: ' Revisado ' }, actor)).toBe(order);
    expect(events).toEqual(['commit', 'read', 'notify']);
    expect(transaction).toHaveBeenCalledWith(
      'order',
      expect.objectContaining({
        actorId: actor.id,
        reservationUserId: actor.id,
        origin: OrderOrigin.INTERNAL,
        observation: 'Revisado',
      }),
    );
  });

  it('mantiene la identidad y el hash de la confirmación pública', async () => {
    const module = await setup();
    const order = {
      id: 'order',
      code: '42',
      createdById: 'creator',
      status: OrderStatus.CONFIRMED,
      customer: { businessName: 'Cliente' },
      details: [],
      total: '10.00',
    } as unknown as Order;
    const links = module.get(OrderLinksService);
    vi.spyOn(links, 'resolveConfirmationLink').mockResolvedValue({ orderId: order.id } as OrderConfirmationLink);
    vi.spyOn(module.get(OrderAccessService), 'loadOrder').mockResolvedValue(order);
    const transaction = vi.spyOn(module.get(OrderConfirmationPort), 'confirmOrder').mockResolvedValue(undefined);
    const notify = vi.spyOn(module.get(OrderNotificationsService), 'afterConfirmation').mockResolvedValue(undefined);
    const result = await module.get(OrdersService).confirmPublic('public-token');
    expect(transaction).toHaveBeenCalledWith(
      order.id,
      expect.objectContaining({
        actorId: null,
        reservationUserId: 'creator',
        origin: OrderOrigin.PORTAL,
        confirmationTokenHash: links.hashToken('public-token'),
      }),
    );
    expect(notify).toHaveBeenCalledWith(order, 'creator', 'order.confirmed.public:order');
    expect(result.canConfirm).toBe(false);
    expect(result.trackingUrl).toBe('/seguimiento/token');
  });

  it('conserva el rechazo y la auditoría del acceso a un pedido de otro cliente', async () => {
    const module = await setup();
    const access = module.get(OrderAccessService);
    vi.spyOn(access, 'loadOrder').mockResolvedValue({ id: 'order', customerId: 'other' } as Order);
    await expect(
      module.get(OrdersService).findOne('order', {
        ...actor,
        type: UserType.CUSTOMER,
        customerId: 'mine',
      }),
    ).rejects.toThrow('Pedido no encontrado');
    expect(module.get(AuditService).record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ACCESO_PEDIDO_AJENO',
        result: 'RECHAZADO',
        entityId: 'order',
      }),
    );
  });
});
