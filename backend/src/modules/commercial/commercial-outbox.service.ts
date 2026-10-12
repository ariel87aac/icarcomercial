import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { NotificationService } from '../tracking/notification.service';
import { CommercialOutboxStatus } from './entities/commercial.enums';
import { CommercialOutbox } from './entities/commercial-outbox.entity';
import { Payment } from './entities/payment.entity';

@Injectable()
export class CommercialOutboxService {
  private readonly logger = new Logger(CommercialOutboxService.name);

  constructor(
    @InjectRepository(CommercialOutbox) private readonly events: Repository<CommercialOutbox>,
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationService,
  ) {}

  async processById(id: string): Promise<boolean> {
    const event = await this.events.findOne({ where: { id } });
    if (!event || event.status === CommercialOutboxStatus.PUBLISHED) return false;
    try {
      const payment = await this.dataSource.getRepository(Payment).findOne({
        where: { id: event.paymentId },
        relations: { customer: true, applications: { sale: { order: true } }, confirmedBy: true },
      });
      if (!payment) throw new Error('El pago del evento no existe');
      await this.notifications.enqueuePayment(payment, event.eventVersion);
      event.status = CommercialOutboxStatus.PUBLISHED;
      event.publishedAt = new Date();
      event.lastError = null;
      event.attempts += 1;
      await this.events.save(event);
      return true;
    } catch (error) {
      event.status = CommercialOutboxStatus.ERROR;
      event.attempts += 1;
      event.lastError = (error instanceof Error ? error.message : 'Error no identificado').slice(0, 500);
      await this.events.save(event);
      this.logger.warn(`No se pudo publicar ${event.eventType} (${event.id}): ${event.lastError}`);
      throw error;
    }
  }

  async processNext(): Promise<boolean> {
    const event = await this.events.createQueryBuilder('event')
      .where('event.status IN (:...states)', { states: [CommercialOutboxStatus.PENDING, CommercialOutboxStatus.ERROR] })
      .andWhere('event.attempts < 10')
      .orderBy('event.updatedAt', 'ASC')
      .getOne();
    return event ? this.processById(event.id) : false;
  }
}
