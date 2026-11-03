import { MigrationInterface, QueryRunner } from 'typeorm';

export class NormalizePrimaryCustomerAddress1720000055000 implements MigrationInterface {
  name = 'NormalizePrimaryCustomerAddress1720000055000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "domicilios_cliente"
         SET "es_principal" = false,
             "updated_at" = now()
       WHERE "status" = 'INACTIVO'
         AND "es_principal" = true
    `);
    await queryRunner.query(`
      WITH candidates AS (
        SELECT address."id",
               row_number() OVER (
                 PARTITION BY address."cliente_id"
                 ORDER BY address."created_at", address."id"
               ) AS position
          FROM "domicilios_cliente" address
         WHERE address."status" = 'ACTIVO'
           AND NOT EXISTS (
             SELECT 1
               FROM "domicilios_cliente" primary_address
              WHERE primary_address."cliente_id" = address."cliente_id"
                AND primary_address."status" = 'ACTIVO'
                AND primary_address."es_principal" = true
           )
      )
      UPDATE "domicilios_cliente" address
         SET "es_principal" = true,
             "updated_at" = now()
        FROM candidates
       WHERE address."id" = candidates."id"
         AND candidates.position = 1
    `);
  }

  public async down(): Promise<void> {
    // La normalización no puede reconstruir con seguridad el valor anterior.
  }
}
