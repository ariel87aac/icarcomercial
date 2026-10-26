import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowStockOnlyProduction1720000016000 implements MigrationInterface {
  name = 'AllowStockOnlyProduction1720000016000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "consolidaciones_detalle" DROP CONSTRAINT IF EXISTS "consolidaciones_detalle_cantidad_solicitada_check"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "consolidaciones_detalle" ADD CONSTRAINT "consolidaciones_detalle_cantidad_solicitada_check" CHECK ("cantidad_solicitada" > 0)`);
  }
}
