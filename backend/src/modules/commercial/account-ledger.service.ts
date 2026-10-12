import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { centsToMoney, moneyToCents } from './commercial-calculations';
import { AccountMovementType } from './entities/commercial.enums';
import { CustomerAccountMovement } from './entities/customer-account-movement.entity';

export interface AppendMovementInput {
  customerId: string;
  saleId?: string | null;
  paymentApplicationId?: string | null;
  type: AccountMovementType;
  debitCents?: number;
  creditCents?: number;
  description: string;
  actorId: string;
}

@Injectable()
export class AccountLedgerService {
  async lockCustomer(manager: EntityManager, customerId: string): Promise<void> {
    const rows = await manager.query<{ id: string }[]>(`SELECT id FROM clientes WHERE id = $1 FOR UPDATE`, [customerId]);
    if (!rows.length) throw new UnprocessableEntityException('El cliente no existe');
  }

  async currentBalanceCents(manager: EntityManager, customerId: string): Promise<number> {
    const last = await manager.getRepository(CustomerAccountMovement).findOne({
      where: { customerId },
      order: { occurredAt: 'DESC', id: 'DESC' },
    });
    return last ? moneyToCents(last.resultingBalance) : 0;
  }

  async append(manager: EntityManager, input: AppendMovementInput): Promise<CustomerAccountMovement> {
    const debitCents = input.debitCents ?? 0;
    const creditCents = input.creditCents ?? 0;
    if ((debitCents > 0) === (creditCents > 0)) throw new UnprocessableEntityException('El movimiento debe registrar un débito o un crédito');
    const balance = await this.currentBalanceCents(manager, input.customerId);
    const resulting = balance + debitCents - creditCents;
    if (resulting < 0) throw new UnprocessableEntityException('El movimiento produciría un saldo negativo');
    const repository = manager.getRepository(CustomerAccountMovement);
    return repository.save(repository.create({
      customerId: input.customerId,
      saleId: input.saleId ?? null,
      paymentApplicationId: input.paymentApplicationId ?? null,
      type: input.type,
      debit: centsToMoney(debitCents),
      credit: centsToMoney(creditCents),
      resultingBalance: centsToMoney(resulting),
      description: input.description,
      registeredById: input.actorId,
    }));
  }
}
