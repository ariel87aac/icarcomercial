import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductionNetRequirement1720000014000 implements MigrationInterface {
  name = 'AddProductionNetRequirement1720000014000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "evento_historial_produccion_enum" ADD VALUE IF NOT EXISTS 'AJUSTE_LOTE' AFTER 'RECALCULO'`);

    await queryRunner.query(`
      ALTER TABLE "consolidaciones_origen"
        ADD COLUMN "cantidad_reservada_original" numeric(18,6) NOT NULL DEFAULT 0,
        ADD COLUMN "cantidad_pendiente_original" numeric(18,6) NOT NULL DEFAULT 0,
        ADD COLUMN "aporte_almacen_base" numeric(18,6) NOT NULL DEFAULT 0,
        ADD COLUMN "aporte_produccion_base" numeric(18,6) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      UPDATE "consolidaciones_origen" source
         SET "cantidad_reservada_original" = CASE
               WHEN abs(detail."cantidad_solicitada" - detail."cantidad_reservada" - detail."cantidad_pendiente") <= 0.000001
               THEN detail."cantidad_reservada" ELSE 0 END,
             "cantidad_pendiente_original" = CASE
               WHEN abs(detail."cantidad_solicitada" - detail."cantidad_reservada" - detail."cantidad_pendiente") <= 0.000001
               THEN detail."cantidad_pendiente" ELSE detail."cantidad_solicitada" END,
             "aporte_almacen_base" = round((CASE
               WHEN abs(detail."cantidad_solicitada" - detail."cantidad_reservada" - detail."cantidad_pendiente") <= 0.000001
               THEN detail."cantidad_reservada" ELSE 0 END) * source."factor_aplicado", 6),
             "aporte_produccion_base" = round((CASE
               WHEN abs(detail."cantidad_solicitada" - detail."cantidad_reservada" - detail."cantidad_pendiente") <= 0.000001
               THEN detail."cantidad_pendiente" ELSE detail."cantidad_solicitada" END) * source."factor_aplicado", 6)
        FROM "pedidos_detalle" detail
       WHERE detail.id = source."detalle_pedido_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "consolidaciones_origen"
        ADD CONSTRAINT "ck_origen_reservado_no_negativo" CHECK ("cantidad_reservada_original" >= 0),
        ADD CONSTRAINT "ck_origen_pendiente_no_negativo" CHECK ("cantidad_pendiente_original" >= 0),
        ADD CONSTRAINT "ck_origen_aporte_almacen_no_negativo" CHECK ("aporte_almacen_base" >= 0),
        ADD CONSTRAINT "ck_origen_aporte_produccion_no_negativo" CHECK ("aporte_produccion_base" >= 0)
    `);

    await queryRunner.query(`
      ALTER TABLE "consolidaciones_detalle"
        ADD COLUMN "cantidad_cubierta_almacen" numeric(18,6) NOT NULL DEFAULT 0,
        ADD COLUMN "cantidad_requerida_produccion" numeric(18,6) NOT NULL DEFAULT 0,
        ADD COLUMN "ajuste_lote" numeric(18,6) NOT NULL DEFAULT 0,
        ADD COLUMN "cantidad_planificada" numeric(18,6) NOT NULL DEFAULT 0,
        ADD COLUMN "motivo_ajuste_lote" varchar(500)
    `);
    await queryRunner.query(`
      UPDATE "consolidaciones_detalle" consolidated
         SET "cantidad_cubierta_almacen" = totals.covered,
             "cantidad_requerida_produccion" = totals.required,
             "cantidad_planificada" = totals.required,
             "diferencia" = round(consolidated."cantidad_preparada" - totals.required, 6)
        FROM (
          SELECT source."detalle_consolidado_id" AS detail_id,
                 COALESCE(sum(source."aporte_almacen_base"), 0) AS covered,
                 COALESCE(sum(source."aporte_produccion_base"), 0) AS required
            FROM "consolidaciones_origen" source
           GROUP BY source."detalle_consolidado_id"
        ) totals
       WHERE consolidated.id = totals.detail_id
    `);
    await queryRunner.query(`
      ALTER TABLE "consolidaciones_detalle"
        ADD CONSTRAINT "ck_consolidado_almacen_no_negativo" CHECK ("cantidad_cubierta_almacen" >= 0),
        ADD CONSTRAINT "ck_consolidado_requerido_no_negativo" CHECK ("cantidad_requerida_produccion" >= 0),
        ADD CONSTRAINT "ck_consolidado_ajuste_no_negativo" CHECK ("ajuste_lote" >= 0),
        ADD CONSTRAINT "ck_consolidado_plan_no_negativo" CHECK ("cantidad_planificada" >= 0),
        ADD CONSTRAINT "ck_consolidado_balance_demanda" CHECK (abs("cantidad_solicitada" - "cantidad_cubierta_almacen" - "cantidad_requerida_produccion") <= 0.000001),
        ADD CONSTRAINT "ck_consolidado_balance_plan" CHECK (abs("cantidad_planificada" - "cantidad_requerida_produccion" - "ajuste_lote") <= 0.000001)
    `);

    await queryRunner.query(`
      INSERT INTO "permisos" ("key", "module", "action", "description")
      VALUES ('production.plan.adjust', 'production', 'adjust', 'Ajustar el plan de producción para completar lotes')
      ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description"
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id
        FROM "roles" role CROSS JOIN "permisos" permission
       WHERE role.name IN ('ADMINISTRADOR', 'COMERCIALIZACION', 'PRODUCCION')
         AND permission.key = 'production.plan.adjust'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "roles_permisos" WHERE "permiso_id" IN (SELECT id FROM "permisos" WHERE "key" = 'production.plan.adjust')`);
    await queryRunner.query(`DELETE FROM "permisos" WHERE "key" = 'production.plan.adjust'`);
    await queryRunner.query(`
      ALTER TABLE "consolidaciones_detalle"
        DROP CONSTRAINT "ck_consolidado_balance_plan",
        DROP CONSTRAINT "ck_consolidado_balance_demanda",
        DROP CONSTRAINT "ck_consolidado_plan_no_negativo",
        DROP CONSTRAINT "ck_consolidado_ajuste_no_negativo",
        DROP CONSTRAINT "ck_consolidado_requerido_no_negativo",
        DROP CONSTRAINT "ck_consolidado_almacen_no_negativo",
        DROP COLUMN "motivo_ajuste_lote",
        DROP COLUMN "cantidad_planificada",
        DROP COLUMN "ajuste_lote",
        DROP COLUMN "cantidad_requerida_produccion",
        DROP COLUMN "cantidad_cubierta_almacen"
    `);
    await queryRunner.query(`
      ALTER TABLE "consolidaciones_origen"
        DROP CONSTRAINT "ck_origen_aporte_produccion_no_negativo",
        DROP CONSTRAINT "ck_origen_aporte_almacen_no_negativo",
        DROP CONSTRAINT "ck_origen_pendiente_no_negativo",
        DROP CONSTRAINT "ck_origen_reservado_no_negativo",
        DROP COLUMN "aporte_produccion_base",
        DROP COLUMN "aporte_almacen_base",
        DROP COLUMN "cantidad_pendiente_original",
        DROP COLUMN "cantidad_reservada_original"
    `);
    await queryRunner.query(`UPDATE "consolidaciones_historial" SET "evento" = 'RECALCULO' WHERE "evento" = 'AJUSTE_LOTE'`);
    await queryRunner.query(`ALTER TYPE "evento_historial_produccion_enum" RENAME TO "evento_historial_produccion_enum_old"`);
    await queryRunner.query(`CREATE TYPE "evento_historial_produccion_enum" AS ENUM ('GENERACION', 'RECALCULO', 'EMISION', 'INICIO', 'AVANCE', 'CIERRE')`);
    await queryRunner.query(`ALTER TABLE "consolidaciones_historial" ALTER COLUMN "evento" TYPE "evento_historial_produccion_enum" USING "evento"::text::"evento_historial_produccion_enum"`);
    await queryRunner.query(`DROP TYPE "evento_historial_produccion_enum_old"`);
  }
}
