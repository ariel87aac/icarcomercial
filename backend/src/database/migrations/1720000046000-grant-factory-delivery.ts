import { MigrationInterface, QueryRunner } from 'typeorm';

export class GrantFactoryDelivery1720000046000 implements MigrationInterface {
  name = 'GrantFactoryDelivery1720000046000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id
        FROM "roles" role
        CROSS JOIN "permisos" permission
       WHERE role.name = 'DISTRIBUCION'
         AND permission.key = 'distribution.visits.create'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "roles_permisos"
       WHERE "rol_id" IN (SELECT id FROM "roles" WHERE name = 'DISTRIBUCION')
         AND "permiso_id" IN (SELECT id FROM "permisos" WHERE key = 'distribution.visits.create')
    `);
  }
}
