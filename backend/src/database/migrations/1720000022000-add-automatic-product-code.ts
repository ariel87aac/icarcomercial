import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAutomaticProductCode1720000022000 implements MigrationInterface {
  name = 'AddAutomaticProductCode1720000022000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_productos_codigo_lower"`);
    await queryRunner.query(`
      WITH ordered_products AS (
        SELECT "id", row_number() OVER (ORDER BY "created_at" ASC, "id" ASC)::integer AS "codigo"
        FROM "productos"
      )
      UPDATE "productos" product
         SET "codigo" = ordered_products."codigo"::text
        FROM ordered_products
       WHERE product."id" = ordered_products."id"
    `);
    await queryRunner.query(`ALTER TABLE "productos" ALTER COLUMN "codigo" TYPE integer USING "codigo"::integer`);
    await queryRunner.query(`CREATE SEQUENCE "productos_codigo_seq" START WITH 1 INCREMENT BY 1`);
    await queryRunner.query(`
      SELECT setval(
        'productos_codigo_seq',
        COALESCE((SELECT max("codigo") FROM "productos"), 1),
        EXISTS (SELECT 1 FROM "productos")
      )
    `);
    await queryRunner.query(`ALTER SEQUENCE "productos_codigo_seq" OWNED BY "productos"."codigo"`);
    await queryRunner.query(`ALTER TABLE "productos" ALTER COLUMN "codigo" SET DEFAULT nextval('productos_codigo_seq')`);
    await queryRunner.query(`ALTER TABLE "productos" ADD CONSTRAINT "uq_productos_codigo" UNIQUE ("codigo")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "productos" DROP CONSTRAINT "uq_productos_codigo"`);
    await queryRunner.query(`ALTER TABLE "productos" ALTER COLUMN "codigo" DROP DEFAULT`);
    await queryRunner.query(`ALTER TABLE "productos" ALTER COLUMN "codigo" TYPE varchar(50) USING "codigo"::text`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_productos_codigo_lower" ON "productos" (lower("codigo"))`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS "productos_codigo_seq"`);
  }
}
