import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIterationThree1720000004000 implements MigrationInterface {
  name = 'CreateIterationThree1720000004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "unidades_medida" ADD COLUMN "precision_decimal" smallint NOT NULL DEFAULT 3 CHECK ("precision_decimal" BETWEEN 0 AND 6)`);

    await queryRunner.query(`
      CREATE TABLE "usuarios_lineas_productivas" (
        "usuario_id" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE CASCADE,
        "linea_productiva_id" uuid NOT NULL REFERENCES "lineas_productivas"("id") ON DELETE CASCADE,
        CONSTRAINT "pk_usuarios_lineas_productivas" PRIMARY KEY ("usuario_id", "linea_productiva_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_usuarios_lineas_linea" ON "usuarios_lineas_productivas" ("linea_productiva_id", "usuario_id")`);

    await queryRunner.query(`CREATE TYPE "tipo_consolidacion_produccion_enum" AS ENUM ('PRINCIPAL', 'COMPLEMENTARIA')`);
    await queryRunner.query(`CREATE TYPE "estado_consolidacion_produccion_enum" AS ENUM ('BORRADOR', 'EMITIDA', 'EN_PROCESO', 'CERRADA')`);
    await queryRunner.query(`CREATE TYPE "tipo_avance_produccion_enum" AS ENUM ('AVANCE')`);
    await queryRunner.query(`CREATE TYPE "evento_historial_produccion_enum" AS ENUM ('GENERACION', 'RECALCULO', 'EMISION', 'INICIO', 'AVANCE', 'CIERRE')`);

    await queryRunner.query(`
      CREATE TABLE "consolidaciones_produccion" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "fecha_entrega" date NOT NULL,
        "version" integer NOT NULL CHECK ("version" > 0),
        "tipo" tipo_consolidacion_produccion_enum NOT NULL,
        "estado" estado_consolidacion_produccion_enum NOT NULL DEFAULT 'BORRADOR',
        "generado_por" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "emitido_por" uuid REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "emitido_at" timestamptz,
        "cerrado_por" uuid REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "cerrado_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_consolidacion_fecha_version_tipo" UNIQUE ("fecha_entrega", "version", "tipo")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_consolidaciones_fecha_estado_version" ON "consolidaciones_produccion" ("fecha_entrega", "estado", "version" DESC)`);

    await queryRunner.query(`
      CREATE TABLE "consolidaciones_detalle" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "consolidacion_id" uuid NOT NULL REFERENCES "consolidaciones_produccion"("id") ON DELETE CASCADE,
        "producto_id" uuid NOT NULL REFERENCES "productos"("id") ON DELETE RESTRICT,
        "linea_productiva_id" uuid NOT NULL REFERENCES "lineas_productivas"("id") ON DELETE RESTRICT,
        "unidad_base_id" uuid NOT NULL REFERENCES "unidades_medida"("id") ON DELETE RESTRICT,
        "cantidad_solicitada" numeric(18,6) NOT NULL CHECK ("cantidad_solicitada" > 0),
        "cantidad_preparada" numeric(18,6) NOT NULL DEFAULT 0 CHECK ("cantidad_preparada" >= 0),
        "diferencia" numeric(18,6) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_consolidacion_agrupacion" UNIQUE ("consolidacion_id", "linea_productiva_id", "producto_id", "unidad_base_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_consolidaciones_detalle_linea_producto" ON "consolidaciones_detalle" ("linea_productiva_id", "producto_id", "consolidacion_id")`);

    await queryRunner.query(`
      CREATE TABLE "consolidaciones_origen" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "detalle_consolidado_id" uuid NOT NULL REFERENCES "consolidaciones_detalle"("id") ON DELETE CASCADE,
        "detalle_pedido_id" uuid NOT NULL UNIQUE REFERENCES "pedidos_detalle"("id") ON DELETE RESTRICT,
        "presentacion_id" uuid NOT NULL REFERENCES "presentaciones_producto"("id") ON DELETE RESTRICT,
        "cantidad_original" numeric(18,6) NOT NULL CHECK ("cantidad_original" > 0),
        "factor_aplicado" numeric(18,6) NOT NULL CHECK ("factor_aplicado" > 0),
        "aporte_unidad_base" numeric(18,6) NOT NULL CHECK ("aporte_unidad_base" > 0),
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_consolidaciones_origen_detalle" ON "consolidaciones_origen" ("detalle_consolidado_id", "created_at")`);

    await queryRunner.query(`
      CREATE TABLE "registros_avance_produccion" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "detalle_consolidado_id" uuid NOT NULL REFERENCES "consolidaciones_detalle"("id") ON DELETE RESTRICT,
        "cantidad" numeric(18,6) NOT NULL CHECK ("cantidad" > 0),
        "tipo" tipo_avance_produccion_enum NOT NULL DEFAULT 'AVANCE',
        "usuario_id" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "observacion" varchar(500),
        "fecha_hora" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_avances_detalle_fecha" ON "registros_avance_produccion" ("detalle_consolidado_id", "fecha_hora")`);

    await queryRunner.query(`
      CREATE TABLE "consolidaciones_historial" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "consolidacion_id" uuid NOT NULL REFERENCES "consolidaciones_produccion"("id") ON DELETE CASCADE,
        "estado_anterior" estado_consolidacion_produccion_enum,
        "estado_nuevo" estado_consolidacion_produccion_enum NOT NULL,
        "evento" evento_historial_produccion_enum NOT NULL,
        "usuario_id" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "observacion" varchar(1000),
        "fecha_hora" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_consolidaciones_historial_fecha" ON "consolidaciones_historial" ("consolidacion_id", "fecha_hora")`);

    await queryRunner.query(`
      INSERT INTO "permisos" ("key", "module", "action", "description") VALUES
      ('production.consolidations.read', 'production', 'read', 'Consultar consolidaciones de producción'),
      ('production.consolidations.create', 'production', 'create', 'Generar consolidaciones principales y complementarias'),
      ('production.consolidations.edit', 'production', 'update', 'Recalcular consolidaciones en Borrador'),
      ('production.consolidations.emit', 'production', 'emit', 'Emitir requerimientos a Producción'),
      ('production.traceability.read', 'production', 'sources', 'Consultar pedidos de origen y aportes'),
      ('production.requirements.read', 'production', 'requirements', 'Consultar requerimientos emitidos por línea'),
      ('production.progress.create', 'production', 'progress', 'Registrar avances parciales de Producción'),
      ('production.close', 'production', 'close', 'Cerrar requerimientos de Producción'),
      ('production.history.read', 'production', 'history', 'Consultar el historial de consolidaciones'),
      ('production.summary.read', 'production', 'summary', 'Consultar el resumen consolidado')
    `);
    await queryRunner.query(`
      INSERT INTO "roles" ("name", "description", "status", "es_sistema") VALUES
      ('PRODUCCION', 'Consulta requerimientos y registra avances de las líneas autorizadas', 'ACTIVO', true),
      ('GERENCIA', 'Consulta gerencial de consolidaciones y resultados', 'ACTIVO', true)
      ON CONFLICT ("name") DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id FROM "roles" role CROSS JOIN "permisos" permission
       WHERE role.name = 'ADMINISTRADOR' AND permission.module = 'production'
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id FROM "roles" role CROSS JOIN "permisos" permission
       WHERE role.name = 'COMERCIALIZACION'
         AND permission.key IN (
           'production.consolidations.read', 'production.consolidations.create',
           'production.consolidations.edit', 'production.consolidations.emit',
           'production.traceability.read', 'production.history.read', 'production.summary.read'
         )
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id FROM "roles" role CROSS JOIN "permisos" permission
       WHERE role.name = 'PRODUCCION'
         AND permission.key IN (
           'production.consolidations.read', 'production.traceability.read',
           'production.requirements.read', 'production.progress.create',
           'production.close', 'production.history.read', 'production.summary.read'
         )
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id FROM "roles" role CROSS JOIN "permisos" permission
       WHERE role.name = 'GERENCIA'
         AND permission.key IN (
           'production.consolidations.read', 'production.traceability.read',
           'production.history.read', 'production.summary.read'
         )
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "roles_permisos" WHERE "permiso_id" IN (SELECT "id" FROM "permisos" WHERE "module" = 'production')`);
    await queryRunner.query(`DELETE FROM "permisos" WHERE "module" = 'production'`);
    await queryRunner.query(`DELETE FROM "usuarios_roles" WHERE "rol_id" IN (SELECT "id" FROM "roles" WHERE "name" = 'GERENCIA')`);
    await queryRunner.query(`DELETE FROM "roles" WHERE "name" = 'GERENCIA'`);
    await queryRunner.query(`DROP TABLE "consolidaciones_historial"`);
    await queryRunner.query(`DROP TABLE "registros_avance_produccion"`);
    await queryRunner.query(`DROP TABLE "consolidaciones_origen"`);
    await queryRunner.query(`DROP TABLE "consolidaciones_detalle"`);
    await queryRunner.query(`DROP TABLE "consolidaciones_produccion"`);
    await queryRunner.query(`DROP TYPE "evento_historial_produccion_enum"`);
    await queryRunner.query(`DROP TYPE "tipo_avance_produccion_enum"`);
    await queryRunner.query(`DROP TYPE "estado_consolidacion_produccion_enum"`);
    await queryRunner.query(`DROP TYPE "tipo_consolidacion_produccion_enum"`);
    await queryRunner.query(`DROP TABLE "usuarios_lineas_productivas"`);
    await queryRunner.query(`ALTER TABLE "unidades_medida" DROP COLUMN "precision_decimal"`);
  }
}
