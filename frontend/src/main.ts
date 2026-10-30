import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/aplicacion.config';
import { AppComponent } from './app/aplicacion.component';

bootstrapApplication(AppComponent, appConfig).catch((error: unknown) => {
  console.error(error);
});

