export type ProductionErrorKind = 'invalid' | 'forbidden' | 'missing' | 'conflict' | 'inconsistent';

export class ProductionError extends Error {
  constructor(
    readonly kind: ProductionErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'ProductionError';
  }
}
