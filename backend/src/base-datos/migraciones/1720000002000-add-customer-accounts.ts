import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomerAccounts1720000002000 implements MigrationInterface {
  name = 'AddCustomerAccounts1720000002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "tipo_usuario_enum" AS ENUM ('INTERNO', 'CLIENTE')`);
    await queryRunner.query(`
      ALTER TABLE "usuarios"
      ADD COLUMN "tipo_usuario" tipo_usuario_enum NOT NULL DEFAULT 'INTERNO'
    `);
    await queryRunner.query(`CREATE INDEX "idx_usuarios_tipo_estado" ON "usuarios" ("tipo_usuario", "status")`);

    await queryRunner.query(`
      CREATE TABLE "clientes_usuarios" (
        "cliente_id" uuid NOT NULL REFERENCES "clientes"("id") ON DELETE CASCADE,
        "usuario_id" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE CASCADE,
        "es_principal" boolean NOT NULL DEFAULT false,
        "status" estado_registro_enum NOT NULL DEFAULT 'ACTIVO',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("cliente_id", "usuario_id"),
        CONSTRAINT "uq_clientes_usuarios_usuario" UNIQUE ("usuario_id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_clientes_usuarios_principal"
      ON "clientes_usuarios" ("cliente_id")
      WHERE "es_principal" = true AND "status" = 'ACTIVO'
    `);
    await queryRunner.query(`CREATE INDEX "idx_clientes_usuarios_estado" ON "clientes_usuarios" ("cliente_id", "status")`);

    await queryRunner.query(`
      INSERT INTO "permisos" ("key", "module", "action", "description") VALUES
      ('customer_accounts.create', 'customer_accounts', 'create', 'Crear y administrar cuentas de acceso de clientes')
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT r.id, p.id
      FROM "roles" r
      CROSS JOIN "permisos" p
      WHERE r.name IN ('ADMINISTRADOR', 'COMERCIALIZACION')
        AND p.key = 'customer_accounts.create'
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT r.id, p.id
      FROM "roles" r
      CROSS JOIN "permisos" p
      WHERE r.name = 'CLIENTE'
        AND p.key = 'customers.read'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "roles_permisos" WHERE "permiso_id" IN (SELECT "id" FROM "permisos" WHERE "key" = 'customer_accounts.create')`);
    await queryRunner.query(`DELETE FROM "permisos" WHERE "key" = 'customer_accounts.create'`);
    await queryRunner.query(`DROP TABLE "clientes_usuarios"`);
    await queryRunner.query(`DROP INDEX "idx_usuarios_tipo_estado"`);
    await queryRunner.query(`ALTER TABLE "usuarios" DROP COLUMN "tipo_usuario"`);
    await queryRunner.query(`DROP TYPE "tipo_usuario_enum"`);
  }
}
