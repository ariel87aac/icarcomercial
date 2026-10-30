import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository, SelectQueryBuilder } from 'typeorm';
import { paginate } from '../../common/dto/pagination-query.dto';
import { RecordStatus } from '../../common/enums/record-status.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { PaymentCondition } from '../customers/entities/customer.enums';
import { VisitResult } from '../distribution/entities/visit-result.entity';
import { VisitResultType } from '../distribution/entities/distribution.enums';
import { UserType } from '../users/entities/user-type.enum';
import { AccountLedgerService } from './account-ledger.service';
import { addDays, centsToMoney, lineSubtotalCents, moneyToCents } from './commercial-calculations';
import { CreateSaleDto, SaleQueryDto, VoidCommercialOperationDto } from './dto/commercial.dto';
import { AccountMovementType, PaymentStatus, SaleStatus, VoucherStatus } from './entities/commercial.enums';
import { InternalVoucher } from './entities/internal-voucher.entity';
import { PaymentApplication } from './entities/payment-application.entity';
import { SaleDetail } from './entities/sale-detail.entity';
import { Sale } from './entities/sale.entity';
import { VoucherSeries } from './entities/voucher-series.entity';
import { createSimplePdf } from './simple-pdf';

export const INTERNAL_VOUCHER_LEGEND = 'DOCUMENTO INTERNO ICAR - NO CONSTITUYE FACTURA TRIBUTARIA';

@Injectable()
export class SaleService {
  constructor(
    @InjectRepository(Sale) private readonly sales: Repository<Sale>,
    @InjectRepository(VisitResult) private readonly visitResults: Repository<VisitResult>,
    private readonly dataSource: DataSource,
    private readonly ledger: AccountLedgerService,
    private readonly audit: AuditService,
  ) {}

  async eligibleDeliveries() {
    return this.visitResults.createQueryBuilder('visit')
      .innerJoinAndSelect('visit.delivery', 'delivery')
      .innerJoinAndSelect('delivery.order', 'orders')
      .innerJoinAndSelect('orders.customer', 'customer')
      .innerJoinAndSelect('orders.address', 'address')
      .leftJoinAndSelect('address.zone', 'zone')
      .innerJoinAndSelect('visit.details', 'visitDetail')
      .innerJoinAndSelect('visitDetail.preparationDetail', 'preparationDetail')
      .innerJoinAndSelect('preparationDetail.orderDetail', 'orderDetail')
      .where('visit.result IN (:...results)', { results: [VisitResultType.DELIVERED, VisitResultType.PARTIAL] })
      .andWhere('visitDetail.deliveredQuantity > 0')
      .andWhere(`NOT EXISTS (SELECT 1 FROM ventas sale WHERE sale.resultado_visita_id = visit.id AND sale.estado <> 'ANULADA')`)
      .andWhere(`(
        customer.condicion_pago = 'CREDITO'
        OR NOT EXISTS (
          SELECT 1 FROM ventas pending_sale
           WHERE pending_sale.cliente_id = customer.id
             AND pending_sale.estado IN ('EMITIDA', 'PAGO_PARCIAL')
             AND pending_sale.saldo > 0
        )
      )`)
      .orderBy('visit.occurredAt', 'ASC')
      .getMany();
  }

