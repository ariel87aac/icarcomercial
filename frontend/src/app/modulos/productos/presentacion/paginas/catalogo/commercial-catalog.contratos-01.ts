import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { AuthService } from '../../../../../nucleo/autenticacion/auth.service';
import { CartService } from '../../../../pedidos/carrito/cart.service';
import {
  CommercialCatalogPresentation,
  CommercialCatalogProduct,
  Customer,
  CustomerAddress,
  DeliveryOption,
  OrderScheduleSettings,
  Paginated,
} from '../../../../../compartido/modelos';

import { Directive } from '@angular/core';

@Directive()
export abstract class CommercialCatalogContratos01 {
  abstract ngOnInit(): void;

  protected abstract changeCustomer(id: string | null, picker?: {
      writeValue(value: string | null): void;
  }): void;

  protected abstract categoryOptions(): {
      label: string;
      value: string;
  }[];

  protected abstract lineOptions(): {
      label: string;
      value: string;
  }[];

  protected abstract productOptions(): {
      label: string;
      value: string;
  }[];

  protected abstract filteredProducts(): CommercialCatalogProduct[];

  protected abstract changeCategory(id: string | null): void;

  protected abstract changeLine(id: string | null): void;

  protected abstract clearFilters(): void;

  protected abstract load(): void;

  protected abstract currentCustomer(): Customer | undefined;

  protected abstract lowestPrice(product: CommercialCatalogProduct): number | null;

  protected abstract money(value: number): string;

  protected abstract pricedPresentations(product: CommercialCatalogProduct): {
      label: string;
      value: string;
  }[];

  protected abstract selectedPresentation(product: CommercialCatalogProduct): CommercialCatalogPresentation | undefined;

  protected abstract openProduct(product: CommercialCatalogProduct): void;

  protected abstract quickAdd(product: CommercialCatalogProduct, presentation: CommercialCatalogPresentation, event: Event): void;

  protected abstract addSelected(): void;

  protected abstract openCart(): void;

  protected abstract addressOptions(): {
      label: string;
      value: string;
  }[];

  protected abstract onAddressChange(): void;

  protected abstract deliveryOptionItems(): {
      label: string;
      value: string;
  }[];

  protected abstract currentDeliveryOption(): DeliveryOption | undefined;

  protected abstract formatDate(value: string): string;

  protected abstract formatDateTime(value: string): string;

  protected abstract openScheduleSettings(): void;

  protected abstract saveScheduleSettings(): void;

  protected abstract checkout(): void;

  protected abstract useNextAvailableDate(): void;

  protected abstract cancelClosedCart(): void;

  protected abstract activateCustomer(id: string): void;

  protected abstract uniqueOptions(options: {
      label: string;
      value: string;
  }[]): {
      label: string;
      value: string;
  }[];

  protected abstract prepareCheckout(): void;

  protected abstract currentAddress(): CustomerAddress | undefined;

  protected abstract loadDeliveryOptions(): void;

  protected abstract requireCustomer(): boolean;

  protected abstract fail(error: unknown): void;

  protected abstract handleCheckoutError(error: unknown): void;

  protected abstract error(error: unknown): string;
}
