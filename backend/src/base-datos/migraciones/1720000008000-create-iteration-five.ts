import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIterationFive1720000008000 implements MigrationInterface {
  name = 'CreateIterationFive1720000008000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "estado_enlace_seguimiento_enum" AS ENUM ('ACTIVO', 'EXPIRADO', 'REVOCADO')`);
    await queryRunner.query(`CREATE TYPE "estado_publico_seguimiento_enum" AS ENUM ('PEDIDO_CONFIRMADO', 'EN_PREPARACION', 'PREPARADO', 'EN_RUTA', 'ENTREGADO', 'ENTREGA_NO_COMPLETADA')`);
    await queryRunner.query(`CREATE TYPE "evento_notificacion_enum" AS ENUM ('PEDIDO_CONFIRMADO', 'CAMBIO_RELEVANTE', 'SALIDA_RUTA', 'PROXIMA_ENTREGA', 'ENTREGADO', 'ENTREGA_NO_COMPLETADA', 'PAGO_RECIBIDO')`);
    await queryRunner.query(`CREATE TYPE "estado_notificacion_enum" AS ENUM ('PENDIENTE', 'PROCESANDO', 'ENVIADO', 'ENTREGADO', 'REINTENTO', 'FALLIDO')`);
    await queryRunner.query(`CREATE TYPE "estado_intento_notificacion_enum" AS ENUM ('ENVIADO', 'FALLIDO_RECUPERABLE', 'FALLIDO_DEFINITIVO')`);

    await queryRunner.query(`
      CREATE TABLE "enlaces_seguimiento" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "pedido_id" uuid NOT NULL REFERENCES "pedidos"("id") ON DELETE RESTRICT,
        "token_hash" varchar(64) NOT NULL UNIQUE,
        "estado" estado_enlace_seguimiento_enum NOT NULL DEFAULT 'ACTIVO',
        "expira_at" timestamptz NOT NULL,
        "creado_por" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "revocado_por" uuid REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "revocado_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "ck_enlace_expiracion" CHECK ("expira_at" > "created_at")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_enlace_activo_pedido" ON "enlaces_seguimiento" ("pedido_id") WHERE "estado" = 'ACTIVO'`);
    await queryRunner.query(`CREATE INDEX "idx_enlaces_pedido_estado" ON "enlaces_seguimiento" ("pedido_id", "estado")`);

    await queryRunner.query(`
      CREATE TABLE "actualizaciones_seguimiento" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "enlace_id" uuid NOT NULL REFERENCES "enlaces_seguimiento"("id") ON DELETE CASCADE,
        "pedido_id" uuid NOT NULL REFERENCES "pedidos"("id") ON DELETE RESTRICT,
        "estado_visible" estado_publico_seguimiento_enum NOT NULL,
        "evento_origen" varchar(180) NOT NULL UNIQUE,
        "paradas_previas_pendientes" integer NOT NULL DEFAULT 0 CHECK ("paradas_previas_pendientes" >= 0),
        "estimado_desde" timestamptz,
        "estimado_hasta" timestamptz,
        "fecha_hora" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "ck_seguimiento_rango" CHECK (("estimado_desde" IS NULL AND "estimado_hasta" IS NULL) OR ("estimado_desde" IS NOT NULL AND "estimado_hasta" IS NOT NULL AND "estimado_desde" <= "estimado_hasta"))
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_actualizaciones_enlace_fecha" ON "actualizaciones_seguimiento" ("enlace_id", "fecha_hora")`);
    await queryRunner.query(`CREATE INDEX "idx_actualizaciones_pedido_fecha" ON "actualizaciones_seguimiento" ("pedido_id", "fecha_hora")`);

    await queryRunner.query(`
      CREATE TABLE "configuraciones_estimacion" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "zona_id" uuid REFERENCES "zonas"("id") ON DELETE RESTRICT,
        "minutos_promedio_parada" integer NOT NULL CHECK ("minutos_promedio_parada" > 0),
        "tolerancia_minutos" integer NOT NULL CHECK ("tolerancia_minutos" > 0),
        "umbral_proxima_entrega" integer NOT NULL CHECK ("umbral_proxima_entrega" >= 0),
        "vigente_desde" timestamptz NOT NULL DEFAULT now(),
        "vigente_hasta" timestamptz,
        "creado_por" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "ck_config_estimacion_vigencia" CHECK ("vigente_hasta" IS NULL OR "vigente_hasta" > "vigente_desde")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_config_estimacion_global_activa" ON "configuraciones_estimacion" ((1)) WHERE "zona_id" IS NULL AND "vigente_hasta" IS NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_config_estimacion_zona_activa" ON "configuraciones_estimacion" ("zona_id") WHERE "zona_id" IS NOT NULL AND "vigente_hasta" IS NULL`);

    await queryRunner.query(`
      CREATE TABLE "plantillas_notificacion" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "evento" evento_notificacion_enum NOT NULL,
        "referencia" varchar(80) NOT NULL,
        "version" integer NOT NULL CHECK ("version" > 0),
        "cuerpo" text NOT NULL,
        "variables_autorizadas" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "activa" boolean NOT NULL DEFAULT true,
        "creado_por" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_plantilla_evento_referencia_version" UNIQUE ("evento", "referencia", "version")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_plantilla_evento_activa" ON "plantillas_notificacion" ("evento") WHERE "activa" = true`);

    await queryRunner.query(`
      CREATE TABLE "configuraciones_canal" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "proveedor" varchar(40) NOT NULL DEFAULT 'LIMITEAPI',
        "url_api" varchar(500) NOT NULL,
        "numero_habilitado" varchar(30) NOT NULL,
        "referencia_licencia" varchar(120),
        "timeout_ms" integer NOT NULL DEFAULT 10000 CHECK ("timeout_ms" BETWEEN 1000 AND 60000),
        "max_reintentos" integer NOT NULL DEFAULT 3 CHECK ("max_reintentos" BETWEEN 0 AND 10),
        "demora_reintento_segundos" integer NOT NULL DEFAULT 60 CHECK ("demora_reintento_segundos" BETWEEN 1 AND 86400),
        "activa" boolean NOT NULL DEFAULT true,
        "actualizado_por" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_config_canal_activa" ON "configuraciones_canal" ((1)) WHERE "activa" = true`);

    await queryRunner.query(`
      CREATE TABLE "notificaciones" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "pedido_id" uuid NOT NULL REFERENCES "pedidos"("id") ON DELETE RESTRICT,
        "cliente_id" uuid NOT NULL REFERENCES "clientes"("id") ON DELETE RESTRICT,
        "enlace_id" uuid REFERENCES "enlaces_seguimiento"("id") ON DELETE SET NULL,
        "plantilla_id" uuid NOT NULL REFERENCES "plantillas_notificacion"("id") ON DELETE RESTRICT,
        "reenvio_de_id" uuid REFERENCES "notificaciones"("id") ON DELETE RESTRICT,
        "destinatario" varchar(20) NOT NULL,
        "evento" evento_notificacion_enum NOT NULL,
        "cuerpo_renderizado" text NOT NULL,
        "clave_idempotencia" varchar(200) NOT NULL UNIQUE,
        "version_evento" integer NOT NULL DEFAULT 1 CHECK ("version_evento" > 0),
        "estado" estado_notificacion_enum NOT NULL DEFAULT 'PENDIENTE',
        "programada_at" timestamptz NOT NULL DEFAULT now(),
        "proximo_intento_at" timestamptz NOT NULL DEFAULT now(),
        "procesada_at" timestamptz,
        "proveedor_mensaje_id" varchar(160),
        "ultimo_error" varchar(500),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_notificacion_proveedor_id" ON "notificaciones" ("proveedor_mensaje_id") WHERE "proveedor_mensaje_id" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX "idx_notificaciones_pedido_fecha" ON "notificaciones" ("pedido_id", "created_at")`);
    await queryRunner.query(`CREATE INDEX "idx_notificaciones_cliente_evento_estado_fecha" ON "notificaciones" ("cliente_id", "evento", "estado", "created_at")`);
    await queryRunner.query(`CREATE INDEX "idx_notificaciones_cola" ON "notificaciones" ("estado", "proximo_intento_at") WHERE "estado" IN ('PENDIENTE', 'REINTENTO')`);

    await queryRunner.query(`
      CREATE TABLE "notificaciones_intentos" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "notificacion_id" uuid NOT NULL REFERENCES "notificaciones"("id") ON DELETE CASCADE,
        "numero_intento" integer NOT NULL CHECK ("numero_intento" > 0),
        "estado" estado_intento_notificacion_enum NOT NULL,
        "codigo_http" integer,
        "respuesta_sanitizada" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "fecha_hora" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_notificacion_numero_intento" UNIQUE ("notificacion_id", "numero_intento")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "notificaciones_webhooks" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "evento_externo_id" varchar(180) NOT NULL UNIQUE,
        "proveedor_mensaje_id" varchar(160),
        "hash_contenido" varchar(64) NOT NULL UNIQUE,
        "estado_recibido" varchar(40) NOT NULL,
        "contenido_sanitizado" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "fecha_evento" timestamptz,
        "procesado_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_webhooks_proveedor_mensaje" ON "notificaciones_webhooks" ("proveedor_mensaje_id")`);

    await queryRunner.query(`
      INSERT INTO "roles" ("name", "description", "status", "es_sistema") VALUES
      ('ATENCION_CLIENTE', 'Gestión de enlaces públicos e historial de mensajería', 'ACTIVO', true),
      ('GERENCIA_FINANCIERA', 'Supervisión y configuración funcional del canal de mensajería', 'ACTIVO', true)
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "permisos" ("key", "module", "action", "description") VALUES
      ('tracking.own.read', 'tracking', 'own-read', 'Consultar seguimiento de pedidos propios'),
      ('tracking.links.read', 'tracking', 'links-read', 'Consultar enlaces de seguimiento'),
      ('tracking.links.manage', 'tracking', 'links-manage', 'Generar, renovar y revocar enlaces de seguimiento'),
      ('tracking.settings.read', 'tracking', 'settings-read', 'Consultar configuración de estimación'),
      ('tracking.settings.manage', 'tracking', 'settings-manage', 'Administrar configuración de estimación'),
      ('notifications.read', 'notifications', 'read', 'Consultar historial y supervisión de notificaciones'),
      ('notifications.resend', 'notifications', 'resend', 'Reenviar una notificación autorizada'),
      ('notifications.templates.read', 'notifications', 'templates-read', 'Consultar plantillas de mensajería'),
      ('notifications.templates.manage', 'notifications', 'templates-manage', 'Administrar plantillas de mensajería'),
      ('notifications.channel.read', 'notifications', 'channel-read', 'Consultar configuración funcional del canal'),
      ('notifications.channel.manage', 'notifications', 'channel-manage', 'Administrar licencia, número y parámetros del canal')
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id FROM "roles" role CROSS JOIN "permisos" permission
       WHERE role.name = 'ADMINISTRADOR' AND permission.module IN ('tracking', 'notifications')
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id FROM "roles" role CROSS JOIN "permisos" permission
       WHERE role.name IN ('COMERCIALIZACION', 'ATENCION_CLIENTE') AND permission.key IN (
         'tracking.links.read', 'tracking.links.manage', 'notifications.read', 'notifications.resend'
       ) ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id FROM "roles" role CROSS JOIN "permisos" permission
       WHERE role.name = 'DISTRIBUCION' AND permission.key IN (
         'tracking.links.read', 'tracking.settings.read', 'notifications.read'
       ) ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id FROM "roles" role CROSS JOIN "permisos" permission
       WHERE role.name = 'GERENCIA' AND permission.key IN (
         'tracking.links.read', 'tracking.settings.read', 'notifications.read',
         'notifications.templates.read', 'notifications.channel.read'
       ) ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id FROM "roles" role CROSS JOIN "permisos" permission
       WHERE role.name = 'CLIENTE' AND permission.key = 'tracking.own.read'
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id FROM "roles" role CROSS JOIN "permisos" permission
       WHERE role.name = 'GERENCIA_FINANCIERA' AND permission.key IN (
         'tracking.links.read', 'tracking.settings.read', 'notifications.read',
         'notifications.templates.read', 'notifications.channel.read', 'notifications.channel.manage'
       ) ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id FROM "roles" role CROSS JOIN "permisos" permission
       WHERE role.name IN ('ATENCION_CLIENTE', 'GERENCIA_FINANCIERA') AND permission.key = 'orders.read'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "roles_permisos" WHERE "permiso_id" IN (SELECT "id" FROM "permisos" WHERE "module" IN ('tracking', 'notifications'))`);
    await queryRunner.query(`DELETE FROM "usuarios_roles" WHERE "rol_id" IN (SELECT "id" FROM "roles" WHERE "name" IN ('ATENCION_CLIENTE', 'GERENCIA_FINANCIERA'))`);
    await queryRunner.query(`DELETE FROM "roles_permisos" WHERE "rol_id" IN (SELECT "id" FROM "roles" WHERE "name" IN ('ATENCION_CLIENTE', 'GERENCIA_FINANCIERA'))`);
    await queryRunner.query(`DELETE FROM "roles" WHERE "name" IN ('ATENCION_CLIENTE', 'GERENCIA_FINANCIERA')`);
    await queryRunner.query(`DELETE FROM "permisos" WHERE "module" IN ('tracking', 'notifications')`);
    await queryRunner.query(`DROP TABLE "notificaciones_webhooks"`);
    await queryRunner.query(`DROP TABLE "notificaciones_intentos"`);
    await queryRunner.query(`DROP TABLE "notificaciones"`);
    await queryRunner.query(`DROP TABLE "configuraciones_canal"`);
    await queryRunner.query(`DROP TABLE "plantillas_notificacion"`);
    await queryRunner.query(`DROP TABLE "configuraciones_estimacion"`);
    await queryRunner.query(`DROP TABLE "actualizaciones_seguimiento"`);
    await queryRunner.query(`DROP TABLE "enlaces_seguimiento"`);
    await queryRunner.query(`DROP TYPE "estado_intento_notificacion_enum"`);
    await queryRunner.query(`DROP TYPE "estado_notificacion_enum"`);
    await queryRunner.query(`DROP TYPE "evento_notificacion_enum"`);
    await queryRunner.query(`DROP TYPE "estado_publico_seguimiento_enum"`);
    await queryRunner.query(`DROP TYPE "estado_enlace_seguimiento_enum"`);
  }
}
