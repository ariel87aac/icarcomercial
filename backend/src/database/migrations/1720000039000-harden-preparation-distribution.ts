import { MigrationInterface, QueryRunner } from 'typeorm';

export class HardenPreparationDistribution1720000039000 implements MigrationInterface {
  name = 'HardenPreparationDistribution1720000039000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_preparacion_activa_pedido"`);

    await queryRunner.query(`ALTER TYPE "estado_preparacion_enum" RENAME TO "estado_preparacion_enum_old"`);
    await queryRunner.query(`CREATE TYPE "estado_preparacion_enum" AS ENUM ('PENDIENTE', 'EN_PREPARACION', 'OBSERVADA', 'PREPARADA', 'ASIGNADA', 'DESPACHADA', 'CANCELADA')`);
    await queryRunner.query(`ALTER TABLE "preparaciones_pedido" ALTER COLUMN "estado" DROP DEFAULT`);
    await queryRunner.query(`ALTER TABLE "preparaciones_pedido" ALTER COLUMN "estado" TYPE "estado_preparacion_enum" USING "estado"::text::"estado_preparacion_enum"`);
    await queryRunner.query(`ALTER TABLE "preparaciones_pedido" ALTER COLUMN "estado" SET DEFAULT 'PENDIENTE'`);
    await queryRunner.query(`ALTER TABLE "preparaciones_historial" ALTER COLUMN "estado_anterior" TYPE "estado_preparacion_enum" USING "estado_anterior"::text::"estado_preparacion_enum"`);
    await queryRunner.query(`ALTER TABLE "preparaciones_historial" ALTER COLUMN "estado_nuevo" TYPE "estado_preparacion_enum" USING "estado_nuevo"::text::"estado_preparacion_enum"`);
    await queryRunner.query(`DROP TYPE "estado_preparacion_enum_old"`);

    await queryRunner.query(`ALTER TYPE "evento_preparacion_enum" RENAME TO "evento_preparacion_enum_old"`);
    await queryRunner.query(`CREATE TYPE "evento_preparacion_enum" AS ENUM ('INICIO', 'AVANCE', 'OBSERVACION', 'CONFIRMACION', 'ASIGNACION', 'DESASIGNACION', 'DESPACHO', 'CANCELACION')`);
    await queryRunner.query(`ALTER TABLE "preparaciones_historial" ALTER COLUMN "evento" TYPE "evento_preparacion_enum" USING "evento"::text::"evento_preparacion_enum"`);
    await queryRunner.query(`DROP TYPE "evento_preparacion_enum_old"`);

    await queryRunner.query(`ALTER TABLE "preparaciones_pedido" ADD COLUMN "cancelado_por" uuid REFERENCES "usuarios"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`ALTER TABLE "preparaciones_pedido" ADD COLUMN "cancelado_at" timestamptz`);
    await queryRunner.query(`ALTER TABLE "preparaciones_pedido" ADD COLUMN "motivo_cancelacion" varchar(1000)`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_preparacion_no_cancelada_pedido"
      ON "preparaciones_pedido" ("pedido_id")
      WHERE "estado" <> 'CANCELADA'
    `);

    await queryRunner.query(`
      DO $$
      DECLARE constraint_name text;
      BEGIN
        SELECT conname INTO constraint_name
          FROM pg_constraint
         WHERE conrelid = 'preparaciones_detalle'::regclass
           AND contype = 'c'
           AND pg_get_constraintdef(oid) ILIKE '%disponible_copia%'
         LIMIT 1;
        IF constraint_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE "preparaciones_detalle" DROP CONSTRAINT %I', constraint_name);
        END IF;
      END $$
    `);
    await queryRunner.query(`ALTER TABLE "preparaciones_detalle" ADD COLUMN "fisico_copia" numeric(14,3) NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "preparaciones_detalle" ADD COLUMN "faltante_copia" numeric(14,3) NOT NULL DEFAULT 0 CHECK ("faltante_copia" >= 0)`);

