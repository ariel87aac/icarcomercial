import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVehicleDispatches1720000056000 implements MigrationInterface {
  name = 'AddVehicleDispatches1720000056000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "estado_despacho_vehiculo_enum" AS ENUM ('PENDIENTE', 'ACTIVO', 'DEVUELTO')`);
    await queryRunner.query(`CREATE SEQUENCE "despachos_vehiculos_codigo_seq" START WITH 1 INCREMENT BY 1`);
    await queryRunner.query(`
      CREATE TABLE "despachos_vehiculos" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "codigo" integer NOT NULL DEFAULT nextval('despachos_vehiculos_codigo_seq') UNIQUE,
        "vehiculo_id" uuid NOT NULL REFERENCES "vehiculos"("id") ON DELETE RESTRICT,
        "responsable_id" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "estado" estado_despacho_vehiculo_enum NOT NULL DEFAULT 'PENDIENTE',
        "creado_por" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "entregado_por" uuid REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "entregado_at" timestamptz,
        "kilometraje_inicial" numeric(14,1),
        "observacion_entrega" varchar(1000),
        "devolucion_registrada_por" uuid REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "devuelto_at" timestamptz,
        "kilometraje_final" numeric(14,1),
        "observacion_devolucion" varchar(1000),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "ck_despacho_kilometraje_inicial" CHECK ("kilometraje_inicial" IS NULL OR "kilometraje_inicial" >= 0),
        CONSTRAINT "ck_despacho_kilometraje_final" CHECK ("kilometraje_final" IS NULL OR "kilometraje_final" >= COALESCE("kilometraje_inicial", 0))
      )
    `);
    await queryRunner.query(`ALTER SEQUENCE "despachos_vehiculos_codigo_seq" OWNED BY "despachos_vehiculos"."codigo"`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_despacho_abierto_vehiculo" ON "despachos_vehiculos" ("vehiculo_id") WHERE "estado" IN ('PENDIENTE', 'ACTIVO')`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_despacho_abierto_responsable" ON "despachos_vehiculos" ("responsable_id") WHERE "estado" IN ('PENDIENTE', 'ACTIVO')`);
    await queryRunner.query(`CREATE INDEX "idx_despachos_estado_codigo" ON "despachos_vehiculos" ("estado", "codigo" DESC)`);
    await queryRunner.query(`
      CREATE TABLE "despachos_vehiculos_zonas" (
        "despacho_vehiculo_id" uuid NOT NULL REFERENCES "despachos_vehiculos"("id") ON DELETE CASCADE,
        "zona_id" uuid NOT NULL REFERENCES "zonas"("id") ON DELETE RESTRICT,
        PRIMARY KEY ("despacho_vehiculo_id", "zona_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_despachos_zona" ON "despachos_vehiculos_zonas" ("zona_id", "despacho_vehiculo_id")`);
    await queryRunner.query(`ALTER TABLE "rutas_distribucion" ADD COLUMN "despacho_vehiculo_id" uuid REFERENCES "despachos_vehiculos"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`CREATE INDEX "idx_rutas_despacho_vehiculo" ON "rutas_distribucion" ("despacho_vehiculo_id", "estado") WHERE "despacho_vehiculo_id" IS NOT NULL`);

    await queryRunner.query(`
      INSERT INTO "permisos" ("key", "module", "action", "description") VALUES
      ('distribution.vehicle_dispatches.read', 'distribution', 'vehicle_dispatch_read', 'Consultar asignaciones activas e históricas de vehículos'),
      ('distribution.vehicle_dispatches.create', 'distribution', 'vehicle_dispatch_create', 'Crear asignaciones de vehículo, distribuidor y zonas'),
      ('distribution.vehicle_dispatches.handover', 'distribution', 'vehicle_dispatch_handover', 'Entregar el vehículo y registrar kilometraje inicial'),
      ('distribution.vehicle_dispatches.return', 'distribution', 'vehicle_dispatch_return', 'Registrar devolución y kilometraje final del vehículo')
      ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description"
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id FROM "roles" role CROSS JOIN "permisos" permission
       WHERE role.name IN ('ADMINISTRADOR', 'DISTRIBUCION')
         AND permission.key IN ('distribution.vehicle_dispatches.read', 'distribution.vehicle_dispatches.create', 'distribution.vehicle_dispatches.handover', 'distribution.vehicle_dispatches.return')
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id FROM "roles" role CROSS JOIN "permisos" permission
       WHERE role.name IN ('COMERCIALIZACION', 'GERENCIA')
         AND permission.key = 'distribution.vehicle_dispatches.read'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const keys = `'distribution.vehicle_dispatches.read', 'distribution.vehicle_dispatches.create', 'distribution.vehicle_dispatches.handover', 'distribution.vehicle_dispatches.return'`;
    await queryRunner.query(`DELETE FROM "roles_permisos" WHERE "permiso_id" IN (SELECT id FROM "permisos" WHERE "key" IN (${keys}))`);
    await queryRunner.query(`DELETE FROM "permisos" WHERE "key" IN (${keys})`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_rutas_despacho_vehiculo"`);
    await queryRunner.query(`ALTER TABLE "rutas_distribucion" DROP COLUMN "despacho_vehiculo_id"`);
    await queryRunner.query(`DROP TABLE "despachos_vehiculos_zonas"`);
    await queryRunner.query(`DROP TABLE "despachos_vehiculos"`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS "despachos_vehiculos_codigo_seq"`);
    await queryRunner.query(`DROP TYPE "estado_despacho_vehiculo_enum"`);
  }
}
