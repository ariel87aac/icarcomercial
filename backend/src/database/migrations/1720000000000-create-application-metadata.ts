import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateApplicationMetadata1720000000000
  implements MigrationInterface
{
  name = 'CreateApplicationMetadata1720000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "app_metadata" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "clave" varchar(100) NOT NULL,
        "valor" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_app_metadata" PRIMARY KEY ("id"),
        CONSTRAINT "uq_app_metadata_clave" UNIQUE ("clave")
      )
    `);
    await queryRunner.query(`
      INSERT INTO "app_metadata" ("clave", "valor")
      VALUES ('schema_version', '0.1.0')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "app_metadata"');
  }
}