    await queryRunner.query(`ALTER TYPE "estado_ruta_enum" RENAME TO "estado_ruta_enum_old"`);
    await queryRunner.query(`CREATE TYPE "estado_ruta_enum" AS ENUM ('BORRADOR', 'PLANIFICADA', 'EN_REPARTO', 'FINALIZADA', 'LIQUIDADA', 'CANCELADA')`);
    await queryRunner.query(`ALTER TABLE "rutas_distribucion" ALTER COLUMN "estado" DROP DEFAULT`);
    await queryRunner.query(`ALTER TABLE "rutas_distribucion" ALTER COLUMN "estado" TYPE "estado_ruta_enum" USING "estado"::text::"estado_ruta_enum"`);
    await queryRunner.query(`ALTER TABLE "rutas_distribucion" ALTER COLUMN "estado" SET DEFAULT 'BORRADOR'`);
    await queryRunner.query(`ALTER TABLE "rutas_historial" ALTER COLUMN "estado_anterior" TYPE "estado_ruta_enum" USING "estado_anterior"::text::"estado_ruta_enum"`);
    await queryRunner.query(`ALTER TABLE "rutas_historial" ALTER COLUMN "estado_nuevo" TYPE "estado_ruta_enum" USING "estado_nuevo"::text::"estado_ruta_enum"`);
    await queryRunner.query(`DROP TYPE "estado_ruta_enum_old"`);

    await queryRunner.query(`ALTER TYPE "evento_ruta_enum" RENAME TO "evento_ruta_enum_old"`);
    await queryRunner.query(`CREATE TYPE "evento_ruta_enum" AS ENUM ('CREACION', 'ASIGNACION', 'DESASIGNACION', 'CAMBIO_VEHICULO', 'SECUENCIA', 'REPROGRAMACION', 'PLANIFICACION', 'SALIDA', 'VISITA', 'FINALIZACION', 'LIQUIDACION', 'CANCELACION')`);
    await queryRunner.query(`ALTER TABLE "rutas_historial" ALTER COLUMN "evento" TYPE "evento_ruta_enum" USING "evento"::text::"evento_ruta_enum"`);
    await queryRunner.query(`DROP TYPE "evento_ruta_enum_old"`);

    await queryRunner.query(`ALTER TABLE "rutas_distribucion" ADD COLUMN "reprogramado_por" uuid REFERENCES "usuarios"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`ALTER TABLE "rutas_distribucion" ADD COLUMN "reprogramado_at" timestamptz`);
    await queryRunner.query(`ALTER TABLE "rutas_distribucion" ADD COLUMN "motivo_reprogramacion" varchar(1000)`);
    await queryRunner.query(`ALTER TABLE "rutas_distribucion" ADD COLUMN "cancelado_por" uuid REFERENCES "usuarios"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`ALTER TABLE "rutas_distribucion" ADD COLUMN "cancelado_at" timestamptz`);
    await queryRunner.query(`ALTER TABLE "rutas_distribucion" ADD COLUMN "motivo_cancelacion" varchar(1000)`);

