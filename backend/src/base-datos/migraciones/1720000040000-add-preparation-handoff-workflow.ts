import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPreparationHandoffWorkflow1720000040000 implements MigrationInterface {
  name = 'AddPreparationHandoffWorkflow1720000040000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "evento_preparacion_enum" ADD VALUE IF NOT EXISTS 'REAPERTURA'`);
    await queryRunner.query(`ALTER TYPE "evento_preparacion_enum" ADD VALUE IF NOT EXISTS 'ENTREGA_DISTRIBUCION'`);
    await queryRunner.query(`ALTER TABLE "preparaciones_pedido" ADD COLUMN "entregado_distribucion_por" uuid REFERENCES "usuarios"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`ALTER TABLE "preparaciones_pedido" ADD COLUMN "entregado_distribucion_at" timestamptz`);
    await queryRunner.query(`
      INSERT INTO "permisos" ("key", "module", "action", "description") VALUES
      ('preparations.handoff', 'preparations', 'handoff', 'Entregar una preparación confirmada al flujo de Distribución')
      ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description"
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id
        FROM "roles" role CROSS JOIN "permisos" permission
       WHERE role.name IN ('ADMINISTRADOR', 'ALMACEN')
         AND permission.key = 'preparations.handoff'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "roles_permisos" WHERE "permiso_id" IN (SELECT id FROM "permisos" WHERE "key" = 'preparations.handoff')`);
    await queryRunner.query(`DELETE FROM "permisos" WHERE "key" = 'preparations.handoff'`);
    await queryRunner.query(`ALTER TABLE "preparaciones_pedido" DROP COLUMN "entregado_distribucion_at", DROP COLUMN "entregado_distribucion_por"`);
    await queryRunner.query(`UPDATE "preparaciones_historial" SET "evento" = 'AVANCE' WHERE "evento" = 'REAPERTURA'`);
    await queryRunner.query(`UPDATE "preparaciones_historial" SET "evento" = 'CONFIRMACION' WHERE "evento" = 'ENTREGA_DISTRIBUCION'`);
    await queryRunner.query(`ALTER TYPE "evento_preparacion_enum" RENAME TO "evento_preparacion_enum_mobile"`);
    await queryRunner.query(`CREATE TYPE "evento_preparacion_enum" AS ENUM ('INICIO', 'AVANCE', 'OBSERVACION', 'CONFIRMACION', 'ASIGNACION', 'DESASIGNACION', 'DESPACHO', 'CANCELACION')`);
    await queryRunner.query(`ALTER TABLE "preparaciones_historial" ALTER COLUMN "evento" TYPE "evento_preparacion_enum" USING "evento"::text::"evento_preparacion_enum"`);
    await queryRunner.query(`DROP TYPE "evento_preparacion_enum_mobile"`);
  }
}
