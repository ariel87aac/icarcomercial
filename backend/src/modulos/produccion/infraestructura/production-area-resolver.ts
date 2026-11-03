import { ProductionError } from '../dominio/production-error';
import { Injectable } from '@nestjs/common';
import { In, EntityManager } from 'typeorm';
import { RecordStatus } from '../../../compartido/enumeraciones/record-status.enum';
import { ProductCategory } from '../../productos/catalogo/entidades/product-category.entity';
import { ProductionArea } from '../entidades/production-area.entity';

@Injectable()
export class ProductionAreaResolver {
  constructor() {}

  async resolveAreaCategories(
    manager: EntityManager,
    categoryIds: string[],
    currentAreaId?: string,
  ): Promise<ProductCategory[]> {
    if (!categoryIds.length) return [];
    const categories = await manager.getRepository(ProductCategory).find({ where: { id: In(categoryIds) } });
    if (categories.length !== categoryIds.length)
      throw new ProductionError('inconsistent', 'Una o más categorías no existen');
    if (categories.some((category) => category.status !== RecordStatus.ACTIVE)) {
      throw new ProductionError('conflict', 'No se puede asignar una categoría inactiva a un área de Producción');
    }
    const assigned = await manager.query<Array<{ categoryId: string; areaName: string }>>(
      `SELECT assignment.categoria_id AS "categoryId", area.nombre AS "areaName"
           FROM areas_produccion_categorias assignment
           JOIN areas_produccion area ON area.id = assignment.area_id
          WHERE assignment.categoria_id = ANY($1::uuid[])
            AND ($2::uuid IS NULL OR assignment.area_id <> $2::uuid)`,
      [categoryIds, currentAreaId ?? null],
    );
    if (assigned.length)
      throw new ProductionError('conflict', `Una categoría ya está asignada al área ${assigned[0].areaName}`);
    return categories;
  }

  async areaForCategory(manager: EntityManager, categoryId: string): Promise<ProductionArea | null> {
    return manager
      .getRepository(ProductionArea)
      .createQueryBuilder('area')
      .innerJoinAndSelect('area.categories', 'category', 'category.id = :categoryId', { categoryId })
      .where('area.status = :status', { status: RecordStatus.ACTIVE })
      .getOne();
  }
}
