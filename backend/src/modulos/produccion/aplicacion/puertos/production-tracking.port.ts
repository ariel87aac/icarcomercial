export abstract class ProductionTrackingPort {
  abstract refreshStock(sourceEvent: string): Promise<void>;
}
