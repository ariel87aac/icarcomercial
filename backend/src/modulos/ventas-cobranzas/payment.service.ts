import { ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { paginate } from '../../compartido/dto/pagination-query.dto';
import { RecordStatus } from '../../compartido/enumeraciones/record-status.enum';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { AuditService } from '../seguridad/auditoria/audit.service';
import { UserType } from '../seguridad/usuarios/entidades/user-type.enum';
import { AccountLedgerService } from './account-ledger.service';
import { centsToMoney, moneyToCents } from './commercial-calculations';
import { CommercialOutboxService } from './commercial-outbox.service';
import { CreatePaymentDto, PaymentQueryDto, VoidCommercialOperationDto } from './dto/commercial.dto';
import { AccountMovementType, CommercialOutboxStatus, PaymentApplicationMode, PaymentStatus, SaleStatus } from './entidades/commercial.enums';
import { CommercialOutbox } from './entidades/commercial-outbox.entity';
import { PaymentApplication } from './entidades/payment-application.entity';
import { PaymentHistory } from './entidades/payment-history.entity';
import { PaymentMethod } from './entidades/payment-method.entity';
import { Payment } from './entidades/payment.entity';
import { Sale } from './entidades/sale.entity';

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    private readonly dataSource: DataSource,
    private readonly ledger: AccountLedgerService,
    private readonly outbox: CommercialOutboxService,
    private readonly audit: AuditService,
  ) {}

  async findAll(query: PaymentQueryDto, actor: AuthenticatedUser) {
    const builder = this.payments.createQueryBuilder('payment')
      .innerJoinAndSelect('payment.customer', 'customer')
      .innerJoinAndSelect('payment.paymentMethod', 'paymentMethod')
      .leftJoinAndSelect('payment.applications', 'application')
      .leftJoinAndSelect('application.sale', 'sale')
      .orderBy('payment.code', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    this.scopePayments(builder, actor);
    if (query.customerId) builder.andWhere('payment.customerId = :customerId', { customerId: query.customerId });
    if (query.status) builder.andWhere('payment.status = :status', { status: query.status });
    if (query.from) builder.andWhere('payment.paymentDate >= :from', { from: query.from.slice(0, 10) });
    if (query.to) builder.andWhere('payment.paymentDate <= :to', { to: query.to.slice(0, 10) });
    const [items, total] = await builder.getManyAndCount();
    return paginate(items, total, query.page, query.limit);
  }

  async receivableCustomers(actor: AuthenticatedUser) {
    const today = this.businessDate();
    const builder = this.dataSource.getRepository(Sale).createQueryBuilder('sale')
      .innerJoinAndSelect('sale.customer', 'customer')
      .innerJoinAndSelect('sale.order', 'orders')
      .where('sale.status IN (:...statuses)', { statuses: [SaleStatus.ISSUED, SaleStatus.PARTIALLY_PAID] })
      .andWhere('sale.balance > 0')
      .orderBy('sale.dueDate', 'ASC')
      .addOrderBy('sale.issuedDate', 'ASC')
      .addOrderBy('sale.code', 'ASC');
    if (actor.type === UserType.CUSTOMER) {
      if (!actor.customerId) throw new ForbiddenException('La cuenta no está vinculada con un cliente');
      builder.andWhere('sale.customerId = :customerId', { customerId: actor.customerId });
    }
    const sales = await builder.getMany();
    const grouped = new Map<string, {
      customer: Sale['customer']; pendingNotes: number; totalDueCents: number; overdueNotes: number;
      overdueAmountCents: number; oldestDueDate: string; sales: Sale[];
    }>();
    for (const sale of sales) {
      const current = grouped.get(sale.customerId) ?? {
        customer: sale.customer,
        pendingNotes: 0,
        totalDueCents: 0,
        overdueNotes: 0,
        overdueAmountCents: 0,
        oldestDueDate: sale.dueDate,
        sales: [],
      };
      const balanceCents = moneyToCents(sale.balance);
      current.pendingNotes += 1;
      current.totalDueCents += balanceCents;
      current.oldestDueDate = current.oldestDueDate < sale.dueDate ? current.oldestDueDate : sale.dueDate;
      if (sale.dueDate < today) {
        current.overdueNotes += 1;
        current.overdueAmountCents += balanceCents;
      }
      current.sales.push(sale);
      grouped.set(sale.customerId, current);
    }
    return [...grouped.values()].map((item) => ({
      customer: item.customer,
      pendingNotes: item.pendingNotes,
      totalDue: centsToMoney(item.totalDueCents),
      overdueNotes: item.overdueNotes,
      overdueAmount: centsToMoney(item.overdueAmountCents),
      oldestDueDate: item.oldestDueDate,
      hasOverdue: item.overdueNotes > 0,
      sales: item.sales,
    })).sort((left, right) => Number(right.hasOverdue) - Number(left.hasOverdue) || left.customer.businessName.localeCompare(right.customer.businessName));
  }

  async findOne(id: string, actor: AuthenticatedUser): Promise<Payment> {
    const builder = this.payments.createQueryBuilder('payment')
      .innerJoinAndSelect('payment.customer', 'customer')
      .innerJoinAndSelect('payment.paymentMethod', 'paymentMethod')
      .leftJoinAndSelect('payment.registeredBy', 'registeredBy')
      .leftJoinAndSelect('payment.confirmedBy', 'confirmedBy')
      .leftJoinAndSelect('payment.voidedBy', 'voidedBy')
      .leftJoinAndSelect('payment.applications', 'application')
      .leftJoinAndSelect('application.sale', 'sale')
      .leftJoinAndSelect('sale.order', 'orders')
      .leftJoinAndSelect('sale.voucher', 'voucher')
      .leftJoinAndSelect('voucher.series', 'series')
      .leftJoinAndSelect('payment.history', 'history')
      .leftJoinAndSelect('history.user', 'historyUser')
      .where('payment.id = :id', { id });
    this.scopePayments(builder, actor);
    const item = await builder.getOne();
    if (!item) throw new NotFoundException('Cobro no encontrado dentro del alcance permitido');
    item.history?.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
    return item;
  }

  async create(dto: CreatePaymentDto, actor: AuthenticatedUser): Promise<Payment> {
    const paymentId = await this.dataSource.transaction(async (manager) => {
      const method = await manager.getRepository(PaymentMethod).findOne({ where: { id: dto.paymentMethodId, status: RecordStatus.ACTIVE } });
      if (!method) throw new UnprocessableEntityException('El medio de pago no existe o está inactivo');
      if (method.requiresReference && !dto.reference?.trim()) throw new UnprocessableEntityException('El medio de pago requiere una referencia');
      const amountCents = moneyToCents(dto.amount);
      const requestedApplications: { sale: Sale; amountCents: number }[] = [];
      const applicationMode = dto.applicationMode ?? PaymentApplicationMode.SELECTED;
      if (applicationMode === PaymentApplicationMode.OLDEST_FIRST) {
        const sales = await manager.getRepository(Sale).createQueryBuilder('sale')
          .setLock('pessimistic_write')
          .where('sale.customerId = :customerId', { customerId: dto.customerId })
          .andWhere('sale.status IN (:...statuses)', { statuses: [SaleStatus.ISSUED, SaleStatus.PARTIALLY_PAID] })
          .andWhere('sale.balance > 0')
          .orderBy('sale.dueDate', 'ASC')
          .addOrderBy('sale.issuedDate', 'ASC')
          .addOrderBy('sale.code', 'ASC')
          .getMany();
        if (!sales.length) throw new UnprocessableEntityException('El cliente no tiene notas pendientes de cobro');
        let remaining = amountCents;
        for (const sale of sales) {
          if (remaining <= 0) break;
          const applied = Math.min(remaining, moneyToCents(sale.balance));
          requestedApplications.push({ sale, amountCents: applied });
          remaining -= applied;
        }
        if (remaining > 0) throw new UnprocessableEntityException('El abono no puede superar el monto total adeudado por el cliente');
      } else {
        const applications = dto.applications ?? [];
        const saleIds = [...new Set(applications.map((item) => item.saleId))];
        if (saleIds.length !== applications.length) throw new UnprocessableEntityException('Una nota de venta no puede repetirse en el cobro');
        if (!saleIds.length) throw new UnprocessableEntityException('Seleccione al menos una nota de venta');
        for (const saleId of [...saleIds].sort()) {
          const sale = await manager.getRepository(Sale).createQueryBuilder('sale').setLock('pessimistic_write').where('sale.id = :saleId', { saleId }).getOne();
          if (!sale) throw new NotFoundException(`Nota de venta ${saleId} no encontrada`);
          const requested = applications.find((item) => item.saleId === sale.id)!;
          requestedApplications.push({ sale, amountCents: moneyToCents(requested.amount) });
        }
        const appliedCents = requestedApplications.reduce((sum, item) => sum + item.amountCents, 0);
        if (amountCents !== appliedCents) throw new UnprocessableEntityException('El importe del cobro debe ser igual a la suma de las notas seleccionadas');
      }
      for (const item of requestedApplications) {
        if (item.sale.customerId !== dto.customerId) throw new UnprocessableEntityException('Todas las notas seleccionadas deben pertenecer al cliente');
        if (![SaleStatus.ISSUED, SaleStatus.PARTIALLY_PAID].includes(item.sale.status)) throw new UnprocessableEntityException(`La venta ${item.sale.code} no admite cobros`);
        if (item.amountCents > moneyToCents(item.sale.balance)) throw new UnprocessableEntityException(`El importe aplicado supera el saldo de la venta ${item.sale.code}`);
      }
      const sequence = await manager.query<{ value: string }[]>(`SELECT nextval('pagos_numero_seq')::text AS value`);
      const repository = manager.getRepository(Payment);
      const payment = await repository.save(repository.create({
        customerId: dto.customerId,
        paymentMethodId: dto.paymentMethodId,
        number: `PAG-${dto.paymentDate.slice(0, 4)}-${sequence[0].value.padStart(6, '0')}`,
        registeredById: actor.id,
        confirmedById: null,
        voidedById: null,
        paymentDate: dto.paymentDate.slice(0, 10),
        amount: centsToMoney(amountCents),
        reference: dto.reference?.trim() || null,
        observation: dto.observation?.trim() || null,
        status: PaymentStatus.REGISTERED,
        confirmedAt: null,
        voidedAt: null,
        voidReason: null,
      }));
      const applications = manager.getRepository(PaymentApplication);
      for (const item of requestedApplications) {
        await applications.save(applications.create({ paymentCode: payment.code, saleCode: item.sale.code, appliedAmount: centsToMoney(item.amountCents) }));
      }
      await manager.getRepository(PaymentHistory).save(manager.getRepository(PaymentHistory).create({ paymentCode: payment.code, userId: actor.id, previousStatus: null, newStatus: PaymentStatus.REGISTERED, reason: null }));
      return payment.id;
    });
    await this.audit.record({ userId: actor.id, module: 'commercial', action: 'REGISTRAR_PAGO', entity: 'pagos', entityId: paymentId, result: 'EXITOSO', metadata: { customerId: dto.customerId, amount: dto.amount } });
    return this.findOne(paymentId, actor);
  }

  async confirm(id: string, actor: AuthenticatedUser): Promise<Payment> {
    let outboxId: string | null = null;
    await this.dataSource.transaction(async (manager) => {
      const payment = await manager.getRepository(Payment).createQueryBuilder('payment').setLock('pessimistic_write').where('payment.id = :id', { id }).getOne();
      if (!payment) throw new NotFoundException('Cobro no encontrado');
      if (payment.status !== PaymentStatus.REGISTERED) throw new UnprocessableEntityException('Solo un cobro Registrado puede confirmarse');
      const applications = await manager.getRepository(PaymentApplication).find({ where: { paymentCode: payment.code }, order: { saleCode: 'ASC' } });
      if (!applications.length) throw new UnprocessableEntityException('El cobro no contiene aplicaciones');
      const applicationTotal = applications.reduce((sum, item) => sum + moneyToCents(item.appliedAmount), 0);
      if (applicationTotal !== moneyToCents(payment.amount)) throw new UnprocessableEntityException('Las aplicaciones no coinciden con el importe del cobro');
      await this.ledger.lockCustomer(manager, payment.customerId);
      for (const application of applications) {
        const sale = await manager.getRepository(Sale).createQueryBuilder('sale').setLock('pessimistic_write').where('sale.code = :code', { code: application.saleCode }).getOne();
        if (!sale || sale.customerId !== payment.customerId) throw new UnprocessableEntityException('La aplicación contiene una venta inválida para el cliente');
        if (![SaleStatus.ISSUED, SaleStatus.PARTIALLY_PAID].includes(sale.status)) throw new UnprocessableEntityException(`La venta ${sale.code} no admite esta confirmación`);
        const resulting = moneyToCents(sale.balance) - moneyToCents(application.appliedAmount);
        if (resulting < 0) throw new UnprocessableEntityException(`La aplicación supera el saldo de ${sale.code}`);
        sale.balance = centsToMoney(resulting);
        sale.status = resulting === 0 ? SaleStatus.PAID : SaleStatus.PARTIALLY_PAID;
        await manager.getRepository(Sale).save(sale);
        await this.ledger.append(manager, { customerId: payment.customerId, saleCode: sale.code, paymentApplicationId: application.id, type: AccountMovementType.PAYMENT_CREDIT, creditCents: moneyToCents(application.appliedAmount), description: `Cobro ${payment.code} aplicado a venta ${sale.code}`, actorId: actor.id });
      }
      payment.status = PaymentStatus.CONFIRMED;
      payment.confirmedById = actor.id;
      payment.confirmedAt = new Date();
      const confirmedPayment = await manager.getRepository(Payment).save(payment);
      await manager.getRepository(PaymentHistory).save(manager.getRepository(PaymentHistory).create({ paymentCode: payment.code, userId: actor.id, previousStatus: PaymentStatus.REGISTERED, newStatus: PaymentStatus.CONFIRMED, reason: null }));
      const outboxRepository = manager.getRepository(CommercialOutbox);
      const event = await outboxRepository.save(outboxRepository.create({
        idempotencyKey: `payment.received:${payment.id}:${confirmedPayment.version}`,
        eventType: 'payment.received',
        paymentCode: payment.code,
        eventVersion: confirmedPayment.version,
        status: CommercialOutboxStatus.PENDING,
        attempts: 0,
        lastError: null,
        publishedAt: null,
      }));
      outboxId = event.id;
    });
    await this.audit.record({ userId: actor.id, module: 'commercial', action: 'CONFIRMAR_PAGO', entity: 'pagos', entityId: id, result: 'EXITOSO' });
    if (outboxId) await this.outbox.processById(outboxId).catch(() => undefined);
    return this.findOne(id, actor);
  }

  async void(id: string, dto: VoidCommercialOperationDto, actor: AuthenticatedUser): Promise<Payment> {
    await this.dataSource.transaction(async (manager) => {
      const payment = await manager.getRepository(Payment).createQueryBuilder('payment').setLock('pessimistic_write').where('payment.id = :id', { id }).getOne();
      if (!payment) throw new NotFoundException('Cobro no encontrado');
      if (payment.status !== PaymentStatus.CONFIRMED) throw new UnprocessableEntityException('Solo un cobro Confirmado puede anularse');
      const applications = await manager.getRepository(PaymentApplication).find({ where: { paymentCode: payment.code }, order: { saleCode: 'ASC' } });
      await this.ledger.lockCustomer(manager, payment.customerId);
      for (const application of applications) {
        const sale = await manager.getRepository(Sale).createQueryBuilder('sale').setLock('pessimistic_write').where('sale.code = :code', { code: application.saleCode }).getOne();
        if (!sale || sale.status === SaleStatus.VOIDED) throw new UnprocessableEntityException('No se puede revertir el cobro sobre una venta anulada o inexistente');
        const restored = moneyToCents(sale.balance) + moneyToCents(application.appliedAmount);
        if (restored > moneyToCents(sale.total)) throw new UnprocessableEntityException(`La reversión excede el total de ${sale.code}`);
        sale.balance = centsToMoney(restored);
        sale.status = restored === moneyToCents(sale.total) ? SaleStatus.ISSUED : SaleStatus.PARTIALLY_PAID;
        await manager.getRepository(Sale).save(sale);
        await this.ledger.append(manager, { customerId: payment.customerId, saleCode: sale.code, paymentApplicationId: application.id, type: AccountMovementType.PAYMENT_VOID_DEBIT, debitCents: moneyToCents(application.appliedAmount), description: `Anulación de cobro ${payment.code} en venta ${sale.code}`, actorId: actor.id });
      }
      payment.status = PaymentStatus.VOIDED;
      payment.voidedById = actor.id;
      payment.voidedAt = new Date();
      payment.voidReason = dto.reason.trim();
      await manager.getRepository(Payment).save(payment);
      await manager.getRepository(PaymentHistory).save(manager.getRepository(PaymentHistory).create({ paymentCode: payment.code, userId: actor.id, previousStatus: PaymentStatus.CONFIRMED, newStatus: PaymentStatus.VOIDED, reason: dto.reason.trim() }));
    });
    await this.audit.record({ userId: actor.id, module: 'commercial', action: 'ANULAR_PAGO', entity: 'pagos', entityId: id, result: 'EXITOSO', metadata: { reason: dto.reason } });
    return this.findOne(id, actor);
  }

  private scopePayments(builder: SelectQueryBuilder<Payment>, actor: AuthenticatedUser): void {
    if (actor.type === UserType.CUSTOMER) {
      if (!actor.customerId) throw new ForbiddenException('La cuenta no está vinculada con un cliente');
      builder.andWhere('payment.customerId = :scopeCustomerId', { scopeCustomerId: actor.customerId });
    }
  }

  private businessDate(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }
}
