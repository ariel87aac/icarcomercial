import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveUserProductLineScope1720000023000 implements MigrationInterface {
  name = 'RemoveUserProductLineScope1720000023000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "usuarios_lineas_productivas"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "usuarios_lineas_productivas" (
        "usuario_id" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE CASCADE,
        "linea_productiva_id" uuid NOT NULL REFERENCES "lineas_productivas"("id") ON DELETE CASCADE,
        CONSTRAINT "pk_usuarios_lineas_productivas" PRIMARY KEY ("usuario_id", "linea_productiva_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_usuarios_lineas_linea" ON "usuarios_lineas_productivas" ("linea_productiva_id", "usuario_id")`);
  }
}
