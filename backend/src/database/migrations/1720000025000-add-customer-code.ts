import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomerCode1720000025000 implements MigrationInterface {
  name = 'AddCustomerCode1720000025000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE SEQUENCE "clientes_codigo_seq" START WITH 1 INCREMENT BY 1`,
    );
    await queryRunner.query(
      `ALTER TABLE "clientes" ADD COLUMN "codigo" integer`,
    );
    await queryRunner.query(`
      WITH ordered_customers AS (
        SELECT "id", row_number() OVER (ORDER BY "created_at" ASC, "id" ASC)::integer AS "codigo"
        FROM "clientes"
      )
      UPDATE "clientes" customer
         SET "codigo" = ordered_customers."codigo"
        FROM ordered_customers
       WHERE customer."id" = ordered_customers."id"
    `);
    await queryRunner.query(`
      SELECT setval(
        'clientes_codigo_seq',
        COALESCE((SELECT max("codigo") FROM "clientes"), 1),
        EXISTS (SELECT 1 FROM "clientes")
      )
    `);
    await queryRunner.query(
      `ALTER SEQUENCE "clientes_codigo_seq" OWNED BY "clientes"."codigo"`,
    );
    await queryRunner.query(
      `ALTER TABLE "clientes" ALTER COLUMN "codigo" SET DEFAULT nextval('clientes_codigo_seq')`,
    );
    await queryRunner.query(
      `ALTER TABLE "clientes" ALTER COLUMN "codigo" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "clientes" ADD CONSTRAINT "uq_clientes_codigo" UNIQUE ("codigo")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "clientes" DROP CONSTRAINT "uq_clientes_codigo"`,
    );
    await queryRunner.query(`ALTER TABLE "clientes" DROP COLUMN "codigo"`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS "clientes_codigo_seq"`);
  }
}
