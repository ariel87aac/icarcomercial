import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserProductionAreaScope1720000031000 implements MigrationInterface {
  name = 'AddUserProductionAreaScope1720000031000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "usuarios_areas_produccion" (
        "usuario_id" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE CASCADE,
        "area_id" uuid NOT NULL REFERENCES "areas_produccion"("id") ON DELETE CASCADE,
        CONSTRAINT "pk_usuarios_areas_produccion" PRIMARY KEY ("usuario_id", "area_id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_usuarios_areas_area"
      ON "usuarios_areas_produccion" ("area_id", "usuario_id")
    `);
    await queryRunner.query(`
      INSERT INTO "usuarios_areas_produccion" ("usuario_id", "area_id")
      SELECT DISTINCT user_role.usuario_id, area.id
        FROM "usuarios_roles" user_role
        JOIN "roles" role ON role.id = user_role.rol_id
        CROSS JOIN "areas_produccion" area
       WHERE role.name = 'PRODUCCION'
         AND role.status = 'ACTIVO'
         AND area.status = 'ACTIVO'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "usuarios_areas_produccion"`);
  }
}
