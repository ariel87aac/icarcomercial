import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderSoftDelete1720000030000 implements MigrationInterface {
  name = 'AddOrderSoftDelete1720000030000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "pedidos" ADD COLUMN "eliminado_at" timestamptz`);
    await queryRunner.query(`ALTER TABLE "pedidos" ADD COLUMN "eliminado_por" uuid REFERENCES "usuarios"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`ALTER TABLE "pedidos" ADD COLUMN "motivo_eliminacion" varchar(500)`);
    await queryRunner.query(`CREATE INDEX "idx_pedidos_eliminado_at" ON "pedidos" ("eliminado_at")`);
    await queryRunner.query(`
      INSERT INTO "permisos" ("key", "module", "action", "description")
      VALUES ('orders.delete', 'orders', 'delete', 'Eliminar lógicamente pedidos cancelados conservando su trazabilidad')
      ON CONFLICT ("key") DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id
        FROM "roles" role CROSS JOIN "permisos" permission
       WHERE role.name = 'ADMINISTRADOR'
         AND permission.key = 'orders.delete'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "roles_permisos" WHERE "permiso_id" IN (SELECT "id" FROM "permisos" WHERE "key" = 'orders.delete')`);
    await queryRunner.query(`DELETE FROM "permisos" WHERE "key" = 'orders.delete'`);
    await queryRunner.query(`DROP INDEX "idx_pedidos_eliminado_at"`);
    await queryRunner.query(`ALTER TABLE "pedidos" DROP COLUMN "motivo_eliminacion"`);
    await queryRunner.query(`ALTER TABLE "pedidos" DROP COLUMN "eliminado_por"`);
    await queryRunner.query(`ALTER TABLE "pedidos" DROP COLUMN "eliminado_at"`);
  }
}
