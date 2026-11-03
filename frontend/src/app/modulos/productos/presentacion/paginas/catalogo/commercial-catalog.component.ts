import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
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
