import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFactoryDelivery1720000045000 implements MigrationInterface {
  name = 'AddFactoryDelivery1720000045000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "tipo_entrega_distribucion_enum" AS ENUM ('REPARTO', 'FABRICA')`);
    await queryRunner.query(`ALTER TABLE "rutas_entregas" ADD "tipo_entrega" "tipo_entrega_distribucion_enum" NOT NULL DEFAULT 'REPARTO'`);
    await queryRunner.query(`ALTER TABLE "rutas_entregas" ALTER COLUMN "ruta_id" DROP NOT NULL`);
    await queryRunner.query(`
      ALTER TABLE "rutas_entregas"
      ADD CONSTRAINT "CHK_rutas_entregas_tipo_origen"
      CHECK (
        ("tipo_entrega" = 'REPARTO' AND "ruta_id" IS NOT NULL)
        OR ("tipo_entrega" = 'FABRICA' AND "ruta_id" IS NULL)
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_rutas_entregas_tipo_creado" ON "rutas_entregas" ("tipo_entrega", "created_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_rutas_entregas_tipo_creado"`);
    await queryRunner.query(`ALTER TABLE "rutas_entregas" DROP CONSTRAINT "CHK_rutas_entregas_tipo_origen"`);
    await queryRunner.query(`ALTER TABLE "rutas_entregas" ALTER COLUMN "ruta_id" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "rutas_entregas" DROP COLUMN "tipo_entrega"`);
    await queryRunner.query(`DROP TYPE "tipo_entrega_distribucion_enum"`);
  }
}
