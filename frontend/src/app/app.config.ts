import { ApplicationConfig } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';
import { definePreset } from '@primeuix/themes';
import { authInterceptor } from './core/auth.interceptor';

const IcarPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#edf8ff',
      100: '#d7efff',
      200: '#b9e5ff',
      300: '#88d5ff',
      400: '#4dbbfa',
      500: '#087bc1',
      600: '#0065a8',
      700: '#005187',
      800: '#064570',
      900: '#093b5e',
      950: '#002640',
    },
  },
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAnimationsAsync(),
    providePrimeNG({
      ripple: true,
      theme: {
        preset: IcarPreset,
        options: {
          darkModeSelector: '.app-dark',
        },
      },
    }),
  ],
};
