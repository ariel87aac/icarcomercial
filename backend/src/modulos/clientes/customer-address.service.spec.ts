import { describe, expect, it, vi } from 'vitest';
import { RecordStatus } from '../../compartido/enumeraciones/record-status.enum';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { UserType } from '../seguridad/usuarios/entidades/user-type.enum';
import { CustomerAddress } from './entidades/customer-address.entity';
import { CustomersService } from './customers.service';

const actor = {
  id: 'actor-1', sessionId: 'session-1', name: 'Administrador', email: null,
  username: 'admin', mustChangePassword: false, type: UserType.INTERNAL,
  customerId: null, roles: ['ADMINISTRADOR'], permissions: ['customers.update'], productionAreaIds: [],
} satisfies AuthenticatedUser;

function address(overrides: Partial<CustomerAddress> = {}): CustomerAddress {
  return {
    id: 'address-1', customerId: 'customer-1', label: 'Principal', address: 'Calle prueba 123',
    reference: null, latitude: null, longitude: null, zoneId: null, zone: null,
    distributionDayId: null, distributionDay: null, isPrimary: true, status: RecordStatus.ACTIVE,
    ...overrides,
  } as CustomerAddress;
}

function setup(target = address()) {
  const customerRepository = { findOne: vi.fn().mockResolvedValue({ id: target.customerId }) };
  const addressRepository = {
    findOne: vi.fn().mockResolvedValue(target),
    findOneOrFail: vi.fn().mockImplementation(async () => target),
  };
  const transactionRepository = {
    exists: vi.fn(), update: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockImplementation(async (value) => value),
    create: vi.fn().mockImplementation((value) => value), findOne: vi.fn(),
  };
  const dataSource = {
    transaction: vi.fn().mockImplementation(async (work) => work({
      getRepository: () => transactionRepository,
    })),
  };
  const auditService = { record: vi.fn().mockResolvedValue(undefined) };
  const service = new CustomersService(
    customerRepository as never, addressRepository as never, {} as never, {} as never,
    {} as never, {} as never, {} as never, dataSource as never, auditService as never,
  );
  return { service, transactionRepository };
}

describe('domicilio predeterminado del cliente', () => {
  it('convierte el primer domicilio activo en predeterminado aunque no venga marcado', async () => {
    const { service, transactionRepository } = setup();
    transactionRepository.exists.mockResolvedValue(false);
    await service.addAddress('customer-1', {
      label: 'Casa', address: 'Calle prueba 123', isPrimary: false,
    }, actor);
    expect(transactionRepository.save).toHaveBeenCalledWith(expect.objectContaining({ isPrimary: true }));
  });

  it('al inactivar el predeterminado promueve el domicilio activo más antiguo', async () => {
    const target = address();
    const replacement = address({ id: 'address-2', label: 'Sucursal', isPrimary: false });
    const { service, transactionRepository } = setup(target);
    transactionRepository.exists.mockResolvedValue(false);
    transactionRepository.findOne.mockResolvedValue(replacement);
    await service.updateAddress(target.customerId, target.id, { status: RecordStatus.INACTIVE }, actor);
    expect(transactionRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      status: RecordStatus.INACTIVE, isPrimary: false,
    }));
    expect(transactionRepository.update).toHaveBeenCalledWith(replacement.id, { isPrimary: true });
  });

  it('al elegir otro domicilio desmarca el anterior y conserva uno solo como predeterminado', async () => {
    const target = address({ id: 'address-2', isPrimary: false });
    const { service, transactionRepository } = setup(target);
    transactionRepository.exists.mockResolvedValue(true);
    await service.updateAddress(target.customerId, target.id, { isPrimary: true }, actor);
    expect(transactionRepository.update).toHaveBeenCalledWith(
      { customerId: target.customerId, isPrimary: true }, { isPrimary: false },
    );
    expect(transactionRepository.save).toHaveBeenCalledWith(expect.objectContaining({ isPrimary: true }));
  });
});
