import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { paginate, PaginatedResponse } from '../../common/dto/pagination-query.dto';
import { sanitizeSecrets } from '../../common/utils/secret-sanitizer.util';
import { AuditQueryDto } from './dto/audit-query.dto';
import { AuditEvent } from './entities/audit-event.entity';

export interface AuditEntry {
  userId?: string | null;
  module: string;
  action: string;
  entity: string;
  entityId?: string | null;
  result: 'EXITOSO' | 'RECHAZADO' | 'ERROR';
  ipAddress?: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditEvent)
    private readonly auditRepository: Repository<AuditEvent>,
  ) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.auditRepository.save(
      this.auditRepository.create({
        userId: entry.userId ?? null,
        module: entry.module,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        result: entry.result,
        ipAddress: entry.ipAddress ?? null,
        metadata: (sanitizeSecrets(entry.metadata ?? {}) ?? {}) as Record<string, unknown>,
      }),
    );
  }

  async findAll(query: AuditQueryDto): Promise<PaginatedResponse<AuditEvent>> {
    const builder = this.auditRepository
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.user', 'user')
      .orderBy('event.occurredAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    if (query.userId) builder.andWhere('event.userId = :userId', { userId: query.userId });
    if (query.module) builder.andWhere('event.module = :module', { module: query.module });
    if (query.entity) builder.andWhere('event.entity = :entity', { entity: query.entity });
    if (query.action) builder.andWhere('event.action = :action', { action: query.action });
    if (query.entityId) builder.andWhere('event.entityId = :entityId', { entityId: query.entityId });
    if (query.result) builder.andWhere('event.result = :result', { result: query.result });
    if (query.from) builder.andWhere('event.occurredAt >= :from', { from: query.from });
    if (query.to) builder.andWhere('event.occurredAt <= :to', { to: query.to });

    const [events, total] = await builder.getManyAndCount();
    return paginate(events, total, query.page, query.limit);
  }
}
