import { MigrationInterface, QueryRunner } from 'typeorm';

export class GrantDriverRouteCustody1720000057000 implements MigrationInterface {
  name = 'GrantDriverRouteCustody1720000057000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id
        FROM "roles" role
        CROSS JOIN "permisos" permission
       WHERE role.name = 'REPARTIDOR'
         AND permission.key IN ('distribution.routes.departure', 'distribution.routes.finish')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "roles_permisos"
       WHERE "rol_id" IN (SELECT id FROM "roles" WHERE name = 'REPARTIDOR')
         AND "permiso_id" IN (
           SELECT id FROM "permisos"
            WHERE key IN ('distribution.routes.departure', 'distribution.routes.finish')
         )
    `);
  }
}
