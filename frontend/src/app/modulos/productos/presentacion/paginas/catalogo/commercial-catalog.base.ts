import { HttpClient } from '@angular/common/http';
import { inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../../../../nucleo/autenticacion/auth.service';
import { CartService } from '../../../../pedidos/carrito/cart.service';
import { CommercialCatalogProduct, Customer, DeliveryOption } from '../../../../../compartido/modelos';

import { Directive } from '@angular/core';
import { CommercialCatalogContratos01 } from './commercial-catalog.contratos-01';

@Directive()
export abstract class CommercialCatalogBase extends CommercialCatalogContratos01 {
protected readonly http = inject(HttpClient);

  protected readonly fb = inject(FormBuilder);

  protected readonly messages = inject(MessageService);

  protected readonly auth = inject(AuthService);

  protected readonly cart = inject(CartService);

  protected readonly products = signal<CommercialCatalogProduct[]>([]);

  protected readonly customers = signal<Customer[]>([]);

  protected readonly customerId = signal<string | null>(null);

  protected readonly search = signal('');

  protected readonly categoryId = signal<string | null>(null);

  protected readonly productLineId = signal<string | null>(null);

  protected readonly productId = signal<string | null>(null);

  protected readonly loading = signal(false);

  protected readonly saving = signal(false);

  protected readonly loadingDates = signal(false);

  protected readonly draftLoading = signal(false);

  protected readonly deliveryOptions = signal<DeliveryOption[]>([]);

  protected readonly now = signal(new Date().toISOString());

  protected readonly productDialog = signal(false);

  protected readonly cartDialog = signal(false);

  protected readonly cutoffDialog = signal(false);

  protected readonly closedDeliveryDate = signal('');

  protected readonly settingsDialog = signal(false);

  protected readonly savingSettings = signal(false);

  protected readonly selectedProduct = signal<CommercialCatalogProduct | null>(null);

  protected readonly selectedPresentationId = signal<string | null>(null);

  protected readonly productQuantity = signal(1);

  protected readonly checkoutForm = this.fb.nonNullable.group({
      addressId: ['', Validators.required],
      requestedDate: ['', Validators.required],
      observations: [''],
    });

  protected readonly settingsForm = this.fb.nonNullable.group({
      orderCutoffTime: ['13:00', Validators.required],
      orderCutoffLeadDays: [1, [Validators.required, Validators.min(0), Validators.max(30)]],
      consolidationDeadlineTime: ['18:00', Validators.required],
      preparationLeadDays: [1, [Validators.required, Validators.min(0), Validators.max(30)]],
    });
}
