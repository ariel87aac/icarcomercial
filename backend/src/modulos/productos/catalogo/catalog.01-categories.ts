import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { paginate, PaginatedResponse } from '../../../compartido/dto/pagination-query.dto';
import { RecordStatus } from '../../../compartido/enumeraciones/record-status.enum';
import { AuthenticatedUser } from '../../../compartido/interfaces/authenticated-user.interface';
import { AuditService } from '../../seguridad/auditoria/audit.service';
import {
  CreateNamedCatalogItemDto,
  CreateProductDto,
  CreateProductPresentationDto,
  CreateUnitMeasureDto,
  ProductQueryDto,
  UpdateNamedCatalogItemDto,
  UpdateProductImageDto,
  UpdateProductDto,
  UpdateProductPresentationDto,
  UpdateUnitMeasureDto,
} from './dto/catalog.dto';
import { ProductCategory } from './entidades/product-category.entity';
import { ProductLine } from './entidades/product-line.entity';
import { ProductPresentation } from './entidades/product-presentation.entity';
import { Product } from './entidades/product.entity';
import { UnitMeasure } from './entidades/unit-measure.entity';
import { CatalogServiceParte02 } from './catalog.02-product';

export abstract class CatalogServiceParte01 extends CatalogServiceParte02 {
  categories(): Promise<ProductCategory[]> {
      return this.categoryRepository.find({ order: { code: 'ASC' } });
    }

  async createCategory(dto: CreateNamedCatalogItemDto, actor: AuthenticatedUser) {
      const name = dto.name.trim();
      await this.assertUniqueName(this.categoryRepository, name, 'categoría');
      const category = await this.categoryRepository.save(this.categoryRepository.create({ name }));
      await this.audit(actor, 'CREAR_CATEGORIA', 'categorias_producto', category.id, { code: category.code, name });
      return category;
    }

  async updateCategory(id: string, dto: UpdateNamedCatalogItemDto, actor: AuthenticatedUser) {
      const category = await this.requireEntity(this.categoryRepository, id, 'Categoría');
      if (dto.name !== undefined) {
        await this.assertUniqueName(this.categoryRepository, dto.name.trim(), 'categoría', id);
        category.name = dto.name.trim();
      }
      if (dto.status !== undefined) category.status = dto.status;
      const saved = await this.categoryRepository.save(category);
      await this.audit(actor, this.statusAction('CATEGORIA', dto.status), 'categorias_producto', id, { fields: Object.keys(dto) });
      return saved;
    }

  async removeCategory(id: string, actor: AuthenticatedUser) {
      const category = await this.requireEntity(this.categoryRepository, id, 'Categoría');
      const [productCount, areaAssignmentCount, productionDetailCount] = await Promise.all([
        this.productRepository.count({ where: { categoryId: id } }),
        this.categoryRepository.manager
          .createQueryBuilder()
          .from('areas_produccion_categorias', 'assignment')
          .where('assignment.categoria_id = :id', { id })
          .getCount(),
        this.categoryRepository.manager
          .createQueryBuilder()
          .from('consolidaciones_detalle', 'detail')
          .where('detail.categoria_id = :id', { id })
          .getCount(),
      ]);
      if (productCount || areaAssignmentCount || productionDetailCount) {
        throw new ConflictException(
          'No se puede eliminar la categoría porque está asignada a productos, áreas o registros de producción',
        );
      }
      await this.categoryRepository.remove(category);
      await this.audit(actor, 'ELIMINAR_CATEGORIA', 'categorias_producto', id, {
        code: category.code,
        name: category.name,
      });
      return { id, deleted: true };
    }

  lines(): Promise<ProductLine[]> {
      return this.lineRepository.find({ order: { code: 'ASC' } });
    }

  async createLine(dto: CreateNamedCatalogItemDto, actor: AuthenticatedUser) {
      const name = dto.name.trim();
      await this.assertUniqueName(this.lineRepository, name, 'línea productiva');
      const line = await this.lineRepository.save(this.lineRepository.create({ name }));
      await this.audit(actor, 'CREAR_LINEA_PRODUCTIVA', 'lineas_productivas', line.id, { code: line.code, name });
      return line;
    }

  async updateLine(id: string, dto: UpdateNamedCatalogItemDto, actor: AuthenticatedUser) {
      const line = await this.requireEntity(this.lineRepository, id, 'Línea productiva');
      if (dto.name !== undefined) {
        await this.assertUniqueName(this.lineRepository, dto.name.trim(), 'línea productiva', id);
        line.name = dto.name.trim();
      }
      if (dto.status !== undefined) line.status = dto.status;
      const saved = await this.lineRepository.save(line);
      await this.audit(actor, this.statusAction('LINEA_PRODUCTIVA', dto.status), 'lineas_productivas', id, { fields: Object.keys(dto) });
      return saved;
    }

