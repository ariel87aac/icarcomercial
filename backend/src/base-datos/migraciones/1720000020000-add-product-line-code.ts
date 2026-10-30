import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductLineCode1720000020000 implements MigrationInterface {
  name = 'AddProductLineCode1720000020000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SEQUENCE "lineas_productivas_codigo_seq" START WITH 1 INCREMENT BY 1`);
    await queryRunner.query(`ALTER TABLE "lineas_productivas" ADD COLUMN "codigo" integer`);
    await queryRunner.query(`
      WITH ordered_lines AS (
        SELECT "id", row_number() OVER (ORDER BY "created_at" ASC, "id" ASC)::integer AS "codigo"
        FROM "lineas_productivas"
      )
      UPDATE "lineas_productivas" line
         SET "codigo" = ordered_lines."codigo"
        FROM ordered_lines
       WHERE line."id" = ordered_lines."id"
    `);
    await queryRunner.query(`
      SELECT setval(
        'lineas_productivas_codigo_seq',
        COALESCE((SELECT max("codigo") FROM "lineas_productivas"), 1),
        EXISTS (SELECT 1 FROM "lineas_productivas")
      )
    `);
    await queryRunner.query(`ALTER SEQUENCE "lineas_productivas_codigo_seq" OWNED BY "lineas_productivas"."codigo"`);
    await queryRunner.query(`ALTER TABLE "lineas_productivas" ALTER COLUMN "codigo" SET DEFAULT nextval('lineas_productivas_codigo_seq')`);
    await queryRunner.query(`ALTER TABLE "lineas_productivas" ALTER COLUMN "codigo" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "lineas_productivas" ADD CONSTRAINT "uq_lineas_productivas_codigo" UNIQUE ("codigo")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "lineas_productivas" DROP CONSTRAINT "uq_lineas_productivas_codigo"`);
    await queryRunner.query(`ALTER TABLE "lineas_productivas" DROP COLUMN "codigo"`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS "lineas_productivas_codigo_seq"`);
  }
}
