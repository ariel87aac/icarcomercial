import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIterationFour1720000005000 implements MigrationInterface {
  name = 'CreateIterationFour1720000005000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "tipo_movimiento_inventario_enum" ADD VALUE IF NOT EXISTS 'SALIDA_DESPACHO'`);
    await queryRunner.query(`ALTER TYPE "tipo_movimiento_inventario_enum" ADD VALUE IF NOT EXISTS 'ENTRADA_DEVOLUCION'`);
    await queryRunner.query(`ALTER TYPE "estado_reserva_inventario_enum" ADD VALUE IF NOT EXISTS 'CONSUMIDA'`);

    await queryRunner.query(`CREATE TYPE "estado_preparacion_enum" AS ENUM ('PENDIENTE', 'EN_PREPARACION', 'OBSERVADA', 'PREPARADA', 'ASIGNADA', 'DESPACHADA')`);
    await queryRunner.query(`CREATE TYPE "evento_preparacion_enum" AS ENUM ('INICIO', 'AVANCE', 'OBSERVACION', 'CONFIRMACION', 'ASIGNACION', 'DESPACHO')`);
    await queryRunner.query(`CREATE TYPE "estado_ruta_enum" AS ENUM ('BORRADOR', 'PLANIFICADA', 'EN_REPARTO', 'FINALIZADA', 'LIQUIDADA')`);
    await queryRunner.query(`CREATE TYPE "funcion_responsable_ruta_enum" AS ENUM ('PRINCIPAL', 'APOYO')`);
    await queryRunner.query(`CREATE TYPE "estado_entrega_ruta_enum" AS ENUM ('PENDIENTE', 'VISITADA')`);
    await queryRunner.query(`CREATE TYPE "resultado_visita_enum" AS ENUM ('ENTREGADA', 'ENTREGA_PARCIAL', 'NO_ENTREGADA')`);
    await queryRunner.query(`CREATE TYPE "evento_ruta_enum" AS ENUM ('CREACION', 'ASIGNACION', 'SECUENCIA', 'PLANIFICACION', 'SALIDA', 'VISITA', 'FINALIZACION', 'LIQUIDACION')`);
    await queryRunner.query(`CREATE SEQUENCE "rutas_codigo_seq" START 1`);

    await queryRunner.query(`
      CREATE TABLE "preparaciones_pedido" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "pedido_id" uuid NOT NULL REFERENCES "pedidos"("id") ON DELETE RESTRICT,
        "responsable_id" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "estado" estado_preparacion_enum NOT NULL DEFAULT 'PENDIENTE',
        "version" integer NOT NULL DEFAULT 1,
        "referencias_produccion" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "iniciado_at" timestamptz NOT NULL DEFAULT now(),
        "confirmado_por" uuid REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "confirmado_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "ck_preparacion_version" CHECK ("version" > 0)
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_preparaciones_pedido_estado" ON "preparaciones_pedido" ("pedido_id", "estado")`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_preparacion_activa_pedido"
      ON "preparaciones_pedido" ("pedido_id")
      WHERE "estado" IN ('PENDIENTE', 'EN_PREPARACION', 'OBSERVADA', 'PREPARADA', 'ASIGNADA')
    `);

    await queryRunner.query(`
      CREATE TABLE "preparaciones_detalle" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "preparacion_id" uuid NOT NULL REFERENCES "preparaciones_pedido"("id") ON DELETE CASCADE,
        "detalle_pedido_id" uuid NOT NULL REFERENCES "pedidos_detalle"("id") ON DELETE RESTRICT,
        "reserva_id" uuid REFERENCES "reservas_inventario"("id") ON DELETE RESTRICT,
        "existencia_id" uuid NOT NULL REFERENCES "existencias"("id") ON DELETE RESTRICT,
        "cantidad_solicitada" numeric(14,3) NOT NULL CHECK ("cantidad_solicitada" > 0),
        "cantidad_reservada" numeric(14,3) NOT NULL DEFAULT 0 CHECK ("cantidad_reservada" >= 0),
        "disponible_copia" numeric(14,3) NOT NULL DEFAULT 0 CHECK ("disponible_copia" >= 0),
        "cantidad_preparada" numeric(14,3) NOT NULL DEFAULT 0 CHECK ("cantidad_preparada" >= 0 AND "cantidad_preparada" <= "cantidad_solicitada"),
        "diferencia" numeric(14,3) NOT NULL,
        "observacion" varchar(500),
        "verificado_por" uuid REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "verificado_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_preparacion_detalle_pedido" UNIQUE ("preparacion_id", "detalle_pedido_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_preparaciones_detalle_pedido" ON "preparaciones_detalle" ("detalle_pedido_id", "preparacion_id")`);

    await queryRunner.query(`
      CREATE TABLE "preparaciones_historial" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "preparacion_id" uuid NOT NULL REFERENCES "preparaciones_pedido"("id") ON DELETE CASCADE,
        "estado_anterior" estado_preparacion_enum,
        "estado_nuevo" estado_preparacion_enum NOT NULL,
        "evento" evento_preparacion_enum NOT NULL,
        "usuario_id" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "observacion" varchar(1000),
        "metadatos" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "fecha_hora" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_preparaciones_historial_fecha" ON "preparaciones_historial" ("preparacion_id", "fecha_hora")`);

    await queryRunner.query(`
      CREATE TABLE "vehiculos" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "placa" varchar(20) NOT NULL,
        "descripcion" varchar(160) NOT NULL,
        "capacidad_referencial" numeric(14,3) CHECK ("capacidad_referencial" IS NULL OR "capacidad_referencial" > 0),
        "status" estado_registro_enum NOT NULL DEFAULT 'ACTIVO',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_vehiculos_placa_lower" ON "vehiculos" (lower("placa"))`);
    await queryRunner.query(`CREATE INDEX "idx_vehiculos_status" ON "vehiculos" ("status")`);

    await queryRunner.query(`
      CREATE TABLE "rutas_distribucion" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "codigo" varchar(40) NOT NULL UNIQUE,
        "fecha" date NOT NULL,
        "zona_id" uuid NOT NULL REFERENCES "zonas"("id") ON DELETE RESTRICT,
        "vehiculo_id" uuid NOT NULL REFERENCES "vehiculos"("id") ON DELETE RESTRICT,
        "estado" estado_ruta_enum NOT NULL DEFAULT 'BORRADOR',
        "creado_por" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "observacion" varchar(500),
        "salida_por" uuid REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "salida_at" timestamptz,
        "finalizado_por" uuid REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "finalizado_at" timestamptz,
        "liquidado_por" uuid REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "liquidado_at" timestamptz,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "ck_ruta_version" CHECK ("version" > 0)
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_rutas_fecha_zona_estado" ON "rutas_distribucion" ("fecha", "zona_id", "estado")`);
    await queryRunner.query(`CREATE INDEX "idx_rutas_vehiculo_fecha" ON "rutas_distribucion" ("vehiculo_id", "fecha", "estado")`);

    await queryRunner.query(`
      CREATE TABLE "rutas_responsables" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "ruta_id" uuid NOT NULL REFERENCES "rutas_distribucion"("id") ON DELETE CASCADE,
        "usuario_id" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "funcion" funcion_responsable_ruta_enum NOT NULL,
        "es_principal" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_ruta_responsable" UNIQUE ("ruta_id", "usuario_id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_ruta_responsable_principal" ON "rutas_responsables" ("ruta_id") WHERE "es_principal" = true`);
    await queryRunner.query(`CREATE INDEX "idx_rutas_responsable_usuario" ON "rutas_responsables" ("usuario_id", "ruta_id")`);

    await queryRunner.query(`
      CREATE TABLE "rutas_entregas" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "ruta_id" uuid NOT NULL REFERENCES "rutas_distribucion"("id") ON DELETE CASCADE,
        "preparacion_id" uuid NOT NULL UNIQUE REFERENCES "preparaciones_pedido"("id") ON DELETE RESTRICT,
        "pedido_id" uuid NOT NULL REFERENCES "pedidos"("id") ON DELETE RESTRICT,
        "domicilio_id" uuid NOT NULL REFERENCES "domicilios_cliente"("id") ON DELETE RESTRICT,
        "posicion" integer CHECK ("posicion" IS NULL OR "posicion" > 0),
        "estado" estado_entrega_ruta_enum NOT NULL DEFAULT 'PENDIENTE',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_ruta_preparacion" UNIQUE ("ruta_id", "preparacion_id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_ruta_posicion" ON "rutas_entregas" ("ruta_id", "posicion") WHERE "posicion" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX "idx_rutas_entregas_secuencia" ON "rutas_entregas" ("ruta_id", "posicion")`);

    await queryRunner.query(`
      CREATE TABLE "resultados_visita" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "ruta_entrega_id" uuid NOT NULL UNIQUE REFERENCES "rutas_entregas"("id") ON DELETE RESTRICT,
        "resultado" resultado_visita_enum NOT NULL,
        "usuario_id" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "observacion" varchar(500),
        "fecha_hora" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_resultados_visita_fecha" ON "resultados_visita" ("fecha_hora", "ruta_entrega_id")`);

    await queryRunner.query(`
      CREATE TABLE "resultados_visita_detalle" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "resultado_visita_id" uuid NOT NULL REFERENCES "resultados_visita"("id") ON DELETE CASCADE,
        "preparacion_detalle_id" uuid NOT NULL REFERENCES "preparaciones_detalle"("id") ON DELETE RESTRICT,
        "cantidad_entregada" numeric(14,3) NOT NULL DEFAULT 0 CHECK ("cantidad_entregada" >= 0),
        "cantidad_devuelta" numeric(14,3) NOT NULL DEFAULT 0 CHECK ("cantidad_devuelta" >= 0),
        "cantidad_devuelta_aceptada" numeric(14,3) NOT NULL DEFAULT 0 CHECK ("cantidad_devuelta_aceptada" >= 0 AND "cantidad_devuelta_aceptada" <= "cantidad_devuelta"),
        "devolucion_aceptada_por" uuid REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "devolucion_aceptada_at" timestamptz,
        CONSTRAINT "uq_resultado_preparacion_detalle" UNIQUE ("resultado_visita_id", "preparacion_detalle_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_resultados_detalle_preparacion" ON "resultados_visita_detalle" ("preparacion_detalle_id")`);

    await queryRunner.query(`
      CREATE TABLE "rutas_historial" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "ruta_id" uuid NOT NULL REFERENCES "rutas_distribucion"("id") ON DELETE CASCADE,
        "estado_anterior" estado_ruta_enum,
        "estado_nuevo" estado_ruta_enum NOT NULL,
        "evento" evento_ruta_enum NOT NULL,
        "usuario_id" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "observacion" varchar(1000),
        "metadatos" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "fecha_hora" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_rutas_historial_fecha" ON "rutas_historial" ("ruta_id", "fecha_hora")`);

    await queryRunner.query(`
      CREATE TABLE "liquidaciones_ruta" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "ruta_id" uuid NOT NULL UNIQUE REFERENCES "rutas_distribucion"("id") ON DELETE RESTRICT,
        "entregas_completas" integer NOT NULL DEFAULT 0 CHECK ("entregas_completas" >= 0),
        "entregas_parciales" integer NOT NULL DEFAULT 0 CHECK ("entregas_parciales" >= 0),
        "no_entregadas" integer NOT NULL DEFAULT 0 CHECK ("no_entregadas" >= 0),
        "cantidad_devuelta_aceptada" numeric(14,3) NOT NULL DEFAULT 0 CHECK ("cantidad_devuelta_aceptada" >= 0),
        "responsable_id" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "observacion" varchar(1000),
        "fecha_hora" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`ALTER TABLE "movimientos_inventario" ADD COLUMN "pedido_id" uuid REFERENCES "pedidos"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`ALTER TABLE "movimientos_inventario" ADD COLUMN "detalle_pedido_id" uuid REFERENCES "pedidos_detalle"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`ALTER TABLE "movimientos_inventario" ADD COLUMN "ruta_entrega_id" uuid REFERENCES "rutas_entregas"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`CREATE INDEX "idx_movimientos_ruta_entrega" ON "movimientos_inventario" ("ruta_entrega_id", "fecha_hora") WHERE "ruta_entrega_id" IS NOT NULL`);

    await queryRunner.query(`
      INSERT INTO "permisos" ("key", "module", "action", "description") VALUES
      ('preparations.read', 'preparations', 'read', 'Consultar pedidos elegibles y preparaciones'),
      ('preparations.create', 'preparations', 'create', 'Iniciar la preparación de pedidos'),
      ('preparations.progress', 'preparations', 'progress', 'Registrar cantidades preparadas y observaciones'),
      ('preparations.confirm', 'preparations', 'confirm', 'Confirmar preparaciones verificadas'),
      ('vehicles.read', 'vehicles', 'read', 'Consultar vehículos y su disponibilidad'),
      ('vehicles.manage', 'vehicles', 'manage', 'Registrar y actualizar vehículos'),
      ('distribution.routes.read', 'distribution', 'read', 'Consultar rutas y entregas'),
      ('distribution.routes.create', 'distribution', 'create', 'Crear rutas y asignar recursos'),
      ('distribution.routes.plan', 'distribution', 'plan', 'Definir secuencia y planificar rutas'),
      ('distribution.routes.departure', 'distribution', 'departure', 'Registrar la salida y los movimientos de despacho'),
      ('distribution.routes.assigned.read', 'distribution', 'assigned', 'Consultar rutas asignadas al responsable'),
      ('distribution.visits.create', 'distribution', 'visit', 'Registrar resultados y cantidades de visita'),
      ('distribution.routes.finish', 'distribution', 'finish', 'Finalizar rutas con visitas completas'),
      ('distribution.routes.settle', 'distribution', 'settle', 'Liquidar rutas y aceptar devoluciones'),
      ('distribution.history.read', 'distribution', 'history', 'Consultar el historial operativo de rutas'),
      ('distribution.summary.read', 'distribution', 'summary', 'Consultar el resumen operativo de distribución')
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id FROM "roles" role CROSS JOIN "permisos" permission
       WHERE role.name = 'ADMINISTRADOR' AND permission.module IN ('preparations', 'vehicles', 'distribution')
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id FROM "roles" role CROSS JOIN "permisos" permission
       WHERE role.name = 'ALMACEN' AND permission.key IN (
         'preparations.read', 'preparations.create', 'preparations.progress', 'preparations.confirm',
         'distribution.routes.read', 'distribution.history.read', 'distribution.summary.read'
       )
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id FROM "roles" role CROSS JOIN "permisos" permission
       WHERE role.name = 'DISTRIBUCION' AND permission.key IN (
         'preparations.read', 'vehicles.read', 'vehicles.manage', 'distribution.routes.read',
         'distribution.routes.create', 'distribution.routes.plan', 'distribution.routes.departure',
         'distribution.routes.finish', 'distribution.routes.settle', 'distribution.history.read',
         'distribution.summary.read'
       )
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id FROM "roles" role CROSS JOIN "permisos" permission
       WHERE role.name = 'REPARTIDOR' AND permission.key IN (
         'distribution.routes.assigned.read', 'distribution.visits.create',
         'distribution.history.read', 'distribution.summary.read'
       )
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id FROM "roles" role CROSS JOIN "permisos" permission
       WHERE role.name = 'GERENCIA' AND permission.key IN (
         'preparations.read', 'vehicles.read', 'distribution.routes.read',
         'distribution.history.read', 'distribution.summary.read'
       )
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id FROM "roles" role CROSS JOIN "permisos" permission
       WHERE role.name IN ('ALMACEN', 'DISTRIBUCION', 'GERENCIA')
         AND permission.key = 'zones.read'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "roles_permisos"
       WHERE "rol_id" IN (SELECT "id" FROM "roles" WHERE "name" IN ('ALMACEN', 'DISTRIBUCION', 'GERENCIA'))
         AND "permiso_id" = (SELECT "id" FROM "permisos" WHERE "key" = 'zones.read')
    `);
    await queryRunner.query(`DELETE FROM "roles_permisos" WHERE "permiso_id" IN (SELECT "id" FROM "permisos" WHERE "module" IN ('preparations', 'vehicles', 'distribution'))`);
    await queryRunner.query(`DELETE FROM "permisos" WHERE "module" IN ('preparations', 'vehicles', 'distribution')`);
    await queryRunner.query(`DROP INDEX "idx_movimientos_ruta_entrega"`);
    await queryRunner.query(`ALTER TABLE "movimientos_inventario" DROP COLUMN "ruta_entrega_id"`);
    await queryRunner.query(`ALTER TABLE "movimientos_inventario" DROP COLUMN "detalle_pedido_id"`);
    await queryRunner.query(`ALTER TABLE "movimientos_inventario" DROP COLUMN "pedido_id"`);
    await queryRunner.query(`DROP TABLE "liquidaciones_ruta"`);
    await queryRunner.query(`DROP TABLE "rutas_historial"`);
    await queryRunner.query(`DROP TABLE "resultados_visita_detalle"`);
    await queryRunner.query(`DROP TABLE "resultados_visita"`);
    await queryRunner.query(`DROP TABLE "rutas_entregas"`);
    await queryRunner.query(`DROP TABLE "rutas_responsables"`);
    await queryRunner.query(`DROP TABLE "rutas_distribucion"`);
    await queryRunner.query(`DROP TABLE "vehiculos"`);
    await queryRunner.query(`DROP TABLE "preparaciones_historial"`);
    await queryRunner.query(`DROP TABLE "preparaciones_detalle"`);
    await queryRunner.query(`DROP TABLE "preparaciones_pedido"`);
    await queryRunner.query(`DROP SEQUENCE "rutas_codigo_seq"`);
    await queryRunner.query(`DROP TYPE "evento_ruta_enum"`);
    await queryRunner.query(`DROP TYPE "resultado_visita_enum"`);
    await queryRunner.query(`DROP TYPE "estado_entrega_ruta_enum"`);
    await queryRunner.query(`DROP TYPE "funcion_responsable_ruta_enum"`);
    await queryRunner.query(`DROP TYPE "estado_ruta_enum"`);
    await queryRunner.query(`DROP TYPE "evento_preparacion_enum"`);
    await queryRunner.query(`DROP TYPE "estado_preparacion_enum"`);
  }
}
