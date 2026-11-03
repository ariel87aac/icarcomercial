import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { AuthenticatedUser } from '../../../compartido/interfaces/authenticated-user.interface';
import { UserType } from '../../seguridad/usuarios/entidades/user-type.enum';
import { OrderAuditPort } from './puertos/order-audit.port';
import { OrderTrackingPort } from './puertos/order-tracking.port';
import { OrderMessagingPort } from './puertos/order-messaging.port';
import { OrderStatus, OrderOrigin } from '../entidades/order.enums';
import { OrderSchedulingPort } from './puertos/order-scheduling.port';
import { OrderQueriesService } from './order-queries.service';
import { OrderAccessService } from './order-access.service';
import { OrderDetailsService } from './order-details.service';
import { OrderLinksService } from './order-links.service';
import { OrderNotificationsService } from './order-notifications.service';
import { OrderSubmissionService } from './order-submission.service';
import { OrderCancellationService } from './order-cancellation.service';
import { RescheduleOrderUseCase } from './reschedule-order.use-case';
import { OrderSubmissionPort } from './puertos/order-submission.port';
import { OrderCancellationPort } from './puertos/order-cancellation.port';
import { OrderReschedulePort } from './puertos/order-reschedule.port';

const actor: AuthenticatedUser = {
  id: 'actor',
  sessionId: 'session',
  name: 'Operador',
  username: 'operator',
  email: null,
  type: UserType.INTERNAL,
  customerId: null,
  mustChangePassword: false,
  roles: [],
  permissions: [],
  productionAreaIds: [],
};

describe('efectos posteriores a las transiciones de Pedidos', () => {
  it.each(['send', 'return', 'cancel', 'remove', 'reschedule'] as const)(
    'no genera auditoría de éxito, seguimiento o mensajes si falla %s',
    async (operation) => {
      const failure = () => vi.fn().mockRejectedValue(new Error('transaction failed'));
      const submission = { send: failure(), returnToDraft: failure() };
      const cancellation = { cancel: failure(), remove: failure() };
      const rescheduling = { reschedule: failure() };
      const status =
        operation === 'remove'
          ? OrderStatus.CANCELED
          : operation === 'return'
            ? OrderStatus.RECEIVED
            : OrderStatus.DRAFT;
      const queries = {
        findOne: vi.fn().mockResolvedValue({
          id: 'order',
          status,
          code: '42',
          total: '10.00',
          customerId: 'customer',
          addressId: 'address',
          requestedDate: '2020-01-01',
          orderCutoffAt: new Date('2020-01-01'),
          details: [],
        }),
      };
      const audit = { record: vi.fn() };
      const tracking = { safeCaptureOrder: vi.fn(), refreshStock: vi.fn(), ensureOrderLink: vi.fn() };
      const notifications = { safeEnqueueOrderLifecycle: vi.fn() };
      const module = await Test.createTestingModule({
        providers: [
          OrderSubmissionService,
          OrderCancellationService,
          RescheduleOrderUseCase,
          { provide: OrderSubmissionPort, useValue: submission },
          { provide: OrderCancellationPort, useValue: cancellation },
          { provide: OrderReschedulePort, useValue: rescheduling },
          { provide: OrderQueriesService, useValue: queries },
          { provide: OrderAccessService, useValue: { origin: () => OrderOrigin.INTERNAL } },
          { provide: OrderDetailsService, useValue: { validateOrder: vi.fn().mockResolvedValue({ items: [] }) } },
          { provide: OrderLinksService, useValue: { hashToken: () => 'hash' } },
          { provide: OrderNotificationsService, useValue: {} },
          {
            provide: OrderSchedulingPort,
            useValue: {
              assertOrderOpen: vi.fn(),
              deliveryOptions: vi.fn().mockResolvedValue([{ deliveryDate: '2030-01-03' }]),
            },
          },
          { provide: OrderAuditPort, useValue: audit },
          { provide: OrderTrackingPort, useValue: tracking },
          { provide: OrderMessagingPort, useValue: notifications },
        ],
      }).compile();
      try {
        const actions = {
          send: () => module.get(OrderSubmissionService).send('order', {}, actor),
          return: () => module.get(OrderSubmissionService).returnToDraft('order', { observation: 'Corregir' }, actor),
          cancel: () => module.get(OrderCancellationService).cancel('order', { reason: 'Cancelar' }, actor),
          remove: () => module.get(OrderCancellationService).remove('order', { reason: 'Eliminar' }, actor),
          reschedule: () => module.get(RescheduleOrderUseCase).rescheduleToNextAvailable('order', actor),
        };
        await expect(actions[operation]()).rejects.toThrow('transaction failed');
        expect(queries.findOne).toHaveBeenCalledTimes(1);
        expect(audit.record).not.toHaveBeenCalled();
        expect(tracking.safeCaptureOrder).not.toHaveBeenCalled();
        expect(tracking.refreshStock).not.toHaveBeenCalled();
        expect(tracking.ensureOrderLink).not.toHaveBeenCalled();
        expect(notifications.safeEnqueueOrderLifecycle).not.toHaveBeenCalled();
      } finally {
        await module.close();
      }
    },
  );
});
