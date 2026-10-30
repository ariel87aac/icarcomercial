import { MigrationInterface, QueryRunner } from 'typeorm';

export class FlexibleProductionPlanning1720000034000 implements MigrationInterface {
  name = 'FlexibleProductionPlanning1720000034000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "estado_consolidacion_produccion_enum" RENAME TO "estado_consolidacion_produccion_enum_old"`);
    await queryRunner.query(`CREATE TYPE "estado_consolidacion_produccion_enum" AS ENUM ('BORRADOR', 'EMITIDA', 'EN_PROCESO', 'CERRADA', 'CANCELADA', 'CERRADA_INCOMPLETA')`);
    await queryRunner.query(`ALTER TABLE "consolidaciones_produccion" ALTER COLUMN "estado" DROP DEFAULT`);
    await queryRunner.query(`ALTER TABLE "consolidaciones_produccion" ALTER COLUMN "estado" TYPE "estado_consolidacion_produccion_enum" USING "estado"::text::"estado_consolidacion_produccion_enum"`);
    await queryRunner.query(`ALTER TABLE "consolidaciones_produccion" ALTER COLUMN "estado" SET DEFAULT 'BORRADOR'`);
    await queryRunner.query(`ALTER TABLE "consolidaciones_historial" ALTER COLUMN "estado_anterior" TYPE "estado_consolidacion_produccion_enum" USING "estado_anterior"::text::"estado_consolidacion_produccion_enum"`);
    await queryRunner.query(`ALTER TABLE "consolidaciones_historial" ALTER COLUMN "estado_nuevo" TYPE "estado_consolidacion_produccion_enum" USING "estado_nuevo"::text::"estado_consolidacion_produccion_enum"`);
    await queryRunner.query(`DROP TYPE "estado_consolidacion_produccion_enum_old"`);

    await queryRunner.query(`ALTER TYPE "etapa_detalle_produccion_enum" RENAME TO "etapa_detalle_produccion_enum_old"`);
    await queryRunner.query(`CREATE TYPE "etapa_detalle_produccion_enum" AS ENUM ('PENDIENTE', 'EN_PROCESO', 'PENDIENTE_RECEPCION', 'RECIBIDO_PARCIAL', 'COMPLETADO', 'CERRADO_CON_INCIDENCIA', 'CANCELADO')`);
    await queryRunner.query(`ALTER TABLE "consolidaciones_detalle" ALTER COLUMN "etapa" DROP DEFAULT`);
    await queryRunner.query(`ALTER TABLE "consolidaciones_detalle" ALTER COLUMN "etapa" TYPE "etapa_detalle_produccion_enum" USING "etapa"::text::"etapa_detalle_produccion_enum"`);
    await queryRunner.query(`ALTER TABLE "consolidaciones_detalle" ALTER COLUMN "etapa" SET DEFAULT 'PENDIENTE'`);
    await queryRunner.query(`DROP TYPE "etapa_detalle_produccion_enum_old"`);

    await queryRunner.query(`ALTER TYPE "evento_historial_produccion_enum" RENAME TO "evento_historial_produccion_enum_old"`);
    await queryRunner.query(`CREATE TYPE "evento_historial_produccion_enum" AS ENUM ('GENERACION', 'RECALCULO', 'AJUSTE_LOTE', 'PRODUCCION_ADICIONAL', 'PRODUCTO_AGREGADO', 'PRODUCTO_RETIRADO', 'EMISION', 'PROGRAMACION', 'INICIO', 'AVANCE', 'ENTREGA_PRODUCCION', 'RECEPCION_ALMACEN', 'CANCELACION_PRODUCTO', 'CANCELACION_ORDEN', 'CIERRE_INCOMPLETO', 'CIERRE')`);
    await queryRunner.query(`ALTER TABLE "consolidaciones_historial" ALTER COLUMN "evento" TYPE "evento_historial_produccion_enum" USING "evento"::text::"evento_historial_produccion_enum"`);
    await queryRunner.query(`DROP TYPE "evento_historial_produccion_enum_old"`);

