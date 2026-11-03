export interface ProductionActor {
  id: string;
  roles: readonly string[];
  permissions: readonly string[];
  productionAreaIds: string[];
}
