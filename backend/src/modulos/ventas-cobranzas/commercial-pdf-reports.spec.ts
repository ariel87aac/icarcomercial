import { describe, expect, it, vi } from 'vitest';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { UserType } from '../seguridad/usuarios/entidades/user-type.enum';
import { AccountStatementReportService } from './account-statement-report.service';
import { createCommercialPdfReport } from './commercial-report-pdf';
import { CommercialReportQueryDto } from './dto/commercial.dto';
import { CommercialReportType, SaleStatus } from './entidades/commercial.enums';
import { Sale } from './entidades/sale.entity';
import { createSaleVoucherReport } from './sale-voucher-report';

const actor = {
  id: 'actor-1', sessionId: 'session-1', name: 'Administrador', email: null, username: 'admin',
  mustChangePassword: false, type: UserType.INTERNAL, customerId: null, roles: ['ADMINISTRADOR'],
  permissions: ['commercial.reports.export'], productionAreaIds: [],
} satisfies AuthenticatedUser;

const portrait = '/MediaBox [0 0 612 792]';

describe('reportes PDF de Ventas y Cobranzas', () => {
  it.each([
    [CommercialReportType.SALES, { codVenta: 1, codPedido: 7, cliente: 'Cliente ICAR', fechaEmision: '2026-11-01', fechaVencimiento: '2026-11-08', total: '120.00', estado: 'EMITIDA' }],
    [CommercialReportType.PAYMENTS, { codCobro: 2, cliente: 'Cliente ICAR', fecha: '2026-11-02', medio: 'Efectivo', referencia: '', observacion: '', estado: 'CONFIRMADO', importe: '80.00' }],
    [CommercialReportType.RECEIVABLES, { codVenta: 1, cliente: 'Cliente ICAR', vencimiento: '2026-11-08', estado: 'VIGENTE', diasMora: 0, antiguedad: 'VIGENTE', saldo: '40.00' }],
    [CommercialReportType.TRACEABILITY, { saleCode: 1, orderCode: 7, customer: 'Cliente ICAR', saleStatus: 'EMITIDA', total: '120.00', balance: '40.00', voucher: 'ICAR-00000001' }],
  ])('genera %s en hoja carta vertical', async (type, row) => {
    const pdf = await createCommercialPdfReport(type, [row], { totals: { total: '120.00', balance: '40.00' } }, query(), actor);

    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.toString('latin1')).toContain(portrait);
  });

  it('genera el comprobante de venta institucional en carta vertical', async () => {
    const sale = {
      code: 1, issuedDate: '2026-11-01', dueDate: '2026-11-08', total: '120.00', balance: '40.00', status: SaleStatus.ISSUED,
      customer: { businessName: 'Cliente ICAR' }, order: { code: 7 },
      details: [{ productSnapshot: 'Pan molde', presentationSnapshot: 'Bolsa', deliveredQuantity: '10', unitSnapshot: 'unid.', unitPrice: '12.00', subtotal: '120.00' }],
    } as unknown as Sale;

    const pdf = await createSaleVoucherReport(sale, 'ICAR-00000001', actor.name);

    expect(pdf.toString('latin1')).toContain(portrait);
  });

  it('genera el estado de cuenta del cliente en carta vertical y audita la descarga', async () => {
    const statement = {
      customer: { id: 'customer-1', code: 15, businessName: 'Cliente ICAR', taxId: '123', paymentCondition: 'CREDITO' },
      balance: '40.00', sales: [{}], payments: [{}],
      movements: [{ occurredAt: new Date('2026-11-02T14:00:00Z'), description: 'Venta 1', debit: '120.00', credit: '0.00', resultingBalance: '120.00' }],
    };
    const accounts = { get: vi.fn().mockResolvedValue(statement) };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const service = new AccountStatementReportService({} as never, accounts as never, audit as never);

    const result = await service.export('customer-1', {}, actor);

    expect(result.filename).toBe('icar-estado-cuenta-cliente-15.pdf');
    expect(result.content.toString('latin1')).toContain(portrait);
    expect(accounts.get).toHaveBeenCalledWith('customer-1', {}, actor);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'EXPORTAR_ESTADO_CUENTA', entityId: 'customer-1' }));
  });
});

function query(): CommercialReportQueryDto {
  return Object.assign(new CommercialReportQueryDto(), { page: 1, limit: 20 });
}
