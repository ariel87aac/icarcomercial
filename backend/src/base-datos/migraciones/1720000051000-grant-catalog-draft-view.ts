import { MigrationInterface, QueryRunner } from 'typeorm';

export class GrantCatalogDraftView1720000051000 implements MigrationInterface {
  name = 'GrantCatalogDraftView1720000051000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id
        FROM "roles" role
        CROSS JOIN "permisos" permission
       WHERE role.name IN (
         'CONTABILIDAD',
         'CAJA',
         'ATENCION_COMERCIAL',
         'GERENCIA_COMERCIAL',
         'GERENCIA_CONTABLE'
       )
         AND permission.key = 'catalog.read'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "roles_permisos"
       WHERE "rol_id" IN (
         SELECT id FROM "roles"
          WHERE name IN (
            'CONTABILIDAD',
            'CAJA',
            'ATENCION_COMERCIAL',
            'GERENCIA_COMERCIAL',
            'GERENCIA_CONTABLE'
          )
       )
         AND "permiso_id" = (SELECT id FROM "permisos" WHERE key = 'catalog.read')
    `);
  }
}
