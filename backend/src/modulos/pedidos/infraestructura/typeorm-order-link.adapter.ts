import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderLinkPort } from '../aplicacion/puertos/order-link.port';
import { OrderConfirmationLink } from '../entidades/order-confirmation-link.entity';

@Injectable()
export class TypeOrmOrderLinkAdapter extends OrderLinkPort {
  constructor(@InjectRepository(OrderConfirmationLink) private readonly links: Repository<OrderConfirmationLink>) {
    super();
  }
  findByHash(tokenHash: string) {
    return this.links.findOne({ where: { tokenHash } });
  }
  async save(link: OrderConfirmationLink): Promise<void> {
    await this.links.save(link);
  }
}
