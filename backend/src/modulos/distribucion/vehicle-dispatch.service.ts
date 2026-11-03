import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { paginate } from '../../compartido/dto/pagination-query.dto';
import { RecordStatus } from '../../compartido/enumeraciones/record-status.enum';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { AuditEvent } from '../seguridad/auditoria/entidades/audit-event.entity';
import { User } from '../seguridad/usuarios/entidades/user.entity';
import { Zone } from '../zonas-reparto/entidades/zone.entity';
import { Vehicle } from './flota/entidades/vehicle.entity';
import { ActiveVehicleDispatchQueryDto, CreateVehicleDispatchDto, HandoverVehicleDispatchDto, ReturnVehicleDispatchDto, VehicleDispatchQueryDto } from './dto/vehicle-dispatch.dto';
import { DistributionRoute } from './entidades/distribution-route.entity';
import { DistributionRouteStatus, VehicleDispatchStatus } from './entidades/distribution.enums';
import { VehicleDispatch } from './entidades/vehicle-dispatch.entity';

@Injectable()
export class VehicleDispatchService {
  constructor(private readonly dataSource: DataSource) {}

  async findAll(query: VehicleDispatchQueryDto) {
    const builder = this.dataSource.getRepository(VehicleDispatch).createQueryBuilder('dispatch')
      .leftJoinAndSelect('dispatch.vehicle', 'vehicle')
      .leftJoinAndSelect('dispatch.responsible', 'responsible')
      .leftJoinAndSelect('dispatch.zones', 'zone')
      .leftJoinAndSelect('dispatch.handedOverBy', 'handedOverBy')
      .leftJoinAndSelect('dispatch.returnRegisteredBy', 'returnRegisteredBy')
      .loadRelationCountAndMap('dispatch.routeCount', 'dispatch.routes')
      .orderBy('dispatch.code', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    if (query.status) builder.andWhere('dispatch.status = :status', { status: query.status });
    if (query.q?.trim()) builder.andWhere(`(CAST(dispatch.code AS text) ILIKE :q OR vehicle.plate ILIKE :q OR unaccent(responsible.name) ILIKE unaccent(:q))`, { q: `%${query.q.trim()}%` });
    const [items, total] = await builder.getManyAndCount();
    return paginate(items, total, query.page, query.limit);
  }

  findActive(query: ActiveVehicleDispatchQueryDto): Promise<VehicleDispatch[]> {
    const builder = this.dataSource.getRepository(VehicleDispatch).createQueryBuilder('dispatch')
      .innerJoinAndSelect('dispatch.vehicle', 'vehicle')
      .innerJoinAndSelect('dispatch.responsible', 'responsible')
      .innerJoinAndSelect('dispatch.zones', 'zone')
      .where('dispatch.status = :status', { status: VehicleDispatchStatus.ACTIVE })
      .andWhere('vehicle.status = :vehicleStatus', { vehicleStatus: RecordStatus.ACTIVE })
      .orderBy('vehicle.plate', 'ASC');
    if (query.zoneId) builder.andWhere('zone.id = :zoneId', { zoneId: query.zoneId });
    return builder.getMany();
  }

  async create(dto: CreateVehicleDispatchDto, actor: AuthenticatedUser): Promise<VehicleDispatch> {
    if (new Set(dto.zoneIds).size !== dto.zoneIds.length) throw new BadRequestException('No puede repetir una zona');
    const id = await this.dataSource.transaction(async (manager) => {
      const vehicle = await manager.getRepository(Vehicle).findOne({ where: { id: dto.vehicleId, status: RecordStatus.ACTIVE } });
      if (!vehicle) throw new NotFoundException('Vehículo no encontrado o inactivo');
      if (!vehicle.capacityKg || Number(vehicle.capacityKg) <= 0) throw new UnprocessableEntityException('El vehículo debe tener capacidad válida en kg');
      const responsible = await manager.getRepository(User).createQueryBuilder('user')
        .leftJoinAndSelect('user.roles', 'role')
        .where('user.id = :id', { id: dto.responsibleId })
        .andWhere('user.status = :status', { status: RecordStatus.ACTIVE })
        .andWhere('role.name IN (:...roles)', { roles: ['REPARTIDOR', 'DISTRIBUCION'] })
        .getOne();
      if (!responsible) throw new NotFoundException('El responsable debe estar activo y autorizado para distribución');
      const zones = await manager.getRepository(Zone).find({ where: { id: In(dto.zoneIds), status: RecordStatus.ACTIVE } });
      if (zones.length !== dto.zoneIds.length) throw new NotFoundException('Todas las zonas deben existir y estar activas');
      const open = [VehicleDispatchStatus.PENDING, VehicleDispatchStatus.ACTIVE];
      if (await manager.getRepository(VehicleDispatch).exists({ where: { vehicleId: vehicle.id, status: In(open) } })) throw new ConflictException('El vehículo ya tiene un despacho pendiente o activo');
      if (await manager.getRepository(VehicleDispatch).exists({ where: { responsibleId: responsible.id, status: In(open) } })) throw new ConflictException('El distribuidor ya tiene un vehículo pendiente o activo');
      const repository = manager.getRepository(VehicleDispatch);
      const dispatch = await repository.save(repository.create({
        vehicleId: vehicle.id, responsibleId: responsible.id, zones, status: VehicleDispatchStatus.PENDING,
        createdById: actor.id, handedOverById: null, handedOverAt: null, initialOdometer: null,
        handoverObservation: null, returnRegisteredById: null, returnedAt: null, finalOdometer: null, returnObservation: null,
      }));
      await this.audit(manager, actor.id, 'CREAR_DESPACHO_VEHICULO', dispatch.id, { vehicleId: vehicle.id, responsibleId: responsible.id, zoneIds: dto.zoneIds });
      return dispatch.id;
    });
    return this.findOne(id);
  }

  async handover(id: string, dto: HandoverVehicleDispatchDto, actor: AuthenticatedUser): Promise<VehicleDispatch> {
    await this.dataSource.transaction(async (manager) => {
      const dispatch = await this.lock(manager, id);
      if (dispatch.status !== VehicleDispatchStatus.PENDING) throw new ConflictException('Sólo un despacho pendiente puede registrar la entrega del vehículo');
      const current = await manager.getRepository(VehicleDispatch).findOne({ where: { id }, relations: { vehicle: true, responsible: true, zones: true } });
      if (!current || current.vehicle.status !== RecordStatus.ACTIVE) throw new ConflictException('El vehículo ya no está activo');
      if (current.responsible.status !== RecordStatus.ACTIVE) throw new ConflictException('El distribuidor ya no está activo');
      if (!current.zones.length || current.zones.some((zone) => zone.status !== RecordStatus.ACTIVE)) throw new ConflictException('Todas las zonas asignadas deben permanecer activas');
      dispatch.status = VehicleDispatchStatus.ACTIVE;
      dispatch.handedOverById = actor.id;
      dispatch.handedOverAt = new Date();
      dispatch.initialOdometer = dto.initialOdometer.toFixed(1);
      dispatch.handoverObservation = dto.observation?.trim() || null;
      await manager.getRepository(VehicleDispatch).save(dispatch);
      await this.audit(manager, actor.id, 'ENTREGAR_VEHICULO_DISTRIBUCION', dispatch.id, { initialOdometer: dispatch.initialOdometer });
    });
    return this.findOne(id);
  }

  async returnVehicle(id: string, dto: ReturnVehicleDispatchDto, actor: AuthenticatedUser): Promise<VehicleDispatch> {
    await this.dataSource.transaction(async (manager) => {
      const dispatch = await this.lock(manager, id);
      if (dispatch.status !== VehicleDispatchStatus.ACTIVE) throw new ConflictException('Sólo un despacho activo puede registrar la devolución');
      if (dto.finalOdometer < Number(dispatch.initialOdometer)) throw new BadRequestException('El kilometraje final no puede ser menor al inicial');
      const unfinished = await manager.getRepository(DistributionRoute).count({
        where: { vehicleDispatchId: dispatch.id, status: In([DistributionRouteStatus.DRAFT, DistributionRouteStatus.PLANNED, DistributionRouteStatus.IN_DELIVERY]) },
      });
      if (unfinished) throw new ConflictException(`Existen ${unfinished} ruta(s) sin finalizar o cancelar para esta asignación`);
      dispatch.status = VehicleDispatchStatus.RETURNED;
      dispatch.returnRegisteredById = actor.id;
      dispatch.returnedAt = new Date();
      dispatch.finalOdometer = dto.finalOdometer.toFixed(1);
      dispatch.returnObservation = dto.observation?.trim() || null;
      await manager.getRepository(VehicleDispatch).save(dispatch);
      await this.audit(manager, actor.id, 'REGISTRAR_DEVOLUCION_VEHICULO', dispatch.id, {
        initialOdometer: dispatch.initialOdometer,
        finalOdometer: dispatch.finalOdometer,
        traveledKilometers: dto.finalOdometer - Number(dispatch.initialOdometer),
      });
    });
    return this.findOne(id);
  }

  private async findOne(id: string): Promise<VehicleDispatch> {
    const dispatch = await this.dataSource.getRepository(VehicleDispatch).findOne({
      where: { id },
      relations: { vehicle: true, responsible: true, zones: true, createdBy: true, handedOverBy: true, returnRegisteredBy: true },
    });
    if (!dispatch) throw new NotFoundException('Despacho de vehículo no encontrado');
    dispatch.routeCount = await this.dataSource.getRepository(DistributionRoute).count({ where: { vehicleDispatchId: id } });
    return dispatch;
  }

  private async lock(manager: EntityManager, id: string): Promise<VehicleDispatch> {
    const dispatch = await manager.getRepository(VehicleDispatch).createQueryBuilder('dispatch').setLock('pessimistic_write').where('dispatch.id = :id', { id }).getOne();
    if (!dispatch) throw new NotFoundException('Despacho de vehículo no encontrado');
    return dispatch;
  }

  private async audit(manager: EntityManager, userId: string, action: string, entityId: string, metadata: Record<string, unknown>): Promise<void> {
    const repository = manager.getRepository(AuditEvent);
    await repository.save(repository.create({ userId, module: 'distribution', action, entity: 'despachos_vehiculos', entityId, result: 'EXITOSO', ipAddress: null, metadata }));
  }
}
