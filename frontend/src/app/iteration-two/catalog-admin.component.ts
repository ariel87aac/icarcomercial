import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import {
  CustomerType,
  Paginated,
  Product,
  ProductCategory,
  ProductLine,
  ProductPresentation,
  ProductPrice,
  RecordStatus,
  UnitMeasure,
} from '../core/models';

type CatalogView = 'products' | 'categories' | 'lines' | 'units' | 'prices';
type MasterKind = 'category' | 'line' | 'unit';

@Component({
  selector: 'app-catalog-admin',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, NgTemplateOutlet, ButtonModule, DialogModule, InputNumberModule, InputTextModule, SelectModule, TableModule, TagModule],
  template: `
    <div class="page-toolbar"><div><span class="eyebrow">Datos maestros</span><h2>Catálogo y precios</h2><p>Categorías, líneas, unidades, productos, presentaciones y vigencias comerciales.</p></div>
      @if (view() === 'products') { <p-button label="Nuevo producto" icon="pi pi-plus" (onClick)="openProduct()" /> }
      @if (view() === 'categories') { <p-button label="Nueva categoría" icon="pi pi-plus" (onClick)="openMaster('category')" /> }
      @if (view() === 'lines') { <p-button label="Nueva línea" icon="pi pi-plus" (onClick)="openMaster('line')" /> }
      @if (view() === 'units') { <p-button label="Nueva unidad" icon="pi pi-plus" (onClick)="openMaster('unit')" /> }
    </div>
    <div class="subnav">@for (item of views; track item.value) { <button type="button" [class.active]="view() === item.value" (click)="view.set(item.value)"><i [class]="item.icon"></i>{{ item.label }}</button> }</div>

    @if (view() === 'products') {
      <div class="table-card"><p-table [value]="products()" [loading]="loading()" [scrollable]="true"><ng-template #header><tr><th>Producto</th><th>Categoría</th><th>Línea</th><th>Unidad base</th><th>Presentaciones</th><th>Estado</th><th>Acciones</th></tr></ng-template><ng-template #body let-product><tr><td><div class="stack"><strong>{{ product.name }}</strong><small>{{ product.code }}</small></div></td><td>{{ product.category.name }}</td><td>{{ product.productLine.name }}</td><td>{{ product.baseUnit.abbreviation }}</td><td><div class="presentation-chips">@for (presentation of product.presentations; track presentation.id) { <button type="button" (click)="openPresentation(product, presentation)">{{ presentation.description }} · {{ presentation.unit.abbreviation }}</button> } @empty { <span>Sin presentaciones</span> }<button type="button" class="add-chip" (click)="openPresentation(product)"><i class="pi pi-plus"></i> Agregar</button></div></td><td><p-tag [severity]="severity(product.status)" [value]="product.status" /></td><td><p-button icon="pi pi-pencil" [text]="true" [rounded]="true" (onClick)="openProduct(product)" /></td></tr></ng-template></p-table></div>
    }
    @if (view() === 'categories') { <ng-container *ngTemplateOutlet="masterTable; context: { $implicit: categories(), kind: 'category', label: 'Categoría' }" /> }
    @if (view() === 'lines') { <ng-container *ngTemplateOutlet="masterTable; context: { $implicit: lines(), kind: 'line', label: 'Línea productiva' }" /> }
    @if (view() === 'units') {
      <div class="table-card"><p-table [value]="units()"><ng-template #header><tr><th>Unidad</th><th>Abreviatura</th><th>Precisión decimal</th><th>Estado</th><th>Acciones</th></tr></ng-template><ng-template #body let-unit><tr><td>{{ unit.name }}</td><td><strong>{{ unit.abbreviation }}</strong></td><td>{{ unit.decimalScale }} decimales</td><td><p-tag [severity]="severity(unit.status)" [value]="unit.status" /></td><td><p-button icon="pi pi-pencil" [text]="true" [rounded]="true" (onClick)="openMaster('unit', unit)" /></td></tr></ng-template></p-table></div>
    }
    @if (view() === 'prices') {
      <div class="price-toolbar"><p-select [options]="presentationOptions()" optionLabel="label" optionValue="value" [ngModel]="pricePresentationFilter()" (ngModelChange)="pricePresentationFilter.set($event); loadPrices()" placeholder="Todas las presentaciones" [showClear]="true" [filter]="true" /><p-button label="Nuevo precio" icon="pi pi-plus" [disabled]="!presentationOptions().length" (onClick)="openPrice()" /></div>
      <div class="table-card"><p-table [value]="prices()" [loading]="loading()" [scrollable]="true"><ng-template #header><tr><th>Producto / presentación</th><th>Condición</th><th>Importe</th><th>Vigencia</th><th>Estado</th><th>Acciones</th></tr></ng-template><ng-template #body let-price><tr><td><div class="stack"><strong>{{ price.presentation?.product?.name }}</strong><small>{{ price.presentation?.description }}</small></div></td><td>{{ price.customerType ? customerTypeLabel(price.customerType) : price.commercialList }}</td><td><strong>Bs {{ price.amount }}</strong></td><td>{{ price.validFrom }} — {{ price.validUntil || 'sin límite' }}</td><td><p-tag [severity]="severity(price.status)" [value]="price.status" /></td><td><p-button icon="pi pi-pencil" [text]="true" [rounded]="true" (onClick)="openPrice(price)" /></td></tr></ng-template></p-table></div>
    }

    <ng-template #masterTable let-items let-kind="kind" let-label="label"><div class="table-card"><p-table [value]="items"><ng-template #header><tr><th>{{ label }}</th><th>Estado</th><th>Acciones</th></tr></ng-template><ng-template #body let-item><tr><td><strong>{{ item.name }}</strong></td><td><p-tag [severity]="severity(item.status)" [value]="item.status" /></td><td><p-button icon="pi pi-pencil" [text]="true" [rounded]="true" (onClick)="openMaster(kind, item)" /></td></tr></ng-template></p-table></div></ng-template>

    <p-dialog [visible]="masterDialog()" (visibleChange)="masterDialog.set($event)" [modal]="true" [style]="{width:'min(520px,96vw)'}" [header]="editingMasterId() ? 'Editar registro' : 'Nuevo registro'" [draggable]="false"><form [formGroup]="masterForm" (ngSubmit)="saveMaster()"><div class="form-grid"><label><span>Nombre *</span><input pInputText formControlName="name" /></label>@if (masterKind() === 'unit') { <label><span>Abreviatura *</span><input pInputText formControlName="abbreviation" /></label><label><span>Precisión decimal *</span><p-inputnumber formControlName="decimalScale" [min]="0" [max]="6" [useGrouping]="false" /></label> }@if (editingMasterId()) { <label><span>Estado</span><p-select formControlName="status" [options]="statusOptions" /></label> }</div><div class="dialog-footer"><p-button type="button" label="Cancelar" [text]="true" severity="secondary" (onClick)="masterDialog.set(false)" /><p-button type="submit" label="Guardar" icon="pi pi-check" [loading]="saving()" /></div></form></p-dialog>

    <p-dialog [visible]="productDialog()" (visibleChange)="productDialog.set($event)" [modal]="true" [style]="{width:'min(720px,96vw)'}" [header]="editingProductId() ? 'Editar producto' : 'Nuevo producto'" [draggable]="false"><form [formGroup]="productForm" (ngSubmit)="saveProduct()"><div class="form-grid"><label><span>Código *</span><input pInputText formControlName="code" /></label><label><span>Nombre *</span><input pInputText formControlName="name" /></label><label><span>Categoría *</span><p-select formControlName="categoryId" [options]="activeCategories()" optionLabel="name" optionValue="id" /></label><label><span>Línea productiva *</span><p-select formControlName="productLineId" [options]="activeLines()" optionLabel="name" optionValue="id" /></label><label><span>Unidad base *</span><p-select formControlName="baseUnitId" [options]="activeUnits()" optionLabel="name" optionValue="id" /></label>@if (editingProductId()) { <label><span>Estado</span><p-select formControlName="status" [options]="statusOptions" /></label> }</div><div class="dialog-footer"><p-button type="button" label="Cancelar" [text]="true" severity="secondary" (onClick)="productDialog.set(false)" /><p-button type="submit" label="Guardar producto" icon="pi pi-check" [loading]="saving()" /></div></form></p-dialog>

    <p-dialog [visible]="presentationDialog()" (visibleChange)="presentationDialog.set($event)" [modal]="true" [style]="{width:'min(620px,96vw)'}" [header]="editingPresentationId() ? 'Editar presentación' : 'Nueva presentación'" [draggable]="false"><form [formGroup]="presentationForm" (ngSubmit)="savePresentation()"><p class="intro">Producto: <strong>{{ selectedProduct()?.name }}</strong></p><div class="form-grid"><label><span>Descripción *</span><input pInputText formControlName="description" /></label><label><span>Unidad *</span><p-select formControlName="unitId" [options]="activeUnits()" optionLabel="name" optionValue="id" /></label><label><span>Factor de conversión *</span><p-inputnumber formControlName="conversionFactor" [min]="0.0001" [maxFractionDigits]="4" /></label>@if (editingPresentationId()) { <label><span>Estado</span><p-select formControlName="status" [options]="statusOptions" /></label> }</div><div class="dialog-footer"><p-button type="button" label="Cancelar" [text]="true" severity="secondary" (onClick)="presentationDialog.set(false)" /><p-button type="submit" label="Guardar presentación" icon="pi pi-check" [loading]="saving()" /></div></form></p-dialog>

    <p-dialog [visible]="priceDialog()" (visibleChange)="priceDialog.set($event)" [modal]="true" [style]="{width:'min(680px,96vw)'}" [header]="editingPriceId() ? 'Editar precio' : 'Nuevo precio'" [draggable]="false"><form [formGroup]="priceForm" (ngSubmit)="savePrice()"><div class="form-grid"><label class="full"><span>Presentación *</span><p-select formControlName="presentationId" [options]="presentationOptions()" optionLabel="label" optionValue="value" [filter]="true" /></label><label><span>Condición *</span><p-select formControlName="conditionKind" [options]="conditionOptions" /></label>@if (priceForm.controls.conditionKind.value === 'TIPO') { <label><span>Tipo de cliente *</span><p-select formControlName="customerType" [options]="customerTypeOptions" /></label> } @else { <label><span>Lista comercial *</span><input pInputText formControlName="commercialList" /></label> }<label><span>Importe (Bs) *</span><p-inputnumber formControlName="amount" [min]="0" [minFractionDigits]="2" [maxFractionDigits]="2" /></label><label><span>Vigente desde *</span><input pInputText type="date" formControlName="validFrom" /></label><label><span>Vigente hasta</span><input pInputText type="date" formControlName="validUntil" /></label>@if (editingPriceId()) { <label><span>Estado</span><p-select formControlName="status" [options]="statusOptions" /></label> }</div><div class="dialog-footer"><p-button type="button" label="Cancelar" [text]="true" severity="secondary" (onClick)="priceDialog.set(false)" /><p-button type="submit" label="Guardar precio" icon="pi pi-check" [loading]="saving()" /></div></form></p-dialog>
  `,
  styles: [`
    .page-toolbar{display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;margin-bottom:1rem}.page-toolbar h2{margin:.35rem 0;font-size:clamp(1.8rem,3vw,2.7rem);letter-spacing:-.05em}.page-toolbar p,.intro{margin:0;color:var(--text-muted);font-size:.75rem}.eyebrow{color:var(--accent);font-size:.68rem;font-weight:850;letter-spacing:.14em;text-transform:uppercase}.subnav{display:flex;gap:.4rem;overflow:auto;margin-bottom:1rem;padding:.3rem;border:1px solid var(--surface-border);border-radius:.8rem;background:#fff}.subnav button{display:flex;align-items:center;gap:.45rem;padding:.65rem .8rem;border:0;border-radius:.55rem;color:var(--text-muted);background:transparent;white-space:nowrap;cursor:pointer}.subnav button.active{color:#fff;background:var(--brand-700)}.table-card{overflow:hidden;border:1px solid var(--surface-border);border-radius:1rem;background:#fff}.stack strong,.stack small{display:block}.stack small{margin-top:.2rem;color:var(--text-muted);font-size:.65rem}.presentation-chips{display:flex;flex-wrap:wrap;gap:.3rem;min-width:18rem}.presentation-chips button{padding:.35rem .48rem;border:0;border-radius:.45rem;color:#34566f;background:#eaf3f9;font-size:.63rem;cursor:pointer}.presentation-chips .add-chip{color:var(--brand-700);background:#fff;border:1px dashed #9bc6df}.price-toolbar{display:grid;grid-template-columns:minmax(18rem,.6fr) auto;justify-content:start;gap:.7rem;margin-bottom:1rem}.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;padding-top:.5rem}.form-grid label{display:grid;gap:.4rem}.form-grid label>span{color:#344b61;font-size:.7rem;font-weight:750}.form-grid input{width:100%}.form-grid .full{grid-column:1/-1}.dialog-footer{display:flex;justify-content:flex-end;gap:.5rem;margin-top:1.5rem;padding-top:1rem;border-top:1px solid var(--surface-border)}@media(max-width:700px){.page-toolbar{align-items:flex-start;flex-direction:column}.form-grid,.price-toolbar{grid-template-columns:1fr}.form-grid .full{grid-column:auto}}
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogAdminComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly messages = inject(MessageService);
  protected readonly view = signal<CatalogView>('products');
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly categories = signal<ProductCategory[]>([]);
  protected readonly lines = signal<ProductLine[]>([]);
  protected readonly units = signal<UnitMeasure[]>([]);
  protected readonly products = signal<Product[]>([]);
  protected readonly prices = signal<ProductPrice[]>([]);
  protected readonly pricePresentationFilter = signal<string | null>(null);
  protected readonly masterDialog = signal(false);
  protected readonly productDialog = signal(false);
  protected readonly presentationDialog = signal(false);
  protected readonly priceDialog = signal(false);
  protected readonly masterKind = signal<MasterKind>('category');
  protected readonly editingMasterId = signal<string | null>(null);
  protected readonly editingProductId = signal<string | null>(null);
  protected readonly editingPresentationId = signal<string | null>(null);
  protected readonly editingPriceId = signal<string | null>(null);
  protected readonly selectedProduct = signal<Product | null>(null);
  protected readonly views: {label:string;value:CatalogView;icon:string}[] = [
    { label: 'Productos', value: 'products', icon: 'pi pi-box' }, { label: 'Categorías', value: 'categories', icon: 'pi pi-tags' },
    { label: 'Líneas', value: 'lines', icon: 'pi pi-sitemap' }, { label: 'Unidades', value: 'units', icon: 'pi pi-sliders-h' },
    { label: 'Precios', value: 'prices', icon: 'pi pi-dollar' },
  ];
  protected readonly statusOptions = [{label:'Activo',value:'ACTIVO'},{label:'Inactivo',value:'INACTIVO'}];
  protected readonly customerTypeOptions = [{label:'Minorista',value:'MINORISTA'},{label:'Distribuidor',value:'DISTRIBUIDOR'},{label:'Mayorista',value:'MAYORISTA'}];
  protected readonly conditionOptions = [{label:'Tipo de cliente',value:'TIPO'},{label:'Lista comercial',value:'LISTA'}];
  protected readonly masterForm = this.fb.nonNullable.group({ name:['',[Validators.required,Validators.minLength(2)]], abbreviation:[''], decimalScale:[3,[Validators.required,Validators.min(0),Validators.max(6)]], status:['ACTIVO'] });
  protected readonly productForm = this.fb.nonNullable.group({ code:['',Validators.required],name:['',[Validators.required,Validators.minLength(2)]],categoryId:['',Validators.required],productLineId:['',Validators.required],baseUnitId:['',Validators.required],status:['ACTIVO'] });
  protected readonly presentationForm = this.fb.nonNullable.group({ description:['',[Validators.required,Validators.minLength(2)]],unitId:['',Validators.required],conversionFactor:[1,[Validators.required,Validators.min(.0001)]],status:['ACTIVO'] });
  protected readonly priceForm = this.fb.nonNullable.group({ presentationId:['',Validators.required],conditionKind:['TIPO',Validators.required],customerType:['MINORISTA'],commercialList:[''],amount:[0,[Validators.required,Validators.min(0)]],validFrom:[new Date().toISOString().slice(0,10),Validators.required],validUntil:[''],status:['ACTIVO'] });

  ngOnInit(): void { this.loadAll(); }
  protected activeCategories=()=>this.categories().filter(x=>x.status==='ACTIVO');
  protected activeLines=()=>this.lines().filter(x=>x.status==='ACTIVO');
  protected activeUnits=()=>this.units().filter(x=>x.status==='ACTIVO');
  protected presentationOptions=()=>this.products().flatMap(product=>product.presentations.map(p=>({label:`${product.name} · ${p.description}`,value:p.id}))).sort((a,b)=>a.label.localeCompare(b.label));
  protected severity=(status:RecordStatus):'success'|'danger'=>status==='ACTIVO'?'success':'danger';
  protected customerTypeLabel=(type:CustomerType)=>this.customerTypeOptions.find(x=>x.value===type)?.label??type;

  private loadAll(): void { this.loading.set(true); Promise.all([
    this.get<ProductCategory[]>('/api/categorias'), this.get<ProductLine[]>('/api/lineas-productivas'), this.get<UnitMeasure[]>('/api/unidades'),
    this.get<Paginated<Product>>('/api/productos', new HttpParams().set('limit',100)),
  ]).then(([categories,lines,units,products])=>{this.categories.set(categories);this.lines.set(lines);this.units.set(units);this.products.set(products.data);this.loading.set(false);this.loadPrices();}).catch(e=>this.fail(e)); }
  protected loadPrices(): void { let params=new HttpParams().set('limit',100);if(this.pricePresentationFilter())params=params.set('presentationId',this.pricePresentationFilter()!);this.http.get<Paginated<ProductPrice>>('/api/precios',{params}).subscribe({next:r=>this.prices.set(r.data),error:e=>this.fail(e)}); }
  protected openMaster(kind:MasterKind,item?:ProductCategory|ProductLine|UnitMeasure):void{this.masterKind.set(kind);this.editingMasterId.set(item?.id??null);this.masterForm.reset({name:item?.name??'',abbreviation:'abbreviation'in(item??{})?(item as UnitMeasure).abbreviation:'',decimalScale:'decimalScale'in(item??{})?(item as UnitMeasure).decimalScale:3,status:item?.status??'ACTIVO'});this.masterDialog.set(true);}
  protected saveMaster():void{if(this.masterForm.invalid)return this.masterForm.markAllAsTouched();const raw=this.masterForm.getRawValue();if(this.masterKind()==='unit'&&!raw.abbreviation.trim()){this.masterForm.controls.abbreviation.setErrors({required:true});return;}this.saving.set(true);const base=this.masterKind()==='category'?'/api/categorias':this.masterKind()==='line'?'/api/lineas-productivas':'/api/unidades';const id=this.editingMasterId();const payload:any={name:raw.name,...(this.masterKind()==='unit'?{abbreviation:raw.abbreviation,decimalScale:raw.decimalScale}:{}),...(id?{status:raw.status}:{})};(id?this.http.patch(`${base}/${id}`,payload):this.http.post(base,payload)).subscribe({next:()=>{this.saved('Registro guardado');this.masterDialog.set(false);this.loadAll();},error:e=>this.failSave(e)});}
  protected openProduct(product?:Product):void{this.editingProductId.set(product?.id??null);this.productForm.reset({code:product?.code??'',name:product?.name??'',categoryId:product?.categoryId??this.activeCategories()[0]?.id??'',productLineId:product?.productLineId??this.activeLines()[0]?.id??'',baseUnitId:product?.baseUnitId??this.activeUnits()[0]?.id??'',status:product?.status??'ACTIVO'});this.productDialog.set(true);}
  protected saveProduct():void{if(this.productForm.invalid)return this.productForm.markAllAsTouched();this.saving.set(true);const id=this.editingProductId();const raw=this.productForm.getRawValue();const payload:any={...raw};if(!id)delete payload.status;(id?this.http.patch(`/api/productos/${id}`,payload):this.http.post('/api/productos',payload)).subscribe({next:()=>{this.saved('Producto guardado');this.productDialog.set(false);this.loadAll();},error:e=>this.failSave(e)});}
  protected openPresentation(product:Product,presentation?:ProductPresentation):void{this.selectedProduct.set(product);this.editingPresentationId.set(presentation?.id??null);this.presentationForm.reset({description:presentation?.description??'',unitId:presentation?.unitId??this.activeUnits()[0]?.id??'',conversionFactor:Number(presentation?.conversionFactor??1),status:presentation?.status??'ACTIVO'});this.presentationDialog.set(true);}
  protected savePresentation():void{if(this.presentationForm.invalid||!this.selectedProduct())return this.presentationForm.markAllAsTouched();this.saving.set(true);const productId=this.selectedProduct()!.id,id=this.editingPresentationId();const payload:any={...this.presentationForm.getRawValue()};if(!id)delete payload.status;(id?this.http.patch(`/api/productos/${productId}/presentaciones/${id}`,payload):this.http.post(`/api/productos/${productId}/presentaciones`,payload)).subscribe({next:()=>{this.saved('Presentación guardada');this.presentationDialog.set(false);this.loadAll();},error:e=>this.failSave(e)});}
  protected openPrice(price?:ProductPrice):void{this.editingPriceId.set(price?.id??null);const presentationId=price?.presentationId??this.pricePresentationFilter()??this.presentationOptions()[0]?.value??'';this.priceForm.reset({presentationId,conditionKind:price?.customerType?'TIPO':'LISTA',customerType:price?.customerType??'MINORISTA',commercialList:price?.commercialList??'',amount:Number(price?.amount??0),validFrom:price?.validFrom??new Date().toISOString().slice(0,10),validUntil:price?.validUntil??'',status:price?.status??'ACTIVO'});this.priceDialog.set(true);}
  protected savePrice():void{if(this.priceForm.invalid)return this.priceForm.markAllAsTouched();const raw=this.priceForm.getRawValue();if(raw.conditionKind==='LISTA'&&!raw.commercialList.trim()){this.priceForm.controls.commercialList.setErrors({required:true});return;}this.saving.set(true);const id=this.editingPriceId();const payload:any={amount:raw.amount,validFrom:raw.validFrom,validUntil:raw.validUntil||undefined,...(raw.conditionKind==='TIPO'?{customerType:raw.customerType}:{commercialList:raw.commercialList}),...(id?{status:raw.status}:{})};(id?this.http.patch(`/api/precios/${id}`,payload):this.http.post(`/api/presentaciones/${raw.presentationId}/precios`,payload)).subscribe({next:()=>{this.saved('Precio guardado');this.priceDialog.set(false);this.loadPrices();},error:e=>this.failSave(e)});}
  private get<T>(url:string,params?:HttpParams):Promise<T>{return new Promise((resolve,reject)=>this.http.get<T>(url,{params}).subscribe({next:resolve,error:reject}));}
  private saved(detail:string):void{this.saving.set(false);this.messages.add({severity:'success',summary:'Cambios guardados',detail});}
  private fail(error:unknown):void{this.loading.set(false);this.messages.add({severity:'error',summary:'No se pudo cargar',detail:this.error(error)});}
  private failSave(error:unknown):void{this.saving.set(false);this.messages.add({severity:'error',summary:'No se pudo guardar',detail:this.error(error)});}
  private error(error:unknown):string{if(!(error instanceof HttpErrorResponse))return'Error inesperado';const message=error.error?.message;return Array.isArray(message)?message.join('. '):message||'La solicitud no pudo completarse';}
}