  async findAll(query: SaleQueryDto, actor: AuthenticatedUser) {
    const builder = this.sales.createQueryBuilder('sale')
      .innerJoinAndSelect('sale.customer', 'customer')
      .innerJoinAndSelect('sale.order', 'orders')
      .leftJoinAndSelect('orders.address', 'address')
      .leftJoinAndSelect('address.zone', 'zone')
      .leftJoinAndSelect('sale.voucher', 'voucher')
      .leftJoinAndSelect('voucher.series', 'series')
      .orderBy('sale.code', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    this.scopeSales(builder, actor);
    this.applyFilters(builder, query);
    const [items, total] = await builder.getManyAndCount();
    return paginate(items, total, query.page, query.limit);
  }

  async findOne(id: string, actor: AuthenticatedUser): Promise<Sale> {
    const builder = this.sales.createQueryBuilder('sale')
      .innerJoinAndSelect('sale.customer', 'customer')
      .innerJoinAndSelect('sale.order', 'orders')
      .leftJoinAndSelect('orders.address', 'address')
      .leftJoinAndSelect('address.zone', 'zone')
      .leftJoinAndSelect('sale.details', 'detail')
      .leftJoinAndSelect('sale.voucher', 'voucher')
      .leftJoinAndSelect('voucher.series', 'series')
      .where('sale.id = :id', { id });
    this.scopeSales(builder, actor);
    const sale = await builder.getOne();
    if (!sale) throw new NotFoundException('Venta no encontrada dentro del alcance permitido');
    return sale;
  }

  async create(dto: CreateSaleDto, actor: AuthenticatedUser): Promise<Sale> {
    const saleId = await this.dataSource.transaction((manager) => this.createInTransaction(manager, dto.visitResultId, actor));
    await this.audit.record({ userId: actor.id, module: 'commercial', action: 'EMITIR_VENTA', entity: 'ventas', entityId: saleId, result: 'EXITOSO', metadata: { visitResultId: dto.visitResultId } });
    return this.findOne(saleId, actor);
  }

  async createInTransaction(manager: EntityManager, visitResultId: string, actor: AuthenticatedUser): Promise<string> {
    const visit = await manager.getRepository(VisitResult).createQueryBuilder('visit')
      .setLock('pessimistic_write')
      .innerJoinAndSelect('visit.delivery', 'delivery')
      .innerJoinAndSelect('delivery.order', 'orders')
      .innerJoinAndSelect('orders.customer', 'customer')
      .innerJoinAndSelect('visit.details', 'visitDetail')
      .innerJoinAndSelect('visitDetail.preparationDetail', 'preparationDetail')
      .innerJoinAndSelect('preparationDetail.orderDetail', 'orderDetail')
      .where('visit.id = :id', { id: visitResultId })
      .getOne();
    if (!visit) throw new NotFoundException('Resultado de visita no encontrado');
    if (![VisitResultType.DELIVERED, VisitResultType.PARTIAL].includes(visit.result)) throw new UnprocessableEntityException('Solo una entrega completa o parcial puede originar una venta');
    const existing = await manager.getRepository(Sale).createQueryBuilder('sale')
      .where('(sale.visitResultId = :visitId OR sale.orderId = :orderId)', { visitId: visit.id, orderId: visit.delivery.orderId })
      .andWhere('sale.status <> :voided', { voided: SaleStatus.VOIDED })
      .getOne();
    if (existing) throw new ConflictException('La entrega ya tiene una venta vigente');
    const delivered = visit.details.filter((detail) => Number(detail.deliveredQuantity) > 0);
    if (!delivered.length) throw new UnprocessableEntityException('La entrega no contiene cantidades efectivamente entregadas');

    await this.ledger.lockCustomer(manager, visit.delivery.order.customerId);
    if (visit.delivery.order.customer.paymentCondition === PaymentCondition.CASH) {
      const pendingSale = await manager.getRepository(Sale).createQueryBuilder('sale')
        .where('sale.customerId = :customerId', { customerId: visit.delivery.order.customerId })
        .andWhere('sale.status IN (:...statuses)', { statuses: [SaleStatus.ISSUED, SaleStatus.PARTIALLY_PAID] })
        .andWhere('sale.balance > 0')
        .orderBy('sale.issuedDate', 'ASC')
        .getOne();
      if (pendingSale) {
        throw new ConflictException(`El cliente es de contado y mantiene pendiente la venta ${pendingSale.code}. Registre y confirme su pago antes de generar una nueva entrega`);
      }
    }

    const issuedDate = this.businessDate();
    const creditDays = visit.delivery.order.customer.paymentCondition === PaymentCondition.CREDIT
      ? Math.max(0, visit.delivery.order.customer.creditDays)
      : 0;
    const sequence = await manager.query<{ value: string }[]>(`SELECT nextval('ventas_numero_seq')::text AS value`);
    const lineValues = delivered.map((detail) => {
      const orderDetail = detail.preparationDetail.orderDetail;
      const subtotalCents = lineSubtotalCents(detail.deliveredQuantity, orderDetail.unitPrice, 0);
      return { detail, orderDetail, subtotalCents };
    });
    const totalCents = lineValues.reduce((sum, line) => sum + line.subtotalCents, 0);
    if (totalCents <= 0) throw new UnprocessableEntityException('El total de la venta debe ser mayor que cero');

    const saleRepository = manager.getRepository(Sale);
    const sale = await saleRepository.save(saleRepository.create({
      orderId: visit.delivery.orderId,
      customerId: visit.delivery.order.customerId,
      visitResultId: visit.id,
      number: `VTA-${issuedDate.slice(0, 4)}-${sequence[0].value.padStart(6, '0')}`,
      issuedDate,
      dueDate: addDays(issuedDate, creditDays),
      creditDaysSnapshot: creditDays,
      status: SaleStatus.ISSUED,
      total: centsToMoney(totalCents),
      balance: centsToMoney(totalCents),
      createdById: actor.id,
      issuedById: actor.id,
      voidedById: null,
      voidedAt: null,
      voidReason: null,
    }));
    const detailRepository = manager.getRepository(SaleDetail);
    for (const line of lineValues) {
      await detailRepository.save(detailRepository.create({
        saleCode: sale.code,
        orderDetailId: line.orderDetail.id,
        deliveredQuantity: line.detail.deliveredQuantity,
        unitPrice: line.orderDetail.unitPrice,
        discount: '0.00',
        subtotal: centsToMoney(line.subtotalCents),
        productSnapshot: line.orderDetail.productDescriptionSnapshot,
        presentationSnapshot: line.orderDetail.presentationDescriptionSnapshot,
        unitSnapshot: line.orderDetail.unitAbbreviationSnapshot,
      }));
    }
    const series = await manager.getRepository(VoucherSeries).createQueryBuilder('series')
      .setLock('pessimistic_write')
      .where('series.type = :type AND series.status = :status', { type: 'COMPROBANTE_INTERNO', status: RecordStatus.ACTIVE })
      .getOne();
    if (!series) throw new UnprocessableEntityException('No existe una serie activa para comprobantes internos');
    const voucherNumber = series.nextNumber;
    series.nextNumber = (BigInt(series.nextNumber) + 1n).toString();
    await manager.getRepository(VoucherSeries).save(series);
    const voucherRepository = manager.getRepository(InternalVoucher);
    await voucherRepository.save(voucherRepository.create({ saleCode: sale.code, seriesId: series.id, number: voucherNumber, issuedById: actor.id, issuedAt: new Date(), status: VoucherStatus.ISSUED }));
    await this.ledger.append(manager, { customerId: sale.customerId, saleCode: sale.code, type: AccountMovementType.SALE_DEBIT, debitCents: totalCents, description: `Venta ${sale.code}`, actorId: actor.id });
    return sale.id;
  }

  async voucher(id: string, actor: AuthenticatedUser) {
    const sale = await this.findOne(id, actor);
    if (!sale.voucher) throw new NotFoundException('Comprobante interno no encontrado');
    return { ...sale.voucher, sale, legend: INTERNAL_VOUCHER_LEGEND };
  }

  async voucherPdf(id: string, actor: AuthenticatedUser): Promise<{ filename: string; content: Buffer }> {
    const item = await this.voucher(id, actor);
    const voucherNumber = `${item.series.series}-${String(item.number).padStart(8, '0')}`;
    const lines = [
      `Comprobante: ${voucherNumber}`,
      `Cod-Venta: ${item.sale.code}`,
      `Pedido: ${item.sale.order.code}`,
      `Cliente: ${item.sale.customer.businessName}`,
      `Fecha de emisión: ${item.sale.issuedDate}`,
      `Vencimiento: ${item.sale.dueDate}`,
      '',
      ...item.sale.details.map((detail) => `${detail.productSnapshot} | ${detail.deliveredQuantity} ${detail.unitSnapshot} x Bs ${detail.unitPrice} | Bs ${detail.subtotal}`),
      '',
      `Total: Bs ${item.sale.total}`,
      `Saldo: Bs ${item.sale.balance}`,
      `Estado: ${item.sale.status}`,
      '',
      INTERNAL_VOUCHER_LEGEND,
    ];
    return { filename: `comprobante-${voucherNumber}.pdf`, content: createSimplePdf('ICAR - Comprobante interno', lines) };
  }

  async void(id: string, dto: VoidCommercialOperationDto, actor: AuthenticatedUser): Promise<Sale> {
    await this.dataSource.transaction(async (manager) => {
      const sale = await manager.getRepository(Sale).createQueryBuilder('sale').setLock('pessimistic_write').where('sale.id = :id', { id }).getOne();
      if (!sale) throw new NotFoundException('Venta no encontrada');
      if (sale.status !== SaleStatus.ISSUED || moneyToCents(sale.balance) !== moneyToCents(sale.total)) throw new UnprocessableEntityException('Solo una venta Emitida y sin pagos confirmados puede anularse');
      const confirmedApplications = await manager.getRepository(PaymentApplication).createQueryBuilder('application')
        .innerJoin('application.payment', 'payment')
        .where('application.saleCode = :saleCode AND payment.status = :status', { saleCode: sale.code, status: PaymentStatus.CONFIRMED })
        .getCount();
      if (confirmedApplications) throw new UnprocessableEntityException('La venta tiene pagos confirmados y no puede anularse');
      await this.ledger.lockCustomer(manager, sale.customerId);
      await this.ledger.append(manager, { customerId: sale.customerId, saleCode: sale.code, type: AccountMovementType.SALE_VOID_CREDIT, creditCents: moneyToCents(sale.total), description: `Anulación de venta ${sale.code}`, actorId: actor.id });
      sale.status = SaleStatus.VOIDED;
      sale.balance = '0.00';
      sale.voidedById = actor.id;
      sale.voidedAt = new Date();
      sale.voidReason = dto.reason.trim();
      await manager.getRepository(Sale).save(sale);
      await manager.getRepository(InternalVoucher).update({ saleCode: sale.code }, { status: VoucherStatus.VOIDED });
    });
    await this.audit.record({ userId: actor.id, module: 'commercial', action: 'ANULAR_VENTA', entity: 'ventas', entityId: id, result: 'EXITOSO', metadata: { reason: dto.reason } });
    return this.findOne(id, actor);
  }

  private scopeSales(builder: SelectQueryBuilder<Sale>, actor: AuthenticatedUser): void {
    if (actor.type === UserType.CUSTOMER) {
      if (!actor.customerId) throw new ForbiddenException('La cuenta no está vinculada con un cliente');
      builder.andWhere('sale.customerId = :scopeCustomerId', { scopeCustomerId: actor.customerId });
    }
  }

  private applyFilters(builder: SelectQueryBuilder<Sale>, query: SaleQueryDto): void {
    if (query.q) builder.andWhere('(CAST(sale.code AS text) ILIKE :q OR orders.code ILIKE :q OR customer.businessName ILIKE :q)', { q: `%${query.q.trim()}%` });
    if (query.orderId) builder.andWhere('sale.orderId = :orderId', { orderId: query.orderId });
    if (query.customerId) builder.andWhere('sale.customerId = :customerId', { customerId: query.customerId });
    if (query.zoneId) builder.andWhere('address.zoneId = :zoneId', { zoneId: query.zoneId });
    if (query.status) builder.andWhere('sale.status = :status', { status: query.status });
    if (query.from) builder.andWhere('sale.issuedDate >= :from', { from: query.from.slice(0, 10) });
    if (query.to) builder.andWhere('sale.issuedDate <= :to', { to: query.to.slice(0, 10) });
    if (query.dueFrom) builder.andWhere('sale.dueDate >= :dueFrom', { dueFrom: query.dueFrom.slice(0, 10) });
    if (query.dueTo) builder.andWhere('sale.dueDate <= :dueTo', { dueTo: query.dueTo.slice(0, 10) });
  }

  private businessDate(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }
}
