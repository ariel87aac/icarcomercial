import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { Customer } from '../clientes/entidades/customer.entity';
import { UserType } from '../seguridad/usuarios/entidades/user-type.enum';
import { moneyToCents, centsToMoney } from './commercial-calculations';
import { AccountQueryDto } from './dto/commercial.dto';
import { CustomerAccountMovement } from './entidades/customer-account-movement.entity';
import { Payment } from './entidades/payment.entity';
import { Sale } from './entidades/sale.entity';

@Injectable()
export class AccountStatementService {
  constructor(
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectRepository(Sale) private readonly sales: Repository<Sale>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(CustomerAccountMovement) private readonly movements: Repository<CustomerAccountMovement>,
  ) {}

  async own(query: AccountQueryDto, actor: AuthenticatedUser) {
    if (!actor.customerId) throw new ForbiddenException('La cuenta no está vinculada con un cliente');
    return this.get(actor.customerId, query, actor);
  }

  async get(customerId: string, query: AccountQueryDto, actor: AuthenticatedUser) {
    if (actor.type === UserType.CUSTOMER && actor.customerId !== customerId) throw new ForbiddenException('Solo puede consultar su propio estado de cuenta');
    const customer = await this.customers.findOne({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Cliente no encontrado');
    const salesBuilder = this.sales.createQueryBuilder('sale')
      .leftJoinAndSelect('sale.order', 'orders')
      .leftJoinAndSelect('sale.voucher', 'voucher')
      .leftJoinAndSelect('voucher.series', 'series')
      .where('sale.customerId = :customerId', { customerId })
      .orderBy('sale.issuedDate', 'ASC');
    const paymentsBuilder = this.payments.createQueryBuilder('payment')
      .leftJoinAndSelect('payment.paymentMethod', 'paymentMethod')
      .leftJoinAndSelect('payment.applications', 'application')
      .leftJoinAndSelect('application.sale', 'sale')
      .where('payment.customerId = :customerId', { customerId })
      .orderBy('payment.paymentDate', 'ASC');
    const movementsBuilder = this.movements.createQueryBuilder('movement')
      .leftJoinAndSelect('movement.sale', 'sale')
      .leftJoinAndSelect('movement.paymentApplication', 'application')
      .leftJoinAndSelect('application.payment', 'payment')
      .where('movement.customerId = :customerId', { customerId })
      .orderBy('movement.occurredAt', 'ASC')
      .addOrderBy('movement.id', 'ASC');
    if (query.from) {
      salesBuilder.andWhere('sale.issuedDate >= :from', { from: query.from.slice(0, 10) });
      paymentsBuilder.andWhere('payment.paymentDate >= :from', { from: query.from.slice(0, 10) });
      movementsBuilder.andWhere('movement.occurredAt >= :from', { from: query.from });
    }
    if (query.to) {
      salesBuilder.andWhere('sale.issuedDate <= :to', { to: query.to.slice(0, 10) });
      paymentsBuilder.andWhere('payment.paymentDate <= :to', { to: query.to.slice(0, 10) });
      movementsBuilder.andWhere('movement.occurredAt < (:to::date + interval \'1 day\')', { to: query.to.slice(0, 10) });
    }
    const [sales, payments, movements] = await Promise.all([salesBuilder.getMany(), paymentsBuilder.getMany(), movementsBuilder.getMany()]);
    const totalBalance = sales.reduce((sum, sale) => sum + moneyToCents(sale.balance), 0);
    return { customer, balance: centsToMoney(totalBalance), sales, payments, movements };
  }
}
