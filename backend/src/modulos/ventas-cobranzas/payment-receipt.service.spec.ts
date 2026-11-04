import { describe, expect, it, vi } from 'vitest';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { UserType } from '../seguridad/usuarios/entidades/user-type.enum';
import { PaymentStatus } from './entidades/commercial.enums';
import { Payment } from './entidades/payment.entity';
import { PaymentReceiptService } from './payment-receipt.service';

const actor = {
  id: 'actor-1', sessionId: 'session-1', name: 'Cobranzas', email: null, username: 'cobranzas',
  mustChangePassword: false, type: UserType.INTERNAL, customerId: null, roles: ['CONTABILIDAD'],
  permissions: ['commercial.payments.read'], productionAreaIds: [],
} satisfies AuthenticatedUser;

describe('PaymentReceiptService', () => {
  it('genera un PDF institucional con las notas aplicadas y registra auditoría', async () => {
    const payment = {
      id: 'payment-1', code: 12, customerId: 'customer-1', paymentDate: '2026-11-03',
      amount: '250.00', reference: 'TRX-123', observation: 'Cobro en caja', status: PaymentStatus.CONFIRMED,
      customer: { businessName: 'Cliente Prueba', taxId: '1234567' },
      paymentMethod: { name: 'Transferencia' },
      applications: [{
        appliedAmount: '250.00',
        sale: {
          code: 7, issuedDate: '2026-10-20', dueDate: '2026-11-03', order: { code: '105' },
          voucher: { number: '15', series: { series: 'ICAR-SC' } },
        },
      }],
    } as unknown as Payment;
    const payments = { findOne: vi.fn().mockResolvedValue(payment) };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const service = new PaymentReceiptService(payments as never, audit as never);

    const result = await service.export(payment.id, actor);

    expect(result.filename).toBe('icar-cobro-12.pdf');
    expect(result.mime).toBe('application/pdf');
    expect(result.content.subarray(0, 4).toString()).toBe('%PDF');
    expect(result.content.length).toBeGreaterThan(1000);
    expect(payments.findOne).toHaveBeenCalledWith(payment.id, actor);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'EXPORTAR_COMPROBANTE_COBRO', entityId: payment.id,
    }));
  });
});
