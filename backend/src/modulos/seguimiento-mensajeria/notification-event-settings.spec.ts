import { describe, expect, it, vi } from 'vitest';
import { NotificationService } from './notification.service';
import { NotificationEvent } from './entidades/tracking.enums';
import { Order } from '../pedidos/entidades/order.entity';
import { Payment } from '../ventas-cobranzas/entidades/payment.entity';

function service(enabled: boolean, channelEnabled = true) {
  const subject = Object.create(NotificationService.prototype) as NotificationService;
  const query = vi.fn().mockResolvedValue([{ event: NotificationEvent.ORDER_DRAFT, enabled }]);
  const findOne = vi.fn().mockResolvedValue(enabled ? { id: 'template', body: '', allowedVariables: [] } : null);
  Object.assign(subject, {
    dataSource: { query },
    templates: { findOne },
    audit: { record: vi.fn() },
    channelSendingEnabled: vi.fn().mockResolvedValue(channelEnabled),
    enqueueWithTemplate: vi.fn().mockResolvedValue(null),
  });
  return { subject, query, findOne };
}

describe('Preferencias de envío por evento', () => {
  it('no busca ni recrea la plantilla del borrador cuando el envío está deshabilitado', async () => {
    const { subject, findOne } = service(false);
    await subject.safeEnqueueOrderLifecycle({} as Order, NotificationEvent.ORDER_DRAFT, 'user', {});
    expect(findOne).not.toHaveBeenCalled();
  });

  it('omite notificaciones de seguimiento deshabilitadas sin acceder a plantillas', async () => {
    const { subject, findOne } = service(false);
    expect(await subject.enqueue({} as Order, null, NotificationEvent.ROUTE_DEPARTURE, 1, {})).toBeNull();
    expect(findOne).not.toHaveBeenCalled();
  });

  it('aplica también la preferencia a los mensajes automáticos de cobro', async () => {
    const { subject } = service(false);
    expect(await subject.enqueuePayment({} as Payment, 1)).toBeNull();
  });

  it('no genera notificaciones cuando el envío global está deshabilitado', async () => {
    const { subject, findOne } = service(true, false);
    expect(await subject.enqueue({} as Order, null, NotificationEvent.DELIVERED, 1, {})).toBeNull();
    expect(findOne).not.toHaveBeenCalled();
  });

  it('permite buscar una plantilla activa al habilitar el evento', async () => {
    const { subject, findOne } = service(true);
    await subject.enqueue({} as Order, null, NotificationEvent.DELIVERED, 1, {});
    expect(findOne).toHaveBeenCalledWith({
      where: { event: NotificationEvent.DELIVERED, active: true },
      order: { version: 'DESC' },
    });
  });

  it('preserva la compatibilidad de los eventos sin configuración y devuelve todos los eventos', async () => {
    const { subject, query } = service(false);
    const rows = await subject.listEventSettings();
    expect(rows).toHaveLength(Object.values(NotificationEvent).length);
    expect(rows.find((row) => row.event === NotificationEvent.ORDER_DRAFT)?.enabled).toBe(false);
    expect(rows.find((row) => row.event === NotificationEvent.DELIVERED)?.enabled).toBe(true);
    query.mockResolvedValue([]);
    const { findOne } = service(true);
    Object.assign(subject, { templates: { findOne } });
    await subject.enqueue({} as Order, null, NotificationEvent.DELIVERED, 1, {});
    expect(findOne).toHaveBeenCalled();
  });

  it('incluye el enlace de aprobación al enviar aunque la plantilla recibida sea anterior', () => {
    const { subject } = service(true);
    const body = (
      subject as unknown as {
        renderLifecycleRequirements(body: string, template: { allowedVariables: string[] }, event: NotificationEvent, variables: { confirmationUrl: string }): string;
      }
    ).renderLifecycleRequirements('Recibimos tu pedido.', { allowedVariables: [] }, NotificationEvent.ORDER_RECEIVED, { confirmationUrl: 'https://icar.test/confirmar-pedido/token' });
    expect(body).toContain('Aprueba tu pedido aquí: https://icar.test/confirmar-pedido/token');
  });

  it('distingue cada nueva transición de borrador a recibido', async () => {
    const { subject } = service(true);
    const order = {
      id: 'pedido-1',
      code: '1',
      customer: { businessName: 'Cliente' },
    } as Order;
    await subject.safeEnqueueOrderLifecycle(order, NotificationEvent.ORDER_RECEIVED, 'user', {}, 'confirmacion-2');
    expect((subject as unknown as { enqueueWithTemplate: ReturnType<typeof vi.fn> }).enqueueWithTemplate).toHaveBeenCalledWith(order, null, expect.anything(), NotificationEvent.ORDER_RECEIVED, 1, expect.anything(), 'pedido-1:PEDIDO_RECIBIDO:confirmacion-2');
  });
});
