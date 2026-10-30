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
import { CommercialCatalogParte01 } from './commercial-catalog.01-ngOnInit';

@Component({
  selector: 'app-commercial-catalog',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, ButtonModule, DialogModule, InputNumberModule, InputTextModule, SelectModule, TextareaModule],
  templateUrl: './commercial-catalog.component.html',
  styleUrl: './commercial-catalog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommercialCatalogComponent extends CommercialCatalogParte01 {}
