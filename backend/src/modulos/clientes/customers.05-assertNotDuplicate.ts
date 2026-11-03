import { ConflictException } from '@nestjs/common';
import { CustomersServiceBase } from './customers.base';

export abstract class CustomersServiceParte05 extends CustomersServiceBase {
  protected async assertNotDuplicate(
      name: string,
      phone: string,
      taxId?: string,
      excludedId?: string,
    ): Promise<void> {
      const builder = this.customerRepository.createQueryBuilder('customer');
      if (taxId) {
        builder.where('lower(customer.taxId) = lower(:taxId)', { taxId });
      } else {
        builder.where('lower(customer.businessName) = lower(:name) AND customer.phone = :phone', {
          name,
          phone,
        });
      }
      if (excludedId) builder.andWhere('customer.id <> :excludedId', { excludedId });
      if (await builder.getOne()) {
        throw new ConflictException('Ya existe un cliente con la identificación definida');
      }
    }
}
