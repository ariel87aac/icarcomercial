import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConsolidationDeadline1720000013000 implements MigrationInterface {
  name = 'AddConsolidationDeadline1720000013000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "consolidaciones_produccion" ADD COLUMN "fecha_limite_preparacion" timestamptz`);
    await queryRunner.query(`
      UPDATE "consolidaciones_produccion" consolidation
         SET "fecha_limite_preparacion" = COALESCE(
           (SELECT MIN(orders."fecha_preparacion")
              FROM "consolidaciones_detalle" detail
              JOIN "consolidaciones_origen" source ON source."detalle_consolidado_id" = detail.id
              JOIN "pedidos_detalle" order_detail ON order_detail.id = source."detalle_pedido_id"
              JOIN "pedidos" orders ON orders.id = order_detail."pedido_id"
             WHERE detail."consolidacion_id" = consolidation.id),
           ((consolidation."fecha_entrega" - 1)::date + time '18:00') AT TIME ZONE 'America/La_Paz'
         )
    `);
    await queryRunner.query(`ALTER TABLE "consolidaciones_produccion" ALTER COLUMN "fecha_limite_preparacion" SET NOT NULL`);
    await queryRunner.query(`CREATE INDEX "idx_consolidaciones_fecha_limite" ON "consolidaciones_produccion" ("fecha_limite_preparacion", "estado")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_consolidaciones_fecha_limite"`);
    await queryRunner.query(`ALTER TABLE "consolidaciones_produccion" DROP COLUMN "fecha_limite_preparacion"`);
  }
}
