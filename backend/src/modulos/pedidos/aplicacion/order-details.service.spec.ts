import { describe, expect, it, vi } from 'vitest';
import { OrderDetailsService } from './order-details.service';
import { OrderValidationPort } from './puertos/order-validation.port';
import { RecordStatus } from '../../../compartido/enumeraciones/record-status.enum';
import { Customer } from '../../clientes/entidades/customer.entity';
import { CustomerAddress } from '../../clientes/entidades/customer-address.entity';
import { ProductPresentation } from '../../productos/catalogo/entidades/product-presentation.entity';

function reader() {
  return {
    customer: vi.fn<OrderValidationPort['customer']>().mockResolvedValue({ id: 'customer' } as Customer),
    address: vi.fn<OrderValidationPort['address']>().mockResolvedValue({ id: 'address' } as CustomerAddress),
    presentation: vi.fn<OrderValidationPort['presentation']>().mockResolvedValue({
      id: 'presentation',
      description: 'Bolsa',
      product: { name: 'Producto', status: RecordStatus.ACTIVE },
      unit: { abbreviation: 'kg' },
    } as ProductPresentation),
    price: vi.fn<OrderValidationPort['price']>().mockResolvedValue({ amount: '12.50' }),
    schedule: vi.fn<OrderValidationPort['schedule']>().mockResolvedValue({
      deliveryDate: '2030-01-03',
      weekday: 4,
      orderCutoffAt: new Date('2030-01-02'),
      preparationAt: new Date('2030-01-02'),
      zoneId: 'zone',
      zoneName: 'Zona',
    }),
  };
}
const item = { presentationId: 'presentation', quantity: 2 };

describe('validación de detalles sin dependencia de TypeORM', () => {
  it('resuelve precios y conserva el snapshot comercial', async () => {
    const data = reader();
    const service = new OrderDetailsService(data);
    const result = await service.validateOrder('customer', 'address', '2030-01-03', [item]);
    expect(result.items[0].subtotal).toBe(25);
    expect(service.detailValues(result.items[0])).toMatchObject({
      requestedQuantity: '2.000',
      subtotal: '25.00',
      unitPrice: '12.50',
      productDescriptionSnapshot: 'Producto',
      presentationDescriptionSnapshot: 'Bolsa',
    });
  });

  it('usa exclusivamente la sesión proporcionada, sin caer en lecturas fuera de la transacción', async () => {
    const defaults = reader(),
      transaction = reader();
    transaction.price.mockResolvedValue({ amount: '7.00' });
    const result = await new OrderDetailsService(defaults).validateOrder(
      'customer',
      'address',
      '2030-01-03',
      [item],
      transaction,
      false,
    );
    expect(result.items[0].subtotal).toBe(14);
    expect(transaction.schedule).toHaveBeenCalledWith(expect.objectContaining({ id: 'address' }), '2030-01-03', false);
    for (const method of Object.values(defaults)) expect(method).not.toHaveBeenCalled();
  });

  it('rechaza cliente inexistente antes de consultar dirección o precios', async () => {
    const data = reader();
    data.customer.mockResolvedValue(null);
    await expect(
      new OrderDetailsService(data).validateOrder('missing', 'address', '2030-01-03', [item]),
    ).rejects.toThrow('Cliente no encontrado');
    expect(data.address).not.toHaveBeenCalled();
    expect(data.price).not.toHaveBeenCalled();
  });

  it('rechaza un domicilio no perteneciente al cliente', async () => {
    const data = reader();
    data.address.mockResolvedValue(null);
    await expect(
      new OrderDetailsService(data).validateOrder('customer', 'other', '2030-01-03', [item]),
    ).rejects.toThrow('El domicilio no pertenece');
    expect(data.address).toHaveBeenCalledWith('other', 'customer');
    expect(data.price).not.toHaveBeenCalled();
  });

  it.each([
    { details: [], message: 'al menos un detalle' },
    { details: [item, item], message: 'no puede repetirse' },
  ])('rechaza detalles inválidos: $message', async ({ details, message }) => {
    const data = reader();
    await expect(
      new OrderDetailsService(data).validateOrder('customer', 'address', '2030-01-03', details),
    ).rejects.toThrow(message);
    expect(data.presentation).not.toHaveBeenCalled();
    expect(data.price).not.toHaveBeenCalled();
  });

  it('rechaza presentaciones inexistentes y precios ausentes', async () => {
    const data = reader();
    data.presentation.mockResolvedValueOnce(null);
    const service = new OrderDetailsService(data);
    await expect(service.validateOrder('customer', 'address', '2030-01-03', [item])).rejects.toThrow('inactiva');
    data.price.mockResolvedValue(null);
    await expect(service.validateOrder('customer', 'address', '2030-01-03', [item])).rejects.toThrow(
      'precio aplicable',
    );
  });
});
