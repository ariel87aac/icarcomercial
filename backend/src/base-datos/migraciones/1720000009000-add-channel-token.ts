import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChannelToken1720000009000 implements MigrationInterface {
  name = 'AddChannelToken1720000009000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "configuraciones_canal" ADD COLUMN "token_cifrado" text`);
    await queryRunner.query(`ALTER TABLE "configuraciones_canal" ADD COLUMN "token_ultimos_3" varchar(3)`);
    await queryRunner.query(`ALTER TABLE "configuraciones_canal" ADD CONSTRAINT "ck_canal_token_ultimos_3" CHECK ("token_ultimos_3" IS NULL OR char_length("token_ultimos_3") = 3)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "configuraciones_canal" DROP CONSTRAINT "ck_canal_token_ultimos_3"`);
    await queryRunner.query(`ALTER TABLE "configuraciones_canal" DROP COLUMN "token_ultimos_3"`);
    await queryRunner.query(`ALTER TABLE "configuraciones_canal" DROP COLUMN "token_cifrado"`);
  }
}
