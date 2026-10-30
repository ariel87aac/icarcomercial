import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWarehouseReturnsAndAutomaticSales1720000044000 implements MigrationInterface {
  name = 'AddWarehouseReturnsAndAutomaticSales1720000044000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "estado_orden_retorno_almacen_enum" AS ENUM ('PENDIENTE', 'RECIBIDA')`);
    await queryRunner.query(`
      CREATE TABLE "ordenes_retorno_almacen" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "codigo" SERIAL NOT NULL,
        "ruta_id" uuid NOT NULL,
        "estado" "estado_orden_retorno_almacen_enum" NOT NULL DEFAULT 'PENDIENTE',
        "cantidad_esperada" numeric(14,3) NOT NULL,
        "cantidad_recibida" numeric(14,3) NOT NULL DEFAULT 0,
        "creado_por" uuid NOT NULL,
        "creado_at" timestamptz NOT NULL DEFAULT now(),
        "recibido_por" uuid,
        "recibido_at" timestamptz,
        "observacion" varchar(1000),
        CONSTRAINT "PK_ordenes_retorno_almacen" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_ordenes_retorno_almacen_codigo" UNIQUE ("codigo"),
        CONSTRAINT "UQ_ordenes_retorno_almacen_ruta" UNIQUE ("ruta_id"),
        CONSTRAINT "FK_ordenes_retorno_ruta" FOREIGN KEY ("ruta_id") REFERENCES "rutas_distribucion"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_ordenes_retorno_creado_por" FOREIGN KEY ("creado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_ordenes_retorno_recibido_por" FOREIGN KEY ("recibido_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "ordenes_retorno_almacen_detalle" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "orden_retorno_id" uuid NOT NULL,
        "resultado_visita_detalle_id" uuid NOT NULL,
        "existencia_id" uuid NOT NULL,
        "cantidad_esperada" numeric(14,3) NOT NULL,
        "cantidad_recibida" numeric(14,3) NOT NULL DEFAULT 0,
        CONSTRAINT "PK_ordenes_retorno_almacen_detalle" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_orden_retorno_resultado_detalle" UNIQUE ("resultado_visita_detalle_id"),
        CONSTRAINT "FK_orden_retorno_detalle_orden" FOREIGN KEY ("orden_retorno_id") REFERENCES "ordenes_retorno_almacen"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_orden_retorno_detalle_visita" FOREIGN KEY ("resultado_visita_detalle_id") REFERENCES "resultados_visita_detalle"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_orden_retorno_detalle_existencia" FOREIGN KEY ("existencia_id") REFERENCES "existencias"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_orden_retorno_cantidad_esperada" CHECK ("cantidad_esperada" > 0),
        CONSTRAINT "CHK_orden_retorno_cantidad_recibida" CHECK ("cantidad_recibida" >= 0 AND "cantidad_recibida" <= "cantidad_esperada")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_ordenes_retorno_estado_creado" ON "ordenes_retorno_almacen" ("estado", "creado_at")`);
    await queryRunner.query(`CREATE INDEX "IDX_ordenes_retorno_detalle_orden" ON "ordenes_retorno_almacen_detalle" ("orden_retorno_id")`);
    await queryRunner.query(`
      INSERT INTO "permisos" ("key", "module", "action", "description") VALUES
        ('inventory.returns.read', 'inventory', 'returns-read', 'Consultar órdenes de retorno pendientes de recepción'),
        ('inventory.returns.receive', 'inventory', 'returns-receive', 'Recibir devoluciones de recorridos en Almacén')
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id
        FROM "roles" role
        CROSS JOIN "permisos" permission
       WHERE role.name IN ('ADMINISTRADOR', 'ALMACEN')
         AND permission.key IN ('inventory.returns.read', 'inventory.returns.receive')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "roles_permisos"
       WHERE "permiso_id" IN (
         SELECT id FROM "permisos" WHERE key IN ('inventory.returns.read', 'inventory.returns.receive')
       )
    `);
    await queryRunner.query(`DELETE FROM "permisos" WHERE key IN ('inventory.returns.read', 'inventory.returns.receive')`);
    await queryRunner.query(`DROP TABLE "ordenes_retorno_almacen_detalle"`);
    await queryRunner.query(`DROP TABLE "ordenes_retorno_almacen"`);
    await queryRunner.query(`DROP TYPE "estado_orden_retorno_almacen_enum"`);
  }
}
