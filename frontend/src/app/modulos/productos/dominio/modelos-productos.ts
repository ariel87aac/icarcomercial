import type { CustomerType, RecordStatus } from '../../../compartido/modelos-base';

export interface ProductCategory {
  id: string;
  code: number;
  name: string;
  status: RecordStatus;
}

export interface ProductLine {
  id: string;
  code: number;
  name: string;
  status: RecordStatus;
}

export interface UnitMeasure {
  id: string;
  code: number;
  name: string;
  abbreviation: string;
  decimalScale: number;
  kilogramFactor: string | null;
  status: RecordStatus;
}

export interface ProductPresentation {
  id: string;
  productId: string;
  unitId: string;
  unit: UnitMeasure;
  description: string;
  conversionFactor: string;
  weightKg: string | null;
  status: RecordStatus;
  product?: Product;
}

export interface Product {
  id: string;
  code: number;
  name: string;
  imageUrl: string | null;
  imageMime: string | null;
  categoryId: string;
  category: ProductCategory;
  productLineId: string;
  productLine: ProductLine;
  baseUnitId: string;
  baseUnit: UnitMeasure;
  status: RecordStatus;
  presentations: ProductPresentation[];
}

export interface ProductPrice {
  id: string;
  presentationId: string;
  presentation?: ProductPresentation;
  customerType: CustomerType;
  amount: string;
  validFrom: string;
  validUntil: string | null;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PriceMatrixRow {
  presentationId: string;
  productCode: number;
  productName: string;
  categoryId: string;
  categoryName: string;
  presentationDescription: string;
  prices: Record<CustomerType, string | null>;
  lastModifiedAt: string | null;
}

export interface CommercialCatalogPresentation {
  id: string;
  description: string;
  conversionFactor: string;
  unit: UnitMeasure;
  price: ProductPrice | null;
}

export interface CommercialCatalogProduct {
  id: string;
  code: number;
  name: string;
  imageUrl: string | null;
  category: ProductCategory;
  productLine: ProductLine;
  baseUnit: UnitMeasure;
  presentations: CommercialCatalogPresentation[];
}
