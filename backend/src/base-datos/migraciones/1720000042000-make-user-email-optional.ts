import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeUserEmailOptional1720000042000 implements MigrationInterface {
  name = 'MakeUserEmailOptional1720000042000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "usuarios"
         SET "email" = NULL
       WHERE btrim("email") = ''
    `);
    await queryRunner.query(`
      ALTER TABLE "usuarios"
      ALTER COLUMN "email" DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "usuarios"
         SET "email" = 'restaurado+' || "codigo"::text || '@sin-correo.local'
       WHERE "email" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "usuarios"
      ALTER COLUMN "email" SET NOT NULL
    `);
  }
}
