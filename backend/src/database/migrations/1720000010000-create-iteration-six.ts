import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIterationSix1720000010000 implements MigrationInterface {
  name = 'CreateIterationSix1720000010000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "estado_venta_enum" AS ENUM ('BORRADOR', 'EMITIDA', 'PAGO_PARCIAL', 'PAGADA', 'ANULADA')`);
    await queryRunner.query(`CREATE TYPE "estado_comprobante_interno_enum" AS ENUM ('EMITIDO', 'ANULADO')`);
    await queryRunner.query(`CREATE TYPE "estado_pago_enum" AS ENUM ('REGISTRADO', 'CONFIRMADO', 'ANULADO')`);
    await queryRunner.query(`CREATE TYPE "tipo_movimiento_cuenta_enum" AS ENUM ('DEBITO_VENTA', 'CREDITO_PAGO', 'DEBITO_ANULACION_PAGO', 'CREDITO_ANULACION_VENTA')`);
    await queryRunner.query(`CREATE TYPE "estado_evento_comercial_enum" AS ENUM ('PENDIENTE', 'PUBLICADO', 'ERROR')`);
    await queryRunner.query(`CREATE SEQUENCE "ventas_numero_seq" START 1`);
    await queryRunner.query(`CREATE SEQUENCE "pagos_numero_seq" START 1`);

    await queryRunner.query(`
      CREATE TABLE "ventas" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "pedido_id" uuid NOT NULL REFERENCES "pedidos"("id") ON DELETE RESTRICT,
        "cliente_id" uuid NOT NULL REFERENCES "clientes"("id") ON DELETE RESTRICT,
        "resultado_visita_id" uuid NOT NULL REFERENCES "resultados_visita"("id") ON DELETE RESTRICT,
        "numero" varchar(40) NOT NULL UNIQUE,
        "fecha_emision" date NOT NULL,
        "fecha_vencimiento" date NOT NULL,
        "dias_credito_copia" smallint NOT NULL CHECK ("dias_credito_copia" >= 0),
        "estado" estado_venta_enum NOT NULL DEFAULT 'BORRADOR',
        "total" numeric(14,2) NOT NULL CHECK ("total" >= 0),
        "saldo" numeric(14,2) NOT NULL CHECK ("saldo" >= 0 AND "saldo" <= "total"),
        "creado_por" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "emitido_por" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "anulado_por" uuid REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "anulado_at" timestamptz,
        "motivo_anulacion" varchar(500),
        "version" integer NOT NULL DEFAULT 1,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "ck_venta_vencimiento" CHECK ("fecha_vencimiento" >= "fecha_emision"),
        CONSTRAINT "ck_venta_anulacion" CHECK (("estado" <> 'ANULADA') OR ("anulado_por" IS NOT NULL AND "anulado_at" IS NOT NULL AND "motivo_anulacion" IS NOT NULL))
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_venta_pedido_vigente" ON "ventas" ("pedido_id") WHERE "estado" <> 'ANULADA'`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_venta_resultado_vigente" ON "ventas" ("resultado_visita_id") WHERE "estado" <> 'ANULADA'`);
    await queryRunner.query(`CREATE INDEX "idx_ventas_cliente_estado_vencimiento" ON "ventas" ("cliente_id", "estado", "fecha_vencimiento")`);

    await queryRunner.query(`
      CREATE TABLE "ventas_detalle" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "venta_id" uuid NOT NULL REFERENCES "ventas"("id") ON DELETE CASCADE,
        "pedido_detalle_id" uuid NOT NULL REFERENCES "pedidos_detalle"("id") ON DELETE RESTRICT,
        "cantidad_entregada" numeric(14,3) NOT NULL CHECK ("cantidad_entregada" > 0),
        "precio_unitario" numeric(14,2) NOT NULL CHECK ("precio_unitario" >= 0),
        "descuento" numeric(14,2) NOT NULL DEFAULT 0 CHECK ("descuento" >= 0),
        "subtotal" numeric(14,2) NOT NULL CHECK ("subtotal" >= 0),
        "producto_copia" varchar(160) NOT NULL,
        "presentacion_copia" varchar(160) NOT NULL,
        "unidad_copia" varchar(20) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_venta_detalle_pedido" UNIQUE ("venta_id", "pedido_detalle_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "series_comprobante" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tipo" varchar(60) NOT NULL,
        "serie" varchar(20) NOT NULL,
        "siguiente_numero" bigint NOT NULL DEFAULT 1 CHECK ("siguiente_numero" > 0),
        "estado" estado_registro_enum NOT NULL DEFAULT 'ACTIVO',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_serie_tipo_codigo" UNIQUE ("tipo", "serie")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_serie_activa_tipo" ON "series_comprobante" ("tipo") WHERE "estado" = 'ACTIVO'`);

    await queryRunner.query(`
      CREATE TABLE "comprobantes_internos" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "venta_id" uuid NOT NULL UNIQUE REFERENCES "ventas"("id") ON DELETE RESTRICT,
        "serie_id" uuid NOT NULL REFERENCES "series_comprobante"("id") ON DELETE RESTRICT,
        "numero" bigint NOT NULL CHECK ("numero" > 0),
        "emitido_por" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "emitido_at" timestamptz NOT NULL DEFAULT now(),
        "estado" estado_comprobante_interno_enum NOT NULL DEFAULT 'EMITIDO',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_comprobante_serie_numero" UNIQUE ("serie_id", "numero")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "medios_pago" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "nombre" varchar(100) NOT NULL UNIQUE,
        "requiere_referencia" boolean NOT NULL DEFAULT false,
        "estado" estado_registro_enum NOT NULL DEFAULT 'ACTIVO',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "pagos" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "cliente_id" uuid NOT NULL REFERENCES "clientes"("id") ON DELETE RESTRICT,
        "medio_pago_id" uuid NOT NULL REFERENCES "medios_pago"("id") ON DELETE RESTRICT,
        "numero" varchar(40) NOT NULL UNIQUE,
        "registrado_por" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "confirmado_por" uuid REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "anulado_por" uuid REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "fecha_pago" date NOT NULL,
        "importe" numeric(14,2) NOT NULL CHECK ("importe" > 0),
        "referencia" varchar(160),
        "estado" estado_pago_enum NOT NULL DEFAULT 'REGISTRADO',
        "confirmado_at" timestamptz,
        "anulado_at" timestamptz,
        "motivo_anulacion" varchar(500),
        "version" integer NOT NULL DEFAULT 1,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "ck_pago_confirmacion" CHECK (("estado" <> 'CONFIRMADO') OR ("confirmado_por" IS NOT NULL AND "confirmado_at" IS NOT NULL)),
        CONSTRAINT "ck_pago_anulacion" CHECK (("estado" <> 'ANULADO') OR ("anulado_por" IS NOT NULL AND "anulado_at" IS NOT NULL AND "motivo_anulacion" IS NOT NULL))
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_pagos_cliente_fecha_estado" ON "pagos" ("cliente_id", "fecha_pago", "estado")`);

    await queryRunner.query(`
      CREATE TABLE "pagos_aplicaciones" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "pago_id" uuid NOT NULL REFERENCES "pagos"("id") ON DELETE CASCADE,
        "venta_id" uuid NOT NULL REFERENCES "ventas"("id") ON DELETE RESTRICT,
        "importe_aplicado" numeric(14,2) NOT NULL CHECK ("importe_aplicado" > 0),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_pago_venta" UNIQUE ("pago_id", "venta_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_aplicaciones_venta" ON "pagos_aplicaciones" ("venta_id")`);

    await queryRunner.query(`
      CREATE TABLE "pagos_historial" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "pago_id" uuid NOT NULL REFERENCES "pagos"("id") ON DELETE CASCADE,
        "usuario_id" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "estado_anterior" estado_pago_enum,
        "estado_nuevo" estado_pago_enum NOT NULL,
        "motivo" varchar(500),
        "registrado_en" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_pago_historial_fecha" ON "pagos_historial" ("pago_id", "registrado_en")`);

    await queryRunner.query(`
      CREATE TABLE "movimientos_cuenta_cliente" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "cliente_id" uuid NOT NULL REFERENCES "clientes"("id") ON DELETE RESTRICT,
        "venta_id" uuid REFERENCES "ventas"("id") ON DELETE RESTRICT,
        "pago_aplicacion_id" uuid REFERENCES "pagos_aplicaciones"("id") ON DELETE RESTRICT,
        "tipo" tipo_movimiento_cuenta_enum NOT NULL,
        "debe" numeric(14,2) NOT NULL DEFAULT 0,
        "haber" numeric(14,2) NOT NULL DEFAULT 0,
        "saldo_resultante" numeric(14,2) NOT NULL CHECK ("saldo_resultante" >= 0),
        "descripcion" varchar(240) NOT NULL,
        "registrado_por" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "registrado_en" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "ck_movimiento_debe_haber" CHECK (("debe" > 0 AND "haber" = 0) OR ("haber" > 0 AND "debe" = 0))
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_movimientos_cliente_fecha" ON "movimientos_cuenta_cliente" ("cliente_id", "registrado_en", "id")`);

    await queryRunner.query(`
      CREATE TABLE "eventos_comerciales_salida" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "clave_idempotencia" varchar(200) NOT NULL UNIQUE,
        "tipo_evento" varchar(80) NOT NULL,
        "pago_id" uuid NOT NULL REFERENCES "pagos"("id") ON DELETE RESTRICT,
        "version_evento" integer NOT NULL DEFAULT 1 CHECK ("version_evento" > 0),
        "estado" estado_evento_comercial_enum NOT NULL DEFAULT 'PENDIENTE',
        "intentos" integer NOT NULL DEFAULT 0 CHECK ("intentos" >= 0),
        "ultimo_error" varchar(500),
        "publicado_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_outbox_estado_fecha" ON "eventos_comerciales_salida" ("estado", "updated_at")`);

    await queryRunner.query(`ALTER TABLE "notificaciones" ADD COLUMN "pago_id" uuid REFERENCES "pagos"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`CREATE INDEX "idx_notificaciones_pago" ON "notificaciones" ("pago_id") WHERE "pago_id" IS NOT NULL`);

    await queryRunner.query(`INSERT INTO "series_comprobante" ("tipo", "serie", "siguiente_numero", "estado") VALUES ('COMPROBANTE_INTERNO', 'ICAR', 1, 'ACTIVO')`);
    await queryRunner.query(`INSERT INTO "medios_pago" ("nombre", "requiere_referencia", "estado") VALUES ('EFECTIVO', false, 'ACTIVO'), ('TRANSFERENCIA', true, 'ACTIVO')`);

    await queryRunner.query(`
      INSERT INTO "roles" ("name", "description", "status", "es_sistema") VALUES
      ('CONTABILIDAD', 'Gestión de ventas, pagos, cuentas por cobrar y reportes', 'ACTIVO', true),
      ('CAJA', 'Registro y aplicación propuesta de pagos', 'ACTIVO', true),
      ('ATENCION_COMERCIAL', 'Consulta comercial de clientes, comprobantes y saldos', 'ACTIVO', true),
      ('GERENCIA_COMERCIAL', 'Consulta y reportes comerciales', 'ACTIVO', true),
      ('GERENCIA_CONTABLE', 'Consulta y reportes contables de cartera', 'ACTIVO', true)
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "permisos" ("key", "module", "action", "description") VALUES
      ('commercial.sales.read', 'commercial', 'sales-read', 'Consultar ventas autorizadas'),
      ('commercial.sales.create', 'commercial', 'sales-create', 'Generar ventas desde entregas elegibles'),
      ('commercial.sales.void', 'commercial', 'sales-void', 'Anular ventas con contramovimientos'),
      ('commercial.vouchers.read', 'commercial', 'vouchers-read', 'Consultar y descargar comprobantes internos'),
      ('commercial.payments.read', 'commercial', 'payments-read', 'Consultar pagos autorizados'),
      ('commercial.payments.create', 'commercial', 'payments-create', 'Registrar pagos y aplicaciones propuestas'),
      ('commercial.payments.confirm', 'commercial', 'payments-confirm', 'Confirmar pagos y actualizar saldos'),
      ('commercial.payments.void', 'commercial', 'payments-void', 'Anular pagos con contramovimientos'),
      ('commercial.accounts.read', 'commercial', 'accounts-read', 'Consultar estados de cuenta autorizados'),
      ('commercial.accounts.own', 'commercial', 'accounts-own', 'Consultar el estado de cuenta propio'),
      ('commercial.receivables.read', 'commercial', 'receivables-read', 'Consultar cuentas por cobrar y antigüedad'),
      ('commercial.reports.read', 'commercial', 'reports-read', 'Consultar reportes comerciales'),
      ('commercial.reports.export', 'commercial', 'reports-export', 'Exportar reportes comerciales'),
      ('commercial.settings.read', 'commercial', 'settings-read', 'Consultar series y medios de pago'),
      ('commercial.settings.manage', 'commercial', 'settings-manage', 'Administrar series y medios de pago')
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id FROM "roles" role CROSS JOIN "permisos" permission
      WHERE role.name = 'ADMINISTRADOR' AND permission.module = 'commercial'
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id FROM "roles" role CROSS JOIN "permisos" permission
      WHERE role.name = 'CONTABILIDAD' AND permission.key IN (
        'commercial.sales.read','commercial.sales.create','commercial.sales.void','commercial.vouchers.read',
        'commercial.payments.read','commercial.payments.create','commercial.payments.confirm','commercial.payments.void',
        'commercial.accounts.read','commercial.receivables.read','commercial.reports.read','commercial.reports.export','commercial.settings.read'
      ) ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id FROM "roles" role CROSS JOIN "permisos" permission
      WHERE role.name = 'CAJA' AND permission.key IN (
        'commercial.sales.read','commercial.vouchers.read','commercial.payments.read','commercial.payments.create','commercial.accounts.read'
      ) ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id FROM "roles" role CROSS JOIN "permisos" permission
      WHERE role.name = 'ATENCION_COMERCIAL' AND permission.key IN (
        'commercial.sales.read','commercial.vouchers.read','commercial.payments.read','commercial.accounts.read','commercial.receivables.read'
      ) ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id FROM "roles" role CROSS JOIN "permisos" permission
      WHERE role.name IN ('GERENCIA_COMERCIAL','GERENCIA_CONTABLE','GERENCIA') AND permission.key IN (
        'commercial.sales.read','commercial.vouchers.read','commercial.payments.read','commercial.accounts.read',
        'commercial.receivables.read','commercial.reports.read','commercial.reports.export','commercial.settings.read'
      ) ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id FROM "roles" role CROSS JOIN "permisos" permission
      WHERE role.name = 'CLIENTE' AND permission.key IN (
        'commercial.sales.read','commercial.vouchers.read','commercial.payments.read','commercial.accounts.own'
      ) ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id FROM "roles" role CROSS JOIN "permisos" permission
      WHERE role.name IN ('CONTABILIDAD','CAJA','ATENCION_COMERCIAL','GERENCIA_COMERCIAL','GERENCIA_CONTABLE')
        AND permission.key IN ('customers.read','orders.read')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "roles_permisos" WHERE "permiso_id" IN (SELECT "id" FROM "permisos" WHERE "module" = 'commercial')`);
    await queryRunner.query(`DELETE FROM "usuarios_roles" WHERE "rol_id" IN (SELECT "id" FROM "roles" WHERE "name" IN ('CONTABILIDAD','CAJA','ATENCION_COMERCIAL','GERENCIA_COMERCIAL','GERENCIA_CONTABLE'))`);
    await queryRunner.query(`DELETE FROM "roles" WHERE "name" IN ('CONTABILIDAD','CAJA','ATENCION_COMERCIAL','GERENCIA_COMERCIAL','GERENCIA_CONTABLE')`);
    await queryRunner.query(`DELETE FROM "permisos" WHERE "module" = 'commercial'`);
    await queryRunner.query(`DROP INDEX "idx_notificaciones_pago"`);
    await queryRunner.query(`ALTER TABLE "notificaciones" DROP COLUMN "pago_id"`);
    await queryRunner.query(`DROP TABLE "eventos_comerciales_salida"`);
    await queryRunner.query(`DROP TABLE "movimientos_cuenta_cliente"`);
    await queryRunner.query(`DROP TABLE "pagos_historial"`);
    await queryRunner.query(`DROP TABLE "pagos_aplicaciones"`);
    await queryRunner.query(`DROP TABLE "pagos"`);
    await queryRunner.query(`DROP TABLE "medios_pago"`);
    await queryRunner.query(`DROP TABLE "comprobantes_internos"`);
    await queryRunner.query(`DROP TABLE "series_comprobante"`);
    await queryRunner.query(`DROP TABLE "ventas_detalle"`);
    await queryRunner.query(`DROP TABLE "ventas"`);
    await queryRunner.query(`DROP SEQUENCE "pagos_numero_seq"`);
    await queryRunner.query(`DROP SEQUENCE "ventas_numero_seq"`);
    await queryRunner.query(`DROP TYPE "estado_evento_comercial_enum"`);
    await queryRunner.query(`DROP TYPE "tipo_movimiento_cuenta_enum"`);
    await queryRunner.query(`DROP TYPE "estado_pago_enum"`);
    await queryRunner.query(`DROP TYPE "estado_comprobante_interno_enum"`);
    await queryRunner.query(`DROP TYPE "estado_venta_enum"`);
  }
}
