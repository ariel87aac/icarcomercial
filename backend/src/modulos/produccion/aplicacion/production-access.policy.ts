import { ProductionError } from '../dominio/production-error';
import type { ProductionActor } from './production-actor';

export class ProductionAccessPolicy {
  isRequirementsOnly(actor: ProductionActor): boolean {
    return (
      actor.permissions.includes('production.requirements.read') &&
      !actor.permissions.includes('production.consolidations.create') &&
      !actor.permissions.includes('production.plan.adjust')
    );
  }

  productionAreaScope(actor: ProductionActor): string[] | null {
    if (!actor.roles.includes('PRODUCCION') || actor.roles.includes('ADMINISTRADOR')) return null;
    return actor.productionAreaIds ?? [];
  }

  assertProductionAreaAccess(actor: ProductionActor, productionAreaId: string | null): void {
    const areaIds = this.productionAreaScope(actor);
    if (areaIds === null) return;
    if (!productionAreaId || !areaIds.includes(productionAreaId)) {
      throw new ProductionError('forbidden', 'El producto no pertenece a un área de Producción asignada al usuario');
    }
  }

  assertWholeOrderAccess(actor: ProductionActor, details: ReadonlyArray<{ productionAreaId: string | null }>): void {
    const areaIds = this.productionAreaScope(actor);
    if (areaIds === null) return;
    if (details.some((detail) => !detail.productionAreaId || !areaIds.includes(detail.productionAreaId))) {
      throw new ProductionError(
        'forbidden',
        'Para cancelar o cerrar toda la orden debe tener asignadas todas sus áreas de Producción',
      );
    }
  }

  requiredReason(value: string): string {
    const reason = value?.trim();
    if (!reason || reason.length < 5) {
      throw new ProductionError('invalid', 'Debe registrar una observación de al menos 5 caracteres');
    }
    return reason;
  }

  earliestPreparation(details: ReadonlyArray<{ order: { preparationAt: Date } }>): Date {
    const timestamps = details.map((detail) => new Date(detail.order.preparationAt).getTime()).filter(Number.isFinite);
    if (!timestamps.length)
      throw new ProductionError('inconsistent', 'Los pedidos no tienen una fecha límite de preparación válida');
    return new Date(Math.min(...timestamps));
  }
}
