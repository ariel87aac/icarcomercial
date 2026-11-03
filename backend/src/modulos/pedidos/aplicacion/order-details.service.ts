import { OrderValidationPort, OrderValidationReader } from './puertos/order-validation.port';
import { BadRequestException, NotFoundException, UnprocessableEntityException, Injectable } from '@nestjs/common';
import { OrderItemDto } from '../dto/order.dto';
import { orderDetailValues } from '../dominio/order-detail-values';
import { RecordStatus } from '../../../compartido/enumeraciones/record-status.enum';
import { ProductPresentation } from '../../productos/catalogo/entidades/product-presentation.entity';
import { CustomerAddress } from '../../clientes/entidades/customer-address.entity';
import { Customer } from '../../clientes/entidades/customer.entity';
import { OrderScheduleWindow } from './puertos/order-scheduling.port';

interface ResolvedItem {
  presentation: ProductPresentation;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}
@Injectable()
export class OrderDetailsService {
  constructor(private readonly validation: OrderValidationPort) {}

  async validateOrder(
    customerId: string,
    addressId: string,
    requestedDate: string,
    details: OrderItemDto[],
    reader: OrderValidationReader = this.validation,
    requireOpen = true,
  ): Promise<{ customer: Customer; address: CustomerAddress; items: ResolvedItem[]; schedule: OrderScheduleWindow }> {
    const customer = await reader.customer(customerId);
    if (!customer) throw new NotFoundException('Cliente no encontrado o inactivo');
    const address = await reader.address(addressId, customerId);
    if (!address) throw new UnprocessableEntityException('El domicilio no pertenece al cliente o está inactivo');
    const schedule = await reader.schedule(address, requestedDate, requireOpen);
    if (!details.length) throw new BadRequestException('El pedido debe incluir al menos un detalle');
    const uniqueIds = new Set(details.map((detail) => detail.presentationId));
    if (uniqueIds.size !== details.length)
      throw new BadRequestException('Una presentación no puede repetirse en el detalle');
    const today = new Date().toISOString().slice(0, 10);
    const items: ResolvedItem[] = [];
    for (const detail of details) {
      const presentation = await reader.presentation(detail.presentationId);
      if (!presentation || presentation.product.status !== RecordStatus.ACTIVE) {
        throw new UnprocessableEntityException('El pedido contiene un producto o presentación inactiva');
      }
      const price = await reader.price(presentation.id, customer, today);
      if (!price)
        throw new UnprocessableEntityException(`No existe un precio aplicable para ${presentation.description}`);
      const unitPrice = Number(price.amount);
      items.push({ presentation, quantity: detail.quantity, unitPrice, subtotal: unitPrice * detail.quantity });
    }
    return { customer, address, items, schedule };
  }

  detailValues(item: ResolvedItem) {
    return orderDetailValues({
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
      productDescription: item.presentation.product.name,
      presentationDescription: item.presentation.description,
      unitAbbreviation: item.presentation.unit.abbreviation,
    });
  }
}
