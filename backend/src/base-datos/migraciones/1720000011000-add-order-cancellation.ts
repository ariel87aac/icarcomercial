import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderCancellation1720000011000 implements MigrationInterface {
  name = 'AddOrderCancellation1720000011000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "estado_pedido_enum" ADD VALUE IF NOT EXISTS 'CANCELADO'`);
    await queryRunner.query(`ALTER TYPE "estado_reserva_inventario_enum" ADD VALUE IF NOT EXISTS 'LIBERADA'`);
    await queryRunner.query(`ALTER TABLE "pedidos" ADD COLUMN "cancelado_por" uuid REFERENCES "usuarios"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`ALTER TABLE "pedidos" ADD COLUMN "cancelado_at" timestamptz`);
    await queryRunner.query(`ALTER TABLE "pedidos" ADD COLUMN "motivo_cancelacion" varchar(500)`);
    await queryRunner.query(`
      INSERT INTO "permisos" ("key", "module", "action", "description")
      VALUES ('orders.cancel', 'orders', 'cancel', 'Cancelar pedidos y liberar reservas activas')
      ON CONFLICT ("key") DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id
        FROM "roles" role CROSS JOIN "permisos" permission
       WHERE role.name IN ('ADMINISTRADOR', 'COMERCIALIZACION', 'CLIENTE')
         AND permission.key = 'orders.cancel'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "roles_permisos" WHERE "permiso_id" IN (SELECT "id" FROM "permisos" WHERE "key" = 'orders.cancel')`);
    await queryRunner.query(`DELETE FROM "permisos" WHERE "key" = 'orders.cancel'`);
    await queryRunner.query(`ALTER TABLE "pedidos" DROP COLUMN "motivo_cancelacion"`);
    await queryRunner.query(`ALTER TABLE "pedidos" DROP COLUMN "cancelado_at"`);
    await queryRunner.query(`ALTER TABLE "pedidos" DROP COLUMN "cancelado_por"`);
  }
}