    await queryRunner.query(`ALTER TABLE "solicitudes_abastecimiento" DROP CONSTRAINT "ck_solicitud_abastecimiento_flujo"`);
    await queryRunner.query(`ALTER TYPE "estado_solicitud_abastecimiento_enum" RENAME TO "estado_solicitud_abastecimiento_enum_old"`);
    await queryRunner.query(`CREATE TYPE "estado_solicitud_abastecimiento_enum" AS ENUM ('BORRADOR', 'ENVIADA', 'PROGRAMADA', 'CERRADA', 'CERRADA_INCOMPLETA')`);
    await queryRunner.query(`ALTER TABLE "solicitudes_abastecimiento" ALTER COLUMN "estado" DROP DEFAULT`);
    await queryRunner.query(`ALTER TABLE "solicitudes_abastecimiento" ALTER COLUMN "estado" TYPE "estado_solicitud_abastecimiento_enum" USING "estado"::text::"estado_solicitud_abastecimiento_enum"`);
    await queryRunner.query(`ALTER TABLE "solicitudes_abastecimiento" ALTER COLUMN "estado" SET DEFAULT 'BORRADOR'`);
    await queryRunner.query(`DROP TYPE "estado_solicitud_abastecimiento_enum_old"`);

    await queryRunner.query(`ALTER TABLE "consolidaciones_produccion" ADD COLUMN "observacion_cierre_incompleto" varchar(1000)`);
    await queryRunner.query(`ALTER TABLE "consolidaciones_produccion" ADD COLUMN "motivo_cancelacion" varchar(1000)`);
    await queryRunner.query(`ALTER TABLE "consolidaciones_produccion" ADD COLUMN "cancelado_por" uuid REFERENCES "usuarios"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`ALTER TABLE "consolidaciones_produccion" ADD COLUMN "cancelado_at" timestamptz`);

    await queryRunner.query(`ALTER TABLE "consolidaciones_detalle" ADD COLUMN "fecha_programada" date`);
    await queryRunner.query(`ALTER TABLE "consolidaciones_detalle" ADD COLUMN "secuencia" integer`);
    await queryRunner.query(`ALTER TABLE "consolidaciones_detalle" ADD COLUMN "iniciado_at" timestamptz`);
    await queryRunner.query(`ALTER TABLE "consolidaciones_detalle" ADD COLUMN "concluido_at" timestamptz`);
    await queryRunner.query(`ALTER TABLE "consolidaciones_detalle" ADD COLUMN "cancelado_por" uuid REFERENCES "usuarios"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`ALTER TABLE "consolidaciones_detalle" ADD COLUMN "cancelado_at" timestamptz`);
    await queryRunner.query(`ALTER TABLE "consolidaciones_detalle" ADD COLUMN "motivo_cancelacion" varchar(1000)`);
    await queryRunner.query(`
      UPDATE "consolidaciones_detalle" detail
         SET "fecha_programada" = consolidation."fecha_entrega"
        FROM "consolidaciones_produccion" consolidation
       WHERE consolidation.id = detail."consolidacion_id"
    `);
    await queryRunner.query(`
      WITH ordered AS (
        SELECT id,
               row_number() OVER (
                 PARTITION BY "consolidacion_id", "area_produccion_id"
                 ORDER BY "categoria_id", "producto_id", "presentacion_id"
               ) AS position
          FROM "consolidaciones_detalle"
      )
      UPDATE "consolidaciones_detalle" detail
         SET "secuencia" = ordered.position
        FROM ordered
       WHERE ordered.id = detail.id
    `);
    await queryRunner.query(`ALTER TABLE "consolidaciones_detalle" ALTER COLUMN "fecha_programada" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "consolidaciones_detalle" ALTER COLUMN "secuencia" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "consolidaciones_detalle" ADD CONSTRAINT "ck_detalle_produccion_secuencia" CHECK ("secuencia" > 0)`);
    await queryRunner.query(`CREATE INDEX "idx_detalle_produccion_programacion" ON "consolidaciones_detalle" ("area_produccion_id", "fecha_programada", "secuencia")`);

