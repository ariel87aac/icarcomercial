import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowNegativeStockAvailability1720000038000 implements MigrationInterface {
  name = 'AllowNegativeStockAvailability1720000038000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "existencias" DROP CONSTRAINT IF EXISTS "existencias_check"`);
    await queryRunner.query(`
      ALTER TABLE "existencias"
      ADD CONSTRAINT "ck_existencias_reservada_no_negativa" CHECK ("cantidad_reservada" >= 0)
    `);

    await queryRunner.query(`
      UPDATE "reservas_inventario" AS reservation
         SET "cantidad" = detail."cantidad_solicitada"
        FROM "pedidos_detalle" AS detail
        JOIN "pedidos" AS orders ON orders."id" = detail."pedido_id"
       WHERE detail."id" = reservation."detalle_pedido_id"
         AND reservation."estado" = 'ACTIVA'
         AND orders."estado" = 'CONFIRMADO'
         AND orders."eliminado_at" IS NULL
         AND reservation."cantidad" <> detail."cantidad_solicitada"
    `);
    await queryRunner.query(`
      UPDATE "existencias" AS stock
         SET "cantidad_reservada" = COALESCE(active.total, 0)
        FROM (
          SELECT stock_row."id" AS stock_id,
                 SUM(reservation."cantidad") FILTER (WHERE reservation."estado" = 'ACTIVA') AS total
            FROM "existencias" AS stock_row
            LEFT JOIN "reservas_inventario" AS reservation ON reservation."existencia_id" = stock_row."id"
           GROUP BY stock_row."id"
        ) AS active
       WHERE active.stock_id = stock."id"
    `);

    await queryRunner.query(`
      ALTER TABLE "solicitudes_abastecimiento_detalle"
      DROP CONSTRAINT IF EXISTS "ck_solicitud_abastecimiento_cantidades"
    `);
    await queryRunner.query(`
      ALTER TABLE "solicitudes_abastecimiento_detalle"
      ADD CONSTRAINT "ck_solicitud_abastecimiento_cantidades" CHECK (
        "cantidad_fisica_copia" >= 0
        AND "cantidad_reservada_copia" >= 0
        AND "cantidad_demanda_copia" >= 0
        AND "cantidad_faltante_copia" >= 0
        AND "cantidad_faltante_copia" <= "cantidad_demanda_copia"
        AND "cantidad_adicional_stock" >= 0
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "solicitudes_abastecimiento_detalle"
      DROP CONSTRAINT IF EXISTS "ck_solicitud_abastecimiento_cantidades"
    `);
    await queryRunner.query(`
      DELETE FROM "solicitudes_abastecimiento_detalle"
       WHERE "cantidad_adicional_stock" <= 0
    `);
    await queryRunner.query(`
      UPDATE "solicitudes_abastecimiento_detalle"
         SET "cantidad_reservada_copia" = LEAST("cantidad_reservada_copia", "cantidad_fisica_copia")
       WHERE "cantidad_reservada_copia" > "cantidad_fisica_copia"
    `);
    await queryRunner.query(`
      ALTER TABLE "solicitudes_abastecimiento_detalle"
      ADD CONSTRAINT "ck_solicitud_abastecimiento_cantidades" CHECK (
        "cantidad_fisica_copia" >= 0
        AND "cantidad_reservada_copia" >= 0
        AND "cantidad_fisica_copia" >= "cantidad_reservada_copia"
        AND "cantidad_demanda_copia" >= 0
        AND "cantidad_faltante_copia" >= 0
        AND "cantidad_faltante_copia" <= "cantidad_demanda_copia"
        AND "cantidad_adicional_stock" > 0
      )
    `);
    await queryRunner.query(`
      UPDATE "reservas_inventario" AS reservation
         SET "cantidad" = detail."cantidad_reservada"
        FROM "pedidos_detalle" AS detail
       WHERE detail."id" = reservation."detalle_pedido_id"
         AND reservation."estado" = 'ACTIVA'
         AND reservation."cantidad" <> detail."cantidad_reservada"
    `);
    await queryRunner.query(`
      UPDATE "existencias" AS stock
         SET "cantidad_reservada" = COALESCE(active.total, 0)
        FROM (
          SELECT stock_row."id" AS stock_id,
                 SUM(reservation."cantidad") FILTER (WHERE reservation."estado" = 'ACTIVA') AS total
            FROM "existencias" AS stock_row
            LEFT JOIN "reservas_inventario" AS reservation ON reservation."existencia_id" = stock_row."id"
           GROUP BY stock_row."id"
        ) AS active
       WHERE active.stock_id = stock."id"
    `);
    await queryRunner.query(`ALTER TABLE "existencias" DROP CONSTRAINT IF EXISTS "ck_existencias_reservada_no_negativa"`);
    await queryRunner.query(`
      ALTER TABLE "existencias"
      ADD CONSTRAINT "existencias_check" CHECK (
        "cantidad_reservada" >= 0 AND "cantidad_reservada" <= "cantidad_fisica"
      )
    `);
  }
}
