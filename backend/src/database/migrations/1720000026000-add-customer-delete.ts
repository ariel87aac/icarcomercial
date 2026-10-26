import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomerDelete1720000026000 implements MigrationInterface {
  name = 'AddCustomerDelete1720000026000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permisos" ("key", "module", "action", "description")
      VALUES ('customers.delete', 'customers', 'delete', 'Eliminar clientes sin relaciones ni operaciones asociadas')
      ON CONFLICT ("key") DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id
        FROM "roles" role
        JOIN "permisos" permission ON permission."key" = 'customers.delete'
       WHERE role."name" = 'ADMINISTRADOR'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "roles_permisos" WHERE "permiso_id" IN (SELECT "id" FROM "permisos" WHERE "key" = 'customers.delete')`,
    );
    await queryRunner.query(
      `DELETE FROM "permisos" WHERE "key" = 'customers.delete'`,
    );
  }
}
