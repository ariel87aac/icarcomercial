import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUnitCode1720000019000 implements MigrationInterface {
  name = 'AddUnitCode1720000019000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SEQUENCE "unidades_medida_codigo_seq" START WITH 1 INCREMENT BY 1`);
    await queryRunner.query(`ALTER TABLE "unidades_medida" ADD COLUMN "codigo" integer`);
    await queryRunner.query(`
      WITH ordered_units AS (
        SELECT "id", row_number() OVER (ORDER BY "created_at" ASC, "id" ASC)::integer AS "codigo"
        FROM "unidades_medida"
      )
      UPDATE "unidades_medida" unit
         SET "codigo" = ordered_units."codigo"
        FROM ordered_units
       WHERE unit."id" = ordered_units."id"
    `);
    await queryRunner.query(`
      SELECT setval(
        'unidades_medida_codigo_seq',
        COALESCE((SELECT max("codigo") FROM "unidades_medida"), 1),
        EXISTS (SELECT 1 FROM "unidades_medida")
      )
    `);
    await queryRunner.query(`ALTER SEQUENCE "unidades_medida_codigo_seq" OWNED BY "unidades_medida"."codigo"`);
    await queryRunner.query(`ALTER TABLE "unidades_medida" ALTER COLUMN "codigo" SET DEFAULT nextval('unidades_medida_codigo_seq')`);
    await queryRunner.query(`ALTER TABLE "unidades_medida" ALTER COLUMN "codigo" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "unidades_medida" ADD CONSTRAINT "uq_unidades_medida_codigo" UNIQUE ("codigo")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "unidades_medida" DROP CONSTRAINT "uq_unidades_medida_codigo"`);
    await queryRunner.query(`ALTER TABLE "unidades_medida" DROP COLUMN "codigo"`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS "unidades_medida_codigo_seq"`);
  }
}
