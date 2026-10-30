import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductCategoryCode1720000021000 implements MigrationInterface {
  name = 'AddProductCategoryCode1720000021000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SEQUENCE "categorias_producto_codigo_seq" START WITH 1 INCREMENT BY 1`);
    await queryRunner.query(`ALTER TABLE "categorias_producto" ADD COLUMN "codigo" integer`);
    await queryRunner.query(`
      WITH ordered_categories AS (
        SELECT "id", row_number() OVER (ORDER BY "created_at" ASC, "id" ASC)::integer AS "codigo"
        FROM "categorias_producto"
      )
      UPDATE "categorias_producto" category
         SET "codigo" = ordered_categories."codigo"
        FROM ordered_categories
       WHERE category."id" = ordered_categories."id"
    `);
    await queryRunner.query(`
      SELECT setval(
        'categorias_producto_codigo_seq',
        COALESCE((SELECT max("codigo") FROM "categorias_producto"), 1),
        EXISTS (SELECT 1 FROM "categorias_producto")
      )
    `);
    await queryRunner.query(`ALTER SEQUENCE "categorias_producto_codigo_seq" OWNED BY "categorias_producto"."codigo"`);
    await queryRunner.query(`ALTER TABLE "categorias_producto" ALTER COLUMN "codigo" SET DEFAULT nextval('categorias_producto_codigo_seq')`);
    await queryRunner.query(`ALTER TABLE "categorias_producto" ALTER COLUMN "codigo" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "categorias_producto" ADD CONSTRAINT "uq_categorias_producto_codigo" UNIQUE ("codigo")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "categorias_producto" DROP CONSTRAINT "uq_categorias_producto_codigo"`);
    await queryRunner.query(`ALTER TABLE "categorias_producto" DROP COLUMN "codigo"`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS "categorias_producto_codigo_seq"`);
  }
}
