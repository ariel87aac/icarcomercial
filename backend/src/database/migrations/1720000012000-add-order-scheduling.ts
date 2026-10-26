import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderScheduling1720000012000 implements MigrationInterface {
  name = 'AddOrderScheduling1720000012000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "configuracion_programacion_pedidos" (
        "id" smallint PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
        "hora_cierre_pedidos" time NOT NULL DEFAULT '13:00',
        "dias_anticipacion_cierre" smallint NOT NULL DEFAULT 1 CHECK ("dias_anticipacion_cierre" BETWEEN 0 AND 30),
        "hora_limite_consolidado" time NOT NULL DEFAULT '18:00',
        "dias_anticipacion_preparacion" smallint NOT NULL DEFAULT 1 CHECK ("dias_anticipacion_preparacion" BETWEEN 0 AND 30),
        "actualizado_por" uuid REFERENCES "usuarios"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`INSERT INTO "configuracion_programacion_pedidos" ("id") VALUES (1)`);
    await queryRunner.query(`ALTER TABLE "pedidos" ADD COLUMN "fecha_cierre_pedido" timestamptz`);
    await queryRunner.query(`ALTER TABLE "pedidos" ADD COLUMN "fecha_preparacion" timestamptz`);
    await queryRunner.query(`
      UPDATE "pedidos"
         SET "fecha_cierre_pedido" = (("fecha_solicitada" - 1)::date + time '13:00') AT TIME ZONE 'America/La_Paz',
             "fecha_preparacion" = (("fecha_solicitada" - 1)::date + time '18:00') AT TIME ZONE 'America/La_Paz'
    `);
    await queryRunner.query(`ALTER TABLE "pedidos" ALTER COLUMN "fecha_cierre_pedido" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "pedidos" ALTER COLUMN "fecha_preparacion" SET NOT NULL`);
    await queryRunner.query(`CREATE INDEX "idx_pedidos_cierre_estado" ON "pedidos" ("fecha_cierre_pedido", "estado")`);
    await queryRunner.query(`
      INSERT INTO "permisos" ("key", "module", "action", "description")
      VALUES ('orders.scheduling.manage', 'orders', 'scheduling_manage', 'Configurar horarios de cierre y preparación de pedidos')
      ON CONFLICT ("key") DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id
        FROM "roles" role CROSS JOIN "permisos" permission
       WHERE role.name IN ('ADMINISTRADOR', 'COMERCIALIZACION')
         AND permission.key = 'orders.scheduling.manage'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "roles_permisos" WHERE "permiso_id" IN (SELECT "id" FROM "permisos" WHERE "key" = 'orders.scheduling.manage')`);
    await queryRunner.query(`DELETE FROM "permisos" WHERE "key" = 'orders.scheduling.manage'`);
    await queryRunner.query(`DROP INDEX "idx_pedidos_cierre_estado"`);
    await queryRunner.query(`ALTER TABLE "pedidos" DROP COLUMN "fecha_preparacion"`);
    await queryRunner.query(`ALTER TABLE "pedidos" DROP COLUMN "fecha_cierre_pedido"`);
    await queryRunner.query(`DROP TABLE "configuracion_programacion_pedidos"`);
  }
}
