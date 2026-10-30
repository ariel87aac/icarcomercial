import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductImages1720000006000 implements MigrationInterface {
  name = 'AddProductImages1720000006000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "productos" ADD COLUMN "imagen" bytea`);
    await queryRunner.query(`ALTER TABLE "productos" ADD COLUMN "imagen_mime" varchar(20)`);
    await queryRunner.query(`
      ALTER TABLE "productos" ADD CONSTRAINT "ck_productos_imagen"
      CHECK (
        ("imagen" IS NULL AND "imagen_mime" IS NULL)
        OR (
          "imagen" IS NOT NULL
          AND "imagen_mime" IN ('image/jpeg', 'image/png', 'image/webp')
          AND octet_length("imagen") BETWEEN 1 AND 2097152
        )
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "productos" DROP CONSTRAINT "ck_productos_imagen"`);
    await queryRunner.query(`ALTER TABLE "productos" DROP COLUMN "imagen_mime"`);
    await queryRunner.query(`ALTER TABLE "productos" DROP COLUMN "imagen"`);
  }
}
