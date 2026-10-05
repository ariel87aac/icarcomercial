import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIterationTwo1720000003000 implements MigrationInterface {
  name = 'CreateIterationTwo1720000003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "clientes" ADD COLUMN "lista_comercial" varchar(80)`);
    await queryRunner.query(`CREATE INDEX "idx_clientes_lista_comercial" ON "clientes" (lower("lista_comercial")) WHERE "lista_comercial" IS NOT NULL`);

    await queryRunner.query(`CREATE TYPE "tipo_movimiento_inventario_enum" AS ENUM ('INGRESO', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO')`);
    await queryRunner.query(`CREATE TYPE "estado_reserva_inventario_enum" AS ENUM ('ACTIVA')`);
    await queryRunner.query(`CREATE TYPE "estado_pedido_enum" AS ENUM ('BORRADOR', 'RECIBIDO', 'CONFIRMADO')`);
    await queryRunner.query(`CREATE TYPE "origen_pedido_enum" AS ENUM ('PORTAL', 'INTERNO')`);
    await queryRunner.query(`CREATE SEQUENCE "pedidos_codigo_seq" START 1`);

    await queryRunner.query(`
      CREATE TABLE "categorias_producto" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "nombre" varchar(100) NOT NULL,
        "status" estado_registro_enum NOT NULL DEFAULT 'ACTIVO',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_categorias_producto_nombre_lower" ON "categorias_producto" (lower("nombre"))`);
    await queryRunner.query(`CREATE INDEX "idx_categorias_producto_estado" ON "categorias_producto" ("status")`);

    await queryRunner.query(`
      CREATE TABLE "lineas_productivas" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "nombre" varchar(100) NOT NULL,
        "status" estado_registro_enum NOT NULL DEFAULT 'ACTIVO',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_lineas_productivas_nombre_lower" ON "lineas_productivas" (lower("nombre"))`);
    await queryRunner.query(`CREATE INDEX "idx_lineas_productivas_estado" ON "lineas_productivas" ("status")`);

    await queryRunner.query(`
      CREATE TABLE "unidades_medida" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "nombre" varchar(80) NOT NULL,
        "abreviatura" varchar(20) NOT NULL,
        "status" estado_registro_enum NOT NULL DEFAULT 'ACTIVO',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_unidades_medida_nombre_lower" ON "unidades_medida" (lower("nombre"))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_unidades_medida_abreviatura_lower" ON "unidades_medida" (lower("abreviatura"))`);

    await queryRunner.query(`
      CREATE TABLE "productos" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "codigo" varchar(50) NOT NULL,
        "nombre" varchar(160) NOT NULL,
        "categoria_id" uuid NOT NULL REFERENCES "categorias_producto"("id") ON DELETE RESTRICT,
        "linea_productiva_id" uuid NOT NULL REFERENCES "lineas_productivas"("id") ON DELETE RESTRICT,
        "unidad_base_id" uuid NOT NULL REFERENCES "unidades_medida"("id") ON DELETE RESTRICT,
        "status" estado_registro_enum NOT NULL DEFAULT 'ACTIVO',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_productos_codigo_lower" ON "productos" (lower("codigo"))`);
    await queryRunner.query(`CREATE INDEX "idx_productos_nombre_trgm" ON "productos" USING gin ("nombre" gin_trgm_ops)`);
    await queryRunner.query(`CREATE INDEX "idx_productos_filtros" ON "productos" ("categoria_id", "linea_productiva_id", "status")`);

    await queryRunner.query(`
      CREATE TABLE "presentaciones_producto" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "producto_id" uuid NOT NULL REFERENCES "productos"("id") ON DELETE RESTRICT,
        "unidad_id" uuid NOT NULL REFERENCES "unidades_medida"("id") ON DELETE RESTRICT,
        "descripcion" varchar(160) NOT NULL,
        "factor_conversion" numeric(12,4) NOT NULL CHECK ("factor_conversion" > 0),
        "status" estado_registro_enum NOT NULL DEFAULT 'ACTIVO',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_presentaciones_producto_descripcion" ON "presentaciones_producto" ("producto_id", lower("descripcion"))`);
    await queryRunner.query(`CREATE INDEX "idx_presentaciones_producto_estado" ON "presentaciones_producto" ("producto_id", "status")`);

    await queryRunner.query(`
      CREATE TABLE "precios_producto" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "presentacion_id" uuid NOT NULL REFERENCES "presentaciones_producto"("id") ON DELETE RESTRICT,
        "tipo_cliente" tipo_cliente_enum,
        "lista_comercial" varchar(80),
        "importe" numeric(12,2) NOT NULL CHECK ("importe" >= 0),
        "vigente_desde" date NOT NULL,
        "vigente_hasta" date,
        "status" estado_registro_enum NOT NULL DEFAULT 'ACTIVO',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "ck_precio_condicion" CHECK (("tipo_cliente" IS NOT NULL) <> ("lista_comercial" IS NOT NULL)),
        CONSTRAINT "ck_precio_vigencia" CHECK ("vigente_hasta" IS NULL OR "vigente_hasta" >= "vigente_desde")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_precios_presentacion_vigencia" ON "precios_producto" ("presentacion_id", "status", "vigente_desde", "vigente_hasta")`);
    await queryRunner.query(`CREATE INDEX "idx_precios_tipo_cliente" ON "precios_producto" ("presentacion_id", "tipo_cliente") WHERE "tipo_cliente" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX "idx_precios_lista" ON "precios_producto" ("presentacion_id", lower("lista_comercial")) WHERE "lista_comercial" IS NOT NULL`);

    await queryRunner.query(`
      CREATE TABLE "pedidos" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "codigo" varchar(40) NOT NULL UNIQUE,
        "cliente_id" uuid NOT NULL REFERENCES "clientes"("id") ON DELETE RESTRICT,
        "domicilio_id" uuid NOT NULL REFERENCES "domicilios_cliente"("id") ON DELETE RESTRICT,
        "fecha_solicitada" date NOT NULL,
        "estado" estado_pedido_enum NOT NULL DEFAULT 'BORRADOR',
        "origen" origen_pedido_enum NOT NULL,
        "observaciones" varchar(500),
        "total" numeric(14,2) NOT NULL DEFAULT 0 CHECK ("total" >= 0),
        "creado_por" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "confirmado_por" uuid REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "recibido_at" timestamptz,
        "confirmado_at" timestamptz,
        "cliente_nombre_copia" varchar(160),
        "cliente_tipo_copia" tipo_cliente_enum,
        "lista_comercial_copia" varchar(80),
        "domicilio_copia" varchar(255),
        "zona_copia" varchar(100),
        "dia_distribucion_copia" smallint CHECK ("dia_distribucion_copia" IS NULL OR "dia_distribucion_copia" BETWEEN 1 AND 7),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_pedidos_cliente_fecha_estado" ON "pedidos" ("cliente_id", "fecha_solicitada", "estado")`);
    await queryRunner.query(`CREATE INDEX "idx_pedidos_estado_created" ON "pedidos" ("estado", "created_at" DESC)`);

    await queryRunner.query(`
      CREATE TABLE "pedidos_detalle" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "pedido_id" uuid NOT NULL REFERENCES "pedidos"("id") ON DELETE CASCADE,
        "presentacion_id" uuid NOT NULL REFERENCES "presentaciones_producto"("id") ON DELETE RESTRICT,
        "cantidad_solicitada" numeric(14,3) NOT NULL CHECK ("cantidad_solicitada" > 0),
        "cantidad_reservada" numeric(14,3) NOT NULL DEFAULT 0 CHECK ("cantidad_reservada" >= 0),
        "cantidad_pendiente" numeric(14,3) NOT NULL DEFAULT 0 CHECK ("cantidad_pendiente" >= 0),
        "precio_unitario" numeric(12,2) NOT NULL CHECK ("precio_unitario" >= 0),
        "subtotal" numeric(14,2) NOT NULL CHECK ("subtotal" >= 0),
        "producto_descripcion_copia" varchar(160) NOT NULL,
        "presentacion_descripcion_copia" varchar(160) NOT NULL,
        "unidad_abreviatura_copia" varchar(20) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_pedido_presentacion" UNIQUE ("pedido_id", "presentacion_id"),
        CONSTRAINT "ck_detalle_reserva_pendiente" CHECK ("cantidad_reservada" + "cantidad_pendiente" <= "cantidad_solicitada")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_pedidos_detalle_presentacion" ON "pedidos_detalle" ("presentacion_id")`);

    await queryRunner.query(`
      CREATE TABLE "pedidos_estados_historial" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "pedido_id" uuid NOT NULL REFERENCES "pedidos"("id") ON DELETE CASCADE,
        "estado_anterior" estado_pedido_enum,
        "estado_nuevo" estado_pedido_enum NOT NULL,
        "usuario_id" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "origen" origen_pedido_enum NOT NULL,
        "observacion" varchar(500),
        "fecha_hora" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_historial_pedido_fecha" ON "pedidos_estados_historial" ("pedido_id", "fecha_hora")`);

    await queryRunner.query(`
      CREATE TABLE "existencias" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "presentacion_id" uuid NOT NULL UNIQUE REFERENCES "presentaciones_producto"("id") ON DELETE RESTRICT,
        "cantidad_fisica" numeric(14,3) NOT NULL DEFAULT 0 CHECK ("cantidad_fisica" >= 0),
        "cantidad_reservada" numeric(14,3) NOT NULL DEFAULT 0 CHECK ("cantidad_reservada" >= 0 AND "cantidad_reservada" <= "cantidad_fisica"),
        "version" integer NOT NULL DEFAULT 1,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_existencias_presentacion" ON "existencias" ("presentacion_id")`);

    await queryRunner.query(`
      CREATE TABLE "movimientos_inventario" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "existencia_id" uuid NOT NULL REFERENCES "existencias"("id") ON DELETE RESTRICT,
        "tipo" tipo_movimiento_inventario_enum NOT NULL,
        "cantidad" numeric(14,3) NOT NULL CHECK ("cantidad" > 0),
        "saldo_anterior" numeric(14,3) NOT NULL CHECK ("saldo_anterior" >= 0),
        "saldo_nuevo" numeric(14,3) NOT NULL CHECK ("saldo_nuevo" >= 0),
        "motivo" varchar(255) NOT NULL,
        "usuario_id" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "fecha_hora" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_movimientos_existencia_fecha" ON "movimientos_inventario" ("existencia_id", "fecha_hora" DESC)`);

    await queryRunner.query(`
      CREATE TABLE "reservas_inventario" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "detalle_pedido_id" uuid NOT NULL UNIQUE REFERENCES "pedidos_detalle"("id") ON DELETE RESTRICT,
        "existencia_id" uuid NOT NULL REFERENCES "existencias"("id") ON DELETE RESTRICT,
        "cantidad" numeric(14,3) NOT NULL CHECK ("cantidad" >= 0),
        "estado" estado_reserva_inventario_enum NOT NULL DEFAULT 'ACTIVA',
        "usuario_id" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "fecha_hora" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_reservas_existencia_fecha" ON "reservas_inventario" ("existencia_id", "fecha_hora" DESC)`);

    await queryRunner.query(`
      INSERT INTO "permisos" ("key", "module", "action", "description") VALUES
      ('catalog.read', 'catalog', 'read', 'Consultar el catálogo comercial aplicable'),
      ('catalog.manage', 'catalog', 'manage', 'Administrar categorías, líneas, unidades, productos y presentaciones'),
      ('pricing.manage', 'pricing', 'manage', 'Administrar precios y vigencias comerciales'),
      ('inventory.read', 'inventory', 'read', 'Consultar existencias, reservas y movimientos'),
      ('inventory.movements.create', 'inventory', 'create', 'Registrar ingresos y ajustes de inventario'),
      ('orders.read', 'orders', 'read', 'Consultar pedidos dentro del alcance autorizado'),
      ('orders.create', 'orders', 'create', 'Registrar pedidos'),
      ('orders.update', 'orders', 'update', 'Modificar, enviar o devolver pedidos según su estado'),
      ('orders.confirm', 'orders', 'confirm', 'Confirmar pedidos y crear reservas'),
      ('orders.history.read', 'orders', 'history', 'Consultar el historial de estados de pedidos')
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT r.id, p.id FROM "roles" r CROSS JOIN "permisos" p
      WHERE r.name = 'ADMINISTRADOR' AND p.module IN ('catalog', 'pricing', 'inventory', 'orders')
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT r.id, p.id FROM "roles" r CROSS JOIN "permisos" p
      WHERE r.name = 'COMERCIALIZACION'
        AND p.key IN ('catalog.read', 'catalog.manage', 'pricing.manage', 'inventory.read', 'orders.read', 'orders.create', 'orders.update', 'orders.confirm', 'orders.history.read')
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT r.id, p.id FROM "roles" r CROSS JOIN "permisos" p
      WHERE r.name = 'ALMACEN'
        AND p.key IN ('catalog.read', 'inventory.read', 'inventory.movements.create', 'orders.history.read')
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT r.id, p.id FROM "roles" r CROSS JOIN "permisos" p
      WHERE r.name = 'CLIENTE'
        AND p.key IN ('catalog.read', 'orders.read', 'orders.create', 'orders.update', 'orders.history.read')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "roles_permisos" WHERE "permiso_id" IN (SELECT "id" FROM "permisos" WHERE "module" IN ('catalog', 'pricing', 'inventory', 'orders'))`);
    await queryRunner.query(`DELETE FROM "permisos" WHERE "module" IN ('catalog', 'pricing', 'inventory', 'orders')`);
    await queryRunner.query(`DROP TABLE "reservas_inventario"`);
    await queryRunner.query(`DROP TABLE "movimientos_inventario"`);
    await queryRunner.query(`DROP TABLE "existencias"`);
    await queryRunner.query(`DROP TABLE "pedidos_estados_historial"`);
    await queryRunner.query(`DROP TABLE "pedidos_detalle"`);
    await queryRunner.query(`DROP TABLE "pedidos"`);
    await queryRunner.query(`DROP TABLE "precios_producto"`);
    await queryRunner.query(`DROP TABLE "presentaciones_producto"`);
    await queryRunner.query(`DROP TABLE "productos"`);
    await queryRunner.query(`DROP TABLE "unidades_medida"`);
    await queryRunner.query(`DROP TABLE "lineas_productivas"`);
    await queryRunner.query(`DROP TABLE "categorias_producto"`);
    await queryRunner.query(`DROP SEQUENCE "pedidos_codigo_seq"`);
    await queryRunner.query(`DROP TYPE "origen_pedido_enum"`);
    await queryRunner.query(`DROP TYPE "estado_pedido_enum"`);
    await queryRunner.query(`DROP TYPE "estado_reserva_inventario_enum"`);
    await queryRunner.query(`DROP TYPE "tipo_movimiento_inventario_enum"`);
    await queryRunner.query(`DROP INDEX "idx_clientes_lista_comercial"`);
    await queryRunner.query(`ALTER TABLE "clientes" DROP COLUMN "lista_comercial"`);
  }
}
