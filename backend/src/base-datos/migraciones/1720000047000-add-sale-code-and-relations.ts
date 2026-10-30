import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSaleCodeAndRelations1720000047000 implements MigrationInterface {
  name = 'AddSaleCodeAndRelations1720000047000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SEQUENCE "ventas_codigo_seq" START WITH 1 INCREMENT BY 1`);
    await queryRunner.query(`ALTER TABLE "ventas" ADD COLUMN "codigo" integer`);
    await queryRunner.query(`
      WITH ordered_sales AS (
        SELECT "id", row_number() OVER (ORDER BY "created_at" ASC, "id" ASC)::integer AS "codigo"
        FROM "ventas"
      )
      UPDATE "ventas" sale
         SET "codigo" = ordered_sales."codigo"
        FROM ordered_sales
       WHERE sale."id" = ordered_sales."id"
    `);
    await queryRunner.query(`
      SELECT setval(
        'ventas_codigo_seq',
        COALESCE((SELECT max("codigo") FROM "ventas"), 1),
        EXISTS (SELECT 1 FROM "ventas")
      )
    `);
    await queryRunner.query(`ALTER SEQUENCE "ventas_codigo_seq" OWNED BY "ventas"."codigo"`);
    await queryRunner.query(`ALTER TABLE "ventas" ALTER COLUMN "codigo" SET DEFAULT nextval('ventas_codigo_seq')`);
    await queryRunner.query(`ALTER TABLE "ventas" ALTER COLUMN "codigo" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "ventas" ADD CONSTRAINT "uq_ventas_codigo" UNIQUE ("codigo")`);

    await queryRunner.query(`ALTER TABLE "ventas_detalle" ADD COLUMN "venta_codigo" integer`);
    await queryRunner.query(`
      UPDATE "ventas_detalle" detail
         SET "venta_codigo" = sale."codigo"
        FROM "ventas" sale
       WHERE sale."id" = detail."venta_id"
    `);
    await queryRunner.query(`ALTER TABLE "ventas_detalle" DROP COLUMN "venta_id" CASCADE`);
    await queryRunner.query(`ALTER TABLE "ventas_detalle" ALTER COLUMN "venta_codigo" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "ventas_detalle" ADD CONSTRAINT "fk_ventas_detalle_codigo" FOREIGN KEY ("venta_codigo") REFERENCES "ventas"("codigo") ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE "ventas_detalle" ADD CONSTRAINT "uq_venta_detalle_pedido" UNIQUE ("venta_codigo", "pedido_detalle_id")`);
    await queryRunner.query(`CREATE INDEX "idx_ventas_detalle_codigo" ON "ventas_detalle" ("venta_codigo")`);

    await queryRunner.query(`ALTER TABLE "comprobantes_internos" ADD COLUMN "venta_codigo" integer`);
    await queryRunner.query(`
      UPDATE "comprobantes_internos" voucher
         SET "venta_codigo" = sale."codigo"
        FROM "ventas" sale
       WHERE sale."id" = voucher."venta_id"
    `);
    await queryRunner.query(`ALTER TABLE "comprobantes_internos" DROP COLUMN "venta_id" CASCADE`);
    await queryRunner.query(`ALTER TABLE "comprobantes_internos" ALTER COLUMN "venta_codigo" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "comprobantes_internos" ADD CONSTRAINT "fk_comprobantes_venta_codigo" FOREIGN KEY ("venta_codigo") REFERENCES "ventas"("codigo") ON DELETE RESTRICT`);
    await queryRunner.query(`ALTER TABLE "comprobantes_internos" ADD CONSTRAINT "uq_comprobantes_venta_codigo" UNIQUE ("venta_codigo")`);

    await queryRunner.query(`ALTER TABLE "pagos_aplicaciones" ADD COLUMN "venta_codigo" integer`);
    await queryRunner.query(`
      UPDATE "pagos_aplicaciones" application
         SET "venta_codigo" = sale."codigo"
        FROM "ventas" sale
       WHERE sale."id" = application."venta_id"
    `);
    await queryRunner.query(`ALTER TABLE "pagos_aplicaciones" DROP COLUMN "venta_id" CASCADE`);
    await queryRunner.query(`ALTER TABLE "pagos_aplicaciones" ALTER COLUMN "venta_codigo" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "pagos_aplicaciones" ADD CONSTRAINT "fk_aplicaciones_venta_codigo" FOREIGN KEY ("venta_codigo") REFERENCES "ventas"("codigo") ON DELETE RESTRICT`);
    await queryRunner.query(`ALTER TABLE "pagos_aplicaciones" ADD CONSTRAINT "uq_pago_venta" UNIQUE ("pago_id", "venta_codigo")`);
    await queryRunner.query(`CREATE INDEX "idx_aplicaciones_venta" ON "pagos_aplicaciones" ("venta_codigo")`);

    await queryRunner.query(`ALTER TABLE "movimientos_cuenta_cliente" ADD COLUMN "venta_codigo" integer`);
    await queryRunner.query(`
      UPDATE "movimientos_cuenta_cliente" movement
         SET "venta_codigo" = sale."codigo"
        FROM "ventas" sale
       WHERE sale."id" = movement."venta_id"
    `);
    await queryRunner.query(`ALTER TABLE "movimientos_cuenta_cliente" DROP COLUMN "venta_id" CASCADE`);
    await queryRunner.query(`ALTER TABLE "movimientos_cuenta_cliente" ADD CONSTRAINT "fk_movimientos_venta_codigo" FOREIGN KEY ("venta_codigo") REFERENCES "ventas"("codigo") ON DELETE RESTRICT`);
    await queryRunner.query(`CREATE INDEX "idx_movimientos_venta_codigo" ON "movimientos_cuenta_cliente" ("venta_codigo") WHERE "venta_codigo" IS NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ventas_detalle" ADD COLUMN "venta_id" uuid`);
    await queryRunner.query(`UPDATE "ventas_detalle" detail SET "venta_id" = sale."id" FROM "ventas" sale WHERE sale."codigo" = detail."venta_codigo"`);
    await queryRunner.query(`ALTER TABLE "ventas_detalle" DROP COLUMN "venta_codigo" CASCADE`);
    await queryRunner.query(`ALTER TABLE "ventas_detalle" ALTER COLUMN "venta_id" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "ventas_detalle" ADD CONSTRAINT "fk_ventas_detalle_id" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE "ventas_detalle" ADD CONSTRAINT "uq_venta_detalle_pedido" UNIQUE ("venta_id", "pedido_detalle_id")`);

    await queryRunner.query(`ALTER TABLE "comprobantes_internos" ADD COLUMN "venta_id" uuid`);
    await queryRunner.query(`UPDATE "comprobantes_internos" voucher SET "venta_id" = sale."id" FROM "ventas" sale WHERE sale."codigo" = voucher."venta_codigo"`);
    await queryRunner.query(`ALTER TABLE "comprobantes_internos" DROP COLUMN "venta_codigo" CASCADE`);
    await queryRunner.query(`ALTER TABLE "comprobantes_internos" ALTER COLUMN "venta_id" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "comprobantes_internos" ADD CONSTRAINT "fk_comprobantes_venta_id" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`ALTER TABLE "comprobantes_internos" ADD CONSTRAINT "uq_comprobantes_venta_id" UNIQUE ("venta_id")`);

    await queryRunner.query(`ALTER TABLE "pagos_aplicaciones" ADD COLUMN "venta_id" uuid`);
    await queryRunner.query(`UPDATE "pagos_aplicaciones" application SET "venta_id" = sale."id" FROM "ventas" sale WHERE sale."codigo" = application."venta_codigo"`);
    await queryRunner.query(`ALTER TABLE "pagos_aplicaciones" DROP COLUMN "venta_codigo" CASCADE`);
    await queryRunner.query(`ALTER TABLE "pagos_aplicaciones" ALTER COLUMN "venta_id" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "pagos_aplicaciones" ADD CONSTRAINT "fk_aplicaciones_venta_id" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`ALTER TABLE "pagos_aplicaciones" ADD CONSTRAINT "uq_pago_venta" UNIQUE ("pago_id", "venta_id")`);
    await queryRunner.query(`CREATE INDEX "idx_aplicaciones_venta" ON "pagos_aplicaciones" ("venta_id")`);

    await queryRunner.query(`ALTER TABLE "movimientos_cuenta_cliente" ADD COLUMN "venta_id" uuid`);
    await queryRunner.query(`UPDATE "movimientos_cuenta_cliente" movement SET "venta_id" = sale."id" FROM "ventas" sale WHERE sale."codigo" = movement."venta_codigo"`);
    await queryRunner.query(`ALTER TABLE "movimientos_cuenta_cliente" DROP COLUMN "venta_codigo" CASCADE`);
    await queryRunner.query(`ALTER TABLE "movimientos_cuenta_cliente" ADD CONSTRAINT "fk_movimientos_venta_id" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE RESTRICT`);

    await queryRunner.query(`ALTER TABLE "ventas" DROP CONSTRAINT "uq_ventas_codigo"`);
    await queryRunner.query(`ALTER TABLE "ventas" DROP COLUMN "codigo"`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS "ventas_codigo_seq"`);
  }
}
