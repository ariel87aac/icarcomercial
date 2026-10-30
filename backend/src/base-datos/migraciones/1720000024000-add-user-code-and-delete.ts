import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserCodeAndDelete1720000024000 implements MigrationInterface {
  name = 'AddUserCodeAndDelete1720000024000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SEQUENCE "usuarios_codigo_seq" START WITH 1 INCREMENT BY 1`);
    await queryRunner.query(`ALTER TABLE "usuarios" ADD COLUMN "codigo" integer`);
    await queryRunner.query(`
      WITH ordered_users AS (
        SELECT "id", row_number() OVER (ORDER BY "created_at" ASC, "id" ASC)::integer AS "codigo"
        FROM "usuarios"
      )
      UPDATE "usuarios" user_account
         SET "codigo" = ordered_users."codigo"
        FROM ordered_users
       WHERE user_account."id" = ordered_users."id"
    `);
    await queryRunner.query(`
      SELECT setval(
        'usuarios_codigo_seq',
        COALESCE((SELECT max("codigo") FROM "usuarios"), 1),
        EXISTS (SELECT 1 FROM "usuarios")
      )
    `);
    await queryRunner.query(`ALTER SEQUENCE "usuarios_codigo_seq" OWNED BY "usuarios"."codigo"`);
    await queryRunner.query(`ALTER TABLE "usuarios" ALTER COLUMN "codigo" SET DEFAULT nextval('usuarios_codigo_seq')`);
    await queryRunner.query(`ALTER TABLE "usuarios" ALTER COLUMN "codigo" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "usuarios" ADD CONSTRAINT "uq_usuarios_codigo" UNIQUE ("codigo")`);

    await queryRunner.query(`
      INSERT INTO "permisos" ("key", "module", "action", "description")
      VALUES ('users.delete', 'users', 'delete', 'Eliminar usuarios sin operaciones asociadas')
      ON CONFLICT ("key") DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
      SELECT role.id, permission.id
        FROM "roles" role
        JOIN "permisos" permission ON permission."key" = 'users.delete'
       WHERE role."name" = 'ADMINISTRADOR'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "roles_permisos" WHERE "permiso_id" IN (SELECT "id" FROM "permisos" WHERE "key" = 'users.delete')`);
    await queryRunner.query(`DELETE FROM "permisos" WHERE "key" = 'users.delete'`);
    await queryRunner.query(`ALTER TABLE "usuarios" DROP CONSTRAINT "uq_usuarios_codigo"`);
    await queryRunner.query(`ALTER TABLE "usuarios" DROP COLUMN "codigo"`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS "usuarios_codigo_seq"`);
  }
}
