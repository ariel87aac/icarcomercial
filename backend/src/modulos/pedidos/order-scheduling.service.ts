import { BadRequestException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecordStatus } from '../../compartido/enumeraciones/record-status.enum';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { AuditService } from '../seguridad/auditoria/audit.service';
import { CustomerAddress } from '../clientes/entidades/customer-address.entity';
import { UserType } from '../seguridad/usuarios/entidades/user-type.enum';
import { UpdateOrderSchedulingDto } from './dto/order-scheduling.dto';
import { OrderSchedulingSetting } from './entidades/order-scheduling-setting.entity';

export interface OrderScheduleWindow {
  deliveryDate: string;
  weekday: number;
  orderCutoffAt: Date;
  preparationAt: Date;
  zoneId: string;
  zoneName: string;
}

@Injectable()
export class OrderSchedulingService {
  constructor(
    @InjectRepository(OrderSchedulingSetting)
    private readonly settingRepository: Repository<OrderSchedulingSetting>,
    @InjectRepository(CustomerAddress)
    private readonly addressRepository: Repository<CustomerAddress>,
    private readonly auditService: AuditService,
  ) {}

  async settings(): Promise<OrderSchedulingSetting> {
    const stored = await this.settingRepository.findOne({ where: { id: 1 }, relations: { updatedBy: true } });
    if (stored) return stored;
    return this.settingRepository.save(this.settingRepository.create({
      id: 1,
      orderCutoffTime: '13:00',
      orderCutoffLeadDays: 1,
      consolidationDeadlineTime: '18:00',
      preparationLeadDays: 1,
      updatedById: null,
    }));
  }

  async update(dto: UpdateOrderSchedulingDto, actor: AuthenticatedUser): Promise<OrderSchedulingSetting> {
    const setting = await this.settings();
    Object.assign(setting, dto, { updatedById: actor.id });
    await this.settingRepository.save(setting);
    await this.auditService.record({
      userId: actor.id,
      module: 'orders',
      action: 'CONFIGURAR_PROGRAMACION_PEDIDOS',
      entity: 'configuracion_programacion_pedidos',
      entityId: String(setting.id),
      result: 'EXITOSO',
      metadata: {
        orderCutoffTime: dto.orderCutoffTime,
        orderCutoffLeadDays: dto.orderCutoffLeadDays,
        consolidationDeadlineTime: dto.consolidationDeadlineTime,
        preparationLeadDays: dto.preparationLeadDays,
      },
    });
    return this.settings();
  }

  async deliveryOptions(addressId: string, requestedCustomerId: string | undefined, actor: AuthenticatedUser) {
    const customerId = actor.type === UserType.CUSTOMER ? actor.customerId : requestedCustomerId;
    if (!customerId) throw new BadRequestException('Debe seleccionar un cliente antes de consultar las fechas de entrega');
    const address = await this.loadAddress(addressId, customerId);
    const settings = await this.settings();
    const options: OrderScheduleWindow[] = [];
    let date = this.todayInBolivia();
    for (let index = 0; index < 90 && options.length < 16; index += 1) {
      const candidate = this.addDays(date, index);
      try {
        const window = this.resolveWithSettings(address, candidate, settings);
        if (window.orderCutoffAt.getTime() > Date.now()) options.push(window);
      } catch (error) {
        if (!(error instanceof UnprocessableEntityException)) throw error;
      }
    }
    return options;
  }

  async resolve(address: CustomerAddress, deliveryDate: string, requireOpen = true): Promise<OrderScheduleWindow> {
    const window = this.resolveWithSettings(address, deliveryDate, await this.settings());
    if (requireOpen && window.orderCutoffAt.getTime() <= Date.now()) {
      throw new UnprocessableEntityException('El cierre de pedidos para esa fecha de entrega ya finalizó');
    }
    return window;
  }

  assertOrderOpen(orderCutoffAt: Date): void {
    if (new Date(orderCutoffAt).getTime() <= Date.now()) {
      throw new UnprocessableEntityException('El pedido ya alcanzó su fecha y hora de cierre y no admite cambios');
    }
  }

  private async loadAddress(id: string, customerId: string): Promise<CustomerAddress> {
    const address = await this.addressRepository.findOne({
      where: { id, customerId, status: RecordStatus.ACTIVE },
      relations: { zone: { distributionDays: true } },
    });
    if (!address) throw new NotFoundException('Domicilio no encontrado o fuera del alcance del cliente');
    return address;
  }

  private resolveWithSettings(
    address: CustomerAddress,
    deliveryDate: string,
    settings: OrderSchedulingSetting,
  ): OrderScheduleWindow {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) throw new BadRequestException('La fecha de entrega no es válida');
    const parsed = new Date(`${deliveryDate}T12:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== deliveryDate) {
      throw new BadRequestException('La fecha de entrega no es válida');
    }
    const zone = address.zone;
    if (!zone || zone.status !== RecordStatus.ACTIVE) {
      throw new UnprocessableEntityException('El domicilio debe tener una zona activa');
    }
    const weekday = parsed.getUTCDay() === 0 ? 7 : parsed.getUTCDay();
    const allowed = (zone.distributionDays ?? []).some((day) => day.status === RecordStatus.ACTIVE && day.weekday === weekday);
    if (!allowed) throw new UnprocessableEntityException('La fecha elegida no corresponde a un día de reparto activo de la zona');
    const cutoffDate = this.addDays(deliveryDate, -settings.orderCutoffLeadDays);
    const preparationDate = this.addDays(deliveryDate, -settings.preparationLeadDays);
    return {
      deliveryDate,
      weekday,
      orderCutoffAt: this.boliviaDateTime(cutoffDate, settings.orderCutoffTime),
      preparationAt: this.boliviaDateTime(preparationDate, settings.consolidationDeadlineTime),
      zoneId: zone.id,
      zoneName: zone.name,
    };
  }

  private todayInBolivia(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }

  private addDays(date: string, days: number): string {
    const value = new Date(`${date}T12:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  }

  private boliviaDateTime(date: string, time: string): Date {
    return new Date(`${date}T${time.slice(0, 5)}:00-04:00`);
  }
}
