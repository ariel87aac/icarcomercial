import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixStockRequestDetailDeleteRule1720000033000 implements MigrationInterface {
  name = 'FixStockRequestDetailDeleteRule1720000033000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ DECLARE constraint_name text;
      BEGIN
        SELECT constraint_info.conname INTO constraint_name
          FROM pg_constraint constraint_info
          JOIN pg_class table_info ON table_info.oid = constraint_info.conrelid
          JOIN pg_attribute column_info
            ON column_info.attrelid = table_info.oid
           AND column_info.attnum = ANY(constraint_info.conkey)
         WHERE table_info.relname = 'consolidaciones_detalle'
           AND column_info.attname = 'solicitud_abastecimiento_detalle_id'
           AND constraint_info.contype = 'f'
         LIMIT 1;
        IF constraint_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE consolidaciones_detalle DROP CONSTRAINT %I', constraint_name);
        END IF;
      END $$
    `);
    await queryRunner.query(`
      ALTER TABLE "consolidaciones_detalle"
      ADD CONSTRAINT "fk_consolidado_solicitud_abastecimiento_detalle"
      FOREIGN KEY ("solicitud_abastecimiento_detalle_id")
      REFERENCES "solicitudes_abastecimiento_detalle"("id")
      ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "consolidaciones_detalle" DROP CONSTRAINT "fk_consolidado_solicitud_abastecimiento_detalle"`);
    await queryRunner.query(`
      ALTER TABLE "consolidaciones_detalle"
      ADD CONSTRAINT "fk_consolidado_solicitud_abastecimiento_detalle"
      FOREIGN KEY ("solicitud_abastecimiento_detalle_id")
      REFERENCES "solicitudes_abastecimiento_detalle"("id")
      ON DELETE RESTRICT
    `);
  }
}
