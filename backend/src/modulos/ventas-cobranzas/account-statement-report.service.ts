import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { join } from 'node:path';
import { Repository } from 'typeorm';
import { RecordStatus } from '../../compartido/enumeraciones/record-status.enum';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { createIcarPdfReport } from '../../compartido/reportes/icar-pdf-report';
import { IcarReportOptions } from '../../compartido/reportes/icar-report.types';
import { Customer } from '../clientes/entidades/customer.entity';
import { AuditService } from '../seguridad/auditoria/audit.service';
import { AccountStatementService } from './account-statement.service';
import { AccountQueryDto } from './dto/commercial.dto';

@Injectable()
export class AccountStatementReportService {
  constructor(
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    private readonly accounts: AccountStatementService,
    private readonly audit: AuditService,
  ) {}

  customerOptions() {
    return this.customers.createQueryBuilder('customer')
      .select(['customer.id', 'customer.code', 'customer.businessName', 'customer.taxId'])
      .where('customer.status = :status', { status: RecordStatus.ACTIVE })
      .orderBy('customer.businessName', 'ASC')
      .getMany();
  }

  async export(customerId: string, query: AccountQueryDto, actor: AuthenticatedUser) {
    const statement = await this.accounts.get(customerId, query, actor);
    const content = await createIcarPdfReport(buildOptions(statement, query, actor));
    await this.audit.record({
      userId: actor.id,
      module: 'commercial',
      action: 'EXPORTAR_ESTADO_CUENTA',
      entity: 'clientes',
      entityId: customerId,
      result: 'EXITOSO',
      metadata: { from: query.from ?? null, to: query.to ?? null, balance: statement.balance },
    });
    return { filename: `icar-estado-cuenta-cliente-${statement.customer.code}.pdf`, mime: 'application/pdf', content };
  }
}

type Statement = Awaited<ReturnType<AccountStatementService['get']>>;

function buildOptions(statement: Statement, query: AccountQueryDto, actor: AuthenticatedUser): IcarReportOptions {
  const customer = statement.customer;
  return {
    title: 'Estado de cuenta por cliente',
    code: `CTA-CLI-${customer.code}`,
    pdfLayout: 'portrait',
    periodLabel: period(query),
    contextLabel: 'Cliente',
    filterLabel: `${customer.businessName} · NIT/CI: ${customer.taxId || 'No registrado'}`,
    groupLabel: 'MOVIMIENTOS',
    emptyMessage: 'El cliente no tiene movimientos en el período seleccionado.',
    generatedBy: actor.name,
    generatedAt: new Date(),
    logoPath: join(process.cwd(), 'assets', 'icar-logo.jpg'),
    metrics: [
      { label: 'Saldo actual', value: `Bs ${statement.balance}` },
      { label: 'Ventas', value: statement.sales.length },
      { label: 'Cobros', value: statement.payments.length },
      { label: 'Movimientos', value: statement.movements.length },
    ],
    columns: [
      { key: 'date', label: 'Fecha', width: 88 },
      { key: 'description', label: 'Concepto', width: 190 },
      { key: 'debit', label: 'Debe', width: 85, align: 'right' },
      { key: 'credit', label: 'Haber', width: 85, align: 'right' },
      { key: 'balance', label: 'Saldo', width: 100, align: 'right' },
    ],
    groups: statement.movements.length ? [{
      title: `${customer.businessName} · Condición ${String(customer.paymentCondition).replaceAll('_', ' ')}`,
      rows: statement.movements.map((movement) => ({ values: {
        date: dateTime(movement.occurredAt),
        description: movement.description,
        debit: `Bs ${movement.debit}`,
        credit: `Bs ${movement.credit}`,
        balance: `Bs ${movement.resultingBalance}`,
      } })),
    }] : [],
  };
}

function period(query: AccountQueryDto): string {
  if (!query.from && !query.to) return 'Histórico completo';
  return `Desde ${date(query.from) || 'inicio'} hasta ${date(query.to) || 'hoy'}`;
}

function date(value?: string): string {
  const [year, month, day] = String(value ?? '').slice(0, 10).split('-');
  return day && month && year ? `${day}/${month}/${year}` : '';
}

function dateTime(value: Date): string {
  return new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'short', timeStyle: 'short' }).format(value);
}
