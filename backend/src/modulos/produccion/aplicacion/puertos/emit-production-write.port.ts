import type { ProductionActor } from '../production-actor';
export abstract class EmitProductionWritePort {
  abstract emit(id: string, actor: ProductionActor): Promise<void>;
}
