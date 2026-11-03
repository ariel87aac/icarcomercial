import { describe, expect, it, vi } from 'vitest';
import { DataSource, EntityManager } from 'typeorm';
import { TypeOrmOrderValidationAdapter } from './typeorm-order-validation.adapter';
import { PricingService } from '../../productos/precios/pricing.service';
import { OrderSchedulingService } from '../order-scheduling.service';
import { Customer } from '../../clientes/entidades/customer.entity';

function manager(id: string) {
  const findOne = vi.fn().mockResolvedValue({ id });
  const getRepository = vi.fn().mockReturnValue({ findOne });
  return { value: { getRepository } as unknown as EntityManager, getRepository, findOne };
}

describe('sesiones de lectura TypeORM para validación', () => {
  it('aísla dos transacciones y sus precios sin modificar la conexión general', async () => {
    const general = manager('general'),
      first = manager('first'),
      second = manager('second');
    const pricing = { resolveApplicablePrice: vi.fn().mockResolvedValue({ amount: '10.00' }) };
    const adapter = new TypeOrmOrderValidationAdapter(
      { manager: general.value } as DataSource,
      pricing as unknown as PricingService,
      {} as OrderSchedulingService,
    );
    const a = adapter.forTransaction(first.value),
      b = adapter.forTransaction(second.value);
    const customer = { id: 'customer' } as Customer;
    const [one, two] = await Promise.all([a.customer('customer'), b.customer('customer')]);
    expect(one?.id).toBe('first');
    expect(two?.id).toBe('second');
    await Promise.all([a.price('product', customer, '2030-01-01'), b.price('product', customer, '2030-01-01')]);
    expect(pricing.resolveApplicablePrice).toHaveBeenCalledWith('product', customer, '2030-01-01', first.value);
    expect(pricing.resolveApplicablePrice).toHaveBeenCalledWith('product', customer, '2030-01-01', second.value);
    expect(general.getRepository).not.toHaveBeenCalled();
    expect((await adapter.customer('customer'))?.id).toBe('general');
    expect((await a.customer('customer'))?.id).toBe('first');
  });

  it('mantiene filtros de actividad y pertenencia del domicilio dentro de la sesión', async () => {
    const scoped = manager('address');
    const adapter = new TypeOrmOrderValidationAdapter(
      {} as DataSource,
      {} as PricingService,
      {} as OrderSchedulingService,
    );
    await adapter.forTransaction(scoped.value).address('address', 'owner');
    expect(scoped.findOne).toHaveBeenCalledWith({
      where: { id: 'address', customerId: 'owner', status: 'ACTIVO' },
      relations: { zone: { distributionDays: true }, distributionDay: true },
    });
  });
});
