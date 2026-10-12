import { ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { paginate } from '../../common/dto/pagination-query.dto';
import { RecordStatus } from '../../common/enums/record-status.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { UserType } from '../users/entities/user-type.enum';
import { AccountLedgerService } from './account-ledger.service';
import { centsToMoney, moneyToCents } from './commercial-calculations';
import { CommercialOutboxService } from './commercial-outbox.service';
import { CreatePaymentDto, PaymentQueryDto, VoidCommercialOperationDto } from './dto/commercial.dto';
import { AccountMovementType, CommercialOutboxStatus, PaymentStatus, SaleStatus } from './entities/commercial.enums';
import { CommercialOutbox } from './entities/commercial-outbox.entity';
import { PaymentApplication } from './entities/payment-application.entity';
import { PaymentHistory } from './entities/payment-history.entity';
import { PaymentMethod } from './entities/payment-method.entity';
import { Payment } from './entities/payment.entity';
import { Sale } from './entities/sale.entity';

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
      .orderBy('payment.paymentDate', 'DESC')
      .addOrderBy('payment.createdAt', 'DESC')
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
    if (!item) throw new NotFoundException('Pago no encontrado dentro del alcance permitido');
    item.history?.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
    return item;
  }

  async create(dto: CreatePaymentDto, actor: AuthenticatedUser): Promise<Payment> {
    const paymentId = await this.dataSource.transaction(async (manager) => {
      const method = await manager.getRepository(PaymentMethod).findOne({ where: { id: dto.paymentMethodId, status: RecordStatus.ACTIVE } });
      if (!method) throw new UnprocessableEntityException('El medio de pago no existe o está inactivo');
      if (method.requiresReference && !dto.reference?.trim()) throw new UnprocessableEntityException('El medio de pago requiere una referencia');
      const saleIds = [...new Set(dto.applications.map((item) => item.saleId))];
      if (saleIds.length !== dto.applications.length) throw new UnprocessableEntityException('Una venta no puede repetirse en las aplicaciones del pago');
      const amountCents = moneyToCents(dto.amount);
      const appliedCents = dto.applications.reduce((sum, item) => sum + moneyToCents(item.amount), 0);
      if (amountCents !== appliedCents) throw new UnprocessableEntityException('El importe del pago debe ser igual a la suma de sus aplicaciones');

      const sales: Sale[] = [];
      for (const saleId of [...saleIds].sort()) {
        const sale = await manager.getRepository(Sale).createQueryBuilder('sale').setLock('pessimistic_write').where('sale.id = :saleId', { saleId }).getOne();
        if (!sale) throw new NotFoundException(`Venta ${saleId} no encontrada`);
        sales.push(sale);
      }
      for (const sale of sales) {
        if (sale.customerId !== dto.customerId) throw new UnprocessableEntityException('Todas las ventas aplicadas deben pertenecer al cliente seleccionado');
        if (![SaleStatus.ISSUED, SaleStatus.PARTIALLY_PAID].includes(sale.status)) throw new UnprocessableEntityException(`La venta ${sale.number} no admite pagos`);
        const requested = dto.applications.find((item) => item.saleId === sale.id)!;
        if (moneyToCents(requested.amount) > moneyToCents(sale.balance)) throw new UnprocessableEntityException(`El importe aplicado supera el saldo de ${sale.number}`);
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
        status: PaymentStatus.REGISTERED,
        confirmedAt: null,
        voidedAt: null,
        voidReason: null,
      }));
      const applications = manager.getRepository(PaymentApplication);
      for (const item of dto.applications) {
        await applications.save(applications.create({ paymentId: payment.id, saleId: item.saleId, appliedAmount: centsToMoney(moneyToCents(item.amount)) }));
      }
      await manager.getRepository(PaymentHistory).save(manager.getRepository(PaymentHistory).create({ paymentId: payment.id, userId: actor.id, previousStatus: null, newStatus: PaymentStatus.REGISTERED, reason: null }));
      return payment.id;
    });
    await this.audit.record({ userId: actor.id, module: 'commercial', action: 'REGISTRAR_PAGO', entity: 'pagos', entityId: paymentId, result: 'EXITOSO', metadata: { customerId: dto.customerId, amount: dto.amount } });
    return this.findOne(paymentId, actor);
  }

  async confirm(id: string, actor: AuthenticatedUser): Promise<Payment> {
    let outboxId: string | null = null;
    await this.dataSource.transaction(async (manager) => {
      const payment = await manager.getRepository(Payment).createQueryBuilder('payment').setLock('pessimistic_write').where('payment.id = :id', { id }).getOne();
      if (!payment) throw new NotFoundException('Pago no encontrado');
      if (payment.status !== PaymentStatus.REGISTERED) throw new UnprocessableEntityException('Solo un pago Registrado puede confirmarse');
      const applications = await manager.getRepository(PaymentApplication).find({ where: { paymentId: id }, order: { saleId: 'ASC' } });
      if (!applications.length) throw new UnprocessableEntityException('El pago no contiene aplicaciones');
      const applicationTotal = applications.reduce((sum, item) => sum + moneyToCents(item.appliedAmount), 0);
      if (applicationTotal !== moneyToCents(payment.amount)) throw new UnprocessableEntityException('Las aplicaciones no coinciden con el importe del pago');
      await this.ledger.lockCustomer(manager, payment.customerId);
      for (const application of applications) {
        const sale = await manager.getRepository(Sale).createQueryBuilder('sale').setLock('pessimistic_write').where('sale.id = :id', { id: application.saleId }).getOne();
        if (!sale || sale.customerId !== payment.customerId) throw new UnprocessableEntityException('La aplicación contiene una venta inválida para el cliente');
        if (![SaleStatus.ISSUED, SaleStatus.PARTIALLY_PAID].includes(sale.status)) throw new UnprocessableEntityException(`La venta ${sale.number} no admite esta confirmación`);
        const resulting = moneyToCents(sale.balance) - moneyToCents(application.appliedAmount);
        if (resulting < 0) throw new UnprocessableEntityException(`La aplicación supera el saldo de ${sale.number}`);
        sale.balance = centsToMoney(resulting);
        sale.status = resulting === 0 ? SaleStatus.PAID : SaleStatus.PARTIALLY_PAID;
        await manager.getRepository(Sale).save(sale);
        await this.ledger.append(manager, { customerId: payment.customerId, saleId: sale.id, paymentApplicationId: application.id, type: AccountMovementType.PAYMENT_CREDIT, creditCents: moneyToCents(application.appliedAmount), description: `Pago ${payment.number} aplicado a ${sale.number}`, actorId: actor.id });
      }
      payment.status = PaymentStatus.CONFIRMED;
      payment.confirmedById = actor.id;
      payment.confirmedAt = new Date();
      const confirmedPayment = await manager.getRepository(Payment).save(payment);
      await manager.getRepository(PaymentHistory).save(manager.getRepository(PaymentHistory).create({ paymentId: payment.id, userId: actor.id, previousStatus: PaymentStatus.REGISTERED, newStatus: PaymentStatus.CONFIRMED, reason: null }));
      const outboxRepository = manager.getRepository(CommercialOutbox);
      const event = await outboxRepository.save(outboxRepository.create({
        idempotencyKey: `payment.received:${payment.id}:${confirmedPayment.version}`,
        eventType: 'payment.received',
        paymentId: payment.id,
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
      if (!payment) throw new NotFoundException('Pago no encontrado');
      if (payment.status !== PaymentStatus.CONFIRMED) throw new UnprocessableEntityException('Solo un pago Confirmado puede anularse');
      const applications = await manager.getRepository(PaymentApplication).find({ where: { paymentId: id }, order: { saleId: 'ASC' } });
      await this.ledger.lockCustomer(manager, payment.customerId);
      for (const application of applications) {
        const sale = await manager.getRepository(Sale).createQueryBuilder('sale').setLock('pessimistic_write').where('sale.id = :id', { id: application.saleId }).getOne();
        if (!sale || sale.status === SaleStatus.VOIDED) throw new UnprocessableEntityException('No se puede revertir el pago sobre una venta anulada o inexistente');
        const restored = moneyToCents(sale.balance) + moneyToCents(application.appliedAmount);
        if (restored > moneyToCents(sale.total)) throw new UnprocessableEntityException(`La reversión excede el total de ${sale.number}`);
        sale.balance = centsToMoney(restored);
        sale.status = restored === moneyToCents(sale.total) ? SaleStatus.ISSUED : SaleStatus.PARTIALLY_PAID;
        await manager.getRepository(Sale).save(sale);
        await this.ledger.append(manager, { customerId: payment.customerId, saleId: sale.id, paymentApplicationId: application.id, type: AccountMovementType.PAYMENT_VOID_DEBIT, debitCents: moneyToCents(application.appliedAmount), description: `Anulación de pago ${payment.number} en ${sale.number}`, actorId: actor.id });
      }
      payment.status = PaymentStatus.VOIDED;
      payment.voidedById = actor.id;
      payment.voidedAt = new Date();
      payment.voidReason = dto.reason.trim();
      await manager.getRepository(Payment).save(payment);
      await manager.getRepository(PaymentHistory).save(manager.getRepository(PaymentHistory).create({ paymentId: payment.id, userId: actor.id, previousStatus: PaymentStatus.CONFIRMED, newStatus: PaymentStatus.VOIDED, reason: dto.reason.trim() }));
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
}
