import { MigrationInterface, QueryRunner } from 'typeorm';

export class UnifyCustomerTypesAndPrices1720000018000 implements MigrationInterface {
  name = 'UnifyCustomerTypesAndPrices1720000018000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const unsupported: Array<{ value: string }> = await queryRunner.query(`
      SELECT DISTINCT upper(trim("lista_comercial")) AS value
      FROM "precios_producto"
      WHERE "lista_comercial" IS NOT NULL
        AND upper(trim("lista_comercial")) NOT IN ('PUBLICO', 'MINORISTA', 'DISTRIBUIDOR', 'MAYORISTA')
    `);
    if (unsupported.length) {
      throw new Error(`No se puede eliminar la lista comercial: existen precios con valores no convertibles (${unsupported.map((item) => item.value || '[vacío]').join(', ')})`);
    }

    await queryRunner.query(`ALTER TABLE "precios_producto" DROP CONSTRAINT "ck_precio_condicion"`);
    await queryRunner.query(`DROP INDEX "idx_precios_lista"`);
    await queryRunner.query(`DROP INDEX "idx_clientes_lista_comercial"`);

    await queryRunner.query(`ALTER TABLE "clientes" ALTER COLUMN "tipo_cliente" TYPE varchar USING "tipo_cliente"::text`);
    await queryRunner.query(`ALTER TABLE "precios_producto" ALTER COLUMN "tipo_cliente" TYPE varchar USING "tipo_cliente"::text`);
    await queryRunner.query(`ALTER TABLE "pedidos" ALTER COLUMN "cliente_tipo_copia" TYPE varchar USING "cliente_tipo_copia"::text`);
    await queryRunner.query(`DROP TYPE "tipo_cliente_enum"`);
    await queryRunner.query(`CREATE TYPE "tipo_cliente_enum" AS ENUM ('PUBLICO', 'MINORISTA', 'DISTRIBUIDOR', 'MAYORISTA')`);

    await queryRunner.query(`
      UPDATE "clientes"
      SET "tipo_cliente" = upper(trim("lista_comercial"))
      WHERE upper(trim("lista_comercial")) IN ('PUBLICO', 'MINORISTA', 'DISTRIBUIDOR', 'MAYORISTA')
    `);
    await queryRunner.query(`
      UPDATE "precios_producto"
      SET "tipo_cliente" = upper(trim("lista_comercial"))
      WHERE "lista_comercial" IS NOT NULL
    `);
    await queryRunner.query(`
      UPDATE "pedidos"
      SET "cliente_tipo_copia" = upper(trim("lista_comercial_copia"))
      WHERE upper(trim("lista_comercial_copia")) IN ('PUBLICO', 'MINORISTA', 'DISTRIBUIDOR', 'MAYORISTA')
    `);

    await queryRunner.query(`ALTER TABLE "clientes" ALTER COLUMN "tipo_cliente" TYPE tipo_cliente_enum USING "tipo_cliente"::tipo_cliente_enum`);
    await queryRunner.query(`ALTER TABLE "precios_producto" ALTER COLUMN "tipo_cliente" TYPE tipo_cliente_enum USING "tipo_cliente"::tipo_cliente_enum`);
    await queryRunner.query(`ALTER TABLE "precios_producto" ALTER COLUMN "tipo_cliente" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "pedidos" ALTER COLUMN "cliente_tipo_copia" TYPE tipo_cliente_enum USING "cliente_tipo_copia"::tipo_cliente_enum`);

    await queryRunner.query(`ALTER TABLE "clientes" DROP COLUMN "lista_comercial"`);
    await queryRunner.query(`ALTER TABLE "precios_producto" DROP COLUMN "lista_comercial"`);
    await queryRunner.query(`ALTER TABLE "pedidos" DROP COLUMN "lista_comercial_copia"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "clientes" ADD COLUMN "lista_comercial" varchar(80)`);
    await queryRunner.query(`ALTER TABLE "precios_producto" ADD COLUMN "lista_comercial" varchar(80)`);
    await queryRunner.query(`ALTER TABLE "pedidos" ADD COLUMN "lista_comercial_copia" varchar(80)`);

    await queryRunner.query(`ALTER TABLE "precios_producto" ALTER COLUMN "tipo_cliente" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "clientes" ALTER COLUMN "tipo_cliente" TYPE varchar USING "tipo_cliente"::text`);
    await queryRunner.query(`ALTER TABLE "precios_producto" ALTER COLUMN "tipo_cliente" TYPE varchar USING "tipo_cliente"::text`);
    await queryRunner.query(`ALTER TABLE "pedidos" ALTER COLUMN "cliente_tipo_copia" TYPE varchar USING "cliente_tipo_copia"::text`);

    await queryRunner.query(`UPDATE "clientes" SET "lista_comercial" = 'PUBLICO', "tipo_cliente" = 'MINORISTA' WHERE "tipo_cliente" = 'PUBLICO'`);
    await queryRunner.query(`UPDATE "precios_producto" SET "lista_comercial" = 'PUBLICO', "tipo_cliente" = NULL WHERE "tipo_cliente" = 'PUBLICO'`);
    await queryRunner.query(`UPDATE "pedidos" SET "lista_comercial_copia" = 'PUBLICO', "cliente_tipo_copia" = 'MINORISTA' WHERE "cliente_tipo_copia" = 'PUBLICO'`);

    await queryRunner.query(`DROP TYPE "tipo_cliente_enum"`);
    await queryRunner.query(`CREATE TYPE "tipo_cliente_enum" AS ENUM ('MINORISTA', 'DISTRIBUIDOR', 'MAYORISTA')`);
    await queryRunner.query(`ALTER TABLE "clientes" ALTER COLUMN "tipo_cliente" TYPE tipo_cliente_enum USING "tipo_cliente"::tipo_cliente_enum`);
    await queryRunner.query(`ALTER TABLE "precios_producto" ALTER COLUMN "tipo_cliente" TYPE tipo_cliente_enum USING "tipo_cliente"::tipo_cliente_enum`);
    await queryRunner.query(`ALTER TABLE "pedidos" ALTER COLUMN "cliente_tipo_copia" TYPE tipo_cliente_enum USING "cliente_tipo_copia"::tipo_cliente_enum`);

    await queryRunner.query(`ALTER TABLE "precios_producto" ADD CONSTRAINT "ck_precio_condicion" CHECK (("tipo_cliente" IS NOT NULL) <> ("lista_comercial" IS NOT NULL))`);
    await queryRunner.query(`CREATE INDEX "idx_precios_lista" ON "precios_producto" ("presentacion_id", lower("lista_comercial")) WHERE "lista_comercial" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX "idx_clientes_lista_comercial" ON "clientes" (lower("lista_comercial")) WHERE "lista_comercial" IS NOT NULL`);
  }
}
