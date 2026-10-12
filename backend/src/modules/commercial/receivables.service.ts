import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { paginate } from '../../common/dto/pagination-query.dto';
import { agingRange, centsToMoney, daysPastDue, moneyToCents } from './commercial-calculations';
import { ReceivableQueryDto } from './dto/commercial.dto';
import { SaleStatus } from './entities/commercial.enums';
import { Sale } from './entities/sale.entity';

export interface ReceivableRow {
  sale: Sale;
  receivableStatus: 'VIGENTE' | 'VENCIDA' | 'SALDADA';
  daysPastDue: number;
  agingRange: 'VIGENTE' | '1_30' | '31_60' | '61_90' | 'MAS_90';
}

@Injectable()
export class ReceivablesService {
  constructor(@InjectRepository(Sale) private readonly sales: Repository<Sale>) {}

  async findAll(query: ReceivableQueryDto) {
    const cutoffDate = query.cutoffDate?.slice(0, 10) ?? this.businessDate();
    const builder = this.sales.createQueryBuilder('sale')
      .innerJoinAndSelect('sale.customer', 'customer')
      .innerJoinAndSelect('sale.order', 'orders')
      .leftJoinAndSelect('orders.address', 'address')
      .leftJoinAndSelect('address.zone', 'zone')
      .leftJoinAndSelect('sale.voucher', 'voucher')
      .leftJoinAndSelect('voucher.series', 'series')
      .where('sale.status <> :voided', { voided: SaleStatus.VOIDED })
      .orderBy('sale.dueDate', 'ASC');
    if (query.customerId) builder.andWhere('sale.customerId = :customerId', { customerId: query.customerId });
    if (query.zoneId) builder.andWhere('address.zoneId = :zoneId', { zoneId: query.zoneId });
    const sales = await builder.getMany();
    const rows = sales.map((sale): ReceivableRow => {
      const balance = moneyToCents(sale.balance);
      const overdueDays = balance === 0 ? 0 : daysPastDue(sale.dueDate, cutoffDate);
      return {
        sale,
        receivableStatus: balance === 0 ? 'SALDADA' : sale.dueDate < cutoffDate ? 'VENCIDA' : 'VIGENTE',
        daysPastDue: overdueDays,
        agingRange: balance === 0 || sale.dueDate >= cutoffDate ? 'VIGENTE' : agingRange(sale.dueDate, cutoffDate),
      };
    }).filter((row) => (!query.status || row.receivableStatus === query.status) && (!query.agingRange || row.agingRange === query.agingRange));
    const totalCents = rows.reduce((sum, row) => sum + moneyToCents(row.sale.balance), 0);
    const buckets = { VIGENTE: 0, '1_30': 0, '31_60': 0, '61_90': 0, MAS_90: 0 };
    for (const row of rows) buckets[row.agingRange] += moneyToCents(row.sale.balance);
    const start = (query.page - 1) * query.limit;
    return {
      ...paginate(rows.slice(start, start + query.limit), rows.length, query.page, query.limit),
      cutoffDate,
      totals: { balance: centsToMoney(totalCents), byAging: Object.fromEntries(Object.entries(buckets).map(([key, value]) => [key, centsToMoney(value)])) },
    };
  }

  async all(query: Omit<ReceivableQueryDto, 'page' | 'limit'>): Promise<{ cutoffDate: string; data: ReceivableRow[] }> {
    const response = await this.findAll(Object.assign(new ReceivableQueryDto(), query, { page: 1, limit: 100 }));
    return { cutoffDate: response.cutoffDate, data: response.data };
  }

  private businessDate(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }
}
