import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { paginate, PaginatedResponse } from '../../common/dto/pagination-query.dto';
import { RecordStatus } from '../../common/enums/record-status.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
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
import { ProductCategory } from './entities/product-category.entity';
import { ProductLine } from './entities/product-line.entity';
import { ProductPresentation } from './entities/product-presentation.entity';
import { Product } from './entities/product.entity';
import { UnitMeasure } from './entities/unit-measure.entity';

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(ProductCategory)
    private readonly categoryRepository: Repository<ProductCategory>,
    @InjectRepository(ProductLine)
    private readonly lineRepository: Repository<ProductLine>,
    @InjectRepository(UnitMeasure)
    private readonly unitRepository: Repository<UnitMeasure>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(ProductPresentation)
    private readonly presentationRepository: Repository<ProductPresentation>,
    private readonly auditService: AuditService,
  ) {}

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

  private async validateProductReferences(categoryId: string, lineId: string, unitId: string, intendedStatus = RecordStatus.ACTIVE) {
    const [category, line, unit] = await Promise.all([
      this.requireEntity(this.categoryRepository, categoryId, 'Categoría'),
      this.requireEntity(this.lineRepository, lineId, 'Línea productiva'),
      this.requireEntity(this.unitRepository, unitId, 'Unidad base'),
    ]);
    if (intendedStatus === RecordStatus.ACTIVE && [category.status, line.status, unit.status].some((status) => status !== RecordStatus.ACTIVE)) {
      throw new ConflictException('La categoría, línea productiva y unidad base deben estar activas');
    }
  }

  private attachImageUrl(product: Product): void {
    product.imageUrl = product.imageMime
      ? `/api/catalogo/productos/${product.id}/imagen?v=${product.updatedAt.getTime()}`
      : null;
  }

  private decodeProductImage(dataUrl: string): { data: Buffer; mime: string } {
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl.trim());
    if (!match) throw new BadRequestException('La imagen debe ser un archivo JPG, PNG o WebP válido');
    const mime = match[1];
    const data = Buffer.from(match[2], 'base64');
    if (!data.length || data.length > 2 * 1024 * 1024) throw new BadRequestException('La imagen debe pesar como máximo 2 MB');
    const valid = mime === 'image/jpeg'
      ? data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
      : mime === 'image/png'
        ? data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
        : data.length >= 12 && data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP';
    if (!valid) throw new BadRequestException('El contenido no corresponde al formato declarado de la imagen');
    return { data, mime };
  }

  private async assertPresentationUnique(productId: string, description: string, excludedId?: string) {
    const builder = this.presentationRepository.createQueryBuilder('presentation')
      .where('presentation.productId = :productId', { productId })
      .andWhere('lower(presentation.description) = lower(:description)', { description: description.trim() });
    if (excludedId) builder.andWhere('presentation.id <> :excludedId', { excludedId });
    if (await builder.getOne()) throw new ConflictException('La presentación ya existe para este producto');
  }

  private async assertUnitUnique(name: string, abbreviation: string, excludedId?: string) {
    const builder = this.unitRepository.createQueryBuilder('unit').where(
      'lower(unit.name) = lower(:name) OR lower(unit.abbreviation) = lower(:abbreviation)',
      { name: name.trim(), abbreviation: abbreviation.trim() },
    );
    if (excludedId) builder.andWhere('unit.id <> :excludedId', { excludedId });
    if (await builder.getOne()) throw new ConflictException('El nombre o la abreviatura de la unidad ya existe');
  }

  private async assertUniqueName<T extends { id: string; name: string }>(repository: Repository<T>, name: string, label: string, excludedId?: string) {
    const builder = repository.createQueryBuilder('entity').where('lower(entity.name) = lower(:name)', { name });
    if (excludedId) builder.andWhere('entity.id <> :excludedId', { excludedId });
    if (await builder.getOne()) throw new ConflictException(`Ya existe una ${label} con ese nombre`);
  }

  private async requireEntity<T extends { id: string }>(repository: Repository<T>, id: string, label: string): Promise<T> {
    const entity = await repository.findOne({ where: { id } as never });
    if (!entity) throw new NotFoundException(`${label} no encontrada`);
    return entity;
  }

  private statusAction(entity: string, status?: RecordStatus): string {
    if (status === RecordStatus.ACTIVE) return `ACTIVAR_${entity}`;
    if (status === RecordStatus.INACTIVE) return `DESACTIVAR_${entity}`;
    return `ACTUALIZAR_${entity}`;
  }

  private audit(actor: AuthenticatedUser, action: string, entity: string, entityId: string, metadata: Record<string, unknown>) {
    return this.auditService.record({ userId: actor.id, module: 'catalog', action, entity, entityId, result: 'EXITOSO', metadata });
  }
}
