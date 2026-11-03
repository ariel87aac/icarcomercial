import { effect } from '@angular/core';
import { Validators } from '@angular/forms';
import { AplicacionEstado02 } from './aplicacion.estado-02';

import { Directive } from '@angular/core';

@Directive()
export abstract class AplicacionEstado03 extends AplicacionEstado02 {
  protected readonly customerForm = this.fb.nonNullable.group({
        type: ['MINORISTA', Validators.required],
        businessName: ['', [Validators.required, Validators.minLength(2)]],
        taxId: [''],
        contactName: [''],
        phone: ['', [Validators.required, Validators.minLength(6)]],
        countryCode: ['+591', Validators.required],
        whatsapp: [''],
        email: ['', Validators.email],
        paymentCondition: ['CONTADO', Validators.required],
        creditLimit: [0, [Validators.required, Validators.min(0)]],
        creditDays: [0, [Validators.required, Validators.min(0), Validators.max(365)]],
        status: ['ACTIVO'],
      });

  protected readonly userForm = this.fb.nonNullable.group({
        name: ['', [Validators.required, Validators.minLength(3)]],
        username: ['', [Validators.required, Validators.minLength(4), Validators.maxLength(80)]],
        email: ['', Validators.email],
        phone: [''],
        countryCode: ['+591', Validators.required],
        password: ['123456', Validators.minLength(6)],
        roleIds: [[] as string[], Validators.required],
        productionAreaIds: [[] as string[]],
        status: ['ACTIVO'],
      });

  protected readonly roleForm = this.fb.nonNullable.group({
        name: ['', [Validators.required, Validators.minLength(3)]],
        description: [''],
        permissionIds: [[] as string[]],
        status: ['ACTIVO'],
      });

  protected readonly zoneForm = this.fb.nonNullable.group({
        name: ['', [Validators.required, Validators.minLength(2)]],
        description: [''],
        status: ['ACTIVO'],
      });

  protected readonly dayForm = this.fb.nonNullable.group({
        weekday: [1, Validators.required],
        startTime: ['08:00'],
        endTime: ['17:00'],
      });

  protected readonly addressForm = this.fb.nonNullable.group({
        label: ['Principal', Validators.required],
        address: ['', [Validators.required, Validators.minLength(5)]],
        reference: [''],
        zoneId: [''],
        distributionDayId: [''],
        latitude: [null as number | null],
        longitude: [null as number | null],
        isPrimary: [false],
        status: ['ACTIVO'],
      });

  protected readonly accountForm = this.fb.nonNullable.group({
        username: ['', [Validators.required, Validators.minLength(4), Validators.maxLength(80)]],
        password: ['123456', Validators.minLength(6)],
      });

  constructor() {
        super();
        effect(() => {
          const userId = this.auth.user()?.id ?? null;
          const mustChangePassword = this.auth.user()?.mustChangePassword ?? false;
          if (userId && !mustChangePassword && this.initializedUserId !== userId) {
            this.initializedUserId = userId;
            queueMicrotask(() => {
              this.loadReferenceData();
              this.loadDashboard();
            });
          }
          if (!userId) this.initializedUserId = null;
        });
      }
}
