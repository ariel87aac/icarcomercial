import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { DistributionRouteQueryDto } from './dto/distribution.dto';
import { DistributionRouteStatus } from './entidades/distribution.enums';

describe('filtro múltiple de estados de rutas', () => {
  it('convierte estados separados por coma en una lista válida', async () => {
    const query = plainToInstance(DistributionRouteQueryDto, {
      statuses: 'BORRADOR,PLANIFICADA,EN_REPARTO',
    });

    expect(await validate(query)).toHaveLength(0);
    expect(query.statuses).toEqual([
      DistributionRouteStatus.DRAFT,
      DistributionRouteStatus.PLANNED,
      DistributionRouteStatus.IN_DELIVERY,
    ]);
  });

  it('rechaza cualquier estado que no pertenezca al flujo de rutas', async () => {
    const query = plainToInstance(DistributionRouteQueryDto, {
      statuses: 'BORRADOR,DESCONOCIDO',
    });

    expect(await validate(query)).not.toHaveLength(0);
  });
});
