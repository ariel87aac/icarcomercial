import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecordStatus } from '../../compartido/enumeraciones/record-status.enum';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { AuditService } from '../seguridad/auditoria/audit.service';
import {
  CreateDistributionDayDto,
  CreateZoneDto,
  UpdateDistributionDayDto,
  UpdateZoneDto,
} from './dto/zone.dto';
import { DistributionDay } from './entidades/distribution-day.entity';
import { Zone } from './entidades/zone.entity';

@Injectable()
export class ZonesService {
  constructor(
    @InjectRepository(Zone) private readonly zoneRepository: Repository<Zone>,
    @InjectRepository(DistributionDay)
    private readonly dayRepository: Repository<DistributionDay>,
    private readonly auditService: AuditService,
  ) {}

  findAll(): Promise<Zone[]> {
    return this.zoneRepository.find({
      relations: { distributionDays: true },
      order: { name: 'ASC', distributionDays: { weekday: 'ASC' } },
    });
  }

  async create(dto: CreateZoneDto, actor: AuthenticatedUser): Promise<Zone> {
    const name = dto.name.trim();
    if (await this.zoneRepository.exists({ where: { name } })) {
      throw new ConflictException('Ya existe una zona con ese nombre');
    }
    const zone = await this.zoneRepository.save(
      this.zoneRepository.create({ name, description: dto.description?.trim() || null }),
    );
    await this.auditService.record({
      userId: actor.id,
      module: 'zones',
      action: 'CREAR_ZONA',
      entity: 'zonas',
      entityId: zone.id,
      result: 'EXITOSO',
      metadata: { name },
    });
    return zone;
  }

  async update(id: string, dto: UpdateZoneDto, actor: AuthenticatedUser): Promise<Zone> {
    const zone = await this.findZone(id);
    const previousStatus = zone.status;
    const changes: Partial<Zone> = {};
    if (dto.name !== undefined) changes.name = dto.name.trim();
    if (dto.description !== undefined) changes.description = dto.description?.trim() || null;
    if (dto.status !== undefined) changes.status = dto.status;
    await this.zoneRepository.update(id, changes);
    const statusChanged = dto.status !== undefined && dto.status !== previousStatus;
    await this.auditService.record({
      userId: actor.id,
      module: 'zones',
      action: statusChanged
        ? dto.status === 'ACTIVO'
          ? 'ACTIVAR_ZONA'
          : 'DESACTIVAR_ZONA'
        : 'ACTUALIZAR_ZONA',
      entity: 'zonas',
      entityId: zone.id,
      result: 'EXITOSO',
      metadata: {
        fields: Object.keys(dto),
        previousStatus,
        status: dto.status ?? zone.status,
      },
    });
    return this.findZone(id);
  }

