import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

import { routes } from './app.routes';
import { ApiService } from './services/api.service';
import { environment } from '../environments/environment';

// `environment.apiServiceToken` is null for the default build (uses
// ApiService's own `providedIn: 'root'` registration, no alias), or
// StandaloneApiService for the `standalone` build config (see
// environments/environment.standalone.ts, swapped in via angular.json
// fileReplacements). Every component injects the `ApiService` token
// -- aliasing it to a *different* class when the environment names
// one means no component/template changes are needed to switch
// builds. IMPORTANT: never alias ApiService to itself here (e.g.
// `useExisting: ApiService`) -- that causes NG0200 "Circular
// dependency in DI detected," since it tells the injector "to resolve
// ApiService, resolve ApiService."
export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(),
    ...(environment.apiServiceToken ? [{ provide: ApiService, useExisting: environment.apiServiceToken }] : []),
  ]
};
