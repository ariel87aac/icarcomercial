import { MigrationInterface, QueryRunner } from 'typeorm';

export class NormalizeStockRequestCodes1720000037000 implements MigrationInterface {
  name = 'NormalizeStockRequestCodes1720000037000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`LOCK TABLE "solicitudes_abastecimiento" IN ACCESS EXCLUSIVE MODE`);
    await queryRunner.query(`
      WITH ordered_requests AS (
        SELECT "id", row_number() OVER (ORDER BY "created_at" ASC, "id" ASC)::integer AS new_code
          FROM "solicitudes_abastecimiento"
      )
      UPDATE "solicitudes_abastecimiento" AS request
         SET "codigo" = -ordered_requests.new_code
        FROM ordered_requests
       WHERE request."id" = ordered_requests."id"
    `);
    await queryRunner.query(`UPDATE "solicitudes_abastecimiento" SET "codigo" = -"codigo" WHERE "codigo" < 0`);
    await queryRunner.query(`
      SELECT setval(
        pg_get_serial_sequence('solicitudes_abastecimiento', 'codigo'),
        COALESCE(MAX("codigo"), 1),
        COUNT(*) > 0
      )
      FROM "solicitudes_abastecimiento"
    `);
    await queryRunner.query(`
      ALTER TABLE "solicitudes_abastecimiento"
      ADD CONSTRAINT "ck_solicitudes_abastecimiento_codigo_positivo" CHECK ("codigo" > 0)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "solicitudes_abastecimiento"
      DROP CONSTRAINT IF EXISTS "ck_solicitudes_abastecimiento_codigo_positivo"
    `);
    await queryRunner.query(`
      SELECT setval(
        pg_get_serial_sequence('solicitudes_abastecimiento', 'codigo'),
        COALESCE(MAX("codigo"), 1),
        COUNT(*) > 0
      )
      FROM "solicitudes_abastecimiento"
    `);
  }
}