  async remove(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<{ id: string; name: string; status: RecordStatus }> {
    const zone = await this.findZone(id);
    if (zone.status === RecordStatus.INACTIVE) {
      return { id, name: zone.name, status: RecordStatus.INACTIVE };
    }
    const snapshot = {
      name: zone.name,
      distributionDays: zone.distributionDays.length,
    };
    await this.zoneRepository.update(id, { status: RecordStatus.INACTIVE });
    await this.auditService.record({
      userId: actor.id,
      module: 'zones',
      action: 'DESACTIVAR_ZONA',
      entity: 'zonas',
      entityId: id,
      result: 'EXITOSO',
      metadata: {
        ...snapshot,
        previousStatus: RecordStatus.ACTIVE,
        status: RecordStatus.INACTIVE,
      },
    });
    return { id, name: snapshot.name, status: RecordStatus.INACTIVE };
  }

  async addDay(zoneId: string, dto: CreateDistributionDayDto, actor: AuthenticatedUser) {
    await this.findZone(zoneId);
    this.validateSchedule(dto.startTime, dto.endTime);
    const existing = await this.dayRepository.findOne({ where: { zoneId, weekday: dto.weekday } });
    if (existing?.status === RecordStatus.ACTIVE) {
      throw new ConflictException('La zona ya tiene configurado ese día');
    }
    if (existing) {
      existing.startTime = dto.startTime ?? null;
      existing.endTime = dto.endTime ?? null;
      existing.status = RecordStatus.ACTIVE;
      const day = await this.dayRepository.save(existing);
      await this.auditService.record({
        userId: actor.id,
        module: 'zones',
        action: 'REACTIVAR_DIA_DISTRIBUCION',
        entity: 'dias_distribucion',
        entityId: day.id,
        result: 'EXITOSO',
        metadata: { zoneId, weekday: day.weekday },
      });
      return day;
    }
    const day = await this.dayRepository.save(
      this.dayRepository.create({
        zoneId,
        weekday: dto.weekday,
        startTime: dto.startTime ?? null,
        endTime: dto.endTime ?? null,
      }),
    );
    await this.auditService.record({
      userId: actor.id,
      module: 'zones',
      action: 'CREAR_DIA_DISTRIBUCION',
      entity: 'dias_distribucion',
      entityId: day.id,
      result: 'EXITOSO',
      metadata: { zoneId, weekday: day.weekday },
    });
    return day;
  }

  async removeDay(
    zoneId: string,
    dayId: string,
    actor: AuthenticatedUser,
  ): Promise<{ id: string; status: RecordStatus }> {
    const day = await this.dayRepository.findOne({ where: { id: dayId, zoneId } });
    if (!day) throw new NotFoundException('Día de distribución no encontrado');
    if (day.status === RecordStatus.INACTIVE) return { id: day.id, status: day.status };
    await this.dayRepository.update(day.id, { status: RecordStatus.INACTIVE });
    await this.auditService.record({
      userId: actor.id,
      module: 'zones',
      action: 'DESACTIVAR_DIA_DISTRIBUCION',
      entity: 'dias_distribucion',
      entityId: day.id,
      result: 'EXITOSO',
      metadata: { zoneId, weekday: day.weekday, previousStatus: day.status, status: RecordStatus.INACTIVE },
    });
    return { id: day.id, status: RecordStatus.INACTIVE };
  }

  async updateDay(
    zoneId: string,
    dayId: string,
    dto: UpdateDistributionDayDto,
    actor: AuthenticatedUser,
  ) {
    const day = await this.dayRepository.findOne({ where: { id: dayId, zoneId } });
    if (!day) throw new NotFoundException('Día de distribución no encontrado');
    const previousStatus = day.status;
    const start = dto.startTime ?? day.startTime ?? undefined;
    const end = dto.endTime ?? day.endTime ?? undefined;
    this.validateSchedule(start, end);
    if (dto.weekday !== undefined) day.weekday = dto.weekday;
    if (dto.startTime !== undefined) day.startTime = dto.startTime;
    if (dto.endTime !== undefined) day.endTime = dto.endTime;
    if (dto.status !== undefined) day.status = dto.status;
    await this.dayRepository.save(day);
    const statusChanged = dto.status !== undefined && dto.status !== previousStatus;
    await this.auditService.record({
      userId: actor.id,
      module: 'zones',
      action: statusChanged
        ? dto.status === 'ACTIVO'
          ? 'ACTIVAR_DIA_DISTRIBUCION'
          : 'DESACTIVAR_DIA_DISTRIBUCION'
        : 'ACTUALIZAR_DIA_DISTRIBUCION',
      entity: 'dias_distribucion',
      entityId: day.id,
      result: 'EXITOSO',
      metadata: {
        fields: Object.keys(dto),
        zoneId,
        previousStatus,
        status: day.status,
      },
    });
    return day;
  }

  private async findZone(id: string): Promise<Zone> {
    const zone = await this.zoneRepository.findOne({
      where: { id },
      relations: { distributionDays: true },
    });
    if (!zone) throw new NotFoundException('Zona no encontrada');
    return zone;
  }

  private validateSchedule(start?: string, end?: string): void {
    if (start && end && end <= start) {
      throw new ConflictException('La hora final debe ser posterior a la hora inicial');
    }
  }
}
