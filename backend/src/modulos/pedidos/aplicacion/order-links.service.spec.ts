import { describe, expect, it, vi } from 'vitest';
import { OrderLinksService } from './order-links.service';
import { OrderLinkPort } from './puertos/order-link.port';
import { OrderConfirmationLink } from '../entidades/order-confirmation-link.entity';
import { OrderConfirmationLinkStatus as Status } from '../entidades/order.enums';

function setup(status = Status.ACTIVE, expired = false) {
  const link = {
    id: 'link',
    orderId: 'order',
    status,
    expiresAt: new Date(Date.now() + (expired ? -60_000 : 60_000)),
  } as OrderConfirmationLink;
  const port = {
    findByHash: vi.fn<OrderLinkPort['findByHash']>().mockResolvedValue(link),
    save: vi.fn<OrderLinkPort['save']>().mockResolvedValue(undefined),
  };
  return { service: new OrderLinksService(port, { publicBaseUrl: () => 'http://localhost:8080' }), port, link };
}
const token = 'a'.repeat(43);

describe('resolución de enlaces mediante un puerto', () => {
  it.each(['short', 'a'.repeat(201)])('rechaza longitud inválida sin consultar persistencia', async (invalid) => {
    const { service, port } = setup();
    await expect(service.resolveConfirmationLink(invalid, false)).rejects.toThrow('no está disponible');
    expect(port.findByHash).not.toHaveBeenCalled();
  });
  it('consulta por hash y devuelve un enlace activo', async () => {
    const { service, port, link } = setup();
    expect(await service.resolveConfirmationLink(token, false)).toBe(link);
    expect(port.findByHash).toHaveBeenCalledWith(service.hashToken(token));
    expect(port.findByHash).not.toHaveBeenCalledWith(token);
    expect(port.save).not.toHaveBeenCalled();
  });
  it('persiste el vencimiento antes de rechazar un enlace expirado', async () => {
    const { service, port, link } = setup(Status.ACTIVE, true);
    await expect(service.resolveConfirmationLink(token, false)).rejects.toThrow('plazo de confirmación');
    expect(link.status).toBe(Status.EXPIRED);
    expect(port.save).toHaveBeenCalledWith(link);
  });
  it('permite consultar un enlace usado pero no volver a confirmar con él', async () => {
    const { service, link } = setup(Status.USED);
    expect(await service.resolveConfirmationLink(token, true)).toBe(link);
    await expect(service.resolveConfirmationLink(token, false)).rejects.toThrow('no está disponible');
  });
  it.each([Status.REVOKED, Status.EXPIRED])('rechaza un enlace %s incluso al consultar', async (status) => {
    const { service } = setup(status);
    await expect(service.resolveConfirmationLink(token, true)).rejects.toThrow('no está disponible');
  });
});
