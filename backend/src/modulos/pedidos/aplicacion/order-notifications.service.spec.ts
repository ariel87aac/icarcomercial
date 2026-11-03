import { describe, expect, it, vi } from 'vitest';
import { OrderNotificationsService } from './order-notifications.service';
import { Order } from '../entidades/order.entity';
import { NotificationEvent } from '../../seguimiento-mensajeria/entidades/tracking.enums';

function setup() {
  const events: string[] = [];
  const tracking = {
    ensureOrderLink: vi.fn(async () => {
      events.push('link');
      return '/seguimiento/token';
    }),
    safeCaptureOrder: vi.fn(async () => {
      events.push('history');
    }),
    refreshStock: vi.fn(async () => {
      events.push('stock');
    }),
    orderSnapshot: async (): Promise<never> => {
      throw new Error('No debe consultar el estado');
    },
  };
  const messaging = {
    safeEnqueueOrderLifecycle: vi.fn(async () => {
      events.push('message');
    }),
  };
  const order = {
    id: 'order',
    details: [
      {
        productDescriptionSnapshot: 'Producto',
        presentationDescriptionSnapshot: 'Bolsa',
        requestedQuantity: '2.000',
        unitAbbreviationSnapshot: 'kg',
      },
    ],
  } as Order;
  return { service: new OrderNotificationsService(messaging, tracking), events, tracking, messaging, order };
}

describe('efectos de confirmación a través de contratos', () => {
  it('mantiene enlace, mensaje, historial y actualización de stock en ese orden', async () => {
    const { service, events, messaging, tracking, order } = setup();
    await service.afterConfirmation(order, 'owner', 'confirmed:event');
    expect(events).toEqual(['link', 'message', 'history', 'stock']);
    expect(messaging.safeEnqueueOrderLifecycle).toHaveBeenCalledWith(
      order,
      NotificationEvent.ORDER_CONFIRMED,
      'owner',
      { productList: '- Producto · Bolsa: 2 kg', trackingUrl: '/seguimiento/token' },
    );
    expect(tracking.safeCaptureOrder).toHaveBeenCalledWith('order', 'confirmed:event');
    expect(tracking.refreshStock).toHaveBeenCalledWith('stock.confirm:order');
  });

  it('no continúa con mensajes si no puede obtener el enlace', async () => {
    const { service, tracking, messaging, order } = setup();
    tracking.ensureOrderLink.mockRejectedValue(new Error('link failed'));
    await expect(service.afterConfirmation(order, 'owner', 'event')).rejects.toThrow('link failed');
    expect(messaging.safeEnqueueOrderLifecycle).not.toHaveBeenCalled();
    expect(tracking.safeCaptureOrder).not.toHaveBeenCalled();
    expect(tracking.refreshStock).not.toHaveBeenCalled();
  });

  it('propaga errores inesperados del contrato de mensajería sin ejecutar los siguientes efectos', async () => {
    const { service, tracking, messaging, order } = setup();
    messaging.safeEnqueueOrderLifecycle.mockRejectedValue(new Error('unexpected failure'));
    await expect(service.afterConfirmation(order, 'owner', 'event')).rejects.toThrow('unexpected failure');
    expect(tracking.safeCaptureOrder).not.toHaveBeenCalled();
    expect(tracking.refreshStock).not.toHaveBeenCalled();
  });
});
