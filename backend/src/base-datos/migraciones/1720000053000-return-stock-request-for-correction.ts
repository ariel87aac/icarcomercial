import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReturnStockRequestForCorrection1720000053000 implements MigrationInterface {
  name = 'ReturnStockRequestForCorrection1720000053000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "solicitudes_abastecimiento" DROP CONSTRAINT "ck_solicitud_abastecimiento_flujo"`);
    await queryRunner.query(`
      ALTER TABLE "solicitudes_abastecimiento"
      ADD COLUMN "devuelto_por" uuid REFERENCES "usuarios"("id") ON DELETE RESTRICT,
      ADD COLUMN "devuelto_at" timestamptz,
      ADD COLUMN "motivo_devolucion" varchar(1000)
    `);
    await queryRunner.query(`
      ALTER TABLE "solicitudes_abastecimiento" ADD CONSTRAINT "ck_solicitud_abastecimiento_flujo" CHECK (
        ("estado" = 'BORRADOR' AND "enviado_at" IS NULL AND "enviado_por" IS NULL AND "consolidacion_produccion_id" IS NULL AND "programado_at" IS NULL AND "cerrado_at" IS NULL
          AND (("devuelto_at" IS NULL AND "devuelto_por" IS NULL AND "motivo_devolucion" IS NULL)
            OR ("devuelto_at" IS NOT NULL AND "devuelto_por" IS NOT NULL AND length(trim("motivo_devolucion")) >= 5)))
        OR ("estado" = 'ENVIADA' AND "enviado_at" IS NOT NULL AND "enviado_por" IS NOT NULL AND "consolidacion_produccion_id" IS NULL AND "programado_at" IS NULL AND "cerrado_at" IS NULL)
        OR ("estado" = 'PROGRAMADA' AND "enviado_at" IS NOT NULL AND "enviado_por" IS NOT NULL AND "consolidacion_produccion_id" IS NOT NULL AND "programado_at" IS NOT NULL AND "cerrado_at" IS NULL)
        OR ("estado" = 'CERRADA' AND "enviado_at" IS NOT NULL AND "enviado_por" IS NOT NULL AND "consolidacion_produccion_id" IS NOT NULL AND "programado_at" IS NOT NULL AND "cerrado_at" IS NOT NULL)
        OR ("estado" = 'CERRADA_INCOMPLETA' AND "enviado_at" IS NOT NULL AND "enviado_por" IS NOT NULL AND "consolidacion_produccion_id" IS NOT NULL AND "programado_at" IS NOT NULL AND "cerrado_at" IS NOT NULL AND "cerrado_por" IS NOT NULL AND length(trim("observacion_cierre")) >= 5)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "solicitudes_abastecimiento" DROP CONSTRAINT "ck_solicitud_abastecimiento_flujo"`);
    await queryRunner.query(`ALTER TABLE "solicitudes_abastecimiento" DROP COLUMN "motivo_devolucion", DROP COLUMN "devuelto_at", DROP COLUMN "devuelto_por"`);
    await queryRunner.query(`
      ALTER TABLE "solicitudes_abastecimiento" ADD CONSTRAINT "ck_solicitud_abastecimiento_flujo" CHECK (
        ("estado" = 'BORRADOR' AND "enviado_at" IS NULL AND "enviado_por" IS NULL AND "consolidacion_produccion_id" IS NULL AND "programado_at" IS NULL AND "cerrado_at" IS NULL)
        OR ("estado" = 'ENVIADA' AND "enviado_at" IS NOT NULL AND "enviado_por" IS NOT NULL AND "consolidacion_produccion_id" IS NULL AND "programado_at" IS NULL AND "cerrado_at" IS NULL)
        OR ("estado" = 'PROGRAMADA' AND "enviado_at" IS NOT NULL AND "enviado_por" IS NOT NULL AND "consolidacion_produccion_id" IS NOT NULL AND "programado_at" IS NOT NULL AND "cerrado_at" IS NULL)
        OR ("estado" = 'CERRADA' AND "enviado_at" IS NOT NULL AND "enviado_por" IS NOT NULL AND "consolidacion_produccion_id" IS NOT NULL AND "programado_at" IS NOT NULL AND "cerrado_at" IS NOT NULL)
        OR ("estado" = 'CERRADA_INCOMPLETA' AND "enviado_at" IS NOT NULL AND "enviado_por" IS NOT NULL AND "consolidacion_produccion_id" IS NOT NULL AND "programado_at" IS NOT NULL AND "cerrado_at" IS NOT NULL AND "cerrado_por" IS NOT NULL AND length(trim("observacion_cierre")) >= 5)
      )
    `);
  }
}
