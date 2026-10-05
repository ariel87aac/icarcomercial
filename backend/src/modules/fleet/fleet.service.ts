import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { paginate } from '../../common/dto/pagination-query.dto';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { CreateVehicleDto, UpdateVehicleDto, VehicleQueryDto } from './dto/vehicle.dto';
import { Vehicle } from './entities/vehicle.entity';

@Injectable()
export class FleetService {
  constructor(
    @InjectRepository(Vehicle) private readonly vehicleRepository: Repository<Vehicle>,
    private readonly audit: AuditService,
  ) {}

  async findAll(query: VehicleQueryDto) {
    const builder = this.vehicleRepository.createQueryBuilder('vehicle')
      .orderBy('vehicle.status', 'ASC')
      .addOrderBy('vehicle.plate', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    if (query.q) builder.andWhere(new Brackets((where) => where.where('vehicle.plate ILIKE :q', { q: `%${query.q}%` }).orWhere('unaccent(vehicle.description) ILIKE unaccent(:q)', { q: `%${query.q}%` })));
    if (query.status) builder.andWhere('vehicle.status = :status', { status: query.status });
    const [items, total] = await builder.getManyAndCount();
    return paginate(items, total, query.page, query.limit);
  }

  async create(dto: CreateVehicleDto, actor: AuthenticatedUser): Promise<Vehicle> {
    const duplicate = await this.vehicleRepository.createQueryBuilder('vehicle').where('lower(vehicle.plate) = lower(:plate)', { plate: dto.plate.trim() }).getOne();
    if (duplicate) throw new ConflictException('La placa ya está registrada');
    const vehicle = await this.vehicleRepository.save(this.vehicleRepository.create({
      plate: dto.plate,
      description: dto.description,
      referenceCapacity: dto.referenceCapacity?.toFixed(3) ?? null,
    }));
    await this.audit.record({ userId: actor.id, module: 'vehicles', action: 'CREAR_VEHICULO', entity: 'vehiculos', entityId: vehicle.id, result: 'EXITOSO' });
    return vehicle;
  }

  async update(id: string, dto: UpdateVehicleDto, actor: AuthenticatedUser): Promise<Vehicle> {
    const vehicle = await this.vehicleRepository.findOne({ where: { id } });
    if (!vehicle) throw new NotFoundException('Vehículo no encontrado');
    if (dto.plate) {
      const duplicate = await this.vehicleRepository.createQueryBuilder('other').where('lower(other.plate) = lower(:plate)', { plate: dto.plate.trim() }).andWhere('other.id <> :id', { id }).getOne();
      if (duplicate) throw new ConflictException('La placa ya está registrada');
      vehicle.plate = dto.plate;
    }
    if (dto.description !== undefined) vehicle.description = dto.description;
    if (dto.referenceCapacity !== undefined) vehicle.referenceCapacity = dto.referenceCapacity.toFixed(3);
    if (dto.status !== undefined) vehicle.status = dto.status;
    const saved = await this.vehicleRepository.save(vehicle);
    await this.audit.record({ userId: actor.id, module: 'vehicles', action: 'ACTUALIZAR_VEHICULO', entity: 'vehiculos', entityId: id, result: 'EXITOSO', metadata: { status: saved.status } });
    return saved;
  }
}
