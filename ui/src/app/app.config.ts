import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

import { routes } from './app.routes';
import { ApiService } from './services/api.service';
import { environment } from '../environments/environment';

// `environment.apiServiceToken` is ApiService itself for the default
// build, or StandaloneApiService for the `standalone` build config
// (see environments/environment.standalone.ts, swapped in via
// angular.json fileReplacements). Every component injects the
// `ApiService` token -- aliasing it to whichever class the active
// environment names means no component/template changes are needed
// to switch builds.
export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(),
    { provide: ApiService, useExisting: environment.apiServiceToken },
  ]
};
