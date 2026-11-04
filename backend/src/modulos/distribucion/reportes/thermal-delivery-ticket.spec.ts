import { describe, expect, it } from 'vitest';
import { Sale } from '../../ventas-cobranzas/entidades/sale.entity';
import { DistributionDeliveryType, VisitResultType } from '../entidades/distribution.enums';
import { RouteDelivery } from '../entidades/route-delivery.entity';
import { buildThermalDeliveryTicket, createThermalDeliveryTicketPdf } from './thermal-delivery-ticket';

describe('ticket térmico de entrega de 80 mm', () => {
  it('genera una nota previa con la cantidad preparada', async () => {
    const model = buildThermalDeliveryTicket({
      delivery: delivery(false), sale: null, generatedBy: 'Repartidor Uno', generatedAt: new Date('2026-11-03T14:30:00Z'),
    });
    const pdf = await createThermalDeliveryTicketPdf(model);

    expect(model.title).toBe('NOTA PREVIA DE ENTREGA');
    expect(model.items[0]).toMatchObject({ prepared: 10, delivered: 10, returned: 0, subtotal: 120 });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.toString('latin1')).toMatch(/\/MediaBox \[0 0 226\.77/);
    expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(1);
  });

  it('usa las cantidades reales, devolución y venta después de una entrega parcial', async () => {
    const model = buildThermalDeliveryTicket({
      delivery: delivery(true),
      sale: { code: 51, dueDate: '2026-11-10' } as Sale,
      generatedBy: 'Administrador',
      generatedAt: new Date('2026-11-03T14:30:00Z'),
    });
    const pdf = await createThermalDeliveryTicketPdf(model);

    expect(model.title).toBe('COMPROBANTE DE ENTREGA PARCIAL');
    expect(model.items[0]).toMatchObject({ delivered: 8, returned: 2, subtotal: 96 });
    expect(model.saleCode).toBe('51');
    expect(model.result).toBe('ENTREGA PARCIAL');
    expect(pdf.toString('latin1')).toMatch(/\/MediaBox \[0 0 226\.77/);
  });
});

function delivery(withResult: boolean): RouteDelivery {
  const preparationDetail = {
    id: 'detail-1', preparedQuantity: '10.000',
    orderDetail: {
      unitPrice: '12.00', productDescriptionSnapshot: 'Croissant tradicional',
      presentationDescriptionSnapshot: 'Bolsa de 10 unidades', unitAbbreviationSnapshot: 'unid.',
      presentation: { product: { code: 1001 } },
    },
  };
  return {
    id: 'delivery-1', deliveryType: DistributionDeliveryType.ROUTE, position: 2,
    order: {
      code: '205', requestedDate: '2026-11-03', customerNameSnapshot: 'Cliente Prueba', zoneSnapshot: 'Centro',
      customer: { businessName: 'Cliente Prueba', taxId: '1234567', phone: '70700000', paymentCondition: 'CREDITO', creditDays: 7 },
    },
    address: { address: 'Av. Blanco Galindo km 4', zone: { name: 'Centro' } },
    route: { code: 'RUTA-12', responsibles: [{ userId: 'user-1', isPrincipal: true, user: { name: 'Repartidor Uno' } }] },
    preparation: { details: [preparationDetail] },
    result: withResult ? {
      id: 'result-1', result: VisitResultType.PARTIAL, observation: 'Cliente recibió ocho unidades',
      user: { name: 'Repartidor Uno' },
      details: [{ preparationDetailId: 'detail-1', deliveredQuantity: '8.000', returnedQuantity: '2.000' }],
    } : null,
  } as unknown as RouteDelivery;
}
