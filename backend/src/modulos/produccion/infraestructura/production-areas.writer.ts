import { ProductionError } from '../dominio/production-error';
import { workflowTransaction } from '../../pedidos/order-workflow';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RecordStatus } from '../../../compartido/enumeraciones/record-status.enum';
import type { ProductionActor } from '../aplicacion/production-actor';
import { CreateProductionAreaCommand, UpdateProductionAreaCommand } from '../aplicacion/production-inputs';
import { ProductionArea } from '../entidades/production-area.entity';
import { ProductionAreaResolver } from './production-area-resolver';
import { ProductionTransactionSupport } from './production-transaction-support';
import { ProductionAreasWritePort } from '../aplicacion/puertos/production-areas-write.port';
@Injectable()
export class TypeOrmProductionAreasWriter extends ProductionAreasWritePort {
  constructor(
    private readonly dataSource: DataSource,
    private readonly productionAreaResolver: ProductionAreaResolver,
    private readonly productionTransactionSupport: ProductionTransactionSupport,
  ) {
    super();
  }
  async createArea(dto: CreateProductionAreaCommand, actor: ProductionActor): Promise<ProductionArea> {
    return workflowTransaction(this.dataSource, async (manager) => {
      const repository = manager.getRepository(ProductionArea);
      const name = dto.name.trim();
      if (!name) throw new ProductionError('invalid', 'El nombre del área es obligatorio');
      if (await repository.createQueryBuilder('area').where('lower(area.name) = lower(:name)', { name }).getOne()) {
        throw new ProductionError('conflict', 'Ya existe un área de Producción con ese nombre');
      }
      const categories = await this.productionAreaResolver.resolveAreaCategories(manager, dto.categoryIds);
      const area = await repository.save(repository.create({ name, status: RecordStatus.ACTIVE, categories }));
      await this.productionTransactionSupport.saveAudit(manager, actor.id, 'CREAR_AREA_PRODUCCION', area.id, {
        name,
        categoryIds: dto.categoryIds,
      });
      return repository.findOneOrFail({ where: { id: area.id }, relations: { categories: true } });
    });
  }
  async updateArea(id: string, dto: UpdateProductionAreaCommand, actor: ProductionActor): Promise<ProductionArea> {
    return workflowTransaction(this.dataSource, async (manager) => {
      const repository = manager.getRepository(ProductionArea);
      const area = await repository.findOne({ where: { id }, relations: { categories: true } });
      if (!area) throw new ProductionError('missing', 'Área de Producción no encontrada');
      if (dto.name !== undefined) {
        const name = dto.name.trim();
        if (!name) throw new ProductionError('invalid', 'El nombre del área es obligatorio');
        const duplicate = await repository
          .createQueryBuilder('candidate')
          .where('lower(candidate.name) = lower(:name)', { name })
          .andWhere('candidate.id <> :id', { id })
          .getOne();
        if (duplicate) throw new ProductionError('conflict', 'Ya existe un área de Producción con ese nombre');
        area.name = name;
      }
      if (dto.status === RecordStatus.INACTIVE) {
        const assignedUsers = await manager.query<Array<{ total: string }>>(
          `SELECT COUNT(*)::text AS total FROM usuarios_areas_produccion WHERE area_id = $1`,
          [id],
        );
        if (Number(assignedUsers[0]?.total ?? 0) > 0) {
          throw new ProductionError(
            'conflict',
            'No se puede inactivar el área mientras tenga usuarios de Producción asignados',
          );
        }
      }
      if (dto.status !== undefined) area.status = dto.status;
      if (dto.categoryIds !== undefined)
        area.categories = await this.productionAreaResolver.resolveAreaCategories(manager, dto.categoryIds, id);
      await repository.save(area);
      await this.productionTransactionSupport.saveAudit(manager, actor.id, 'ACTUALIZAR_AREA_PRODUCCION', id, {
        fields: Object.keys(dto),
        categoryIds: dto.categoryIds,
      });
      return repository.findOneOrFail({ where: { id }, relations: { categories: true } });
    });
  }
}
