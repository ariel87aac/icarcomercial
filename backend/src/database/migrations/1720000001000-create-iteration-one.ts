import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIterationOne1720000001000 implements MigrationInterface {
  name = 'CreateIterationOne1720000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS unaccent');
    await queryRunner.query(`CREATE TYPE "estado_registro_enum" AS ENUM ('ACTIVO', 'INACTIVO')`);
    await queryRunner.query(`CREATE TYPE "tipo_cliente_enum" AS ENUM ('MINORISTA', 'DISTRIBUIDOR', 'MAYORISTA')`);
    await queryRunner.query(`CREATE TYPE "condicion_pago_enum" AS ENUM ('CONTADO', 'CREDITO')`);

    await queryRunner.query(`
      CREATE TABLE "permisos" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "key" varchar(120) NOT NULL,
        "module" varchar(80) NOT NULL,
        "action" varchar(80) NOT NULL,
        "description" varchar(255) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_permisos_key" UNIQUE ("key")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "roles" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(80) NOT NULL,
        "description" varchar(255),
        "status" estado_registro_enum NOT NULL DEFAULT 'ACTIVO',
        "es_sistema" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_roles_name" UNIQUE ("name")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "usuarios" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "nombre" varchar(120) NOT NULL,
        "nombre_usuario" varchar(80) NOT NULL,
        "email" varchar(150) NOT NULL,
        "password_hash" varchar(255) NOT NULL,
        "telefono" varchar(30),
        "status" estado_registro_enum NOT NULL DEFAULT 'ACTIVO',
        "ultimo_acceso_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_usuarios_email_lower" ON "usuarios" (lower("email"))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_usuarios_username_lower" ON "usuarios" (lower("nombre_usuario"))`);
    await queryRunner.query(`CREATE INDEX "idx_usuarios_status" ON "usuarios" ("status")`);
    await queryRunner.query(`
      CREATE TABLE "usuarios_roles" (
        "usuario_id" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE CASCADE,
        "rol_id" uuid NOT NULL REFERENCES "roles"("id") ON DELETE RESTRICT,
        "asignado_en" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("usuario_id", "rol_id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "roles_permisos" (
        "rol_id" uuid NOT NULL REFERENCES "roles"("id") ON DELETE CASCADE,
        "permiso_id" uuid NOT NULL REFERENCES "permisos"("id") ON DELETE RESTRICT,
        "concedido_en" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("rol_id", "permiso_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "zonas" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "nombre" varchar(100) NOT NULL,
        "descripcion" varchar(255),
        "status" estado_registro_enum NOT NULL DEFAULT 'ACTIVO',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_zonas_nombre" UNIQUE ("nombre")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "dias_distribucion" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "zona_id" uuid NOT NULL REFERENCES "zonas"("id") ON DELETE CASCADE,
        "dia_semana" smallint NOT NULL CHECK ("dia_semana" BETWEEN 1 AND 7),
        "hora_inicio" time,
        "hora_fin" time,
        "status" estado_registro_enum NOT NULL DEFAULT 'ACTIVO',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_dia_distribucion_zona_dia" UNIQUE ("zona_id", "dia_semana"),
        CONSTRAINT "ck_dias_horario" CHECK ("hora_fin" IS NULL OR "hora_inicio" IS NULL OR "hora_fin" > "hora_inicio")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "clientes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tipo_cliente" tipo_cliente_enum NOT NULL,
        "nombre_razon_social" varchar(160) NOT NULL,
        "nit_ci" varchar(30),
        "nombre_contacto" varchar(120),
        "telefono" varchar(30) NOT NULL,
        "whatsapp" varchar(30),
        "email" varchar(150),
        "condicion_pago" condicion_pago_enum NOT NULL,
        "limite_credito" numeric(12,2) NOT NULL DEFAULT 0 CHECK ("limite_credito" >= 0),
        "dias_credito" smallint NOT NULL DEFAULT 0 CHECK ("dias_credito" >= 0),
        "status" estado_registro_enum NOT NULL DEFAULT 'ACTIVO',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "ck_cliente_credito" CHECK (
          ("condicion_pago" = 'CREDITO') OR ("limite_credito" = 0 AND "dias_credito" = 0)
        )
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_clientes_nit_ci" ON "clientes" (lower("nit_ci")) WHERE "nit_ci" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX "idx_clientes_nombre_trgm" ON "clientes" USING gin ("nombre_razon_social" gin_trgm_ops)`);
    await queryRunner.query(`CREATE INDEX "idx_clientes_tipo_estado" ON "clientes" ("tipo_cliente", "status")`);
    await queryRunner.query(`CREATE INDEX "idx_clientes_telefono" ON "clientes" ("telefono")`);
    await queryRunner.query(`
      CREATE TABLE "domicilios_cliente" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "cliente_id" uuid NOT NULL REFERENCES "clientes"("id") ON DELETE RESTRICT,
        "zona_id" uuid REFERENCES "zonas"("id") ON DELETE RESTRICT,
        "dia_distribucion_id" uuid REFERENCES "dias_distribucion"("id") ON DELETE RESTRICT,
        "etiqueta" varchar(80) NOT NULL DEFAULT 'Principal',
        "direccion" varchar(255) NOT NULL,
        "referencia" varchar(255),
        "latitud" numeric(9,6),
        "longitud" numeric(9,6),
        "es_principal" boolean NOT NULL DEFAULT false,
        "status" estado_registro_enum NOT NULL DEFAULT 'ACTIVO',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "ck_domicilio_coordenadas" CHECK (
          ("latitud" IS NULL AND "longitud" IS NULL) OR
          ("latitud" BETWEEN -90 AND 90 AND "longitud" BETWEEN -180 AND 180)
        )
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_domicilios_cliente" ON "domicilios_cliente" ("cliente_id", "status")`);
    await queryRunner.query(`CREATE INDEX "idx_domicilios_zona_dia" ON "domicilios_cliente" ("zona_id", "dia_distribucion_id")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_domicilio_principal_cliente" ON "domicilios_cliente" ("cliente_id") WHERE "es_principal" = true AND "status" = 'ACTIVO'`);

    await queryRunner.query(`
      CREATE TABLE "sesiones_usuario" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "usuario_id" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE CASCADE,
        "refresh_token_hash" varchar(64) NOT NULL UNIQUE,
        "expira_at" timestamptz NOT NULL,
        "revocada_at" timestamptz,
        "ip_origen" varchar(64),
        "user_agent" varchar(500),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_sesiones_usuario_vigente" ON "sesiones_usuario" ("usuario_id", "expira_at") WHERE "revocada_at" IS NULL`);
    await queryRunner.query(`
      CREATE TABLE "tokens_recuperacion" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "usuario_id" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE CASCADE,
        "token_hash" varchar(64) NOT NULL UNIQUE,
        "expira_at" timestamptz NOT NULL,
        "usado_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_tokens_recuperacion_vigente" ON "tokens_recuperacion" ("usuario_id", "expira_at") WHERE "usado_at" IS NULL`);

    await queryRunner.query(`
      CREATE TABLE "eventos_auditoria" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "usuario_id" uuid REFERENCES "usuarios"("id") ON DELETE SET NULL,
        "modulo" varchar(80) NOT NULL,
        "accion" varchar(120) NOT NULL,
        "entidad" varchar(100) NOT NULL,
        "entidad_id" varchar(100),
        "resultado" varchar(30) NOT NULL,
        "ip_origen" varchar(64),
        "metadatos" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "fecha_hora" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_auditoria_fecha" ON "eventos_auditoria" ("fecha_hora" DESC)`);
    await queryRunner.query(`CREATE INDEX "idx_auditoria_filtros" ON "eventos_auditoria" ("usuario_id", "modulo", "entidad", "accion")`);

    await queryRunner.query(`
      INSERT INTO "permisos" ("key", "module", "action", "description") VALUES
      ('users.read', 'users', 'read', 'Consultar usuarios'),
      ('users.create', 'users', 'create', 'Registrar usuarios'),
      ('users.update', 'users', 'update', 'Modificar o inactivar usuarios'),
      ('roles.read', 'roles', 'read', 'Consultar roles y permisos'),
      ('roles.create', 'roles', 'create', 'Registrar roles'),
      ('roles.update', 'roles', 'update', 'Modificar roles y su matriz de permisos'),
      ('customers.read', 'customers', 'read', 'Consultar clientes y domicilios'),
      ('customers.create', 'customers', 'create', 'Registrar clientes'),
      ('customers.update', 'customers', 'update', 'Modificar clientes y domicilios'),
      ('zones.read', 'zones', 'read', 'Consultar zonas y días de distribución'),
      ('zones.create', 'zones', 'create', 'Registrar zonas y días de distribución'),
      ('zones.update', 'zones', 'update', 'Modificar zonas y días de distribución'),
      ('audit.read', 'audit', 'read', 'Consultar eventos de auditoría')
    `);
    await queryRunner.query(`
      INSERT INTO "roles" ("name", "description", "es_sistema") VALUES
      ('ADMINISTRADOR', 'Administración integral del sistema', true),
      ('COMERCIALIZACION', 'Gestión comercial de clientes', true),
      ('PRODUCCION', 'Consulta y registro de producción', true),
      ('ALMACEN', 'Gestión de inventario y preparación', true),
      ('DISTRIBUCION', 'Planificación y control de distribución', true),
      ('REPARTIDOR', 'Ejecución de entregas', true),
      ('COBRANZAS', 'Gestión de ventas, pagos y saldos', true),
      ('CLIENTE', 'Acceso al portal del cliente', true),
      ('AUDITOR', 'Consulta de auditoría sin modificación', true)
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT r.id, p.id FROM "roles" r CROSS JOIN "permisos" p
      WHERE r.name = 'ADMINISTRADOR'
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT r.id, p.id FROM "roles" r CROSS JOIN "permisos" p
      WHERE r.name = 'COMERCIALIZACION'
        AND p.key IN ('customers.read', 'customers.create', 'customers.update', 'zones.read')
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT r.id, p.id FROM "roles" r CROSS JOIN "permisos" p
      WHERE r.name = 'AUDITOR' AND p.key = 'audit.read'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "eventos_auditoria"');
    await queryRunner.query('DROP TABLE "tokens_recuperacion"');
    await queryRunner.query('DROP TABLE "sesiones_usuario"');
    await queryRunner.query('DROP TABLE "domicilios_cliente"');
    await queryRunner.query('DROP TABLE "clientes"');
    await queryRunner.query('DROP TABLE "dias_distribucion"');
    await queryRunner.query('DROP TABLE "zonas"');
    await queryRunner.query('DROP TABLE "roles_permisos"');
    await queryRunner.query('DROP TABLE "usuarios_roles"');
    await queryRunner.query('DROP TABLE "usuarios"');
    await queryRunner.query('DROP TABLE "roles"');
    await queryRunner.query('DROP TABLE "permisos"');
    await queryRunner.query('DROP TYPE "condicion_pago_enum"');
    await queryRunner.query('DROP TYPE "tipo_cliente_enum"');
    await queryRunner.query('DROP TYPE "estado_registro_enum"');
  }
}
