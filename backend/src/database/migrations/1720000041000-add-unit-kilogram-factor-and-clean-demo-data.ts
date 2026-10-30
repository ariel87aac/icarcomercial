import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUnitKilogramFactorAndCleanDemoData1720000041000 implements MigrationInterface {
  name = 'AddUnitKilogramFactorAndCleanDemoData1720000041000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "unidades_medida"
      ADD COLUMN IF NOT EXISTS "factor_kg" numeric(14,6)
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
            FROM pg_constraint
           WHERE conname = 'unidades_medida_factor_kg_check'
        ) THEN
          ALTER TABLE "unidades_medida"
          ADD CONSTRAINT "unidades_medida_factor_kg_check"
          CHECK ("factor_kg" IS NULL OR "factor_kg" > 0);
        END IF;
      END $$
    `);
    await queryRunner.query(`
      UPDATE "unidades_medida"
         SET "factor_kg" = 1
       WHERE lower("nombre") LIKE 'kilogramo%'
         AND "factor_kg" IS NULL
    `);

    await queryRunner.query(`
      DO $$
      DECLARE
        source_unit record;
        target_unit_id uuid;
        clean_name varchar;
        clean_abbreviation varchar;
      BEGIN
        FOR source_unit IN
          SELECT "id", "nombre", "abreviatura"
            FROM "unidades_medida"
           WHERE "nombre" ILIKE '%[DEMO]%'
           ORDER BY "codigo"
        LOOP
          clean_name := btrim(replace(source_unit."nombre", '[DEMO]', ''));
          clean_abbreviation := CASE
            WHEN source_unit."abreviatura" LIKE 'd-%' THEN substring(source_unit."abreviatura" FROM 3)
            ELSE replace(source_unit."abreviatura", '[DEMO]', '')
          END;

          SELECT "id"
            INTO target_unit_id
            FROM "unidades_medida"
           WHERE "id" <> source_unit."id"
             AND lower("nombre") = lower(clean_name)
           ORDER BY "codigo"
           LIMIT 1;

          IF target_unit_id IS NOT NULL THEN
            UPDATE "productos"
               SET "unidad_base_id" = target_unit_id
             WHERE "unidad_base_id" = source_unit."id";
            UPDATE "presentaciones_producto"
               SET "unidad_id" = target_unit_id
             WHERE "unidad_id" = source_unit."id";
            UPDATE "consolidaciones_detalle"
               SET "unidad_base_id" = target_unit_id
             WHERE "unidad_base_id" = source_unit."id";
            DELETE FROM "unidades_medida" WHERE "id" = source_unit."id";
          ELSE
            UPDATE "unidades_medida"
               SET "nombre" = clean_name,
                   "abreviatura" = CASE
                     WHEN EXISTS (
                       SELECT 1
                         FROM "unidades_medida" other
                        WHERE other."id" <> source_unit."id"
                          AND lower(other."abreviatura") = lower(clean_abbreviation)
                     ) THEN source_unit."abreviatura"
                     ELSE clean_abbreviation
                   END
             WHERE "id" = source_unit."id";
          END IF;

          target_unit_id := NULL;
        END LOOP;
      END $$
    `);

    await queryRunner.query(`
      DO $$
      DECLARE
        source_line record;
        target_line_id uuid;
        clean_name varchar;
      BEGIN
        FOR source_line IN
          SELECT "id", "nombre"
            FROM "lineas_productivas"
           WHERE "nombre" ILIKE '%[DEMO]%'
           ORDER BY "codigo"
        LOOP
          clean_name := btrim(replace(source_line."nombre", '[DEMO]', ''));
          SELECT "id"
            INTO target_line_id
            FROM "lineas_productivas"
           WHERE "id" <> source_line."id"
             AND lower("nombre") = lower(clean_name)
           ORDER BY "codigo"
           LIMIT 1;

          IF target_line_id IS NOT NULL THEN
            UPDATE "productos"
               SET "linea_productiva_id" = target_line_id
             WHERE "linea_productiva_id" = source_line."id";
            UPDATE "consolidaciones_detalle"
               SET "linea_productiva_id" = target_line_id
             WHERE "linea_productiva_id" = source_line."id";
            DELETE FROM "lineas_productivas" WHERE "id" = source_line."id";
          ELSE
            UPDATE "lineas_productivas"
               SET "nombre" = clean_name
             WHERE "id" = source_line."id";
          END IF;

          target_line_id := NULL;
        END LOOP;
      END $$
    `);

    await queryRunner.query(`
      UPDATE "productos"
         SET "nombre" = btrim(replace("nombre", '[DEMO]', ''))
       WHERE "nombre" ILIKE '%[DEMO]%'
    `);
    await queryRunner.query(`
      UPDATE "presentaciones_producto"
         SET "descripcion" = btrim(replace("descripcion", '[DEMO]', ''))
       WHERE "descripcion" ILIKE '%[DEMO]%'
    `);
    await queryRunner.query(`
      UPDATE "pedidos_detalle"
         SET "producto_descripcion_copia" = btrim(replace("producto_descripcion_copia", '[DEMO]', '')),
             "presentacion_descripcion_copia" = btrim(replace("presentacion_descripcion_copia", '[DEMO]', ''))
       WHERE "producto_descripcion_copia" ILIKE '%[DEMO]%'
          OR "presentacion_descripcion_copia" ILIKE '%[DEMO]%'
    `);

    await queryRunner.query(`
      WITH explicit_weight AS (
        SELECT presentation."id",
               CASE
                 WHEN presentation."descripcion" ~* '([0-9]+([.,][0-9]+)?)[[:space:]]*kg([^a-z]|$)'
                   THEN replace((regexp_match(presentation."descripcion", '([0-9]+([.,][0-9]+)?)[[:space:]]*kg([^a-z]|$)', 'i'))[1], ',', '.')::numeric
                 WHEN presentation."descripcion" ~* '([0-9]+([.,][0-9]+)?)[[:space:]]*g([^a-z]|$)'
                   THEN replace((regexp_match(presentation."descripcion", '([0-9]+([.,][0-9]+)?)[[:space:]]*g([^a-z]|$)', 'i'))[1], ',', '.')::numeric / 1000
               END AS inferred_kg
          FROM "presentaciones_producto" presentation
      )
      UPDATE "presentaciones_producto" presentation
         SET "peso_kg" = explicit_weight.inferred_kg,
             "updated_at" = now()
        FROM explicit_weight
       WHERE presentation."id" = explicit_weight."id"
         AND explicit_weight.inferred_kg IS NOT NULL
         AND (
           presentation."peso_kg" IS NULL
           OR abs(presentation."peso_kg" - explicit_weight.inferred_kg) > 0.000001
         )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "unidades_medida"
      DROP CONSTRAINT IF EXISTS "unidades_medida_factor_kg_check"
    `);
    await queryRunner.query(`
      ALTER TABLE "unidades_medida"
      DROP COLUMN IF EXISTS "factor_kg"
    `);
  }
}
