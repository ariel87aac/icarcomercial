import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCountryCodeAndPasswordChange1720000052000 implements MigrationInterface {
  name = 'AddCountryCodeAndPasswordChange1720000052000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "clientes"
      ADD COLUMN "codigo_pais" varchar(8) NOT NULL DEFAULT '+591'
    `);
    await queryRunner.query(`
      ALTER TABLE "usuarios"
      ADD COLUMN "codigo_pais" varchar(8) NOT NULL DEFAULT '+591',
      ADD COLUMN "debe_cambiar_password" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "usuarios"
      DROP COLUMN "debe_cambiar_password",
      DROP COLUMN "codigo_pais"
    `);
    await queryRunner.query(`
      ALTER TABLE "clientes"
      DROP COLUMN "codigo_pais"
    `);
  }
}
