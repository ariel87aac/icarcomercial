import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ProductionTrackingParte01 } from './production-tracking.01-ngOnInit';

@Component({
  selector: "app-production-tracking",
  standalone: true,
  imports: [
    FormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    MultiSelectModule,
    TableModule,
    TagModule,
  ],
  templateUrl: "./production-tracking.component.html",
  styleUrls: [
    "./production-tracking.estructura.css",
    "./production-tracking.detalle.css",
    "./production-tracking.resumen.css",
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductionTrackingComponent extends ProductionTrackingParte01 {}
