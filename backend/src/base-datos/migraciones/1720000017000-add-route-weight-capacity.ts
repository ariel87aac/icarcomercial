import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRouteWeightCapacity1720000017000 implements MigrationInterface {
  name = 'AddRouteWeightCapacity1720000017000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "evento_ruta_enum" ADD VALUE IF NOT EXISTS 'CAMBIO_VEHICULO'`);
    await queryRunner.query(`
      ALTER TABLE "presentaciones_producto"
      ADD COLUMN "peso_kg" numeric(14,6)
      CHECK ("peso_kg" IS NULL OR "peso_kg" > 0)
    `);
    await queryRunner.query(`
      UPDATE "presentaciones_producto" presentation
         SET "peso_kg" = presentation."factor_conversion"
        FROM "productos" product
        JOIN "unidades_medida" unit ON unit.id = product."unidad_base_id"
       WHERE presentation."producto_id" = product.id
         AND (lower(unit."abreviatura") IN ('kg', 'd-kg') OR lower(unit."nombre") LIKE '%kilogramo%')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "presentaciones_producto" DROP COLUMN "peso_kg"`);
  }
}