    await queryRunner.query(`ALTER TABLE "solicitudes_abastecimiento" ADD COLUMN "observacion_cierre" varchar(1000)`);
    await queryRunner.query(`ALTER TABLE "solicitudes_abastecimiento" ADD COLUMN "cerrado_por" uuid REFERENCES "usuarios"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`
      ALTER TABLE "solicitudes_abastecimiento" ADD CONSTRAINT "ck_solicitud_abastecimiento_flujo" CHECK (
        ("estado" = 'BORRADOR' AND "enviado_at" IS NULL AND "enviado_por" IS NULL AND "consolidacion_produccion_id" IS NULL AND "programado_at" IS NULL AND "cerrado_at" IS NULL)
        OR ("estado" = 'ENVIADA' AND "enviado_at" IS NOT NULL AND "enviado_por" IS NOT NULL AND "consolidacion_produccion_id" IS NULL AND "programado_at" IS NULL AND "cerrado_at" IS NULL)
        OR ("estado" = 'PROGRAMADA' AND "enviado_at" IS NOT NULL AND "enviado_por" IS NOT NULL AND "consolidacion_produccion_id" IS NOT NULL AND "programado_at" IS NOT NULL AND "cerrado_at" IS NULL)
        OR ("estado" = 'CERRADA' AND "enviado_at" IS NOT NULL AND "enviado_por" IS NOT NULL AND "consolidacion_produccion_id" IS NOT NULL AND "programado_at" IS NOT NULL AND "cerrado_at" IS NOT NULL)
        OR ("estado" = 'CERRADA_INCOMPLETA' AND "enviado_at" IS NOT NULL AND "enviado_por" IS NOT NULL AND "consolidacion_produccion_id" IS NOT NULL AND "programado_at" IS NOT NULL AND "cerrado_at" IS NOT NULL AND "cerrado_por" IS NOT NULL AND length(trim("observacion_cierre")) >= 5)
      )
    `);

    await queryRunner.query(`
      INSERT INTO "permisos" ("key", "module", "action", "description") VALUES
      ('production.schedule.manage', 'production', 'schedule', 'Programar fechas y secuencia de elaboración por área'),
      ('production.cancel', 'production', 'cancel', 'Cancelar productos u órdenes de Producción con motivo'),
      ('production.close_incomplete', 'production', 'close_incomplete', 'Cerrar una orden y su solicitud de abastecimiento de manera incompleta')
      ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description"
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id
        FROM "roles" role CROSS JOIN "permisos" permission
       WHERE role.name = 'ADMINISTRADOR'
         AND permission.key IN ('production.schedule.manage', 'production.cancel', 'production.close_incomplete')
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id
        FROM "roles" role CROSS JOIN "permisos" permission
       WHERE role.name = 'PRODUCCION'
         AND permission.key IN (
           'production.consolidations.create', 'production.consolidations.edit',
           'production.consolidations.emit', 'production.plan.adjust',
           'production.schedule.manage', 'production.cancel',
           'production.close', 'production.close_incomplete',
           'production.history.read', 'production.summary.read'
         )
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "roles_permisos" WHERE "permiso_id" IN (SELECT id FROM "permisos" WHERE "key" IN ('production.schedule.manage', 'production.cancel', 'production.close_incomplete'))`);
    await queryRunner.query(`DELETE FROM "permisos" WHERE "key" IN ('production.schedule.manage', 'production.cancel', 'production.close_incomplete')`);
    await queryRunner.query(`ALTER TABLE "solicitudes_abastecimiento" DROP CONSTRAINT "ck_solicitud_abastecimiento_flujo"`);
    await queryRunner.query(`ALTER TABLE "solicitudes_abastecimiento" DROP COLUMN "cerrado_por", DROP COLUMN "observacion_cierre"`);
    await queryRunner.query(`ALTER TABLE "consolidaciones_detalle" DROP CONSTRAINT "ck_detalle_produccion_secuencia"`);
    await queryRunner.query(`DROP INDEX "idx_detalle_produccion_programacion"`);
    await queryRunner.query(`ALTER TABLE "consolidaciones_detalle" DROP COLUMN "motivo_cancelacion", DROP COLUMN "cancelado_at", DROP COLUMN "cancelado_por", DROP COLUMN "concluido_at", DROP COLUMN "iniciado_at", DROP COLUMN "secuencia", DROP COLUMN "fecha_programada"`);
    await queryRunner.query(`ALTER TABLE "consolidaciones_produccion" DROP COLUMN "cancelado_at", DROP COLUMN "cancelado_por", DROP COLUMN "motivo_cancelacion", DROP COLUMN "observacion_cierre_incompleto"`);
  }
}
