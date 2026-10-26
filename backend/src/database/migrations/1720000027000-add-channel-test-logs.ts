import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChannelTestLogs1720000027000 implements MigrationInterface {
  name = 'AddChannelTestLogs1720000027000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "registros_prueba_canal" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "canal_id" uuid REFERENCES "configuraciones_canal"("id") ON DELETE SET NULL,
        "probado_por" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "destinatario_enmascarado" varchar(30) NOT NULL,
        "resultado" varchar(10) NOT NULL CHECK ("resultado" IN ('EXITOSO', 'ERROR')),
        "codigo_http" integer,
        "duracion_ms" integer NOT NULL CHECK ("duracion_ms" >= 0),
        "proveedor_mensaje_id" varchar(160),
        "respuesta_sanitizada" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "error" varchar(500),
        "fecha_hora" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_registros_prueba_canal_fecha" ON "registros_prueba_canal" ("fecha_hora" DESC)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "registros_prueba_canal"`);
  }
}
