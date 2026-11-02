import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddZoneDelete1720000054000 implements MigrationInterface {
  name = 'AddZoneDelete1720000054000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permisos" ("key", "module", "action", "description")
      VALUES ('zones.delete', 'zones', 'delete', 'Pasar zonas de reparto a estado inactivo')
      ON CONFLICT ("key") DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id
        FROM "roles" role
        JOIN "permisos" permission ON permission."key" = 'zones.delete'
       WHERE role."name" = 'ADMINISTRADOR'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "roles_permisos" WHERE "permiso_id" IN (SELECT "id" FROM "permisos" WHERE "key" = 'zones.delete')`,
    );
    await queryRunner.query(
      `DELETE FROM "permisos" WHERE "key" = 'zones.delete'`,
    );
  }
}