  async removeLine(id: string, actor: AuthenticatedUser) {
      const line = await this.requireEntity(this.lineRepository, id, 'Línea productiva');
      const productCount = await this.productRepository.count({ where: { productLineId: id } });
      if (productCount) {
        throw new ConflictException(
          'No se puede eliminar la línea porque está asignada a uno o más productos',
        );
      }
      await this.lineRepository.remove(line);
      await this.audit(actor, 'ELIMINAR_LINEA_PRODUCTIVA', 'lineas_productivas', id, {
        code: line.code,
        name: line.name,
      });
      return { id, deleted: true };
    }

  units(): Promise<UnitMeasure[]> {
      return this.unitRepository.find({ order: { code: 'ASC' } });
    }

  async createUnit(dto: CreateUnitMeasureDto, actor: AuthenticatedUser) {
      await this.assertUnitUnique(dto.name, dto.abbreviation);
      const unit = await this.unitRepository.save(this.unitRepository.create({
        name: dto.name.trim(),
        abbreviation: dto.abbreviation.trim(),
        decimalScale: dto.decimalScale,
        kilogramFactor: dto.kilogramFactor.toFixed(6),
      }));
      await this.audit(actor, 'CREAR_UNIDAD', 'unidades_medida', unit.id, { code: unit.code, name: unit.name, abbreviation: unit.abbreviation, kilogramFactor: unit.kilogramFactor });
      return unit;
    }

  async updateUnit(id: string, dto: UpdateUnitMeasureDto, actor: AuthenticatedUser) {
      const unit = await this.requireEntity(this.unitRepository, id, 'Unidad de medida');
      await this.assertUnitUnique(dto.name ?? unit.name, dto.abbreviation ?? unit.abbreviation, id);
      if (dto.name !== undefined) unit.name = dto.name.trim();
      if (dto.abbreviation !== undefined) unit.abbreviation = dto.abbreviation.trim();
      if (dto.decimalScale !== undefined) unit.decimalScale = dto.decimalScale;
      if (dto.kilogramFactor !== undefined) unit.kilogramFactor = dto.kilogramFactor.toFixed(6);
      if (dto.status !== undefined) unit.status = dto.status;
      const saved = await this.unitRepository.save(unit);
      await this.audit(actor, this.statusAction('UNIDAD', dto.status), 'unidades_medida', id, { fields: Object.keys(dto) });
      return saved;
    }

  async removeUnit(id: string, actor: AuthenticatedUser) {
      const unit = await this.requireEntity(this.unitRepository, id, 'Unidad de medida');
      const [baseProductCount, presentationCount] = await Promise.all([
        this.productRepository.count({ where: { baseUnitId: id } }),
        this.presentationRepository.count({ where: { unitId: id } }),
      ]);
      if (baseProductCount || presentationCount) {
        throw new ConflictException(
          'No se puede eliminar la unidad porque está asignada a uno o más productos o presentaciones',
        );
      }
      await this.unitRepository.remove(unit);
      await this.audit(actor, 'ELIMINAR_UNIDAD', 'unidades_medida', id, {
        name: unit.name,
        abbreviation: unit.abbreviation,
      });
      return { id, deleted: true };
    }

  async products(query: ProductQueryDto): Promise<PaginatedResponse<Product>> {
      const builder = this.productRepository
        .createQueryBuilder('product')
        .leftJoinAndSelect('product.category', 'category')
        .leftJoinAndSelect('product.productLine', 'productLine')
        .leftJoinAndSelect('product.baseUnit', 'baseUnit')
        .leftJoinAndSelect('product.presentations', 'presentation')
        .leftJoinAndSelect('presentation.unit', 'presentationUnit')
        .orderBy('product.code', 'ASC')
        .addOrderBy('presentation.description', 'ASC')
        .skip((query.page - 1) * query.limit)
        .take(query.limit);
      if (query.q) {
        builder.andWhere(new Brackets((where) => where
          .where('CAST(product.code AS text) ILIKE :q', { q: `%${query.q}%` })
          .orWhere('unaccent(product.name) ILIKE unaccent(:q)', { q: `%${query.q}%` })));
      }
      if (query.categoryId) builder.andWhere('product.categoryId = :categoryId', { categoryId: query.categoryId });
      if (query.productLineId) builder.andWhere('product.productLineId = :productLineId', { productLineId: query.productLineId });
      if (query.status) builder.andWhere('product.status = :status', { status: query.status });
      const [data, total] = await builder.getManyAndCount();
      for (const product of data) this.attachImageUrl(product);
      return paginate(data, total, query.page, query.limit);
    }
}
