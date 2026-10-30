import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductionOrderCode1720000035000 implements MigrationInterface {
  name = 'AddProductionOrderCode1720000035000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SEQUENCE "consolidaciones_produccion_codigo_seq" START WITH 1 INCREMENT BY 1`);
    await queryRunner.query(`ALTER TABLE "consolidaciones_produccion" ADD COLUMN "codigo" integer`);
    await queryRunner.query(`
      WITH ordered_orders AS (
        SELECT "id", row_number() OVER (ORDER BY "created_at" ASC, "id" ASC)::integer AS "codigo"
        FROM "consolidaciones_produccion"
      )
      UPDATE "consolidaciones_produccion" production_order
         SET "codigo" = ordered_orders."codigo"
        FROM ordered_orders
       WHERE production_order."id" = ordered_orders."id"
    `);
    await queryRunner.query(`
      SELECT setval(
        'consolidaciones_produccion_codigo_seq',
        COALESCE((SELECT max("codigo") FROM "consolidaciones_produccion"), 1),
        EXISTS (SELECT 1 FROM "consolidaciones_produccion")
      )
    `);
    await queryRunner.query(`ALTER SEQUENCE "consolidaciones_produccion_codigo_seq" OWNED BY "consolidaciones_produccion"."codigo"`);
    await queryRunner.query(`ALTER TABLE "consolidaciones_produccion" ALTER COLUMN "codigo" SET DEFAULT nextval('consolidaciones_produccion_codigo_seq')`);
    await queryRunner.query(`ALTER TABLE "consolidaciones_produccion" ALTER COLUMN "codigo" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "consolidaciones_produccion" ADD CONSTRAINT "uq_consolidaciones_produccion_codigo" UNIQUE ("codigo")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "consolidaciones_produccion" DROP CONSTRAINT "uq_consolidaciones_produccion_codigo"`);
    await queryRunner.query(`ALTER TABLE "consolidaciones_produccion" DROP COLUMN "codigo"`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS "consolidaciones_produccion_codigo_seq"`);
  }
}
