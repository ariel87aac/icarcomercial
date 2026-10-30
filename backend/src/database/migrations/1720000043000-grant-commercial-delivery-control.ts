import { MigrationInterface, QueryRunner } from 'typeorm';

export class GrantCommercialDeliveryControl1720000043000 implements MigrationInterface {
  name = 'GrantCommercialDeliveryControl1720000043000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id
        FROM "roles" role
        CROSS JOIN "permisos" permission
       WHERE role.name = 'COMERCIALIZACION'
         AND permission.key IN (
           'distribution.routes.assigned.read',
           'distribution.visits.create',
           'distribution.summary.read'
         )
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "roles_permisos"
       WHERE "rol_id" IN (SELECT id FROM "roles" WHERE name = 'COMERCIALIZACION')
         AND "permiso_id" IN (
           SELECT id
             FROM "permisos"
            WHERE key IN (
              'distribution.routes.assigned.read',
              'distribution.visits.create',
              'distribution.summary.read'
            )
         )
    `);
  }
}