    await queryRunner.query(`
      INSERT INTO "permisos" ("key", "module", "action", "description") VALUES
      ('preparations.cancel', 'preparations', 'cancel', 'Cancelar una preparación con motivo y trazabilidad'),
      ('distribution.routes.reschedule', 'distribution', 'reschedule', 'Reprogramar una ruta antes de su salida'),
      ('distribution.routes.cancel', 'distribution', 'cancel', 'Cancelar una ruta antes de su salida'),
      ('distribution.weights.read', 'distribution', 'weights_read', 'Consultar la integridad de pesos para carga'),
      ('distribution.weights.manage', 'distribution', 'weights_manage', 'Registrar pesos de presentaciones para distribución')
      ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description"
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id
        FROM "roles" role CROSS JOIN "permisos" permission
       WHERE role.name = 'ADMINISTRADOR'
         AND permission.key IN ('preparations.cancel', 'distribution.routes.reschedule', 'distribution.routes.cancel', 'distribution.weights.read', 'distribution.weights.manage')
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id
        FROM "roles" role CROSS JOIN "permisos" permission
       WHERE role.name = 'ALMACEN' AND permission.key = 'preparations.cancel'
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id
        FROM "roles" role CROSS JOIN "permisos" permission
       WHERE role.name = 'DISTRIBUCION'
         AND permission.key IN ('distribution.routes.reschedule', 'distribution.routes.cancel', 'distribution.weights.read', 'distribution.weights.manage')
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id
        FROM "roles" role CROSS JOIN "permisos" permission
       WHERE role.name = 'GERENCIA' AND permission.key = 'distribution.weights.read'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "roles_permisos" WHERE "permiso_id" IN (SELECT id FROM "permisos" WHERE "key" IN ('preparations.cancel', 'distribution.routes.reschedule', 'distribution.routes.cancel', 'distribution.weights.read', 'distribution.weights.manage'))`);
    await queryRunner.query(`DELETE FROM "permisos" WHERE "key" IN ('preparations.cancel', 'distribution.routes.reschedule', 'distribution.routes.cancel', 'distribution.weights.read', 'distribution.weights.manage')`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_preparacion_no_cancelada_pedido"`);

    await queryRunner.query(`UPDATE "preparaciones_pedido" SET "estado" = 'DESPACHADA' WHERE "estado" = 'CANCELADA'`);
    await queryRunner.query(`UPDATE "preparaciones_historial" SET "estado_anterior" = 'DESPACHADA' WHERE "estado_anterior" = 'CANCELADA'`);
    await queryRunner.query(`UPDATE "preparaciones_historial" SET "estado_nuevo" = 'DESPACHADA' WHERE "estado_nuevo" = 'CANCELADA'`);
    await queryRunner.query(`UPDATE "preparaciones_historial" SET "evento" = 'ASIGNACION' WHERE "evento" = 'DESASIGNACION'`);
    await queryRunner.query(`UPDATE "preparaciones_historial" SET "evento" = 'OBSERVACION' WHERE "evento" = 'CANCELACION'`);
    await queryRunner.query(`ALTER TYPE "evento_preparacion_enum" RENAME TO "evento_preparacion_enum_new"`);
    await queryRunner.query(`CREATE TYPE "evento_preparacion_enum" AS ENUM ('INICIO', 'AVANCE', 'OBSERVACION', 'CONFIRMACION', 'ASIGNACION', 'DESPACHO')`);
    await queryRunner.query(`ALTER TABLE "preparaciones_historial" ALTER COLUMN "evento" TYPE "evento_preparacion_enum" USING "evento"::text::"evento_preparacion_enum"`);
    await queryRunner.query(`DROP TYPE "evento_preparacion_enum_new"`);
    await queryRunner.query(`ALTER TYPE "estado_preparacion_enum" RENAME TO "estado_preparacion_enum_new"`);
    await queryRunner.query(`CREATE TYPE "estado_preparacion_enum" AS ENUM ('PENDIENTE', 'EN_PREPARACION', 'OBSERVADA', 'PREPARADA', 'ASIGNADA', 'DESPACHADA')`);
    await queryRunner.query(`ALTER TABLE "preparaciones_pedido" ALTER COLUMN "estado" DROP DEFAULT`);
    await queryRunner.query(`ALTER TABLE "preparaciones_pedido" ALTER COLUMN "estado" TYPE "estado_preparacion_enum" USING "estado"::text::"estado_preparacion_enum"`);
    await queryRunner.query(`ALTER TABLE "preparaciones_pedido" ALTER COLUMN "estado" SET DEFAULT 'PENDIENTE'`);
    await queryRunner.query(`ALTER TABLE "preparaciones_historial" ALTER COLUMN "estado_anterior" TYPE "estado_preparacion_enum" USING "estado_anterior"::text::"estado_preparacion_enum"`);
    await queryRunner.query(`ALTER TABLE "preparaciones_historial" ALTER COLUMN "estado_nuevo" TYPE "estado_preparacion_enum" USING "estado_nuevo"::text::"estado_preparacion_enum"`);
    await queryRunner.query(`DROP TYPE "estado_preparacion_enum_new"`);

    await queryRunner.query(`UPDATE "rutas_distribucion" SET "estado" = 'FINALIZADA' WHERE "estado" = 'CANCELADA'`);
    await queryRunner.query(`UPDATE "rutas_historial" SET "estado_anterior" = 'FINALIZADA' WHERE "estado_anterior" = 'CANCELADA'`);
    await queryRunner.query(`UPDATE "rutas_historial" SET "estado_nuevo" = 'FINALIZADA' WHERE "estado_nuevo" = 'CANCELADA'`);
    await queryRunner.query(`UPDATE "rutas_historial" SET "evento" = 'ASIGNACION' WHERE "evento" = 'DESASIGNACION'`);
    await queryRunner.query(`UPDATE "rutas_historial" SET "evento" = 'SECUENCIA' WHERE "evento" = 'REPROGRAMACION'`);
    await queryRunner.query(`UPDATE "rutas_historial" SET "evento" = 'FINALIZACION' WHERE "evento" = 'CANCELACION'`);
    await queryRunner.query(`ALTER TYPE "evento_ruta_enum" RENAME TO "evento_ruta_enum_new"`);
    await queryRunner.query(`CREATE TYPE "evento_ruta_enum" AS ENUM ('CREACION', 'ASIGNACION', 'CAMBIO_VEHICULO', 'SECUENCIA', 'PLANIFICACION', 'SALIDA', 'VISITA', 'FINALIZACION', 'LIQUIDACION')`);
    await queryRunner.query(`ALTER TABLE "rutas_historial" ALTER COLUMN "evento" TYPE "evento_ruta_enum" USING "evento"::text::"evento_ruta_enum"`);
    await queryRunner.query(`DROP TYPE "evento_ruta_enum_new"`);
    await queryRunner.query(`ALTER TYPE "estado_ruta_enum" RENAME TO "estado_ruta_enum_new"`);
    await queryRunner.query(`CREATE TYPE "estado_ruta_enum" AS ENUM ('BORRADOR', 'PLANIFICADA', 'EN_REPARTO', 'FINALIZADA', 'LIQUIDADA')`);
    await queryRunner.query(`ALTER TABLE "rutas_distribucion" ALTER COLUMN "estado" DROP DEFAULT`);
    await queryRunner.query(`ALTER TABLE "rutas_distribucion" ALTER COLUMN "estado" TYPE "estado_ruta_enum" USING "estado"::text::"estado_ruta_enum"`);
    await queryRunner.query(`ALTER TABLE "rutas_distribucion" ALTER COLUMN "estado" SET DEFAULT 'BORRADOR'`);
    await queryRunner.query(`ALTER TABLE "rutas_historial" ALTER COLUMN "estado_anterior" TYPE "estado_ruta_enum" USING "estado_anterior"::text::"estado_ruta_enum"`);
    await queryRunner.query(`ALTER TABLE "rutas_historial" ALTER COLUMN "estado_nuevo" TYPE "estado_ruta_enum" USING "estado_nuevo"::text::"estado_ruta_enum"`);
    await queryRunner.query(`DROP TYPE "estado_ruta_enum_new"`);

    await queryRunner.query(`ALTER TABLE "rutas_distribucion" DROP COLUMN "motivo_cancelacion", DROP COLUMN "cancelado_at", DROP COLUMN "cancelado_por", DROP COLUMN "motivo_reprogramacion", DROP COLUMN "reprogramado_at", DROP COLUMN "reprogramado_por"`);
    await queryRunner.query(`UPDATE "preparaciones_detalle" SET "disponible_copia" = GREATEST(0, "disponible_copia")`);
    await queryRunner.query(`ALTER TABLE "preparaciones_detalle" DROP COLUMN "faltante_copia", DROP COLUMN "fisico_copia"`);
    await queryRunner.query(`ALTER TABLE "preparaciones_detalle" ADD CONSTRAINT "ck_preparaciones_detalle_disponible_copia" CHECK ("disponible_copia" >= 0)`);
    await queryRunner.query(`ALTER TABLE "preparaciones_pedido" DROP COLUMN "motivo_cancelacion", DROP COLUMN "cancelado_at", DROP COLUMN "cancelado_por"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_preparacion_activa_pedido"
      ON "preparaciones_pedido" ("pedido_id")
      WHERE "estado" IN ('PENDIENTE', 'EN_PREPARACION', 'OBSERVADA', 'PREPARADA', 'ASIGNADA')
    `);
  }
}
