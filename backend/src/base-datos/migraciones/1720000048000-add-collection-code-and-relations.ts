import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCollectionCodeAndRelations1720000048000 implements MigrationInterface {
  name = 'AddCollectionCodeAndRelations1720000048000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SEQUENCE "pagos_codigo_seq" START WITH 1 INCREMENT BY 1`);
    await queryRunner.query(`ALTER TABLE "pagos" ADD COLUMN "codigo" integer`);
    await queryRunner.query(`
      WITH ordered_payments AS (
        SELECT "id", row_number() OVER (ORDER BY "created_at" ASC, "id" ASC)::integer AS "codigo"
        FROM "pagos"
      )
      UPDATE "pagos" payment
         SET "codigo" = ordered_payments."codigo"
        FROM ordered_payments
       WHERE payment."id" = ordered_payments."id"
    `);
    await queryRunner.query(`
      SELECT setval(
        'pagos_codigo_seq',
        COALESCE((SELECT max("codigo") FROM "pagos"), 1),
        EXISTS (SELECT 1 FROM "pagos")
      )
    `);
    await queryRunner.query(`ALTER SEQUENCE "pagos_codigo_seq" OWNED BY "pagos"."codigo"`);
    await queryRunner.query(`ALTER TABLE "pagos" ALTER COLUMN "codigo" SET DEFAULT nextval('pagos_codigo_seq')`);
    await queryRunner.query(`ALTER TABLE "pagos" ALTER COLUMN "codigo" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "pagos" ADD CONSTRAINT "uq_pagos_codigo" UNIQUE ("codigo")`);
    await queryRunner.query(`ALTER TABLE "pagos" ADD COLUMN "observacion" varchar(500)`);

    await queryRunner.query(`ALTER TABLE "pagos_aplicaciones" ADD COLUMN "pago_codigo" integer`);
    await queryRunner.query(`UPDATE "pagos_aplicaciones" application SET "pago_codigo"=payment."codigo" FROM "pagos" payment WHERE payment."id"=application."pago_id"`);
    await queryRunner.query(`ALTER TABLE "pagos_aplicaciones" DROP COLUMN "pago_id" CASCADE`);
    await queryRunner.query(`ALTER TABLE "pagos_aplicaciones" ALTER COLUMN "pago_codigo" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "pagos_aplicaciones" ADD CONSTRAINT "fk_aplicaciones_pago_codigo" FOREIGN KEY ("pago_codigo") REFERENCES "pagos"("codigo") ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE "pagos_aplicaciones" ADD CONSTRAINT "uq_pago_venta" UNIQUE ("pago_codigo", "venta_codigo")`);
    await queryRunner.query(`CREATE INDEX "idx_aplicaciones_pago_codigo" ON "pagos_aplicaciones" ("pago_codigo")`);

    await queryRunner.query(`ALTER TABLE "pagos_historial" ADD COLUMN "pago_codigo" integer`);
    await queryRunner.query(`UPDATE "pagos_historial" history SET "pago_codigo"=payment."codigo" FROM "pagos" payment WHERE payment."id"=history."pago_id"`);
    await queryRunner.query(`ALTER TABLE "pagos_historial" DROP COLUMN "pago_id" CASCADE`);
    await queryRunner.query(`ALTER TABLE "pagos_historial" ALTER COLUMN "pago_codigo" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "pagos_historial" ADD CONSTRAINT "fk_historial_pago_codigo" FOREIGN KEY ("pago_codigo") REFERENCES "pagos"("codigo") ON DELETE CASCADE`);
    await queryRunner.query(`CREATE INDEX "idx_pago_historial_fecha" ON "pagos_historial" ("pago_codigo", "registrado_en")`);

    await queryRunner.query(`ALTER TABLE "eventos_comerciales_salida" ADD COLUMN "pago_codigo" integer`);
    await queryRunner.query(`UPDATE "eventos_comerciales_salida" event SET "pago_codigo"=payment."codigo" FROM "pagos" payment WHERE payment."id"=event."pago_id"`);
    await queryRunner.query(`ALTER TABLE "eventos_comerciales_salida" DROP COLUMN "pago_id" CASCADE`);
    await queryRunner.query(`ALTER TABLE "eventos_comerciales_salida" ALTER COLUMN "pago_codigo" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "eventos_comerciales_salida" ADD CONSTRAINT "fk_eventos_pago_codigo" FOREIGN KEY ("pago_codigo") REFERENCES "pagos"("codigo") ON DELETE RESTRICT`);
    await queryRunner.query(`CREATE INDEX "idx_eventos_pago_codigo" ON "eventos_comerciales_salida" ("pago_codigo")`);

    await queryRunner.query(`ALTER TABLE "notificaciones" ADD COLUMN "pago_codigo" integer`);
    await queryRunner.query(`UPDATE "notificaciones" notification SET "pago_codigo"=payment."codigo" FROM "pagos" payment WHERE payment."id"=notification."pago_id"`);
    await queryRunner.query(`ALTER TABLE "notificaciones" DROP COLUMN "pago_id" CASCADE`);
    await queryRunner.query(`ALTER TABLE "notificaciones" ADD CONSTRAINT "fk_notificaciones_pago_codigo" FOREIGN KEY ("pago_codigo") REFERENCES "pagos"("codigo") ON DELETE RESTRICT`);
    await queryRunner.query(`CREATE INDEX "idx_notificaciones_pago" ON "notificaciones" ("pago_codigo") WHERE "pago_codigo" IS NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "pagos_aplicaciones" ADD COLUMN "pago_id" uuid`);
    await queryRunner.query(`UPDATE "pagos_aplicaciones" application SET "pago_id"=payment."id" FROM "pagos" payment WHERE payment."codigo"=application."pago_codigo"`);
    await queryRunner.query(`ALTER TABLE "pagos_aplicaciones" DROP COLUMN "pago_codigo" CASCADE`);
    await queryRunner.query(`ALTER TABLE "pagos_aplicaciones" ALTER COLUMN "pago_id" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "pagos_aplicaciones" ADD CONSTRAINT "fk_aplicaciones_pago_id" FOREIGN KEY ("pago_id") REFERENCES "pagos"("id") ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE "pagos_aplicaciones" ADD CONSTRAINT "uq_pago_venta" UNIQUE ("pago_id", "venta_codigo")`);

    await queryRunner.query(`ALTER TABLE "pagos_historial" ADD COLUMN "pago_id" uuid`);
    await queryRunner.query(`UPDATE "pagos_historial" history SET "pago_id"=payment."id" FROM "pagos" payment WHERE payment."codigo"=history."pago_codigo"`);
    await queryRunner.query(`ALTER TABLE "pagos_historial" DROP COLUMN "pago_codigo" CASCADE`);
    await queryRunner.query(`ALTER TABLE "pagos_historial" ALTER COLUMN "pago_id" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "pagos_historial" ADD CONSTRAINT "fk_historial_pago_id" FOREIGN KEY ("pago_id") REFERENCES "pagos"("id") ON DELETE CASCADE`);
    await queryRunner.query(`CREATE INDEX "idx_pago_historial_fecha" ON "pagos_historial" ("pago_id", "registrado_en")`);

    await queryRunner.query(`ALTER TABLE "eventos_comerciales_salida" ADD COLUMN "pago_id" uuid`);
    await queryRunner.query(`UPDATE "eventos_comerciales_salida" event SET "pago_id"=payment."id" FROM "pagos" payment WHERE payment."codigo"=event."pago_codigo"`);
    await queryRunner.query(`ALTER TABLE "eventos_comerciales_salida" DROP COLUMN "pago_codigo" CASCADE`);
    await queryRunner.query(`ALTER TABLE "eventos_comerciales_salida" ALTER COLUMN "pago_id" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "eventos_comerciales_salida" ADD CONSTRAINT "fk_eventos_pago_id" FOREIGN KEY ("pago_id") REFERENCES "pagos"("id") ON DELETE RESTRICT`);

    await queryRunner.query(`ALTER TABLE "notificaciones" ADD COLUMN "pago_id" uuid`);
    await queryRunner.query(`UPDATE "notificaciones" notification SET "pago_id"=payment."id" FROM "pagos" payment WHERE payment."codigo"=notification."pago_codigo"`);
    await queryRunner.query(`ALTER TABLE "notificaciones" DROP COLUMN "pago_codigo" CASCADE`);
    await queryRunner.query(`ALTER TABLE "notificaciones" ADD CONSTRAINT "fk_notificaciones_pago_id" FOREIGN KEY ("pago_id") REFERENCES "pagos"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`CREATE INDEX "idx_notificaciones_pago" ON "notificaciones" ("pago_id") WHERE "pago_id" IS NOT NULL`);

    await queryRunner.query(`ALTER TABLE "pagos" DROP COLUMN "observacion"`);
    await queryRunner.query(`ALTER TABLE "pagos" DROP CONSTRAINT "uq_pagos_codigo"`);
    await queryRunner.query(`ALTER TABLE "pagos" DROP COLUMN "codigo"`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS "pagos_codigo_seq"`);
  }
}
