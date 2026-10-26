import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderConfirmationFlow1720000028000 implements MigrationInterface {
  name = 'AddOrderConfirmationFlow1720000028000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "evento_notificacion_enum" ADD VALUE IF NOT EXISTS 'PEDIDO_BORRADOR' BEFORE 'PEDIDO_CONFIRMADO'`);
    await queryRunner.query(`ALTER TYPE "evento_notificacion_enum" ADD VALUE IF NOT EXISTS 'PEDIDO_CANCELADO' AFTER 'PEDIDO_CONFIRMADO'`);
    await queryRunner.query(`CREATE TYPE "estado_enlace_confirmacion_pedido_enum" AS ENUM ('ACTIVO', 'USADO', 'EXPIRADO', 'REVOCADO')`);
    await queryRunner.query(`
      CREATE TABLE "enlaces_confirmacion_pedido" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "pedido_id" uuid NOT NULL REFERENCES "pedidos"("id") ON DELETE CASCADE,
        "token_hash" varchar(64) NOT NULL UNIQUE,
        "estado" estado_enlace_confirmacion_pedido_enum NOT NULL DEFAULT 'ACTIVO',
        "expira_at" timestamptz NOT NULL,
        "creado_por" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "usado_at" timestamptz,
        "revocado_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "ck_enlace_confirmacion_expiracion" CHECK ("expira_at" > "created_at")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_enlace_confirmacion_activo_pedido" ON "enlaces_confirmacion_pedido" ("pedido_id") WHERE "estado" = 'ACTIVO'`);
    await queryRunner.query(`CREATE INDEX "idx_enlace_confirmacion_pedido_estado" ON "enlaces_confirmacion_pedido" ("pedido_id", "estado")`);

    await queryRunner.query(`ALTER TABLE "pedidos_estados_historial" DROP CONSTRAINT IF EXISTS "pedidos_estados_historial_usuario_id_fkey"`);
    await queryRunner.query(`ALTER TABLE "pedidos_estados_historial" ALTER COLUMN "usuario_id" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "pedidos_estados_historial" ADD CONSTRAINT "pedidos_estados_historial_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL`);

    await queryRunner.query(`UPDATE "pedidos" SET "codigo" = 'TMP-' || "id"::text`);
    await queryRunner.query(`
      WITH ordenados AS (
        SELECT "id", row_number() OVER (ORDER BY "created_at", "id")::text AS nuevo_codigo
        FROM "pedidos"
      )
      UPDATE "pedidos" AS pedido
         SET "codigo" = ordenados.nuevo_codigo
        FROM ordenados
       WHERE pedido."id" = ordenados."id"
    `);
    await queryRunner.query(`ALTER TABLE "pedidos" ADD CONSTRAINT "ck_pedidos_codigo_numerico" CHECK ("codigo" ~ '^[0-9]+$')`);
    await queryRunner.query(`
      DO $$
      DECLARE max_codigo bigint;
      BEGIN
        SELECT COALESCE(MAX("codigo"::bigint), 0) INTO max_codigo FROM "pedidos";
        IF max_codigo = 0 THEN
          PERFORM setval('pedidos_codigo_seq', 1, false);
        ELSE
          PERFORM setval('pedidos_codigo_seq', max_codigo, true);
        END IF;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "pedidos" DROP CONSTRAINT IF EXISTS "ck_pedidos_codigo_numerico"`);
    await queryRunner.query(`UPDATE "pedidos_estados_historial" AS historial SET "usuario_id" = pedido."creado_por" FROM "pedidos" AS pedido WHERE historial."pedido_id" = pedido."id" AND historial."usuario_id" IS NULL`);
    await queryRunner.query(`ALTER TABLE "pedidos_estados_historial" DROP CONSTRAINT IF EXISTS "pedidos_estados_historial_usuario_id_fkey"`);
    await queryRunner.query(`ALTER TABLE "pedidos_estados_historial" ALTER COLUMN "usuario_id" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "pedidos_estados_historial" ADD CONSTRAINT "pedidos_estados_historial_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`DROP TABLE "enlaces_confirmacion_pedido"`);
    await queryRunner.query(`DROP TYPE "estado_enlace_confirmacion_pedido_enum"`);

    await queryRunner.query(`DELETE FROM "notificaciones" WHERE "evento" IN ('PEDIDO_BORRADOR', 'PEDIDO_CANCELADO')`);
    await queryRunner.query(`DELETE FROM "plantillas_notificacion" WHERE "evento" IN ('PEDIDO_BORRADOR', 'PEDIDO_CANCELADO')`);
    await queryRunner.query(`ALTER TYPE "evento_notificacion_enum" RENAME TO "evento_notificacion_enum_anterior"`);
    await queryRunner.query(`CREATE TYPE "evento_notificacion_enum" AS ENUM ('PEDIDO_CONFIRMADO', 'CAMBIO_RELEVANTE', 'SALIDA_RUTA', 'PROXIMA_ENTREGA', 'ENTREGADO', 'ENTREGA_NO_COMPLETADA', 'PAGO_RECIBIDO')`);
    await queryRunner.query(`ALTER TABLE "plantillas_notificacion" ALTER COLUMN "evento" TYPE "evento_notificacion_enum" USING "evento"::text::"evento_notificacion_enum"`);
    await queryRunner.query(`ALTER TABLE "notificaciones" ALTER COLUMN "evento" TYPE "evento_notificacion_enum" USING "evento"::text::"evento_notificacion_enum"`);
    await queryRunner.query(`DROP TYPE "evento_notificacion_enum_anterior"`);
  }
}
