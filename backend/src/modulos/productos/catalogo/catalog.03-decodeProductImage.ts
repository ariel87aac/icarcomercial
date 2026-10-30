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
import { CatalogServiceBase } from './catalog.base';

export abstract class CatalogServiceParte03 extends CatalogServiceBase {
  protected decodeProductImage(dataUrl: string): { data: Buffer; mime: string } {
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

  protected async assertPresentationUnique(productId: string, description: string, excludedId?: string) {
      const builder = this.presentationRepository.createQueryBuilder('presentation')
        .where('presentation.productId = :productId', { productId })
        .andWhere('lower(presentation.description) = lower(:description)', { description: description.trim() });
      if (excludedId) builder.andWhere('presentation.id <> :excludedId', { excludedId });
      if (await builder.getOne()) throw new ConflictException('La presentación ya existe para este producto');
    }

  protected async assertUnitUnique(name: string, abbreviation: string, excludedId?: string) {
      const builder = this.unitRepository.createQueryBuilder('unit').where(
        'lower(unit.name) = lower(:name) OR lower(unit.abbreviation) = lower(:abbreviation)',
        { name: name.trim(), abbreviation: abbreviation.trim() },
      );
      if (excludedId) builder.andWhere('unit.id <> :excludedId', { excludedId });
      if (await builder.getOne()) throw new ConflictException('El nombre o la abreviatura de la unidad ya existe');
    }

  protected async assertUniqueName<T extends { id: string; name: string }>(repository: Repository<T>, name: string, label: string, excludedId?: string) {
      const builder = repository.createQueryBuilder('entity').where('lower(entity.name) = lower(:name)', { name });
      if (excludedId) builder.andWhere('entity.id <> :excludedId', { excludedId });
      if (await builder.getOne()) throw new ConflictException(`Ya existe una ${label} con ese nombre`);
    }

  protected async requireEntity<T extends { id: string }>(repository: Repository<T>, id: string, label: string): Promise<T> {
      const entity = await repository.findOne({ where: { id } as never });
      if (!entity) throw new NotFoundException(`${label} no encontrada`);
      return entity;
    }

  protected statusAction(entity: string, status?: RecordStatus): string {
      if (status === RecordStatus.ACTIVE) return `ACTIVAR_${entity}`;
      if (status === RecordStatus.INACTIVE) return `DESACTIVAR_${entity}`;
      return `ACTUALIZAR_${entity}`;
    }

  protected audit(actor: AuthenticatedUser, action: string, entity: string, entityId: string, metadata: Record<string, unknown>) {
      return this.auditService.record({ userId: actor.id, module: 'catalog', action, entity, entityId, result: 'EXITOSO', metadata });
    }
}
