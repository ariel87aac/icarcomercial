import { Injectable } from '@nestjs/common';
import { In, Repository } from 'typeorm';
import { RecordStatus } from '../../../compartido/enumeraciones/record-status.enum';
import type { ProductionActor } from '../aplicacion/production-actor';
import { ProductCategory } from '../../productos/catalogo/entidades/product-category.entity';
import { ProductionArea } from '../entidades/production-area.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { ProductionAccessPolicy } from '../aplicacion/production-access.policy';
import { ProductionAreasReadPort } from '../aplicacion/puertos/production-areas-read.port';
@Injectable()
export class TypeOrmProductionAreasReadAdapter extends ProductionAreasReadPort {
  constructor(
    private readonly productionAccessPolicy: ProductionAccessPolicy,
    @InjectRepository(ProductionArea)
    private readonly areaRepository: Repository<ProductionArea>,
    @InjectRepository(ProductCategory)
    private readonly categoryRepository: Repository<ProductCategory>,
  ) {
    super();
  }
  areas(actor: ProductionActor): Promise<ProductionArea[]> {
    const areaIds = this.productionAccessPolicy.productionAreaScope(actor);
    if (areaIds?.length === 0) return Promise.resolve([]);
    return this.areaRepository.find({
      ...(areaIds ? { where: { id: In(areaIds) } } : {}),
      order: { name: 'ASC', categories: { name: 'ASC' } },
    });
  }
  productionCategories(): Promise<ProductCategory[]> {
    return this.categoryRepository.find({
      where: { status: RecordStatus.ACTIVE },
      order: { name: 'ASC' },
    });
  }
}
