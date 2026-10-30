import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProductionPlantAndReception1720000015000 implements MigrationInterface {
  name = 'ProductionPlantAndReception1720000015000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "evento_historial_produccion_enum" ADD VALUE IF NOT EXISTS 'PRODUCCION_ADICIONAL'`);
    await queryRunner.query(`ALTER TYPE "evento_historial_produccion_enum" ADD VALUE IF NOT EXISTS 'PRODUCTO_AGREGADO'`);
    await queryRunner.query(`ALTER TYPE "evento_historial_produccion_enum" ADD VALUE IF NOT EXISTS 'PRODUCTO_RETIRADO'`);
    await queryRunner.query(`ALTER TYPE "evento_historial_produccion_enum" ADD VALUE IF NOT EXISTS 'ENTREGA_PRODUCCION'`);
    await queryRunner.query(`ALTER TYPE "evento_historial_produccion_enum" ADD VALUE IF NOT EXISTS 'RECEPCION_ALMACEN'`);
    await queryRunner.query(`ALTER TYPE "tipo_movimiento_inventario_enum" ADD VALUE IF NOT EXISTS 'INGRESO_PRODUCCION'`);
    await queryRunner.query(`CREATE TYPE "etapa_detalle_produccion_enum" AS ENUM ('PENDIENTE', 'EN_PROCESO', 'PENDIENTE_RECEPCION', 'RECIBIDO_PARCIAL', 'COMPLETADO', 'CERRADO_CON_INCIDENCIA')`);
    await queryRunner.query(`CREATE TYPE "estado_entrega_produccion_enum" AS ENUM ('PENDIENTE', 'ACEPTADA')`);
    await queryRunner.query(`ALTER TABLE "existencias" ALTER COLUMN "cantidad_fisica" TYPE numeric(18,6), ALTER COLUMN "cantidad_reservada" TYPE numeric(18,6)`);
    await queryRunner.query(`ALTER TABLE "movimientos_inventario" ALTER COLUMN "cantidad" TYPE numeric(18,6), ALTER COLUMN "saldo_anterior" TYPE numeric(18,6), ALTER COLUMN "saldo_nuevo" TYPE numeric(18,6)`);

    await queryRunner.query(`
      CREATE TABLE "areas_produccion" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "nombre" varchar(100) NOT NULL UNIQUE,
        "status" estado_registro_enum NOT NULL DEFAULT 'ACTIVO',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "areas_produccion_categorias" (
        "area_id" uuid NOT NULL REFERENCES "areas_produccion"("id") ON DELETE CASCADE,
        "categoria_id" uuid NOT NULL UNIQUE REFERENCES "categorias_producto"("id") ON DELETE RESTRICT,
        CONSTRAINT "pk_areas_produccion_categorias" PRIMARY KEY ("area_id", "categoria_id")
      )
    `);

    await queryRunner.query(`ALTER TABLE "consolidaciones_produccion" ALTER COLUMN "fecha_limite_preparacion" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "consolidaciones_detalle" ADD COLUMN "categoria_id" uuid REFERENCES "categorias_producto"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`ALTER TABLE "consolidaciones_detalle" ADD COLUMN "presentacion_id" uuid REFERENCES "presentaciones_producto"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`ALTER TABLE "consolidaciones_detalle" ADD COLUMN "area_produccion_id" uuid REFERENCES "areas_produccion"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`ALTER TABLE "consolidaciones_detalle" ADD COLUMN "cantidad_recibida_almacen" numeric(18,6) NOT NULL DEFAULT 0 CHECK ("cantidad_recibida_almacen" >= 0)`);
    await queryRunner.query(`ALTER TABLE "consolidaciones_detalle" ADD COLUMN "etapa" etapa_detalle_produccion_enum NOT NULL DEFAULT 'PENDIENTE'`);
    await queryRunner.query(`UPDATE "consolidaciones_detalle" detail SET "categoria_id" = product."categoria_id" FROM "productos" product WHERE product.id = detail."producto_id"`);
    await queryRunner.query(`
      UPDATE "consolidaciones_detalle" detail
         SET "presentacion_id" = candidates.presentation_id
        FROM (
          SELECT source."detalle_consolidado_id" detail_id, MIN(source."presentacion_id"::text)::uuid presentation_id
            FROM "consolidaciones_origen" source
           GROUP BY source."detalle_consolidado_id"
          HAVING COUNT(DISTINCT source."presentacion_id") = 1
        ) candidates
       WHERE detail.id = candidates.detail_id
    `);
    await queryRunner.query(`ALTER TABLE "consolidaciones_detalle" DROP CONSTRAINT "uq_consolidacion_agrupacion"`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_consolidacion_presentacion" ON "consolidaciones_detalle" ("consolidacion_id", "presentacion_id") WHERE "presentacion_id" IS NOT NULL`);
    await queryRunner.query(`
      DO $$ DECLARE constraint_name text;
      BEGIN
        SELECT con.conname INTO constraint_name
          FROM pg_constraint con
          JOIN pg_class rel ON rel.oid = con.conrelid
         WHERE rel.relname = 'consolidaciones_detalle'
           AND con.contype = 'c'
           AND pg_get_constraintdef(con.oid) LIKE '%cantidad_solicitada%> 0%'
         LIMIT 1;
        IF constraint_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE consolidaciones_detalle DROP CONSTRAINT %I', constraint_name);
        END IF;
      END $$
    `);
    await queryRunner.query(`ALTER TABLE "consolidaciones_detalle" ADD CONSTRAINT "ck_consolidado_solicitado_no_negativo" CHECK ("cantidad_solicitada" >= 0)`);

    await queryRunner.query(`
      CREATE TABLE "entregas_produccion" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "detalle_consolidado_id" uuid NOT NULL REFERENCES "consolidaciones_detalle"("id") ON DELETE RESTRICT,
        "cantidad_entregada" numeric(18,6) NOT NULL CHECK ("cantidad_entregada" > 0),
        "entrega_final" boolean NOT NULL DEFAULT false,
        "incidencia_produccion" varchar(1000),
        "estado" estado_entrega_produccion_enum NOT NULL DEFAULT 'PENDIENTE',
        "entregado_por" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "entregado_at" timestamptz NOT NULL DEFAULT now(),
        "cantidad_recibida" numeric(18,6) CHECK ("cantidad_recibida" IS NULL OR "cantidad_recibida" > 0),
        "recibido_por" uuid REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "recibido_at" timestamptz,
        "observacion_almacen" varchar(1000)
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_entregas_produccion_estado" ON "entregas_produccion" ("estado", "entregado_at")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_entrega_pendiente_detalle" ON "entregas_produccion" ("detalle_consolidado_id") WHERE "estado" = 'PENDIENTE'`);
    await queryRunner.query(`ALTER TABLE "movimientos_inventario" ADD COLUMN "entrega_produccion_id" uuid UNIQUE REFERENCES "entregas_produccion"("id") ON DELETE RESTRICT`);

    await queryRunner.query(`
      INSERT INTO "permisos" ("key", "module", "action", "description") VALUES
      ('production.areas.read', 'production', 'areas_read', 'Consultar áreas de Producción y categorías asignadas'),
      ('production.areas.manage', 'production', 'areas_manage', 'Configurar áreas de Producción y sus categorías'),
      ('production.execution.manage', 'production', 'execution', 'Iniciar productos y registrar entregas reales de Producción'),
      ('production.receipts.read', 'production', 'receipts_read', 'Consultar entregas de Producción pendientes de recepción'),
      ('production.receipts.accept', 'production', 'receipts_accept', 'Aceptar entregas de Producción e ingresarlas a Almacén')
      ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description"
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id FROM "roles" role CROSS JOIN "permisos" permission
       WHERE role.name = 'ADMINISTRADOR' AND permission.key LIKE 'production.%'
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id FROM "roles" role CROSS JOIN "permisos" permission
       WHERE role.name = 'PRODUCCION' AND permission.key IN ('production.areas.read', 'production.execution.manage')
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id FROM "roles" role CROSS JOIN "permisos" permission
       WHERE role.name = 'COMERCIALIZACION' AND permission.key IN ('production.areas.read', 'production.areas.manage')
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id FROM "roles" role CROSS JOIN "permisos" permission
       WHERE role.name = 'ALMACEN' AND permission.key IN ('production.areas.read', 'production.receipts.read', 'production.receipts.accept')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "roles_permisos" WHERE "permiso_id" IN (SELECT id FROM "permisos" WHERE "key" IN ('production.areas.read','production.areas.manage','production.execution.manage','production.receipts.read','production.receipts.accept'))`);
    await queryRunner.query(`DELETE FROM "permisos" WHERE "key" IN ('production.areas.read','production.areas.manage','production.execution.manage','production.receipts.read','production.receipts.accept')`);
    await queryRunner.query(`ALTER TABLE "movimientos_inventario" DROP COLUMN "entrega_produccion_id"`);
    await queryRunner.query(`ALTER TABLE "movimientos_inventario" ALTER COLUMN "cantidad" TYPE numeric(14,3), ALTER COLUMN "saldo_anterior" TYPE numeric(14,3), ALTER COLUMN "saldo_nuevo" TYPE numeric(14,3)`);
    await queryRunner.query(`ALTER TABLE "existencias" ALTER COLUMN "cantidad_fisica" TYPE numeric(14,3), ALTER COLUMN "cantidad_reservada" TYPE numeric(14,3)`);
    await queryRunner.query(`DROP TABLE "entregas_produccion"`);
    await queryRunner.query(`DROP INDEX "uq_consolidacion_presentacion"`);
    await queryRunner.query(`ALTER TABLE "consolidaciones_detalle" DROP CONSTRAINT "ck_consolidado_solicitado_no_negativo"`);
    await queryRunner.query(`ALTER TABLE "consolidaciones_detalle" DROP COLUMN "etapa", DROP COLUMN "cantidad_recibida_almacen", DROP COLUMN "area_produccion_id", DROP COLUMN "presentacion_id", DROP COLUMN "categoria_id"`);
    await queryRunner.query(`ALTER TABLE "consolidaciones_produccion" ALTER COLUMN "fecha_limite_preparacion" SET NOT NULL`);
    await queryRunner.query(`DROP TABLE "areas_produccion_categorias"`);
    await queryRunner.query(`DROP TABLE "areas_produccion"`);
    await queryRunner.query(`DROP TYPE "estado_entrega_produccion_enum"`);
    await queryRunner.query(`DROP TYPE "etapa_detalle_produccion_enum"`);
  }
}
