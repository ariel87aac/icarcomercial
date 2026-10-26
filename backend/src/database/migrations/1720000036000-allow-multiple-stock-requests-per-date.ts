import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowMultipleStockRequestsPerDate1720000036000 implements MigrationInterface {
  name = 'AllowMultipleStockRequestsPerDate1720000036000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "solicitudes_abastecimiento" DROP CONSTRAINT IF EXISTS "uq_solicitudes_abastecimiento_fecha"`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_solicitudes_abastecimiento_fecha_codigo" ON "solicitudes_abastecimiento" ("fecha_requerida" DESC, "codigo" DESC)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_solicitudes_abastecimiento_fecha_codigo"`);
    await queryRunner.query(`ALTER TABLE "solicitudes_abastecimiento" ADD CONSTRAINT "uq_solicitudes_abastecimiento_fecha" UNIQUE ("fecha_requerida")`);
  }
}
