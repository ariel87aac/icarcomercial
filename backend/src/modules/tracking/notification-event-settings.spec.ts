import { describe, expect, it, vi } from 'vitest';
import { NotificationService } from './notification.service';
import { NotificationEvent } from './entities/tracking.enums';
import { Order } from '../orders/entities/order.entity';
import { Payment } from '../commercial/entities/payment.entity';

function service(enabled: boolean) {
  const subject = Object.create(NotificationService.prototype) as NotificationService;
  const query = vi.fn().mockResolvedValue([{ event: NotificationEvent.ORDER_DRAFT, enabled }]);
  const findOne = vi.fn().mockResolvedValue(null);
  Object.assign(subject, { dataSource: { query }, templates: { findOne }, audit: { record: vi.fn() } });
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

  it('permite buscar una plantilla activa al habilitar el evento', async () => {
    const { subject, findOne } = service(true);
    await subject.enqueue({} as Order, null, NotificationEvent.DELIVERED, 1, {});
    expect(findOne).toHaveBeenCalledWith({ where: { event: NotificationEvent.DELIVERED, active: true }, order: { version: 'DESC' } });
  });

  it('preserva la compatibilidad de los eventos sin configuración y devuelve todos los eventos', async () => {
    const { subject, query } = service(false);
    const rows = await subject.listEventSettings();
    expect(rows).toHaveLength(Object.values(NotificationEvent).length);
    expect(rows.find(row => row.event === NotificationEvent.ORDER_DRAFT)?.enabled).toBe(false);
    expect(rows.find(row => row.event === NotificationEvent.DELIVERED)?.enabled).toBe(true);
    query.mockResolvedValue([]);
    const { findOne } = service(true);
    Object.assign(subject, { templates: { findOne } });
    await subject.enqueue({} as Order, null, NotificationEvent.DELIVERED, 1, {});
    expect(findOne).toHaveBeenCalled();
  });
});
