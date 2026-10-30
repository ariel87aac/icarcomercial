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
import { CatalogServiceParte03 } from './catalog.03-decodeProductImage';

export abstract class CatalogServiceParte02 extends CatalogServiceParte03 {
  async product(id: string): Promise<Product> {
      const product = await this.productRepository.findOne({
        where: { id },
        relations: { presentations: { unit: true } },
        order: { presentations: { description: 'ASC' } },
      });
      if (!product) throw new NotFoundException('Producto no encontrado');
      this.attachImageUrl(product);
      return product;
    }

  async createProduct(dto: CreateProductDto, actor: AuthenticatedUser) {
      await this.validateProductReferences(dto.categoryId, dto.productLineId, dto.baseUnitId);
      const product = await this.productRepository.save(this.productRepository.create({
        ...dto,
        name: dto.name.trim(),
      }));
      await this.audit(actor, 'CREAR_PRODUCTO', 'productos', product.id, { code: product.code });
      return this.product(product.id);
    }

  async updateProduct(id: string, dto: UpdateProductDto, actor: AuthenticatedUser) {
      const product = await this.product(id);
      await this.validateProductReferences(
        dto.categoryId ?? product.categoryId,
        dto.productLineId ?? product.productLineId,
        dto.baseUnitId ?? product.baseUnitId,
        dto.status ?? product.status,
      );
      const changes = {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.productLineId !== undefined ? { productLineId: dto.productLineId } : {}),
        ...(dto.baseUnitId !== undefined ? { baseUnitId: dto.baseUnitId } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      };
      if (Object.keys(changes).length) await this.productRepository.update(id, changes);
      await this.audit(actor, this.statusAction('PRODUCTO', dto.status), 'productos', id, { fields: Object.keys(dto) });
      return this.product(id);
    }

  async removeProduct(id: string, actor: AuthenticatedUser) {
      const product = await this.requireEntity(this.productRepository, id, 'Producto');
      const [presentationCount, productionDetailCount] = await Promise.all([
        this.presentationRepository.count({ where: { productId: id } }),
        this.productRepository.manager
          .createQueryBuilder()
          .from('consolidaciones_detalle', 'detail')
          .where('detail.producto_id = :id', { id })
          .getCount(),
      ]);
      if (presentationCount || productionDetailCount) {
        throw new ConflictException(
          'No se puede eliminar el producto porque tiene presentaciones o registros de producción asociados',
        );
      }
      await this.productRepository.remove(product);
      await this.audit(actor, 'ELIMINAR_PRODUCTO', 'productos', id, {
        code: product.code,
        name: product.name,
      });
      return { id, deleted: true };
    }

  async updateProductImage(id: string, dto: UpdateProductImageDto, actor: AuthenticatedUser): Promise<Product> {
      const product = await this.productRepository.findOne({ where: { id } });
      if (!product) throw new NotFoundException('Producto no encontrado');
      const image = this.decodeProductImage(dto.dataUrl);
      product.imageData = image.data;
      product.imageMime = image.mime;
      await this.productRepository.save(product);
      await this.audit(actor, 'ACTUALIZAR_IMAGEN_PRODUCTO', 'productos', id, {
        mime: image.mime,
        bytes: image.data.length,
      });
      return this.product(id);
    }

  async productImage(id: string): Promise<{ data: Buffer; mime: string }> {
      const product = await this.productRepository.createQueryBuilder('product')
        .addSelect('product.imageData')
        .where('product.id = :id', { id })
        .getOne();
      if (!product) throw new NotFoundException('Producto no encontrado');
      if (!product.imageData || !product.imageMime) throw new NotFoundException('El producto no tiene una imagen registrada');
      return { data: product.imageData, mime: product.imageMime };
    }

  async presentations(productId: string): Promise<ProductPresentation[]> {
      await this.product(productId);
      return this.presentationRepository.find({
        where: { productId },
        relations: { unit: true },
        order: { description: 'ASC' },
      });
    }

  async createPresentation(productId: string, dto: CreateProductPresentationDto, actor: AuthenticatedUser) {
      const product = await this.product(productId);
      const unit = await this.requireEntity(this.unitRepository, dto.unitId, 'Unidad de medida');
      if (product.status !== RecordStatus.ACTIVE || unit.status !== RecordStatus.ACTIVE) {
        throw new ConflictException('El producto y la unidad deben estar activos');
      }
      await this.assertPresentationUnique(productId, dto.description);
      const presentation = await this.presentationRepository.save(this.presentationRepository.create({
        productId,
        unitId: dto.unitId,
        description: dto.description.trim(),
        conversionFactor: dto.conversionFactor.toFixed(4),
        weightKg: dto.weightKg.toFixed(6),
      }));
      await this.audit(actor, 'CREAR_PRESENTACION', 'presentaciones_producto', presentation.id, { productId });
      return this.presentationRepository.findOneOrFail({ where: { id: presentation.id }, relations: { unit: true, product: true } });
    }

  async updatePresentation(productId: string, id: string, dto: UpdateProductPresentationDto, actor: AuthenticatedUser) {
      const presentation = await this.presentationRepository.findOne({ where: { id, productId }, relations: { product: true, unit: true } });
      if (!presentation) throw new NotFoundException('Presentación no encontrada');
      if (dto.description !== undefined) await this.assertPresentationUnique(productId, dto.description, id);
      if (dto.unitId !== undefined) {
        const unit = await this.requireEntity(this.unitRepository, dto.unitId, 'Unidad de medida');
        if (unit.status !== RecordStatus.ACTIVE) throw new ConflictException('La unidad debe estar activa');
      }
      if (dto.status === RecordStatus.ACTIVE && presentation.product.status !== RecordStatus.ACTIVE) {
        throw new ConflictException('No se puede activar una presentación de un producto inactivo');
      }
      if (dto.unitId !== undefined) presentation.unitId = dto.unitId;
      if (dto.description !== undefined) presentation.description = dto.description.trim();
      if (dto.conversionFactor !== undefined) presentation.conversionFactor = dto.conversionFactor.toFixed(4);
      if (dto.weightKg !== undefined) presentation.weightKg = dto.weightKg.toFixed(6);
      if (dto.status !== undefined) presentation.status = dto.status;
      await this.presentationRepository.save(presentation);
      await this.audit(actor, this.statusAction('PRESENTACION', dto.status), 'presentaciones_producto', id, { productId, fields: Object.keys(dto) });
      return this.presentationRepository.findOneOrFail({ where: { id }, relations: { unit: true, product: true } });
    }

  protected async validateProductReferences(categoryId: string, lineId: string, unitId: string, intendedStatus = RecordStatus.ACTIVE) {
      const [category, line, unit] = await Promise.all([
        this.requireEntity(this.categoryRepository, categoryId, 'Categoría'),
        this.requireEntity(this.lineRepository, lineId, 'Línea productiva'),
        this.requireEntity(this.unitRepository, unitId, 'Unidad base'),
      ]);
      if (intendedStatus === RecordStatus.ACTIVE && [category.status, line.status, unit.status].some((status) => status !== RecordStatus.ACTIVE)) {
        throw new ConflictException('La categoría, línea productiva y unidad base deben estar activas');
      }
    }

  protected attachImageUrl(product: Product): void {
      product.imageUrl = product.imageMime
        ? `/api/catalogo/productos/${product.id}/imagen?v=${product.updatedAt.getTime()}`
        : null;
    }
}
