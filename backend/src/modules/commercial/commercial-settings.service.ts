import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { RecordStatus } from '../../common/enums/record-status.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { CreatePaymentMethodDto, SaveVoucherSeriesDto, UpdatePaymentMethodDto } from './dto/commercial.dto';
import { PaymentMethod } from './entities/payment-method.entity';
import { VoucherSeries } from './entities/voucher-series.entity';

@Injectable()
export class CommercialSettingsService {
  constructor(
    @InjectRepository(PaymentMethod) private readonly methods: Repository<PaymentMethod>,
    @InjectRepository(VoucherSeries) private readonly series: Repository<VoucherSeries>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  paymentMethods(activeOnly = true): Promise<PaymentMethod[]> {
    return this.methods.find({ where: activeOnly ? { status: RecordStatus.ACTIVE } : {}, order: { name: 'ASC' } });
  }

  async settings() {
    return { paymentMethods: await this.paymentMethods(false), voucherSeries: await this.series.find({ order: { type: 'ASC', series: 'ASC' } }) };
  }

  async createMethod(dto: CreatePaymentMethodDto, actor: AuthenticatedUser): Promise<PaymentMethod> {
    const name = dto.name.trim().toUpperCase();
    if (await this.methods.findOne({ where: { name } })) throw new ConflictException('Ya existe un medio de pago con ese nombre');
    const item = await this.methods.save(this.methods.create({ name, requiresReference: dto.requiresReference, status: dto.status }));
    await this.audit.record({ userId: actor.id, module: 'commercial', action: 'CREAR_MEDIO_PAGO', entity: 'medios_pago', entityId: item.id, result: 'EXITOSO' });
    return item;
  }

  async updateMethod(id: string, dto: UpdatePaymentMethodDto, actor: AuthenticatedUser): Promise<PaymentMethod> {
    const item = await this.methods.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Medio de pago no encontrado');
    if (dto.name !== undefined) item.name = dto.name.trim().toUpperCase();
    if (dto.requiresReference !== undefined) item.requiresReference = dto.requiresReference;
    if (dto.status !== undefined) item.status = dto.status;
    const saved = await this.methods.save(item);
    await this.audit.record({ userId: actor.id, module: 'commercial', action: 'ACTUALIZAR_MEDIO_PAGO', entity: 'medios_pago', entityId: id, result: 'EXITOSO' });
    return saved;
  }

  async saveSeries(dto: SaveVoucherSeriesDto, actor: AuthenticatedUser): Promise<VoucherSeries> {
    const id = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(VoucherSeries);
      if (dto.status === RecordStatus.ACTIVE) await repository.createQueryBuilder().update().set({ status: RecordStatus.INACTIVE }).where('tipo = :type AND estado = :status', { type: 'COMPROBANTE_INTERNO', status: RecordStatus.ACTIVE }).execute();
      let item = await repository.findOne({ where: { type: 'COMPROBANTE_INTERNO', series: dto.series.trim().toUpperCase() } });
      if (item) {
        item.status = dto.status;
      } else {
        item = repository.create({ type: 'COMPROBANTE_INTERNO', series: dto.series.trim().toUpperCase(), nextNumber: '1', status: dto.status });
      }
      return (await repository.save(item)).id;
    });
    await this.audit.record({ userId: actor.id, module: 'commercial', action: 'CONFIGURAR_SERIE', entity: 'series_comprobante', entityId: id, result: 'EXITOSO', metadata: { series: dto.series, status: dto.status } });
    return this.series.findOneByOrFail({ id });
  }
}
